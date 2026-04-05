<script lang="ts">
  import { song, ui, cellForTrack, playback, pushUndo } from '../state.svelte.ts'
  import { toggleTrig } from '../stepActions.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'

  const {
    trackId,
  }: {
    trackId: number
  } = $props()

  const cell = $derived(cellForTrack(song.patterns[ui.currentPattern], trackId))
  const steps = $derived(cell?.steps ?? 16)
  const trigs = $derived(cell?.trigs ?? [])

  // Paging (16 steps per page)
  const PAGE_SIZE = 16
  let page = $state(0)
  const totalPages = $derived(Math.ceil(steps / PAGE_SIZE))
  const needsPaging = $derived(steps > PAGE_SIZE)
  const pageStart = $derived(page * PAGE_SIZE)
  const displayCount = $derived(Math.min(PAGE_SIZE, steps - pageStart))

  // Clamp page when steps change
  $effect(() => {
    if (page >= totalPages) page = Math.max(0, totalPages - 1)
  })

  // Auto-follow playhead
  $effect(() => {
    if (!playback.playing || !needsPaging) return
    const head = playback.playheads[trackId]
    if (head == null) return
    const headPage = Math.floor(head / PAGE_SIZE)
    if (headPage !== page) page = headPage
  })

  function stepDown(stepIdx: number) {
    if (ui.lockMode) {
      // P-Lock: select/deselect step
      ui.selectedTrack = trackId
      ui.selectedStep = ui.selectedStep === stepIdx ? null : stepIdx
      return
    }
    pushUndo('Toggle step')
    toggleTrig(trackId, stepIdx)
  }
</script>

{#if cell}
<div class="step-wrap">
  <div class="step-header">
    <span class="step-title">STEP</span>
    {#if needsPaging}
      <div class="page-row">
        {#each { length: totalPages } as _, p}
          <button
            class="page-btn"
            class:active={p === page}
            aria-label="Page {p + 1}"
            onpointerdown={() => page = p}
          >{p + 1}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="step-line">

    <div class="steps" style="--steps: {displayCount}">
    {#each { length: displayCount } as _, i}
      {@const stepIdx = pageStart + i}
      {@const trig = trigs[stepIdx]}
      {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === stepIdx}
      {@const isLockSel = ui.lockMode && ui.selectedStep === stepIdx}
      {@const hasLocks = !!(trig?.paramLocks && Object.keys(trig.paramLocks).length > 0)}
      <button
        class="step"
        class:playhead={isPlayhead}
        class:lock-selected={isLockSel}
        aria-label="Step {stepIdx + 1}"
        onpointerdown={() => stepDown(stepIdx)}
      >
        <span class="flip-card" class:flipped={trig?.active}>
          <span class="flip-face step-off"></span>
          <span class="flip-face back step-on">
            {#if hasLocks}<span class="lock-dot"></span>{/if}
          </span>
        </span>
      </button>
    {/each}
    </div>
  </div>
</div>
{/if}

<style>
  .step-wrap {
    flex-shrink: 0;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 4px;
  }

  .step-title {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lz-text-hint);
    opacity: 0.5;
  }

  .step-line {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .page-row {
    display: flex;
    gap: 4px;
    justify-content: center;
    padding: 2px 8px 0;
  }

  .page-btn {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    padding: 1px 6px;
    border: 1px solid var(--lz-step-border);
    background: transparent;
    color: var(--lz-text-hint);
    cursor: pointer;
  }

  .page-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }

  /* Steps */
  .steps {
    display: grid;
    grid-template-columns: repeat(var(--steps), 32px);
    gap: 2px;
    align-items: center;
  }

  .step {
    position: relative;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;
  }

  .step :global(.flip-card) {
    position: absolute;
    inset: 0;
  }

  .step-off {
    background: var(--color-bg);
    border: 1px solid var(--lz-step-border);
  }

  .step-on {
    background: var(--color-olive);
    border: 1px solid var(--color-olive);
  }

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
    background: var(--color-bg);
    pointer-events: none;
  }

  .step.playhead {
    animation: ph-glow 180ms ease-out;
    filter: brightness(1.45);
  }

  @keyframes ph-glow {
    from { filter: brightness(2); }
    to   { filter: brightness(1.45); }
  }
</style>
