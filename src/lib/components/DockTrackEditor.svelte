<script lang="ts">
  /**
   * Track parameter editor — voice picker, synth knobs, P-Lock, insert FX,
   * sample loader, remove track. (SEND/MIX moved to StepGrid)
   * Extracted from DockPanel.svelte for modularity.
   */
  import { song, activeCell, ui, samplesByCell, sampleCellKey, setSample, poolImportFiles } from '../state.svelte.ts'
  import type { VoiceId } from '../types.ts'
  import { clearAllParamLocks, changeVoice, setInsertFxType, setInsertFxFlavour, setInsertFxParam, removeTrack } from '../stepActions.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { VOICE_LIST, type VoiceCategory } from '../audio/dsp/voices.ts'
  import { engine } from '../audio/engine.ts'
  import Knob from './Knob.svelte'
  import DockPresetBrowser from './DockPresetBrowser.svelte'
  import DockPoolBrowser from './DockPoolBrowser.svelte'
  import EnvGraph from './EnvGraph.svelte'
  import WaveGraph from './WaveGraph.svelte'
  import AlgoGraph from './AlgoGraph.svelte'

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

  // ── Sample loader ──
  const MAX_SAMPLE_SIZE = 10 * 1024 * 1024
  let poolOpen = $state(false)
  $effect(() => { void ui.selectedTrack; poolOpen = false })
  let collapsedGroups = $state(new Set<string>())
  let fileInput = $state<HTMLInputElement>(null!)
  let waveformCanvas = $state<HTMLCanvasElement>(null!)
  let dropActive = $state(false)
  let sampleError = $state('')
  const currentSample = $derived(samplesByCell[sampleCellKey(ui.selectedTrack, ui.currentPattern)])

  async function loadSampleFile(file: File) {
    if (file.size > MAX_SAMPLE_SIZE) {
      sampleError = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 10 MB)`
      const msg = sampleError
      setTimeout(() => { if (sampleError === msg) sampleError = '' }, 3000)
      return
    }
    sampleError = ''
    const result = await engine.loadUserSample(ui.selectedTrack, file, ui.currentPattern)
    if (result) {
      setSample(ui.selectedTrack, ui.currentPattern, file.name, result.waveform, result.rawBuffer)
      // Also add to pool under user/ folder (fire-and-forget)
      void poolImportFiles([file], 'user')
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
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, 0, w, h)
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
      ctx.moveTo(x + 0.5, mid - max * mid)
      ctx.lineTo(x + 0.5, mid - min * mid)
    }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(237,232,220,0.15)'
    ctx.beginPath()
    ctx.moveTo(0, mid)
    ctx.lineTo(w, mid)
    ctx.stroke()
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

{#if cell && track}

<!-- Voice selector (floating dropdown) -->
<div class="voice-picker-wrap">
  <button class="voice-current" onpointerdown={() => { voiceOpen = !voiceOpen; if (voiceOpen) presetBrowserRef?.close() }}
    data-tip="Change instrument" data-tip-ja="楽器を変更">
    <span class="voice-current-name">{currentVoiceMeta?.fullName ?? cell.voiceId}</span>
    <span class="voice-current-arrow">{voiceOpen ? '▾' : '▸'}</span>
  </button>
  {#if voiceOpen}
    <div class="voice-dropdown">
      <div class="picker-cats">
        {#each CATEGORIES as cat}
          <button
            class="cat-btn"
            class:active={currentCat === cat.id}
            onpointerdown={() => { changeVoice(ui.selectedTrack, VOICE_LIST.find(v => v.category === cat.id)!.id as VoiceId); if (VOICE_LIST.filter(v => v.category === cat.id).length === 1) voiceOpen = false }}
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
    </div>
  {/if}
</div>

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
        data-tip="Load audio file from disk" data-tip-ja="ファイルからサンプルを読み込む"
      >LOAD</button>
      <button class="btn-load" class:btn-active={poolOpen}
        onpointerdown={() => poolOpen = !poolOpen}
        data-tip="Browse sample pool" data-tip-ja="サンプルプールから選択"
      >POOL</button>
      <span class="sample-name" class:sample-error={!!sampleError}>{sampleError || (currentSample?.packId ? '🎹 ' : '') + (currentSample?.name || '') || 'Drop audio file'}</span>
    </div>
    <canvas bind:this={waveformCanvas} class="waveform-canvas"></canvas>
    <input
      type="file"
      accept="audio/*"
      bind:this={fileInput}
      onchange={handleFileSelect}
      style="display: none"
    />
    {#if poolOpen}
      <div class="pool-dropdown">
        <DockPoolBrowser trackId={ui.selectedTrack} onclose={() => poolOpen = false} />
      </div>
    {/if}
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
    {#if p.key === 'reverse'}
      {@const isOn = (knobValue(p) ?? p.default) >= 0.5}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="mode-row" onpointerdown={() => knobChange(p, isOn ? 0 : 1)}
        data-tip={p.tip} data-tip-ja={p.tipJa}>
        <span class="mode-label">{isOn ? 'REVERSE' : 'FORWARD'}</span>
        <span class="mode-switch" class:on={isOn}><span class="mode-switch-thumb"></span></span>
      </div>
    {:else}
      {@const prevNormalIdx = params.findLastIndex((q, j) => j < i && q.key !== 'reverse')}
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
          size={36}
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
      <Knob value={insFx.mix} label="MIX" size={36} onchange={v => setInsertFxParam(ui.selectedTrack, 'mix', v)} />
    </span>
    <span data-tip={insFx.type === 'verb' ? 'Reverb size' : insFx.type === 'delay' ? 'Delay time' : 'S&H rate'}
          data-tip-ja={insFx.type === 'verb' ? 'リバーブサイズ' : insFx.type === 'delay' ? 'ディレイタイム' : 'S&Hレート'}>
      <Knob value={insFx.x} label={insFx.type === 'verb' ? 'SIZE' : insFx.type === 'delay' ? 'TIME' : 'RATE'} size={36} onchange={v => setInsertFxParam(ui.selectedTrack, 'x', v)} />
    </span>
    <span data-tip={insFx.type === 'verb' ? 'Reverb damping' : insFx.type === 'delay' ? 'Feedback amount' : 'Bit depth'}
          data-tip-ja={insFx.type === 'verb' ? 'リバーブダンピング' : insFx.type === 'delay' ? 'フィードバック量' : 'ビット深度'}>
      <Knob value={insFx.y} label={insFx.type === 'verb' ? 'DAMP' : insFx.type === 'delay' ? 'FB' : 'BITS'} size={36} onchange={v => setInsertFxParam(ui.selectedTrack, 'y', v)} />
    </span>
  </div>
{/if}

<div class="section-divider" aria-hidden="true"></div>
<button class="btn-danger"
  onclick={() => { if (confirm(`Remove track ${ui.selectedTrack + 1}?`)) removeTrack(ui.selectedTrack) }}
  data-tip="Remove this track" data-tip-ja="このトラックを削除"
>REMOVE TRACK</button>

{/if}

<style>
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
    font-size: var(--dk-fs-sm);
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
  /* ── Voice picker (floating dropdown) ── */
  .voice-picker-wrap {
    position: relative;
    z-index: 5;
  }
  .voice-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-fg);
    border: 1px solid rgba(var(--dk-cream), 0.2);
    border-top: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .picker-cats {
    display: flex;
    gap: 2px;
    padding: 4px;
    flex-wrap: wrap;
  }
  .cat-btn {
    flex: 1;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    font-size: var(--dk-fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 7px 6px;
    cursor: pointer;
  }
  .cat-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .picker-list {
    max-height: 200px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: none;
    border-bottom: 1px solid var(--dk-bg-faint);
    background: transparent;
    color: rgba(var(--dk-cream), 0.65);
    font-size: var(--dk-fs-md);
    padding: 7px 8px;
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
    background: var(--olive-bg);
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
    min-width: 32px;
    flex-shrink: 0;
  }
  .picker-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .voice-current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text);
    font-size: var(--dk-fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 8px 12px;
    cursor: pointer;
    margin-bottom: 6px;
    transition: border-color 80ms;
  }
  .voice-current:hover {
    border-color: var(--dk-border-mid);
  }
  .voice-current-name {
    text-transform: uppercase;
  }
  .voice-current-arrow {
    font-size: 10px;
    opacity: 0.4;
  }
  /* ── Sample loader ── */
  .sample-section {
    position: relative;
    z-index: 4;
    margin-bottom: 8px;
    border: 1px dashed var(--dk-border);
    padding: 6px;
    transition: border-color 80ms;
  }
  .pool-dropdown {
    position: absolute;
    top: 100%;
    left: -1px;
    right: -1px;
    background: var(--color-fg);
    border: 1px solid rgba(var(--dk-cream), 0.2);
    border-top: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    max-height: 360px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .sample-section.drop-active {
    border-color: var(--color-olive);
    background: var(--olive-bg-subtle);
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
    padding: 4px 10px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .btn-load:hover {
    color: rgba(var(--dk-cream), 0.9);
    border-color: rgba(var(--dk-cream), 0.5);
  }
  .btn-load.btn-active {
    background: rgba(var(--dk-cream), 0.12);
    color: rgba(var(--dk-cream), 0.9);
    border-color: var(--color-olive, #9fa780);
  }
  .sample-name {
    font-size: var(--dk-fs-sm);
    color: var(--dk-text-dim);
    overflow: hidden;
  }
  .sample-error {
    color: var(--color-danger);
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
    gap: 8px;
    padding: 6px 0;
  }
  .insert-select {
    flex: 1;
    font-size: var(--dk-fs-sm);
    padding: 5px 6px;
    border-radius: 0;
    border: 1px solid var(--border, #444);
    background: var(--bg-input, #1a1a1a);
    color: var(--fg, #eee);
    cursor: pointer;
  }
  .knob-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    padding: 6px 0;
  }
  .param-group-label {
    width: 100%;
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
    margin-top: 8px;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--dk-bg-active);
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .param-group-label:hover { color: var(--dk-text-mid); }
  .param-group-label.collapsed { margin-bottom: 0; }
  .group-chevron { font-size: 8px; line-height: 1; }
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dk-bg-active);
    margin: 10px 0;
  }
  .section-label {
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
    padding-bottom: 4px;
  }
  .btn-danger {
    width: 100%;
    padding: 6px 0;
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-danger);
    background: transparent;
    border: 1px solid var(--danger-border);
    border-radius: 0;
    cursor: pointer;
    transition: background 80ms, border-color 80ms;
  }
  .btn-danger:hover {
    background: var(--danger-bg-hover);
    border-color: var(--color-danger);
  }
</style>
