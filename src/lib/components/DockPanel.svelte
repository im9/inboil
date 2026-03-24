<script lang="ts">
  import { song, ui, playback, selectPattern, lang } from '../state.svelte.ts'
  import type { SceneNode, FnNodeType } from '../types.ts'
  import { patternRename, patternSetColor } from '../sectionActions.ts'
  import { sceneSetRoot, sceneDeleteNode, sceneUpdateFnParams } from '../sceneActions.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import DockGenerativeEditor from './DockGenerativeEditor.svelte'
  import DockTrackEditor from './DockTrackEditor.svelte'
  import DockNavigator from './DockNavigator.svelte'
  import DockFxControls from './DockFxControls.svelte'
  import DockEqControls from './DockEqControls.svelte'
  import DockMasterControls from './DockMasterControls.svelte'

  // FX/EQ/Master overlay sheets use split layout
  const isOverlaySheet = $derived(ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master')

  // Pattern header: always shown (except during overlay sheets)
  const showPatternHeader = $derived(!isOverlaySheet)
  const showNavigator = $derived(!ui.patternSheet)
  const showTrackParams = $derived(ui.patternSheet && !isOverlaySheet)

  const selectedPattern = $derived(song.patterns[ui.currentPattern] ?? null)

  // Selected scene pattern node (for Root/Remove actions)
  const scenePatternNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'pattern') ? node : null
  })

  const FN_TYPES: FnNodeType[] = ['transpose', 'tempo', 'repeat', 'fx', 'sweep']  // sweep included for selectedFnNode detection

  // Selected function node (for fn node editing in scene view)
  const selectedFnNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node && FN_TYPES.includes(node.type as FnNodeType)) ? node : null
  })

  // Selected generative node (for generative node display in scene view)
  const selectedGenNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'generative' && node.generative) ? node : null
  })

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

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
  const connectedGenerativeNodes = $derived.by(() => {
    if (!currentPatternSceneNode) return []
    const inEdges = song.scene.edges.filter(e => e.to === currentPatternSceneNode.id)
    return inEdges
      .map(e => song.scene.nodes.find(n => n.id === e.from))
      .filter((n): n is SceneNode => n?.type === 'generative' && !!n.generative)
  })
  // Fn nodes attached to current pattern (satellite edges, ADR 110)
  const connectedFnNodes = $derived.by(() => {
    if (!currentPatternSceneNode) return []
    const inEdges = song.scene.edges.filter(e => e.to === currentPatternSceneNode.id)
    return inEdges
      .map(e => song.scene.nodes.find(n => n.id === e.from))
      .filter((n): n is SceneNode => !!n && FN_TYPES.includes(n.type as FnNodeType))
  })
  const sceneTabCount = $derived(connectedGenerativeNodes.length + connectedFnNodes.length)

  function openPatternSheet() {
    if (!scenePatternNode?.patternId) return
    const idx = song.patterns.findIndex(p => p.id === scenePatternNode.patternId)
    if (idx < 0) return
    selectPattern(idx)
    ui.patternSheet = true
  }
</script>

