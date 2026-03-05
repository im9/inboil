<script lang="ts">
  import {
    song, playback, ui,
    selectSection, sectionJump, sectionRewind,
    sectionStepRepeats, sectionCycleKey, sectionCycleOct,
    sectionCyclePerf, sectionToggleFx, sectionClear,
    sectionHasData, setLoopRange,
    SONG_PRESETS, songLoadPreset, NOTE_NAMES,
  } from '../state.svelte.ts'
  import type { SongFxKey } from '../state.svelte.ts'
  import { SECTION_COUNT } from '../factory.ts'

  const PERF_LABELS = ['---', 'FILL', 'BRK', 'REV']
  const FX_KEYS: SongFxKey[] = ['verb', 'delay', 'glitch', 'granular']
  const FX_LABELS: Record<SongFxKey, string> = { verb: 'VRB', delay: 'DLY', glitch: 'GLT', granular: 'GRN' }

  // Visible slot count: collapse trailing empty sections
  const visibleCount = $derived.by(() => {
    let last = 0
    for (let i = 0; i < SECTION_COUNT; i++) {
      if (sectionHasData(i)) last = i
    }
    return Math.max(last + 2, 8, playback.loopEnd + 1)
  })

  const sec = $derived(song.sections[ui.currentSection])
  const pat = $derived(song.patterns[sec.patternIndex])

  // ── Drag state for loop range ──
  let dragStartSlot: number | null = $state(null)
  let dragMoved = $state(false)
  let stripEl: HTMLDivElement | undefined = $state()

  function slotFromPointer(e: PointerEvent): number {
    if (!stripEl) return 0
    const rect = stripEl.getBoundingClientRect()
    const scrollLeft = stripEl.scrollLeft
    const x = e.clientX - rect.left + scrollLeft
    const slotW = 14
    return Math.max(0, Math.min(Math.floor(x / slotW), visibleCount - 1))
  }

  function onStripPointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('.btn-rewind, .nav-meta')) return
    stripEl?.setPointerCapture(e.pointerId)
    dragStartSlot = slotFromPointer(e)
    dragMoved = false
  }

  function onStripPointerMove(e: PointerEvent) {
    if (dragStartSlot === null) return
    const cur = slotFromPointer(e)
    if (cur !== dragStartSlot) dragMoved = true
  }

  function onStripPointerUp(e: PointerEvent) {
    if (dragStartSlot === null) return
    const endSlot = slotFromPointer(e)
    if (dragMoved) {
      const s = Math.min(dragStartSlot, endSlot)
      const en = Math.max(dragStartSlot, endSlot)
      setLoopRange(s, en)
    } else {
      selectSection(dragStartSlot)
    }
    dragStartSlot = null
    dragMoved = false
  }

  function onSlotDblClick(si: number) {
    sectionJump(si)
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="section-nav">
  <!-- Row 1: Slot strip -->
  <div class="slot-row">
    <button class="btn-rewind" onpointerdown={sectionRewind}
      data-tip="Rewind to loop start" data-tip-ja="ループ先頭に戻る"
    >&#9198;</button>
    <div class="slot-strip" bind:this={stripEl}
      onpointerdown={onStripPointerDown}
      onpointermove={onStripPointerMove}
      onpointerup={onStripPointerUp}
    >
      {#each { length: visibleCount } as _, si}
        {@const hasData = sectionHasData(si)}
        {@const isPlaying = si === playback.currentSection && playback.playing}
        {@const isSelected = si === ui.currentSection}
        {@const inLoop = playback.loopEnd > playback.loopStart && si >= playback.loopStart && si <= playback.loopEnd}
        <button
          class="slot"
          class:has-data={hasData}
          class:playing={isPlaying}
          class:selected={isSelected}
          class:in-loop={inLoop}
          ondblclick={() => onSlotDblClick(si)}
        ><span class="slot-num">{String(si).padStart(2, '0')}</span></button>
      {/each}
    </div>
    <div class="nav-meta">
      {#if playback.loopEnd > playback.loopStart}
        <span class="loop-label">LP {playback.loopStart}-{playback.loopEnd}</span>
      {/if}
      {#each SONG_PRESETS as preset, pi}
        <button class="btn-preset" onpointerdown={() => songLoadPreset(pi)}
          data-tip="Load {preset.name} preset" data-tip-ja="{preset.name}プリセットを読み込み"
        >{preset.name}</button>
      {/each}
    </div>
  </div>

  <!-- Row 2: Detail strip for selected section -->
  <div class="detail-row">
    <span class="detail-sec">SEC {String(ui.currentSection).padStart(2, '0')}</span>
    <span class="detail-pat">PAT {String(sec.patternIndex).padStart(2, '0')}</span>
    <span class="detail-name">{pat.name || '------'}</span>

    <!-- Repeats -->
    <span class="detail-rpt">
      <button class="adj" onpointerdown={() => sectionStepRepeats(ui.currentSection, -1)}>&#9664;</button>
      <span class="val">&times;{sec.repeats}</span>
      <button class="adj" onpointerdown={() => sectionStepRepeats(ui.currentSection, 1)}>&#9654;</button>
      {#if ui.currentSection === playback.currentSection && playback.playing && sec.repeats > 1}
        <span class="rpt-dots">
          {#each Array(sec.repeats) as _, d}
            <span class="rpt-dot" class:filled={d < playback.repeatCount} class:active={d === playback.repeatCount}></span>
          {/each}
        </span>
      {/if}
    </span>

    <!-- Key -->
    <button class="detail-btn" onpointerdown={() => sectionCycleKey(ui.currentSection)}
      data-tip="Cycle key override" data-tip-ja="キーオーバーライドを切替"
    >{sec.key != null ? NOTE_NAMES[sec.key] : '---'}</button>

    <!-- Oct -->
    <button class="detail-btn" onpointerdown={() => sectionCycleOct(ui.currentSection)}
      data-tip="Cycle octave override" data-tip-ja="オクターブオーバーライドを切替"
    >{sec.oct != null ? (sec.oct > 0 ? `+${sec.oct}` : `${sec.oct}`) : '---'}</button>

    <!-- Perf -->
    <button class="detail-btn" onpointerdown={() => sectionCyclePerf(ui.currentSection)}
      data-tip="Cycle performance mode" data-tip-ja="パフォーマンスモードを切替"
    >{PERF_LABELS[sec.perf ?? 0]}</button>

    <!-- FX toggles -->
    <span class="detail-fx">
      {#each FX_KEYS as fx}
        <button
          class="fx-btn"
          class:on={sec[fx]?.on}
          onpointerdown={() => sectionToggleFx(ui.currentSection, fx)}
          data-tip="Toggle {FX_LABELS[fx]}" data-tip-ja="{FX_LABELS[fx]}を切替"
        >{FX_LABELS[fx]}</button>
      {/each}
    </span>

    <!-- Clear -->
    <button class="detail-clr" onpointerdown={() => sectionClear(ui.currentSection)}
      data-tip="Clear section cells" data-tip-ja="セクションをクリア"
    >&times;</button>
  </div>
</div>

<style>
  .section-nav {
    display: flex;
    flex-direction: column;
    background: var(--color-fg);
    flex-shrink: 0;
    border-bottom: 1px solid rgba(237,232,220,0.08);
  }

  /* ── Row 1: Slot strip ── */
  .slot-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 2px;
  }

  .btn-rewind {
    border: 1px solid rgba(237,232,220,0.20);
    background: transparent;
    color: rgba(237,232,220,0.35);
    padding: 2px 5px;
    font-size: 10px;
    line-height: 1;
    flex-shrink: 0;
  }
  .btn-rewind:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.70); }

  .slot-strip {
    display: flex;
    gap: 1px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    flex: 1;
    touch-action: pan-x;
  }
  .slot-strip::-webkit-scrollbar { height: 0; display: none; }

  .slot {
    width: 14px;
    height: 20px;
    flex-shrink: 0;
    border: none;
    background: rgba(237,232,220,0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    position: relative;
    transition: background 40ms;
  }
  .slot-num {
    font-family: var(--font-data);
    font-size: 6px;
    color: rgba(237,232,220,0.12);
    pointer-events: none;
    user-select: none;
  }

  .slot.has-data {
    background: rgba(237,232,220,0.15);
  }
  .slot.has-data .slot-num { color: rgba(237,232,220,0.30); }

  .slot.playing {
    background: var(--color-blue);
  }
  .slot.playing .slot-num { color: rgba(255,255,255,0.70); }

  .slot.selected {
    box-shadow: inset 0 -2px 0 var(--color-olive);
  }

  .slot.in-loop {
    box-shadow: inset 1px 0 0 rgba(120,120,69,0.5), inset -1px 0 0 rgba(120,120,69,0.5);
  }
  .slot.in-loop.selected {
    box-shadow: inset 1px 0 0 rgba(120,120,69,0.5), inset -1px 0 0 rgba(120,120,69,0.5), inset 0 -2px 0 var(--color-olive);
  }

  .nav-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-left: 4px;
  }

  .loop-label {
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    white-space: nowrap;
  }

  .btn-preset {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.35);
    padding: 2px 6px;
    font-size: 7px;
    font-weight: 700;
    font-family: var(--font-data);
    letter-spacing: 0.06em;
    flex-shrink: 0;
  }
  .btn-preset:active {
    background: rgba(237,232,220,0.10);
    color: rgba(237,232,220,0.70);
  }

  /* ── Row 2: Detail strip ── */
  .detail-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px 4px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .detail-row::-webkit-scrollbar { height: 0; display: none; }

  .detail-sec {
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-olive);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .detail-pat {
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.30);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .detail-name {
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237,232,220,0.50);
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 40px;
  }

  /* ── Repeats ── */
  .detail-rpt {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .adj {
    border: 1px solid rgba(237,232,220,0.12);
    background: transparent;
    color: rgba(237,232,220,0.30);
    width: 14px;
    height: 16px;
    font-size: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0;
  }
  .adj:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }

  .val {
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237,232,220,0.45);
    min-width: 16px;
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
  }
  .rpt-dot.filled { background: var(--color-olive); }
  .rpt-dot.active {
    background: rgba(237,232,220,0.50);
    box-shadow: 0 0 3px rgba(237,232,220,0.30);
  }

  /* ── Detail buttons ── */
  .detail-btn {
    flex-shrink: 0;
    font-family: var(--font-data);
    font-size: 8px;
    color: rgba(237,232,220,0.40);
    border: 1px solid rgba(237,232,220,0.10);
    background: transparent;
    padding: 2px 5px;
    cursor: pointer;
    white-space: nowrap;
  }
  .detail-btn:active {
    background: rgba(237,232,220,0.08);
    color: rgba(237,232,220,0.70);
  }

  /* ── FX toggles ── */
  .detail-fx {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
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
  .detail-clr {
    flex-shrink: 0;
    border: 1px solid rgba(237,232,220,0.12);
    background: transparent;
    color: rgba(237,232,220,0.25);
    width: 18px;
    height: 16px;
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin-left: auto;
  }
  .detail-clr:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .slot-row { padding: 3px 4px 1px; gap: 2px; }
    .slot { width: 12px; height: 16px; }
    .slot-num { font-size: 5px; }
    .detail-row { padding: 1px 4px 3px; gap: 4px; }
    .detail-fx { display: none; }
    .nav-meta { gap: 4px; }
    .btn-preset { font-size: 6px; padding: 1px 4px; }
  }
</style>
