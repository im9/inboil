<script lang="ts">
  import {
    song, songPlay, playback, NOTE_NAMES, PHRASE_SET_COUNT,
    songAppendRow, songRemoveRow, songClearRows, songSetRowPhraseSet,
    songStepRepeats, songCycleKey, songCycleOct, songCyclePerf,
    songToggleFx, songSetFxSend, songToggle, songLoadPreset,
    songCyclePerfLen, songRewind, songJump,
    SONG_PRESETS, ui,
    type SongFxKey,
  } from '../state.svelte.ts'
  import SplitFlap from './SplitFlap.svelte'
  import Knob from './Knob.svelte'

  const PERF_LABELS = ['----', 'FILL', 'BRK', 'REV'] as const
  const PERF_CLASSES = ['', 'perf-fill', 'perf-brk', 'perf-rev'] as const
  const PERF_LEN_LABELS: Record<number, string> = { 16: 'BAR', 8: '½', 4: '¼', 1: '1S' }

  const FX_DEFS: { key: SongFxKey, label: string, cls: string }[] = [
    { key: 'verb',     label: 'VRB', cls: 'fx-vrb' },
    { key: 'delay',    label: 'DLY', cls: 'fx-dly' },
    { key: 'glitch',   label: 'GLT', cls: 'fx-glt' },
    { key: 'granular', label: 'GRN', cls: 'fx-grn' },
  ]

  let listEl: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (!songPlay.active || !playback.playing || !listEl) return
    const row = listEl.querySelector('.chain-entry.current') as HTMLElement | null
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })

  function stepPhraseSet(index: number, dir: -1 | 1) {
    const row = song.rows[index]
    const current = row.chainIds[0] ?? 0
    let next = current + dir
    if (next < 0) next = PHRASE_SET_COUNT - 1
    if (next >= PHRASE_SET_COUNT) next = 0
    songSetRowPhraseSet(index, next)
  }

  function getPhraseSetName(phraseSet: number): string {
    return song.tracks[0]?.phrases[phraseSet]?.name ?? ''
  }

  function keyLabel(key: number | undefined): string {
    if (key == null) return '---'
    return NOTE_NAMES[key]
  }

  function octLabel(oct: number | undefined): string {
    if (oct == null) return '---'
    if (oct > 0) return `+${oct}`
    return `${oct}`
  }
</script>

