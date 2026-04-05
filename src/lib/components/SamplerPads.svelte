<script lang="ts">
  import { engine } from '../audio/engine.ts'

  const {
    trackId,
    rootNote = 60,
    activeSlice = -1,
    onpadtap,
  }: {
    trackId: number
    rootNote: number
    activeSlice: number
    onpadtap?: (padIndex: number, note: number) => void
  } = $props()

  // Always 4×4 = 16 pads (MPC-style, ADR 130 spec)
  const padCount = 16

  let activePad: number | null = $state(null)

  function padDown(index: number, e: PointerEvent) {
    activePad = index
    const note = rootNote + index
    const vel = e.pressure > 0 && e.pressure < 1 ? e.pressure : 0.8
    engine.triggerNote(trackId, note, vel)
    onpadtap?.(index, note)
  }

  function padUp() {
    if (activePad != null) {
      engine.releaseNote(trackId)
      activePad = null
    }
  }
</script>

<div class="pads-wrap">
<span class="pads-label">PADS</span>
<div class="pads-grid">
  {#each Array(padCount) as _, i}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pad"
      class:active={activePad === i}
      class:playing={activeSlice === i}
      onpointerdown={e => padDown(i, e)}
      onpointerup={padUp}
      onpointerleave={padUp}
      onpointercancel={padUp}
    >
      <span class="pad-num">{i + 1}</span>
    </div>
  {/each}
</div>
</div>

<style>
  .pads-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    height: 100%;
  }

  .pads-label {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lz-text-hint);
    opacity: 0.5;
  }

  .pads-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 1fr);
    gap: 2px;
    touch-action: none;
    user-select: none;
    flex: 1;
    min-height: 0;
  }

  .pad {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    border: 1px solid var(--lz-step-border);
    cursor: pointer;
    transition: background 60ms;
  }

  .pad:hover {
    border-color: var(--lz-text-hint);
  }

  .pad.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
  }

  .pad.playing {
    border-color: var(--color-olive);
    box-shadow: inset 0 0 0 1px var(--color-olive);
  }

  .pad-num {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    opacity: 0.4;
    pointer-events: none;
  }
</style>
