<script lang="ts">
  // NOTE: Large file by design — scene/pattern bidirectional mapping + modifier walkback + sheet triggering are tightly coupled
  import { song, ui, prefs, playback, selectPattern, lang, cellForTrack } from '../state.svelte.ts'
  import type { SceneNode, ModifierType } from '../types.ts'
  import { patternRename, patternSetColor } from '../sectionActions.ts'
  import { sceneSetRoot, sceneDeleteNode, sceneUpdateModifierParams, findConnectedSweepNode } from '../sceneActions.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import DockTrackEditor from './DockTrackEditor.svelte'
  import DockNavigator from './DockNavigator.svelte'
  import DockFxControls from './DockFxControls.svelte'
  import DockEqControls from './DockEqControls.svelte'
  import DockMasterControls from './DockMasterControls.svelte'

  import DockPoolBrowser from './DockPoolBrowser.svelte'
  import VoicePicker from './VoicePicker.svelte'

  // FX/EQ/Master overlay sheets use split layout
  const isOverlaySheet = $derived(ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master')
  // ADR 130: Pads tab + sampler voice → dock becomes pool browser
  const padsTabSampler = $derived(
    prefs.patternEditor === 'pads'
    && ui.patternSheet
    && cellForTrack(song.patterns[ui.currentPattern], ui.selectedTrack)?.voiceId === 'Sampler'
  )
  // ADR 130: Pads tab + sampler voice → dock becomes full-height pool browser
  const isSamplerSheet = $derived(padsTabSampler)

  // Sampler dock: track selector + voice picker + params/pool tab switch
  const samplerCell = $derived(padsTabSampler ? cellForTrack(song.patterns[ui.currentPattern], ui.selectedTrack) : undefined)
  let samplerDockTab: 'params' | 'pool' = $state('params')
  const samplerTracks = $derived(
    song.tracks.filter(t => {
      const c = cellForTrack(song.patterns[ui.currentPattern], t.id)
      return c?.voiceId === 'Sampler'
    })
  )

  function selectSamplerTrack(id: number) {
    ui.selectedTrack = id
  }

  // Pattern header: always shown (except during overlay sheets)
  const showPatternHeader = $derived(!isOverlaySheet)
  const showNavigator = $derived(!ui.patternSheet && !isSamplerSheet)
  const showTrackParams = $derived(ui.patternSheet && !isOverlaySheet && !isSamplerSheet)

  const selectedPattern = $derived(song.patterns[ui.currentPattern] ?? null)

  // Selected scene pattern node (for Root/Remove actions)
  const scenePatternNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'pattern') ? node : null
  })

  const MOD_TYPES: ModifierType[] = ['transpose', 'tempo', 'repeat', 'fx', 'sweep']  // sweep included for selectedModNode detection

  // Selected modifier node (for modifier node editing in scene view)
  const selectedModNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node && MOD_TYPES.includes(node.type as ModifierType)) ? node : null
  })


  // Selected generative node (for Edit/Remove actions in scene view)
  const selectedGenNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'generative' && node.generative) ? node : null
  })

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  /** Check if a repeat modifier's connected pattern has recorded sweep data */
  function repeatNodeHasSweep(repeatNodeId: string): boolean {
    const edge = song.scene.edges.find(e => e.from === repeatNodeId)
    if (!edge) return false
    const patNode = song.scene.nodes.find(n => n.id === edge.to)
    if (!patNode || patNode.type !== 'pattern') return false
    const sweep = findConnectedSweepNode(patNode.id)
    const curves = sweep?.modifierParams?.sweep?.curves
    return Array.isArray(curves) && curves.length > 0
  }

  // Find scene node for current pattern (for SCENE tab generative nodes)
  const currentPatternSceneNode = $derived.by(() => {
    if (!ui.patternSheet) return null
    const patId = selectedPattern?.id
    if (!patId) return null
    const matches = song.scene.nodes.filter(n => n.type === 'pattern' && n.patternId === patId)
    if (matches.length <= 1) return matches[0] ?? null
    const playing = matches.find(n => playback.sceneNodeId === n.id)
    if (playing) return playing
    const selected = matches.find(n => ui.selectedSceneNodes[n.id])
    return selected ?? matches[0]
  })
  // Generative nodes connected to current pattern's scene node (incoming edges)
  // Modifier nodes attached to current pattern (satellite edges, ADR 110)
  const connectedModNodes = $derived.by(() => {
    if (!currentPatternSceneNode) return []
    const inEdges = song.scene.edges.filter(e => e.to === currentPatternSceneNode.id)
    return inEdges
      .map(e => song.scene.nodes.find(n => n.id === e.from))
      .filter((n): n is SceneNode => !!n && MOD_TYPES.includes(n.type as ModifierType))
  })
  const sceneTabCount = $derived(connectedModNodes.length)

  function openPatternSheet() {
    if (!scenePatternNode?.patternId) return
    const idx = song.patterns.findIndex(p => p.id === scenePatternNode.patternId)
    if (idx < 0) return
    selectPattern(idx)
    ui.patternSheet = true
  }