<div class="chain-view">
  <div class="chain-header">
    <span class="chain-label">SONG</span>
    <button
      class="btn-toggle"
      class:active={songPlay.active}
      onpointerdown={songToggle}
      data-tip="Toggle song playback ON/OFF. Resumes from current position."
      data-tip-ja="ソング再生のON/OFF。現在位置から再開します。"
    >{songPlay.active ? 'ON' : 'OFF'}</button>
    {#if song.rows.length > 0}
      <button class="btn-rewind" onpointerdown={songRewind}
        data-tip="Rewind to the first row."
        data-tip-ja="先頭行に戻ります。"
      >&#9198;</button>
    {/if}
    <span class="chain-spacer"></span>
    <span class="chain-pos">
      {#if song.rows.length > 0}
        <SplitFlap value={String(songPlay.currentRow + 1).padStart(2, '0')} width={2} />
        <SplitFlap value="/" width={1} />
        <SplitFlap value={String(song.rows.length).padStart(2, '0')} width={2} />
      {/if}
    </span>
    <button class="btn-add" onpointerdown={() => songAppendRow(ui.activePhrases[0])}
      data-tip="Append current phrase set to the song."
      data-tip-ja="現在のフレーズセットをソングに追加します。"
    >+ ADD</button>
    <button class="btn-clear" onpointerdown={songClearRows}
      data-tip="Clear all song rows."
      data-tip-ja="ソングの全行を削除します。"
    >CLR</button>
  </div>

  <div class="chain-list" bind:this={listEl}>
    {#if song.rows.length === 0}
      <div class="chain-empty">
        <span class="empty-text">NO ROWS</span>
        <span class="empty-hint">TAP + ADD TO BUILD SONG</span>
        <div class="preset-list">
          {#each SONG_PRESETS as preset, pi}
            <button class="btn-preset" onpointerdown={() => songLoadPreset(pi)}>{preset.name}</button>
          {/each}
        </div>
      </div>
    {:else}
      {#each song.rows as row, i}
        {@const isCurrent = i === songPlay.currentRow}
        {@const phraseSet = row.chainIds[0] ?? 0}
        <div
          class="chain-entry"
          class:current={isCurrent}
        >
          <div class="chain-row">
            <button class="row-marker" onpointerdown={() => songJump(i)}
              data-tip="Tap to jump playback to this row."
              data-tip-ja="タップでこの行にジャンプします。"
            >
              {#if isCurrent && songPlay.active}
                <span class="marker-arrow">&#9658;</span>
              {:else if isCurrent}
                <span class="marker-arrow dim">&#9658;</span>
              {:else}
                <span class="marker-num">{String(i + 1).padStart(2, '0')}</span>
              {/if}
            </button>

            <button class="row-nav" onpointerdown={() => stepPhraseSet(i, -1)}>&#9664;</button>
            <span class="row-pat-id"><SplitFlap value={String(phraseSet).padStart(2, '0')} width={2} /></span>
            <span class="row-sep">|</span>
            <span class="row-pat-name"><SplitFlap value={getPhraseSetName(phraseSet)} width={8} /></span>
            <button class="row-nav" onpointerdown={() => stepPhraseSet(i, 1)}>&#9654;</button>

            <button
              class="row-key"
              class:has-key={row.key != null}
              onpointerdown={() => songCycleKey(i)}
              data-tip="Key transposition. Tap to cycle through keys (C–B). --- = use default."
              data-tip-ja="キー転調。タップで C〜B を順に切替。--- = デフォルトキー。"
            >{keyLabel(row.key)}</button>

            <button
              class="row-oct"
              class:has-oct={row.oct != null}
              onpointerdown={() => songCycleOct(i)}
              data-tip="Octave shift (-2 to +2). Tap to cycle. --- = no override."
              data-tip-ja="オクターブシフト (-2〜+2)。タップで切替。--- = 変更なし。"
            >{octLabel(row.oct)}</button>

            <!-- Repeats: ◀ ×N ▶ + progress dots -->
            <span class="rpt-group"
              data-tip="Repeat count. ◀▶ to adjust (1–8). Dots show progress during playback."
              data-tip-ja="リピート回数。◀▶ で調整 (1〜8)。再生中はドットで進捗を表示。"
            >
              <button class="rpt-nav" onpointerdown={() => songStepRepeats(i, -1)}>&#9664;</button>
              <span class="rpt-display">
                <span class="rpt-times">&times;</span>
                <SplitFlap value={row.repeats} width={1} />
              </span>
              <button class="rpt-nav" onpointerdown={() => songStepRepeats(i, 1)}>&#9654;</button>
              {#if isCurrent && playback.playing && row.repeats > 1}
                <span class="rpt-dots">
                  {#each Array(row.repeats) as _, d}
                    <span class="rpt-dot" class:filled={d < songPlay.repeatCount} class:playing={d === songPlay.repeatCount}></span>
                  {/each}
                </span>
              {/if}
            </span>

            <!-- FX toggle + send knobs -->
            <div class="fx-nodes"
              data-tip="FX sends. Tap label to toggle, drag knob to set send amount."
              data-tip-ja="FXセンド。ラベルタップでON/OFF、ノブでセンド量を調整。"
            >
              {#each FX_DEFS as fx}
                <div class="fx-node {fx.cls}" class:active={row[fx.key]?.on}>
                  <button
                    class="fx-toggle"
                    onpointerdown={() => songToggleFx(i, fx.key)}
                  >{fx.label}</button>
                  <Knob
                    value={row[fx.key]?.x ?? 0.5}
                    label=""
                    size={20}
                    compact={true}
                    onchange={(v) => songSetFxSend(i, fx.key, v)}
                  />
                </div>
              {/each}
            </div>

            <button
              class="row-perf {PERF_CLASSES[row.perf ?? 0]}"
              onpointerdown={() => songCyclePerf(i)}
              data-tip="Performance effect. Tap to cycle: NONE → FILL → BRK → REV. Activates on last repeat."
              data-tip-ja="パフォーマンス。タップで切替: NONE → FILL → BRK → REV。ラストリピートで発動。"
            >{PERF_LABELS[row.perf ?? 0]}</button>
            <button
              class="row-perf-len {(row.perf ?? 0) > 0 ? PERF_CLASSES[row.perf ?? 0] : 'perf-none'}"
              onpointerdown={() => songCyclePerfLen(i)}
              disabled={(row.perf ?? 0) === 0}
              data-tip="Perf duration. Tap to cycle: BAR (full) → ½ → ¼ → 1S (1 step)."
              data-tip-ja="パフォーマンスの長さ。タップで切替: BAR (全体) → ½ → ¼ → 1S (1ステップ)。"
            >{(row.perf ?? 0) > 0 ? (PERF_LEN_LABELS[row.perfLen ?? 16] ?? row.perfLen) : '---'}</button>

            <button class="row-del" onpointerdown={() => songRemoveRow(i)}>&times;</button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .chain-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .chain-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }

  .chain-label {
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

  .chain-spacer { flex: 1; }

  .chain-pos { display: flex; align-items: center; gap: 2px; font-size: 18px; }

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

  .chain-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 0;
  }

  .chain-empty {
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

  /* ── Entry wrapper ── */
  .chain-entry {
    border-bottom: 1px solid rgba(237,232,220,0.04);
    transition: background 80ms;
  }
  .chain-entry.current { background: rgba(237,232,220,0.06); }

  /* ── Row (single line) ── */
  .chain-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 12px;
  }

  .row-marker {
    width: 22px; text-align: center; flex-shrink: 0;
    background: none; border: none; padding: 0; cursor: pointer;
  }
  .row-marker:active .marker-num { color: rgba(237,232,220,0.55); }
  .marker-arrow { color: var(--color-olive); font-size: 12px; }
  .marker-arrow.dim { opacity: 0.35; }
  .marker-num { font-family: var(--font-data); font-size: 10px; color: rgba(237,232,220,0.20); }

  .row-nav {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.35);
    width: 20px;
    height: 24px;
    font-size: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .row-nav:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.70); }

  .row-pat-id { font-size: 20px; line-height: 1; }
  .row-sep { font-size: 18px; color: rgba(237,232,220,0.12); margin: 0 1px; }
  .row-pat-name { font-size: 18px; line-height: 1; color: rgba(237,232,220,0.45); }

  .row-key {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.25);
    padding: 2px 4px;
    font-size: 9px;
    font-family: var(--font-data);
    letter-spacing: 0.04em;
    flex-shrink: 0;
    min-width: 28px;
    text-align: center;
  }
  .row-key.has-key { color: rgba(237,232,220,0.65); border-color: rgba(237,232,220,0.30); }
  .row-key:active { background: rgba(237,232,220,0.10); }

  .row-oct {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.25);
    padding: 2px 4px;
    font-size: 9px;
    font-family: var(--font-data);
    letter-spacing: 0.04em;
    flex-shrink: 0;
    min-width: 28px;
    text-align: center;
  }
  .row-oct.has-oct { color: rgba(237,232,220,0.65); border-color: rgba(237,232,220,0.30); }
  .row-oct:active { background: rgba(237,232,220,0.10); }

  /* ── Repeats group ── */
  .rpt-group {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .rpt-display {
    display: flex;
    align-items: center;
    gap: 1px;
    font-size: 18px;
    line-height: 1;
  }

  .rpt-times {
    font-size: 11px;
    color: rgba(237,232,220,0.30);
    margin-right: 1px;
  }

  .rpt-nav {
    border: 1px solid rgba(237,232,220,0.12);
    background: transparent;
    color: rgba(237,232,220,0.30);
    width: 16px;
    height: 20px;
    font-size: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .rpt-nav:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }

  /* ── Progress dots ── */
  .rpt-dots {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: 3px;
  }
  .rpt-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(237,232,220,0.12);
    transition: background 60ms;
  }
  .rpt-dot.filled { background: var(--color-olive); }
  .rpt-dot.playing {
    background: rgba(237,232,220,0.50);
    box-shadow: 0 0 3px rgba(237,232,220,0.30);
  }

  /* ── Perf button ── */
  .row-perf {
    border: 1.5px solid rgba(237,232,220,0.20);
    background: transparent;
    color: rgba(237,232,220,0.25);
    padding: 2px 5px;
    font-size: 8px;
    font-weight: 700;
    font-family: var(--font-data);
    letter-spacing: 0.04em;
    flex-shrink: 0;
    min-width: 38px;
    text-align: center;
    cursor: pointer;
  }
  .row-perf:active { background: rgba(237,232,220,0.08); }
  .perf-fill { color: var(--color-olive); border-color: var(--color-olive); }
  .perf-brk  { color: var(--color-salmon); border-color: var(--color-salmon); }
  .perf-rev  { color: var(--color-blue); border-color: var(--color-blue); }

  .row-perf-len {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.30);
    padding: 2px 4px;
    font-size: 7px;
    font-weight: 700;
    font-family: var(--font-data);
    letter-spacing: 0.02em;
    flex-shrink: 0;
    min-width: 22px;
    text-align: center;
    cursor: pointer;
    margin-left: -2px;
  }
  .row-perf-len:active:not(:disabled) { background: rgba(237,232,220,0.08); }
  .row-perf-len:disabled { cursor: default; opacity: 0.4; }
  .row-perf-len.perf-fill { color: var(--color-olive); border-color: color-mix(in srgb, var(--color-olive) 50%, transparent); }
  .row-perf-len.perf-brk  { color: var(--color-salmon); border-color: color-mix(in srgb, var(--color-salmon) 50%, transparent); }
  .row-perf-len.perf-rev  { color: var(--color-blue); border-color: color-mix(in srgb, var(--color-blue) 50%, transparent); }

  .row-del {
    border: 1px solid rgba(237,232,220,0.12);
    background: transparent;
    color: rgba(237,232,220,0.25);
    width: 22px;
    height: 22px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .row-del:active { background: rgba(237,232,220,0.10); color: rgba(237,232,220,0.60); }

  /* ── FX nodes (inline) ── */
  .fx-nodes {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .fx-node {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .fx-toggle {
    border: 1.5px solid rgba(237,232,220,0.18);
    background: transparent;
    color: rgba(237,232,220,0.22);
    padding: 2px 5px;
    font-size: 8px;
    font-weight: 700;
    font-family: var(--font-data);
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 40ms, color 40ms;
  }
  .fx-toggle:active { background: rgba(237,232,220,0.08); }

  /* FX active colors (matching FxPad node colors) */
  .fx-vrb.active .fx-toggle { background: color-mix(in srgb, var(--color-olive) 25%, transparent); color: var(--color-olive); border-color: var(--color-olive); }
  .fx-dly.active .fx-toggle { background: color-mix(in srgb, var(--color-blue) 25%, transparent); color: var(--color-blue); border-color: var(--color-blue); }
  .fx-glt.active .fx-toggle { background: color-mix(in srgb, var(--color-salmon) 25%, transparent); color: var(--color-salmon); border-color: var(--color-salmon); }
  .fx-grn.active .fx-toggle { background: color-mix(in srgb, var(--color-purple) 25%, transparent); color: var(--color-purple); border-color: var(--color-purple); }

  @media (max-width: 639px) {
    .chain-header { padding: 6px 8px; gap: 6px; }
    .chain-row {
      flex-wrap: wrap;
      height: auto;
      min-height: 36px;
      gap: 3px;
      padding: 4px 8px;
    }
    .row-pat-id { font-size: 16px; }
    .row-pat-name { font-size: 14px; }
    .row-sep { font-size: 14px; }
    .rpt-display { font-size: 14px; }
    .row-key { font-size: 8px; min-width: 24px; padding: 2px 3px; }
    .row-oct { font-size: 8px; min-width: 24px; padding: 2px 3px; }
    .rpt-nav { width: 14px; height: 18px; font-size: 6px; }
    .row-nav { width: 18px; height: 20px; font-size: 7px; }
    /* Delete stays on row 1, pushed right */
    .row-del { width: 20px; height: 20px; font-size: 10px; margin-left: auto; }
    /* FX nodes + perf wrap to row 2 via order */
    .fx-nodes {
      order: 20;
      margin-left: 0;
      gap: 2px;
      padding-left: 22px;
    }
    .fx-toggle { padding: 2px 4px; font-size: 7px; }
    /* Hide knobs on mobile — toggle-only */
    .fx-node :global(.knob-wrap) { display: none; }
    .row-perf { order: 21; font-size: 7px; min-width: 28px; padding: 2px 4px; }
    .row-perf-len { order: 22; font-size: 6px; min-width: 18px; padding: 2px 3px; }
  }
</style>
