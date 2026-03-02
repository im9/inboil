<script lang="ts">
  import { pattern, playback, ui, toggleTrig, toggleMute, isDrum, clearAllParamLocks, setTrackSteps, STEP_OPTIONS } from '../state.svelte.ts'
  import { slide, fade } from 'svelte/transition'
  import PianoRoll from './PianoRoll.svelte'
  import MobileParamFooter from './MobileParamFooter.svelte'
  import SplitFlap from './SplitFlap.svelte'

  const track = $derived(pattern.tracks[ui.selectedTrack])
  const drum = $derived(isDrum(track))

  // Mobile tab: melodic tracks can switch between STEPS and NOTES
  let mobileTab: 'steps' | 'notes' = $state('steps')
  let footerOpen = $state(false)

  // Dynamic column count based on step count
  const calcCols = $derived(track.steps <= 8 ? 4 : track.steps <= 16 ? 4 : track.steps <= 32 ? 8 : 8)

  // P-Lock: selected step's trig and lock state
  const selTrig = $derived(ui.selectedStep !== null ? track.trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0)

  // ── Step drag-to-paint ──
  let paintDragging = $state(false)
  let paintOn = true
  let paintVisited = new Set<number>()
  let calcEl: HTMLElement | null = null

  function stepDown_pointer(e: PointerEvent, stepIdx: number) {
    if (ui.lockMode) {
      ui.selectedStep = ui.selectedStep === stepIdx ? null : stepIdx
      return
    }
    e.preventDefault()
    const trig = track.trigs[stepIdx]
    paintOn = !trig.active
    paintDragging = true
    paintVisited = new Set([stepIdx])
    calcEl = (e.currentTarget as HTMLElement).closest('.calculator') as HTMLElement
    calcEl?.setPointerCapture(e.pointerId)
    toggleTrig(ui.selectedTrack, stepIdx)
  }

  function stepMove(e: PointerEvent) {
    if (!paintDragging || !calcEl) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el) return
    const btn = el.closest('.calc-btn') as HTMLElement | null
    if (!btn || !calcEl.contains(btn)) return
    const idx = Array.from(calcEl.children).indexOf(btn)
    if (idx < 0 || paintVisited.has(idx)) return
    paintVisited.add(idx)
    const trig = track.trigs[idx]
    if (paintOn && !trig.active) toggleTrig(ui.selectedTrack, idx)
    else if (!paintOn && trig.active) toggleTrig(ui.selectedTrack, idx)
  }

  function stepEnd() {
    paintDragging = false
    calcEl = null
  }

  function stepDown() {
    const idx = STEP_OPTIONS.indexOf(track.steps as typeof STEP_OPTIONS[number])
    if (idx > 0) setTrackSteps(ui.selectedTrack, STEP_OPTIONS[idx - 1])
  }
  function stepUp() {
    const idx = STEP_OPTIONS.indexOf(track.steps as typeof STEP_OPTIONS[number])
    if (idx < STEP_OPTIONS.length - 1) setTrackSteps(ui.selectedTrack, STEP_OPTIONS[idx + 1])
  }

  function prevTrack() {
    ui.selectedTrack = (ui.selectedTrack - 1 + pattern.tracks.length) % pattern.tracks.length
    ui.selectedStep = null
  }
  function nextTrack() {
    ui.selectedTrack = (ui.selectedTrack + 1) % pattern.tracks.length
    ui.selectedStep = null
  }
</script>

