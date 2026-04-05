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

  function toggle(stepIdx: number) {
    pushUndo('Toggle step')
    toggleTrig(trackId, stepIdx)
  }
</script>

{#if cell}
<div class="step-wrap">
  {#if needsPaging}
    <div class="page-row">
      {#each { length: totalPages } as _, p}
        <button
          class="page-dot"
          class:active={p === page}
          aria-label="Page {p + 1}"
          onpointerdown={() => page = p}
        ></button>
      {/each}
    </div>
  {/if}

  <div class="steps" style="--steps: {displayCount}">
    {#each { length: displayCount } as _, i}
      {@const stepIdx = pageStart + i}
      {@const trig = trigs[stepIdx]}
      {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === stepIdx}
      <button
        class="step"
        class:on={trig?.active}
        class:playhead={isPlayhead}
        aria-label="Step {stepIdx + 1}"
        onpointerdown={() => toggle(stepIdx)}
      ></button>
    {/each}
  </div>
</div>
{/if}

<style>
  .step-wrap {
    flex-shrink: 0;
  }

  .page-row {
    display: flex;
    gap: 4px;
    justify-content: center;
    padding: 2px 8px 0;
  }

  .page-dot {
    width: 16px;
    height: 4px;
    border: none;
    background: var(--lz-step-border);
    cursor: pointer;
    padding: 0;
    opacity: 0.3;
  }

  .page-dot.active {
    background: var(--color-olive);
    opacity: 1;
  }

  .page-dot:hover {
    opacity: 0.7;
  }

  /* Steps — matching StepGrid exactly */
  .steps {
    display: grid;
    grid-template-columns: repeat(var(--steps), 24px);
    gap: 2px;
    height: 40px;
    padding: 6px 0;
    align-items: center;
    justify-content: center;
  }

  .step {
    width: 24px;
    height: 24px;
    border: 1px solid var(--lz-step-border);
    background: var(--color-bg);
    cursor: pointer;
    padding: 0;
  }

  .step:hover {
    border-color: var(--lz-text-hint);
  }

  .step.on {
    background: var(--color-olive);
    border-color: var(--color-olive);
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
