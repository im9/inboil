<script lang="ts">
  import { onDestroy } from 'svelte'
  import { pattern, playback, ui, toggleTrig, toggleMute, setTrigVelocity, setTrackSteps, STEP_OPTIONS } from '../state.svelte.ts'
  import Knob from './Knob.svelte'

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
    const cellWidth = rect.width / track.steps
    const idx = Math.max(0, Math.min(track.steps - 1, Math.floor(relX / cellWidth)))
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
      >
        <span class="track-name">{track.name}</span>
        <span class="track-type">{track.synthType.replace('Synth', '').replace('Analog', 'ANA')}</span>
      </button>

      <!-- Gain, Pan, Mute -->
      <div class="track-knobs">
        <Knob
          value={track.volume}
          label="VOL"
          size={20}
          light
          compact
          onchange={v => { pattern.tracks[trackId].volume = v }}
        />
        <Knob
          value={(track.pan + 1) / 2}
          label="PAN"
          size={20}
          light
          compact
          onchange={v => { pattern.tracks[trackId].pan = v * 2 - 1 }}
        />
      </div>
      <button
        class="btn-mute"
        onpointerdown={() => toggleMute(trackId)}
      >
        <span class="mute-flip" class:flipped={track.muted}>
          <span class="face off">M</span>
          <span class="face on">M</span>
        </span>
      </button>

      <!-- Steps -->
      <div class="steps" style="--count: {track.steps}">
        {#each track.trigs as trig, stepIdx}
          {@const isPlayhead = playback.playing && playback.playheads[trackId] === stepIdx}
          <button
            class="step"
            class:playhead={isPlayhead}
            onpointerdown={() => handleToggle(trackId, stepIdx)}
          >
            <span class="step-flip" class:flipped={trig.active}>
              <span class="face off"></span>
              <span class="face on"></span>
            </span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Inline velocity lane for selected track -->
    {#if selected}
      <div
        class="vel-row"
        bind:this={velContainer}
        onpointermove={velOnMove}
        onpointerup={velEndDrag}
        onpointercancel={velEndDrag}
      >
        <div class="vel-label">
          <span class="vel-name">VEL</span>
          <button class="step-count" onpointerdown={() => cycleSteps(trackId)}>{track.steps}</button>
        </div>
        <div class="vel-spacer"></div>
        <div class="vel-bars" style="--count: {track.steps}">
          {#each track.trigs as trig, i}
            {@const isPlayhead = playback.playing && playback.playheads[trackId] === i}
            <div
              class="vel-cell"
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
    grid-template-columns: repeat(var(--count), 1fr);
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
    width: 100%;
    aspect-ratio: 1;
    max-width: 28px;
    min-width: 14px;
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
    grid-template-columns: repeat(var(--count), 1fr);
    gap: 2px;
    padding: 4px 0;
  }
  .vel-cell {
    display: flex;
    align-items: flex-end;
    max-width: 28px;
    min-width: 14px;
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
