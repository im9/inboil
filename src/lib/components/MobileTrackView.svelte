<script lang="ts">
  import { song, activeCell, playback, ui } from '../state.svelte.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import { toggleTrig, isDrum, setTrackSteps, toggleMute, toggleSolo, setTrigVelocity, setTrigChance, addTrack, removeTrack, STEP_OPTIONS } from '../stepActions.ts'
  import { randomizePattern } from '../randomize.ts'
  import { VOICE_LIST } from '../audio/dsp/voices.ts'
  import PianoRoll from './PianoRoll.svelte'
  import MobileParamOverlay from './MobileParamOverlay.svelte'
  import { onDestroy } from 'svelte'

  const ph = $derived(activeCell(ui.selectedTrack))
  const track = $derived(song.tracks[ui.selectedTrack])
  const drum = $derived(isDrum(ph))
  const voiceMeta = $derived(ph.voiceId ? VOICE_LIST.find(v => v.id === ph.voiceId) : null)

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

  // ── PO-style step picker (tap: cycle, long-press: grid picker) ──
  let stepPickerOpen = $state(false)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressTriggered = false
  const STEP_SET_MAX = 16
  const EXT_STEPS = [24, 32, 48, 64] as const

  function cycleSteps() {
    const idx = STEP_OPTIONS.indexOf(ph.steps as typeof STEP_OPTIONS[number])
    setTrackSteps(ui.selectedTrack, STEP_OPTIONS[(idx + 1) % STEP_OPTIONS.length])
  }

  function stepBtnDown() {
    if (stepPickerOpen) { stepPickerOpen = false; return }
    longPressTriggered = false
    longPressTimer = setTimeout(() => {
      longPressTriggered = true
      stepPickerOpen = true
    }, 300)
  }

  function stepBtnUp() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    if (!longPressTriggered && !stepPickerOpen) cycleSteps()
  }

  function pickStepCount(n: number) {
    setTrackSteps(ui.selectedTrack, n)
    stepPickerOpen = false
  }

  // ── Track add/remove ──
  let nameLongPress: ReturnType<typeof setTimeout> | null = null

  function onNameDown() {
    nameLongPress = setTimeout(() => {
      nameLongPress = null
      if (confirm(`Remove "${ph.name}"?`)) removeTrack(ui.selectedTrack)
    }, 500)
  }
  function onNameUp() {
    if (nameLongPress) { clearTimeout(nameLongPress); nameLongPress = null }
  }

  onDestroy(() => {
    if (longPressTimer) clearTimeout(longPressTimer)
    if (nameLongPress) clearTimeout(nameLongPress)
  })

  function prevTrack() {
    ui.selectedTrack = (ui.selectedTrack - 1 + song.tracks.length) % song.tracks.length
    ui.selectedStep = null
  }
  function nextTrack() {
    ui.selectedTrack = (ui.selectedTrack + 1) % song.tracks.length
    ui.selectedStep = null
  }

  // ── Swipe to change track ──
  let swipeStartX = 0
  let swipeSwiped = false
  function onNavTouchStart(e: TouchEvent) {
    swipeStartX = e.touches[0].clientX
    swipeSwiped = false
  }
  function onNavTouchEnd(e: TouchEvent) {
    if (swipeSwiped) return
    const dx = e.changedTouches[0].clientX - swipeStartX
    if (Math.abs(dx) < 40) return
    swipeSwiped = true
    if (dx < 0) nextTrack()
    else prevTrack()
  }
</script>

