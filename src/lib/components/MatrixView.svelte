<script lang="ts">
  import { song, playback, ui, selectPattern, patternHasData, patternDensity, patternUsedInScene, soloPatternIndex } from '../state.svelte.ts'
  import { sceneAddNode } from '../sceneActions.ts'
  import { patternCopy, patternPaste, patternClear } from '../sectionActions.ts'
  import { PATTERN_COLORS } from '../constants.ts'

  // Show all patterns in the pool
  const visibleCount = $derived(song.patterns.length)

  // Which pattern is currently playing
  const currentlyPlayingPattern = $derived.by(() => {
    if (!playback.playing) return -1
    const soloIdx = soloPatternIndex()
    if (soloIdx != null) return soloIdx
    if (playback.mode === 'scene') {
      if (playback.playingPattern != null) return playback.playingPattern
      return song.sections[playback.currentSection]?.patternIndex ?? -1
    }
    return ui.currentPattern
  })

  const selectedName = $derived(song.patterns[ui.currentPattern]?.name || '------')
  let gridEl: HTMLDivElement | undefined = $state()

  function addToScene(pi: number) {
    const pat = song.patterns[pi]
    const id = sceneAddNode(pat.id, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4)
    ui.selectedSceneNodes = { [id]: true }
  }

  let lastTapPat = -1
  let lastTapTime = 0

  function selectAndFocus(pi: number) {
    const now = Date.now()
    if (lastTapPat === pi && now - lastTapTime < 300) {
      // Double-tap → open pattern sheet
      ui.patternSheet = true
      ui.phraseView = 'pattern'
      lastTapPat = -1
      lastTapTime = 0
    } else {
      lastTapPat = pi
      lastTapTime = now
    }
    selectPattern(pi)
    // Sync DockPanel: select corresponding scene node if exists
    const pat = song.patterns[pi]
    if (pat) {
      const sceneNode = song.scene.nodes.find(n => n.patternId === pat.id)
      if (sceneNode) {
        ui.selectedSceneNodes = { [sceneNode.id]: true }
      } else {
        ui.selectedSceneNodes = {}
      }
    }
    gridEl?.focus()
  }

  function onCellDragStart(e: DragEvent, pi: number) {
    if (!e.dataTransfer) return
    e.dataTransfer.setData('application/x-inboil-pattern', String(pi))
    e.dataTransfer.effectAllowed = 'copy'
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return
    if (ui.patternSheet) return // pattern sheet handles its own keys
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="matrix-view">
  <!-- Header: name (click to edit) + action buttons -->
  <div class="matrix-head">
    <span class="head-dot" style="background: {PATTERN_COLORS[song.patterns[ui.currentPattern]?.color ?? 0]}"></span>
    <span class="head-name">{selectedName}</span>
    <button
      class="head-scene"
      onpointerdown={() => addToScene(ui.currentPattern)}
      data-tip="Add to scene" data-tip-ja="シーンに追加"
    >→</button>
  </div>

  <!-- Grid: square cells -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="matrix-grid" bind:this={gridEl} tabindex="0" role="grid" onkeydown={onKeydown} data-tip="Pattern pool — colored cells have data, dot = used in scene" data-tip-ja="パターンプール — 色付きセル = データあり、ドット = シーンで使用中">
    {#each { length: visibleCount } as _, pi}
      {@const hasData = patternHasData(pi)}
      {@const d = patternDensity(pi)}
      {@const pc = song.patterns[pi]?.color ?? 0}
      {@const isSelected = ui.currentPattern === pi}
      {@const isPlaying = currentlyPlayingPattern === pi}
      {@const isSolo = soloPatternIndex() === pi}
      {@const inScene = patternUsedInScene(pi)}
      <div
        class="pat-cell"
        class:has-data={hasData}
        class:selected={isSelected}
        class:playing={isPlaying}
        class:solo={isSolo}
        class:in-scene={inScene}
        style="--d: {d}; --pat-hex: {PATTERN_COLORS[pc]}; --beat: {30 / song.bpm}s"
      >
        <button class="cell-bg" aria-label="Pattern {pi}" draggable={true} onpointerdown={() => selectAndFocus(pi)} ondragstart={e => onCellDragStart(e, pi)} data-tip="Pattern {String(pi).padStart(2,'0')}{song.patterns[pi]?.name ? ' — ' + song.patterns[pi].name : ''} · Tap to select, double-tap to edit" data-tip-ja="パターン {String(pi).padStart(2,'0')}{song.patterns[pi]?.name ? ' — ' + song.patterns[pi].name : ''} · タップで選択、ダブルタップで編集"></button>
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
    background: var(--color-bg);
    border-right: 1px solid rgba(30,32,40,0.06);
    position: relative;
  }

  /* ── Header ── */
  .matrix-head {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 6px 4px;
    border-bottom: 1px solid rgba(30,32,40,0.08);
  }

  .head-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .head-name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(30,32,40,0.55);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    background: none;
    border: none;
    padding: 1px 3px;
  }

  .head-scene {
    width: 18px;
    height: 16px;
    flex-shrink: 0;
    border: 1px solid rgba(30,32,40,0.15);
    background: transparent;
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    color: rgba(30,32,40,0.45);
  }
  .head-scene:hover {
    background: rgba(30,32,40,0.06);
    color: var(--color-fg);
  }
  .head-scene {
    color: var(--color-olive);
    border-color: rgba(120,120,69,0.3);
  }
  .head-scene:hover {
    background: rgba(120,120,69,0.1);
    color: var(--color-olive);
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
    border: 1px solid rgba(30,32,40,0.5);
    background: var(--color-bg);
    transition: background 40ms, border-color 40ms;
  }

  .pat-cell.has-data,
  .pat-cell.in-scene {
    background: var(--pat-hex);
  }
  .pat-cell.selected {
    border: 2px solid var(--color-fg);
  }
  .pat-cell.playing {
    border-color: var(--color-olive);
    animation: pat-pulse var(--beat, 0.25s) ease-in-out infinite alternate;
  }
  .pat-cell.playing.selected {
    border-width: 2px;
    border-color: var(--color-olive);
  }

  @keyframes pat-pulse {
    from { opacity: 1; }
    to   { opacity: 0.4; }
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
    opacity: 0.7;
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
    background: rgba(30,32,40,0.06);
  }


</style>
