<script lang="ts">
  import { song, activeCell, ui, playback, samplesByTrack, setSample, selectPattern, fxPad, fxFlavours, perf, effects, masterPad, pushUndo } from '../state.svelte.ts'
  import type { SceneNode } from '../state.svelte.ts'
  import { clearAllParamLocks, setTrackSend, changeVoice, removeTrack, setInsertFxType, setInsertFxFlavour, setInsertFxParam } from '../stepActions.ts'
  import { patternRename, patternSetColor } from '../sectionActions.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { VOICE_LIST, type VoiceCategory } from '../audio/dsp/voices.ts'
  import type { VoiceId } from '../state.svelte.ts'
  import { engine } from '../audio/engine.ts'

  import { decoratorLabel } from '../sceneGeometry.ts'

  import { PATTERN_COLORS, FX_FLAVOURS } from '../constants.ts'
  import type { FxFlavourKey } from '../constants.ts'
  import Knob from './Knob.svelte'
  import DockDecoratorEditor from './DockDecoratorEditor.svelte'
  import DockPresetBrowser from './DockPresetBrowser.svelte'
  import DockGenerativeEditor from './DockGenerativeEditor.svelte'
  import EnvGraph from './EnvGraph.svelte'
  import WaveGraph from './WaveGraph.svelte'
  import AlgoGraph from './AlgoGraph.svelte'

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

  // ── Scene Navigator (ADR 070) ──
  // Show pattern header when no pattern sheet and no overlay — either scene node selected or current pattern
  const showPatternHeader = $derived(!ui.patternSheet && !isOverlaySheet)
  // Navigator: show when no pattern sheet and no scene node selected (including overlay sheets)
  const showNavigator = $derived(!ui.patternSheet && !scenePatternNode)
  const showTrackParams = $derived(ui.patternSheet && !isOverlaySheet)

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
    if (bandKey === 'eqLow') fxPad.eqLow = { ...fxPad.eqLow, q }
    else if (bandKey === 'eqMid') fxPad.eqMid = { ...fxPad.eqMid, q }
    else fxPad.eqHigh = { ...fxPad.eqHigh, q }
  }
  function setEqX(bandKey: 'eqLow' | 'eqMid' | 'eqHigh', v: number) {
    pushUndo('EQ')
    if (bandKey === 'eqLow') fxPad.eqLow = { ...fxPad.eqLow, x: v }
    else if (bandKey === 'eqMid') fxPad.eqMid = { ...fxPad.eqMid, x: v }
    else fxPad.eqHigh = { ...fxPad.eqHigh, x: v }
  }
  function setEqY(bandKey: 'eqLow' | 'eqMid' | 'eqHigh', v: number) {
    pushUndo('EQ')
    if (bandKey === 'eqLow') fxPad.eqLow = { ...fxPad.eqLow, y: v }
    else if (bandKey === 'eqMid') fxPad.eqMid = { ...fxPad.eqMid, y: v }
    else fxPad.eqHigh = { ...fxPad.eqHigh, y: v }
  }
  function toggleEqShelf(bandKey: 'eqLow' | 'eqHigh') {
    pushUndo('Toggle EQ shelf')
    if (bandKey === 'eqLow') fxPad.eqLow = { ...fxPad.eqLow, shelf: !fxPad.eqLow.shelf }
    else fxPad.eqHigh = { ...fxPad.eqHigh, shelf: !fxPad.eqHigh.shelf }
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
    if (key === 'verb') fxPad.verb = { ...fxPad.verb, x: v }
    else if (key === 'delay') fxPad.delay = { ...fxPad.delay, x: v }
    else if (key === 'glitch') fxPad.glitch = { ...fxPad.glitch, x: v }
    else if (key === 'granular') fxPad.granular = { ...fxPad.granular, x: v }
    else fxPad.filter = { ...fxPad.filter, x: v }
  }

  function setFxY(key: FxKey, v: number) {
    if (key === 'verb') fxPad.verb = { ...fxPad.verb, y: v }
    else if (key === 'delay') fxPad.delay = { ...fxPad.delay, y: v }
    else if (key === 'glitch') fxPad.glitch = { ...fxPad.glitch, y: v }
    else if (key === 'granular') fxPad.granular = { ...fxPad.granular, y: v }
    else fxPad.filter = { ...fxPad.filter, y: v }
  }

  function toggleFxOn(key: FxKey) {
    if (key === 'verb') fxPad.verb = { ...fxPad.verb, on: !fxPad.verb.on }
    else if (key === 'delay') fxPad.delay = { ...fxPad.delay, on: !fxPad.delay.on }
    else if (key === 'glitch') fxPad.glitch = { ...fxPad.glitch, on: !fxPad.glitch.on }
    else if (key === 'granular') fxPad.granular = { ...fxPad.granular, on: !fxPad.granular.on }
    else fxPad.filter = { ...fxPad.filter, on: !fxPad.filter.on }
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

  const CATEGORIES: { id: VoiceCategory; label: string }[] = [
    { id: 'drum', label: 'DRUM' },
    { id: 'synth', label: 'SYNTH' },
    { id: 'sampler', label: 'SMPL' },
  ]

  const hasSelection = $derived(ui.selectedTrack >= 0)
  const track  = $derived(hasSelection ? song.tracks[ui.selectedTrack] : null)
  const cell   = $derived(hasSelection ? activeCell(ui.selectedTrack) : null)
  const currentCat = $derived(cell?.voiceId ? (VOICE_LIST.find(v => v.id === cell.voiceId)?.category ?? 'drum') : 'drum')
  const voicesInCat = $derived(VOICE_LIST.filter(v => v.category === currentCat))
  const params = $derived(cell ? getParamDefs(cell.voiceId) : [])
  const selTrig = $derived(cell && ui.selectedStep !== null ? cell.trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)
  const isSampler = $derived(cell?.voiceId === 'Sampler')
  const chopSlices = $derived(isSampler ? (cell?.voiceParams?.chopSlices ?? 0) : 0)

  // ── Voice picker toggle ──
  let voiceOpen = $state(false)
  $effect(() => { void ui.selectedTrack; voiceOpen = false })
  const currentVoiceMeta = $derived(cell?.voiceId ? VOICE_LIST.find(v => v.id === cell.voiceId) : null)
  let presetBrowserRef = $state<DockPresetBrowser>(null!)

  // ── Track delete (2-step confirm) ──
  let confirmDelete = $state(false)
  // Reset confirm when switching tracks
  $effect(() => { void ui.selectedTrack; confirmDelete = false })

  function handleDeleteTrack() {
    if (confirmDelete) {
      removeTrack(ui.selectedTrack)
      confirmDelete = false
    } else {
      confirmDelete = true
    }
  }



  // ── Sample loader (ADR 012 Phase 2, persistence ADR 020 §I) ──
  const MAX_SAMPLE_SIZE = 10 * 1024 * 1024 // 10 MB (ADR 012)
  let collapsedGroups = $state(new Set<string>())
  let fileInput = $state<HTMLInputElement>(null!)
  let waveformCanvas = $state<HTMLCanvasElement>(null!)
  let dropActive = $state(false)
  let sampleError = $state('')
  const currentSample = $derived(samplesByTrack[ui.selectedTrack])

  async function loadSampleFile(file: File) {
    if (file.size > MAX_SAMPLE_SIZE) {
      sampleError = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 10 MB)`
      setTimeout(() => { sampleError = '' }, 3000)
      return
    }
    sampleError = ''
    const result = await engine.loadUserSample(ui.selectedTrack, file)
    if (result) {
      setSample(ui.selectedTrack, file.name, result.waveform, result.rawBuffer)
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) void loadSampleFile(file)
    input.value = ''
  }

  function handleSampleDrop(e: DragEvent) {
    e.preventDefault()
    dropActive = false
    const file = e.dataTransfer?.files[0]
    if (file && file.type.startsWith('audio/')) void loadSampleFile(file)
  }

  function drawWaveform(canvas: HTMLCanvasElement, waveform: Float32Array, slices = 0) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, 0, w, h)
    // Waveform
    ctx.strokeStyle = 'rgba(237,232,220,0.6)'
    ctx.lineWidth = 1
    ctx.beginPath()
    const step = Math.max(1, Math.floor(waveform.length / w))
    const mid = h / 2
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * waveform.length)
      let min = 1, max = -1
      for (let j = 0; j < step; j++) {
        const v = waveform[idx + j] ?? 0
        if (v < min) min = v
        if (v > max) max = v
      }
      const y1 = mid - max * mid
      const y2 = mid - min * mid
      ctx.moveTo(x + 0.5, y1)
      ctx.lineTo(x + 0.5, y2)
    }
    ctx.stroke()
    // Center line
    ctx.strokeStyle = 'rgba(237,232,220,0.15)'
    ctx.beginPath()
    ctx.moveTo(0, mid)
    ctx.lineTo(w, mid)
    ctx.stroke()
    // Slice lines
    if (slices > 0) {
      ctx.strokeStyle = 'rgba(108,119,68,0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 1; i < slices; i++) {
        const sx = Math.round((i / slices) * w) + 0.5
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx, h)
      }
      ctx.stroke()
    }
  }

  $effect(() => {
    if (waveformCanvas && currentSample?.waveform) {
      drawWaveform(waveformCanvas, currentSample.waveform, chopSlices)
    }
  })
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
            <button class="btn-open-seq" onpointerdown={openPatternSheet}
              data-tip="Open step sequencer" data-tip-ja="ステップシーケンサーを開く"
            >Open Sequencer ▸</button>
            <div class="section-divider" aria-hidden="true"></div>
          {/if}

          <!-- Decorator editor (ADR 069) -->
          {#if scenePatternNode}
            <DockDecoratorEditor node={scenePatternNode} />
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
          <!-- Track selector bar -->
          <span class="track-bar-label"
            data-tip="Select a track to edit its voice, params and sends"
            data-tip-ja="トラックを選択して音源・パラメータ・センドを編集"
          >TRACKS</span>
          <div class="track-bar">
            {#each song.patterns[ui.currentPattern].cells as c}
              {@const t = song.tracks[c.trackId]}
              <button
                class="track-btn"
                class:active={c.trackId === ui.selectedTrack}
                class:muted={t?.muted}
                onpointerdown={() => { ui.selectedTrack = c.trackId }}
                data-tip="Track {c.trackId + 1}: {c?.name ?? '—'} ({c?.voiceId ? (VOICE_LIST.find(v => v.id === c.voiceId)?.label ?? c.voiceId) : 'unassigned'})"
                data-tip-ja="トラック {c.trackId + 1}: {c?.name ?? '—'} ({c?.voiceId ? (VOICE_LIST.find(v => v.id === c.voiceId)?.label ?? c.voiceId) : '未割当'})"
              ><span class="track-num">{c.trackId + 1}</span>{#if c.insertFx?.type}<span class="insert-dot" aria-label="Insert FX active">◆</span>{/if}<span class="track-voice">{c?.voiceId ? (VOICE_LIST.find(v => v.id === c.voiceId)?.label ?? '') : ''}</span></button>
            {/each}
          </div>

          {#if cell && track}

          <!-- Voice selector (collapsible) -->
          <button class="voice-current" onpointerdown={() => { voiceOpen = !voiceOpen; if (voiceOpen) presetBrowserRef?.close() }}
            data-tip="Change instrument" data-tip-ja="楽器を変更">
            <span class="voice-current-name">{currentVoiceMeta?.fullName ?? cell.voiceId}</span>
            <span class="voice-current-arrow">{voiceOpen ? '▾' : '▸'}</span>
          </button>
          {#if voiceOpen}
            <div class="picker-cats">
              {#each CATEGORIES as cat}
                <button
                  class="cat-btn"
                  class:active={currentCat === cat.id}
                  onpointerdown={() => changeVoice(ui.selectedTrack, VOICE_LIST.find(v => v.category === cat.id)!.id as VoiceId)}
                  data-tip={cat.label} data-tip-ja={cat.label}
                >{cat.label}</button>
              {/each}
            </div>
            <div class="picker-list">
              {#each voicesInCat as v}
                <button
                  class="picker-item"
                  class:selected={cell.voiceId === v.id}
                  onpointerdown={() => { changeVoice(ui.selectedTrack, v.id); voiceOpen = false; presetBrowserRef?.close() }}
                  data-tip={v.id} data-tip-ja={v.id}
                ><span class="picker-cat-tag">{v.label}</span><span class="picker-name">{v.fullName}</span></button>
              {/each}
            </div>
          {/if}

          <!-- Preset browser -->
          <DockPresetBrowser bind:this={presetBrowserRef} onopen={() => { voiceOpen = false }} />

          <!-- Sample loader (ADR 012 Phase 2) -->
          {#if isSampler}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="sample-section"
              class:drop-active={dropActive}
              ondragover={e => { e.preventDefault(); dropActive = true }}
              ondragenter={() => { dropActive = true }}
              ondragleave={() => { dropActive = false }}
              ondrop={handleSampleDrop}
            >
              <div class="sample-file-row">
                <button class="btn-load" onpointerdown={() => fileInput.click()}
                  data-tip="Load audio sample" data-tip-ja="サンプルを読み込む"
                >LOAD</button>
                <span class="sample-name" class:sample-error={!!sampleError}>{sampleError || currentSample?.name || 'Drop audio file'}</span>
              </div>
              <canvas bind:this={waveformCanvas} class="waveform-canvas"></canvas>
              <input
                type="file"
                accept="audio/*"
                bind:this={fileInput}
                onchange={handleFileSelect}
                style="display: none"
              />
            </div>
          {/if}

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="mode-row" onpointerdown={() => { ui.lockMode = !ui.lockMode; ui.selectedStep = null }}
            data-tip="Per-step parameter override — select a step, then tweak knobs" data-tip-ja="ステップごとにパラメータを変更 — ステップを選んでノブを操作">
            <span class="mode-label">P-LOCK</span>
            {#if ui.lockMode && ui.selectedStep !== null}
              <span class="lock-step">STEP {ui.selectedStep + 1}</span>
            {:else if ui.lockMode}
              <span class="lock-hint">select a step</span>
            {/if}
            {#if ui.lockMode && ui.selectedStep !== null && hasAnyLock}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="btn-clr" onpointerdown={(e) => { e.stopPropagation(); clearAllParamLocks(ui.selectedTrack, ui.selectedStep!) }}>CLR</span>
            {/if}
            <span class="mode-switch" class:on={ui.lockMode}><span class="mode-switch-thumb"></span></span>
          </div>

          <!-- Synth param knobs (multi-row grid) -->
          <div class="knob-grid">
            {#each params as p, i}
              {#if p.key === 'polyMode'}
                {@const modeVal = Math.round(knobValue(p) ?? p.default)}
                {@const maxMode = Math.round(p.max)}
                {@const modeLabels = cell?.voiceId === 'FM'
                  ? ['MONO', 'POLY 12', 'WIDE 6', 'UNISON']
                  : cell?.voiceId === 'WT'
                    ? ['MONO', 'POLY 8', 'WIDE 4', 'UNISON']
                    : ['MONO', 'POLY']}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="mode-row" onpointerdown={() => knobChange(p, (modeVal + 1) % (maxMode + 1))}
                  data-tip={p.tip} data-tip-ja={p.tipJa}>
                  <span class="mode-label">{modeLabels[modeVal] ?? 'MONO'}</span>
                  <span class="mode-switch" class:on={modeVal >= 1}><span class="mode-switch-thumb"></span></span>
                </div>
              {:else if p.key === 'reverse'}
                {@const isOn = (knobValue(p) ?? p.default) >= 0.5}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="mode-row" onpointerdown={() => knobChange(p, isOn ? 0 : 1)}
                  data-tip={p.tip} data-tip-ja={p.tipJa}>
                  <span class="mode-label">{isOn ? 'REVERSE' : 'FORWARD'}</span>
                  <span class="mode-switch" class:on={isOn}><span class="mode-switch-thumb"></span></span>
                </div>
              {:else}
                {@const prevNormalIdx = params.findLastIndex((q, j) => j < i && q.key !== 'polyMode' && q.key !== 'reverse')}
                {#if p.group && (prevNormalIdx < 0 || p.group !== params[prevNormalIdx].group)}
                  {@const groupLabels: Record<string, string> = { tone: 'OSC', noise: 'NOISE', metal: 'METAL', amp: 'AMP', filter: 'FILTER', env: 'ENV', arp: 'ARP', osc: 'OSC', lfo: 'LFO', sample: 'SAMPLE', chop: 'CHOP', sync: 'SYNC', ratio: 'RATIO', level: 'LEVEL', decay: 'DECAY' }}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="param-group-label" class:collapsed={collapsedGroups.has(p.group!)}
                    onclick={() => { const g = p.group!; const s = new Set(collapsedGroups); s.has(g) ? s.delete(g) : s.add(g); collapsedGroups = s }}>
                    <span class="group-chevron">{collapsedGroups.has(p.group!) ? '▸' : '▾'}</span>
                    {groupLabels[p.group!] ?? p.group!.toUpperCase()}
                  </div>
                  {#if !collapsedGroups.has(p.group!)}
                    {#if cell?.voiceId === 'WT' && p.group === 'osc'}
                      <WaveGraph position={cell.voiceParams.oscAPos ?? 0} />
                    {:else if cell?.voiceId === 'WT' && p.group === 'env'}
                      <EnvGraph
                        attack={cell.voiceParams.attack ?? 0.005}
                        decay={cell.voiceParams.decay ?? 0.3}
                        sustain={cell.voiceParams.sustain ?? 0.5}
                        release={cell.voiceParams.release ?? 0.3}
                      />
                    {:else if cell?.voiceId === 'FM' && p.group === 'osc'}
                      <AlgoGraph algorithm={cell.voiceParams.algorithm ?? 0} />
                    {/if}
                  {/if}
                {/if}
                {#if !collapsedGroups.has(p.group ?? '')}
                <span data-tip={p.tip ?? 'Drag to adjust'} data-tip-ja={p.tipJa ?? 'ドラッグで調整'}>
                  <Knob
                    value={normalizeParam(p, knobValue(p))}
                    label={p.label}
                    size={32}
                    locked={isParamLocked(p.key)}
                    steps={paramSteps(p)}
                    displayValue={displayLabel(p, knobValue(p))}
                    onchange={v => knobChange(p, v)}
                  />
                </span>
                {/if}
              {/if}
            {/each}
          </div>

          <!-- Insert FX (ADR 077) -->
          <div class="section-divider" aria-hidden="true"></div>
          <div class="section-label">INSERT FX</div>
          {@const insFx = cell.insertFx}
          <div class="insert-fx-row">
            <select
              class="insert-select"
              value={insFx?.type ?? ''}
              onchange={e => {
                const v = (e.target as HTMLSelectElement).value
                setInsertFxType(ui.selectedTrack, v === '' ? null : v as 'verb' | 'delay' | 'glitch')
              }}
              data-tip="Insert FX type" data-tip-ja="インサートFXタイプ"
            >
              <option value="">OFF</option>
              <option value="verb">REVERB</option>
              <option value="delay">DELAY</option>
              <option value="glitch">GLITCH</option>
            </select>
            {#if insFx?.type === 'verb'}
              <select
                class="insert-select"
                value={insFx.flavour}
                onchange={e => setInsertFxFlavour(ui.selectedTrack, (e.target as HTMLSelectElement).value)}
                data-tip="Reverb flavour" data-tip-ja="リバーブフレーバー"
              >
                <option value="room">Room</option>
                <option value="hall">Hall</option>
              </select>
            {:else if insFx?.type === 'delay'}
              <select
                class="insert-select"
                value={insFx.flavour}
                onchange={e => setInsertFxFlavour(ui.selectedTrack, (e.target as HTMLSelectElement).value)}
                data-tip="Delay flavour" data-tip-ja="ディレイフレーバー"
              >
                <option value="digital">Digital</option>
                <option value="dotted">Dotted</option>
                <option value="tape">Tape</option>
              </select>
            {:else if insFx?.type === 'glitch'}
              <select
                class="insert-select"
                value={insFx.flavour}
                onchange={e => setInsertFxFlavour(ui.selectedTrack, (e.target as HTMLSelectElement).value)}
                data-tip="Glitch flavour" data-tip-ja="グリッチフレーバー"
              >
                <option value="bitcrush">Bitcrush</option>
                <option value="redux">Redux</option>
              </select>
            {/if}
          </div>
          {#if insFx?.type}
            <div class="knob-grid">
              <span data-tip="Insert dry/wet mix" data-tip-ja="インサート ドライ/ウェット">
                <Knob value={insFx.mix} label="MIX" size={32} onchange={v => setInsertFxParam(ui.selectedTrack, 'mix', v)} />
              </span>
              <span data-tip={insFx.type === 'verb' ? 'Reverb size' : insFx.type === 'delay' ? 'Delay time' : 'S&H rate'}
                    data-tip-ja={insFx.type === 'verb' ? 'リバーブサイズ' : insFx.type === 'delay' ? 'ディレイタイム' : 'S&Hレート'}>
                <Knob value={insFx.x} label={insFx.type === 'verb' ? 'SIZE' : insFx.type === 'delay' ? 'TIME' : 'RATE'} size={32} onchange={v => setInsertFxParam(ui.selectedTrack, 'x', v)} />
              </span>
              <span data-tip={insFx.type === 'verb' ? 'Reverb damping' : insFx.type === 'delay' ? 'Feedback amount' : 'Bit depth'}
                    data-tip-ja={insFx.type === 'verb' ? 'リバーブダンピング' : insFx.type === 'delay' ? 'フィードバック量' : 'ビット深度'}>
                <Knob value={insFx.y} label={insFx.type === 'verb' ? 'DAMP' : insFx.type === 'delay' ? 'FB' : 'BITS'} size={32} onchange={v => setInsertFxParam(ui.selectedTrack, 'y', v)} />
              </span>
            </div>
          {/if}

          <!-- Send + Mixer -->
          <div class="section-divider" aria-hidden="true"></div>
          <div class="section-label">SEND / MIX</div>
          <div class="knob-grid">
            <span data-tip="Track volume" data-tip-ja="トラック音量">
              <Knob value={track.volume} label="VOL" size={32} onchange={v => { song.tracks[ui.selectedTrack].volume = v }} />
            </span>
            <span data-tip="Stereo panning" data-tip-ja="ステレオパン">
              <Knob value={(track.pan + 1) / 2} label="PAN" size={32} onchange={v => { song.tracks[ui.selectedTrack].pan = v * 2 - 1 }} />
            </span>
            <span data-tip="Reverb send amount" data-tip-ja="リバーブセンド量">
              <Knob value={cell.reverbSend} label="VERB" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'reverbSend', v)} />
            </span>
            <span data-tip="Delay send amount" data-tip-ja="ディレイセンド量">
              <Knob value={cell.delaySend} label="DLY" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'delaySend', v)} />
            </span>
            <span data-tip="Glitch send amount" data-tip-ja="グリッチセンド量">
              <Knob value={cell.glitchSend} label="GLT" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'glitchSend', v)} />
            </span>
            <span data-tip="Granular send amount" data-tip-ja="グラニュラーセンド量">
              <Knob value={cell.granularSend} label="GRN" size={32} onchange={v => setTrackSend(ui.selectedTrack, 'granularSend', v)} />
            </span>
          </div>

          <!-- Remove track (bottom of panel, away from other controls) -->
          <div class="section-divider" aria-hidden="true"></div>
          <div class="track-remove-zone">
            <button
              class="btn-del-track"
              class:confirm={confirmDelete}
              onpointerdown={handleDeleteTrack}
              data-tip={confirmDelete ? 'Tap again to confirm' : 'Remove this track from all patterns'}
              data-tip-ja={confirmDelete ? 'もう一度タップで確定' : 'このトラックを全パターンから削除'}
            >{confirmDelete ? 'REMOVE TRACK' : 'REMOVE TRACK'}</button>
          </div>
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
  /* ── PARAM tab ── */
  .param-content {
    padding: 10px 12px;
  }
  /* ── Track selector bar ── */
  .track-bar-label {
    display: block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(var(--dk-cream), 0.3);
    margin-bottom: 4px;
  }
  .track-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-bottom: 8px;
  }
  .track-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    padding: 3px 4px 2px;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    font-weight: 700;
    cursor: pointer;
    gap: 1px;
  }
  .track-num {
    font-size: 8px;
    opacity: 0.5;
  }
  .insert-dot {
    font-size: 5px;
    color: var(--color-cyan, #6ee);
    margin-left: 1px;
    vertical-align: super;
  }
  .track-voice {
    font-size: 7px;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 32px;
  }
  .track-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .track-btn.active .track-num {
    opacity: 0.7;
  }
  .track-btn.muted:not(.active) {
    opacity: 0.35;
  }

  .track-remove-zone {
    margin-top: 8px;
    padding-top: 8px;
  }
  .btn-del-track {
    width: 100%;
    border: 1px solid rgba(var(--dk-cream), 0.1);
    background: transparent;
    color: rgba(var(--dk-cream), 0.25);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 6px 8px;
    cursor: pointer;
    transition: color 80ms, border-color 80ms, background 80ms;
  }
  .btn-del-track:hover {
    color: rgba(var(--dk-cream), 0.5);
    border-color: rgba(var(--dk-cream), 0.25);
  }
  .btn-del-track.confirm {
    color: var(--color-salmon);
    border-color: var(--color-salmon);
    background: rgba(220, 80, 80, 0.1);
  }
  .lock-step {
    font-size: var(--dk-fs-xs);
    color: var(--color-olive);
    letter-spacing: 0.06em;
  }
  .lock-hint {
    font-size: var(--dk-fs-xs);
    opacity: 0.45;
    font-weight: 400;
    letter-spacing: 0.04em;
  }
  .btn-clr {
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dk-text-mid);
    background: transparent;
    border: 1px solid rgba(var(--dk-cream), 0.25);
    padding: 1px 5px;
    line-height: 14px;
  }
  .btn-clr:active {
    background: rgba(var(--dk-cream), 0.15);
    color: var(--dk-text);
  }

  .mode-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 0;
    cursor: pointer;
    margin-bottom: 2px;
  }
  .mode-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dk-text-mid);
  }
  .mode-switch {
    margin-left: auto;
    width: 28px;
    height: 14px;
    border-radius: 7px;
    background: rgba(var(--dk-cream), 0.15);
    position: relative;
    flex-shrink: 0;
    transition: background 100ms;
  }
  .mode-switch.on {
    background: var(--color-olive);
  }
  .mode-switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(var(--dk-cream), 0.7);
    transition: left 100ms;
  }
  .mode-switch.on .mode-switch-thumb {
    left: 16px;
    background: var(--color-bg);
  }
  /* ── Shared picker (voice + preset) ── */
  .picker-cats {
    display: flex;
    gap: 2px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .cat-btn {
    flex: 1;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 6px 5px;
    cursor: pointer;
  }
  .cat-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .picker-list {
    max-height: 160px;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin-top: 4px;
    border: 1px solid rgba(var(--dk-cream), 0.1);
  }
  .picker-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    border: none;
    border-bottom: 1px solid var(--dk-bg-faint);
    background: transparent;
    color: rgba(var(--dk-cream), 0.65);
    font-size: var(--dk-fs-md);
    padding: 5px 6px;
    text-align: left;
    cursor: pointer;
  }
  .picker-item:hover {
    background: var(--dk-bg-hover);
    color: rgba(var(--dk-cream), 0.9);
  }
  .picker-item:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .picker-item.selected {
    background: rgba(108,119,68,0.2);
    color: rgba(var(--dk-cream), 0.95);
  }
  .picker-item.selected .picker-cat-tag {
    color: var(--color-olive);
  }
  .picker-cat-tag {
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(var(--dk-cream), 0.35);
    min-width: 28px;
    flex-shrink: 0;
  }
  .picker-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* ── Voice category + instrument selector ── */
  .voice-current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 6px 10px;
    cursor: pointer;
    margin-bottom: 4px;
    transition: border-color 80ms;
  }
  .voice-current:hover {
    border-color: var(--dk-border-mid);
  }
  .voice-current-name {
    text-transform: uppercase;
  }
  .voice-current-arrow {
    font-size: 9px;
    opacity: 0.4;
  }

  /* ── Sample loader (ADR 012 Phase 2) ── */
  .sample-section {
    margin-bottom: 8px;
    border: 1px dashed var(--dk-border);
    padding: 6px;
    transition: border-color 80ms;
  }
  .sample-section.drop-active {
    border-color: var(--color-olive);
    background: rgba(108,119,68,0.1);
  }
  .sample-file-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .btn-load {
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: rgba(var(--dk-cream), 0.6);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .btn-load:hover {
    color: rgba(var(--dk-cream), 0.9);
    border-color: rgba(var(--dk-cream), 0.5);
  }
  .sample-name {
    font-size: var(--dk-fs-sm);
    color: var(--dk-text-dim);
    overflow: hidden;
  }
  .sample-error {
    color: #e57373;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .waveform-canvas {
    width: 100%;
    height: 36px;
    display: block;
  }

  .insert-fx-row {
    display: flex;
    gap: 6px;
    padding: 4px 0;
  }
  .insert-select {
    flex: 1;
    font-size: 10px;
    padding: 3px 4px;
    border-radius: 4px;
    border: 1px solid var(--border, #444);
    background: var(--bg-input, #1a1a1a);
    color: var(--fg, #eee);
    cursor: pointer;
  }
  .knob-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 4px 0;
  }
  .param-group-label {
    width: 100%;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
    margin-top: 6px;
    padding-bottom: 2px;
    border-bottom: 1px solid var(--dk-bg-hover);
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .param-group-label:hover { color: var(--dk-text-mid); }
  .param-group-label.collapsed { margin-bottom: 0; }
  .group-chevron { font-size: 7px; line-height: 1; }
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
  .btn-open-seq {
    width: 100%;
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 5px 0;
    cursor: pointer;
    transition: color 60ms, background 60ms;
    margin: 6px 0 8px;
  }
  .btn-open-seq:hover {
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
    border-radius: 2px;
    padding: 1px 3px;
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
