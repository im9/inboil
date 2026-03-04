<script lang="ts">
  import { onDestroy } from 'svelte'
  import { pattern, playback, ui, toggleTrig, toggleMute, toggleSolo, setTrigVelocity, setTrigChance, setTrackSteps, isDrum, STEP_OPTIONS } from '../state.svelte.ts'
  import PianoRoll from './PianoRoll.svelte'

  function cycleSteps(trackId: number) {
    const current = pattern.tracks[trackId].phrases[0].steps
    const idx = STEP_OPTIONS.indexOf(current as typeof STEP_OPTIONS[number])
    setTrackSteps(trackId, STEP_OPTIONS[(idx + 1) % STEP_OPTIONS.length])
  }

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
    const track = pattern.tracks[trackId]
    const rect = barsEl.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const idx = Math.max(0, Math.min(track.phrases[0].steps - 1, Math.floor(relX / 26)))
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

  // ── Vel-fill grow/shrink animation on trig toggle ──
  let growing: Set<string> = $state(new Set())
  let shrinking: Set<string> = $state(new Set())
  const timers = new Map<string, number>()

  onDestroy(() => { timers.forEach(id => clearTimeout(id)); timers.clear() })

  function handleToggle(trackId: number, stepIdx: number) {
    const trig = pattern.tracks[trackId].phrases[0].trigs[stepIdx]
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
    const trig = pattern.tracks[trackId].phrases[0].trigs[stepIdx]
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
    const track = pattern.tracks[stepDragTrack]
    const idx = Math.max(0, Math.min(track.phrases[0].steps - 1, Math.floor(relX / 26)))
    if (stepVisited.has(idx)) return
    stepVisited.add(idx)
    const trig = track.phrases[0].trigs[idx]
    if (stepPaintOn && !trig.active) handleToggle(stepDragTrack, idx)
    else if (!stepPaintOn && trig.active) handleToggle(stepDragTrack, idx)
  }

  function stepEndDrag() {
    stepDragging = false
    stepStepsEl = null
  }
</script>

<div class="step-grid">
  {#each pattern.tracks as track, trackId}
    {@const selected = ui.selectedTrack === trackId}

    <div
      class="track-row"
      class:selected
      class:muted={track.muted}
      class:solo-muted={ui.soloTracks.size > 0 && !ui.soloTracks.has(trackId)}
    >
      <div class="track-head">
        <!-- Track label -->
        <button
          class="track-label"
          onpointerdown={() => { ui.selectedTrack = trackId }}
          data-tip="Select track to edit" data-tip-ja="トラックを選択"
        >
          <span class="track-name">{track.name}</span>
          <span class="track-type">{track.synthType.replace('Synth', '').replace('Analog', 'ANA')}</span>
        </button>

        <!-- Step count -->
        <button
          class="btn-steps"
          onpointerdown={() => cycleSteps(trackId)}
          data-tip="Change step count" data-tip-ja="ステップ数を変更"
        >{track.phrases[0].steps}</button>

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
          <span class="flip-card" class:flipped={track.muted}>
            <span class="flip-face mute-off">M</span>
            <span class="flip-face back mute-on">M</span>
          </span>
        </button>
      </div>

      <!-- Steps -->
      <div
        class="steps"
        role="application"
        style="--steps: {track.phrases[0].steps}"
        onpointermove={stepOnMove}
        onpointerup={stepEndDrag}
        onpointercancel={stepEndDrag}
        data-tip="Tap or drag to toggle steps" data-tip-ja="タップ/ドラッグでステップを切り替え"
      >
        {#each track.phrases[0].trigs as trig, stepIdx}
          {@const isPlayhead = playback.playing && playback.playheads[trackId] === stepIdx}
          {@const isLockSel = ui.lockMode && ui.selectedTrack === trackId && ui.selectedStep === stepIdx}
          {@const hasLocks = !!(trig.paramLocks && Object.keys(trig.paramLocks).length > 0)}
          <button
            class="step flip-host"
            class:playhead={isPlayhead}
            class:lock-selected={isLockSel}
            aria-label="Step {stepIdx + 1}"
            onpointerdown={(e) => stepStartDrag(e, trackId, stepIdx)}
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
            <span class="vel-name" class:chance-active={chanceMode}
              onpointerdown={() => { chanceMode = !chanceMode }}
              data-tip={chanceMode ? "Chance — tap to switch to VEL" : "Velocity — tap to switch to CHNC"}
              data-tip-ja={chanceMode ? "チャンス — タップでVELに切替" : "ベロシティ — タップでCHNCに切替"}
            >{chanceMode ? 'CHNC' : 'VEL'}</span>
          </div>
        </div>
        <div class="vel-bars" class:chance-mode={chanceMode} style="--steps: {track.phrases[0].steps}"
          data-tip={chanceMode ? "Shift+drag to set step probability" : "Drag up/down to adjust velocity"}
          data-tip-ja={chanceMode ? "Shift+ドラッグで発火確率を調整" : "上下ドラッグでベロシティを調整"}
        >
          {#each track.phrases[0].trigs as trig, i}
            {@const isPlayhead = playback.playing && playback.playheads[trackId] === i}
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
      {#if !isDrum(track)}
        <PianoRoll trackId={trackId} />
      {/if}
    {/if}
  {/each}
</div>

<style>
  .step-grid {
    /* track-label(64) + gap(4) + btn-steps(20) + gap(4) + btn-solo(20) + gap(4) + btn-mute(20) */
    --head-w: 136px;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: none;
    background: var(--color-bg);
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
    overscroll-behavior: none;
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

  /* ── Track label ── */
  .track-label {
    width: 64px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 6px;
    border: none;
    background: transparent;
    text-align: left;
  }
  .track-name {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-fg);
    line-height: 1;
    text-transform: uppercase;
  }
  .track-type {
    font-size: 9px;
    color: var(--color-muted);
    line-height: 1;
    text-transform: uppercase;
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
    touch-action: none;
    user-select: none;
    border-left: 3px solid var(--color-olive);
    padding-left: 5px;
    animation: vel-expand 180ms ease-out;
    transform-origin: bottom;
    overflow: hidden;
  }

  @keyframes vel-expand {
    from {
      height: 0;
      opacity: 0;
    }
    to {
      height: 40px;
      opacity: 1;
    }
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
    color: var(--color-muted);
    text-transform: uppercase;
    cursor: pointer;
    user-select: none;
    border: 1px solid var(--color-muted);
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
  .btn-steps {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: 1px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    font-size: 8px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .btn-steps:active {
    background: var(--color-olive);
    color: var(--color-bg);
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

</style>
