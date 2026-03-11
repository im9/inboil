<script lang="ts">
  import { perf, playback, ui, vkbd, midiIn, isViewingPlayingPattern, song, fxPad, NOTE_NAMES } from '../state.svelte.ts'
  import { ICON } from '../icons.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import { engine } from '../audio/engine.ts'
  import { PATTERN_TEMPLATES } from '../factory.ts'
  import { patternApplyTemplate } from '../sectionActions.ts'

  let { onRandom, onClose, onLoop }: { onRandom: () => void; onClose: () => void; onLoop: () => void } = $props()

  const isLooping = $derived(playback.playing && playback.mode === 'loop')
  const isViewingPlaying = $derived(isViewingPlayingPattern())

  const pat = $derived(song.patterns[ui.currentPattern])
  const patName = $derived(pat?.name || `PAT ${String(ui.currentPattern).padStart(2, '0')}`)
  const patColor = $derived(PATTERN_COLORS[pat?.color ?? 0])

  // ── Template picker ──
  let tmplOpen = $state(false)

  function applyTemplate(templateId: string) {
    tmplOpen = false
    patternApplyTemplate(ui.currentPattern, templateId)
  }

  const KEYS = NOTE_NAMES.map((note, i) => ({
    note,
    black: [1, 3, 6, 8, 10].includes(i),
  }))

  // ── Octave pending display ──
  let appliedOctave = $state(0)
  const isPendingOct = $derived(perf.octave !== appliedOctave && playback.playing)

  let prevHead0 = 0
  $effect(() => {
    const h = playback.playheads[0]
    if (h === 0 && prevHead0 !== 0) appliedOctave = perf.octave
    if (!playback.playing) appliedOctave = perf.octave
    prevHead0 = h
  })
  const octDisplay = $derived(perf.octave > 0 ? `+${perf.octave}` : `${perf.octave}`)

  // ── Mobile key menu ──
  const WHITE_IDX = [0, 2, 4, 5, 7, 9, 11]
  const WHITE_ANGLES = [0, 15, 30, 45, 60, 75, 90]
  const BLACK_IDX = [1, 3, 6, 8, 10]
  const BLACK_ANGLES = [7.5, 22.5, 52.5, 67.5, 82.5]
  const ARC_DATA = KEYS.map((key, i) => {
    const wi = WHITE_IDX.indexOf(i)
    const origAngle = wi >= 0
      ? WHITE_ANGLES[wi]
      : BLACK_ANGLES[BLACK_IDX.indexOf(i)]
    const angle = 90 - origAngle
    const isWhite = wi >= 0
    const r = isWhite ? 93 : 85
    const rad = angle * Math.PI / 180
    return {
      note: key.note, black: key.black,
      x: r * Math.cos(rad), y: r * Math.sin(rad),
      rot: angle + 90,
    }
  })

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

  // ── Virtual MIDI Keyboard ──

  const KEY_MAP: Record<string, number> = {
    a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
    g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
    o: 13, l: 14, p: 15, ';': 16,
  }

  function keyToMidi(key: string): number | null {
    const offset = KEY_MAP[key.toLowerCase()]
    if (offset == null) return null
    return vkbd.octave * 12 + offset
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
    engine.sendPattern(song, perf, fxPad)
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

<div class="pattern-toolbar">
  <!-- Pattern name indicator -->
  <div class="pat-indicator" data-tip="Current pattern" data-tip-ja="現在のパターン">
    <span class="pat-dot" style="background: {patColor}"></span>
    <span class="pat-label">{patName}</span>
  </div>

  <!-- Template picker -->
  <div class="tmpl-wrap">
    <button
      class="btn-tmpl"
      class:open={tmplOpen}
      onpointerdown={() => { tmplOpen = !tmplOpen }}
      data-tip="Apply track template" data-tip-ja="トラックテンプレートを適用"
    >TMPL</button>
    {#if tmplOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="tmpl-backdrop" onpointerdown={() => { tmplOpen = false }}></div>
      <div class="tmpl-dropdown">
        {#each PATTERN_TEMPLATES as tmpl}
          <button class="tmpl-option" onpointerdown={() => applyTemplate(tmpl.id)}>
            {tmpl.name}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="sep" aria-hidden="true"></div>

  <!-- KEY piano (desktop) -->
  <div class="toolbar-group key-group">
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

  <div class="sep" aria-hidden="true"></div>

  <!-- RAND -->
  <button
    class="btn-rand"
    onpointerdown={onRandom}
    aria-label="Randomize"
    data-tip="Randomize pattern" data-tip-ja="パターンをランダム生成"
  >RND</button>

  <div class="sep" aria-hidden="true"></div>

  <!-- VKBD (desktop only) -->
  <div class="toolbar-group vkbd-group">
    <button
      class="btn-kbd"
      class:active={vkbd.enabled}
      onpointerdown={() => { vkbd.enabled = !vkbd.enabled }}
      data-tip="Virtual keyboard — play notes with PC keys (A-;)" data-tip-ja="バーチャルキーボード — PCキーで演奏 (A-;)"
      aria-label="Virtual keyboard"
    ><svg class="kbd-icon" viewBox="0 0 24 16" width="20" height="13" fill="none" stroke="currentColor" stroke-width="1.5">{@html ICON.keyboard}</svg></button>
    {#if vkbd.enabled}
      <span class="vkbd-info">C{vkbd.octave}</span>
    {/if}
    {#if midiIn.enabled}
      <span class="midi-indicator" class:active={midiIn.receiving}
        data-tip="MIDI input active" data-tip-ja="MIDI入力中"
      >MIDI</span>
    {/if}
  </div>

  <!-- Loop button (right-aligned) -->
  <button
    class="btn-loop"
    class:active={isLooping}
    class:spinning={isLooping && isViewingPlaying}
    class:mismatch={playback.playing && !isViewingPlaying}
    onpointerdown={onLoop}
    aria-label="Loop this pattern"
    data-tip="Loop this pattern (exit scene mode)" data-tip-ja="このパターンをループ再生 (シーンモード解除)"
  >
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">{@html ICON.repeat}</svg>
  </button>

  <!-- Close button -->
  <button
    class="btn-close"
    onpointerdown={onClose}
    aria-label="Close pattern editor"
    data-tip="Close pattern editor" data-tip-ja="パターンエディタを閉じる"
  >✕</button>
</div>

<!-- Mobile: keyboard fan-out overlay -->
<div class="key-arc-overlay" class:open={keyMenuOpen}>
  <button class="key-arc-backdrop" aria-label="Close keyboard menu" onpointerdown={() => { keyMenuOpen = false }}></button>
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
  .pattern-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px 10px;
    background: var(--color-bg);
    border-bottom: 1px solid rgba(30,32,40,0.08);
    flex-shrink: 0;
  }

  /* ── Pattern indicator ── */
  .pat-indicator {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .pat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .pat-label {
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgba(30,32,40,0.55);
    white-space: nowrap;
  }

  /* ── Template picker ── */
  .tmpl-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .btn-tmpl {
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    padding: 4px 8px;
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .btn-tmpl.open {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .tmpl-backdrop {
    position: fixed;
    inset: 0;
    z-index: 199;
  }
  .tmpl-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 200;
    min-width: 100px;
    background: var(--color-bg);
    border: 1px solid rgba(30,32,40,0.20);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    display: flex;
    flex-direction: column;
    padding: 2px;
    animation: tmpl-in 80ms ease-out;
  }
  @keyframes tmpl-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .tmpl-option {
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(30,32,40,0.70);
    background: none;
    border: none;
    padding: 6px 10px;
    text-align: left;
    cursor: pointer;
    border-radius: 2px;
    transition: background 40ms, color 40ms;
    white-space: nowrap;
  }
  .tmpl-option:hover {
    background: rgba(30,32,40,0.08);
    color: var(--color-fg);
  }
  .tmpl-option:active {
    background: rgba(30,32,40,0.14);
  }

  /* ── Loop button ── */
  .btn-loop {
    margin-left: auto;
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 60ms, background 60ms, border-color 60ms;
  }
  .btn-loop.active {
    color: var(--color-olive);
    border-color: var(--color-olive);
    background: rgba(120,120,69,0.08);
  }
  .btn-loop.mismatch {
    color: rgba(30,32,40,0.20);
    border-color: rgba(30,32,40,0.10);
  }
  .btn-loop.spinning :global(svg) {
    animation: loop-spin 1.2s linear infinite;
  }
  @keyframes loop-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  .btn-close {
    border: 1.5px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
    width: 24px;
    height: 24px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .group-label {
    font-size: 9px;
    letter-spacing: 0.08em;
    color: rgba(30,32,40,0.35);
    text-transform: uppercase;
  }

  .sep {
    width: 1px;
    height: 24px;
    background: rgba(30,32,40,0.10);
    flex-shrink: 0;
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
    background: rgba(255,255,255,0.7);
    color: var(--color-fg);
    border: 1px solid rgba(30,32,40,0.10);
  }

  .key.black {
    width: 16px;
    background: var(--color-fg);
    color: rgba(237,232,220,0.50);
  }

  .key.active:not(.black) {
    background: var(--color-olive);
    color: #fff;
    border-color: var(--color-olive);
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
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    width: 20px;
    height: 20px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .oct-value {
    font-family: var(--font-display);
    font-size: 22px;
    line-height: 1;
    color: rgba(30,32,40,0.60);
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

  /* ── RAND ── */
  .btn-rand {
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }
  .btn-rand:active {
    background: var(--color-olive);
    color: var(--color-bg);
  }

  /* ── VKBD ── */
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
    color: rgba(30,32,40,0.50);
    white-space: nowrap;
  }

  .midi-indicator {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(30,32,40,0.35);
    white-space: nowrap;
  }
  .midi-indicator.active {
    color: var(--color-olive);
  }

  /* ── Mobile ── */
  .key-menu { display: none; }
  .key-arc-overlay { display: none; }

  @media (max-width: 639px) {
    .pattern-toolbar {
      gap: 8px;
      padding: 4px 8px;
    }

    .sep { display: none; }
    .group-label { display: none; }

    /* Hide desktop keyboard + oct + vkbd on mobile */
    .keyboard, .oct-block { display: none; }
    .vkbd-group { display: none; }

    /* Show mobile key-menu trigger + oct-mini */
    .key-menu {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .key-menu-trigger {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1.5px solid rgba(30,32,40,0.25);
      background: rgba(255,255,255,0.5);
      color: rgba(30,32,40,0.75);
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
      background: rgba(30,32,40,0.08);
      border-color: rgba(30,32,40,0.40);
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
      border: 1.5px solid var(--color-olive);
      background: transparent;
      color: var(--color-olive);
      font-size: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .oct-val-m {
      font-family: var(--font-data);
      font-size: 11px;
      line-height: 1;
      color: rgba(30,32,40,0.55);
    }
    .oct-val-m.pending {
      animation: oct-blink 400ms ease-in-out infinite;
    }

    .btn-rand {
      padding: 4px 8px;
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
