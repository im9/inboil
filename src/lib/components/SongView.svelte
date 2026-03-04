<script lang="ts">
  import {
    song, songPlay, playback, ui,
    songAppendRow, songRemoveRow, songClearRows,
    songSetRowChainId, songStepRepeats,
    songToggle, songRewind, songJump,
    addChainEntry, removeChainEntry, moveChainEntry,
    setChainEntryTranspose, setChainEntryPhrase,
    SONG_PRESETS, songLoadPreset,
  } from '../state.svelte.ts'
  import SplitFlap from './SplitFlap.svelte'

  // ── Derived state ──────────────────────────────────────────────────
  const selectedChain = $derived.by(() => {
    if (!ui.songCell) return null
    const row = song.rows[ui.songCell.row]
    if (!row) return null
    const chainId = row.chainIds[ui.songCell.track]
    if (chainId == null) return null
    return song.tracks[ui.songCell.track].chains[chainId] ?? null
  })

  const selectedTrackPhrases = $derived.by(() => {
    if (ui.songCell == null) return []
    return song.tracks[ui.songCell.track].phrases
  })

  // ── Cell selection ─────────────────────────────────────────────────
  function selectCell(rowIndex: number, trackId: number) {
    ui.songCell = { row: rowIndex, track: trackId }
  }

  function isSelected(rowIndex: number, trackId: number): boolean {
    return ui.songCell?.row === rowIndex && ui.songCell?.track === trackId
  }

  // ── Chain ID stepping ──────────────────────────────────────────────
  function stepChainId(rowIndex: number, trackId: number, dir: -1 | 1) {
    const row = song.rows[rowIndex]
    if (!row) return
    const current = row.chainIds[trackId] ?? 0
    const maxChain = song.tracks[trackId].chains.length
    let next = current + dir
    if (next < 0) next = maxChain - 1
    if (next >= maxChain) next = 0
    songSetRowChainId(rowIndex, trackId, next)
  }

  function stepTranspose(trackId: number, chainId: number, entryIndex: number, dir: -1 | 1) {
    const chain = song.tracks[trackId].chains[chainId]
    if (!chain) return
    const entry = chain.entries[entryIndex]
    if (!entry) return
    setChainEntryTranspose(trackId, chainId, entryIndex, entry.transpose + dir)
  }

  function stepPhrase(trackId: number, chainId: number, entryIndex: number, dir: -1 | 1) {
    const chain = song.tracks[trackId].chains[chainId]
    if (!chain) return
    const entry = chain.entries[entryIndex]
    if (!entry) return
    const maxPh = song.tracks[trackId].phrases.length
    let next = entry.phraseId + dir
    if (next < 0) next = maxPh - 1
    if (next >= maxPh) next = 0
    setChainEntryPhrase(trackId, chainId, entryIndex, next)
  }

  // ── Keyboard navigation ────────────────────────────────────────────
  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return
    if (!ui.songCell || song.rows.length === 0) return
    const { row: ri, track: ti } = ui.songCell

    if (e.key === 'ArrowUp' && ri > 0) {
      e.preventDefault(); selectCell(ri - 1, ti)
    } else if (e.key === 'ArrowDown' && ri < song.rows.length - 1) {
      e.preventDefault(); selectCell(ri + 1, ti)
    } else if (e.key === 'ArrowLeft' && ti > 0) {
      e.preventDefault(); selectCell(ri, ti - 1)
    } else if (e.key === 'ArrowRight' && ti < 7) {
      e.preventDefault(); selectCell(ri, ti + 1)
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault(); stepChainId(ri, ti, 1)
    } else if (e.key === '-') {
      e.preventDefault(); stepChainId(ri, ti, -1)
    }
  }

  // ── Auto-scroll ────────────────────────────────────────────────────
  let gridEl: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (!songPlay.active || !playback.playing || !gridEl) return
    const row = gridEl.querySelector('.song-row.current') as HTMLElement | null
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
</script>

<svelte:window onkeydown={onKeydown} />