</script>

<div class="dock-panel" class:split={isOverlaySheet}>
  {#if isSamplerSheet}
  <!-- ADR 130: Pattern header + track tabs + voice picker + pool browser -->
  <div class="dock-body dock-pool-full">
    <div class="param-content">
      {#if showPatternHeader && selectedPattern}
        <span class="section-label">PATTERN</span>
        <div class="pat-header">
          <span class="pat-dot" style="background: {PATTERN_COLORS[selectedPattern.color ?? 0]}"></span>
          <input
            class="pat-input"
            value={selectedPattern.name ?? ''}
            maxlength="12"
            placeholder="NAME"
            onpointerdown={e => e.stopPropagation()}
            onfocus={e => (e.target as HTMLInputElement).select()}
            onblur={e => patternRename(ui.currentPattern, (e.target as HTMLInputElement).value)}
            onkeydown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
          <div class="color-row">
            {#each PATTERN_COLORS as color, ci}
              <button
                class="color-swatch"
                class:selected={selectedPattern.color === ci}
                style="background: {color}"
                aria-label="Color {ci}"
                onpointerdown={() => patternSetColor(ui.currentPattern, ci)}
              ></button>
            {/each}
          </div>
        </div>
        <div class="section-divider" aria-hidden="true"></div>
      {/if}

      <!-- TRACKS / SCENE tabs (same as normal mode, prevents layout shift) -->
      <div class="dock-tabs" role="tablist" aria-label="Dock">
        <button
          class="dock-tab active"
          role="tab"
          aria-selected={true}
        >TRACKS</button>
        <button
          class="dock-tab"
          role="tab"
          aria-selected={false}
          onpointerdown={() => { ui.dockTab = 'scene'; ui.patternSheet = true }}
        >SCENE{#if sceneTabCount > 0}<span class="dock-tab-badge">{sceneTabCount}</span>{/if}</button>
      </div>

      <!-- Track tabs -->
      {#if samplerTracks.length > 1}
        <div class="sampler-track-tabs">
          {#each samplerTracks as t}
            {@const c = cellForTrack(song.patterns[ui.currentPattern], t.id)}
            <button
              class="sampler-track-tab"
              class:active={t.id === ui.selectedTrack}
              onpointerdown={() => selectSamplerTrack(t.id)}
            >TR{t.id + 1}: {c?.name ?? ''}</button>
          {/each}
        </div>
      {/if}

      <!-- Voice picker -->
      {#if samplerCell}
        <VoicePicker voiceId={samplerCell.voiceId} trackId={ui.selectedTrack ?? ui.selectedTrack} />
      {/if}

      <div class="section-divider" aria-hidden="true"></div>

      <!-- PARAMS / POOL tab switch -->
      <div class="sampler-dock-tabs">
        <button class="sampler-dock-tab" class:active={samplerDockTab === 'params'}
          onpointerdown={() => { samplerDockTab = 'params' }}>PARAMS</button>
        <button class="sampler-dock-tab" class:active={samplerDockTab === 'pool'}
          onpointerdown={() => { samplerDockTab = 'pool' }}>POOL</button>
      </div>
    </div>

    {#if samplerDockTab === 'params'}
      <div class="sampler-params-scroll">
        <DockTrackEditor hideVoicePicker hideSampleLoader />
      </div>
    {:else}
      <div class="pool-header">
        <span class="section-label">SAMPLE POOL</span>
      </div>
      <DockPoolBrowser trackId={ui.selectedTrack ?? ui.selectedTrack} />
    {/if}
  </div>
  {:else if isOverlaySheet}
  <!-- Split layout: scene navigator (upper) + overlay controls (lower) -->
  <div class="dock-body dock-split">
    <div class="dock-upper">
      <div class="param-content">
        {#if showNavigator}
          <DockNavigator />
        {/if}
      </div>
    </div>
    <div class="dock-lower">
      <div class="param-content">
        {#if ui.phraseView === 'fx'}
          <DockFxControls />
        {:else if ui.phraseView === 'eq'}
          <DockEqControls />
        {:else if ui.phraseView === 'master'}
          <DockMasterControls />
        {/if}
      </div>
    </div>
  </div>
  {:else}
  <!-- Normal single-scroll layout -->
  <div class="dock-body">
    <div class="param-content">
      <!-- Pattern header -->
      {#if showPatternHeader && selectedPattern}
        <span class="section-label">PATTERN</span>
        <div class="pat-header">
          <span class="pat-dot" style="background: {PATTERN_COLORS[selectedPattern.color ?? 0]}"></span>
          <input
            class="pat-input"
            value={selectedPattern.name ?? ''}
            maxlength="12"
            placeholder="NAME"
            onpointerdown={e => e.stopPropagation()}
            onfocus={e => (e.target as HTMLInputElement).select()}
            onblur={e => patternRename(ui.currentPattern, (e.target as HTMLInputElement).value)}
            onkeydown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
          <div class="color-row">
            {#each PATTERN_COLORS as color, ci}
              <button
                class="color-swatch"
                class:selected={selectedPattern.color === ci}
                style="background: {color}"
                aria-label="Color {ci}"
                onpointerdown={() => patternSetColor(ui.currentPattern, ci)}
              ></button>
            {/each}
          </div>
        </div>
        <!-- Scene node actions (when a pattern node is selected in scene view) -->
        {#if scenePatternNode}
          <div class="node-actions">
            <button class="btn-open-sheet" onpointerdown={openPatternSheet}
              data-tip="Open pattern in step sequencer" data-tip-ja="ステップシーケンサーで開く"
            >Edit</button>
            {#if !scenePatternNode.root}
              <button class="btn-set-root" onpointerdown={() => sceneSetRoot(scenePatternNode.id)}
                data-tip="Set as scene root" data-tip-ja="ルートノードに設定"
              >★ Root</button>
              <button class="btn-delete-node" onpointerdown={() => { sceneDeleteNode(scenePatternNode.id); ui.selectedSceneNodes = {} }}
                data-tip="Remove from scene" data-tip-ja="シーンから削除"
              >✕ Remove</button>
            {/if}
          </div>
        {/if}
        <div class="section-divider" aria-hidden="true"></div>
      {/if}

      <!-- Modifier node editor (ADR 110) -->
      {#if selectedModNode}
        <span class="section-label">
          {selectedModNode.type === 'transpose' ? 'TRANSPOSE' : selectedModNode.type === 'repeat' ? 'REPEAT' : selectedModNode.type === 'tempo' ? 'TEMPO' : selectedModNode.type === 'sweep' ? 'SWEEP' : 'FX'}
        </span>
        <div class="mod-editor">
          {#if selectedModNode.modifierParams?.transpose}
            {@const tp = selectedModNode.modifierParams.transpose}
            <div class="mod-row">
              <span class="mod-label">{lang.value === 'ja' ? 'モード' : 'Mode'}</span>
              <div class="mod-toggle">
                <button class="mod-toggle-btn" class:active={tp.mode === 'rel'}
                  onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { transpose: { ...tp, mode: 'rel' } })}
                >REL</button>
                <button class="mod-toggle-btn" class:active={tp.mode === 'abs'}
                  onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { transpose: { ...tp, mode: 'abs' } })}
                >ABS</button>
              </div>
            </div>
            {#if tp.mode === 'rel'}
              <div class="mod-row">
                <span class="mod-label">{lang.value === 'ja' ? '半音' : 'Semitones'}</span>
                <div class="mod-stepper">
                  <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { transpose: { ...tp, semitones: tp.semitones - 1 } })}>−</button>
                  <span class="mod-step-val">{tp.semitones >= 0 ? '+' : ''}{tp.semitones}</span>
                  <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { transpose: { ...tp, semitones: tp.semitones + 1 } })}>+</button>
                </div>
              </div>
            {:else}
              <div class="mod-row">
                <span class="mod-label">Key</span>
                <div class="mod-key-row">
                  {#each NOTE_NAMES as name, i}
                    <button class="mod-key-btn" class:active={(tp.key ?? 0) === i}
                      onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { transpose: { ...tp, key: i } })}
                    >{name}</button>
                  {/each}
                </div>
              </div>
            {/if}
          {:else if selectedModNode.modifierParams?.repeat}
            {@const rp = selectedModNode.modifierParams.repeat}
            <div class="mod-row">
              <span class="mod-label">{lang.value === 'ja' ? '回数' : 'Count'}</span>
              <div class="mod-stepper">
                <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { repeat: { count: Math.max(1, rp.count - 1) } })}>−</button>
                <span class="mod-step-val">×{rp.count}</span>
                <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { repeat: { count: rp.count + 1 } })}>+</button>
              </div>
            </div>
            {#if repeatNodeHasSweep(selectedModNode.id)}
              <div class="mod-sweep-warn"
                data-tip="Sweep curves were recorded with a different repeat count — re-record to match"
                data-tip-ja="スイープカーブは別のリピート回数で録音されています — 再録音してください"
              >{lang.value === 'ja' ? '⚠ スイープ再録音が必要な場合があります' : '⚠ Sweep may need re-recording'}</div>
            {/if}
          {:else if selectedModNode.modifierParams?.tempo}
            {@const tmp = selectedModNode.modifierParams.tempo}
            <div class="mod-row">
              <span class="mod-label">BPM</span>
              <div class="mod-stepper">
                <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { tempo: { bpm: Math.max(20, tmp.bpm - 1) } })}>−</button>
                <span class="mod-step-val">{tmp.bpm}</span>
                <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { tempo: { bpm: Math.min(300, tmp.bpm + 1) } })}>+</button>
              </div>
            </div>
          {:else if selectedModNode.modifierParams?.fx}
            {@const fxp = selectedModNode.modifierParams.fx}
            <div class="mod-row">
              <span class="mod-label">Verb</span>
              <button class="mod-toggle-btn wide" class:active={fxp.verb}
                onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { fx: { ...fxp, verb: !fxp.verb } })}
              >{fxp.verb ? 'ON' : 'OFF'}</button>
            </div>
            <div class="mod-row">
              <span class="mod-label">Delay</span>
              <button class="mod-toggle-btn wide" class:active={fxp.delay}
                onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { fx: { ...fxp, delay: !fxp.delay } })}
              >{fxp.delay ? 'ON' : 'OFF'}</button>
            </div>
            <div class="mod-row">
              <span class="mod-label">Glitch</span>
              <button class="mod-toggle-btn wide" class:active={fxp.glitch}
                onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { fx: { ...fxp, glitch: !fxp.glitch } })}
              >{fxp.glitch ? 'ON' : 'OFF'}</button>
            </div>
            <div class="mod-row">
              <span class="mod-label">Granular</span>
              <button class="mod-toggle-btn wide" class:active={fxp.granular}
                onpointerdown={() => sceneUpdateModifierParams(selectedModNode.id, { fx: { ...fxp, granular: !fxp.granular } })}
              >{fxp.granular ? 'ON' : 'OFF'}</button>
            </div>
          {/if}
        </div>
        <div class="node-actions">
          {#if selectedModNode.modifierParams?.sweep}
            <button class="btn-action-node" onpointerdown={() => {
              const edge = song.scene.edges.find(e => e.from === selectedModNode.id)
              const targetNode = edge ? song.scene.nodes.find(n => n.id === edge.to) : null
              if (targetNode?.type === 'pattern' && targetNode.patternId) {
                const pi = song.patterns.findIndex(p => p.id === targetNode.patternId)
                if (pi >= 0) selectPattern(pi)
                ui.sweepTab = true
                ui.patternSheet = true
              }
            }}
              data-tip="Edit sweep curves" data-tip-ja="スウィープカーブを編集"
            >Edit</button>
          {/if}
          <button class="btn-delete-node" onpointerdown={() => { sceneDeleteNode(selectedModNode.id); ui.selectedSceneNodes = {} }}
            data-tip="Remove node" data-tip-ja="ノードを削除"
          >✕ Remove</button>
        </div>
        <div class="section-divider" aria-hidden="true"></div>
      {/if}

      <!-- Generative node actions (when selected in scene view) -->
      {#if selectedGenNode}
        <span class="section-label">{selectedGenNode.generative!.engine.toUpperCase()}</span>
        <div class="node-actions">
          <button class="btn-action-node" onpointerdown={() => {
            const eng = selectedGenNode.generative!.engine
            if (eng === 'tonnetz') { ui.tonnetzNodeId = selectedGenNode.id; ui.phraseView = 'tonnetz' }
            else if (eng === 'quantizer') { ui.quantizerNodeId = selectedGenNode.id; ui.phraseView = 'quantizer' }
            else if (eng === 'turing') { ui.turingNodeId = selectedGenNode.id; ui.phraseView = 'turing' }
          }}
            data-tip="Open editor" data-tip-ja="エディタを開く"
          >Edit</button>
          <button class="btn-delete-node" onpointerdown={() => {
            // Close sheet if this node's editor is open
            if (ui.tonnetzNodeId === selectedGenNode.id) { ui.tonnetzNodeId = null; ui.phraseView = 'pattern' }
            if (ui.quantizerNodeId === selectedGenNode.id) { ui.quantizerNodeId = null; ui.phraseView = 'pattern' }
            if (ui.turingNodeId === selectedGenNode.id) { ui.turingNodeId = null; ui.phraseView = 'pattern' }
            sceneDeleteNode(selectedGenNode.id); ui.selectedSceneNodes = {}
          }}
            data-tip="Remove node" data-tip-ja="ノードを削除"
          >✕ Remove</button>
        </div>
        <div class="section-divider" aria-hidden="true"></div>
      {/if}

      <!-- Scene Navigator -->
      {#if showNavigator}
        <DockNavigator />
      {/if}

      {#if showTrackParams}
        <!-- Tab bar (ADR 092) -->
        <div class="dock-tabs" role="tablist" aria-label="Dock">
          <button
            class="dock-tab"
            role="tab"
            aria-selected={ui.dockTab === 'tracks'}
            class:active={ui.dockTab === 'tracks'}
            onpointerdown={() => ui.dockTab = 'tracks'}
          >TRACKS</button>
          <button
            class="dock-tab"
            role="tab"
            aria-selected={ui.dockTab === 'scene'}
            class:active={ui.dockTab === 'scene'}
            onpointerdown={() => ui.dockTab = 'scene'}
          >SCENE{#if sceneTabCount > 0}<span class="dock-tab-badge">{sceneTabCount}</span>{/if}</button>
        </div>

        {#if ui.dockTab === 'tracks'}
          <DockTrackEditor />
        {:else if ui.dockTab === 'scene'}
          {#if connectedModNodes.length > 0}
            {#each connectedModNodes as modNode}
              <div class="section-divider" aria-hidden="true"></div>
              <span class="section-label">
                {modNode.type === 'transpose' ? 'TRANSPOSE' : modNode.type === 'repeat' ? 'REPEAT' : modNode.type === 'tempo' ? 'TEMPO' : 'FX'}
              </span>
              <div class="mod-editor">
                {#if modNode.modifierParams?.transpose}
                  {@const tp = modNode.modifierParams.transpose}
                  <div class="mod-row">
                    <span class="mod-label">{lang.value === 'ja' ? 'モード' : 'Mode'}</span>
                    <div class="mod-toggle">
                      <button class="mod-toggle-btn" class:active={tp.mode === 'rel'}
                        onpointerdown={() => sceneUpdateModifierParams(modNode.id, { transpose: { ...tp, mode: 'rel' } })}
                      >REL</button>
                      <button class="mod-toggle-btn" class:active={tp.mode === 'abs'}
                        onpointerdown={() => sceneUpdateModifierParams(modNode.id, { transpose: { ...tp, mode: 'abs' } })}
                      >ABS</button>
                    </div>
                  </div>
                  {#if tp.mode === 'rel'}
                    <div class="mod-row">
                      <span class="mod-label">{lang.value === 'ja' ? '半音' : 'Semitones'}</span>
                      <div class="mod-stepper">
                        <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(modNode.id, { transpose: { ...tp, semitones: tp.semitones - 1 } })}>−</button>
                        <span class="mod-step-val">{tp.semitones >= 0 ? '+' : ''}{tp.semitones}</span>
                        <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(modNode.id, { transpose: { ...tp, semitones: tp.semitones + 1 } })}>+</button>
                      </div>
                    </div>
                  {:else}
                    <div class="mod-row">
                      <span class="mod-label">Key</span>
                      <div class="mod-key-row">
                        {#each NOTE_NAMES as name, i}
                          <button class="mod-key-btn" class:active={(tp.key ?? 0) === i}
                            onpointerdown={() => sceneUpdateModifierParams(modNode.id, { transpose: { ...tp, key: i } })}
                          >{name}</button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {:else if modNode.modifierParams?.repeat}
                  {@const rp = modNode.modifierParams.repeat}
                  <div class="mod-row">
                    <span class="mod-label">{lang.value === 'ja' ? '回数' : 'Count'}</span>
                    <div class="mod-stepper">
                      <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(modNode.id, { repeat: { count: Math.max(1, rp.count - 1) } })}>−</button>
                      <span class="mod-step-val">×{rp.count}</span>
                      <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(modNode.id, { repeat: { count: rp.count + 1 } })}>+</button>
                    </div>
                  </div>
                  {#if repeatNodeHasSweep(modNode.id)}
                    <div class="mod-sweep-warn"
                      data-tip="Sweep curves were recorded with a different repeat count — re-record to match"
                      data-tip-ja="スイープカーブは別のリピート回数で録音されています — 再録音してください"
                    >{lang.value === 'ja' ? '⚠ スイープ再録音が必要な場合があります' : '⚠ Sweep may need re-recording'}</div>
                  {/if}
                {:else if modNode.modifierParams?.tempo}
                  {@const tmp = modNode.modifierParams.tempo}
                  <div class="mod-row">
                    <span class="mod-label">BPM</span>
                    <div class="mod-stepper">
                      <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(modNode.id, { tempo: { bpm: Math.max(20, tmp.bpm - 1) } })}>−</button>
                      <span class="mod-step-val">{tmp.bpm}</span>
                      <button class="mod-step-btn" onpointerdown={() => sceneUpdateModifierParams(modNode.id, { tempo: { bpm: Math.min(300, tmp.bpm + 1) } })}>+</button>
                    </div>
                  </div>
                {:else if modNode.modifierParams?.fx}
                  {@const fxp = modNode.modifierParams.fx}
                  <div class="mod-row">
                    <span class="mod-label">Verb</span>
                    <button class="mod-toggle-btn wide" class:active={fxp.verb}
                      onpointerdown={() => sceneUpdateModifierParams(modNode.id, { fx: { ...fxp, verb: !fxp.verb } })}
                    >{fxp.verb ? 'ON' : 'OFF'}</button>
                  </div>
                  <div class="mod-row">
                    <span class="mod-label">Delay</span>
                    <button class="mod-toggle-btn wide" class:active={fxp.delay}
                      onpointerdown={() => sceneUpdateModifierParams(modNode.id, { fx: { ...fxp, delay: !fxp.delay } })}
                    >{fxp.delay ? 'ON' : 'OFF'}</button>
                  </div>
                  <div class="mod-row">
                    <span class="mod-label">Glitch</span>
                    <button class="mod-toggle-btn wide" class:active={fxp.glitch}
                      onpointerdown={() => sceneUpdateModifierParams(modNode.id, { fx: { ...fxp, glitch: !fxp.glitch } })}
                    >{fxp.glitch ? 'ON' : 'OFF'}</button>
                  </div>
                  <div class="mod-row">
                    <span class="mod-label">Granular</span>
                    <button class="mod-toggle-btn wide" class:active={fxp.granular}
                      onpointerdown={() => sceneUpdateModifierParams(modNode.id, { fx: { ...fxp, granular: !fxp.granular } })}
                    >{fxp.granular ? 'ON' : 'OFF'}</button>
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
          {#if connectedModNodes.length === 0}
            <div class="empty-hint">{lang.value === 'ja' ? 'ノード未接続' : 'No nodes connected'}</div>
          {/if}
        {/if}
      {/if}
    </div>
  </div>
  {/if}
</div>

<style>
  .dock-panel {
    position: relative;
    width: 340px;
    flex-shrink: 0;
    background: var(--color-fg);
    color: var(--color-bg);
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--dz-bg-hover);
    overflow: hidden;
  }

  /* ── Body ── */
  .dock-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .dock-body.dock-split {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .dock-upper {
    flex: 1 1 50%;
    min-height: 80px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-bottom: 1px solid var(--dz-border);
  }
  .dock-lower {
    flex: 1 1 50%;
    min-height: 80px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* ── Dock Tabs (ADR 092) ── */
  .dock-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 8px;
    border: 1px solid var(--dz-border);
    border-radius: 0;
    overflow: hidden;
  }
  .dock-tab {
    flex: 1;
    font-family: var(--font-data, inherit);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 6px 0;
    border: none;
    background: transparent;
    color: var(--dz-text-dim);
    cursor: pointer;
    transition: background 60ms, color 60ms;
    position: relative;
  }
  .dock-tab:not(:last-child) {
    border-right: 1px solid var(--dz-border);
  }
  .dock-tab:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-mid);
  }
  .dock-tab.active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
  }
  .dock-tab-badge {
    font-size: var(--fs-sm);
    font-weight: 700;
    vertical-align: super;
    margin-left: 1px;
    color: var(--color-olive);
  }
  .empty-hint {
    font-size: var(--fs-lg);
    color: var(--dz-text-dim);
    padding: 12px 0;
    font-style: italic;
  }

  /* ── Content ── */
  .param-content {
    padding: 12px 16px;
  }
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dz-bg-active);
    margin: 8px 0;
  }
  .section-label {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dz-text-dim);
    padding-bottom: 4px;
  }

  /* ── Pattern header ── */
  .pat-header {
    display: flex;
    align-items: center;
    margin-bottom: 6px;
    gap: 8px;
  }
  .pat-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .pat-input {
    font-size: var(--fs-base);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dz-text-strong);
    background: var(--dz-divider);
    border: 1px solid var(--dz-border);
    border-bottom: 1px solid var(--dz-border-strong);
    outline: none;
    padding: 4px 8px;
    flex: 1;
    min-width: 0;
    text-transform: uppercase;
    transition: border-color 60ms;
  }
  .pat-input::placeholder {
    color: var(--dz-text-dim);
    font-style: italic;
  }
  .pat-input:focus {
    border-color: var(--dz-border-strong);
    background: var(--dz-bg-hover);
  }
  .color-row {
    display: flex;
    gap: 3px;
  }
  .color-swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: opacity 60ms, transform 60ms;
    opacity: 0.5;
  }
  .color-swatch:hover {
    opacity: 0.8;
    transform: scale(1.15);
  }
  .color-swatch.selected {
    opacity: 1;
    border-color: var(--dz-text-strong);
    transform: scale(1.2);
  }

  /* ── Node actions ── */
  .node-actions {
    display: flex;
    gap: 6px;
    margin: 8px 0 10px;
  }
  .btn-open-sheet {
    flex: 1;
    border: 1px solid var(--dz-border-strong);
    background: transparent;
    color: var(--dz-text-mid);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 8px 0;
    cursor: pointer;
    transition: color 60ms, background 60ms;
  }
  .btn-open-sheet:hover {
    color: var(--dz-text-strong);
    background: var(--dz-bg-hover);
  }
  .btn-set-root {
    border: 1px solid var(--dz-border-strong);
    background: transparent;
    color: var(--dz-text-mid);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 8px 12px;
    cursor: pointer;
    transition: color 60ms, background 60ms;
    white-space: nowrap;
  }
  .btn-set-root:hover {
    color: var(--dz-text-strong);
    background: var(--dz-bg-hover);
  }
  .btn-action-node {
    flex: 1;
    border: 1px solid var(--dz-border-strong);
    background: transparent;
    color: var(--dz-text-mid);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 8px 0;
    cursor: pointer;
    transition: color 60ms, background 60ms;
    white-space: nowrap;
  }
  .btn-action-node:hover {
    color: var(--dz-text-strong);
    background: var(--dz-bg-hover);
  }
  .btn-delete-node {
    border: 1px solid var(--dz-border-strong);
    background: transparent;
    color: var(--dz-text-mid);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 8px 12px;
    cursor: pointer;
    transition: color 60ms, background 60ms;
    white-space: nowrap;
  }
  .btn-delete-node:hover {
    color: var(--color-danger);
    background: var(--dz-bg-hover);
  }

  /* ── Modifier node editor (ADR 110) ── */
  .mod-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 0;
  }
  .mod-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mod-label {
    font-size: var(--fs-lg);
    font-weight: 700;
    color: var(--dz-text-mid);
    min-width: 64px;
  }
  .mod-toggle {
    display: flex;
    gap: 0;
    border: 1px solid var(--dz-border);
    border-radius: 0;
    overflow: hidden;
  }
  .mod-toggle-btn {
    font-family: var(--font-data);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 4px 10px;
    border: none;
    background: transparent;
    color: var(--dz-text-dim);
    cursor: pointer;
    transition: background 60ms, color 60ms;
  }
  .mod-toggle-btn:not(:last-child) {
    border-right: 1px solid var(--dz-border);
  }
  .mod-toggle-btn:hover {
    background: var(--dz-bg-hover);
  }
  .mod-toggle-btn.active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
  }
  .mod-toggle-btn.wide {
    border: 1px solid var(--dz-border);
    min-width: 48px;
  }
  .mod-stepper {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--dz-border);
    border-radius: 0;
    overflow: hidden;
  }
  .mod-step-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--dz-text-mid);
    font-size: 14px; /* display: section header icon */
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 60ms;
  }
  .mod-step-btn:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-strong);
  }
  .mod-step-btn:active {
    background: var(--dz-bg-active);
  }
  .mod-step-val {
    font-family: var(--font-data);
    font-size: var(--fs-base);
    font-weight: 700;
    color: var(--dz-text-strong);
    min-width: 40px;
    text-align: center;
    border-left: 1px solid var(--dz-border);
    border-right: 1px solid var(--dz-border);
    padding: 4px 0;
  }
  .mod-sweep-warn {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    color: var(--color-salmon);
    padding: 2px 0;
    opacity: 0.85;
  }
  .mod-key-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .mod-key-btn {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    padding: 4px 4px;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-text-dim);
    cursor: pointer;
    transition: background 60ms, color 60ms;
  }
  .mod-key-btn:hover {
    background: var(--dz-bg-hover);
  }
  .mod-key-btn.active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
    border-color: var(--dz-border-strong);
  }

  /* ADR 130: Full-height pool browser when sampler sheet is open */
  .dock-pool-full {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .pool-header {
    padding: 4px 16px;
    flex-shrink: 0;
  }

  .sampler-dock-tabs {
    display: flex;
    gap: 2px;
  }
  .sampler-dock-tab {
    flex: 1;
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 4px 0;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-text-mid);
    cursor: pointer;
    transition: color 80ms, border-color 80ms, background 80ms;
  }
  .sampler-dock-tab.active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
    border-color: var(--dz-border-strong);
  }

  .sampler-params-scroll {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding: 0 16px;
  }

  .sampler-track-tabs {
    display: flex;
    gap: 2px;
    padding-bottom: 4px;
  }

  .sampler-track-tab {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-text-mid);
    cursor: pointer;
    opacity: 0.5;
  }

  .sampler-track-tab.active {
    background: var(--dz-bg-hover);
    opacity: 1;
  }
  .dock-pool-full :global(.pool-inline) {
    flex: 1;
    display: flex;
    flex-direction: column;
    border: none;
    min-height: 0;
    padding: 0 8px;
  }
  .dock-pool-full :global(.pool-list) {
    max-height: none;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding-bottom: 16px;
  }
</style>
