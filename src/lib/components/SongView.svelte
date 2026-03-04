<script lang="ts">
  import {
    song, playback, ui,
    sectionStepRepeats, sectionCycleKey, sectionCycleOct,
    sectionCyclePerf,
    sectionToggleFx, sectionClear,
    sectionRewind, sectionJump, selectSection,
    SONG_PRESETS, songLoadPreset,
    NOTE_NAMES,
  } from '../state.svelte.ts'
  import type { SongFxKey } from '../state.svelte.ts'
  import SplitFlap from './SplitFlap.svelte'
  import { SECTION_COUNT } from '../factory.ts'

  const PERF_LABELS = ['---', 'FILL', 'BRK', 'REV']
  const FX_KEYS: SongFxKey[] = ['verb', 'delay', 'glitch', 'granular']
  const FX_LABELS: Record<SongFxKey, string> = { verb: 'VRB', delay: 'DLY', glitch: 'GLT', granular: 'GRN' }

  // How many sections to show (collapse trailing empty ones)
  const visibleCount = $derived.by(() => {
    let last = 0
    for (let i = 0; i < SECTION_COUNT; i++) {
      const sec = song.sections[i]
      if (sec.cells.some(c => c.trigs.some(t => t.active))) last = i
    }
    return Math.max(last + 2, 8) // show at least 8, always one empty after last used
  })

  function sectionHasData(index: number): boolean {
    return song.sections[index].cells.some(c => c.trigs.some(t => t.active))
  }

  function handleClick(index: number) {
    selectSection(index)
  }

  function handleDoubleClick(index: number) {
    selectSection(index)
    ui.phraseView = 'grid'
  }

  // ── Auto-scroll ────────────────────────────────────────────────────
  let gridEl: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (!playback.playing || !gridEl) return
    const row = gridEl.querySelector('.section-row.current') as HTMLElement | null
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
</script>

