<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { song, activeCell, playback, ui, trackDisplayName } from '../state.svelte.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import { toggleTrig, toggleMute, toggleSolo, setTrigVelocity, setTrigChance, setTrackSteps, isDrum, STEP_OPTIONS, addTrack, cycleTrackScale, SCALE_OPTIONS } from '../stepActions.ts'
  import PianoRoll from './PianoRoll.svelte'

  // Force scroll recalc after mount — transition:fly on parent can delay layout
  let scrollEl: HTMLDivElement | undefined = $state(undefined)
  onMount(() => {
    requestAnimationFrame(() => {
      if (scrollEl) {
        scrollEl.style.overflowY = 'hidden'
        void scrollEl.offsetHeight
        scrollEl.style.overflowY = ''
      }
    })
  })

  function cycleSteps(trackId: number) {
    const current = activeCell(trackId).steps
    const idx = STEP_OPTIONS.indexOf(current as typeof STEP_OPTIONS[number])
    setTrackSteps(trackId, STEP_OPTIONS[(idx + 1) % STEP_OPTIONS.length])
  }

  // ── PO-style step-set mode (long-press step button → tap grid to set length) ──
  let stepSetTrack: number | null = $state(null)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressTriggered = false
  const STEP_SET_MAX = 16
  const EXT_STEPS = [24, 32, 48, 64] as const

  function stepPointerDown(_e: PointerEvent, trackId: number) {
    // If already in step-set mode for this track, dismiss
    if (stepSetTrack === trackId) {
      stepSetTrack = null
      return
    }
    longPressTriggered = false
    longPressTimer = setTimeout(() => {
      longPressTriggered = true
      stepSetTrack = trackId
    }, 300)
  }

  function stepPointerUp(trackId: number) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    if (!longPressTriggered && stepSetTrack !== trackId) cycleSteps(trackId)
  }

  function stepContextMenu(e: Event, trackId: number) {
    e.preventDefault()
    stepSetTrack = stepSetTrack === trackId ? null : trackId
  }

  function pickStepCount(n: number) {
    if (stepSetTrack != null) setTrackSteps(stepSetTrack, n)
    stepSetTrack = null
  }

  onDestroy(() => { if (longPressTimer) clearTimeout(longPressTimer) })

  // ── Velocity drag state ──
  let velContainer: HTMLDivElement | undefined = $state(undefined)
  let velDragging = $state(false)
  let chanceMode = $state(false)

  function velStartDrag(e: PointerEvent, trackId: number, idx: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (e.shiftKey) chanceMode = !chanceMode
    velDragging = true
    velApply(e, trackId, idx)
  }

  function velOnMove(e: PointerEvent) {
    if (!velDragging || !velContainer) return
    const barsEl = velContainer.querySelector('.vel-bars') as HTMLElement
    if (!barsEl) return
    const trackId = ui.selectedTrack
    const rect = barsEl.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const idx = Math.max(0, Math.min(activeCell(trackId).steps - 1, Math.floor(relX / 26)))
    velApply(e, trackId, idx)
  }

  function velApply(e: PointerEvent, trackId: number, idx: number) {
    const barsEl = velContainer?.querySelector('.vel-bars') as HTMLElement
    if (!barsEl) return
    const cell = barsEl.children[idx] as HTMLElement
    if (!cell) return
    const rect = cell.getBoundingClientRect()
    const v = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    if (chanceMode) {
      setTrigChance(trackId, idx, v)
    } else {
      setTrigVelocity(trackId, idx, v)
    }
  }

  function velEndDrag() {
    velDragging = false
  }

  // ── Vel-bar mount animation (one-shot) ──
  let velMounting = $state(true)
  $effect(() => {
    velMounting = true
    void ui.selectedTrack  // re-trigger on track change
    tick().then(() => { velMounting = false })
  })

  // ── Vel-fill grow/shrink animation on trig toggle ──
  let growing: Set<string> = $state(new Set())
  let shrinking: Set<string> = $state(new Set())
  const timers = new Map<string, number>()

  onDestroy(() => { timers.forEach(id => clearTimeout(id)); timers.clear() })

  function handleToggle(trackId: number, stepIdx: number) {
    const trig = activeCell(trackId).trigs[stepIdx]
    const key = `${trackId}-${stepIdx}`
    // Cancel any pending timer for this step to avoid stacking
    if (timers.has(key)) { clearTimeout(timers.get(key)!); timers.delete(key) }

    if (trig.active) {
      // Turn OFF → toggle immediately + play shrink simultaneously
      toggleTrig(trackId, stepIdx)
      shrinking = new Set([...shrinking, key])
      timers.set(key, window.setTimeout(() => {
        timers.delete(key)
        shrinking = new Set([...shrinking].filter(k => k !== key))
      }, 180))
    } else {
      // Turn ON → toggle immediately + play grow simultaneously
      toggleTrig(trackId, stepIdx)
      growing = new Set([...growing, key])
      timers.set(key, window.setTimeout(() => {
        timers.delete(key)
        growing = new Set([...growing].filter(k => k !== key))
      }, 180))
    }
  }

  // ── Step drag-to-paint state ──
  let stepDragging = $state(false)
  let stepPaintOn = $state(true)
  let stepDragTrack = $state(-1)
  let stepVisited = new Set<number>()
  let stepStepsEl: HTMLElement | null = null

  function stepStartDrag(e: PointerEvent, trackId: number, stepIdx: number) {
    e.preventDefault()
    // Lock mode: select step instead of toggling
    if (ui.lockMode) {
      ui.selectedTrack = trackId
      ui.selectedStep = ui.selectedStep === stepIdx && ui.selectedTrack === trackId ? null : stepIdx
      return
    }
    const trig = activeCell(trackId).trigs[stepIdx]
    stepPaintOn = !trig.active
    stepDragTrack = trackId
    stepDragging = true
    stepVisited = new Set([stepIdx])
    stepStepsEl = (e.currentTarget as HTMLElement).closest('.steps') as HTMLElement
    stepStepsEl?.setPointerCapture(e.pointerId)
    handleToggle(trackId, stepIdx)
  }

  function stepOnMove(e: PointerEvent) {
    if (!stepDragging || !stepStepsEl) return
    const rect = stepStepsEl.getBoundingClientRect()
    const relX = e.clientX - rect.left + stepStepsEl.scrollLeft
    const ph = activeCell(stepDragTrack)
    const idx = Math.max(0, Math.min(ph.steps - 1, Math.floor(relX / 26)))
    if (stepVisited.has(idx)) return
    stepVisited.add(idx)
    const trig = ph.trigs[idx]
    if (stepPaintOn && !trig.active) handleToggle(stepDragTrack, idx)
    else if (!stepPaintOn && trig.active) handleToggle(stepDragTrack, idx)
  }

  function stepEndDrag() {
    stepDragging = false
    stepStepsEl = null
  }

  // ── Keyboard navigation for step buttons ──
  function stepKeydown(e: KeyboardEvent, trackId: number, stepIdx: number) {
    const cells = song.patterns[ui.currentPattern].cells
    const steps = activeCell(trackId).steps
    let targetTrack = trackId
    let targetStep = stepIdx

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        targetStep = stepIdx > 0 ? stepIdx - 1 : steps - 1
        break
      case 'ArrowRight':
        e.preventDefault()
        targetStep = stepIdx < steps - 1 ? stepIdx + 1 : 0
        break
      case 'ArrowUp': {
        e.preventDefault()
        const idx = cells.findIndex(c => c.trackId === trackId)
        if (idx > 0) {
          targetTrack = cells[idx - 1].trackId
          targetStep = Math.min(stepIdx, activeCell(targetTrack).steps - 1)
        }
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        const idx = cells.findIndex(c => c.trackId === trackId)
        if (idx < cells.length - 1) {
          targetTrack = cells[idx + 1].trackId
          targetStep = Math.min(stepIdx, activeCell(targetTrack).steps - 1)
        }
        break
      }
      case 'Enter':
        e.preventDefault()
        handleToggle(trackId, stepIdx)
        return
      default:
        return
    }
    if (targetTrack !== trackId || targetStep !== stepIdx) {
      const btn = scrollEl?.querySelector(`button.step[data-track="${targetTrack}"][data-step="${targetStep}"]`) as HTMLElement
      btn?.focus()
    }
  }
