<script lang="ts">
  import { song, activeCell, ui, samplesByTrack, setSample } from '../state.svelte.ts'
  import type { VoiceId } from '../types.ts'
  import { setTrackSend, clearAllParamLocks, toggleMute, toggleSolo, changeVoice, setInsertFxType, setInsertFxFlavour, setInsertFxParam } from '../stepActions.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { VOICE_LIST, type VoiceCategory } from '../audio/dsp/voices.ts'
  import { engine } from '../audio/engine.ts'
  import { isGuest, guestSetParam } from '../multiDevice/guest.ts'
  import { fade, fly } from 'svelte/transition'
  import Knob from './Knob.svelte'

  const CATEGORIES: { id: VoiceCategory; label: string }[] = [
    { id: 'drum', label: 'DRUM' },
    { id: 'synth', label: 'SYNTH' },
    { id: 'sampler', label: 'SMPL' },
  ]

  function setParam(key: string, v: number) {
    if (isGuest()) { guestSetParam(ui.selectedTrack, key, v); return }
    ;(song.tracks[ui.selectedTrack] as unknown as Record<string, unknown>)[key] = v
  }

  const track = $derived(song.tracks[ui.selectedTrack])
  const cell   = $derived(activeCell(ui.selectedTrack))
  const params = $derived(getParamDefs(cell.voiceId))
  const selTrig = $derived(ui.selectedStep !== null ? activeCell(ui.selectedTrack).trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)
  const isSampler = $derived(cell?.voiceId === 'Sampler')
  const chopSlices = $derived(isSampler ? (cell?.voiceParams?.chopSlices ?? 0) : 0)

  // ── Voice picker ──
  let voiceOpen = $state(false)
  $effect(() => { void ui.selectedTrack; voiceOpen = false })
  const currentCat = $derived(cell?.voiceId ? (VOICE_LIST.find(v => v.id === cell.voiceId)?.category ?? 'drum') : 'drum')
  const voicesInCat = $derived(VOICE_LIST.filter(v => v.category === currentCat))
  const currentVoiceMeta = $derived(cell?.voiceId ? VOICE_LIST.find(v => v.id === cell.voiceId) : null)

  // ── Collapsible param groups ──
  let collapsedGroups = $state(new Set<string>())

  // ── Sample loader ──
  const MAX_SAMPLE_SIZE = 10 * 1024 * 1024
  let fileInput = $state<HTMLInputElement>(null!)
  let waveformCanvas = $state<HTMLCanvasElement>(null!)
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

  function close() { ui.mobileOverlay = false }

  // Swipe down to dismiss
  let touchStartY = 0
  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY
  }
  function onTouchEnd(e: TouchEvent) {
    const dy = e.changedTouches[0].clientY - touchStartY
    if (dy > 80) close()
  }
</script>

