<script lang="ts">
  import { song, activeCell, ui, toggleDockMinimized, samplesByTrack, setSample } from '../state.svelte.ts'
  import { clearAllParamLocks, setTrackSend, applyPreset, changeVoice } from '../stepActions.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { hasPresets, getPresets, getPresetCategories, CATEGORY_LABELS, loadUserPresetsIntoCache, isUserPresetsLoaded, addUserPresetToCache, removeUserPresetFromCache, renameUserPresetInCache, type UserPreset } from '../presets.ts'
  import { saveUserPreset, deleteUserPreset, renameUserPreset } from '../storage.ts'
  import { VOICE_LIST, type VoiceCategory } from '../audio/dsp/voices.ts'
  import type { VoiceId } from '../state.svelte.ts'
  import { engine } from '../audio/engine.ts'
  import Knob from './Knob.svelte'

  const CATEGORIES: { id: VoiceCategory; label: string }[] = [
    { id: 'drum', label: 'DRUM' },
    { id: 'bass', label: 'BASS' },
    { id: 'lead', label: 'LEAD' },
    { id: 'sampler', label: 'SMPL' },
  ]

  const hasSelection = $derived(ui.selectedTrack >= 0)
  const track  = $derived(hasSelection ? song.tracks[ui.selectedTrack] : null)
  const TRACK_LABELS = song.tracks.map((_t, i) => `TR${i + 1}`)
  const cell   = $derived(hasSelection ? activeCell(ui.selectedTrack) : null)
  const currentCat = $derived(cell ? (VOICE_LIST.find(v => v.id === cell.voiceId)?.category ?? 'drum') : 'drum')
  const voicesInCat = $derived(VOICE_LIST.filter(v => v.category === currentCat))
  const params = $derived(cell ? getParamDefs(cell.voiceId) : [])
  const selTrig = $derived(cell && ui.selectedStep !== null ? cell.trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)
  const isSampler = $derived(cell?.voiceId === 'Sampler')
  const chopSlices = $derived(isSampler ? (cell?.voiceParams?.chopSlices ?? 0) : 0)

  // ── Preset browser ──
  const showPresets = $derived(cell ? hasPresets(cell.voiceId) : false)
  let presetCategory = $state<string | null>(null)
  let presetOpen = $state(false)
  // Reset category filter when voice changes
  $effect(() => { cell?.voiceId; presetCategory = null })
  // Track selected preset name per track (keyed by track index)
  let presetByTrack = $state<Record<number, string>>({})
  const currentPreset = $derived(presetByTrack[ui.selectedTrack] ?? '')
  function selectPreset(preset: { name: string; params: Record<string, number> }) {
    presetByTrack[ui.selectedTrack] = preset.name
    applyPreset(ui.selectedTrack, preset.params)
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
      presetByTrack[ui.selectedTrack] = name
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
    if (presetByTrack[ui.selectedTrack] === preset.name) {
      presetByTrack[ui.selectedTrack] = ''
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
      if (presetByTrack[ui.selectedTrack] === preset.name) {
        presetByTrack[ui.selectedTrack] = name.slice(0, 16)
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
          <!-- Track selector bar -->
          <div class="track-bar">
            {#each song.tracks as _t, i}
              <button
                class="track-btn"
                class:active={i === ui.selectedTrack}
                class:muted={_t.muted}
                onpointerdown={() => { ui.selectedTrack = i }}
              >{TRACK_LABELS[i]}</button>
            {/each}
          </div>

          {#if cell && track}
          <div class="selected-track-name">{cell.name}</div>

          <!-- Voice category + instrument selector -->
          <div class="voice-cats">
            {#each CATEGORIES as cat}
              <button
                class="voice-cat-btn"
                class:active={currentCat === cat.id}
                onpointerdown={() => changeVoice(ui.selectedTrack, VOICE_LIST.find(v => v.category === cat.id)!.id as VoiceId)}
                data-tip={cat.label} data-tip-ja={cat.label}
              >{cat.label}</button>
            {/each}
          </div>
          <div class="voice-list">
            {#each voicesInCat as v}
              <button
                class="voice-btn"
                class:active={cell.voiceId === v.id}
                onpointerdown={() => changeVoice(ui.selectedTrack, v.id)}
                data-tip={v.id} data-tip-ja={v.id}
              >{v.label}</button>
            {/each}
          </div>

          <!-- Preset browser -->
          {#if showPresets}
            <div class="preset-section">
              <div class="preset-header">
                <button class="preset-toggle" onpointerdown={() => presetOpen = !presetOpen}
                  data-tip="Browse presets" data-tip-ja="プリセットを選択"
                >{currentPreset ? currentPreset : 'PRESETS'} {presetOpen ? '▾' : '▸'}</button>
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
                <div class="preset-cats">
                  <button class="cat-btn" class:active={presetCategory === null}
                    onpointerdown={() => presetCategory = null}>ALL</button>
                  {#each presetCatsAll as cat}
                    <button class="cat-btn" class:active={presetCategory === cat}
                      onpointerdown={() => presetCategory = cat}>{CATEGORY_LABELS[cat] ?? cat.toUpperCase()}</button>
                  {/each}
                </div>
                {/if}
                <div class="preset-list">
                  {#each presetListAll as preset}
                    {#if isUserPreset(preset) && renamingId === preset.id}
                      <div class="preset-item renaming">
                        {#if preset.category}<span class="preset-cat-tag">{CATEGORY_LABELS[preset.category] ?? preset.category.toUpperCase()}</span>{/if}
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
                      <button class="preset-item" class:selected={currentPreset === preset.name}
                        onpointerdown={() => isUserPreset(preset) ? handlePresetTap(preset) : selectPreset(preset)}
                      >
                        {#if preset.category}<span class="preset-cat-tag">{CATEGORY_LABELS[preset.category] ?? preset.category.toUpperCase()}</span>{/if}
                        <span class="preset-name">{preset.name}</span>
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

          <div class="lock-row">
            <button
              class="btn-lock"
              class:active={ui.lockMode}
              onpointerdown={() => { ui.lockMode = !ui.lockMode; ui.selectedStep = null }}
              data-tip="Parameter lock mode" data-tip-ja="パラメーターロックモード"
            >LOCK</button>
            {#if ui.lockMode && ui.selectedStep !== null}
              <span class="lock-label">STEP{ui.selectedStep + 1}</span>
              <button class="btn-clr" class:hidden={!hasAnyLock} onpointerdown={() => clearAllParamLocks(ui.selectedTrack, ui.selectedStep!)}>CLR</button>
            {/if}
          </div>

          <!-- Synth param knobs (multi-row grid) -->
          <div class="knob-grid">
            {#each params as p, i}
              {#if p.key === 'polyMode'}
                <button
                  class="btn-toggle"
                  class:active={(knobValue(p) ?? p.default) >= 0.5}
                  onpointerdown={() => knobChange(p, (knobValue(p) ?? p.default) >= 0.5 ? 0 : 1)}
                  data-tip={p.tip} data-tip-ja={p.tipJa}
                >{(knobValue(p) ?? p.default) >= 0.5 ? 'POLY' : 'MONO'}</button>
              {:else if p.key === 'reverse'}
                <button
                  class="btn-toggle"
                  class:active={(knobValue(p) ?? p.default) >= 0.5}
                  onpointerdown={() => knobChange(p, (knobValue(p) ?? p.default) >= 0.5 ? 0 : 1)}
                  data-tip={p.tip} data-tip-ja={p.tipJa}
                >{(knobValue(p) ?? p.default) >= 0.5 ? 'REV' : 'FWD'}</button>
              {:else}
                {#if p.group && (i === 0 || p.group !== params[i - 1].group)}
                  {@const groupLabels: Record<string, string> = { tone: 'OSC', noise: 'NOISE', metal: 'METAL', amp: 'AMP', filter: 'FILTER', env: 'ENV', arp: 'ARP', osc: 'OSC', lfo: 'LFO', sample: 'SAMPLE', chop: 'CHOP', sync: 'SYNC' }}
                  <div class="param-group-label">{groupLabels[p.group] ?? p.group.toUpperCase()}</div>
                {/if}
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
            {/each}
          </div>

          <!-- Send knobs -->
          <div class="section-divider" aria-hidden="true"></div>
          <div class="section-label">SEND</div>
          <div class="knob-grid">
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

          <!-- Mixer knobs -->
          <div class="section-divider" aria-hidden="true"></div>
          <div class="section-label">MIXER</div>
          <div class="knob-grid">
            <span data-tip="Track volume" data-tip-ja="トラック音量">
              <Knob value={track.volume} label="VOL" size={32} onchange={v => { song.tracks[ui.selectedTrack].volume = v }} />
            </span>
            <span data-tip="Stereo panning" data-tip-ja="ステレオパン">
              <Knob value={(track.pan + 1) / 2} label="PAN" size={32} onchange={v => { song.tracks[ui.selectedTrack].pan = v * 2 - 1 }} />
            </span>
          </div>
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
  .track-bar {
    display: flex;
    gap: 2px;
    margin-bottom: 8px;
  }
  .track-btn {
    flex: 1;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 4px 0;
    text-align: center;
  }
  .track-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .track-btn.muted:not(.active) {
    opacity: 0.35;
  }

  .selected-track-name {
    font-size: var(--dk-fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dk-text);
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .lock-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
  }
  .btn-lock {
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    white-space: nowrap;
    text-transform: uppercase;
  }
  .btn-lock.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .lock-label {
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    white-space: nowrap;
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
  .btn-clr.hidden { visibility: hidden; }
  .btn-clr:active {
    background: rgba(var(--dk-cream), 0.15);
    color: var(--dk-text);
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
  .preset-toggle {
    border: 1px solid rgba(var(--dk-cream), 0.2);
    background: transparent;
    color: var(--dk-text-mid);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    flex: 1;
    text-align: left;
    cursor: pointer;
  }
  .preset-toggle:hover {
    color: rgba(var(--dk-cream), 0.8);
    border-color: rgba(var(--dk-cream), 0.35);
  }
  .preset-cats {
    display: flex;
    gap: 2px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .cat-btn {
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 5px;
    cursor: pointer;
  }
  .cat-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .preset-list {
    max-height: 160px;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin-top: 4px;
    border: 1px solid rgba(var(--dk-cream), 0.1);
  }
  .preset-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    border: none;
    border-bottom: 1px solid var(--dk-bg-faint);
    background: transparent;
    color: rgba(var(--dk-cream), 0.65);
    font-size: var(--dk-fs-md);
    padding: 4px 6px;
    text-align: left;
    cursor: pointer;
  }
  .preset-item:hover {
    background: var(--dk-bg-hover);
    color: rgba(var(--dk-cream), 0.9);
  }
  .preset-item:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .preset-item.selected {
    background: rgba(108,119,68,0.2);
    color: rgba(var(--dk-cream), 0.95);
  }
  .preset-item.selected .preset-cat-tag {
    color: var(--color-olive);
  }
  .preset-cat-tag {
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(var(--dk-cream), 0.35);
    width: 28px;
    flex-shrink: 0;
  }
  .preset-name {
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
  .preset-item.renaming {
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
  .voice-cats {
    display: flex;
    gap: 2px;
    margin-bottom: 4px;
  }
  .voice-cat-btn {
    flex: 1;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 4px 0;
    cursor: pointer;
  }
  .voice-cat-btn.active {
    background: var(--dk-bg-hover);
    border-color: var(--color-olive);
    color: var(--color-olive);
  }
  .voice-cat-btn:hover:not(.active) {
    color: rgba(var(--dk-cream), 0.7);
    border-color: var(--dk-border-mid);
  }
  .voice-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-bottom: 8px;
  }
  .voice-btn {
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 3px 5px;
    cursor: pointer;
    min-width: 0;
  }
  .voice-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .voice-btn:hover:not(.active) {
    color: rgba(var(--dk-cream), 0.7);
    border-color: var(--dk-border-mid);
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

</style>
