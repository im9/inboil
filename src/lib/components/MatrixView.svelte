<script lang="ts">
  import { song, playback, ui, selectPattern, sectionHasData, sceneAddNode } from '../state.svelte.ts'
  import type { Cell } from '../state.svelte.ts'
  import { SECTION_COUNT } from '../factory.ts'

  // ── Visible sections (collapse trailing empty) ──
  const visibleCount = $derived.by(() => {
    let last = 0
    for (let i = 0; i < SECTION_COUNT; i++) {
      if (sectionHasData(i)) last = i
    }
    return Math.max(last + 2, 8, playback.loopEnd + 1)
  })

  function density(cell: Cell): number {
    if (cell.steps === 0) return 0
    let count = 0
    for (let i = 0; i < cell.steps; i++) {
      if (cell.trigs[i]?.active) count++
    }
    return count / cell.steps
  }

  function onCellClick(patternIndex: number, trackId: number) {
    selectPattern(patternIndex)
    ui.selectedTrack = trackId
  }

  function addToScene(patternIndex: number) {
    const pat = song.patterns[patternIndex]
    const id = sceneAddNode(pat.id, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4)
    ui.selectedSceneNode = id
  }
</script>

<div class="matrix-view">
  <!-- Track header row -->
  <div class="matrix-header">
    <span class="row-head"></span>
    {#each song.tracks as t, ti}
      <span
        class="track-col"
        class:selected={ui.selectedTrack === ti}
      >{t.name}</span>
    {/each}
  </div>

  <!-- Section rows -->
  <div class="matrix-body">
    {#each { length: visibleCount } as _, si}
      {@const sec = song.sections[si]}
      {@const pat = song.patterns[sec.patternIndex]}
      {@const isPlaying = playback.playing && playback.currentSection === si}
      {@const isEditing = sec.patternIndex === ui.currentPattern}
      {@const inLoop = playback.loopEnd > playback.loopStart && si >= playback.loopStart && si <= playback.loopEnd}
      <div
        class="matrix-row"
        class:playing={isPlaying}
        class:editing={isEditing}
        class:in-loop={inLoop}
      >
        <span class="row-head" class:editing={isEditing} class:playing={isPlaying}>
          {String(si).padStart(2, '0')}
          {#if ui.phraseView === 'scene'}
            <button
              class="row-scene-add"
              onpointerdown={e => { e.stopPropagation(); addToScene(sec.patternIndex) }}
              data-tip="Add to scene" data-tip-ja="シーンに追加"
            >→</button>
          {/if}
        </span>
        {#each pat.cells as cell, ti}
          {@const d = density(cell)}
          {@const hasData = d > 0}
          {@const isSel = isEditing && ui.selectedTrack === ti}
          <button
            class="matrix-cell"
            class:has-data={hasData}
            class:selected={isSel}
            style="--density: {d}"
            onpointerdown={() => onCellClick(sec.patternIndex, ti)}
          ></button>
        {/each}
      </div>
    {/each}
  </div>

  <!-- Loop range indicator -->
  {#if playback.loopEnd > playback.loopStart}
    <div class="loop-bar">LP {playback.loopStart}–{playback.loopEnd}</div>
  {/if}
</div>

<style>
  .matrix-view {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    background: var(--color-fg);
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }

  /* ── Header row ── */
  .matrix-header {
    display: flex;
    align-items: center;
    height: 20px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--color-fg);
  }

  .track-col {
    flex: 1;
    min-width: 0;
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(237,232,220,0.25);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track-col.selected {
    color: var(--color-olive);
  }

  /* ── Body ── */
  .matrix-body {
    overflow-y: auto;
    overflow-x: hidden;
    max-height: 200px;
  }
  .matrix-body::-webkit-scrollbar { width: 0; display: none; }

  /* ── Row ── */
  .matrix-row {
    display: flex;
    align-items: center;
    height: 18px;
    border-bottom: 1px solid rgba(237,232,220,0.03);
  }
  .matrix-row.in-loop {
    background: rgba(120,120,69,0.04);
  }
  .matrix-row.playing {
    background: rgba(68,114,180,0.08);
  }
  .matrix-row.editing {
    background: rgba(120,120,69,0.06);
  }

  /* ── Row header ── */
  .row-head {
    position: relative;
    width: 28px;
    flex-shrink: 0;
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.15);
    text-align: center;
    user-select: none;
  }
  .row-head.editing { color: var(--color-olive); }
  .row-head.playing { color: var(--color-blue); }

  .row-scene-add {
    display: none;
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    border: none;
    border-radius: 2px;
    background: transparent;
    color: var(--color-olive);
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .row-head:hover .row-scene-add {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .row-scene-add:hover {
    background: rgba(120,120,69,0.2);
  }

  /* ── Cell ── */
  .matrix-cell {
    flex: 1;
    min-width: 0;
    height: 14px;
    margin: 1px;
    padding: 0;
    border: 1px solid transparent;
    background: rgba(237,232,220,0.03);
    cursor: pointer;
    transition: background 40ms, border-color 40ms;
  }
  .matrix-cell.has-data {
    background: rgba(237,232,220, calc(0.06 + var(--density) * 0.22));
  }
  .matrix-cell.selected {
    border-color: var(--color-olive);
  }
  .matrix-row.playing .matrix-cell.has-data {
    background: rgba(68,114,180, calc(0.12 + var(--density) * 0.20));
  }
  .matrix-cell:active {
    opacity: 0.7;
  }

  /* ── Loop bar ── */
  .loop-bar {
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    padding: 2px 8px;
    text-align: center;
  }
</style>