{#if ui.mobileOverlay}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay-backdrop" transition:fade={{ duration: 120 }} onpointerdown={(e) => { if (e.target === e.currentTarget) close() }} ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
  <div class="overlay-card" transition:fly={{ y: 60, duration: 120 }}>
    <!-- Drag handle -->
    <div class="overlay-handle">
      <span class="handle-pill"></span>
    </div>

    <!-- Lock toolbar -->
    <div class="lock-toolbar">
      <button
        class="btn-lock"
        class:active={ui.lockMode}
        onpointerdown={() => { ui.lockMode = !ui.lockMode; ui.selectedStep = null }}
      >LOCK</button>
      {#if ui.lockMode && ui.selectedStep !== null}
        <span class="lock-label">STEP {ui.selectedStep + 1}</span>
        {#if hasAnyLock}
          <button class="btn-clr" onpointerdown={() => clearAllParamLocks(ui.selectedTrack, ui.selectedStep!)}>CLR</button>
        {/if}
      {/if}
      <span class="toolbar-spacer"></span>
      <button
        class="btn-solo"
        class:active={ui.soloTracks.has(ui.selectedTrack)}
        onpointerdown={() => toggleSolo(ui.selectedTrack)}
      >SOLO</button>
      <button
        class="btn-mute"
        class:muted={track.muted}
        onpointerdown={() => toggleMute(ui.selectedTrack)}
      >MUTE</button>
    </div>

    <!-- Scrollable content area -->
    <div class="overlay-content">

      <!-- Voice picker -->
      <button class="voice-current" onpointerdown={() => { voiceOpen = !voiceOpen }}>
        <span class="voice-name">{currentVoiceMeta?.fullName ?? cell.voiceId}</span>
        <span class="voice-arrow">{voiceOpen ? '▾' : '▸'}</span>
      </button>
      {#if voiceOpen}
        <div class="picker-cats">
          {#each CATEGORIES as cat}
            <button
              class="cat-btn"
              class:active={currentCat === cat.id}
              onpointerdown={() => changeVoice(ui.selectedTrack, VOICE_LIST.find(v => v.category === cat.id)!.id as VoiceId)}
            >{cat.label}</button>
          {/each}
        </div>
        <div class="picker-list">
          {#each voicesInCat as v}
            <button
              class="picker-item"
              class:selected={cell.voiceId === v.id}
              onpointerdown={() => { changeVoice(ui.selectedTrack, v.id); voiceOpen = false }}
            ><span class="picker-tag">{v.label}</span><span class="picker-name">{v.fullName}</span></button>
          {/each}
        </div>
      {/if}

      <!-- Sample loader -->
      {#if isSampler}
        <div class="sample-section">
          <div class="sample-file-row">
            <button class="btn-load" onpointerdown={() => fileInput.click()}>LOAD</button>
            <span class="sample-name" class:sample-error={!!sampleError}>{sampleError || currentSample?.name || 'Tap LOAD to select audio'}</span>
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

      <!-- Synth params (all groups with collapse headers) -->
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
            <div class="mode-row" onpointerdown={() => knobChange(p, (modeVal + 1) % (maxMode + 1))}>
              <span class="mode-label">{modeLabels[modeVal] ?? 'MONO'}</span>
              <span class="mode-switch" class:on={modeVal >= 1}><span class="mode-thumb"></span></span>
            </div>
          {:else if p.key === 'reverse'}
            {@const isOn = (knobValue(p) ?? p.default) >= 0.5}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="mode-row" onpointerdown={() => knobChange(p, isOn ? 0 : 1)}>
              <span class="mode-label">{isOn ? 'REVERSE' : 'FORWARD'}</span>
              <span class="mode-switch" class:on={isOn}><span class="mode-thumb"></span></span>
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
            {/if}
            {#if !collapsedGroups.has(p.group ?? '')}
              <Knob
                value={normalizeParam(p, knobValue(p))}
                label={p.label}
                size={48}
                locked={isParamLocked(p.key)}
                steps={paramSteps(p)}
                displayValue={displayLabel(p, knobValue(p))}
                onchange={v => knobChange(p, v)}
              />
            {/if}
          {/if}
        {/each}
      </div>

      <!-- Insert FX -->
      <div class="section-divider"></div>
      <div class="section-label">INSERT FX</div>
      <div class="insert-fx-row">
        <select
          class="insert-select"
          value={cell.insertFx?.type ?? ''}
          onchange={e => {
            const v = (e.target as HTMLSelectElement).value
            setInsertFxType(ui.selectedTrack, v === '' ? null : v as 'verb' | 'delay' | 'glitch')
          }}
        >
          <option value="">OFF</option>
          <option value="verb">REVERB</option>
          <option value="delay">DELAY</option>
          <option value="glitch">GLITCH</option>
        </select>
        {#if cell.insertFx?.type === 'verb'}
          <select class="insert-select" value={cell.insertFx.flavour}
            onchange={e => setInsertFxFlavour(ui.selectedTrack, (e.target as HTMLSelectElement).value)}>
            <option value="room">Room</option>
            <option value="hall">Hall</option>
          </select>
        {:else if cell.insertFx?.type === 'delay'}
          <select class="insert-select" value={cell.insertFx.flavour}
            onchange={e => setInsertFxFlavour(ui.selectedTrack, (e.target as HTMLSelectElement).value)}>
            <option value="digital">Digital</option>
            <option value="dotted">Dotted</option>
            <option value="tape">Tape</option>
          </select>
        {:else if cell.insertFx?.type === 'glitch'}
          <select class="insert-select" value={cell.insertFx.flavour}
            onchange={e => setInsertFxFlavour(ui.selectedTrack, (e.target as HTMLSelectElement).value)}>
            <option value="bitcrush">Bitcrush</option>
            <option value="redux">Redux</option>
          </select>
        {/if}
      </div>
      {#if cell.insertFx?.type}
        <div class="knob-grid">
          <Knob value={cell.insertFx.mix} label="MIX" size={48} onchange={v => setInsertFxParam(ui.selectedTrack, 'mix', v)} />
          <Knob value={cell.insertFx.x} label={cell.insertFx.type === 'verb' ? 'SIZE' : cell.insertFx.type === 'delay' ? 'TIME' : 'RATE'} size={48} onchange={v => setInsertFxParam(ui.selectedTrack, 'x', v)} />
          <Knob value={cell.insertFx.y} label={cell.insertFx.type === 'verb' ? 'DAMP' : cell.insertFx.type === 'delay' ? 'FB' : 'BITS'} size={48} onchange={v => setInsertFxParam(ui.selectedTrack, 'y', v)} />
        </div>
      {/if}

      <!-- Send / Mix -->
      <div class="section-divider"></div>
      <div class="section-label">SEND / MIX</div>
      <div class="knob-grid">
        <Knob value={track.volume} label="VOL" size={48} onchange={v => setParam('volume', v)} />
        <Knob value={(track.pan + 1) / 2} label="PAN" size={48} onchange={v => setParam('pan', v * 2 - 1)} />
        <Knob value={cell.reverbSend} label="VERB" size={48} onchange={v => setTrackSend(ui.selectedTrack, 'reverbSend', v)} />
        <Knob value={cell.delaySend} label="DLY" size={48} onchange={v => setTrackSend(ui.selectedTrack, 'delaySend', v)} />
        <Knob value={cell.glitchSend} label="GLT" size={48} onchange={v => setTrackSend(ui.selectedTrack, 'glitchSend', v)} />
        <Knob value={cell.granularSend} label="GRN" size={48} onchange={v => setTrackSend(ui.selectedTrack, 'granularSend', v)} />
      </div>

    </div>

    <!-- Track dots -->
    <div class="track-dots">
      {#each song.tracks as _t, i}
        <button
          class="dot"
          class:active={i === ui.selectedTrack}
          onpointerdown={() => { ui.selectedTrack = i }}
          aria-label="Track {i + 1}"
        ></button>
      {/each}
    </div>
  </div>
</div>
{/if}

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: flex-end;
  }
  .overlay-card {
    --dk-cream: 237,232,220;
    --dk-text: rgba(var(--dk-cream), 0.85);
    --dk-text-mid: rgba(var(--dk-cream), 0.55);
    --dk-text-dim: rgba(var(--dk-cream), 0.4);
    --dk-border: rgba(var(--dk-cream), 0.15);
    --dk-border-mid: rgba(var(--dk-cream), 0.3);
    --dk-bg-hover: rgba(var(--dk-cream), 0.08);
    --dk-bg-faint: rgba(var(--dk-cream), 0.06);
    --dk-bg-active: rgba(var(--dk-cream), 0.12);

    width: 100%;
    background: var(--color-fg);
    border-radius: 12px 12px 0 0;
    display: flex;
    flex-direction: column;
    height: calc(100dvh - 180px);
    overflow: hidden;
  }

  /* ── Handle ── */
  .overlay-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 0 4px;
    flex-shrink: 0;
  }
  .handle-pill {
    width: 32px;
    height: 4px;
    border-radius: 2px;
    background: rgba(var(--dk-cream), 0.25);
  }

  /* ── Lock toolbar ── */
  .lock-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 8px;
    flex-shrink: 0;
  }
  .toolbar-spacer { flex: 1; }
  .btn-lock {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dk-text-dim);
    background: transparent;
    border: 1px solid var(--dk-border);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-lock.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .lock-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    white-space: nowrap;
  }
  .btn-clr {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dk-text-mid);
    background: transparent;
    border: 1px solid var(--dk-border);
    padding: 1px 5px;
    line-height: 14px;
  }
  .btn-clr:active {
    background: var(--dk-bg-active);
    color: var(--dk-text);
  }
  .btn-solo {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dk-text-dim);
    background: transparent;
    border: 1px solid var(--dk-border);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-solo.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .btn-mute {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dk-text-dim);
    background: transparent;
    border: 1px solid var(--dk-border);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-mute.muted {
    background: var(--color-salmon);
    border-color: var(--color-salmon);
    color: var(--color-bg);
  }

  /* ── Scrollable content ── */
  .overlay-content {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 0 12px 12px;
    min-height: 0;
  }

  /* ── Voice picker ── */
  .voice-current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 8px 10px;
    margin-bottom: 6px;
  }
  .voice-name {
    text-transform: uppercase;
  }
  .voice-arrow {
    font-size: 9px;
    opacity: 0.4;
  }
  .picker-cats {
    display: flex;
    gap: 2px;
    margin-bottom: 4px;
  }
  .cat-btn {
    flex: 1;
    border: 1px solid var(--dk-border);
    background: transparent;
    color: var(--dk-text-dim);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 7px 5px;
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
    margin-bottom: 8px;
    border: 1px solid var(--dk-bg-faint);
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
    font-size: 12px;
    padding: 8px;
    text-align: left;
  }
  .picker-item:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .picker-item.selected {
    background: rgba(108,119,68,0.2);
    color: rgba(var(--dk-cream), 0.95);
  }
  .picker-item.selected .picker-tag {
    color: var(--color-olive);
  }
  .picker-tag {
    font-size: 9px;
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

  /* ── Sample loader ── */
  .sample-section {
    margin-bottom: 8px;
    border: 1px dashed var(--dk-border);
    padding: 8px;
  }
  .sample-file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .btn-load {
    border: 1px solid var(--dk-border-mid);
    background: transparent;
    color: rgba(var(--dk-cream), 0.6);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 4px 10px;
    flex-shrink: 0;
  }
  .btn-load:active {
    color: rgba(var(--dk-cream), 0.9);
    border-color: rgba(var(--dk-cream), 0.5);
  }
  .sample-name {
    font-size: 10px;
    color: var(--dk-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sample-error {
    color: #e57373;
  }
  .waveform-canvas {
    width: 100%;
    height: 44px;
    display: block;
  }

  /* ── Mode row (polyMode, reverse, P-Lock toggle) ── */
  .mode-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 0;
    cursor: pointer;
  }
  .mode-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dk-text-mid);
  }
  .mode-switch {
    margin-left: auto;
    width: 32px;
    height: 16px;
    border-radius: 8px;
    background: rgba(var(--dk-cream), 0.15);
    position: relative;
    flex-shrink: 0;
    transition: background 100ms;
  }
  .mode-switch.on {
    background: var(--color-olive);
  }
  .mode-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgba(var(--dk-cream), 0.7);
    transition: left 100ms;
  }
  .mode-switch.on .mode-thumb {
    left: 18px;
    background: var(--color-bg);
  }

  /* ── Knob grid ── */
  .knob-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 6px 0;
    justify-content: flex-start;
  }

  /* ── Param group labels ── */
  .param-group-label {
    width: 100%;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
    margin-top: 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--dk-bg-hover);
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .param-group-label:active { color: var(--dk-text-mid); }
  .param-group-label.collapsed { margin-bottom: 0; }
  .group-chevron { font-size: 8px; line-height: 1; }

  /* ── Section dividers ── */
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dk-bg-active);
    margin: 10px 0;
  }
  .section-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
    padding-bottom: 4px;
  }

  /* ── Insert FX ── */
  .insert-fx-row {
    display: flex;
    gap: 8px;
    padding: 4px 0;
  }
  .insert-select {
    flex: 1;
    font-size: 11px;
    padding: 6px 8px;
    border-radius: 4px;
    border: 1px solid var(--dk-border);
    background: rgba(var(--dk-cream), 0.06);
    color: var(--dk-text);
    appearance: none;
    -webkit-appearance: none;
  }

  /* ── Track dots ── */
  .track-dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--dk-bg-faint);
    flex-shrink: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid rgba(var(--dk-cream), 0.35);
    background: transparent;
    padding: 0;
  }
  .dot.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
  }
</style>