<div class="song-view">
  <!-- Header -->
  <div class="song-header">
    <span class="song-label">SONG</span>
    <button
      class="btn-toggle"
      class:active={songPlay.active}
      onpointerdown={songToggle}
      data-tip="Toggle song playback ON/OFF" data-tip-ja="ソング再生のON/OFF"
    >{songPlay.active ? 'ON' : 'OFF'}</button>
    {#if song.rows.length > 0}
      <button class="btn-rewind" onpointerdown={songRewind}
        data-tip="Rewind to first row" data-tip-ja="先頭行に戻る"
      >&#9198;</button>
    {/if}
    <span class="song-spacer"></span>
    <span class="song-pos">
      {#if song.rows.length > 0}
        <SplitFlap value={String(songPlay.currentRow + 1).padStart(2, '0')} width={2} />
        <SplitFlap value="/" width={1} />
        <SplitFlap value={String(song.rows.length).padStart(2, '0')} width={2} />
      {/if}
    </span>
    <button class="btn-add" onpointerdown={() => songAppendRow(0)}
      data-tip="Append a new row" data-tip-ja="新しい行を追加"
    >+ ADD</button>
    <button class="btn-clear" onpointerdown={songClearRows}
      data-tip="Clear all rows" data-tip-ja="全行を削除"
    >CLR</button>
  </div>

  <!-- Body: grid + chain editor -->
  <div class="song-body">
    <!-- 8-column grid -->
    <div class="song-grid" bind:this={gridEl}>
      <!-- Column headers -->
      <div class="grid-header">
        <div class="col-num"></div>
        {#each song.tracks as t, ti}
          <div class="col-track" class:col-selected={ui.songCell?.track === ti}>
            {t.name}
          </div>
        {/each}
        <div class="col-rpt">RPT</div>
        <div class="col-del"></div>
      </div>

      <!-- Rows -->
      <div class="grid-rows">
        {#if song.rows.length === 0}
          <div class="grid-empty">
            <span class="empty-text">NO ROWS</span>
            <span class="empty-hint">TAP + ADD TO BUILD SONG</span>
            <div class="preset-list">
              {#each SONG_PRESETS as preset, pi}
                <button class="btn-preset" onpointerdown={() => songLoadPreset(pi)}>{preset.name}</button>
              {/each}
            </div>
          </div>
        {:else}
          {#each song.rows as row, ri}
            {@const isCurrent = ri === songPlay.currentRow}
            <div class="song-row" class:current={isCurrent}>
              <!-- Row number / jump -->
              <button class="row-num" onpointerdown={() => songJump(ri)}
                data-tip="Jump to this row" data-tip-ja="この行にジャンプ"
              >
                {#if isCurrent && songPlay.active}
                  <span class="marker-arrow">&#9658;</span>
                {:else if isCurrent}
                  <span class="marker-arrow dim">&#9658;</span>
                {:else}
                  <span class="marker-text">{String(ri + 1).padStart(2, '0')}</span>
                {/if}
              </button>

              <!-- 8 chain-ID cells -->
              {#each row.chainIds as chainId, ti}
                <button
                  class="chain-cell"
                  class:selected={isSelected(ri, ti)}
                  class:null-chain={chainId == null}
                  onpointerdown={() => selectCell(ri, ti)}
                  data-tip="Chain ID for {song.tracks[ti].name}. Select to edit chain." data-tip-ja="{song.tracks[ti].name}のチェーンID。選択して編集。"
                >
                  {chainId != null ? String(chainId).padStart(2, '0') : '--'}
                </button>
              {/each}

              <!-- Repeats -->
              <span class="row-rpt">
                <button class="rpt-adj" onpointerdown={() => songStepRepeats(ri, -1)}>&#9664;</button>
                <span class="rpt-val">&times;{row.repeats}</span>
                <button class="rpt-adj" onpointerdown={() => songStepRepeats(ri, 1)}>&#9654;</button>
                {#if isCurrent && playback.playing && row.repeats > 1}
                  <span class="rpt-dots">
                    {#each Array(row.repeats) as _, d}
                      <span class="rpt-dot" class:filled={d < songPlay.repeatCount} class:playing={d === songPlay.repeatCount}></span>
                    {/each}
                  </span>
                {/if}
              </span>

              <!-- Delete -->
              <button class="row-del" onpointerdown={() => songRemoveRow(ri)}>&times;</button>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Chain editor sub-panel -->
    {#if selectedChain && ui.songCell}
      {@const trackId = ui.songCell.track}
      {@const chainId = song.rows[ui.songCell.row]?.chainIds[trackId] ?? 0}
      <div class="chain-editor">
        <div class="ce-header">
          <span class="ce-label">CHAIN</span>
          <span class="ce-id">{String(chainId).padStart(2, '0')}</span>
          <span class="ce-sep">|</span>
          <span class="ce-track">{song.tracks[trackId].name}</span>
          <!-- Chain ID nav -->
          <span class="ce-nav">
            <button class="ce-nav-btn" onpointerdown={() => stepChainId(ui.songCell!.row, trackId, -1)}>&#9664;</button>
            <button class="ce-nav-btn" onpointerdown={() => stepChainId(ui.songCell!.row, trackId, 1)}>&#9654;</button>
          </span>
        </div>

        <div class="ce-entries">
          {#each selectedChain.entries as entry, ei}
            <div class="ce-entry">
              <span class="ce-idx">{String(ei + 1).padStart(2, '0')}</span>

              <!-- Phrase selector -->
              <button class="ce-ph-nav" onpointerdown={() => stepPhrase(trackId, chainId, ei, -1)}>&#9664;</button>
              <span class="ce-phrase">
                <span class="ce-ph-id">{String(entry.phraseId).padStart(2, '0')}</span>
                <span class="ce-ph-name">{selectedTrackPhrases[entry.phraseId]?.name ?? '---'}</span>
              </span>
              <button class="ce-ph-nav" onpointerdown={() => stepPhrase(trackId, chainId, ei, 1)}>&#9654;</button>

              <!-- Transpose -->
              <button class="ce-tr-nav" onpointerdown={() => stepTranspose(trackId, chainId, ei, -1)}>&#9664;</button>
              <span class="ce-transpose">{entry.transpose >= 0 ? '+' : ''}{entry.transpose}st</span>
              <button class="ce-tr-nav" onpointerdown={() => stepTranspose(trackId, chainId, ei, 1)}>&#9654;</button>

              <!-- Move / delete -->
              <button class="ce-btn" onpointerdown={() => moveChainEntry(trackId, chainId, ei, -1)}
                disabled={ei === 0}
                data-tip="Move entry up" data-tip-ja="エントリーを上に移動"
              >&#9650;</button>
              <button class="ce-btn" onpointerdown={() => moveChainEntry(trackId, chainId, ei, 1)}
                disabled={ei === selectedChain.entries.length - 1}
                data-tip="Move entry down" data-tip-ja="エントリーを下に移動"
              >&#9660;</button>
              <button class="ce-btn ce-del"
                onpointerdown={() => removeChainEntry(trackId, chainId, ei)}
                disabled={selectedChain.entries.length <= 1}
                data-tip="Remove entry" data-tip-ja="エントリーを削除"
              >&times;</button>
            </div>
          {/each}
        </div>

        <div class="ce-actions">
          <button class="ce-add"
            onpointerdown={() => addChainEntry(trackId, chainId, 0)}
            disabled={selectedChain.entries.length >= 16}
            data-tip="Add phrase to this chain" data-tip-ja="このチェーンにフレーズを追加"
          >+ ADD PHRASE</button>
        </div>
      </div>
    {/if}
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

  .btn-toggle {
    border: 1.5px solid rgba(237,232,220,0.30);
    background: transparent;
    color: rgba(237,232,220,0.45);
    padding: 3px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
  }
  .btn-toggle.active {
    border-color: var(--color-olive);
    background: var(--color-olive);
    color: var(--color-fg);
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

  .btn-add {
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    padding: 3px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .btn-add:active { background: var(--color-olive); color: var(--color-fg); }

  .btn-clear {
    border: 1.5px solid rgba(237,232,220,0.20);
    background: transparent;
    color: rgba(237,232,220,0.30);
    padding: 3px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .btn-clear:active { background: var(--color-salmon); border-color: var(--color-salmon); color: var(--color-fg); }

  /* ── Body ── */
  .song-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* ── Grid ── */
  .song-grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .grid-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
    height: 24px;
  }

  .col-num {
    width: 28px;
    flex-shrink: 0;
  }

  .col-track {
    flex: 1;
    text-align: center;
    font-size: 8px;
    font-weight: 700;
    font-family: var(--font-data);
    letter-spacing: 0.04em;
    color: rgba(237,232,220,0.30);
    padding: 4px 0;
    border-left: 1px solid rgba(237,232,220,0.04);
  }
  .col-track.col-selected {
    color: var(--color-olive);
  }

  .col-rpt {
    width: 64px;
    flex-shrink: 0;
    text-align: center;
    font-size: 7px;
    font-weight: 700;
    font-family: var(--font-data);
    letter-spacing: 0.04em;
    color: rgba(237,232,220,0.25);
  }

  .col-del {
    width: 24px;
    flex-shrink: 0;
  }

  .grid-rows {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .grid-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
  }
  .empty-text { font-size: 14px; letter-spacing: 0.15em; color: rgba(237,232,220,0.18); }
  .empty-hint { font-size: 10px; letter-spacing: 0.08em; color: rgba(237,232,220,0.12); }

  .preset-list {
    display: flex;
    gap: 6px;
    margin-top: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .btn-preset {
    border: 1.5px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.35);
    padding: 5px 12px;
    font-size: 9px;
    font-weight: 700;
    font-family: var(--font-data);
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: background 40ms, color 40ms;
  }
  .btn-preset:active {
    background: rgba(237,232,220,0.10);
    color: rgba(237,232,220,0.70);
    border-color: rgba(237,232,220,0.30);
  }

  /* ── Song row ── */
  .song-row {
    display: flex;
    align-items: center;
    height: 32px;
    border-bottom: 1px solid rgba(237,232,220,0.04);
    transition: background 80ms;
  }
  .song-row.current { background: rgba(237,232,220,0.06); }

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

  /* ── Chain cell ── */
  .chain-cell {
    flex: 1;
    text-align: center;
    font-family: var(--font-data);
    font-size: 11px;
    color: rgba(237,232,220,0.50);
    border: 1px solid transparent;
    border-left: 1px solid rgba(237,232,220,0.04);
    background: transparent;
    padding: 4px 0;
    cursor: pointer;
    transition: background 40ms, border-color 40ms;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .chain-cell:hover { background: rgba(237,232,220,0.03); }
  .chain-cell.selected {
    border-color: var(--color-olive);
    background: rgba(120,120,69,0.15);
    color: rgba(237,232,220,0.85);
  }
  .chain-cell.null-chain {
    color: rgba(237,232,220,0.15);
  }

  /* ── Repeats ── */
  .row-rpt {
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

  /* ── Delete ── */
  .row-del {
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
  .row-del:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }

  /* ── Chain editor ── */
  .chain-editor {
    width: 240px;
    flex-shrink: 0;
    border-left: 1px solid rgba(237,232,220,0.08);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .ce-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }

  .ce-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(237,232,220,0.35);
  }

  .ce-id {
    font-family: var(--font-data);
    font-size: 14px;
    color: rgba(237,232,220,0.70);
  }

  .ce-sep {
    font-size: 12px;
    color: rgba(237,232,220,0.12);
  }

  .ce-track {
    font-family: var(--font-data);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-olive);
  }

  .ce-nav {
    margin-left: auto;
    display: flex;
    gap: 2px;
  }

  .ce-nav-btn {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.35);
    width: 20px;
    height: 20px;
    font-size: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ce-nav-btn:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.70); }

  /* ── Chain entries ── */
  .ce-entries {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .ce-entry {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 10px;
    border-bottom: 1px solid rgba(237,232,220,0.04);
    height: 30px;
  }

  .ce-idx {
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237,232,220,0.20);
    width: 16px;
    flex-shrink: 0;
  }

  .ce-ph-nav {
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
  .ce-ph-nav:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }

  .ce-phrase {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
  }

  .ce-ph-id {
    font-family: var(--font-data);
    font-size: 11px;
    color: rgba(237,232,220,0.60);
  }

  .ce-ph-name {
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237,232,220,0.35);
    letter-spacing: 0.04em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ce-tr-nav {
    border: 1px solid rgba(237,232,220,0.10);
    background: transparent;
    color: rgba(237,232,220,0.25);
    width: 12px;
    height: 16px;
    font-size: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ce-tr-nav:active { background: rgba(237,232,220,0.08); color: rgba(237,232,220,0.55); }

  .ce-transpose {
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(237,232,220,0.35);
    min-width: 30px;
    text-align: center;
    flex-shrink: 0;
  }

  .ce-btn {
    border: 1px solid rgba(237,232,220,0.12);
    background: transparent;
    color: rgba(237,232,220,0.30);
    width: 18px;
    height: 18px;
    font-size: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ce-btn:active:not(:disabled) { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }
  .ce-btn:disabled { opacity: 0.3; cursor: default; }

  .ce-del:active:not(:disabled) { background: rgba(237,232,220,0.10); color: var(--color-salmon); }

  /* ── Chain actions ── */
  .ce-actions {
    padding: 8px 10px;
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }

  .ce-add {
    width: 100%;
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    padding: 5px 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .ce-add:active:not(:disabled) { background: var(--color-olive); color: var(--color-fg); }
  .ce-add:disabled { opacity: 0.3; cursor: default; }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .song-header { padding: 6px 8px; gap: 6px; }

    .song-body { flex-direction: column; }

    .chain-editor {
      width: 100%;
      border-left: none;
      border-top: 1px solid rgba(237,232,220,0.08);
      max-height: 40%;
    }

    .col-track { font-size: 7px; }
    .chain-cell { font-size: 9px; }
    .col-rpt { width: 50px; }
    .col-del { width: 20px; }
    .row-num { width: 24px; }
    .rpt-adj { width: 12px; height: 16px; font-size: 6px; }
    .rpt-val { font-size: 9px; }
    .row-del { width: 20px; height: 18px; font-size: 10px; }
  }
</style>
