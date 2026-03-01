<script lang="ts">
  import { onDestroy } from 'svelte'
  import { pattern, playback, ui, toggleTrig, toggleMute, setTrigVelocity, setTrackSteps, isDrum, STEP_OPTIONS } from '../state.svelte.ts'
  import Knob from './Knob.svelte'
  import PianoRoll from './PianoRoll.svelte'

  function cycleSteps(trackId: number) {
    const current = pattern.tracks[trackId].steps
    const idx = STEP_OPTIONS.indexOf(current as typeof STEP_OPTIONS[number])
    const next = STEP_OPTIONS[(idx + 1) % STEP_OPTIONS.length]
    setTrackSteps(trackId, next)
  }

  // ── Velocity drag state ──
  let velContainer: HTMLDivElement | undefined = $state(undefined)
  let velDragging = $state(false)

  function velStartDrag(e: PointerEvent, trackId: number, idx: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
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
    const idx = Math.max(0, Math.min(track.steps - 1, Math.floor(relX / 26)))
    velApply(e, trackId, idx)
  }

  function velApply(e: PointerEvent, trackId: number, idx: number) {
    const barsEl = velContainer?.querySelector('.vel-bars') as HTMLElement
    if (!barsEl) return
    const cell = barsEl.children[idx] as HTMLElement
    if (!cell) return
    const rect = cell.getBoundingClientRect()
    const v = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    setTrigVelocity(trackId, idx, v)
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
    const trig = pattern.tracks[trackId].trigs[stepIdx]
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
    const trig = pattern.tracks[trackId].trigs[stepIdx]
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
    const idx = Math.max(0, Math.min(track.steps - 1, Math.floor(relX / 26)))
    if (stepVisited.has(idx)) return
    stepVisited.add(idx)
    const trig = track.trigs[idx]
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
    >
      <!-- Track label -->
      <button
        class="track-label"
        onpointerdown={() => { ui.selectedTrack = trackId }}
        data-tip="Select track to edit" data-tip-ja="トラックを選択"
      >
        <span class="track-name">{track.name}</span>
        <span class="track-type">{track.synthType.replace('Synth', '').replace('Analog', 'ANA')}</span>
      </button>

      <!-- Gain, Pan, Mute -->
      <div class="track-knobs">
        <span data-tip="Track volume" data-tip-ja="トラック音量">
        <Knob
          value={track.volume}
          label="VOL"
          size={20}
          light
          compact
          onchange={v => { pattern.tracks[trackId].volume = v }}
        />
        </span>
        <span data-tip="Stereo panning" data-tip-ja="ステレオパン">
        <Knob
          value={(track.pan + 1) / 2}
          label="PAN"
          size={20}
          light
          compact
          onchange={v => { pattern.tracks[trackId].pan = v * 2 - 1 }}
        />
        </span>
      </div>
      <button
        class="btn-mute"
        onpointerdown={() => toggleMute(trackId)}
        data-tip="Mute/unmute track" data-tip-ja="トラックをミュート"
      >
        <span class="mute-flip" class:flipped={track.muted}>
          <span class="face off">M</span>
          <span class="face on">M</span>
        </span>
      </button>

      <!-- Steps -->
      <div
        class="steps"
        role="application"
        style="--steps: {track.steps}"
        onpointermove={stepOnMove}
        onpointerup={stepEndDrag}
        onpointercancel={stepEndDrag}
        data-tip="Tap or drag to toggle steps" data-tip-ja="タップ/ドラッグでステップを切り替え"
      >
        {#each track.trigs as trig, stepIdx}
          {@const isPlayhead = playback.playing && playback.playheads[trackId] === stepIdx}
          {@const isLockSel = ui.lockMode && ui.selectedTrack === trackId && ui.selectedStep === stepIdx}
          {@const hasLocks = !!(trig.paramLocks && Object.keys(trig.paramLocks).length > 0)}
          <button
            class="step"
            class:playhead={isPlayhead}
            class:lock-selected={isLockSel}
            aria-label="Step {stepIdx + 1}"
            onpointerdown={(e) => stepStartDrag(e, trackId, stepIdx)}
          >
            <span class="step-flip" class:flipped={trig.active}>
              <span class="face off"></span>
              <span class="face on"></span>
            </span>
            {#if hasLocks}<span class="lock-dot"></span>{/if}
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
        <div class="vel-label">
          <span class="vel-name" data-tip="Velocity — per-step volume" data-tip-ja="ベロシティ (各ステップの音量)">VEL</span>
          <button class="step-count" onpointerdown={() => cycleSteps(trackId)} data-tip="Change step count" data-tip-ja="ステップ数を変更">{track.steps}</button>
        </div>
        <div class="vel-spacer"></div>
        <div class="vel-bars" style="--steps: {track.steps}" data-tip="Drag up/down to adjust velocity" data-tip-ja="上下ドラッグでベロシティを調整">
          {#each track.trigs as trig, i}
            {@const isPlayhead = playback.playing && playback.playheads[trackId] === i}
            <div
              class="vel-cell"
              role="slider"
              tabindex="-1"
              aria-valuenow={trig.velocity}
              onpointerdown={e => velStartDrag(e, trackId, i)}
            >
              <div
                class="vel-fill"
                class:active={trig.active || shrinking.has(`${trackId}-${i}`)}
                class:growing={growing.has(`${trackId}-${i}`)}
                class:shrinking={shrinking.has(`${trackId}-${i}`)}
                class:playhead={isPlayhead}
                style="height: {trig.velocity * 100}%"
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
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: none;
    background: var(--color-bg);
    padding: 4px 0;
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
  .track-row.muted .steps {
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
    flex-shrink: 0;
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

  /* ── Mute button (Othello flip) ── */
  .btn-mute {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    perspective: 60px;
  }
  .mute-flip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    position: relative;
    transform-style: preserve-3d;
    transition: transform 180ms ease-out;
  }
  .mute-flip.flipped {
    transform: rotateY(180deg);
  }
  .btn-mute:active .mute-flip { transform: scale(0.85); }
  .btn-mute:active .mute-flip.flipped { transform: rotateY(180deg) scale(0.85); }
  .mute-flip > .face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    backface-visibility: hidden;
  }
  .mute-flip > .face.off {
    border: 1px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
  }
  .mute-flip > .face.on {
    border: 1px solid var(--color-fg);
    background: var(--color-fg);
    color: var(--color-bg);
    transform: rotateY(180deg);
  }

  .track-knobs {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 2px;
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
    perspective: 80px;
    border: none;
    background: transparent;
    padding: 0;
  }

  .step-flip {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transition: transform 180ms ease-out;
  }
  .step-flip.flipped {
    transform: rotateY(180deg);
  }
  .step:active .step-flip { transform: scale(0.85); }
  .step:active .step-flip.flipped { transform: rotateY(180deg) scale(0.85); }

  .face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
  }
  .face.off {
    background: var(--color-bg);
    border: 1px solid rgba(30,32,40,0.5);
  }
  .face.on {
    background: var(--color-olive);
    border: 1px solid var(--color-olive);
    transform: rotateY(180deg);
  }

  /* ── P-Lock indicators ── */
  .step.lock-selected .face.off {
    border-color: var(--color-olive);
    box-shadow: 0 0 0 1px var(--color-olive);
  }
  .step.lock-selected .face.on {
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

  @keyframes ph-glow {
    0%   { filter: brightness(1.5); }
    100% { filter: brightness(1); }
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
    width: 64px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 0 6px;
  }
  .vel-name {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-muted);
    text-transform: uppercase;
  }
  .step-count {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-olive);
    background: transparent;
    border: 1px solid var(--color-olive);
    padding: 0 4px;
    line-height: 14px;
    width: fit-content;
    text-align: center;
    cursor: pointer;
  }
  .step-count:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .vel-spacer {
    width: calc(20px + 2px + 20px + 4px + 20px);
    flex-shrink: 0;
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
    transition: height 40ms;
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

  @keyframes vel-glow {
    0%   { filter: brightness(1.5); }
    100% { filter: brightness(1); }
  }

</style>
