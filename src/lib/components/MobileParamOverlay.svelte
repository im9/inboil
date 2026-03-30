<script lang="ts">
  // NOTE: Large file by design — sample/FX/param sections all operate on same cell+track
  import { song, activeCell, ui, samplesByCell, sampleCellKey, setSample } from '../state.svelte.ts'
  import { setTrackSend, clearAllParamLocks, toggleMute, toggleSolo, setInsertFxType, setInsertFxFlavour, setInsertFxParam } from '../stepActions.ts'
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { engine } from '../audio/engine.ts'
  import { isGuest, guestSetParam, guestSetSend } from '../multiDevice/guest.ts'
  import { fade, fly } from 'svelte/transition'
  import { drawWaveform } from '../domHelpers.ts'
  import Knob from './Knob.svelte'
  import VoicePicker from './VoicePicker.svelte'
  import DockPresetBrowser from './DockPresetBrowser.svelte'
  import DockPoolBrowser from './DockPoolBrowser.svelte'

  function setParam(key: string, v: number) {
    if (isGuest()) { guestSetParam(ui.selectedTrack, key, v); return }
    ;(song.tracks[ui.selectedTrack] as unknown as Record<string, unknown>)[key] = v
  }

  type SendKey = 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend'
  function handleSend(key: SendKey, v: number) {
    if (isGuest()) { guestSetSend(ui.selectedTrack, key, v); return }
    setTrackSend(ui.selectedTrack, key, v)
  }

  const track = $derived(song.tracks[ui.selectedTrack])
  const cell   = $derived(activeCell(ui.selectedTrack))
  const params = $derived(getParamDefs(cell.voiceId))
  const selTrig = $derived(ui.selectedStep !== null ? activeCell(ui.selectedTrack).trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)
  const isSampler = $derived(cell?.voiceId === 'Sampler')
  const chopSlices = $derived(isSampler ? (cell?.voiceParams?.chopSlices ?? 0) : 0)


  // ── Voice picker / preset browser refs ──
  let voicePickerRef = $state<VoicePicker>(null!)
  let presetBrowserRef = $state<DockPresetBrowser>(null!)

  // ── Pool browser ──
  let poolOpen = $state(false)
  $effect(() => { void ui.selectedTrack; poolOpen = false })

  // ── Collapsible param groups ──
  let collapsedGroups = $state(new Set<string>())

  // ── Sample loader ──
  const MAX_SAMPLE_SIZE = 10 * 1024 * 1024
  let fileInput = $state<HTMLInputElement>(null!)
  let waveformCanvas = $state<HTMLCanvasElement>(null!)
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
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) void loadSampleFile(file)
    input.value = ''
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
      <VoicePicker bind:this={voicePickerRef} voiceId={cell.voiceId} trackId={ui.selectedTrack} variant="mobile"
        onselect={() => presetBrowserRef?.close()} />

      <!-- Preset browser -->
      <DockPresetBrowser bind:this={presetBrowserRef} onopen={() => { voicePickerRef?.close() }} />

      <!-- Sample loader -->
      {#if isSampler}
        <div class="sample-section">
          <div class="sample-file-row">
            <button class="btn-load" onpointerdown={() => fileInput.click()}>LOAD</button>
            <button class="btn-load" class:btn-active={poolOpen}
              onpointerdown={() => poolOpen = !poolOpen}>POOL</button>
            <span class="sample-name" class:sample-error={!!sampleError}>{sampleError || (currentSample?.packId ? '🎹 ' : '') + (currentSample?.name || '') || 'Tap LOAD to select audio'}</span>
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
            <DockPoolBrowser trackId={ui.selectedTrack} onclose={() => poolOpen = false} />
          {/if}
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

      <!-- Insert FX (ADR 114: dual chain) -->
      <div class="section-divider"></div>
      <div class="section-label">INSERT FX</div>
      {#each [0, 1] as slot}
        {#if slot === 0 || !!cell.insertFx?.[0]?.type || !!cell.insertFx?.[1]?.type}
          {@const insFx = cell.insertFx?.[slot as 0 | 1] ?? null}
          {@const showLabels = !!cell.insertFx?.[0]?.type || !!cell.insertFx?.[1]?.type}
          <div class="insert-fx-row">
            {#if showLabels}<span class="insert-slot-label">{slot + 1}</span>{/if}
            <select
              class="insert-select"
              value={insFx?.type ?? ''}
              onchange={e => {
                const v = (e.target as HTMLSelectElement).value
                setInsertFxType(ui.selectedTrack, slot as 0 | 1, v === '' ? null : v as 'verb' | 'delay' | 'glitch' | 'dist')
              }}
            >
              <option value="">OFF</option>
              <option value="verb">REVERB</option>
              <option value="delay">DELAY</option>
              <option value="glitch">GLITCH</option>
              <option value="dist">DIST</option>
            </select>
            {#if insFx?.type === 'verb'}
              <select class="insert-select" value={insFx.flavour}
                onchange={e => setInsertFxFlavour(ui.selectedTrack, slot as 0 | 1, (e.target as HTMLSelectElement).value)}>
                <option value="room">Room</option>
                <option value="hall">Hall</option>
              </select>
            {:else if insFx?.type === 'delay'}
              <select class="insert-select" value={insFx.flavour}
                onchange={e => setInsertFxFlavour(ui.selectedTrack, slot as 0 | 1, (e.target as HTMLSelectElement).value)}>
                <option value="digital">Digital</option>
                <option value="dotted">Dotted</option>
                <option value="tape">Tape</option>
              </select>
            {:else if insFx?.type === 'glitch'}
              <select class="insert-select" value={insFx.flavour}
                onchange={e => setInsertFxFlavour(ui.selectedTrack, slot as 0 | 1, (e.target as HTMLSelectElement).value)}>
                <option value="bitcrush">Bitcrush</option>
                <option value="redux">Redux</option>
              </select>
            {:else if insFx?.type === 'dist'}
              <select class="insert-select" value={insFx.flavour}
                onchange={e => setInsertFxFlavour(ui.selectedTrack, slot as 0 | 1, (e.target as HTMLSelectElement).value)}>
                <option value="overdrive">Overdrive</option>
                <option value="fuzz">Fuzz</option>
              </select>
            {/if}
          </div>
          {#if insFx?.type}
            <div class="knob-grid">
              <Knob value={insFx.mix} label="MIX" size={48} onchange={v => setInsertFxParam(ui.selectedTrack, slot as 0 | 1, 'mix', v)} />
              <Knob value={insFx.x} label={insFx.type === 'verb' ? 'SIZE' : insFx.type === 'delay' ? 'TIME' : insFx.type === 'dist' ? 'DRIVE' : 'RATE'} size={48} onchange={v => setInsertFxParam(ui.selectedTrack, slot as 0 | 1, 'x', v)} />
              <Knob value={insFx.y} label={insFx.type === 'verb' ? 'DAMP' : insFx.type === 'delay' ? 'FB' : insFx.type === 'dist' ? 'TONE' : 'BITS'} size={48} onchange={v => setInsertFxParam(ui.selectedTrack, slot as 0 | 1, 'y', v)} />
            </div>
          {/if}
        {/if}
      {/each}

      <!-- Send / Mix -->
      <div class="section-divider"></div>
      <div class="section-label">SEND / MIX</div>
      <div class="knob-grid">
        <Knob value={track.volume} label="VOL" size={48} onchange={v => setParam('volume', v)} />
        <Knob value={(track.pan + 1) / 2} label="PAN" size={48} defaultValue={0.5} onchange={v => setParam('pan', v * 2 - 1)} />
        <Knob value={cell.reverbSend} label="VERB" size={48} onchange={v => handleSend('reverbSend', v)} />
        <Knob value={cell.delaySend} label="DLY" size={48} onchange={v => handleSend('delaySend', v)} />
        <Knob value={cell.glitchSend} label="GLT" size={48} onchange={v => handleSend('glitchSend', v)} />
        <Knob value={cell.granularSend} label="GRN" size={48} onchange={v => handleSend('granularSend', v)} />
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
    background: var(--lz-text-mid);
    display: flex;
    align-items: flex-end;
  }
  .overlay-card {
    width: 100%;
    background: var(--color-fg);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
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
    border-radius: 0;
    background: var(--dz-border-mid);
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
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-transport-border);
    background: transparent;
    border: 1px solid var(--dz-border);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-lock.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .lock-label {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    white-space: nowrap;
  }
  .btn-clr {
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-text-mid);
    background: transparent;
    border: 1px solid var(--dz-border);
    padding: 1px 5px;
    line-height: 14px;
  }
  .btn-clr:active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
  }
  .btn-solo {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-transport-border);
    background: transparent;
    border: 1px solid var(--dz-border);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-solo.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .btn-mute {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-transport-border);
    background: transparent;
    border: 1px solid var(--dz-border);
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


  /* ── Sample loader ── */
  .sample-section {
    margin-bottom: 8px;
    border: 1px dashed var(--dz-border);
    padding: 8px;
  }
  .sample-file-row {
    display: flex;
    align-items: center;
    gap: 8px;
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
    flex-shrink: 0;
  }
  .btn-load:active {
    color: var(--dz-text-bright);
    border-color: var(--dz-transport-border);
  }
  .btn-load.btn-active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
    border-color: var(--dz-transport-border);
  }
  .sample-name {
    font-size: var(--fs-md);
    color: var(--dz-transport-border);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sample-error {
    color: var(--color-danger);
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
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-text-mid);
  }
  .mode-switch {
    margin-left: auto;
    width: 32px;
    height: 16px;
    border-radius: var(--radius-md);
    background: var(--dz-bg-press);
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
    background: var(--dz-text);
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
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dz-transport-border);
    margin-top: 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--dz-bg-hover);
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .param-group-label:active { color: var(--dz-text-mid); }
  .param-group-label.collapsed { margin-bottom: 0; }
  .group-chevron { font-size: var(--fs-min); line-height: 1; }

  /* ── Section dividers ── */
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dz-bg-active);
    margin: 10px 0;
  }
  .section-label {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dz-transport-border);
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
    font-size: var(--fs-lg);
    padding: 6px 8px;
    border-radius: 0;
    border: 1px solid var(--dz-border);
    background: var(--dz-divider);
    color: var(--dz-text-strong);
    appearance: none;
    -webkit-appearance: none;
  }

  /* ── Track dots ── */
  .track-dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--dz-divider);
    flex-shrink: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--dz-text-dim);
    background: transparent;
    padding: 0;
  }
  .dot.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
  }
</style>
