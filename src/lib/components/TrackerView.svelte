<script lang="ts">
  import {
    song, playback, ui, activeCell, isDrum,
    toggleTrig, setTrigNote, setTrigVelocity, setTrigDuration,
    setTrigSlide, setTrigChance, toggleMute, toggleSolo,
  } from '../state.svelte.ts'
  import { NOTE_NAMES, PIANO_ROLL_MIN, PIANO_ROLL_MAX } from '../constants.ts'

  // ── Cursor state ─────────────────────────────────────────────────
  let cursorRow = $state(0)
  let cursorCol = $state(0)  // 0=NOTE 1=VEL 2=DUR 3=SLD 4=CHN
  const COL_COUNT = 5

  const trackId = $derived(ui.selectedTrack)
  const track = $derived(song.tracks[trackId])
  const ph = $derived(activeCell(trackId))
  const drum = $derived(isDrum(track))

  // ── Note display ─────────────────────────────────────────────────
  function noteLabel(midi: number): string {
    const name = NOTE_NAMES[midi % 12]
    const oct = Math.floor(midi / 12) - 1
    return `${name.padEnd(2, '-')}${oct}`
  }

  function velLabel(v: number): string {
    return String(Math.round(v * 99)).padStart(2, '0')
  }

  function durLabel(d: number): string {
    return String(d).padStart(2, '0')
  }

  function chnLabel(c: number | undefined): string {
    if (c == null) return '---'
    return `${Math.round(c * 100)}%`
  }

  // ── Continuation detection ────────────────────────────────────────
  function isContinuation(stepIdx: number): boolean {
    for (let d = 1; d <= 16; d++) {
      const prev = stepIdx - d
      if (prev < 0) break
      const t = ph.trigs[prev]
      if (!t) break
      if (t.active && (t.duration ?? 1) > d) return true
      if (t.active) break
    }
    return false
  }

  // ── Keyboard input buffer for note entry ──────────────────────────
  let noteBuffer = ''
  let noteTimer = 0

  function commitNote(letter: string) {
    const sharp = letter.endsWith('#')
    const base = sharp ? letter.slice(0, -1) : letter
    const idx = NOTE_NAMES.indexOf(base as typeof NOTE_NAMES[number])
    if (idx < 0) return
    const noteIdx = sharp ? idx + 1 : idx
    if (noteIdx > 11) return

    // Find closest octave to current note
    const currentNote = ph.trigs[cursorRow]?.note ?? 60
    const currentOct = Math.floor(currentNote / 12)
    let midi = currentOct * 12 + noteIdx
    if (midi < PIANO_ROLL_MIN) midi += 12
    if (midi > PIANO_ROLL_MAX) midi -= 12
    midi = Math.max(PIANO_ROLL_MIN, Math.min(PIANO_ROLL_MAX, midi))

    setTrigNote(trackId, cursorRow, midi)
  }

  // ── Keyboard navigation ──────────────────────────────────────────
  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return

    const steps = ph.steps

    // Navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      cursorRow = Math.max(0, cursorRow - 1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      cursorRow = Math.min(steps - 1, cursorRow + 1)
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      cursorCol = Math.max(0, cursorCol - 1)
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      cursorCol = Math.min(COL_COUNT - 1, cursorCol + 1)
      return
    }
    if (e.key === 'PageUp') {
      e.preventDefault()
      cursorRow = Math.max(0, cursorRow - 8)
      return
    }
    if (e.key === 'PageDown') {
      e.preventDefault()
      cursorRow = Math.min(steps - 1, cursorRow + 8)
      return
    }
    if (e.key === '[') {
      e.preventDefault()
      ui.selectedTrack = Math.max(0, trackId - 1)
      cursorRow = Math.min(cursorRow, activeCell(ui.selectedTrack).steps - 1)
      return
    }
    if (e.key === ']') {
      e.preventDefault()
      ui.selectedTrack = Math.min(7, trackId + 1)
      cursorRow = Math.min(cursorRow, activeCell(ui.selectedTrack).steps - 1)
      return
    }

    // Delete / Backspace — clear step
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      const trig = ph.trigs[cursorRow]
      if (trig?.active) toggleTrig(trackId, cursorRow)
      return
    }

    // Enter — toggle active
    if (e.key === 'Enter') {
      e.preventDefault()
      if (cursorCol === 3) {
        // SLD column: toggle slide
        const trig = ph.trigs[cursorRow]
        if (trig) setTrigSlide(trackId, cursorRow, !trig.slide)
      } else {
        toggleTrig(trackId, cursorRow)
      }
      return
    }

    // Column-specific editing
    if (cursorCol === 0 && !drum) {
      // NOTE column: type note letter
      const k = e.key.toUpperCase()
      if ('CDEFGAB'.includes(k)) {
        e.preventDefault()
        clearTimeout(noteTimer)
        noteBuffer += k
        noteTimer = window.setTimeout(() => {
          commitNote(noteBuffer)
          noteBuffer = ''
        }, 300)
        return
      }
      if (k === '#' && noteBuffer.length > 0) {
        e.preventDefault()
        clearTimeout(noteTimer)
        noteBuffer += '#'
        commitNote(noteBuffer)
        noteBuffer = ''
        return
      }
      // Octave up/down with shift+up/down handled by arrow keys + shift
      if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (trig?.active) {
          const dir = e.key === 'ArrowUp' ? 12 : -12
          const newNote = Math.max(PIANO_ROLL_MIN, Math.min(PIANO_ROLL_MAX, trig.note + dir))
          setTrigNote(trackId, cursorRow, newNote)
        }
        return
      }
    }

    if (cursorCol === 1) {
      // VEL column: type digits
      const d = parseInt(e.key)
      if (!isNaN(d)) {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (!trig?.active) return
        // Single digit: map 1-9 = 0.1-0.9, 0 = 1.0
        const vel = d === 0 ? 1.0 : d / 10
        setTrigVelocity(trackId, cursorRow, vel)
        return
      }
    }

    if (cursorCol === 2) {
      // DUR column: type digits
      const d = parseInt(e.key)
      if (!isNaN(d)) {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (!trig?.active) return
        setTrigDuration(trackId, cursorRow, d === 0 ? 16 : d)
        return
      }
    }

    if (cursorCol === 3) {
      // SLD column: space toggles
      if (e.key === ' ') {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (trig) setTrigSlide(trackId, cursorRow, !trig.slide)
        return
      }
    }

    if (cursorCol === 4) {
      // CHN column: type digits for chance
      const d = parseInt(e.key)
      if (!isNaN(d)) {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (!trig?.active) return
        // 0 = 100% (undefined), 1-9 = 10%-90%
        const chance = d === 0 ? 1.0 : d / 10
        setTrigChance(trackId, cursorRow, chance)
        return
      }
    }
  }

  // ── Cell click ───────────────────────────────────────────────────
  function clickCell(row: number, col: number) {
    cursorRow = row
    cursorCol = col
  }

  // ── Auto-scroll cursor into view ──────────────────────────────────
  let gridEl: HTMLDivElement | undefined = $state()

  $effect(() => {
    void cursorRow
    if (!gridEl) return
    const row = gridEl.querySelector(`.tracker-row[data-row="${cursorRow}"]`) as HTMLElement | null
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
</script>

<svelte:window onkeydown={onKeydown} />

<div class="tracker-view">
  <!-- Track selector -->
  <div class="track-bar">
    {#each song.tracks as t, i}
      <div
        class="track-btn"
        class:selected={i === trackId}
        class:muted={t.muted}
        class:soloed={ui.soloTracks.has(i)}
      >
        <button class="track-label" onpointerdown={() => { ui.selectedTrack = i; cursorRow = Math.min(cursorRow, activeCell(i).steps - 1) }}>{t.name}</button>
        <button class="track-act" onpointerdown={() => toggleMute(i)}
          data-tip="Mute" data-tip-ja="ミュート"
        >{t.muted ? 'M' : 'm'}</button>
        <button class="track-act" class:active={ui.soloTracks.has(i)} onpointerdown={() => toggleSolo(i)}
          data-tip="Solo" data-tip-ja="ソロ"
        >S</button>
      </div>
    {/each}
  </div>

  <!-- Column headers -->
  <div class="col-headers">
    <span class="col-h col-num">#</span>
    <span class="col-h col-note" class:col-active={cursorCol === 0}>NOTE</span>
    <span class="col-h col-vel" class:col-active={cursorCol === 1}>VEL</span>
    <span class="col-h col-dur" class:col-active={cursorCol === 2}>DUR</span>
    <span class="col-h col-sld" class:col-active={cursorCol === 3}>SLD</span>
    <span class="col-h col-chn" class:col-active={cursorCol === 4}>CHN</span>
  </div>

  <!-- Step rows -->
  <div class="tracker-grid" bind:this={gridEl}>
    {#each ph.trigs as trig, si}
      {@const isPlayhead = playback.playheads[trackId] === si}
      {@const isCursor = cursorRow === si}
      {@const cont = !trig.active && isContinuation(si)}
      <div
        class="tracker-row"
        class:playhead={isPlayhead}
        class:cursor-row={isCursor}
        class:active={trig.active}
        class:cont={cont}
        class:beat={si % 4 === 0}
        data-row={si}
      >
        <!-- Step number -->
        <span class="cell cell-num">{String(si + 1).padStart(2, '0')}</span>

        <!-- NOTE -->
        <button
          class="cell cell-note"
          class:cursor={isCursor && cursorCol === 0}
          onpointerdown={() => clickCell(si, 0)}
        >
          {#if trig.active}
            {drum ? '***' : noteLabel(trig.note)}
          {:else if cont}
            ···
          {:else}
            ---
          {/if}
        </button>

        <!-- VEL -->
        <button
          class="cell cell-vel"
          class:cursor={isCursor && cursorCol === 1}
          onpointerdown={() => clickCell(si, 1)}
        >
          {#if trig.active}
            {velLabel(trig.velocity)}
          {:else if cont}
            ··
          {:else}
            --
          {/if}
        </button>

        <!-- DUR -->
        <button
          class="cell cell-dur"
          class:cursor={isCursor && cursorCol === 2}
          onpointerdown={() => clickCell(si, 2)}
        >
          {#if trig.active}
            {durLabel(trig.duration)}
          {:else if cont}
            ··
          {:else}
            --
          {/if}
        </button>

        <!-- SLD -->
        <button
          class="cell cell-sld"
          class:cursor={isCursor && cursorCol === 3}
          onpointerdown={() => clickCell(si, 3)}
        >
          {#if trig.active && trig.slide}
            SLD
          {:else if trig.active}
            ---
          {:else if cont}
            ···
          {:else}
            ---
          {/if}
        </button>

        <!-- CHN -->
        <button
          class="cell cell-chn"
          class:cursor={isCursor && cursorCol === 4}
          onpointerdown={() => clickCell(si, 4)}
        >
          {#if trig.active}
            {chnLabel(trig.chance)}
          {:else if cont}
            ···
          {:else}
            ---
          {/if}
        </button>
      </div>
    {/each}
  </div>
</div>

<style>
  .tracker-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background: var(--color-fg);
    color: rgba(237,232,220,0.55);
  }

  /* ── Track selector bar ── */
  .track-bar {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
    overflow-x: auto;
  }

  .track-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 2px;
    flex-shrink: 0;
    border-bottom: 2px solid transparent;
    transition: background 40ms;
  }
  .track-btn.selected {
    border-bottom-color: var(--color-olive);
    background: rgba(237,232,220,0.04);
  }
  .track-btn.muted { opacity: 0.4; }
  .track-btn.soloed .track-label { color: var(--color-olive); }

  .track-label {
    border: none;
    background: transparent;
    color: rgba(237,232,220,0.35);
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    padding: 4px 4px;
  }
  .track-btn.selected .track-label { color: rgba(237,232,220,0.85); }

  .track-act {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.25);
    width: 16px;
    height: 14px;
    font-size: 7px;
    font-weight: 700;
    font-family: var(--font-data);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .track-act:active { background: rgba(237,232,220,0.10); }
  .track-act.active { color: var(--color-olive); border-color: var(--color-olive); }

  /* ── Column headers ── */
  .col-headers {
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(237,232,220,0.12);
    flex-shrink: 0;
    height: 22px;
  }

  .col-h {
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.25);
    text-align: center;
  }
  .col-h.col-active { color: var(--color-olive); }

  .col-num  { width: 28px; flex-shrink: 0; }
  .col-note { width: 48px; flex-shrink: 0; }
  .col-vel  { width: 36px; flex-shrink: 0; }
  .col-dur  { width: 36px; flex-shrink: 0; }
  .col-sld  { width: 36px; flex-shrink: 0; }
  .col-chn  { width: 40px; flex-shrink: 0; }

  /* ── Grid ── */
  .tracker-grid {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* ── Row ── */
  .tracker-row {
    display: flex;
    align-items: center;
    height: 24px;
    border-bottom: 1px solid rgba(237,232,220,0.03);
    transition: background 40ms;
  }
  .tracker-row.beat { border-bottom-color: rgba(237,232,220,0.08); }
  .tracker-row.playhead { background: rgba(120,120,69,0.18); }
  .tracker-row.cursor-row { background: rgba(237,232,220,0.04); }
  .tracker-row.playhead.cursor-row { background: rgba(120,120,69,0.25); }
  .tracker-row.cont { opacity: 0.30; }

  /* ── Cells ── */
  .cell {
    font-family: var(--font-data);
    font-size: 11px;
    text-align: center;
    letter-spacing: 0.02em;
    line-height: 24px;
  }

  .cell-num {
    width: 28px;
    flex-shrink: 0;
    font-size: 9px;
    color: rgba(237,232,220,0.18);
  }
  .tracker-row.beat .cell-num { color: rgba(237,232,220,0.30); }

  .cell-note,
  .cell-vel,
  .cell-dur,
  .cell-sld,
  .cell-chn {
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    padding: 0;
    cursor: pointer;
    transition: border-color 40ms, background 40ms;
  }

  .cell-note { width: 48px; flex-shrink: 0; }
  .cell-vel  { width: 36px; flex-shrink: 0; }
  .cell-dur  { width: 36px; flex-shrink: 0; }
  .cell-sld  { width: 36px; flex-shrink: 0; }
  .cell-chn  { width: 40px; flex-shrink: 0; }

  /* Active step styling */
  .tracker-row.active .cell-note { color: var(--color-olive); }
  .tracker-row.active .cell-vel  { color: rgba(237,232,220,0.70); }
  .tracker-row.active .cell-dur  { color: rgba(237,232,220,0.55); }
  .tracker-row.active .cell-sld  { color: var(--color-blue); }
  .tracker-row.active .cell-chn  { color: rgba(237,232,220,0.50); }

  /* Cursor cell */
  .cell.cursor {
    border-color: var(--color-olive);
    background: rgba(120,120,69,0.12);
  }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .track-bar { padding: 2px 4px; }
    .track-btn { padding: 3px 6px; font-size: 8px; }
    .track-actions { display: none; }

    .col-h { font-size: 7px; }
    .cell { font-size: 10px; }
    .cell-num { font-size: 8px; }

    .col-num, .cell-num   { width: 24px; }
    .col-note, .cell-note { width: 42px; }
    .col-vel, .cell-vel   { width: 32px; }
    .col-dur, .cell-dur   { width: 32px; }
    .col-sld, .cell-sld   { width: 32px; }
    .col-chn, .cell-chn   { width: 36px; }
  }
</style>
