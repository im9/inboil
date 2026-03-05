<script lang="ts">
  import { song, activeCell, playback, ui, toggleTrig, isDrum, setTrackSteps, setTrigVelocity, setTrigChance, STEP_OPTIONS } from '../state.svelte.ts'
  import PianoRoll from './PianoRoll.svelte'
  import MobileParamOverlay from './MobileParamOverlay.svelte'
  import SplitFlap from './SplitFlap.svelte'

  const track = $derived(song.tracks[ui.selectedTrack])
  const ph = $derived(activeCell(ui.selectedTrack))
  const drum = $derived(isDrum(track))

  // Mobile tab: melodic tracks can switch between STEPS and NOTES
  let mobileTab: 'steps' | 'notes' = $state('steps')

  // Dynamic column count based on step count
  const calcCols = $derived(ph.steps <= 8 ? 4 : ph.steps <= 16 ? 4 : ph.steps <= 32 ? 8 : 8)

  // ── Step drag-to-paint ──
  let paintDragging = $state(false)
  let paintOn = true
  let paintVisited = new Set<number>()
  let calcEl: HTMLElement | null = null

  // ── Edit mode: step (on/off + paint), vel, chance ──
  let editMode: 'step' | 'vel' | 'chance' = $state('step')
  const EDIT_TABS = ['step', 'vel', 'chance'] as const
  const editTabIdx = $derived(EDIT_TABS.indexOf(editMode))

  // ── Velocity / Chance drag ──
  // Plain variables for drag mechanics (no $state to avoid re-render overhead)
  let _vdActive = false
  let _vdStartY = 0
  let _vdStartVal = 0
  let _vdMode: 'vel' | 'chance' = 'vel'
  let _vdTrig: { velocity: number; chance?: number } | null = null

  // $state only for template visual binding
  let velDragStep: number | null = $state(null)
  let velDragActive = $state(false)

  function velMove(e: MouseEvent) {
    if (!_vdTrig) return
    e.preventDefault()
    if (!_vdActive) {
      _vdActive = true
      velDragActive = true
    }
    const dy = _vdStartY - e.clientY
    const newVal = Math.min(1.0, Math.max(0.05, _vdStartVal + dy / 60))
    if (_vdMode === 'chance') {
      _vdTrig.chance = newVal
    } else {
      _vdTrig.velocity = newVal
    }
  }

  function velEnd() {
    // Tap without drag → reset to 1.0
    if (_vdTrig && !_vdActive) {
      if (_vdMode === 'chance') _vdTrig.chance = 1.0
      else _vdTrig.velocity = 1.0
    }
    _vdActive = false
    _vdTrig = null
    velDragStep = null
    velDragActive = false
    window.removeEventListener('mousemove', velMove)
    window.removeEventListener('mouseup', velEnd)
    window.removeEventListener('touchmove', velTouchMove)
    window.removeEventListener('touchend', velEnd)
    window.removeEventListener('touchcancel', velEnd)
  }

  function velTouchMove(e: TouchEvent) {
    if (!_vdTrig || !e.touches[0]) return
    e.preventDefault()
    if (!_vdActive) {
      _vdActive = true
      velDragActive = true
    }
    const dy = _vdStartY - e.touches[0].clientY
    const newVal = Math.min(1.0, Math.max(0.05, _vdStartVal + dy / 60))
    if (_vdMode === 'chance') {
      _vdTrig.chance = newVal
    } else {
      _vdTrig.velocity = newVal
    }
  }

  function stepDown_pointer(e: PointerEvent, stepIdx: number) {
    if (ui.lockMode) {
      ui.selectedStep = ui.selectedStep === stepIdx ? null : stepIdx
      return
    }
    e.preventDefault()
    const trig = ph.trigs[stepIdx]
    calcEl = (e.currentTarget as HTMLElement).closest('.calculator') as HTMLElement

    // VEL / CHANCE mode
    if (editMode !== 'step') {
      if (!trig.active) return
      _vdStartY = e.clientY
      _vdStartVal = editMode === 'chance' ? (trig.chance ?? 1.0) : trig.velocity
      _vdActive = false
      _vdMode = editMode as 'vel' | 'chance'
      _vdTrig = trig
      velDragStep = stepIdx
      velDragActive = false
      // Push undo once
      if (editMode === 'chance') {
        setTrigChance(ui.selectedTrack, stepIdx, _vdStartVal)
      } else {
        setTrigVelocity(ui.selectedTrack, stepIdx, _vdStartVal)
      }
      // Mouse events for trackpad, touch events for mobile
      window.addEventListener('mousemove', velMove)
      window.addEventListener('mouseup', velEnd)
      window.addEventListener('touchmove', velTouchMove, { passive: false })
      window.addEventListener('touchend', velEnd)
      window.addEventListener('touchcancel', velEnd)
      return
    }

    // TRIG mode: on/off toggle + paint drag
    paintOn = !trig.active
    paintDragging = true
    paintVisited = new Set([stepIdx])
    calcEl?.setPointerCapture(e.pointerId)
    toggleTrig(ui.selectedTrack, stepIdx)
  }

  function stepMove(e: PointerEvent) {
    // Normal paint drag (trig mode only — vel/chance uses window listeners)
    if (!paintDragging || !calcEl) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el) return
    const btn = el.closest('.calc-btn') as HTMLElement | null
    if (!btn || !calcEl.contains(btn)) return
    const idx = Array.from(calcEl.children).indexOf(btn)
    if (idx < 0 || paintVisited.has(idx)) return
    paintVisited.add(idx)
    const trig = ph.trigs[idx]
    if (paintOn && !trig.active) toggleTrig(ui.selectedTrack, idx)
    else if (!paintOn && trig.active) toggleTrig(ui.selectedTrack, idx)
  }

  function stepEnd() {
    paintDragging = false
    calcEl = null
  }

  function stepDown() {
    const idx = STEP_OPTIONS.indexOf(ph.steps as typeof STEP_OPTIONS[number])
    if (idx > 0) setTrackSteps(ui.selectedTrack, STEP_OPTIONS[idx - 1])
  }
  function stepUp() {
    const idx = STEP_OPTIONS.indexOf(ph.steps as typeof STEP_OPTIONS[number])
    if (idx < STEP_OPTIONS.length - 1) setTrackSteps(ui.selectedTrack, STEP_OPTIONS[idx + 1])
  }

  function prevTrack() {
    ui.selectedTrack = (ui.selectedTrack - 1 + song.tracks.length) % song.tracks.length
    ui.selectedStep = null
  }
  function nextTrack() {
    ui.selectedTrack = (ui.selectedTrack + 1) % song.tracks.length
    ui.selectedStep = null
  }
