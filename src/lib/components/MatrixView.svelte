<script lang="ts">
  import { song, playback, ui, selectPattern, sceneAddNode, patternHasData, patternDensity, patternUsedInScene, patternCopy, patternPaste, patternClear } from '../state.svelte.ts'

  // Show all patterns in the pool
  const visibleCount = $derived(song.patterns.length)

  // Which pattern is currently playing
  const currentlyPlayingPattern = $derived.by(() => {
    if (!playback.playing) return -1
    if (playback.soloPattern != null) return playback.soloPattern
    if (ui.phraseView === 'scene' && playback.sceneNodeId) {
      const node = song.scene.nodes.find(n => n.id === playback.sceneNodeId)
      if (node?.type === 'pattern') {
        return song.patterns.findIndex(p => p.id === node.patternId)
      }
    }
    if (ui.phraseView !== 'scene') return ui.currentPattern
    return song.sections[playback.currentSection]?.patternIndex ?? -1
  })

  const selectedName = $derived(song.patterns[ui.currentPattern]?.name || '------')

  let gridEl: HTMLDivElement | undefined = $state()

  function addToScene(pi: number) {
    const pat = song.patterns[pi]
    const id = sceneAddNode(pat.id, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4)
    ui.selectedSceneNode = id
  }

  function selectAndFocus(pi: number) {
    selectPattern(pi)
    gridEl?.focus()
  }

  function onKeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.code === 'KeyC') {
      e.preventDefault()
      patternCopy(ui.currentPattern)
    } else if (mod && e.code === 'KeyV') {
      e.preventDefault()
      patternPaste(ui.currentPattern)
    } else if (e.code === 'Backspace' || e.code === 'Delete') {
      e.preventDefault()
      patternClear(ui.currentPattern)
    }
  }
</script>

<div class="matrix-view">
  <!-- Header: selected pattern name -->
  <div class="matrix-head">
    <span class="head-name">{selectedName}</span>
    {#if ui.phraseView === 'scene'}
      <button
        class="head-scene"
        onpointerdown={() => addToScene(ui.currentPattern)}
        data-tip="Add to scene" data-tip-ja="シーンに追加"
      >→</button>
    {/if}
  </div>

  <!-- Grid: square cells -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="matrix-grid" bind:this={gridEl} tabindex="0" role="grid" onkeydown={onKeydown}>
    {#each { length: visibleCount } as _, pi}
      {@const hasData = patternHasData(pi)}
      {@const d = patternDensity(pi)}
      {@const isSelected = ui.currentPattern === pi}
      {@const isPlaying = currentlyPlayingPattern === pi}
      {@const isSolo = playback.soloPattern === pi}
      {@const inScene = patternUsedInScene(pi)}
      <div
        class="pat-cell"
        class:has-data={hasData}
        class:selected={isSelected}
        class:playing={isPlaying}
        class:solo={isSolo}
        class:in-scene={inScene}
        style="--d: {d}"
      >
        <button class="cell-bg" aria-label="Pattern {pi}" onpointerdown={() => selectAndFocus(pi)}></button>
      </div>
    {/each}
  </div>
</div>

<style>
  .matrix-view {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 120px;
    background: var(--color-fg);
    border-right: 1px solid rgba(237,232,220,0.08);
  }

  /* ── Header ── */
  .matrix-head {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 6px 4px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }

  .head-name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(237,232,220,0.55);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .head-scene {
    width: 18px;
    height: 16px;
    flex-shrink: 0;
    border: 1px solid rgba(120,120,69,0.3);
    background: transparent;
    color: var(--color-olive);
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
  }
  .head-scene:hover {
    background: rgba(120,120,69,0.15);
  }

  /* ── Grid ── */
  .matrix-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 24px);
    gap: 2px;
    padding: 6px;
    overflow-y: auto;
    align-content: start;
  }
  .matrix-grid::-webkit-scrollbar { width: 0; display: none; }
  .matrix-grid:focus { outline: none; }

  /* ── Cell wrapper ── */
  .pat-cell {
    width: 24px;
    height: 24px;
    position: relative;
    border: 1.5px solid transparent;
    background: rgba(237,232,220,0.04);
    transition: background 40ms, border-color 40ms;
  }

  .pat-cell.has-data {
    background: rgba(237,232,220, calc(0.08 + var(--d) * 0.25));
  }
  .pat-cell.selected {
    border-color: var(--color-olive);
  }
  .pat-cell.playing {
    background: rgba(68,114,180, calc(0.15 + var(--d) * 0.20));
  }
  .pat-cell.playing.selected {
    border-color: var(--color-blue);
  }
  .pat-cell.solo {
    box-shadow: inset 0 0 0 1px var(--color-blue);
  }

  /* Scene dot: top-right corner */
  .pat-cell.in-scene::before {
    content: '';
    position: absolute;
    top: 2px;
    right: 2px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--color-olive);
    opacity: 0.6;
    z-index: 1;
  }

  /* ── Cell select button (fills cell) ── */
  .cell-bg {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;
  }
  .cell-bg:active {
    background: rgba(237,232,220,0.08);
  }

</style>
