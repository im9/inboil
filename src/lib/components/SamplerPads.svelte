<script lang="ts">
  import { engine } from '../audio/engine.ts'

  const {
    trackId,
    chopSlices = 0,
    rootNote = 60,
  }: {
    trackId: number
    chopSlices: number
    rootNote: number
  } = $props()

  // Pad count adapts to chop slices: 0 = 1 pad, 8/16/32 slices
  const padCount = $derived(chopSlices > 0 ? chopSlices : 16)
  const cols = $derived(padCount <= 4 ? padCount : padCount <= 8 ? 4 : 4)

  let activePad: number | null = $state(null)

  function padDown(index: number, e: PointerEvent) {
    activePad = index
    const note = rootNote + index
    // Use pressure for velocity if available (pen/touch), otherwise 0.8
    const vel = e.pressure > 0 && e.pressure < 1 ? e.pressure : 0.8
    engine.triggerNote(trackId, note, vel)
  }

  function padUp() {
    if (activePad != null) {
      engine.releaseNote(trackId)
      activePad = null
    }
  }
</script>

<div class="pads-grid" style="--cols: {cols}">
  {#each Array(padCount) as _, i}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pad"
      class:active={activePad === i}
      onpointerdown={e => padDown(i, e)}
      onpointerup={padUp}
      onpointerleave={padUp}
      onpointercancel={padUp}
    >
      <span class="pad-num">{i + 1}</span>
    </div>
  {/each}
</div>

<style>
  .pads-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 2px;
    aspect-ratio: 1;
    height: 100%;
    touch-action: none;
    user-select: none;
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

  @media (max-width: 639px) {
    .pads-grid {
      height: auto;
      width: 100%;
      max-width: 200px;
    }
  }

  .pad-num {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    opacity: 0.4;
    pointer-events: none;
  }
</style>