</script>

<div class="step-grid">
<div class="step-grid-scroll" bind:this={scrollEl}>
  {#each song.patterns[ui.currentPattern].cells as ph}
    {@const trackId = ph.trackId}
    {@const track = song.tracks[trackId]}
    {@const selected = ui.selectedTrack === trackId}

    <div
      class="track-row"
      class:selected
      class:muted={track?.muted}
      class:solo-muted={ui.soloTracks.size > 0 && !ui.soloTracks.has(trackId)}
    >
      <div class="track-head">
        <!-- Track label + expand toggle -->
        <button
          class="track-label"
          class:expanded={selected}
          onpointerdown={() => { ui.selectedTrack = selected ? -1 : trackId }}
          data-tip="Expand velocity lane" data-tip-ja="ベロシティレーンを展開"
        >
          <span class="track-name">{trackDisplayName(ph, ui.currentPattern)}</span>
          <svg class="chevron" class:open={selected} viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1,1 5,5 9,1" />
          </svg>
        </button>

        <!-- Step count -->
        <button
          class="btn-steps flip-host"
          onpointerdown={(e) => stepPointerDown(e, trackId)}
          onpointerup={() => stepPointerUp(trackId)}
          onpointerleave={() => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null } }}
          oncontextmenu={(e) => stepContextMenu(e, trackId)}
          data-tip="Tap: cycle · Hold: picker" data-tip-ja="タップ: 切替 · 長押し: 選択"
        >
          <span class="flip-card" class:flipped={stepSetTrack === trackId}>
            <span class="flip-face steps-off">{ph.steps}</span>
            <span class="flip-face back steps-on">{ph.steps}</span>
          </span>
        </button>

        <!-- Scale (ADR 112) -->
        <button
          class="btn-scale"
          onpointerdown={() => cycleTrackScale(trackId)}
          data-tip="Step scale (click to cycle)" data-tip-ja="ステップスケール（クリックで切替）"
        >{SCALE_OPTIONS.find(o => o.divisor === (ph.scale ?? 2))?.label ?? '1/16'}</button>

        <!-- Solo -->
        <button
          class="btn-solo flip-host"
          onpointerdown={() => toggleSolo(trackId)}
          data-tip="Solo/unsolo track" data-tip-ja="トラックをソロ"
        >
          <span class="flip-card" class:flipped={ui.soloTracks.has(trackId)}>
            <span class="flip-face solo-off">S</span>
            <span class="flip-face back solo-on">S</span>
          </span>
        </button>

        <!-- Mute -->
        <button
          class="btn-mute flip-host"
          onpointerdown={() => toggleMute(trackId)}
          data-tip="Mute/unmute track" data-tip-ja="トラックをミュート"
        >
          <span class="flip-card" class:flipped={track?.muted}>
            <span class="flip-face mute-off">M</span>
            <span class="flip-face back mute-on">M</span>
          </span>
        </button>

      </div>

      <!-- Steps -->
      {#if stepSetTrack === trackId}
        <!-- Step-set mode: PO-style grid tap to set step count -->
        <div class="steps step-set-mode" role="application" style="--steps: {STEP_SET_MAX + EXT_STEPS.length}">
          {#each { length: STEP_SET_MAX } as _, stepIdx}
            {@const isActive = stepIdx < ph.steps}
            <button
              class="step step-set-cell"
              class:active={isActive}
              class:current-end={stepIdx === ph.steps - 1}
              aria-label="Set {stepIdx + 1} steps"
              onpointerdown={() => pickStepCount(stepIdx + 1)}
            >
              <span class="step-set-num">{stepIdx + 1}</span>
            </button>
          {/each}
          {#each EXT_STEPS as ext}
            <button
              class="step step-set-cell ext"
              class:active={ph.steps === ext}
              onpointerdown={() => pickStepCount(ext)}
            >
              <span class="step-set-num">{ext}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div
          class="steps"
          role="application"
          style="--steps: {ph.steps}"
          onpointermove={stepOnMove}
          onpointerup={stepEndDrag}
          onpointercancel={stepEndDrag}
          data-tip="Tap or drag to toggle steps" data-tip-ja="タップ/ドラッグでステップを切り替え"
        >
          {#each ph.trigs as trig, stepIdx}
            {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === stepIdx}
            {@const isLockSel = ui.lockMode && ui.selectedTrack === trackId && ui.selectedStep === stepIdx}
            {@const hasLocks = !!(trig.paramLocks && Object.keys(trig.paramLocks).length > 0)}
            <button
              class="step flip-host"
              class:playhead={isPlayhead}
              class:lock-selected={isLockSel}
              aria-label="Step {stepIdx + 1}"
              data-track={trackId}
              data-step={stepIdx}
              onpointerdown={(e) => stepStartDrag(e, trackId, stepIdx)}
              onkeydown={(e) => stepKeydown(e, trackId, stepIdx)}
            >
              <span class="flip-card" class:flipped={trig.active}>
                <span class="flip-face step-off"></span>
                <span class="flip-face back step-on"></span>
              </span>
              {#if hasLocks}<span class="lock-dot"></span>{/if}
              {#if trig.chance != null && trig.chance < 1}<span class="chance-dot"></span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Inline velocity lane for selected track -->
    {#if selected}
      <div
        class="vel-row"
        role="application"
        bind:this={velContainer}
        onpointermove={velOnMove}
        onpointerup={velEndDrag}
        onpointercancel={velEndDrag}
      >
        <div class="track-head">
          <div class="vel-label">
            <span class="vel-name" class:chance-active={chanceMode} role="button" tabindex="0"
              onpointerdown={() => { chanceMode = !chanceMode }}
              data-tip={chanceMode ? "Chance — tap to switch to VEL" : "Velocity — tap to switch to CHNC"}
              data-tip-ja={chanceMode ? "チャンス — タップでVELに切替" : "ベロシティ — タップでCHNCに切替"}
            >{chanceMode ? 'CHNC' : 'VEL'}</span>
          </div>
        </div>
        <div class="vel-bars" class:chance-mode={chanceMode} class:mounting={velMounting} style="--steps: {ph.steps}"
          data-tip={chanceMode ? "Shift+drag to set step probability" : "Drag up/down to adjust velocity"}
          data-tip-ja={chanceMode ? "Shift+ドラッグで発火確率を調整" : "上下ドラッグでベロシティを調整"}
        >
          {#each ph.trigs as trig, i}
            {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === i}
            {@const isActive = trig.active || shrinking.has(`${trackId}-${i}`)}
            {@const barHeight = chanceMode && isActive ? (trig.chance ?? 1) * 100 : trig.velocity * 100}
            {@const hasChance = trig.active && trig.chance != null && trig.chance < 1}
            <div
              class="vel-cell"
              role="slider"
              tabindex="-1"
              aria-valuenow={chanceMode ? (trig.chance ?? 1) : trig.velocity}
              onpointerdown={e => velStartDrag(e, trackId, i)}
            >
              <div
                class="vel-fill"
                class:active={isActive}
                class:growing={growing.has(`${trackId}-${i}`)}
                class:shrinking={shrinking.has(`${trackId}-${i}`)}
                class:playhead={isPlayhead}
                style="height: {barHeight}%{!chanceMode && hasChance ? `; opacity: ${(0.3 + (trig.chance!) * 0.4).toFixed(2)}` : ''}"
              ></div>
            </div>
          {/each}
        </div>
      </div>
      <!-- Inline piano roll for melodic tracks -->
      {#if !isDrum(ph)}
        <div>
          <PianoRoll trackId={trackId} />
        </div>
      {/if}
    {/if}
  {/each}
  {#if song.tracks.length < 16}
    <button
      class="btn-add-track"
      onpointerdown={() => addTrack()}
      data-tip="Add empty track" data-tip-ja="空トラックを追加"
    >+</button>
  {/if}
</div>
</div>


<style>
  .step-grid {
    /* track-label(64) + gap(4) + btn-steps(20) + gap(4) + btn-scale(28) + gap(4) + btn-solo(20) + gap(4) + btn-mute(20) */
    --head-w: 168px;
    position: relative;
    flex: 1;
    min-height: 0;
    background: var(--color-bg);
  }
  .step-grid-scroll {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding: 4px 0;
  }

  /* ── Track head (label + buttons wrapper) ── */
  .track-head {
    width: var(--head-w);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* ── Track row ── */
  .track-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 8px;
    border-bottom: 1px solid rgba(30,32,40,0.08);
    overflow: hidden;
    touch-action: none;
  }
  .track-row.selected {
    background: var(--color-surface);
    border-left: 3px solid var(--color-olive);
    padding-left: 5px;
  }
  .track-row.muted .steps,
  .track-row.solo-muted .steps {
    opacity: 0.35;
    background-image: repeating-linear-gradient(
      45deg,
      rgba(30,32,40,0.07) 0px, rgba(30,32,40,0.07) 1px,
      transparent 1px, transparent 6px
    );
  }

  /* ── Track label (expand toggle) ── */
  .track-label {
    width: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    transition: background 100ms;
  }
  .track-label:hover {
    background: rgba(30,32,40,0.06);
  }
  .track-label.expanded {
    background: rgba(30,32,40,0.08);
  }
  .track-name {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-fg);
    line-height: 1;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    width: 10px;
    height: 6px;
    flex-shrink: 0;
    color: var(--color-muted);
    transition: color 100ms, transform 150ms ease-out;
  }
  .chevron.open {
    transform: rotate(180deg);
  }
  .track-label:hover .chevron {
    color: var(--color-fg);
  }

  /* ── Solo button ── */
  .btn-solo {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    perspective: 60px;
  }
  .solo-off {
    border: 1px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
    font-size: 9px;
  }
  .solo-on {
    border: 1px solid var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
    font-size: 9px;
  }

  /* ── Mute button ── */
  .btn-mute {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    perspective: 60px;
  }
  .mute-off {
    border: 1px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
    font-size: 9px;
  }
  .mute-on {
    border: 1px solid var(--color-fg);
    background: var(--color-fg);
    color: var(--color-bg);
    font-size: 9px;
  }

  /* ── Steps ── */
  .steps {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--steps), 24px);
    gap: 2px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior: none;
    padding: 6px 0;
    height: 100%;
    align-items: center;
  }

  .step {
    position: relative;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    padding: 0;
  }
  .step :global(.flip-card) {
    position: absolute;
    inset: 0;
  }

  .step-off {
    background: var(--color-bg);
    border: 1px solid rgba(30,32,40,0.5);
  }
  .step-on {
    background: var(--color-olive);
    border: 1px solid var(--color-olive);
  }

  /* ── P-Lock indicators ── */
  .step.lock-selected .step-off {
    border-color: var(--color-olive);
    box-shadow: 0 0 0 1px var(--color-olive);
  }
  .step.lock-selected .step-on {
    box-shadow: inset 0 0 0 2px var(--color-bg);
  }
  .lock-dot {
    position: absolute;
    top: 1px;
    right: 1px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-olive);
    z-index: 1;
    pointer-events: none;
  }

  /* ── Playhead glow ── */
  .step.playhead {
    animation: ph-glow 180ms ease-out;
    filter: brightness(1.45);
  }

  /* ── Inline velocity lane ── */
  .vel-row {
    display: flex;
    align-items: stretch;
    height: 40px;
    padding: 0 8px;
    gap: 4px;
    background: var(--color-surface);
    border-bottom: 1px solid rgba(30,32,40,0.08);
    user-select: none;
    border-left: 3px solid var(--color-olive);
    padding-left: 5px;
    overflow: hidden;
  }
  .vel-label {
    margin-left: auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    gap: 2px;
    padding: 0 6px;
  }
  .vel-name {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-fg);
    text-transform: uppercase;
    cursor: pointer;
    user-select: none;
    border: 1px solid var(--color-fg);
    padding: 2px 6px;
    background: transparent;
    transition: color 150ms, border-color 150ms;
  }
  .vel-name:active {
    opacity: 0.6;
  }
  .vel-name.chance-active {
    color: #5b7dba;
    border-color: #5b7dba;
  }
  .btn-scale {
    width: 28px;
    height: 20px;
    flex-shrink: 0;
    border: 1px solid var(--color-olive);
    border-radius: 2px;
    background: transparent;
    font-size: 7px;
    font-weight: 700;
    padding: 0;
    color: var(--color-olive);
    cursor: pointer;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    justify-content: center;
    &:active { opacity: 0.6; }
  }
  .btn-steps {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    font-size: 8px;
    font-weight: 700;
    padding: 0;
    position: relative;
  }
  .steps-off {
    border: 1px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 700;
  }
  .steps-on {
    border: 1px solid var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 700;
  }
  .vel-bars {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--steps), 24px);
    gap: 2px;
    padding: 4px 0;
  }
  .vel-cell {
    display: flex;
    align-items: flex-end;
    width: 24px;
    cursor: ns-resize;
  }
  .vel-fill {
    width: 100%;
    background: rgba(237,232,220,0.12);
    border-radius: 1px 1px 0 0;
    transition: height 180ms ease-out;
    min-height: 2px;
    transform-origin: bottom;
  }
  .vel-fill.active {
    background: var(--color-olive);
    opacity: 0.7;
  }
  .vel-bars.mounting .vel-fill.active {
    animation: vel-bar-grow 180ms ease-out;
  }
  .vel-fill.growing {
    animation: vel-bar-grow 180ms ease-out;
  }
  .vel-fill.shrinking {
    animation: vel-bar-shrink 180ms ease-out forwards;
  }

  @keyframes vel-bar-grow {
    from { transform: scaleY(0); }
    to   { transform: scaleY(1); }
  }
  @keyframes vel-bar-shrink {
    from { transform: scaleY(1); }
    to   { transform: scaleY(0); }
  }
  .vel-fill.playhead {
    animation: vel-glow 180ms ease-out;
    filter: brightness(1.45);
  }

  /* ── Chance mode (Shift+drag) ── */
  .vel-bars.chance-mode .vel-fill.active {
    background: #5b7dba;
  }
  .chance-dot {
    position: absolute;
    bottom: 1px;
    left: 1px;
    width: 4px;
    height: 4px;
    background: #5b7dba;
    transform: rotate(45deg);
    z-index: 1;
    pointer-events: none;
  }

  /* ── Add track ── */
  .btn-add-track {
    width: 24px;
    height: 24px;
    margin: 4px 8px;
    border: 1px dashed rgba(30,32,40,0.2);
    background: transparent;
    color: var(--color-muted);
    font-size: 14px;
    cursor: pointer;
    transition: color 80ms, border-color 80ms;
  }
  .btn-add-track:hover {
    color: var(--color-olive);
    border-color: var(--color-olive);
  }

  /* ── Step-set mode ── */
  .step-set-mode {
    background: rgba(30, 32, 40, 0.04);
    border-radius: 2px;
  }
  .step-set-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    border: 1px solid rgba(30, 32, 40, 0.2);
    cursor: pointer;
    transition: background 60ms, border-color 60ms;
  }
  .step-set-cell.active {
    background: rgba(120, 120, 69, 0.15);
    border-color: rgba(120, 120, 69, 0.4);
  }
  .step-set-cell.current-end {
    border-color: var(--color-olive);
    box-shadow: 0 0 0 1px var(--color-olive);
  }
  .step-set-cell:hover {
    background: rgba(120, 120, 69, 0.3);
    border-color: var(--color-olive);
  }
  .step-set-cell.ext {
    border-style: dashed;
  }
  .step-set-num {
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    color: rgba(30, 32, 40, 0.5);
    pointer-events: none;
  }
  .step-set-cell.active .step-set-num {
    color: var(--color-olive);
  }
  .step-set-cell.current-end .step-set-num {
    color: var(--color-fg);
  }

</style>
