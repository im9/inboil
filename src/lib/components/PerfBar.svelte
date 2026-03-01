<script lang="ts">
  import { perf, playback, ui, effects, NOTE_NAMES } from '../state.svelte.ts'
  import Knob from './Knob.svelte'

  const KEYS = NOTE_NAMES.map((note, i) => ({
    note,
    black: [1, 3, 6, 8, 10].includes(i),
  }))

  // Track pending octave: show target value while waiting for cycle boundary
  let appliedOctave = $state(0)
  const isPendingOct = $derived(perf.octave !== appliedOctave && playback.playing)

  // Update appliedOctave when playhead[0] wraps to 0 (cycle boundary)
  let prevHead0 = 0
  $effect(() => {
    const h = playback.playheads[0]
    if (h === 0 && prevHead0 !== 0) appliedOctave = perf.octave
    if (!playback.playing) appliedOctave = perf.octave
    prevHead0 = h
  })
  const octDisplay = $derived(perf.octave > 0 ? `+${perf.octave}` : `${perf.octave}`)
</script>

<div class="perf-bar">
  <!-- Key / Root note: Piano keyboard (OP-XY Brain style) -->
  <div class="perf-group">
    <span class="group-label">KEY</span>
    <div class="keyboard" data-tip="Set root note for scale transposition" data-tip-ja="スケール移調のルートノートを設定">
      {#each KEYS as key, i}
        <button
          class="key"
          class:black={key.black}
          class:active={i === perf.rootNote}
          onpointerdown={() => { perf.rootNote = i }}
        >{key.note}</button>
      {/each}
    </div>
    <!-- Octave shift -->
    <div class="oct-block">
      <button class="oct-adj" onpointerdown={() => { perf.octave = Math.max(-2, perf.octave - 1) }} data-tip="Lower octave" data-tip-ja="オクターブを下げる">−</button>
      <span class="oct-value" class:pending={isPendingOct} data-tip="Current octave offset" data-tip-ja="現在のオクターブオフセット">{octDisplay}</span>
      <button class="oct-adj" onpointerdown={() => { perf.octave = Math.min(2, perf.octave + 1) }} data-tip="Raise octave" data-tip-ja="オクターブを上げる">+</button>
      <span class="group-label">OCT</span>
    </div>
  </div>

  <div class="sep" aria-hidden="true"></div>

  <!-- Ducker + Comp -->
  <div class="perf-group dyn-group">
    <span data-tip="Sidechain ducker depth" data-tip-ja="サイドチェインダッカーの深さ">
    <Knob value={effects.ducker.depth} label="DUC" size={36} onchange={v => { effects.ducker.depth = v }} />
    </span>
    <span data-tip="Compressor makeup gain" data-tip-ja="コンプレッサーのメイクアップゲイン">
    <Knob value={(effects.comp.makeup - 1.0) / 2.5} label="CMP" size={36} onchange={v => { effects.comp.makeup = 1.0 + v * 2.5 }} />
    </span>
  </div>

  <div class="sep" aria-hidden="true"></div>

  <!-- Master gain + Swing -->
  <span class="gain-wrap">
    <span data-tip="Master output volume" data-tip-ja="マスター出力音量">
    <Knob value={perf.masterGain} label="GAIN" size={36} onchange={v => { perf.masterGain = v }} />
    </span>
    <span data-tip="Swing amount (shuffle feel)" data-tip-ja="スウィング量 (シャッフル感)">
    <Knob value={perf.swing} label="SWG" size={36} onchange={v => { perf.swing = v }} />
    </span>
  </span>

  <div class="sep" aria-hidden="true"></div>

  <!-- View toggle: GRID / FX / EQ -->
  <div class="view-toggle">
    <button
      class="btn-view"
      class:active={ui.view === 'grid'}
      onpointerdown={() => { ui.view = 'grid' }}
      data-tip="Step sequencer view" data-tip-ja="ステップシーケンサー画面"
    >GRID</button>
    <button
      class="btn-view"
      class:active={ui.view === 'fx'}
      onpointerdown={() => { ui.view = 'fx' }}
      data-tip="Effects pad view" data-tip-ja="エフェクトパッド画面"
    >FX</button>
    <button
      class="btn-view"
      class:active={ui.view === 'eq'}
      onpointerdown={() => { ui.view = 'eq' }}
      data-tip="Filter/EQ view" data-tip-ja="フィルター/EQ画面"
    >EQ</button>
    <button
      class="btn-view"
      class:active={ui.view === 'chain'}
      onpointerdown={() => { ui.view = 'chain' }}
      data-tip="Pattern chain editor" data-tip-ja="パターンチェーンエディター"
    >CHN</button>
  </div>

  <div class="sep" aria-hidden="true"></div>

  <!-- Performance buttons (momentary press-hold) -->
  <div class="perf-group perf-btns">
    <button
      class="btn-perf"
      class:active={perf.filling}
      onpointerdown={() => { perf.filling = true }}
      onpointerup={() => { perf.filling = false }}
      onpointerleave={() => { perf.filling = false }}
      data-tip="Hold for drum fill" data-tip-ja="長押しでドラムフィル"
    >FILL</button>
    <button
      class="btn-perf"
      class:active={perf.reversing}
      onpointerdown={() => { perf.reversing = true }}
      onpointerup={() => { perf.reversing = false }}
      onpointerleave={() => { perf.reversing = false }}
      data-tip="Hold to reverse playback" data-tip-ja="長押しで逆再生"
    >REV</button>
    <button
      class="btn-perf btn-brk"
      class:active={perf.breaking}
      onpointerdown={() => { perf.breaking = true }}
      onpointerup={() => { perf.breaking = false }}
      onpointerleave={() => { perf.breaking = false }}
      data-tip="Hold for rhythmic break" data-tip-ja="長押しでリズムブレイク"
    >BRK</button>
  </div>
</div>

<style>
  .perf-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 16px;
    background: var(--color-fg);
    flex-shrink: 0;
  }

  .perf-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .group-label {
    font-size: 9px;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.38);
    text-transform: uppercase;
  }

  /* ── Piano keyboard ── */
  .keyboard {
    display: flex;
    gap: 1px;
  }

  .key {
    height: 28px;
    border: none;
    font-size: 8px;
    font-family: var(--font-data);
    letter-spacing: 0.02em;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 3px;
    transition: background 40ms;
  }

  .key:not(.black) {
    width: 22px;
    background: rgba(237,232,220,0.82);
    color: var(--color-fg);
  }

  .key.black {
    width: 16px;
    background: rgba(237,232,220,0.10);
    color: rgba(237,232,220,0.40);
  }

  .key.active:not(.black) {
    background: var(--color-olive);
    color: #fff;
  }

  .key.active.black {
    background: var(--color-olive);
    color: #fff;
  }

  /* ── Octave ── */
  .oct-block {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: 8px;
  }
  .oct-adj {
    border: 1px solid rgba(237,232,220,0.30);
    background: transparent;
    color: rgba(237,232,220,0.60);
    width: 20px;
    height: 20px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .oct-adj:active { background: rgba(237,232,220,0.15); }
  .oct-value {
    font-family: var(--font-display);
    font-size: 22px;
    line-height: 1;
    color: rgba(237,232,220,0.70);
    display: inline-block;
    min-width: 2ch;
    text-align: right;
  }
  .oct-value.pending {
    animation: oct-blink 400ms ease-in-out infinite;
  }
  @keyframes oct-blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.3; }
  }

  /* ── Dynamics (ducker + comp) ── */
  .dyn-group {
    gap: 10px;
  }

  /* ── Separator ── */
  .sep {
    width: 1px;
    height: 28px;
    background: rgba(237,232,220,0.12);
    flex-shrink: 0;
  }

  /* ── View toggle ── */
  .view-toggle {
    display: flex;
    gap: 0;
  }

  .btn-view {
    border: 1.5px solid rgba(237,232,220,0.30);
    background: transparent;
    color: rgba(237,232,220,0.40);
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: background 40ms linear, color 40ms linear;
    user-select: none;
  }
  .btn-view:not(:last-child) { border-right: none; }
  .btn-view.active {
    background: rgba(237,232,220,0.12);
    color: rgba(237,232,220,0.85);
    border-color: rgba(237,232,220,0.45);
  }

  /* ── Performance buttons ── */
  .perf-btns {
    gap: 4px;
  }

  .btn-perf {
    border: 1.5px solid var(--color-blue);
    background: transparent;
    color: var(--color-blue);
    padding: 5px 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: background 40ms linear, color 40ms linear;
    user-select: none;
    touch-action: none;
  }
  .btn-perf:active,
  .btn-perf.active {
    background: var(--color-blue);
    color: var(--color-bg);
  }

  .btn-brk {
    border-color: var(--color-salmon);
    color: var(--color-salmon);
  }
  .btn-brk:active,
  .btn-brk.active {
    background: var(--color-salmon);
    color: var(--color-bg);
  }

  .gain-wrap { display: contents; }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .perf-bar {
      gap: 8px;
      padding: 4px 8px;
    }

    .sep,
    .dyn-group,
    .gain-wrap,
    .group-label { display: none; }

    .perf-group { gap: 4px; }

    .key { height: 20px; font-size: 6px; padding-bottom: 2px; }
    .key:not(.black) { width: 16px; }
    .key.black { width: 11px; }

    .oct-block { gap: 2px; margin-left: 4px; }
    .oct-adj { width: 16px; height: 16px; font-size: 10px; }
    .oct-value { font-size: 14px; }

    .btn-view { padding: 3px 6px; font-size: 8px; }
    .btn-perf { padding: 3px 6px; font-size: 8px; }

    .perf-btns { gap: 3px; }
  }
</style>
