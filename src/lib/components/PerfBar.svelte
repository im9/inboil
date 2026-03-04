<script lang="ts">
  import { song, perf, playback, ui, effects, fxPad, vkbd, NOTE_NAMES } from '../state.svelte.ts'
  import { engine } from '../audio/engine.ts'
  import Knob from './Knob.svelte'
  import PerfButtons from './PerfButtons.svelte'

  let { onPlay, onStop, onRandom }: { onPlay?: () => void; onStop?: () => void; onRandom?: () => void } = $props()

  const KEYS = NOTE_NAMES.map((note, i) => ({
    note,
    black: [1, 3, 6, 8, 10].includes(i),
  }))

  // ── Arc layout data for mobile keyboard fan-out ──
  // Rectangular piano keys in a fan arc (quarter-circle, C=bottom → B=right)
  // White keys: outer ring, Black keys: inner ring (like a real keyboard)
  const WHITE_IDX = [0, 2, 4, 5, 7, 9, 11]
  const WHITE_ANGLES = [0, 15, 30, 45, 60, 75, 90]
  const BLACK_IDX = [1, 3, 6, 8, 10]
  const BLACK_ANGLES = [7.5, 22.5, 52.5, 67.5, 82.5]
  const ARC_DATA = KEYS.map((key, i) => {
    const wi = WHITE_IDX.indexOf(i)
    const origAngle = wi >= 0
      ? WHITE_ANGLES[wi]
      : BLACK_ANGLES[BLACK_IDX.indexOf(i)]
    const angle = 90 - origAngle  // flip: C at bottom, B at right
    const isWhite = wi >= 0
    const r = isWhite ? 93 : 85  // white outer, black inner
    const rad = angle * Math.PI / 180
    return {
      note: key.note, black: key.black,
      x: r * Math.cos(rad), y: r * Math.sin(rad),
      rot: angle + 90,  // radial outward rotation
    }
  })

  // ── Mobile key menu state ──
  let keyMenuOpen = $state(false)
  let triggerEl: HTMLButtonElement | undefined = $state(undefined)
  let arcCenter = $state({ x: 0, y: 0 })

  function toggleKeyMenu() {
    if (!keyMenuOpen && triggerEl) {
      const rect = triggerEl.getBoundingClientRect()
      arcCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
    keyMenuOpen = !keyMenuOpen
  }

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

  // ── Virtual MIDI Keyboard ──
  const KEY_MAP: Record<string, number> = {
    a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
    g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
    o: 13, l: 14, p: 15, ';': 16,
  }

  function keyToMidi(key: string): number | null {
    const offset = KEY_MAP[key.toLowerCase()]
    if (offset == null) return null
    return vkbd.octave * 12 + offset  // C at octave * 12
  }

  function isTextInput(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
  }

  let vkbdReady = false

  async function ensureEngine() {
    if (vkbdReady) return
    await engine.init()
    engine.sendPattern(song, effects, perf, fxPad)
    vkbdReady = true
  }

  async function handleVkbdKeyDown(e: KeyboardEvent) {
    if (!vkbd.enabled || isTextInput(e.target) || e.repeat) return

    const midi = keyToMidi(e.key)
    if (midi !== null) {
      e.preventDefault()
      await ensureEngine()
      vkbd.heldKeys.add(e.key.toLowerCase())
      engine.triggerNote(ui.selectedTrack, midi, vkbd.velocity)
      return
    }

    const k = e.key.toLowerCase()
    if (k === 'z') { vkbd.octave = Math.max(1, vkbd.octave - 1); e.preventDefault() }
    if (k === 'x') { vkbd.octave = Math.min(7, vkbd.octave + 1); e.preventDefault() }

    const vNum = parseInt(e.key)
    if (vNum >= 1 && vNum <= 9) { vkbd.velocity = vNum / 10; e.preventDefault() }
    if (e.key === '0') { vkbd.velocity = 1.0; e.preventDefault() }
  }

  function handleVkbdKeyUp(e: KeyboardEvent) {
    if (!vkbd.enabled) return
    const k = e.key.toLowerCase()
    if (vkbd.heldKeys.has(k)) {
      vkbd.heldKeys.delete(k)
      // Release voice when no keys remain held for this track
      if (vkbd.heldKeys.size === 0) {
        engine.releaseNote(ui.selectedTrack)
      }
    }
  }

  $effect(() => {
    if (vkbd.enabled) {
      window.addEventListener('keydown', handleVkbdKeyDown)
      window.addEventListener('keyup', handleVkbdKeyUp)
      return () => {
        window.removeEventListener('keydown', handleVkbdKeyDown)
        window.removeEventListener('keyup', handleVkbdKeyUp)
      }
    }
  })
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
      <button class="oct-adj" onpointerdown={() => { perf.octave = Math.min(2, perf.octave + 1) }} data-tip="Raise octave" data-tip-ja="オクターブを上げる">▲</button>
      <span class="oct-value" class:pending={isPendingOct} data-tip="Current octave offset" data-tip-ja="現在のオクターブオフセット">{octDisplay}</span>
      <button class="oct-adj" onpointerdown={() => { perf.octave = Math.max(-2, perf.octave - 1) }} data-tip="Lower octave" data-tip-ja="オクターブを下げる">▼</button>
      <span class="group-label">OCT</span>
    </div>

    <!-- Mobile: compact key trigger + octave -->
    <div class="key-menu">
      <button class="key-menu-trigger" bind:this={triggerEl} onpointerdown={toggleKeyMenu}>
        {NOTE_NAMES[perf.rootNote]}
      </button>
      <div class="oct-mini">
        <button class="oct-adj-m" onpointerdown={() => { perf.octave = Math.min(2, perf.octave + 1) }}>▲</button>
        <span class="oct-val-m" class:pending={isPendingOct}>{octDisplay}</span>
        <button class="oct-adj-m" onpointerdown={() => { perf.octave = Math.max(-2, perf.octave - 1) }}>▼</button>
      </div>
    </div>
  </div>

  <!-- Mobile transport (hidden on desktop) -->
  {#if onPlay}
    <div class="mobile-transport">
      <button
        class="btn-mt"
        class:active={playback.playing}
        onpointerdown={onPlay}
        aria-label="Play"
      >▶</button>
      <button
        class="btn-mt"
        onpointerdown={onStop}
        aria-label="Stop"
      >■</button>
      <button
        class="btn-mt btn-rand"
        onpointerdown={onRandom}
        aria-label="Randomize"
      >RND</button>
    </div>
  {/if}

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
      class:active={ui.view === 'tracker'}
      onpointerdown={() => { ui.view = 'tracker' }}
      data-tip="Tracker step editor" data-tip-ja="トラッカー型エディター"
    >TRKR</button>
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
      data-tip="Song editor (phrase-set mode)" data-tip-ja="ソングエディター (フレーズセット)"
    >CHN</button>
    <button
      class="btn-view"
      class:active={ui.view === 'song'}
      onpointerdown={() => { ui.view = 'song' }}
      data-tip="Song arrangement (per-track)" data-tip-ja="ソングアレンジメント (トラック別)"
    >SONG</button>
  </div>

  <div class="sep" aria-hidden="true"></div>

  <!-- Performance buttons (momentary press-hold) -->
  <div class="perf-group perf-btns">
    <PerfButtons variant="bar" />
  </div>

  <div class="sep" aria-hidden="true"></div>

  <!-- Virtual MIDI keyboard toggle (desktop only) -->
  <div class="perf-group vkbd-group">
    <button
      class="btn-perf btn-kbd"
      class:active={vkbd.enabled}
      onpointerdown={() => { vkbd.enabled = !vkbd.enabled }}
      data-tip="Virtual keyboard — play notes with PC keys (A-;)" data-tip-ja="バーチャルキーボード — PCキーで演奏 (A-;)"
    ><svg class="kbd-icon" viewBox="0 0 24 16" width="20" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="1" y="1" width="22" height="14" rx="1.5"/>
      <line x1="5.5" y1="1" x2="5.5" y2="9"/><line x1="9.5" y1="1" x2="9.5" y2="9"/>
      <line x1="14.5" y1="1" x2="14.5" y2="9"/><line x1="18.5" y1="1" x2="18.5" y2="9"/>
      <line x1="12" y1="1" x2="12" y2="15"/>
    </svg></button>
    {#if vkbd.enabled}
      <span class="vkbd-info">C{vkbd.octave}</span>
    {/if}
  </div>
</div>

<!-- Mobile: keyboard fan-out overlay -->
<div class="key-arc-overlay" class:open={keyMenuOpen}>
  <button class="key-arc-backdrop" onpointerdown={() => { keyMenuOpen = false }}></button>
  {#each ARC_DATA as key, i}
    {@const w = key.black ? 14 : 20}
    {@const h = key.black ? 30 : 46}
    <button
      class="key-fan"
      class:black={key.black}
      class:active-note={i === perf.rootNote}
      style="left:{(arcCenter.x + key.x - w / 2).toFixed(1)}px; top:{(arcCenter.y + key.y - h / 2).toFixed(1)}px; --w:{w}px; --h:{h}px; --rot:{key.rot.toFixed(1)}deg; --delay:{i * 15}ms"
      onpointerdown={() => { perf.rootNote = i; keyMenuOpen = false }}
    ><span class="key-fan-label">{key.note}</span></button>
  {/each}
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


  .btn-kbd {
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    padding: 4px 6px;
    display: flex;
    align-items: center;
  }
  .btn-kbd:active,
  .btn-kbd.active {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .kbd-icon { display: block; }

  .vkbd-info {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-olive);
    white-space: nowrap;
  }

  .gain-wrap { display: contents; }

  /* ── Mobile-only elements (hidden on desktop) ── */
  .key-menu { display: none; }
  .key-arc-overlay { display: none; }
  .mobile-transport { display: none; }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .perf-bar {
      flex-wrap: wrap;
      gap: 0;
      padding: 0;
    }

    .sep { display: none; }
    .group-label { display: none; }

    /* Show MSTR knobs on mobile, scaled down, right-aligned */
    .dyn-group {
      display: flex;
      gap: 2px;
      order: 10;
      margin-left: auto;
      padding-left: 4px;
      border-left: 1px solid rgba(237,232,220,0.12);
    }
    .gain-wrap {
      display: flex;
      gap: 2px;
      order: 10;
      padding-left: 4px;
      padding-right: 6px;
      border-left: 1px solid rgba(237,232,220,0.12);
    }
    .dyn-group :global(.knob-wrap),
    .gain-wrap :global(.knob-wrap) {
      transform: scale(0.72);
      margin: -5px -4px;
    }

    /* Hide perf-btns (moved to PerfBubble) and vkbd (no PC keyboard) */
    .perf-btns { display: none; }
    .vkbd-group { display: none; }

    /* Mobile transport */
    .mobile-transport {
      display: flex;
      gap: 3px;
      order: 10;
      align-items: center;
      margin-left: 10px;
    }
    .btn-mt {
      border: 1px solid rgba(237,232,220,0.45);
      background: transparent;
      color: var(--color-bg);
      padding: 0 12px;
      height: 28px;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-mt:active,
    .btn-mt.active {
      background: var(--color-bg);
      color: var(--color-fg);
    }
    .btn-mt.btn-rand {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      padding: 0 10px;
      border-color: var(--color-olive);
      color: var(--color-olive);
    }
    .btn-mt.btn-rand:active {
      background: var(--color-olive);
      color: var(--color-bg);
    }

    /* Hide desktop keyboard + oct on mobile */
    .keyboard, .oct-block { display: none; }

    /* Show mobile key-menu trigger + oct-mini */
    .key-menu {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .key-menu-trigger {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 1.5px solid rgba(237,232,220,0.40);
      background: rgba(237,232,220,0.08);
      color: rgba(237,232,220,0.85);
      font-family: var(--font-data);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 100ms, border-color 100ms;
    }
    .key-menu-trigger:active {
      background: rgba(237,232,220,0.18);
      border-color: rgba(237,232,220,0.60);
    }

    .oct-mini {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      flex-shrink: 0;
    }
    .oct-adj-m {
      width: 22px;
      height: 16px;
      border: 1px solid rgba(237,232,220,0.25);
      background: transparent;
      color: rgba(237,232,220,0.50);
      font-size: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .oct-adj-m:active { background: rgba(237,232,220,0.15); }
    .oct-val-m {
      font-family: var(--font-data);
      font-size: 11px;
      line-height: 1;
      color: rgba(237,232,220,0.60);
    }
    .oct-val-m.pending {
      animation: oct-blink 400ms ease-in-out infinite;
    }

    /* Row 1: key-trigger + oct + perf btns on one line */
    .perf-group { gap: 4px; padding: 4px 8px; }
    .perf-group:first-child {
      flex-direction: row;
      align-items: center;
      width: auto;
      padding: 6px 4px 6px 8px;
      gap: 6px;
      order: 10;
    }

    /* perf-btns hidden (display:none above), btn-perf styles not needed on mobile */

    /* Row 2: full-width tab bar */
    .view-toggle {
      order: 20;
      width: 100%;
      display: flex;
      gap: 0;
      border-top: 1px solid rgba(237,232,220,0.12);
    }
    .btn-view {
      flex: 1;
      padding: 6px 0;
      font-size: 9px;
      text-align: center;
      border: none;
      border-bottom: 2px solid transparent;
      color: rgba(237,232,220,0.35);
    }
    .btn-view:not(:last-child) { border-right: 1px solid rgba(237,232,220,0.08); }
    .btn-view.active {
      color: rgba(237,232,220,0.90);
      border-bottom-color: var(--color-olive);
      background: rgba(237,232,220,0.06);
    }

    /* ── Key fan-out overlay ── */
    .key-arc-overlay {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 200;
      pointer-events: none;
    }
    .key-arc-overlay.open {
      pointer-events: auto;
    }

    .key-arc-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.25);
      border: none;
      opacity: 0;
      pointer-events: none;
      transition: opacity 150ms;
    }
    .key-arc-overlay.open .key-arc-backdrop {
      opacity: 1;
      pointer-events: auto;
    }

    .key-fan {
      position: fixed;
      width: var(--w);
      height: var(--h);
      border-radius: 3px;
      border: none;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 4px;
      transform: rotate(var(--rot)) scale(0);
      opacity: 0;
      transition: transform 150ms cubic-bezier(0.2, 0, 0.4, 1.3),
                  opacity 150ms cubic-bezier(0.2, 0, 0.4, 1.3);
      transition-delay: 0ms;
      pointer-events: none;
      z-index: 201;
    }
    .key-fan:not(.black) {
      background: rgba(237,232,220,0.92);
      color: var(--color-fg);
      box-shadow: inset 0 -1px 3px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.12);
    }
    .key-fan.black {
      background: rgba(40,38,34,0.95);
      color: rgba(237,232,220,0.55);
      z-index: 202;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    }
    .key-fan.active-note {
      background: var(--color-olive) !important;
      color: #fff !important;
    }
    .key-fan:active {
      filter: brightness(1.15);
    }
    .key-fan-label {
      transform: rotate(calc(-1 * var(--rot)));
      font-family: var(--font-data);
      font-size: 7px;
      font-weight: 600;
      letter-spacing: 0.02em;
      line-height: 1;
    }

    .key-arc-overlay.open .key-fan {
      transform: rotate(var(--rot)) scale(1);
      opacity: 1;
      transition-delay: var(--delay);
      pointer-events: auto;
    }
  }
</style>