<div class="mobile-view">

  <!-- Track navigation -->
  <div class="track-nav">
    <button class="nav-btn" onpointerdown={prevTrack}>◀</button>

    <div class="track-info">
      <span class="track-name"><SplitFlap value={track.name} width={5} /></span>
      <div class="track-meta">
        <span class="track-type">{track.synthType}</span>
      </div>
      <div class="step-row">
        <button class="step-adj" onpointerdown={stepDown}>−</button>
        <span class="step-value">{track.steps}</span>
        <span class="step-suffix">step</span>
        <button class="step-adj" onpointerdown={stepUp}>+</button>
      </div>
    </div>

    <button class="nav-btn" onpointerdown={nextTrack}>▶</button>
  </div>

  <!-- Melodic tab switcher -->
  {#if !drum}
    <div class="view-tabs">
      <button class="tab" class:active={mobileTab === 'steps'} onpointerdown={() => { mobileTab = 'steps' }}>STEPS</button>
      <button class="tab" class:active={mobileTab === 'notes'} onpointerdown={() => { mobileTab = 'notes' }}>NOTES</button>
    </div>
  {/if}

  <!-- Main area -->
  {#if drum || mobileTab === 'steps'}
    <div
      class="calculator"
      style="--cols: {calcCols}"
      onpointermove={stepMove}
      onpointerup={stepEnd}
      onpointercancel={stepEnd}
    >
      {#each track.trigs as trig, stepIdx}
        {@const isPlayhead = playback.playing && playback.playheads[ui.selectedTrack] === stepIdx}
        {@const isSelected = ui.lockMode && ui.selectedStep === stepIdx}
        {@const hasLocks = !!(trig.paramLocks && Object.keys(trig.paramLocks).length > 0)}
        <button
          class="calc-btn"
          class:playhead={isPlayhead}
          class:lock-selected={isSelected}
          onpointerdown={(e) => stepDown_pointer(e, stepIdx)}
        >
          <span class="btn-flip" class:flipped={trig.active}>
            <span class="face off"><span class="step-num">{stepIdx + 1}</span></span>
            <span class="face on"><span class="step-num">{stepIdx + 1}</span></span>
          </span>
          {#if hasLocks}<span class="lock-dot"></span>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <div class="piano-wrap">
      <PianoRoll trackId={ui.selectedTrack} />
    </div>
  {/if}

  <!-- Drawer handle -->
  <button class="drawer-handle" onpointerdown={() => { footerOpen = !footerOpen }} aria-label="Toggle footer">
    <span class="handle-pill"></span>
  </button>

  {#if footerOpen}
    <div class="footer-drawer" transition:slide={{ duration: 50 }}>
      <!-- Footer toolbar: LOCK + Mute -->
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
          class="btn-mute-bar"
          class:muted={track.muted}
          onpointerdown={() => toggleMute(ui.selectedTrack)}
        >MUTE</button>
      </div>

      <MobileParamFooter hideHandle />
    </div>
  {/if}

</div>

<style>
  .mobile-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
  }

  /* ── Track nav ── */
  .track-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(30,32,40,0.1);
  }
  .nav-btn {
    width: 36px;
    height: 36px;
    border: 1px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .nav-btn:active { background: var(--color-fg); color: var(--color-bg); }

  .track-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
  }
  .track-name {
    font-family: var(--font-display);
    font-size: 32px;
    line-height: 1;
    color: var(--color-fg);
    letter-spacing: 0.02em;
  }
  .track-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .track-type {
    font-size: 9px;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .step-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 0;
  }
  .step-adj {
    width: 28px;
    height: 28px;
    border: 1px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .step-adj:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .step-value {
    font-family: var(--font-display);
    font-size: 20px;
    line-height: 1;
    color: var(--color-olive);
    min-width: 2ch;
    text-align: right;
  }
  .step-suffix {
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    text-transform: uppercase;
    opacity: 0.6;
  }
  .btn-lock {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.4);
    background: transparent;
    border: 1px solid rgba(237,232,220,0.25);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-lock.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .btn-mute-bar {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.4);
    background: transparent;
    border: 1px solid rgba(237,232,220,0.25);
    padding: 4px 8px;
    line-height: 1;
  }
  .btn-mute-bar.muted {
    background: var(--color-salmon);
    border-color: var(--color-salmon);
    color: var(--color-bg);
  }

  /* ── View tabs (melodic only) ── */
  .view-tabs {
    display: flex;
    flex-shrink: 0;
  }
  .tab {
    flex: 1;
    padding: 6px 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(30,32,40,0.35);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
  }
  .tab.active {
    color: var(--color-fg);
    border-bottom-color: var(--color-olive);
  }

  /* ── Calculator (dynamic columns) ── */
  .calculator {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--cols, 4), 1fr);
    gap: 4px;
    padding: 8px;
    align-content: start;
    overflow-y: auto;
    overscroll-behavior: none;
  }
  .calc-btn {
    position: relative;
    aspect-ratio: 1;
    width: 100%;
    border: none;
    background: transparent;
    perspective: 120px;
    padding: 0;
  }

  .btn-flip {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transition: transform 180ms ease-out;
  }
  .btn-flip.flipped {
    transform: rotateY(180deg);
  }
  .calc-btn:active .btn-flip { transform: scale(0.9); }
  .calc-btn:active .btn-flip.flipped { transform: rotateY(180deg) scale(0.9); }

  .face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .face.off {
    background: var(--color-bg);
    border: 1.5px solid rgba(30,32,40,0.5);
  }
  .face.on {
    background: var(--color-olive);
    border: 1.5px solid var(--color-olive);
    transform: rotateY(180deg);
  }

  .step-num {
    font-family: var(--font-display);
    font-size: 20px;
    line-height: 1;
    pointer-events: none;
  }
  .face.off .step-num {
    color: var(--color-fg);
    opacity: 0.3;
  }
  .face.on .step-num {
    color: var(--color-bg);
    opacity: 0.5;
  }

  /* ── P-Lock indicators ── */
  .calc-btn.lock-selected .face.off {
    border-color: var(--color-olive);
    box-shadow: 0 0 0 1px var(--color-olive);
  }
  .calc-btn.lock-selected .face.on {
    box-shadow: inset 0 0 0 2px var(--color-bg);
  }
  .lock-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-olive);
    z-index: 1;
    pointer-events: none;
  }

  /* ── Playhead glow ── */
  .calc-btn.playhead {
    animation: ph-glow 180ms ease-out;
  }

  @keyframes ph-glow {
    0%   { filter: brightness(1.5); }
    100% { filter: brightness(1); }
  }

  /* ── Piano roll ── */
  .piano-wrap {
    flex: 1;
    overflow: hidden;
  }
  .piano-wrap :global(.piano-roll) {
    height: 100%;
  }

  /* ── Footer drawer ── */
  .footer-drawer {
    flex-shrink: 0;
  }

  /* ── Drawer handle ── */
  .drawer-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 0 4px;
    background: var(--color-fg);
    border: none;
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }
  .handle-pill {
    width: 32px;
    height: 4px;
    border-radius: 2px;
    background: rgba(237,232,220,0.25);
    transition: background 120ms;
  }
  .drawer-handle:active .handle-pill {
    background: rgba(237,232,220,0.50);
  }

  /* ── Lock toolbar ── */
  .lock-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--color-fg);
    flex-shrink: 0;
    border-top: 1px solid rgba(237,232,220,0.08);
  }
  .toolbar-spacer { flex: 1; }
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
    color: rgba(237,232,220,0.5);
    background: transparent;
    border: 1px solid rgba(237,232,220,0.25);
    padding: 1px 5px;
    line-height: 14px;
  }
  .btn-clr:active {
    background: rgba(237,232,220,0.15);
    color: rgba(237,232,220,0.85);
  }

</style>
