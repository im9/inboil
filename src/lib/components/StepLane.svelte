<script lang="ts">
  import { pattern, playback, setTrigVelocity } from '../state.svelte.ts'

  let { trackId }: { trackId: number } = $props()

  const track = $derived(pattern.tracks[trackId])

  let containerEl: HTMLDivElement
  let dragging = $state(false)

  function startDrag(e: PointerEvent, idx: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragging = true
    applyVelocity(e, idx)
  }

  function onMove(e: PointerEvent) {
    if (!dragging || !containerEl) return
    // Resolve which bar cell we're over (horizontal sweep)
    const barsEl = containerEl.querySelector('.bars') as HTMLElement
    if (!barsEl) return
    const rect = barsEl.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const cellWidth = rect.width / track.steps
    const idx = Math.max(0, Math.min(track.steps - 1, Math.floor(relX / cellWidth)))
    applyVelocity(e, idx)
  }

  function applyVelocity(e: PointerEvent, idx: number) {
    // Find the bar cell element for this index to get its rect
    const barsEl = containerEl?.querySelector('.bars') as HTMLElement
    if (!barsEl) return
    const cells = barsEl.children
    const cell = cells[idx] as HTMLElement
    if (!cell) return
    const rect = cell.getBoundingClientRect()
    // bottom = 0, top = 1
    const v = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    setTrigVelocity(trackId, idx, v)
  }

  function endDrag() {
    dragging = false
  }
</script>

<div
  class="step-lane"
  role="application"
  bind:this={containerEl}
  onpointermove={onMove}
  onpointerup={endDrag}
  onpointercancel={endDrag}
>
  <div class="lane-label">
    <span class="lane-name">VEL</span>
  </div>
  <div class="lane-spacer"></div>
  <div class="bars" style="--steps: {track.steps}">
    {#each track.trigs as trig, i}
      {@const isPlayhead = playback.playing && playback.playheads[trackId] === i}
      <div
        class="bar-cell"
        role="slider"
        tabindex="-1"
        aria-valuenow={trig.velocity}
        onpointerdown={e => startDrag(e, i)}
      >
        <div
          class="bar-fill"
          class:active={trig.active}
          class:playhead={isPlayhead}
          style="height: {trig.velocity * 100}%"
        ></div>
      </div>
    {/each}
  </div>
</div>

<style>
  .step-lane {
    display: flex;
    align-items: stretch;
    height: 48px;
    padding: 0 8px;
    gap: 4px;
    background: var(--color-bg);
    border-top: 1px solid rgba(30,32,40,0.12);
    flex-shrink: 0;
    touch-action: none;
    user-select: none;
  }
  .lane-label {
    width: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 6px;
  }
  .lane-name {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-muted);
    text-transform: uppercase;
  }
  /* Spacer matching track-knobs (2×20px + 2px gap) + mute (20px) + gap (4px) */
  .lane-spacer {
    width: calc(20px + 2px + 20px + 4px + 20px);
    flex-shrink: 0;
  }
  .bars {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--steps), 1fr);
    gap: 2px;
    padding: 4px 0;
  }
  .bar-cell {
    display: flex;
    align-items: flex-end;
    max-width: 28px;
    min-width: 14px;
    cursor: ns-resize;
  }
  .bar-fill {
    width: 100%;
    background: rgba(237,232,220,0.12);
    border-radius: 1px 1px 0 0;
    transition: height 40ms;
    min-height: 2px;
  }
  .bar-fill.active {
    background: var(--color-olive);
    opacity: 0.7;
  }
  .bar-fill.playhead {
    animation: vel-glow 180ms ease-out;
  }

  @keyframes vel-glow {
    0%   { filter: brightness(1.5); }
    100% { filter: brightness(1); }
  }
</style>