<div class="dock-panel" class:split={isOverlaySheet}>
  {#if isOverlaySheet}
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
            maxlength="8"
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

      <!-- Function node editor (ADR 110) -->
      {#if selectedFnNode}
        <span class="section-label">
          {selectedFnNode.type === 'transpose' ? 'TRANSPOSE' : selectedFnNode.type === 'repeat' ? 'REPEAT' : selectedFnNode.type === 'tempo' ? 'TEMPO' : selectedFnNode.type === 'sweep' ? 'SWEEP' : 'FX'}
        </span>
        <div class="fn-editor">
          {#if selectedFnNode.fnParams?.transpose}
            {@const tp = selectedFnNode.fnParams.transpose}
            <div class="fn-row">
              <span class="fn-label">{lang.value === 'ja' ? 'モード' : 'Mode'}</span>
              <div class="fn-toggle">
                <button class="fn-toggle-btn" class:active={tp.mode === 'rel'}
                  onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { transpose: { ...tp, mode: 'rel' } })}
                >REL</button>
                <button class="fn-toggle-btn" class:active={tp.mode === 'abs'}
                  onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { transpose: { ...tp, mode: 'abs' } })}
                >ABS</button>
              </div>
            </div>
            {#if tp.mode === 'rel'}
              <div class="fn-row">
                <span class="fn-label">{lang.value === 'ja' ? '半音' : 'Semitones'}</span>
                <div class="fn-stepper">
                  <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { transpose: { ...tp, semitones: tp.semitones - 1 } })}>−</button>
                  <span class="fn-step-val">{tp.semitones >= 0 ? '+' : ''}{tp.semitones}</span>
                  <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { transpose: { ...tp, semitones: tp.semitones + 1 } })}>+</button>
                </div>
              </div>
            {:else}
              <div class="fn-row">
                <span class="fn-label">Key</span>
                <div class="fn-key-row">
                  {#each NOTE_NAMES as name, i}
                    <button class="fn-key-btn" class:active={(tp.key ?? 0) === i}
                      onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { transpose: { ...tp, key: i } })}
                    >{name}</button>
                  {/each}
                </div>
              </div>
            {/if}
          {:else if selectedFnNode.fnParams?.repeat}
            {@const rp = selectedFnNode.fnParams.repeat}
            <div class="fn-row">
              <span class="fn-label">{lang.value === 'ja' ? '回数' : 'Count'}</span>
              <div class="fn-stepper">
                <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { repeat: { count: Math.max(1, rp.count - 1) } })}>−</button>
                <span class="fn-step-val">×{rp.count}</span>
                <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { repeat: { count: rp.count + 1 } })}>+</button>
              </div>
            </div>
          {:else if selectedFnNode.fnParams?.tempo}
            {@const tmp = selectedFnNode.fnParams.tempo}
            <div class="fn-row">
              <span class="fn-label">BPM</span>
              <div class="fn-stepper">
                <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { tempo: { bpm: Math.max(20, tmp.bpm - 1) } })}>−</button>
                <span class="fn-step-val">{tmp.bpm}</span>
                <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { tempo: { bpm: Math.min(300, tmp.bpm + 1) } })}>+</button>
              </div>
            </div>
          {:else if selectedFnNode.fnParams?.fx}
            {@const fxp = selectedFnNode.fnParams.fx}
            <div class="fn-row">
              <span class="fn-label">Verb</span>
              <button class="fn-toggle-btn wide" class:active={fxp.verb}
                onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { fx: { ...fxp, verb: !fxp.verb } })}
              >{fxp.verb ? 'ON' : 'OFF'}</button>
            </div>
            <div class="fn-row">
              <span class="fn-label">Delay</span>
              <button class="fn-toggle-btn wide" class:active={fxp.delay}
                onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { fx: { ...fxp, delay: !fxp.delay } })}
              >{fxp.delay ? 'ON' : 'OFF'}</button>
            </div>
            <div class="fn-row">
              <span class="fn-label">Glitch</span>
              <button class="fn-toggle-btn wide" class:active={fxp.glitch}
                onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { fx: { ...fxp, glitch: !fxp.glitch } })}
              >{fxp.glitch ? 'ON' : 'OFF'}</button>
            </div>
            <div class="fn-row">
              <span class="fn-label">Granular</span>
              <button class="fn-toggle-btn wide" class:active={fxp.granular}
                onpointerdown={() => sceneUpdateFnParams(selectedFnNode.id, { fx: { ...fxp, granular: !fxp.granular } })}
              >{fxp.granular ? 'ON' : 'OFF'}</button>
            </div>
          {:else if selectedFnNode.fnParams?.sweep}
            {@const swp = selectedFnNode.fnParams.sweep}
            <div class="fn-row">
              <span class="fn-label">Curves</span>
              <span class="fn-step-val">{swp.curves.length}</span>
            </div>
          {/if}
        </div>
        <div class="node-actions">
          {#if selectedFnNode.fnParams?.sweep}
            <button class="btn-action-node" onpointerdown={() => {
              const edge = song.scene.edges.find(e => e.from === selectedFnNode.id)
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
          <button class="btn-delete-node" onpointerdown={() => { sceneDeleteNode(selectedFnNode.id); ui.selectedSceneNodes = {} }}
            data-tip="Remove node" data-tip-ja="ノードを削除"
          >✕ Remove</button>
        </div>
        <div class="section-divider" aria-hidden="true"></div>
      {/if}

      <!-- Generative node editor (when selected in scene view) -->
      {#if selectedGenNode}
        <DockGenerativeEditor node={selectedGenNode} />
        <div class="node-actions">
          <button class="btn-delete-node" onpointerdown={() => { sceneDeleteNode(selectedGenNode.id); ui.selectedSceneNodes = {} }}
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
          {#if connectedGenerativeNodes.length > 0}
            {#each connectedGenerativeNodes as genNode}
              <DockGenerativeEditor node={genNode} />
            {/each}
          {/if}
          {#if connectedFnNodes.length > 0}
            {#each connectedFnNodes as fnNode}
              <div class="section-divider" aria-hidden="true"></div>
              <span class="section-label">
                {fnNode.type === 'transpose' ? 'TRANSPOSE' : fnNode.type === 'repeat' ? 'REPEAT' : fnNode.type === 'tempo' ? 'TEMPO' : 'FX'}
              </span>
              <div class="fn-editor">
                {#if fnNode.fnParams?.transpose}
                  {@const tp = fnNode.fnParams.transpose}
                  <div class="fn-row">
                    <span class="fn-label">{lang.value === 'ja' ? 'モード' : 'Mode'}</span>
                    <div class="fn-toggle">
                      <button class="fn-toggle-btn" class:active={tp.mode === 'rel'}
                        onpointerdown={() => sceneUpdateFnParams(fnNode.id, { transpose: { ...tp, mode: 'rel' } })}
                      >REL</button>
                      <button class="fn-toggle-btn" class:active={tp.mode === 'abs'}
                        onpointerdown={() => sceneUpdateFnParams(fnNode.id, { transpose: { ...tp, mode: 'abs' } })}
                      >ABS</button>
                    </div>
                  </div>
                  {#if tp.mode === 'rel'}
                    <div class="fn-row">
                      <span class="fn-label">{lang.value === 'ja' ? '半音' : 'Semitones'}</span>
                      <div class="fn-stepper">
                        <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(fnNode.id, { transpose: { ...tp, semitones: tp.semitones - 1 } })}>−</button>
                        <span class="fn-step-val">{tp.semitones >= 0 ? '+' : ''}{tp.semitones}</span>
                        <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(fnNode.id, { transpose: { ...tp, semitones: tp.semitones + 1 } })}>+</button>
                      </div>
                    </div>
                  {:else}
                    <div class="fn-row">
                      <span class="fn-label">Key</span>
                      <div class="fn-key-row">
                        {#each NOTE_NAMES as name, i}
                          <button class="fn-key-btn" class:active={(tp.key ?? 0) === i}
                            onpointerdown={() => sceneUpdateFnParams(fnNode.id, { transpose: { ...tp, key: i } })}
                          >{name}</button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {:else if fnNode.fnParams?.repeat}
                  {@const rp = fnNode.fnParams.repeat}
                  <div class="fn-row">
                    <span class="fn-label">{lang.value === 'ja' ? '回数' : 'Count'}</span>
                    <div class="fn-stepper">
                      <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(fnNode.id, { repeat: { count: Math.max(1, rp.count - 1) } })}>−</button>
                      <span class="fn-step-val">×{rp.count}</span>
                      <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(fnNode.id, { repeat: { count: rp.count + 1 } })}>+</button>
                    </div>
                  </div>
                {:else if fnNode.fnParams?.tempo}
                  {@const tmp = fnNode.fnParams.tempo}
                  <div class="fn-row">
                    <span class="fn-label">BPM</span>
                    <div class="fn-stepper">
                      <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(fnNode.id, { tempo: { bpm: Math.max(20, tmp.bpm - 1) } })}>−</button>
                      <span class="fn-step-val">{tmp.bpm}</span>
                      <button class="fn-step-btn" onpointerdown={() => sceneUpdateFnParams(fnNode.id, { tempo: { bpm: Math.min(300, tmp.bpm + 1) } })}>+</button>
                    </div>
                  </div>
                {:else if fnNode.fnParams?.fx}
                  {@const fxp = fnNode.fnParams.fx}
                  <div class="fn-row">
                    <span class="fn-label">Verb</span>
                    <button class="fn-toggle-btn wide" class:active={fxp.verb}
                      onpointerdown={() => sceneUpdateFnParams(fnNode.id, { fx: { ...fxp, verb: !fxp.verb } })}
                    >{fxp.verb ? 'ON' : 'OFF'}</button>
                  </div>
                  <div class="fn-row">
                    <span class="fn-label">Delay</span>
                    <button class="fn-toggle-btn wide" class:active={fxp.delay}
                      onpointerdown={() => sceneUpdateFnParams(fnNode.id, { fx: { ...fxp, delay: !fxp.delay } })}
                    >{fxp.delay ? 'ON' : 'OFF'}</button>
                  </div>
                  <div class="fn-row">
                    <span class="fn-label">Glitch</span>
                    <button class="fn-toggle-btn wide" class:active={fxp.glitch}
                      onpointerdown={() => sceneUpdateFnParams(fnNode.id, { fx: { ...fxp, glitch: !fxp.glitch } })}
                    >{fxp.glitch ? 'ON' : 'OFF'}</button>
                  </div>
                  <div class="fn-row">
                    <span class="fn-label">Granular</span>
                    <button class="fn-toggle-btn wide" class:active={fxp.granular}
                      onpointerdown={() => sceneUpdateFnParams(fnNode.id, { fx: { ...fxp, granular: !fxp.granular } })}
                    >{fxp.granular ? 'ON' : 'OFF'}</button>
                  </div>
                {:else if fnNode.fnParams?.sweep}
                  <div class="fn-row">
                    <span class="fn-label">Curves</span>
                    <span class="fn-step-val">{fnNode.fnParams.sweep.curves.length}</span>
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
          {#if connectedGenerativeNodes.length === 0 && connectedFnNodes.length === 0}
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

  /* ── Fn node editor (ADR 110) ── */
  .fn-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 0;
  }
  .fn-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fn-label {
    font-size: var(--fs-lg);
    font-weight: 700;
    color: var(--dz-text-mid);
    min-width: 64px;
  }
  .fn-toggle {
    display: flex;
    gap: 0;
    border: 1px solid var(--dz-border);
    border-radius: 0;
    overflow: hidden;
  }
  .fn-toggle-btn {
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
  .fn-toggle-btn:not(:last-child) {
    border-right: 1px solid var(--dz-border);
  }
  .fn-toggle-btn:hover {
    background: var(--dz-bg-hover);
  }
  .fn-toggle-btn.active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
  }
  .fn-toggle-btn.wide {
    border: 1px solid var(--dz-border);
    min-width: 48px;
  }
  .fn-stepper {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--dz-border);
    border-radius: 0;
    overflow: hidden;
  }
  .fn-step-btn {
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
  .fn-step-btn:hover {
    background: var(--dz-bg-hover);
    color: var(--dz-text-strong);
  }
  .fn-step-btn:active {
    background: var(--dz-bg-active);
  }
  .fn-step-val {
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
  .fn-key-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .fn-key-btn {
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
  .fn-key-btn:hover {
    background: var(--dz-bg-hover);
  }
  .fn-key-btn.active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
    border-color: var(--dz-border-strong);
  }
</style>