</script>

<div class="mobile-view">

  <!-- Track navigation -->
  <div class="track-nav">
    <button class="nav-btn" onpointerdown={prevTrack}>◀</button>

    <div class="track-info">
      <button class="track-name-btn" onpointerdown={() => { ui.mobileOverlay = !ui.mobileOverlay }}>
        <span class="track-name"><SplitFlap value={track.name} width={5} /></span>
      </button>
      <div class="track-meta">
        <span class="track-type">{track.synthType}</span>
      </div>
      <div class="step-row">
        <button class="step-adj" onpointerdown={stepDown}>−</button>
        <span class="step-value">{ph.steps}</span>
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

  <!-- Edit mode tabs -->
  {#if drum || mobileTab === 'steps'}
    <div class="edit-tabs">
      <div class="edit-tab-pill" style="--tab-i: {editTabIdx}"></div>
      {#each EDIT_TABS as tab}
        <button
          class="edit-tab"
          class:active={editMode === tab}
          onpointerdown={() => { editMode = tab }}
        >{tab === 'step' ? 'STEP' : tab === 'vel' ? 'VEL' : 'CHNC'}</button>
      {/each}
    </div>
  {/if}

  <!-- Main area -->
  {#if drum || mobileTab === 'steps'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="calculator"
      style="--cols: {calcCols}"
      onpointermove={stepMove}
      onpointerup={stepEnd}
      onpointercancel={stepEnd}
    >
      {#each ph.trigs as trig, stepIdx}
        {@const isPlayhead = playback.playing && playback.playheads[ui.selectedTrack] === stepIdx}
        {@const isSelected = ui.lockMode && ui.selectedStep === stepIdx}
        {@const hasLocks = !!(trig.paramLocks && Object.keys(trig.paramLocks).length > 0)}
        {@const isDragging = velDragActive && velDragStep === stepIdx}
        {@const velVal = editMode === 'chance' ? (trig.chance ?? 1.0) : trig.velocity}
        <button
          class="calc-btn flip-host"
          class:playhead={isPlayhead}
          class:lock-selected={isSelected}
          class:vel-dragging={isDragging}
          onpointerdown={(e) => stepDown_pointer(e, stepIdx)}
        >
          <span class="flip-card" class:flipped={trig.active}>
            <span class="flip-face calc-off"><span class="step-num">{stepIdx + 1}</span></span>
            <span class="flip-face back calc-on" style="--vel: {editMode !== 'step' ? velVal : 1}"><span class="step-num">{stepIdx + 1}</span></span>
          </span>
          {#if isDragging}
            <span class="vel-pct {editMode === 'chance' ? 'chance' : ''}">{Math.round(velVal * 100)}%</span>
          {/if}
          {#if hasLocks}<span class="lock-dot"></span>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <div class="piano-wrap">
      <PianoRoll trackId={ui.selectedTrack} />
    </div>
  {/if}

  {#if ui.mobileOverlay}
    <MobileParamOverlay />
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
  .track-name-btn {
    background: transparent;
    border: none;
    padding: 0;
    display: block;
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

  /* ── Edit mode tabs (STEP / VEL / CHNC) ── */
  .edit-tabs {
    display: flex;
    position: relative;
    margin: 4px 8px 2px;
    background: rgba(30,32,40,0.06);
    border-radius: 4px;
    flex-shrink: 0;
  }
  .edit-tab-pill {
    position: absolute;
    top: 2px;
    left: calc(var(--tab-i, 0) * 33.3333% + 2px);
    width: calc(33.3333% - 4px);
    height: calc(100% - 4px);
    background: var(--color-olive);
    border-radius: 3px;
    transition: left 200ms cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 0;
  }
  .edit-tab {
    flex: 1;
    position: relative;
    z-index: 1;
    padding: 5px 0;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(30,32,40,0.35);
    background: transparent;
    border: none;
    transition: color 200ms;
  }
  .edit-tab.active {
    color: var(--color-bg);
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
  .calc-btn :global(.flip-card) {
    position: absolute;
    inset: 0;
  }
  .calc-btn:active :global(.flip-card) { transform: scale(0.9); }
  .calc-btn:active :global(.flip-card.flipped) { transform: rotateY(180deg) scale(0.9); }

  .calc-off {
    background: var(--color-bg);
    border: 1.5px solid rgba(30,32,40,0.5);
  }
  .calc-on {
    background: linear-gradient(
      to top,
      var(--color-olive) calc(var(--vel, 1) * 100%),
      rgba(108,119,68,0.25) calc(var(--vel, 1) * 100%)
    );
    border: 1.5px solid var(--color-olive);
  }

  .step-num {
    font-family: var(--font-display);
    font-size: 20px;
    line-height: 1;
    pointer-events: none;
  }
  .calc-off .step-num {
    color: var(--color-fg);
    opacity: 0.3;
  }
  .calc-on .step-num {
    color: var(--color-bg);
    opacity: 0.5;
  }

  /* ── Velocity/Chance drag ── */
  .vel-pct {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-size: 16px;
    line-height: 1;
    color: var(--color-bg);
    z-index: 2;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  .vel-pct.chance {
    color: var(--color-sky, #5b9bd5);
  }
  .calc-btn.vel-dragging {
    z-index: 3;
  }
  .calc-btn.vel-dragging .calc-on {
    border-color: var(--color-bg);
    box-shadow: 0 0 0 2px var(--color-olive);
  }

  /* ── P-Lock indicators ── */
  .calc-btn.lock-selected .calc-off {
    border-color: var(--color-olive);
    box-shadow: 0 0 0 1px var(--color-olive);
  }
  .calc-btn.lock-selected .calc-on {
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

  /* ── Piano roll ── */
  .piano-wrap {
    flex: 1;
    overflow: hidden;
  }
  .piano-wrap :global(.piano-roll) {
    height: 100%;
  }


</style>
