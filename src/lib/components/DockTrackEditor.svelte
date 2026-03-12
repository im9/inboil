<script lang="ts">
  /**
   * Track parameter editor — voice picker, synth knobs, P-Lock, insert FX,
   * send/mix, sample loader, remove track.
   * Extracted from DockPanel.svelte for modularity.
   */
  import { song, activeCell, ui, samplesByTrack, setSample } from '../state.svelte.ts'
  import type { VoiceId } from '../types.ts'
  import { clearAllParamLocks, setTrackSend, changeVoice, removeTrack, setInsertFxType, setInsertFxFlavour, setInsertFxParam } from '../stepActions.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { VOICE_LIST, type VoiceCategory } from '../audio/dsp/voices.ts'
  import { engine } from '../audio/engine.ts'
  import Knob from './Knob.svelte'
  import DockPresetBrowser from './DockPresetBrowser.svelte'
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

  // ── Track delete (2-step confirm) ──
  let confirmDelete = $state(false)
  $effect(() => { void ui.selectedTrack; confirmDelete = false })

  function handleDeleteTrack() {
    if (confirmDelete) {
      removeTrack(ui.selectedTrack)
      confirmDelete = false
    } else {
      confirmDelete = true
    }
  }

  // ── Sample loader ──
  const MAX_SAMPLE_SIZE = 10 * 1024 * 1024
  let collapsedGroups = $state(new Set<string>())
  let fileInput = $state<HTMLInputElement>(null!)
  let waveformCanvas = $state<HTMLCanvasElement>(null!)
  let dropActive = $state(false)
  let sampleError = $state('')
  const currentSample = $derived(samplesByTrack[ui.selectedTrack])

  async function loadSampleFile(file: File) {
    if (file.size > MAX_SAMPLE_SIZE) {
      sampleError = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 10 MB)`
      const msg = sampleError
      setTimeout(() => { if (sampleError === msg) sampleError = '' }, 3000)
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
          ? ['MONO', 'POLY 16', 'WIDE 8', 'UNISON']
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

<!-- Remove track -->
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

<style>
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
  /* ── Voice picker ── */
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
  /* ── Sample loader ── */
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
</style>
