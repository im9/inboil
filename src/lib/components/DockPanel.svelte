<script lang="ts">
  import { song, activeCell, ui, playback, toggleDockMinimized, samplesByTrack, setSample, selectPattern } from '../state.svelte.ts'
  import type { SceneDecorator, SceneNode } from '../state.svelte.ts'
  import { clearAllParamLocks, setTrackSend, applyPreset, changeVoice, removeTrack } from '../stepActions.ts'
  import { patternRename, patternSetColor } from '../sectionActions.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { hasPresets, getPresets, getPresetCategories, CATEGORY_LABELS, loadUserPresetsIntoCache, isUserPresetsLoaded, addUserPresetToCache, removeUserPresetFromCache, renameUserPresetInCache, type UserPreset } from '../presets.ts'
  import { saveUserPreset, deleteUserPreset, renameUserPreset } from '../storage.ts'
  import { VOICE_LIST, type VoiceCategory } from '../audio/dsp/voices.ts'
  import type { VoiceId } from '../state.svelte.ts'
  import { engine } from '../audio/engine.ts'
  import { sceneUpdateDecorator, sceneRemoveDecorator, sceneAddDecorator } from '../sceneActions.ts'
  import { decoratorLabel } from '../sceneGeometry.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import Knob from './Knob.svelte'
  import EnvGraph from './EnvGraph.svelte'
  import WaveGraph from './WaveGraph.svelte'
  import AlgoGraph from './AlgoGraph.svelte'

  // ── Scene decorator editing (ADR 069) ──
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  // FX/EQ/Master sheets override decorator editor → show navigator instead
  const isOverlaySheet = $derived(ui.phraseView === 'fx' || ui.phraseView === 'eq' || ui.phraseView === 'master')

  const scenePatternNode = $derived.by(() => {
    if (ui.patternSheet || isOverlaySheet) return null
    const selected = Object.keys(ui.selectedSceneNodes)
    if (selected.length !== 1) return null
    const node = song.scene.nodes.find(n => n.id === selected[0])
    return (node?.type === 'pattern') ? node : null
  })

  let addMenuOpen = $state(false)

  const DECORATOR_TYPES: { type: SceneDecorator['type']; label: string }[] = [
    { type: 'transpose', label: 'Transpose' },
    { type: 'tempo', label: 'Tempo' },
    { type: 'repeat', label: 'Repeat' },
    { type: 'fx', label: 'FX' },
    { type: 'automation', label: 'Automation' },
  ]

  function decKnobValue(dec: SceneDecorator): number {
    if (dec.type === 'transpose') {
      if (dec.params.mode === 1) return (dec.params.key ?? 0) / 11
      return ((dec.params.semitones ?? 0) + 12) / 24
    }
    if (dec.type === 'tempo') return ((dec.params.bpm ?? 120) - 60) / 240
    if (dec.type === 'repeat') return ((dec.params.count ?? 2) - 1) / 15
    return 0
  }

  function decKnobDisplay(dec: SceneDecorator): string {
    if (dec.type === 'transpose') {
      if (dec.params.mode === 1) return NOTE_NAMES[dec.params.key ?? 0]
      const s = dec.params.semitones ?? 0
      return `${s >= 0 ? '+' : ''}${s}`
    }
    if (dec.type === 'tempo') return `${dec.params.bpm ?? 120}`
    if (dec.type === 'repeat') return `${dec.params.count ?? 2}`
    return ''
  }

  function handleDecKnobChange(nodeId: string, idx: number, dec: SceneDecorator, v: number) {
    const p = { ...dec.params }
    if (dec.type === 'transpose') {
      if (p.mode === 1) p.key = Math.round(v * 11)
      else p.semitones = Math.round(v * 24 - 12)
    } else if (dec.type === 'tempo') {
      p.bpm = Math.round((v * 240 + 60) / 5) * 5
    } else if (dec.type === 'repeat') {
      p.count = Math.round(v * 15) + 1
    }
    sceneUpdateDecorator(nodeId, idx, p)
  }

  function toggleDecMode(nodeId: string, idx: number, dec: SceneDecorator) {
    const p = { ...dec.params }
    p.mode = p.mode === 1 ? 0 : 1
    sceneUpdateDecorator(nodeId, idx, p)
  }

  function toggleDecFx(nodeId: string, idx: number, dec: SceneDecorator, key: string) {
    const p = { ...dec.params }
    p[key] = p[key] ? 0 : 1
    sceneUpdateDecorator(nodeId, idx, p)
  }

  // ── Scene Navigator (ADR 070) ──
  // Show pattern header when no pattern sheet and no overlay — either scene node selected or current pattern
  const showPatternHeader = $derived(!ui.patternSheet && !isOverlaySheet)
  // Navigator: show when no pattern sheet and no scene node selected (including overlay sheets)
  const showNavigator = $derived(!ui.patternSheet && !scenePatternNode)
  const showTrackParams = $derived(ui.patternSheet && !isOverlaySheet)

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

  // ── Preset browser ──
  const showPresets = $derived(cell ? hasPresets(cell.voiceId) : false)
  let presetCategory = $state<string | null>(null)
  let presetOpen = $state(false)
  // Reset category filter when voice changes
  $effect(() => { cell?.voiceId; presetCategory = null })
  // Derive preset name from cell (persisted in Cell.presetName)
  const currentPreset = $derived(cell?.presetName ?? '')

  // ── Recently used presets (session only, per voice) ──
  const recentPresetsMap = new Map<string, string[]>() // voiceId → preset names (max 4)
  let recentVersion = $state(0)
  const recentPresets = $derived.by(() => {
    recentVersion // reactive dependency
    const vid = cell?.voiceId
    if (!vid) return [] as { name: string; params: Record<string, number> }[]
    const names = recentPresetsMap.get(vid) ?? []
    const all = getPresets(vid, null)
    return names
      .map(n => all.find(p => p.name === n))
      .filter((p): p is NonNullable<typeof p> => p != null)
  })

  function trackRecent(voiceId: string, presetName: string) {
    const list = recentPresetsMap.get(voiceId) ?? []
    const filtered = list.filter(n => n !== presetName)
    filtered.unshift(presetName)
    if (filtered.length > 4) filtered.pop()
    recentPresetsMap.set(voiceId, filtered)
    recentVersion++
  }

  function selectPreset(preset: { name: string; params: Record<string, number> }) {
    applyPreset(ui.selectedTrack, preset.params, preset.name)
    if (cell?.voiceId) trackRecent(cell.voiceId, preset.name)
    presetOpen = false
  }

  // ── User preset save/delete ──
  let saveMode = $state(false)
  let saveName = $state('')
  let saveInput = $state<HTMLInputElement>(null!)
  // Trigger to force reactivity refresh after user preset mutations
  let userPresetVersion = $state(0)

  // Load user presets from IDB on first mount
  $effect(() => {
    if (!isUserPresetsLoaded()) void loadUserPresetsIntoCache().then(() => { userPresetVersion++ })
  })

  // Force presetList to re-derive when user presets change
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  const presetListAll = $derived.by(() => {
    userPresetVersion; // reactive dependency
    return cell ? getPresets(cell.voiceId, presetCategory) : []
  })
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  const presetCatsAll = $derived.by(() => {
    userPresetVersion; // reactive dependency
    return cell ? getPresetCategories(cell.voiceId) : []
  })

  function startSavePreset() {
    saveMode = true
    saveName = ''
    requestAnimationFrame(() => saveInput?.focus())
  }

  let saving = false
  async function commitSavePreset() {
    if (saving) return
    const name = saveName.trim()
    const voiceId = cell?.voiceId
    const params = cell ? { ...cell.voiceParams } : null
    saveMode = false
    if (!name || !voiceId || !params) return
    saving = true
    try {
      const id = await saveUserPreset(voiceId, name, params)
      addUserPresetToCache(voiceId, name, params, id)
      userPresetVersion++
      if (cell) cell.presetName = name
    } finally {
      saving = false
    }
  }

  function cancelSavePreset() {
    if (saving) return
    saveMode = false
  }

  async function deletePreset(preset: UserPreset) {
    await deleteUserPreset(preset.id)
    removeUserPresetFromCache(preset.voiceId, preset.id)
    userPresetVersion++
    if (cell?.presetName === preset.name) {
      cell.presetName = undefined
    }
  }

  function isUserPreset(preset: unknown): preset is UserPreset {
    return typeof preset === 'object' && preset !== null && 'isUser' in preset
  }

  // ── User preset rename (double-tap) ──
  let renamingId = $state<number | null>(null)
  let renameName = $state('')
  let renameInput = $state<HTMLInputElement>(null!)
  let lastTapId = $state<number | null>(null)
  let lastTapTime = $state(0)

  function handlePresetTap(preset: UserPreset) {
    const now = Date.now()
    if (lastTapId === preset.id && now - lastTapTime < 400) {
      // Double-tap → start rename
      lastTapId = null
      renamingId = preset.id
      renameName = preset.name
      requestAnimationFrame(() => renameInput?.focus())
    } else {
      lastTapId = preset.id
      lastTapTime = now
      selectPreset(preset)
    }
  }

  let renaming = false
  async function commitRename(preset: UserPreset) {
    if (renaming) return
    const name = renameName.trim()
    const id = renamingId
    renamingId = null
    if (!name || !id || name === preset.name) return
    renaming = true
    try {
      await renameUserPreset(id, name)
      renameUserPresetInCache(preset.voiceId, id, name)
      userPresetVersion++
      if (cell?.presetName === preset.name) {
        cell.presetName = name.slice(0, 16)
      }
    } finally {
      renaming = false
    }
  }

  function cancelRename() {
    if (renaming) return
    renamingId = null
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

<div class="dock-panel" class:minimized={ui.dockMinimized}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dock-handle"
    onpointerdown={toggleDockMinimized}
    data-tip={ui.dockMinimized ? 'Expand dock' : 'Minimize dock'}
    data-tip-ja={ui.dockMinimized ? 'ドックを展開' : 'ドックを最小化'}
  ><span class="handle-bar"></span></div>
  {#if !ui.dockMinimized}
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
            <div class="dec-section">
              <div class="dec-section-header">
                <span class="section-label">DECORATORS</span>
                <div class="dec-add-wrapper">
                  <button class="btn-dec-add" onpointerdown={() => addMenuOpen = !addMenuOpen}
                    data-tip="Add decorator" data-tip-ja="デコレーターを追加"
                  >+ Add {addMenuOpen ? '▾' : '▸'}</button>
                  {#if addMenuOpen}
                    <div class="dec-add-menu">
                      {#each DECORATOR_TYPES as dt}
                        <button class="dec-add-item" onpointerdown={() => {
                          sceneAddDecorator(scenePatternNode.id, dt.type)
                          addMenuOpen = false
                        }}>{dt.label}</button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
              {#each scenePatternNode.decorators ?? [] as dec, i}
                <div class="dec-card">
                  <div class="dec-card-header">
                    <span class="dec-card-type">{dec.type.toUpperCase()}</span>
                    <button class="dec-card-detach" onpointerdown={() => sceneRemoveDecorator(scenePatternNode.id, i)}
                      data-tip="Remove decorator" data-tip-ja="デコレーターを削除"
                    >×</button>
                  </div>
                  {#if dec.type === 'transpose'}
                    <div class="dec-card-body">
                      <button
                        class="btn-toggle dec-mode"
                        class:active={dec.params.mode === 1}
                        onpointerdown={() => toggleDecMode(scenePatternNode.id, i, dec)}
                        data-tip={dec.params.mode === 1 ? 'Switch to relative' : 'Switch to absolute key'}
                        data-tip-ja={dec.params.mode === 1 ? '相対モードに切替' : '絶対キーに切替'}
                      >{dec.params.mode === 1 ? 'ABS' : 'REL'}</button>
                      <Knob
                        value={decKnobValue(dec)}
                        label={dec.params.mode === 1 ? 'KEY' : 'SEMI'}
                        size={32}
                        steps={dec.params.mode === 1 ? 12 : 25}
                        displayValue={decKnobDisplay(dec)}
                        onchange={v => handleDecKnobChange(scenePatternNode.id, i, dec, v)}
                      />
                    </div>
                  {:else if dec.type === 'tempo'}
                    <div class="dec-card-body">
                      <Knob
                        value={decKnobValue(dec)}
                        label="BPM"
                        size={32}
                        steps={49}
                        displayValue={decKnobDisplay(dec)}
                        onchange={v => handleDecKnobChange(scenePatternNode.id, i, dec, v)}
                      />
                    </div>
                  {:else if dec.type === 'repeat'}
                    <div class="dec-card-body">
                      <Knob
                        value={decKnobValue(dec)}
                        label="COUNT"
                        size={32}
                        steps={16}
                        displayValue={decKnobDisplay(dec)}
                        onchange={v => handleDecKnobChange(scenePatternNode.id, i, dec, v)}
                      />
                    </div>
                  {:else if dec.type === 'fx'}
                    <div class="dec-card-body dec-fx-row">
                      {#each [['verb', 'VRB'], ['delay', 'DLY'], ['glitch', 'GLT'], ['granular', 'GRN']] as [key, label]}
                        <button
                          class="btn-toggle"
                          class:active={dec.params[key]}
                          onpointerdown={() => toggleDecFx(scenePatternNode.id, i, dec, key)}
                        >{label}</button>
                      {/each}
                    </div>
                  {:else if dec.type === 'automation'}
                    <div class="dec-card-body">
                      <span class="dec-auto-label">{decoratorLabel(dec)}</span>
                      <button class="btn-dec-edit" onpointerdown={() => { ui.editingAutomationDecorator = { nodeId: scenePatternNode.id, decoratorIndex: i } }}
                        data-tip="Edit automation curve" data-tip-ja="オートメーションカーブを編集"
                      >Edit curve</button>
                    </div>
                  {/if}
                </div>
              {/each}
              {#if !scenePatternNode.decorators?.length}
                <div class="dec-empty">No decorators</div>
              {/if}
            </div>
            <div class="section-divider" aria-hidden="true"></div>
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
            {#each song.tracks as _t, i}
              {@const c = activeCell(i)}
              <button
                class="track-btn"
                class:active={i === ui.selectedTrack}
                class:muted={_t.muted}
                onpointerdown={() => { ui.selectedTrack = i }}
                data-tip="Track {i + 1}: {c?.name ?? '—'} ({c?.voiceId ? (VOICE_LIST.find(v => v.id === c.voiceId)?.label ?? c.voiceId) : 'unassigned'})"
                data-tip-ja="トラック {i + 1}: {c?.name ?? '—'} ({c?.voiceId ? (VOICE_LIST.find(v => v.id === c.voiceId)?.label ?? c.voiceId) : '未割当'})"
              ><span class="track-num">{i + 1}</span><span class="track-voice">{c?.voiceId ? (VOICE_LIST.find(v => v.id === c.voiceId)?.label ?? '') : ''}</span></button>
            {/each}
          </div>

          {#if cell && track}

          <!-- Voice selector (collapsible) -->
          <button class="voice-current" onpointerdown={() => { voiceOpen = !voiceOpen; if (voiceOpen) presetOpen = false }}
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
                  onpointerdown={() => { changeVoice(ui.selectedTrack, v.id); voiceOpen = false; presetOpen = false }}
                  data-tip={v.id} data-tip-ja={v.id}
                ><span class="picker-cat-tag">{v.label}</span><span class="picker-name">{v.fullName}</span></button>
              {/each}
            </div>
          {/if}

          <!-- Preset browser -->
          {#if showPresets}
            <div class="preset-section">
              <div class="preset-header">
                <button class="voice-current" onpointerdown={() => { presetOpen = !presetOpen; if (presetOpen) voiceOpen = false }}
                  data-tip="Browse presets" data-tip-ja="プリセットを選択"
                >
                  <span class="voice-current-name">{currentPreset || 'PRESETS'}</span>
                  <span class="voice-current-arrow">{presetOpen ? '▾' : '▸'}</span>
                </button>
                {#if presetOpen}
                  <button class="btn-save-preset" onpointerdown={startSavePreset}
                    data-tip="Save current sound as preset" data-tip-ja="現在の音色をプリセットとして保存"
                  >SAVE</button>
                {/if}
              </div>
              {#if presetOpen}
                {#if saveMode}
                  <div class="preset-save-row">
                    <input
                      bind:this={saveInput}
                      class="preset-save-input"
                      type="text"
                      maxlength="16"
                      placeholder="Preset name"
                      bind:value={saveName}
                      onkeydown={(e) => { if (e.key === 'Enter') commitSavePreset(); if (e.key === 'Escape') cancelSavePreset() }}
                      onblur={cancelSavePreset}
                    />
                  </div>
                {/if}
                {#if presetCatsAll.length > 0}
                <div class="picker-cats">
                  <button class="cat-btn" class:active={presetCategory === null}
                    onpointerdown={() => presetCategory = null}>ALL</button>
                  {#each presetCatsAll as cat}
                    <button class="cat-btn" class:active={presetCategory === cat}
                      onpointerdown={() => presetCategory = cat}>{CATEGORY_LABELS[cat] ?? cat.toUpperCase()}</button>
                  {/each}
                </div>
                {/if}
                {#if recentPresets.length > 0}
                <div class="picker-recent">
                  <span class="picker-recent-label">RECENT</span>
                  {#each recentPresets as preset}
                    <button class="picker-recent-btn" class:selected={currentPreset === preset.name}
                      onpointerdown={() => selectPreset(preset)}
                    >{preset.name}</button>
                  {/each}
                </div>
                {/if}
                <div class="picker-list">
                  {#each presetListAll as preset}
                    {#if isUserPreset(preset) && renamingId === preset.id}
                      <div class="picker-item renaming">
                        {#if preset.category}<span class="picker-cat-tag">{CATEGORY_LABELS[preset.category] ?? preset.category.toUpperCase()}</span>{/if}
                        <input
                          bind:this={renameInput}
                          class="preset-rename-input"
                          type="text"
                          maxlength="16"
                          bind:value={renameName}
                          onkeydown={(e) => { if (e.key === 'Enter') commitRename(preset); if (e.key === 'Escape') cancelRename() }}
                          onblur={() => cancelRename()}
                        />
                      </div>
                    {:else}
                      <button class="picker-item" class:selected={currentPreset === preset.name}
                        onpointerdown={() => isUserPreset(preset) ? handlePresetTap(preset) : selectPreset(preset)}
                      >
                        {#if preset.category}<span class="picker-cat-tag">{CATEGORY_LABELS[preset.category] ?? preset.category.toUpperCase()}</span>{/if}
                        <span class="picker-name">{preset.name}</span>
                        {#if isUserPreset(preset)}
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <span class="preset-del" onpointerdown={(e) => { e.stopPropagation(); deletePreset(preset) }}
                            data-tip="Delete preset" data-tip-ja="プリセットを削除"
                          >✕</span>
                        {/if}
                      </button>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

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
                {@const isOn = (knobValue(p) ?? p.default) >= 0.5}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="mode-row" onpointerdown={() => knobChange(p, isOn ? 0 : 1)}
                  data-tip={p.tip} data-tip-ja={p.tipJa}>
                  <span class="mode-label">{isOn ? 'POLY (4-VOICE)' : 'MONO'}</span>
                  <span class="mode-switch" class:on={isOn}><span class="mode-switch-thumb"></span></span>
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
                    {#if cell?.voiceId === 'iDEATH' && p.group === 'osc'}
                      <WaveGraph position={cell.voiceParams.oscAPos ?? 0} />
                    {:else if cell?.voiceId === 'iDEATH' && p.group === 'env'}
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
  {/if}
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
    --dk-fs-xs: 8px;
    --dk-fs-sm: 9px;
    --dk-fs-md: 10px;
    --dk-fs-lg: 11px;

    position: relative;
    width: 280px;
    flex-shrink: 0;
    background: var(--color-fg);
    color: var(--color-bg);
    display: flex;
    flex-direction: column;
    border-left: 1px solid rgba(var(--dk-cream), 0.08);
    overflow: hidden;
    transition: width 120ms ease-out;
  }

  /* ── Minimized dock ── */
  .dock-panel.minimized {
    width: 16px;
  }

  /* ── Left-edge handle (border-line grip) ── */
  .dock-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 1;
  }
  .dock-handle:hover .handle-bar {
    background: rgba(var(--dk-cream), 0.35);
  }
  .handle-bar {
    width: 3px;
    height: 28px;
    border-radius: 1.5px;
    background: var(--dk-bg-active);
    transition: background 80ms;
  }
  .dock-panel.minimized .handle-bar {
    background: rgba(var(--dk-cream), 0.25);
  }

  /* ── Body ── */
  .dock-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* ── PARAM tab ── */
  .param-content {
    padding: 10px 12px 10px 16px;
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
  .btn-toggle {
    border: 1px solid rgba(var(--dk-cream), 0.25);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 3px 8px;
    cursor: pointer;
    min-width: 38px;
    height: 22px;
  }
  .btn-toggle.active {
    background: var(--dk-bg-active);
    color: rgba(var(--dk-cream), 0.9);
    border-color: var(--dk-text-dim);
  }

  /* ── Preset browser ── */
  .preset-section {
    margin-bottom: 8px;
  }
  .preset-header {
    display: flex;
    gap: 4px;
    align-items: stretch;
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
  .picker-recent {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 2px;
    flex-wrap: wrap;
  }
  .picker-recent-label {
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(var(--dk-cream), 0.25);
    margin-right: 2px;
  }
  .picker-recent-btn {
    border: 1px solid rgba(var(--dk-cream), 0.12);
    background: rgba(var(--dk-cream), 0.04);
    color: rgba(var(--dk-cream), 0.55);
    font-size: var(--dk-fs-xs);
    padding: 2px 6px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90px;
  }
  .picker-recent-btn:hover {
    background: var(--dk-bg-hover);
    color: rgba(var(--dk-cream), 0.8);
  }
  .picker-recent-btn.selected {
    background: rgba(108,119,68,0.2);
    color: rgba(var(--dk-cream), 0.9);
    border-color: rgba(108,119,68,0.4);
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
  .btn-save-preset {
    border: 1px solid rgba(108,119,68,0.5);
    background: transparent;
    color: var(--color-olive);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 2px 8px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 60ms, color 60ms;
  }
  .btn-save-preset:hover {
    background: rgba(108,119,68,0.15);
  }
  .btn-save-preset:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .preset-save-row {
    margin-top: 4px;
  }
  .preset-save-input {
    width: 100%;
    font-family: var(--font-data);
    font-size: var(--dk-fs-md);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(var(--dk-cream), 0.9);
    background: rgba(var(--dk-cream), 0.08);
    border: 1px solid var(--color-olive);
    padding: 4px 6px;
    outline: none;
    box-sizing: border-box;
  }
  .preset-del {
    font-size: 8px;
    color: rgba(var(--dk-cream), 0.3);
    flex-shrink: 0;
    padding: 2px 4px;
    cursor: pointer;
    transition: color 60ms;
  }
  .preset-del:hover {
    color: rgba(220, 80, 80, 0.8);
  }
  .picker-item.renaming {
    background: var(--dk-bg-hover);
  }
  .preset-rename-input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-data);
    font-size: var(--dk-fs-md);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(var(--dk-cream), 0.9);
    background: rgba(var(--dk-cream), 0.08);
    border: 1px solid var(--color-olive);
    padding: 2px 4px;
    outline: none;
    box-sizing: border-box;
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

  /* ── Decorator editor (ADR 069) ── */
  .dec-section {
    margin-bottom: 4px;
  }
  .dec-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .dec-add-wrapper {
    position: relative;
  }
  .btn-dec-add {
    border: 1px solid rgba(108,119,68,0.5);
    background: transparent;
    color: var(--color-olive);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    cursor: pointer;
  }
  .btn-dec-add:hover {
    background: rgba(108,119,68,0.15);
  }
  .dec-add-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 2px;
    background: var(--color-fg);
    border: 1px solid var(--dk-border-mid);
    z-index: 10;
    min-width: 100px;
    animation: dec-menu-in 80ms ease-out;
  }
  .dec-add-item {
    display: block;
    width: 100%;
    border: none;
    border-bottom: 1px solid var(--dk-bg-faint);
    background: transparent;
    color: var(--dk-text);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 5px 8px;
    text-align: left;
    cursor: pointer;
  }
  .dec-add-item:hover {
    background: var(--dk-bg-hover);
  }
  .dec-add-item:last-child {
    border-bottom: none;
  }
  .dec-card {
    border: 1px solid var(--dk-border);
    margin-bottom: 4px;
    padding: 4px 6px;
    animation: dec-card-in 120ms cubic-bezier(0.2, 0, 0, 1.3);
  }
  @keyframes dec-card-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .dec-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .dec-card-type {
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--dk-text-mid);
  }
  .dec-card-detach {
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: var(--dk-text-dim);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: color 60ms, background 60ms;
  }
  .dec-card-detach:hover {
    color: var(--dk-text);
    background: var(--dk-bg-hover);
  }
  .dec-card-body {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dec-fx-row {
    gap: 4px;
  }
  .dec-mode {
    font-size: var(--dk-fs-xs) !important;
    padding: 2px 6px !important;
    min-width: 30px !important;
    height: 18px !important;
  }
  .dec-auto-label {
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--dk-text-mid);
  }
  .btn-dec-edit {
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    cursor: pointer;
    transition: color 60ms, border-color 60ms;
  }
  .btn-dec-edit:hover {
    color: var(--dk-text);
    border-color: rgba(var(--dk-cream), 0.5);
  }
  .dec-empty {
    font-size: var(--dk-fs-sm);
    color: var(--dk-text-dim);
    font-style: italic;
    padding: 4px 0;
  }

  @keyframes dec-menu-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Mobile (ADR 069 Phase 3) ── */
  @media (max-width: 639px) {
    .dec-card {
      padding: 6px 8px;
      margin-bottom: 6px;
    }
    .dec-card-header {
      margin-bottom: 6px;
    }
    .dec-card-type {
      font-size: var(--dk-fs-sm);
    }
    .dec-card-detach {
      width: 28px;
      height: 28px;
      font-size: 16px;
    }
    .dec-card-body {
      gap: 10px;
    }
    .dec-mode {
      font-size: var(--dk-fs-sm) !important;
      padding: 4px 10px !important;
      min-width: 40px !important;
      height: 28px !important;
    }
    .dec-fx-row {
      gap: 6px;
    }
    .dec-fx-row .btn-toggle {
      padding: 6px 10px;
      font-size: var(--dk-fs-sm);
      min-width: 44px;
      height: 28px;
    }
    .btn-dec-add {
      font-size: var(--dk-fs-sm);
      padding: 4px 12px;
    }
    .dec-add-item {
      padding: 8px 10px;
      font-size: var(--dk-fs-md);
    }
    .btn-dec-edit {
      font-size: var(--dk-fs-sm);
      padding: 4px 12px;
    }
    .dec-auto-label {
      font-size: var(--dk-fs-md);
    }
  }

</style>
