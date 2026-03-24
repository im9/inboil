<script lang="ts">
  import { song, playback, ui, selectPattern, patternHasData, patternDensity, patternUsedInScene } from '../state.svelte.ts'
  import { soloPatternIndex } from '../scenePlayback.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import { isGuest, guestSelectPattern } from '../multiDevice/guest.ts'

  function handleSelectPattern(pi: number) {
    if (isGuest()) { guestSelectPattern(pi); return }
    selectPattern(pi)
  }

  const currentlyPlayingPattern = $derived.by(() => {
    if (!playback.playing) return -1
    const soloIdx = soloPatternIndex()
    if (soloIdx != null) return soloIdx
    if (playback.mode === 'scene') {
      if (playback.playingPattern != null) return playback.playingPattern
      return -1
    }
    return playback.playingPattern ?? ui.currentPattern
  })

  // Only show patterns that have data or are near the selection
  const visibleCount = $derived(Math.max(
    ui.currentPattern + 2,
    song.patterns.findLastIndex((_, i) => patternHasData(i)) + 2,
    4,
  ))

  let scrollEl: HTMLDivElement | undefined = $state()

  // Auto-scroll selected pattern into view
  $effect(() => {
    const idx = ui.currentPattern
    if (!scrollEl) return
    const cell = scrollEl.children[idx] as HTMLElement | undefined
    cell?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  })
</script>

<div class="mobile-matrix">
  <div class="matrix-strip" bind:this={scrollEl}>
    {#each { length: visibleCount } as _, pi}
      {@const hasData = patternHasData(pi)}
      {@const d = patternDensity(pi)}
      {@const pc = song.patterns[pi]?.color ?? 0}
      {@const isSelected = ui.currentPattern === pi}
      {@const isPlaying = currentlyPlayingPattern === pi}
      {@const isQueued = playback.queuedPattern === pi}
      {@const inScene = patternUsedInScene(pi)}
      <button
        class="m-cell"
        class:has-data={hasData}
        class:selected={isSelected}
        class:playing={isPlaying}
        class:queued={isQueued}
        class:in-scene={inScene}
        style="--d: {d}; --pat-hex: {PATTERN_COLORS[pc]}; --beat: {30 / song.bpm}s"
        onpointerdown={() => handleSelectPattern(pi)}
      >
        {#if inScene}<span class="scene-dot"></span>{/if}
      </button>
    {/each}
  </div>
  <span class="matrix-name">{song.patterns[ui.currentPattern]?.name || `PAT ${String(ui.currentPattern).padStart(2, '0')}`}</span>
</div>

<style>
  .mobile-matrix {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--lz-border-subtle);
    flex-shrink: 0;
  }

  .matrix-strip {
    display: flex;
    gap: 3px;
    overflow-x: auto;
    flex: 1;
    min-width: 0;
    scrollbar-width: none;
  }
  .matrix-strip::-webkit-scrollbar { display: none; }

  .m-cell {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    position: relative;
    border: 1px solid var(--lz-text-hint);
    background: var(--color-bg);
    padding: 0;
    cursor: pointer;
    transition: border-color 40ms;
  }
  .m-cell.has-data,
  .m-cell.in-scene {
    background: var(--pat-hex);
  }
  .m-cell.selected {
    border: 2px solid var(--color-fg);
  }
  .m-cell.playing {
    border-color: var(--color-olive);
    animation: m-pulse var(--beat, 0.25s) ease-in-out infinite alternate;
  }
  .m-cell.playing.selected {
    border-width: 2px;
    border-color: var(--color-olive);
  }
  .m-cell.queued {
    border: 2px dashed var(--color-olive);
    animation: m-pulse var(--beat, 0.25s) ease-in-out infinite alternate;
  }
  @keyframes m-pulse {
    from { opacity: 1; }
    to   { opacity: 0.4; }
  }

  .scene-dot {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--color-olive);
    opacity: 0.7;
  }

  .matrix-name {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--lz-text);
    white-space: nowrap;
    flex-shrink: 0;
    max-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
  }
</style>
