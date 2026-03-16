<script lang="ts">
  import { song, ui, playback, selectPattern, fxPad, fxFlavours, perf, effects, masterPad, pushUndo, pool } from '../state.svelte.ts'
  import type { SceneNode } from '../types.ts'
  import { patternRename, patternSetColor } from '../sectionActions.ts'

  import { decoratorLabel } from '../sceneGeometry.ts'
  import { sceneAddDecorator, sceneSetRoot } from '../sceneActions.ts'
  import { targetColor as autoTargetColor } from '../automationDraw.ts'

  import { PATTERN_COLORS, FX_FLAVOURS } from '../constants.ts'
  import type { FxFlavourKey } from '../constants.ts'
  import Knob from './Knob.svelte'
  import DockDecoratorEditor from './DockDecoratorEditor.svelte'
  import DockAutomationEditor from './DockAutomationEditor.svelte'
  import DockGenerativeEditor from './DockGenerativeEditor.svelte'
  import DockTrackEditor from './DockTrackEditor.svelte'
  import DockPoolBrowser from './DockPoolBrowser.svelte'

  // FX/EQ/Master sheets override decorator editor → show navigator instead
  const isOverlaySheet = $derived(ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master')

  const scenePatternNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'pattern') ? node : null
  })

  const sceneGenerativeNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'generative' && node.generative) ? node : null
  })

  // Selected pattern node in overlay mode (for inline automation editor)
  const overlaySelectedPatternNode = $derived.by(() => {
    if (!isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'pattern') ? node : null
  })

  // ── Scene Navigator (ADR 070) ──
  // Show pattern header when no pattern sheet and no overlay — either scene node selected or current pattern
  const showPatternHeader = $derived(!ui.patternSheet && !isOverlaySheet)
  // Navigator: show when no pattern sheet and no scene node selected (including overlay sheets)
  const showNavigator = $derived(!ui.patternSheet && !scenePatternNode)
  const showTrackParams = $derived(ui.patternSheet && !isOverlaySheet)

  // Find scene node for current pattern (for DECO tab when pattern sheet is open)
  // When the same pattern is used by multiple scene nodes, prioritize:
  // 1. Currently playing scene node  2. Selected scene node  3. First match
  const currentPatternSceneNode = $derived.by(() => {
    if (!ui.patternSheet) return null
    const patId = song.patterns[ui.currentPattern]?.id
    if (!patId) return null
    const matches = song.scene.nodes.filter(n => n.type === 'pattern' && n.patternId === patId)
    if (matches.length <= 1) return matches[0] ?? null
    const playing = matches.find(n => playback.sceneNodeId === n.id)
    if (playing) return playing
    const selected = matches.find(n => ui.selectedSceneNodes[n.id])
    return selected ?? matches[0]
  })
  // Find generative nodes connected to current pattern's scene node (incoming edges)
  const connectedGenerativeNodes = $derived.by(() => {
    if (!currentPatternSceneNode) return []
    const inEdges = song.scene.edges.filter(e => e.to === currentPatternSceneNode.id)
    return inEdges
      .map(e => song.scene.nodes.find(n => n.id === e.from))
      .filter((n): n is SceneNode => n?.type === 'generative' && !!n.generative)
  })
  const decoCount = $derived(
    (currentPatternSceneNode?.decorators ?? []).length + connectedGenerativeNodes.length
  )

  const GLOBAL_PARAM_LABELS: Record<string, string> = {
    tempo: 'Tempo', masterVolume: 'Vol', swing: 'Swing',
    compThreshold: 'Comp THR', compRatio: 'Comp RAT', compMakeup: 'Comp MKP',
    compAttack: 'Comp ATK', compRelease: 'Comp REL',
    duckDepth: 'Duck DPT', duckRelease: 'Duck REL', retVerb: 'Ret VRB', retDelay: 'Ret DLY',
  }
  function autoTargetLabel(t: import('../types.ts').AutomationTarget): string {
    if (t.kind === 'global') return GLOBAL_PARAM_LABELS[t.param] ?? t.param
    if (t.kind === 'track') return `T${t.trackIndex + 1} ${t.param}`
    if (t.kind === 'fx') return t.param.replace(/([A-Z])/g, ' $1').trim()
    if (t.kind === 'eq') return `${t.band.replace('eq', '')} ${t.param}`
    if (t.kind === 'send') return `T${t.trackIndex + 1} ${t.param}`
    return 'Auto'
  }

  // ── EQ Dock Controls ──
  const EQ_BANDS = [
    { key: 'eqLow' as const, label: 'LOW', hasShelf: true },
    { key: 'eqMid' as const, label: 'MID', hasShelf: false },
    { key: 'eqHigh' as const, label: 'HIGH', hasShelf: true },
  ]

  function eqQNorm(q: number): number { return (q - 0.3) / (8.0 - 0.3) }
  function eqQDenorm(v: number): number { return 0.3 + v * (8.0 - 0.3) }
  function eqQDisplay(q: number): string { return q.toFixed(1) }

  function eqFreqDisplay(x: number): string {
    const f = 20 * Math.pow(1000, x)
    return f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${Math.round(f)}`
  }
  function eqGainDisplay(y: number): string {
    const dB = (y - 0.5) * 24
    return `${dB >= 0 ? '+' : ''}${dB.toFixed(1)}`
  }

  function setEqQ(bandKey: 'eqLow' | 'eqMid' | 'eqHigh', v: number) {
    pushUndo('EQ')
    const q = Math.round(eqQDenorm(v) * 10) / 10
    fxPad[bandKey].q = q
  }
  function setEqX(bandKey: 'eqLow' | 'eqMid' | 'eqHigh', v: number) {
    pushUndo('EQ')
    fxPad[bandKey].x = v
  }
  function setEqY(bandKey: 'eqLow' | 'eqMid' | 'eqHigh', v: number) {
    pushUndo('EQ')
    fxPad[bandKey].y = v
  }
  function toggleEqShelf(bandKey: 'eqLow' | 'eqHigh') {
    pushUndo('Toggle EQ shelf')
    fxPad[bandKey].shelf = !fxPad[bandKey].shelf
  }
  function getEqShelf(bandKey: 'eqLow' | 'eqMid' | 'eqHigh'): boolean {
    if (bandKey === 'eqMid') return false
    return (fxPad[bandKey] as { shelf?: boolean }).shelf ?? false
  }

  // ── FX Dock Controls ──
  const FX_NODES = [
    { key: 'verb'     as const, label: 'VERB',  flavourKey: 'verb'     as const },
    { key: 'delay'    as const, label: 'DLY',   flavourKey: 'delay'    as const },
    { key: 'glitch'   as const, label: 'GLT',   flavourKey: 'glitch'   as const },
    { key: 'granular' as const, label: 'GRN',   flavourKey: 'granular' as const },
    { key: 'filter'   as const, label: 'FLTR',  flavourKey: null },
  ] as const

  type FxKey = typeof FX_NODES[number]['key']

  function fxXLabel(key: FxKey): string {
    if (key === 'verb') return fxFlavours.verb === 'shimmer' ? 'SIZE' : 'SIZE'
    if (key === 'delay') return fxFlavours.delay === 'dotted' ? 'TIME' : 'TIME'
    if (key === 'glitch') return fxFlavours.glitch === 'stutter' ? 'SLICE' : 'RATE'
    if (key === 'granular') return 'SIZE'
    return 'FREQ'
  }

  function fxYLabel(key: FxKey): string {
    if (key === 'verb') return fxFlavours.verb === 'shimmer' ? 'SHIM' : 'DAMP'
    if (key === 'delay') return 'FB'
    if (key === 'glitch') return fxFlavours.glitch === 'stutter' ? '—' : 'BITS'
    if (key === 'granular') return 'DENS'
    return 'RESO'
  }

  function fxXDisplay(key: FxKey, x: number): string {
    if (key === 'verb') return `${Math.round(x * 100)}%`
    if (key === 'delay') return `${Math.round(x * 100)}%`
    if (key === 'glitch') {
      if (fxFlavours.glitch === 'stutter') return `${Math.round(10 + x * 190)}ms`
      return `${Math.round(x * 100)}%`
    }
    if (key === 'granular') return `${Math.round(10 + x * 190)}ms`
    if (key === 'filter') {
      const f = x <= 0.5 ? 80 * Math.pow(250, x / 0.5) : 20 * Math.pow(400, (x - 0.5) / 0.5)
      return f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${Math.round(f)}`
    }
    return `${Math.round(x * 100)}%`
  }

  function fxYDisplay(key: FxKey, y: number): string {
    if (key === 'verb') {
      if (fxFlavours.verb === 'shimmer') return `${Math.round(y * 60)}%`
      return `${Math.round((1 - y) * 100)}%`
    }
    if (key === 'delay') return `${Math.round(y * 85)}%`
    if (key === 'glitch') return fxFlavours.glitch === 'stutter' ? '—' : `${Math.round((1 - y) * 100)}%`
    if (key === 'granular') return `${Math.round(y * 100)}%`
    if (key === 'filter') return `${Math.round(y * 100)}%`
    return `${Math.round(y * 100)}%`
  }

  function setFxX(key: FxKey, v: number) {
    fxPad[key].x = v
  }

  function setFxY(key: FxKey, v: number) {
    fxPad[key].y = v
  }

  function toggleFxOn(key: FxKey) {
    fxPad[key].on = !fxPad[key].on
  }

  function fxFlavourKey(key: FxKey): FxFlavourKey | null {
    if (key === 'verb' || key === 'delay' || key === 'glitch' || key === 'granular') return key
    return null
  }

  function setFlavour(fKey: FxFlavourKey, id: string) {
    if (fKey === 'verb') fxFlavours.verb = id as typeof fxFlavours.verb
    else if (fKey === 'delay') fxFlavours.delay = id as typeof fxFlavours.delay
    else if (fKey === 'glitch') fxFlavours.glitch = id as typeof fxFlavours.glitch
    else if (fKey === 'granular') fxFlavours.granular = id as typeof fxFlavours.granular
  }

  function currentFlavourId(fKey: FxFlavourKey): string {
    return fxFlavours[fKey]
  }

  // ── Master Dock Controls ──
  type MasterKnobKey = 'gain' | 'mkp' | 'atk' | 'rel' | 'swg'
  const MASTER_KNOBS: { key: MasterKnobKey; label: string; tip: string; tipJa: string }[] = [
    { key: 'gain', label: 'GAIN', tip: 'Master output volume', tipJa: 'マスター出力音量' },
    { key: 'mkp',  label: 'MKP',  tip: 'Compressor makeup gain (1–4×)', tipJa: 'コンプレッサーメイクアップゲイン (1–4×)' },
    { key: 'atk',  label: 'ATK',  tip: 'Compressor attack (0.1–30ms)', tipJa: 'コンプレッサーアタック (0.1–30ms)' },
    { key: 'rel',  label: 'REL',  tip: 'Compressor release (10–300ms)', tipJa: 'コンプレッサーリリース (10–300ms)' },
    { key: 'swg',  label: 'SWG',  tip: 'Swing amount (shuffle feel)', tipJa: 'スウィング量 (シャッフル感)' },
  ]

  function getMasterKnobValue(key: MasterKnobKey): number {
    if (key === 'gain') return perf.masterGain
    if (key === 'mkp') return (effects.comp.makeup - 1) / 3
    if (key === 'atk') return (effects.comp.attack - 0.1) / 29.9
    if (key === 'rel') return (effects.comp.release - 10) / 290
    return perf.swing
  }

  function setMasterKnobValue(key: MasterKnobKey, v: number) {
    pushUndo('Master knob')
    if (key === 'gain') perf.masterGain = v
    else if (key === 'mkp') effects.comp.makeup = 1 + v * 3
    else if (key === 'atk') effects.comp.attack = 0.1 + v * 29.9
    else if (key === 'rel') effects.comp.release = 10 + v * 290
    else perf.swing = v
  }

  function masterKnobDisplay(key: MasterKnobKey): string {
    if (key === 'gain') return `${Math.round(perf.masterGain * 100)}%`
    if (key === 'mkp') return `${effects.comp.makeup.toFixed(1)}×`
    if (key === 'atk') return `${effects.comp.attack.toFixed(1)}ms`
    if (key === 'rel') return `${Math.round(effects.comp.release)}ms`
    return `${Math.round(perf.swing * 100)}%`
  }

  // Master XY pad node labels
  type MasterPadKey = 'comp' | 'duck' | 'ret'
  const MASTER_PAD_NODES: { key: MasterPadKey; label: string; xLabel: string; yLabel: string; tip: string; tipJa: string }[] = [
    { key: 'comp', label: 'COMP', xLabel: 'THR', yLabel: 'RAT', tip: 'Compressor — threshold / ratio', tipJa: 'コンプレッサー — スレッショルド / レシオ' },
    { key: 'duck', label: 'DUCK', xLabel: 'DPT', yLabel: 'REL', tip: 'Sidechain ducker — depth / release', tipJa: 'サイドチェインダッカー — 深さ / リリース' },
    { key: 'ret',  label: 'RET',  xLabel: 'VRB', yLabel: 'DLY', tip: 'FX returns — reverb / delay level', tipJa: 'FXリターン — リバーブ / ディレイレベル' },
  ]

  function masterPadXDisplay(key: MasterPadKey): string {
    const st = masterPad[key]
    if (key === 'comp') return `${Math.round((0.1 + st.x * 0.9) * 100)}%`
    if (key === 'duck') return `${Math.round(st.x * 100)}%`
    return `${Math.round(st.x * 200)}%`
  }

  function masterPadYDisplay(key: MasterPadKey): string {
    const st = masterPad[key]
    if (key === 'comp') return `1:${Math.round(1 + st.y * 19)}`
    if (key === 'duck') return `${Math.round(20 + st.y * 480)}ms`
    return `${Math.round(st.y * 200)}%`
  }

  function setMasterPadX(key: MasterPadKey, v: number) {
    pushUndo('Master')
    masterPad[key].x = v
  }

  function setMasterPadY(key: MasterPadKey, v: number) {
    pushUndo('Master')
    masterPad[key].y = v
  }

  function toggleMasterPadOn(key: MasterPadKey) {
    pushUndo('Master toggle')
    masterPad[key].on = !masterPad[key].on
  }

  // BFS from root to order patterns by playback traversal; unreachable nodes appended at end
  type NavEntry = { node: SceneNode; depth: number }
  const sceneBfs = $derived.by(() => {
    const nodes = song.scene.nodes
    const edges = song.scene.edges
    const root = nodes.find(n => n.root)
    if (!root) return { ordered: nodes.filter(n => n.type === 'pattern').map(n => ({ node: n, depth: 0 })) as NavEntry[], reachable: new Set<string>() }

    const visited = new Set<string>()
    const ordered: NavEntry[] = []
    const queue: { id: string; depth: number }[] = [{ id: root.id, depth: 0 }]
    visited.add(root.id)

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!
      const node = nodes.find(n => n.id === id)
      if (node?.type === 'pattern') ordered.push({ node, depth })
      const outEdges = edges.filter(e => e.from === id).sort((a, b) => a.order - b.order)
      for (const e of outEdges) {
        if (!visited.has(e.to)) {
          visited.add(e.to)
          queue.push({ id: e.to, depth: depth + 1 })
        }
      }
    }

    const reachable = new Set(ordered.map(e => e.node.id))
    for (const n of nodes) {
      if (n.type === 'pattern' && !visited.has(n.id)) ordered.push({ node: n, depth: 0 })
    }
    return { ordered, reachable }
  })
  const placedPatternNodes = $derived(sceneBfs.ordered)

  function selectSceneNode(nodeId: string) {
    ui.selectedSceneNodes = { [nodeId]: true }
    ui.focusSceneNodeId = nodeId
  }

  // Selected pattern: prefer scene node's pattern, fallback to ui.currentPattern
  const selectedPatternIndex = $derived.by(() => {
    if (scenePatternNode?.patternId) {
      return song.patterns.findIndex(p => p.id === scenePatternNode.patternId)
    }
    return ui.currentPattern
  })

  const selectedPattern = $derived(selectedPatternIndex >= 0 ? song.patterns[selectedPatternIndex] : null)

  function openPatternSheet() {
    if (selectedPatternIndex < 0) return
    selectPattern(selectedPatternIndex)
    ui.patternSheet = true
  }