<div class="mobile-view">

  <!-- Track navigation: row 1 = name, row 2 = voice bar + steps + S + M -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="track-nav" ontouchstart={onNavTouchStart} ontouchend={onNavTouchEnd}>
    <button class="nav-btn" onpointerdown={prevTrack}>◀</button>
    <div class="track-info">
      <span class="track-name" onpointerdown={onNameDown} onpointerup={onNameUp} onpointerleave={onNameUp}>{ph.name}</span>
    </div>
    <button class="nav-btn" onpointerdown={nextTrack}>▶</button>
    <button class="nav-btn add-btn" onpointerdown={() => addTrack()}>+</button>
  </div>

  <!-- Voice bar + controls -->
  <div class="track-controls">
    <button class="voice-bar" onpointerdown={() => { ui.mobileOverlay = !ui.mobileOverlay }}>
      <svg class="voice-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
        <line x1="2" y1="3" x2="2" y2="9"/><circle cx="2" cy="5" r="1.2" fill="currentColor" stroke="none"/>
        <line x1="6" y1="3" x2="6" y2="9"/><circle cx="6" cy="7" r="1.2" fill="currentColor" stroke="none"/>
        <line x1="10" y1="3" x2="10" y2="9"/><circle cx="10" cy="4.5" r="1.2" fill="currentColor" stroke="none"/>
      </svg>
      <span class="voice-label">{voiceMeta?.fullName ?? ph.voiceId ?? '—'}</span>
      <span class="voice-chevron">{ui.mobileOverlay ? '▼' : '▲'}</span>
    </button>
    <button
      class="btn-steps flip-host"
      onpointerdown={stepBtnDown}
      onpointerup={stepBtnUp}
      onpointerleave={() => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null } }}
    >
      <span class="flip-card" class:flipped={stepPickerOpen}>
        <span class="flip-face steps-off">{ph.steps}</span>
        <span class="flip-face back steps-on">{ph.steps}</span>
      </span>
    </button>
    <button
      class="btn-sm flip-host"
      onpointerdown={() => toggleSolo(ui.selectedTrack)}
    >
      <span class="flip-card" class:flipped={ui.soloTracks.has(ui.selectedTrack)}>
        <span class="flip-face solo-off">S</span>
        <span class="flip-face back solo-on">S</span>
      </span>
    </button>
    <button
      class="btn-sm flip-host"
      onpointerdown={() => toggleMute(ui.selectedTrack)}
    >
      <span class="flip-card" class:flipped={track?.muted}>
        <span class="flip-face mute-off">M</span>
        <span class="flip-face back mute-on">M</span>
      </span>
    </button>
    <button class="btn-rand" onpointerdown={randomizePattern}>RND</button>
  </div>

  <!-- Melodic tab switcher -->
  {#if !drum}
    <div class="view-tabs" role="tablist" aria-label="View">
      <button class="tab" role="tab" aria-selected={mobileTab === 'steps'} class:active={mobileTab === 'steps'} onpointerdown={() => { mobileTab = 'steps' }}>STEPS</button>
      <button class="tab" role="tab" aria-selected={mobileTab === 'notes'} class:active={mobileTab === 'notes'} onpointerdown={() => { mobileTab = 'notes' }}>NOTES</button>
    </div>
  {/if}

  <!-- Edit mode tabs -->
  {#if drum || mobileTab === 'steps'}
    <div class="edit-tabs" role="tablist" aria-label="Edit mode">
      <div class="edit-tab-pill" style="--tab-i: {editTabIdx}"></div>
      {#each EDIT_TABS as tab}
        <button
          class="edit-tab"
          role="tab"
          aria-selected={editMode === tab}
          class:active={editMode === tab}
          onpointerdown={() => { editMode = tab }}
        >{tab === 'step' ? 'STEP' : tab === 'vel' ? 'VEL' : 'CHNC'}</button>
      {/each}
    </div>
  {/if}

  <!-- Main area -->
  {#if stepPickerOpen}
    <!-- PO-style step picker (replaces calculator grid) -->
    <div class="calculator step-picker-grid" style="--cols: 4">
      {#each { length: STEP_SET_MAX } as _, i}
        {@const isActive = i < ph.steps}
        <button
          class="calc-btn sp-cell"
          class:active={isActive}
          class:current-end={i === ph.steps - 1}
          onpointerdown={() => pickStepCount(i + 1)}
        ><span class="step-num">{i + 1}</span></button>
      {/each}
      {#each EXT_STEPS as ext}
        <button
          class="calc-btn sp-cell sp-ext"
          class:active={ph.steps === ext}
          onpointerdown={() => pickStepCount(ext)}
        ><span class="step-num">{ext}</span></button>
      {/each}
    </div>
  {:else if drum || mobileTab === 'steps'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="calculator"
      style="--cols: {calcCols}"
      onpointermove={stepMove}
      onpointerup={stepEnd}
      onpointercancel={stepEnd}
    >
      {#each ph.trigs as trig, stepIdx}
        {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[ui.selectedTrack] === stepIdx}
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

  <MobileParamOverlay />

</div>

<style>
  .mobile-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
  }

  /* ── Track nav (row 1: ◀ name ▶) ── */
  .track-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 4px;
  }
  .nav-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--lz-text-hint);
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .nav-btn:active { background: var(--lz-bg-active); color: var(--color-fg); }
  .add-btn {
    font-size: 18px;
    color: var(--color-olive);
    border: 1.5px solid var(--color-olive);
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }
  .add-btn:active { background: var(--color-olive); color: var(--color-bg); }
  .track-info {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .track-name {
    font-family: var(--font-display);
    font-size: 32px;
    line-height: 1;
    color: var(--color-fg);
    letter-spacing: 0.02em;
  }

  /* ── Track controls (row 2: voice bar + steps + S + M) ── */
  .track-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 12px 6px;
    border-bottom: 1px solid var(--lz-border);
  }
  .voice-bar {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--lz-border-strong);
    border-radius: 0;
    background: var(--lz-bg-hover);
    color: var(--color-fg);
  }
  .voice-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    opacity: 0.4;
    margin-right: 4px;
  }
  .voice-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .voice-chevron {
    font-size: 8px;
    opacity: 0.4;
    flex-shrink: 0;
    margin-left: 4px;
  }
  .voice-bar:active {
    background: var(--lz-border);
    border-color: var(--lz-text-hint);
  }
  .btn-steps {
    min-width: 32px;
    height: 28px;
    border: none;
    background: transparent;
    padding: 0;
    position: relative;
    flex-shrink: 0;
  }
  .steps-off {
    border: 1px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .steps-on {
    border: 1px solid var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-sm {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    padding: 0;
    position: relative;
    flex-shrink: 0;
  }
  .solo-off, .mute-off {
    border: 1px solid var(--lz-text-hint);
    background: transparent;
    color: var(--lz-text-hint);
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .solo-on {
    border: 1px solid var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mute-on {
    border: 1px solid var(--color-salmon);
    background: var(--color-salmon);
    color: var(--color-bg);
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-rand {
    height: 28px;
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    padding: 0 8px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }
  .btn-rand:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }

  /* ── PO-style step picker (inside calculator) ── */
  .step-picker-grid {
    align-content: start;
  }
  .step-picker-grid .calc-btn {
    aspect-ratio: unset;
    min-height: 44px;
  }
  .calc-btn.sp-cell {
    background: var(--color-bg);
    border: 1.5px solid var(--lz-border-strong);
  }
  .calc-btn.sp-cell .step-num {
    color: var(--lz-text-mid);
    opacity: 1;
  }
  .calc-btn.sp-cell.active {
    background: var(--olive-bg);
    border-color: var(--olive-border-strong);
  }
  .calc-btn.sp-cell.active .step-num {
    color: var(--color-olive);
    opacity: 1;
  }
  .calc-btn.sp-cell.current-end {
    border-color: var(--color-olive);
    box-shadow: 0 0 0 1.5px var(--color-olive);
  }
  .calc-btn.sp-cell.current-end .step-num {
    color: var(--color-fg);
  }
  .calc-btn.sp-cell.sp-ext {
    grid-column: span 2;
    border-style: dashed;
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
    color: var(--lz-text-hint);
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
    margin: 4px 12px 2px;
    background: var(--lz-bg-active);
    border-radius: 0;
    flex-shrink: 0;
  }
  .edit-tab-pill {
    position: absolute;
    top: 2px;
    left: calc(var(--tab-i, 0) * 33.3333% + 2px);
    width: calc(33.3333% - 4px);
    height: calc(100% - 4px);
    background: var(--color-olive);
    border-radius: 0;
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
    color: var(--lz-text-hint);
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
    align-content: center;
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
    border: 1.5px solid var(--lz-step-border);
  }
  .calc-on {
    background: linear-gradient(
      to top,
      var(--color-olive) calc(var(--vel, 1) * 100%),
      var(--olive-border) calc(var(--vel, 1) * 100%)
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
    text-shadow: 0 1px 2px var(--lz-text-hint);
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


</style>