<div class="song-view">
  <!-- Header -->
  <div class="song-header">
    <span class="song-label">SONG</span>
    <button class="btn-rewind" onpointerdown={sectionRewind}
      data-tip="Rewind to start" data-tip-ja="先頭に戻る"
    >&#9198;</button>
    <span class="song-spacer"></span>
    <span class="song-pos">
      <SplitFlap value={String(playback.currentSection).padStart(2, '0')} width={2} />
    </span>
    <div class="preset-btns">
      {#each SONG_PRESETS as preset, pi}
        <button class="btn-preset" onpointerdown={() => songLoadPreset(pi)}
          data-tip="Load {preset.name} preset" data-tip-ja="{preset.name}プリセットを読み込み"
        >{preset.name}</button>
      {/each}
    </div>
  </div>

  <!-- Column headers -->
  <div class="grid-header">
    <div class="col-num">#</div>
    <div class="col-name">NAME</div>
    <div class="col-rpt">RPT</div>
    <div class="col-key">KEY</div>
    <div class="col-oct">OCT</div>
    <div class="col-perf">PERF</div>
    <div class="col-fx">FX</div>
    <div class="col-clr"></div>
  </div>

  <!-- Section rows -->
  <div class="grid-rows" bind:this={gridEl}>
    {#each { length: visibleCount } as _, si}
      {@const sec = song.sections[si]}
      {@const isCurrent = si === playback.currentSection}
      {@const isSelected = si === ui.currentSection}
      {@const hasData = sectionHasData(si)}
      <div
        class="section-row"
        class:current={isCurrent}
        class:selected={isSelected}
        class:empty={!hasData}
      >
        <!-- Row number / jump -->
        <button class="row-num" onpointerdown={() => sectionJump(si)}
          data-tip="Jump to section {si}" data-tip-ja="セクション{si}にジャンプ"
        >
          {#if isCurrent && playback.playing}
            <span class="marker-arrow">&#9658;</span>
          {:else if isCurrent}
            <span class="marker-arrow dim">&#9658;</span>
          {:else}
            <span class="marker-text">{String(si).padStart(2, '0')}</span>
          {/if}
        </button>

        <!-- Name (click to select, double-click to edit) -->
        <button class="cell-name" class:has-data={hasData}
          onpointerdown={() => handleClick(si)}
          ondblclick={() => handleDoubleClick(si)}
          data-tip="Select section" data-tip-ja="セクションを選択"
        >{sec.name || '------'}</button>

        <!-- Repeats -->
        <span class="cell-rpt">
          <button class="rpt-adj" onpointerdown={() => sectionStepRepeats(si, -1)}>&#9664;</button>
          <span class="rpt-val">&times;{sec.repeats}</span>
          <button class="rpt-adj" onpointerdown={() => sectionStepRepeats(si, 1)}>&#9654;</button>
          {#if isCurrent && playback.playing && sec.repeats > 1}
            <span class="rpt-dots">
              {#each Array(sec.repeats) as _, d}
                <span class="rpt-dot" class:filled={d < playback.repeatCount} class:playing={d === playback.repeatCount}></span>
              {/each}
            </span>
          {/if}
        </span>

        <!-- Key -->
        <button class="cell-key" onpointerdown={() => sectionCycleKey(si)}
          data-tip="Cycle key override" data-tip-ja="キーオーバーライドを切替"
        >{sec.key != null ? NOTE_NAMES[sec.key] : '---'}</button>

        <!-- Oct -->
        <button class="cell-oct" onpointerdown={() => sectionCycleOct(si)}
          data-tip="Cycle octave override" data-tip-ja="オクターブオーバーライドを切替"
        >{sec.oct != null ? (sec.oct > 0 ? `+${sec.oct}` : `${sec.oct}`) : '---'}</button>

        <!-- Perf -->
        <button class="cell-perf" onpointerdown={() => sectionCyclePerf(si)}
          data-tip="Cycle performance mode" data-tip-ja="パフォーマンスモードを切替"
        >{PERF_LABELS[sec.perf ?? 0]}</button>

        <!-- FX toggles -->
        <span class="cell-fx">
          {#each FX_KEYS as fx}
            <button
              class="fx-btn"
              class:on={sec[fx]?.on}
              onpointerdown={() => sectionToggleFx(si, fx)}
              data-tip="Toggle {FX_LABELS[fx]}" data-tip-ja="{FX_LABELS[fx]}を切替"
            >{FX_LABELS[fx]}</button>
          {/each}
        </span>

        <!-- Clear -->
        <button class="row-clr" onpointerdown={() => sectionClear(si)}
          data-tip="Clear section" data-tip-ja="セクションをクリア"
        >&times;</button>
      </div>
    {/each}
  </div>
</div>

<style>
  .song-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background: var(--color-fg);
    color: var(--color-bg);
  }

  /* ── Header ── */
  .song-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }

  .song-label {
    font-size: 10px;
    letter-spacing: 0.12em;
    color: rgba(237,232,220,0.40);
    text-transform: uppercase;
    font-weight: 700;
  }

  .btn-rewind {
    border: 1.5px solid rgba(237,232,220,0.20);
    background: transparent;
    color: rgba(237,232,220,0.35);
    padding: 3px 6px;
    font-size: 11px;
    line-height: 1;
  }
  .btn-rewind:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.70); }

  .song-spacer { flex: 1; }
  .song-pos { display: flex; align-items: center; gap: 2px; font-size: 18px; }

  .preset-btns {
    display: flex;
    gap: 6px;
  }
  .btn-preset {
    border: 1.5px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.35);
    padding: 3px 10px;
    font-size: 9px;
    font-weight: 700;
    font-family: var(--font-data);
    letter-spacing: 0.08em;
  }
  .btn-preset:active {
    background: rgba(237,232,220,0.10);
    color: rgba(237,232,220,0.70);
    border-color: rgba(237,232,220,0.30);
  }

  /* ── Grid header ── */
  .grid-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
    height: 24px;
    font-size: 7px;
    font-weight: 700;
    font-family: var(--font-data);
    letter-spacing: 0.04em;
    color: rgba(237,232,220,0.25);
  }

  .col-num  { width: 28px; flex-shrink: 0; text-align: center; }
  .col-name { width: 64px; flex-shrink: 0; padding-left: 4px; }
  .col-rpt  { width: 64px; flex-shrink: 0; text-align: center; }
  .col-key  { width: 36px; flex-shrink: 0; text-align: center; }
  .col-oct  { width: 36px; flex-shrink: 0; text-align: center; }
  .col-perf { width: 40px; flex-shrink: 0; text-align: center; }
  .col-fx   { flex: 1; text-align: center; }
  .col-clr  { width: 24px; flex-shrink: 0; }

  /* ── Grid rows ── */
  .grid-rows {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .section-row {
    display: flex;
    align-items: center;
    height: 32px;
    border-bottom: 1px solid rgba(237,232,220,0.04);
    transition: background 80ms;
  }
  .section-row.current { background: rgba(237,232,220,0.06); }
  .section-row.selected { background: rgba(120,120,69,0.12); }
  .section-row.current.selected { background: rgba(120,120,69,0.18); }
  .section-row.empty { opacity: 0.45; }

  /* ── Row number ── */
  .row-num {
    width: 28px;
    flex-shrink: 0;
    text-align: center;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: inherit;
  }
  .row-num:active .marker-text { color: rgba(237,232,220,0.55); }
  .marker-arrow { color: var(--color-olive); font-size: 12px; }
  .marker-arrow.dim { opacity: 0.35; }
  .marker-text { font-family: var(--font-data); font-size: 10px; color: rgba(237,232,220,0.20); }

  /* ── Name cell ── */
  .cell-name {
    width: 64px;
    flex-shrink: 0;
    text-align: left;
    font-family: var(--font-data);
    font-size: 10px;
    color: rgba(237,232,220,0.30);
    border: 1px solid transparent;
    background: transparent;
    padding: 2px 4px;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-name.has-data { color: rgba(237,232,220,0.60); }
  .section-row.selected .cell-name { color: var(--color-olive); border-color: rgba(120,120,69,0.3); }

  /* ── Repeats ── */
  .cell-rpt {
    width: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  .rpt-adj {
    border: 1px solid rgba(237,232,220,0.12);
    background: transparent;
    color: rgba(237,232,220,0.30);
    width: 14px;
    height: 18px;
    font-size: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .rpt-adj:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }

  .rpt-val {
    font-family: var(--font-data);
    font-size: 10px;
    color: rgba(237,232,220,0.45);
    min-width: 18px;
    text-align: center;
  }

  .rpt-dots {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: 2px;
  }
  .rpt-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: rgba(237,232,220,0.12);
    transition: background 60ms;
  }
  .rpt-dot.filled { background: var(--color-olive); }
  .rpt-dot.playing {
    background: rgba(237,232,220,0.50);
    box-shadow: 0 0 3px rgba(237,232,220,0.30);
  }

  /* ── Key / Oct / Perf ── */
  .cell-key, .cell-oct, .cell-perf {
    flex-shrink: 0;
    text-align: center;
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237,232,220,0.40);
    border: 1px solid rgba(237,232,220,0.08);
    background: transparent;
    padding: 2px 0;
    cursor: pointer;
  }
  .cell-key  { width: 36px; }
  .cell-oct  { width: 36px; }
  .cell-perf { width: 40px; }
  .cell-key:active, .cell-oct:active, .cell-perf:active {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.70);
  }

  /* ── FX toggles ── */
  .cell-fx {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  .fx-btn {
    border: 1px solid rgba(237,232,220,0.10);
    background: transparent;
    color: rgba(237,232,220,0.25);
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 2px 4px;
    cursor: pointer;
    transition: background 40ms, color 40ms;
  }
  .fx-btn.on {
    background: rgba(120,120,69,0.3);
    color: var(--color-olive);
    border-color: var(--color-olive);
  }
  .fx-btn:active { opacity: 0.6; }

  /* ── Clear ── */
  .row-clr {
    width: 24px;
    flex-shrink: 0;
    border: 1px solid rgba(237,232,220,0.12);
    background: transparent;
    color: rgba(237,232,220,0.25);
    height: 20px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .row-clr:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .song-header { padding: 6px 8px; gap: 6px; }
    .preset-btns { flex-wrap: wrap; gap: 4px; }
    .col-fx, .cell-fx { display: none; }
    .col-name { width: 48px; }
    .cell-name { width: 48px; font-size: 9px; }
    .col-rpt { width: 50px; }
    .cell-rpt { width: 50px; }
    .col-key { width: 30px; }
    .cell-key { width: 30px; }
    .col-oct { width: 30px; }
    .cell-oct { width: 30px; }
    .col-perf { width: 34px; }
    .cell-perf { width: 34px; }
    .col-clr { width: 20px; }
    .row-clr { width: 20px; height: 18px; font-size: 10px; }
    .row-num { width: 24px; }
    .rpt-adj { width: 12px; height: 16px; font-size: 6px; }
    .rpt-val { font-size: 9px; }
  }
</style>