</script>

<div class="dock-panel" class:split={isOverlaySheet}>
  {#if isOverlaySheet}
  <!-- Split layout: scene navigator (upper) + overlay controls (lower) -->
  <div class="dock-body dock-split">
    <div class="dock-upper">
      <div class="param-content">
        <!-- Scene Navigator (ADR 070) -->
        {#if showNavigator}
          <div class="nav-section">
            <span class="section-label">SCENE</span>
            <div class="nav-list">
              {#each placedPatternNodes as entry}
                {@const node = entry.node}
                {@const pat = song.patterns.find(p => p.id === node.patternId)}
                {@const unreachable = !sceneBfs.reachable.has(node.id)}
                {#if pat}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="nav-item"
                    class:selected={ui.selectedSceneNodes[node.id]}
                    class:playing={playback.playing && playback.sceneNodeId === node.id}
                    class:unreachable
                    onpointerdown={() => selectSceneNode(node.id)}
                    style="padding-left: {4 + Math.min(entry.depth, 2) * 10}px;{playback.playing && playback.sceneNodeId === node.id ? ` --pulse-dur: ${60 / (song.bpm || 120)}s` : ''}"
                  >
                    <span class="nav-color" style="background: {PATTERN_COLORS[pat.color ?? 0]}"></span>
                    {#if node.root}<span class="nav-root">★</span>{/if}
                    <span class="nav-name">{pat.name}</span>
                    {#if (node.decorators ?? []).some(d => d.type !== 'automation')}
                      <span class="nav-decs">
                        {#each (node.decorators ?? []).filter(d => d.type !== 'automation') as dec}
                          <span class="nav-dec-tag">{decoratorLabel(dec)}</span>
                        {/each}
                      </span>
                    {/if}
                  </div>
                {/if}
              {/each}
              {#if !placedPatternNodes.length}
                <div class="dec-empty">No patterns in scene</div>
              {/if}
            </div>
          </div>
        {/if}
        <!-- Automation section in overlay mode (ADR 026) -->
        {#if overlaySelectedPatternNode}
          {@const oNode = overlaySelectedPatternNode}
          {@const allAutoDecorators = (oNode.decorators ?? []).map((d, i) => ({ dec: d, idx: i })).filter(x => x.dec.type === 'automation')}
          {@const autoDecorators = allAutoDecorators.filter(x => {
            const kind = x.dec.automationParams?.target.kind
            if (ui.phraseView === 'fx') return kind === 'fx' || kind === 'send'
            if (ui.phraseView === 'master') return kind === 'global'
            if (ui.phraseView === 'eq') return kind === 'eq'
            return true
          })}
          <div class="nav-auto-section">
            <div class="nav-auto-header">
              <span class="section-label">AUTOMATION</span>
              <button class="nav-auto-add" onpointerdown={() => {
                sceneAddDecorator(oNode.id, 'automation')
                const node = song.scene.nodes.find(n => n.id === oNode.id)
                if (node?.decorators) {
                  ui.editingAutomationInline = { nodeId: oNode.id, decoratorIndex: node.decorators.length - 1 }
                }
              }}
                data-tip="Add automation curve" data-tip-ja="オートメーションカーブを追加"
              >+ Draw</button>
            </div>
            {#if autoDecorators.length > 0}
              <div class="nav-auto-list">
                {#each autoDecorators as ad}
                  {@const ap = ad.dec.automationParams}
                  {@const isEditing = ui.editingAutomationInline?.nodeId === oNode.id && ui.editingAutomationInline?.decoratorIndex === ad.idx}
                  <button
                    class="nav-auto-item"
                    class:editing={isEditing}
                    onpointerdown={() => {
                      if (isEditing) {
                        ui.editingAutomationInline = null
                      } else {
                        ui.editingAutomationInline = { nodeId: oNode.id, decoratorIndex: ad.idx }
                      }
                    }}
                  >
                    <span class="nav-auto-dot" style="background: {autoTargetColor(ap?.target)}"></span>
                    <span class="nav-auto-label">{ap ? autoTargetLabel(ap.target) : 'Auto'}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          {#if ui.editingAutomationInline?.nodeId === oNode.id}
            <DockAutomationEditor
              nodeId={ui.editingAutomationInline.nodeId}
              decoratorIndex={ui.editingAutomationInline.decoratorIndex}
              viewContext={ui.phraseView}
            />
          {/if}
        {/if}
      </div>
    </div>
    <div class="dock-lower">
      <div class="param-content">
        {#if ui.phraseView === 'fx'}
          <span class="section-label">FX CONTROLS</span>
          <div class="fx-dock-grid">
            {#each FX_NODES as node}
              {@const pad = fxPad[node.key]}
              {@const fKey = fxFlavourKey(node.key)}
              <div class="fx-dock-band" class:disabled={!pad.on}>
                <div class="fx-dock-header">
                  <button
                    class="fx-dock-toggle"
                    class:active={pad.on}
                    onpointerdown={() => toggleFxOn(node.key)}
                  >{node.label}</button>
                  {#if fKey}
                    <div class="fx-dock-flavours">
                      {#each FX_FLAVOURS[fKey] as fl}
                        <button
                          class="fx-flv-btn"
                          class:active={currentFlavourId(fKey) === fl.id}
                          onpointerdown={() => setFlavour(fKey, fl.id)}
                          data-tip={fl.tip}
                          data-tip-ja={fl.tipJa}
                        >{fl.label}</button>
                      {/each}
                    </div>
                  {/if}
                </div>
                <div class="fx-dock-knobs">
                  <Knob
                    value={pad.x}
                    label={fxXLabel(node.key)}
                    size={32}
                    displayValue={fxXDisplay(node.key, pad.x)}
                    onchange={v => setFxX(node.key, v)}
                  />
                  <Knob
                    value={pad.y}
                    label={fxYLabel(node.key)}
                    size={32}
                    displayValue={fxYDisplay(node.key, pad.y)}
                    onchange={v => setFxY(node.key, v)}
                  />
                </div>
              </div>
            {/each}
          </div>
        {:else if ui.phraseView === 'eq'}
          <span class="section-label">EQ CONTROLS</span>
          <div class="eq-dock-grid">
            {#each EQ_BANDS as band}
              {@const pad = fxPad[band.key]}
              {@const shelf = getEqShelf(band.key)}
              <div class="eq-dock-band" class:disabled={!pad.on}>
                <span class="eq-dock-label">{band.label}{shelf ? ' SH' : ''}</span>
                <div class="eq-dock-knobs">
                  <span data-tip="Frequency" data-tip-ja="周波数">
                    <Knob
                      value={pad.x}
                      label="FREQ"
                      size={32}
                      displayValue={eqFreqDisplay(pad.x)}
                      onchange={v => setEqX(band.key, v)}
                    />
                  </span>
                  <span data-tip="Gain (dB)" data-tip-ja="ゲイン (dB)">
                    <Knob
                      value={pad.y}
                      label="GAIN"
                      size={32}
                      displayValue={eqGainDisplay(pad.y)}
                      onchange={v => setEqY(band.key, v)}
                    />
                  </span>
                  <span data-tip="Q (resonance) — scroll wheel on EQ node also works" data-tip-ja="Q (レゾナンス) — EQノード上のスクロールでも変更可能">
                    <Knob
                      value={eqQNorm(pad.q ?? 1.5)}
                      label="Q"
                      size={32}
                      displayValue={eqQDisplay(pad.q ?? 1.5)}
                      onchange={v => setEqQ(band.key, v)}
                    />
                  </span>
                </div>
                {#if band.hasShelf}
                  <button
                    class="btn-shelf"
                    class:active={shelf}
                    onpointerdown={() => toggleEqShelf(band.key as 'eqLow' | 'eqHigh')}
                    data-tip={shelf ? 'Switch to peaking EQ' : 'Switch to shelf EQ'}
                    data-tip-ja={shelf ? 'ピーキングEQに切替' : 'シェルフEQに切替'}
                  >{shelf ? 'SHELF' : 'PEAK'}</button>
                {/if}
              </div>
            {/each}
          </div>
        {:else if ui.phraseView === 'master'}
          <span class="section-label">MASTER</span>
          <div class="master-dock-knobs">
            {#each MASTER_KNOBS as mk}
              <span data-tip={mk.tip} data-tip-ja={mk.tipJa}>
                <Knob
                  value={getMasterKnobValue(mk.key)}
                  label={mk.label}
                  size={32}
                  displayValue={masterKnobDisplay(mk.key)}
                  onchange={v => setMasterKnobValue(mk.key, v)}
                />
              </span>
            {/each}
          </div>
          <span class="section-label mst-sub">XY PAD</span>
          <div class="master-dock-grid">
            {#each MASTER_PAD_NODES as node}
              {@const st = masterPad[node.key]}
              <div class="master-dock-band" class:disabled={!st.on}>
                <button
                  class="fx-dock-toggle"
                  class:active={st.on}
                  onpointerdown={() => toggleMasterPadOn(node.key)}
                  data-tip={node.tip}
                  data-tip-ja={node.tipJa}
                >{node.label}</button>
                <div class="fx-dock-knobs">
                  <Knob
                    value={st.x}
                    label={node.xLabel}
                    size={32}
                    displayValue={masterPadXDisplay(node.key)}
                    onchange={v => setMasterPadX(node.key, v)}
                  />
                  <Knob
                    value={st.y}
                    label={node.yLabel}
                    size={32}
                    displayValue={masterPadYDisplay(node.key)}
                    onchange={v => setMasterPadY(node.key, v)}
                  />
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
  {:else}
  <!-- Normal single-scroll layout -->
  <div class="dock-body">
        <div class="param-content">
          <!-- Pattern header (ADR 069/070) -->
          {#if showPatternHeader && selectedPattern}
            <span class="section-label">PATTERN</span>
            <div class="dec-pat-header">
              <span class="dec-pat-dot" style="background: {PATTERN_COLORS[selectedPattern?.color ?? 0]}"></span>
              <input
                class="dec-pat-input"
                value={selectedPattern?.name ?? ''}
                maxlength="8"
                placeholder="NAME"
                onpointerdown={e => e.stopPropagation()}
                onfocus={e => (e.target as HTMLInputElement).select()}
                onblur={e => { if (selectedPatternIndex >= 0) patternRename(selectedPatternIndex, (e.target as HTMLInputElement).value) }}
                onkeydown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              />
            </div>
            <div class="dec-color-bar">
              {#each PATTERN_COLORS as c, i}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span
                  class="dec-color-sw"
                  class:active={selectedPattern.color === i}
                  style="--sw: {c}"
                  onpointerdown={() => patternSetColor(selectedPatternIndex, i)}
                ></span>
              {/each}
            </div>
            <div class="dec-action-row">
              <button class="btn-open-seq" onpointerdown={openPatternSheet}
                data-tip="Open step sequencer" data-tip-ja="ステップシーケンサーを開く"
              >Open Sequencer ▸</button>
              {#if scenePatternNode && !scenePatternNode.root}
                <button class="btn-set-root" onpointerdown={() => sceneSetRoot(scenePatternNode.id)}
                  data-tip="Set as scene root" data-tip-ja="ルートノードに設定"
                >★ Root</button>
              {/if}
            </div>
            <div class="section-divider" aria-hidden="true"></div>
          {/if}

          <!-- Decorator editor (ADR 069) -->
          {#if scenePatternNode}
            <DockDecoratorEditor node={scenePatternNode} />
            {#if ui.editingAutomationInline?.nodeId === scenePatternNode.id}
              <DockAutomationEditor
                nodeId={ui.editingAutomationInline.nodeId}
                decoratorIndex={ui.editingAutomationInline.decoratorIndex}
              />
            {/if}
          {/if}

          <!-- Generative node editor (ADR 078) -->
          {#if sceneGenerativeNode}
            <DockGenerativeEditor node={sceneGenerativeNode} />
          {/if}

          <!-- Scene Navigator (ADR 070) -->
          {#if showNavigator}
            <div class="nav-section">
              <span class="section-label">SCENE</span>
              <div class="nav-list">
                {#each placedPatternNodes as entry}
                  {@const node = entry.node}
                  {@const pat = song.patterns.find(p => p.id === node.patternId)}
                  {@const unreachable = !sceneBfs.reachable.has(node.id)}
                  {#if pat}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="nav-item"
                      class:selected={ui.selectedSceneNodes[node.id]}
                      class:playing={playback.playing && playback.sceneNodeId === node.id}
                      class:unreachable
                      onpointerdown={() => selectSceneNode(node.id)}
                      style="padding-left: {4 + Math.min(entry.depth, 2) * 10}px;{playback.playing && playback.sceneNodeId === node.id ? ` --pulse-dur: ${60 / (song.bpm || 120)}s` : ''}"
                    >
                      <span class="nav-color" style="background: {PATTERN_COLORS[pat.color ?? 0]}"></span>
                      {#if node.root}<span class="nav-root">★</span>{/if}
                      <span class="nav-name">{pat.name}</span>
                      {#if node.decorators?.length}
                        <span class="nav-decs">
                          {#each node.decorators as dec}
                            <span class="nav-dec-tag">{decoratorLabel(dec)}</span>
                          {/each}
                        </span>
                      {/if}
                    </div>
                  {/if}
                {/each}
                {#if !placedPatternNodes.length}
                  <div class="dec-empty">No patterns in scene</div>
                {/if}
              </div>
            </div>
          {/if}

          {#if showTrackParams}
            <!-- Tab bar (ADR 092) -->
            <div class="dock-tabs">
              <button
                class="dock-tab"
                class:active={ui.dockTab === 'tracks'}
                onpointerdown={() => ui.dockTab = 'tracks'}
              >TRACKS</button>
              <button
                class="dock-tab"
                class:active={ui.dockTab === 'scene'}
                onpointerdown={() => ui.dockTab = 'scene'}
              >SCENE{#if decoCount > 0}<span class="dock-tab-badge">{decoCount}</span>{/if}</button>
              <button
                class="dock-tab"
                class:active={ui.dockTab === 'pool'}
                onpointerdown={() => ui.dockTab = 'pool'}
              >POOL{#if pool.stats.count > 0}<span class="dock-tab-badge">{pool.stats.count}</span>{/if}</button>
            </div>

            {#if ui.dockTab === 'tracks'}
              <DockTrackEditor />
            {:else if ui.dockTab === 'scene'}
              {#if currentPatternSceneNode}
                <DockDecoratorEditor node={currentPatternSceneNode} />
                {#if ui.editingAutomationInline?.nodeId === currentPatternSceneNode.id}
                  <DockAutomationEditor
                    nodeId={ui.editingAutomationInline.nodeId}
                    decoratorIndex={ui.editingAutomationInline.decoratorIndex}
                  />
                {/if}
                {#if connectedGenerativeNodes.length > 0}
                  <div class="section-divider" aria-hidden="true"></div>
                  {#each connectedGenerativeNodes as genNode}
                    <DockGenerativeEditor node={genNode} />
                  {/each}
                {/if}
              {:else}
                <div class="dec-empty">
                  Place this pattern in the scene graph to add decorators.
                </div>
              {/if}
            {:else if ui.dockTab === 'pool'}
              <DockPoolBrowser />
            {/if}
          {/if}
        </div>
    </div>
  {/if}<!-- close isOverlaySheet if/else -->
</div>

<style>
  .dock-panel {
    /* ── Dock design tokens ── */
    --dk-cream: 237,232,220;
    --dk-text: rgba(var(--dk-cream), 0.85);
    --dk-text-mid: rgba(var(--dk-cream), 0.55);
    --dk-text-dim: rgba(var(--dk-cream), 0.4);
    --dk-border: rgba(var(--dk-cream), 0.15);
    --dk-border-mid: rgba(var(--dk-cream), 0.3);
    --dk-bg-hover: rgba(var(--dk-cream), 0.08);
    --dk-bg-faint: rgba(var(--dk-cream), 0.06);
    --dk-bg-active: rgba(var(--dk-cream), 0.12);
    --dk-fs-xs: 9px;
    --dk-fs-sm: 10px;
    --dk-fs-md: 11px;
    --dk-fs-lg: 12px;

    position: relative;
    width: 280px;
    flex-shrink: 0;
    background: var(--color-fg);
    color: var(--color-bg);
    display: flex;
    flex-direction: column;
    border-left: 1px solid rgba(var(--dk-cream), 0.08);
    overflow: hidden;
  }

  /* ── Body ── */
  .dock-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* ── Split layout (overlay sheets: scene top, controls bottom) ── */
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
    border-bottom: 1px solid var(--dk-border);
  }
  .dock-lower {
    flex: 1 1 50%;
    min-height: 80px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* ── EQ Dock Controls ── */
  /* ── FX dock controls ── */
  .fx-dock-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }
  .fx-dock-band {
    padding: 6px 8px;
    border: 1px solid var(--dk-border);
    border-radius: 4px;
  }
  .fx-dock-band.disabled {
    opacity: 0.35;
  }
  .fx-dock-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .fx-dock-toggle {
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 1px 6px;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    cursor: pointer;
    border-radius: 2px;
  }
  .fx-dock-toggle.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .fx-dock-flavours {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }
  .fx-flv-btn {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 4px;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    cursor: pointer;
    border-radius: 2px;
  }
  .fx-flv-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .fx-dock-knobs {
    display: flex;
    gap: 4px;
  }
  /* ── EQ dock controls ── */
  .eq-dock-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 6px;
  }
  .eq-dock-band {
    padding: 6px 8px;
    border: 1px solid var(--dk-border);
    border-radius: 4px;
  }
  .eq-dock-band.disabled {
    opacity: 0.35;
  }
  .eq-dock-label {
    display: block;
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--dk-text-mid);
    margin-bottom: 4px;
  }
  .eq-dock-knobs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .btn-shelf {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    cursor: pointer;
    border-radius: 2px;
  }
  .btn-shelf.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  /* ── Master dock controls ── */
  .master-dock-knobs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .mst-sub {
    margin-top: 4px;
  }
  .master-dock-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .master-dock-band {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .master-dock-band.disabled {
    opacity: 0.35;
  }
  /* ── Dock Tabs (ADR 092) ── */
  .dock-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 8px;
    border: 1px solid var(--dk-border);
    border-radius: 3px;
    overflow: hidden;
  }
  .dock-tab {
    flex: 1;
    font-family: var(--font-data, inherit);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 4px 0;
    border: none;
    background: transparent;
    color: var(--dk-text-dim);
    cursor: pointer;
    transition: background 60ms, color 60ms;
    position: relative;
  }
  .dock-tab:not(:last-child) {
    border-right: 1px solid var(--dk-border);
  }
  .dock-tab:hover {
    background: var(--dk-bg-hover);
    color: var(--dk-text-mid);
  }
  .dock-tab.active {
    background: var(--dk-bg-active);
    color: var(--dk-text);
  }
  .dock-tab-badge {
    font-size: 8px;
    font-weight: 700;
    vertical-align: super;
    margin-left: 1px;
    color: var(--color-olive);
  }
  .dec-empty {
    font-size: var(--dk-fs-sm);
    color: var(--dk-text-dim);
    padding: 12px 0;
    font-style: italic;
  }

  /* ── PARAM tab ── */
  .param-content {
    padding: 10px 12px;
  }
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dk-bg-active);
    margin: 8px 0;
  }
  .section-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
    padding-bottom: 2px;
  }

  /* ── Decorator pattern header ── */
  .dec-pat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
    gap: 6px;
  }
  .dec-pat-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dec-pat-input {
    font-size: var(--dk-fs-lg);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dk-text);
    background: var(--dk-bg-faint);
    border: 1px solid var(--dk-border);
    border-bottom: 1px solid var(--dk-border-mid);
    outline: none;
    padding: 2px 6px;
    flex: 1;
    min-width: 0;
    text-transform: uppercase;
    transition: border-color 60ms;
  }
  .dec-pat-input::placeholder {
    color: var(--dk-text-dim);
    font-style: italic;
  }
  .dec-pat-input:focus {
    border-color: var(--dk-border-mid);
    background: var(--dk-bg-hover);
  }
  .dec-color-bar {
    display: flex;
    gap: 2px;
    margin: 10px 0 10px;
  }
  .dec-color-sw {
    width: 100%;
    height: 6px;
    background: var(--sw);
    opacity: 0.4;
    cursor: pointer;
    transition: opacity 60ms, transform 60ms;
  }
  .dec-color-sw:first-child { border-radius: 2px 0 0 2px; }
  .dec-color-sw:last-child { border-radius: 0 2px 2px 0; }
  .dec-color-sw:hover {
    opacity: 0.7;
    transform: scaleY(1.5);
  }
  .dec-color-sw.active {
    opacity: 1;
    transform: scaleY(1.8);
  }
  .dec-action-row {
    display: flex;
    gap: 4px;
    margin: 6px 0 8px;
  }
  .btn-open-seq {
    flex: 1;
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 5px 0;
    cursor: pointer;
    transition: color 60ms, background 60ms;
  }
  .btn-open-seq:hover {
    color: var(--dk-text);
    background: var(--dk-bg-hover);
  }
  .btn-set-root {
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 5px 8px;
    cursor: pointer;
    transition: color 60ms, background 60ms;
    white-space: nowrap;
  }
  .btn-set-root:hover {
    color: var(--dk-text);
    background: var(--dk-bg-hover);
  }

  /* ── Scene Navigator (ADR 070) ── */
  .nav-section {
    margin-bottom: 4px;
  }
  .nav-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 6px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    cursor: pointer;
    transition: background 60ms;
  }
  .nav-item:hover {
    background: var(--dk-bg-hover);
  }
  .nav-item.selected {
    background: var(--dk-bg-active);
  }
  .nav-color {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .nav-root {
    font-size: 9px;
    color: var(--color-olive);
    flex-shrink: 0;
    margin: 0 -2px;
  }
  .nav-name {
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dk-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nav-item.unreachable {
    opacity: 0.35;
  }
  .nav-item.playing {
    animation: nav-pulse var(--pulse-dur, 0.5s) ease-in-out infinite;
  }
  .nav-item.playing .nav-color {
    box-shadow: 0 0 6px 2px currentColor;
  }
  @keyframes nav-pulse {
    0%, 100% { background: var(--dk-bg-active); }
    50% { background: rgba(var(--dk-cream), 0.2); }
  }
  .nav-decs {
    display: flex;
    gap: 3px;
    margin-left: auto;
    flex-shrink: 0;
  }
  .nav-dec-tag {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dk-text-dim);
    background: var(--dk-bg-faint);
    border: none;
    border-radius: 2px;
    padding: 1px 3px;
    white-space: nowrap;
  }
.nav-auto-section {
    margin-top: 4px;
  }
  .nav-auto-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .nav-auto-add {
    font-family: var(--font-data);
    font-size: var(--dk-fs-xs);
    padding: 1px 6px;
    border: 1px solid rgba(237, 232, 220, 0.3);
    border-radius: 3px;
    background: transparent;
    color: var(--dk-text-mid);
    cursor: pointer;
  }
  .nav-auto-add:hover {
    background: var(--dk-bg-hover);
    color: var(--dk-text);
  }
  .nav-auto-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-bottom: 4px;
  }
  .nav-auto-item {
    display: flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-data);
    font-size: var(--dk-fs-xs);
    padding: 1px 5px;
    border: 1px solid rgba(237, 232, 220, 0.15);
    border-radius: 3px;
    background: transparent;
    color: var(--dk-text-mid);
    cursor: pointer;
  }
  .nav-auto-item:hover {
    background: var(--dk-bg-hover);
  }
  .nav-auto-item.editing {
    background: var(--dk-bg-active);
    color: rgba(237, 232, 220, 0.9);
    border-color: var(--dk-text-dim);
  }
  .nav-auto-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .nav-auto-label {
    white-space: nowrap;
  }
  @media (max-width: 639px) {
    .nav-item {
      padding: 8px 8px;
      gap: 8px;
    }
    .nav-color {
      width: 10px;
      height: 10px;
    }
    .nav-name {
      font-size: var(--dk-fs-md);
    }
    .nav-dec-tag {
      font-size: 8px;
      padding: 2px 4px;
    }
  }


</style>
