<script lang="ts">
  // NOTE: Large file by design — sample/FX/param sections all operate on same cell+track
  /**
   * Track parameter editor — voice picker, synth knobs, P-Lock, insert FX,
   * sample loader, remove track. (SEND/MIX moved to StepGrid)
   * Extracted from DockPanel.svelte for modularity.
   */
  import { song, activeCell, ui, samplesByCell, sampleCellKey, setSample, poolImportFiles } from '../state.svelte.ts'
  import { captureValue } from '../sweepRecorder.svelte.ts'
  import { clearAllParamLocks, setInsertFxType, setInsertFxFlavour, setInsertFxParam, removeTrack } from '../stepActions.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { engine } from '../audio/engine.ts'
  import { drawWaveform } from '../domHelpers.ts'
  import Knob from './Knob.svelte'
  import VoicePicker from './VoicePicker.svelte'
  import DockPresetBrowser from './DockPresetBrowser.svelte'
  import DockPoolBrowser from './DockPoolBrowser.svelte'
  import ConfirmModal from './ConfirmModal.svelte'
  import EnvGraph from './EnvGraph.svelte'
  import WaveGraph from './WaveGraph.svelte'
  import AlgoGraph from './AlgoGraph.svelte'

  const hasSelection = $derived(ui.selectedTrack >= 0)
  const track  = $derived(hasSelection ? song.tracks[ui.selectedTrack] : null)
  const cell   = $derived(hasSelection ? activeCell(ui.selectedTrack) : null)
  const params = $derived(cell ? getParamDefs(cell.voiceId) : [])
  const selTrig = $derived(cell && ui.selectedStep !== null ? cell.trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)
  const isSampler = $derived(cell?.voiceId === 'Sampler')
  const chopSlices = $derived(isSampler ? (cell?.voiceParams?.chopSlices ?? 0) : 0)

  // ADR 131: Pads merged into Grid — no auto-switch needed

  // ── Voice picker ──
  let voicePickerRef = $state<VoicePicker>(null!)
  let presetBrowserRef = $state<DockPresetBrowser>(null!)
  let confirmRef = $state<ConfirmModal>(null!)

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

  $effect(() => {
    if (waveformCanvas && currentSample?.waveform) {
      drawWaveform(waveformCanvas, currentSample.waveform, chopSlices)
    }
  })
</script>

{#if cell && track}

<!-- Voice selector (floating dropdown) -->
<VoicePicker bind:this={voicePickerRef} voiceId={cell.voiceId} trackId={ui.selectedTrack}
  onselect={() => presetBrowserRef?.close()} />

<!-- Preset browser -->
<DockPresetBrowser bind:this={presetBrowserRef} onopen={() => { voicePickerRef?.close() }} />

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
          onchange={v => { knobChange(p, v); captureValue({ kind: 'track', trackId: ui.selectedTrack, param: p.key as 'cutoff' }, v) }}
        />
      </span>
      {/if}
    {/if}
  {/each}
</div>

<!-- Insert FX (ADR 077/114: dual chain) -->
<div class="section-divider" aria-hidden="true"></div>
<div class="section-label">INSERT FX</div>
{@const hasAnyFx = !!cell.insertFx?.[0]?.type || !!cell.insertFx?.[1]?.type}
{#each [0, 1] as slot}
  {#if slot === 0 || hasAnyFx}
    {@const insFx = cell.insertFx?.[slot as 0 | 1] ?? null}
    <div class="insert-fx-row">
      {#if hasAnyFx}<span class="insert-slot-label">{slot + 1}</span>{/if}
      <select
        class="insert-select"
        value={insFx?.type ?? ''}
        onchange={e => {
          const v = (e.target as HTMLSelectElement).value
          setInsertFxType(ui.selectedTrack, slot as 0 | 1, v === '' ? null : v as 'verb' | 'delay' | 'glitch' | 'dist')
        }}
        data-tip="Insert FX slot {slot + 1} type" data-tip-ja="インサートFX スロット{slot + 1} タイプ"
      >
        <option value="">OFF</option>
        <option value="verb">REVERB</option>
        <option value="delay">DELAY</option>
        <option value="glitch">GLITCH</option>
        <option value="dist">DIST</option>
      </select>
      {#if insFx?.type === 'verb'}
        <select
          class="insert-select"
          value={insFx.flavour}
          onchange={e => setInsertFxFlavour(ui.selectedTrack, slot as 0 | 1, (e.target as HTMLSelectElement).value)}
          data-tip="Reverb flavour" data-tip-ja="リバーブフレーバー"
        >
          <option value="room">Room</option>
          <option value="hall">Hall</option>
        </select>
      {:else if insFx?.type === 'delay'}
        <select
          class="insert-select"
          value={insFx.flavour}
          onchange={e => setInsertFxFlavour(ui.selectedTrack, slot as 0 | 1, (e.target as HTMLSelectElement).value)}
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
          onchange={e => setInsertFxFlavour(ui.selectedTrack, slot as 0 | 1, (e.target as HTMLSelectElement).value)}
          data-tip="Glitch flavour" data-tip-ja="グリッチフレーバー"
        >
          <option value="bitcrush">Bitcrush</option>
          <option value="redux">Redux</option>
        </select>
      {:else if insFx?.type === 'dist'}
        <select
          class="insert-select"
          value={insFx.flavour}
          onchange={e => setInsertFxFlavour(ui.selectedTrack, slot as 0 | 1, (e.target as HTMLSelectElement).value)}
          data-tip="Distortion flavour" data-tip-ja="ディストーションフレーバー"
        >
          <option value="overdrive">Overdrive</option>
          <option value="fuzz">Fuzz</option>
        </select>
      {/if}
    </div>
    {#if insFx?.type}
      <div class="knob-grid">
        <span data-tip="Insert {slot + 1} dry/wet mix" data-tip-ja="インサート{slot + 1} ドライ/ウェット">
          <Knob value={insFx.mix} label="MIX" size={36} onchange={v => setInsertFxParam(ui.selectedTrack, slot as 0 | 1, 'mix', v)} />
        </span>
        <span data-tip={insFx.type === 'verb' ? 'Reverb size' : insFx.type === 'delay' ? 'Delay time' : insFx.type === 'dist' ? 'Drive amount' : 'S&H rate'}
              data-tip-ja={insFx.type === 'verb' ? 'リバーブサイズ' : insFx.type === 'delay' ? 'ディレイタイム' : insFx.type === 'dist' ? 'ドライブ量' : 'S&Hレート'}>
          <Knob value={insFx.x} label={insFx.type === 'verb' ? 'SIZE' : insFx.type === 'delay' ? 'TIME' : insFx.type === 'dist' ? 'DRIVE' : 'RATE'} size={36} onchange={v => setInsertFxParam(ui.selectedTrack, slot as 0 | 1, 'x', v)} />
        </span>
        <span data-tip={insFx.type === 'verb' ? 'Reverb damping' : insFx.type === 'delay' ? 'Feedback amount' : insFx.type === 'dist' ? 'Tone (dark–bright)' : 'Bit depth'}
              data-tip-ja={insFx.type === 'verb' ? 'リバーブダンピング' : insFx.type === 'delay' ? 'フィードバック量' : insFx.type === 'dist' ? 'トーン（ダーク〜ブライト）' : 'ビット深度'}>
          <Knob value={insFx.y} label={insFx.type === 'verb' ? 'DAMP' : insFx.type === 'delay' ? 'FB' : insFx.type === 'dist' ? 'TONE' : 'BITS'} size={36} onchange={v => setInsertFxParam(ui.selectedTrack, slot as 0 | 1, 'y', v)} />
        </span>
      </div>
    {/if}
  {/if}
{/each}

<div class="section-divider" aria-hidden="true"></div>
<button class="btn-danger"
  onclick={() => confirmRef.ask(`Remove track ${ui.selectedTrack + 1}?`, () => removeTrack(ui.selectedTrack))}
  data-tip="Remove this track" data-tip-ja="このトラックを削除"
>REMOVE TRACK</button>

<ConfirmModal bind:this={confirmRef} />

{/if}

<style>
  .lock-step {
    font-size: var(--fs-md);
    color: var(--color-olive);
    letter-spacing: 0.06em;
  }
  .lock-hint {
    font-size: var(--fs-md);
    opacity: 0.45;
    font-weight: 400;
    letter-spacing: 0.04em;
  }
  .btn-clr {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-text-mid);
    background: transparent;
    border: 1px solid var(--dz-border-mid);
    padding: 1px 5px;
    line-height: 14px;
  }
  .btn-clr:active {
    background: var(--dz-bg-press);
    color: var(--dz-text-strong);
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
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-text-mid);
  }
  .mode-switch {
    margin-left: auto;
    width: 28px;
    height: 14px;
    border-radius: var(--radius-md);
    background: var(--dz-bg-press);
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
    background: var(--dz-text);
    transition: left 100ms;
  }
  .mode-switch.on .mode-switch-thumb {
    left: 16px;
    background: var(--color-bg);
  }
  /* ── Sample loader ── */
  .sample-section {
    position: relative;
    z-index: 4;
    margin-bottom: 8px;
    border: 1px dashed var(--dz-border);
    padding: 6px;
    transition: border-color 80ms;
  }
  .pool-dropdown {
    position: absolute;
    top: 100%;
    left: -1px;
    right: -1px;
    background: var(--color-fg);
    border: 1px solid var(--dz-border);
    border-top: none;
    box-shadow: 0 4px 12px var(--lz-text-hint);
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
    border: 1px solid var(--dz-border-strong);
    background: transparent;
    color: var(--dz-text-mid);
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 4px 10px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .btn-load:hover {
    color: var(--dz-text-bright);
    border-color: var(--dz-transport-border);
  }
  .btn-load.btn-active {
    background: var(--dz-bg-active);
    color: var(--dz-text-bright);
    border-color: var(--color-olive, #9fa780);
  }
  .sample-name {
    font-size: var(--fs-lg);
    color: var(--dz-text-dim);
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
    align-items: center;
  }
  .insert-slot-label {
    font-size: var(--fs-lg);
    color: var(--dz-text-dim);
    min-width: 1em;
    text-align: center;
  }
  .insert-select {
    flex: 1;
    font-size: var(--fs-lg);
    padding: 5px 6px;
    border-radius: 0;
    border: 1px solid var(--dz-border);
    background: var(--dz-divider);
    color: var(--dz-text-strong);
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
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dz-text-dim);
    margin-top: 8px;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--dz-bg-active);
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .param-group-label:hover { color: var(--dz-text-mid); }
  .param-group-label.collapsed { margin-bottom: 0; }
  .group-chevron { font-size: var(--fs-min); line-height: 1; }
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dz-bg-active);
    margin: 10px 0;
  }
  .section-label {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dz-text-dim);
    padding-bottom: 4px;
  }
  .btn-danger {
    width: 100%;
    padding: 6px 0;
    font-size: var(--fs-md);
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
