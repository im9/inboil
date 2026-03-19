<script lang="ts">
  import { song, playback, ui, activeCell, trackDisplayName } from '../state.svelte.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import {
    isDrum, toggleTrig, setTrigNote, setTrigVelocity, setTrigDuration,
    setTrigSlide, setTrigChance, setParamLock, toggleMute, toggleSolo,
  } from '../stepActions.ts'
  import { NOTE_NAMES, PIANO_ROLL_MIN, PIANO_ROLL_MAX } from '../constants.ts'
  import { registerKeyLayer, unregisterKeyLayer } from '../keyRouter.ts'
  import { onMount } from 'svelte'

  // ── Column definitions ──────────────────────────────────────────
  // 0=NOTE 1=VEL 2=DUR 3=SLD 4=CHN | 5=VOL 6=PAN | 7=VERB 8=DLY 9=GLT 10=GRN
  const COLUMNS = ['NOTE','VEL','DUR','SLD','CHN','VOL','PAN','VERB','DLY','GLT','GRN'] as const
  type ColId = typeof COLUMNS[number]
  const COL_COUNT = COLUMNS.length

  // ParamLock key mapping for mix/fx columns
  const PLOCK_KEYS: Partial<Record<ColId, string>> = {
    VOL: 'vol', PAN: 'pan',
    VERB: 'reverbSend', DLY: 'delaySend', GLT: 'glitchSend', GRN: 'granularSend',
  }

  // Column colors for active steps
  const COL_COLORS: Partial<Record<ColId, string>> = {
    VOL: '#508080', PAN: '#508080',
    VERB: '#787845', DLY: '#4472B4', GLT: '#E8A090', GRN: '#9B6BA0',
  }

  // ── Cursor state ─────────────────────────────────────────────────
  let cursorRow = $state(0)
  let cursorCol = $state(0)

  const trackId = $derived(ui.selectedTrack)
  const ph = $derived(activeCell(trackId))
  const drum = $derived(isDrum(ph))

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

  function plockLabel(trig: { paramLocks?: Record<string, number> }, key: string, colId: ColId): string {
    const v = trig.paramLocks?.[key]
    if (v == null) return '··'
    if (colId === 'PAN') {
      // -1..1 → L50..R50, C for 0
      const pct = Math.round(v * 50)
      if (pct === 0) return ' C '
      return pct < 0 ? `L${Math.abs(pct).toString().padStart(2, '0')}` : `R${pct.toString().padStart(2, '0')}`
    }
    return String(Math.round(v * 99)).padStart(2, '0')
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

    const currentNote = ph.trigs[cursorRow]?.note ?? 60
    const currentOct = Math.floor(currentNote / 12)
    let midi = currentOct * 12 + noteIdx
    if (midi < PIANO_ROLL_MIN) midi += 12
    if (midi > PIANO_ROLL_MAX) midi -= 12
    midi = Math.max(PIANO_ROLL_MIN, Math.min(PIANO_ROLL_MAX, midi))

    setTrigNote(trackId, cursorRow, midi)
  }

  // ── Keyboard navigation (ADR 115: 'tracker' layer) ─────────────
  onMount(() => {
    registerKeyLayer('tracker', handleTrackerKeys)
    return () => unregisterKeyLayer('tracker')
  })

  function handleTrackerKeys(e: KeyboardEvent): boolean | void {

    const steps = ph.steps
    const colId = COLUMNS[cursorCol]

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
      if (colId === 'SLD') {
        const trig = ph.trigs[cursorRow]
        if (trig) setTrigSlide(trackId, cursorRow, !trig.slide)
      } else {
        toggleTrig(trackId, cursorRow)
      }
      return
    }

    // Column-specific editing
    if (colId === 'NOTE' && !drum) {
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

    if (colId === 'VEL') {
      const d = parseInt(e.key)
      if (!isNaN(d)) {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (!trig?.active) return
        const vel = d === 0 ? 1.0 : d / 10
        setTrigVelocity(trackId, cursorRow, vel)
        return
      }
    }

    if (colId === 'DUR') {
      const d = parseInt(e.key)
      if (!isNaN(d)) {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (!trig?.active) return
        setTrigDuration(trackId, cursorRow, d === 0 ? 16 : d)
        return
      }
    }

    if (colId === 'SLD') {
      if (e.key === ' ') {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (trig) setTrigSlide(trackId, cursorRow, !trig.slide)
        return
      }
    }

    if (colId === 'CHN') {
      const d = parseInt(e.key)
      if (!isNaN(d)) {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (!trig?.active) return
        const chance = d === 0 ? 1.0 : d / 10
        setTrigChance(trackId, cursorRow, chance)
        return
      }
    }

    // Mix / FX columns — digit entry for paramLock values
    const plockKey = PLOCK_KEYS[colId]
    if (plockKey) {
      const d = parseInt(e.key)
      if (!isNaN(d)) {
        e.preventDefault()
        const trig = ph.trigs[cursorRow]
        if (!trig?.active) return
        if (colId === 'PAN') {
          // 0=center, 1-4=L10-L40, 5=center, 6-9=R10-R40
          const pan = d === 0 || d === 5 ? 0 : d < 5 ? -d / 5 : (d - 5) / 5
          setParamLock(trackId, cursorRow, plockKey, pan)
        } else {
          // 0=1.0, 1-9=0.1-0.9
          const val = d === 0 ? 1.0 : d / 10
          setParamLock(trackId, cursorRow, plockKey, val)
        }
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


<div class="tracker-view">
  <!-- Left: Track list -->
  <div class="track-sidebar">
    {#each song.patterns[ui.currentPattern].cells as c}
      {@const t = song.tracks[c.trackId]}
      {#if t}
      <div
        class="track-btn"
        class:selected={c.trackId === trackId}
        class:muted={t.muted}
        class:soloed={ui.soloTracks.has(c.trackId)}
      >
        <button class="track-label" onpointerdown={() => { ui.selectedTrack = c.trackId; cursorRow = Math.min(cursorRow, c.steps - 1) }}>{trackDisplayName(c, ui.currentPattern)}</button>
        <button class="track-act" onpointerdown={() => toggleMute(c.trackId)}
          data-tip="Mute" data-tip-ja="ミュート"
        >{t.muted ? 'M' : 'm'}</button>
        <button class="track-act" class:active={ui.soloTracks.has(c.trackId)} onpointerdown={() => toggleSolo(c.trackId)}
          data-tip="Solo" data-tip-ja="ソロ"
        >S</button>
      </div>
      {/if}
    {/each}
  </div>

  <!-- Right: Data grid -->
  <div class="tracker-main">
    <!-- Column headers -->
    <div class="col-headers">
      <span class="col-h col-num">#</span>
      {#each COLUMNS as col, ci}
        <span
          class="col-h col-{col.toLowerCase()}"
          class:col-active={cursorCol === ci}
          class:col-sep={col === 'VOL' || col === 'VERB'}
        >{col}</span>
      {/each}
    </div>

    <!-- Step rows -->
    <div class="tracker-grid" bind:this={gridEl}>
    {#each ph.trigs as trig, si}
      {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === si}
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

        <!-- VOL -->
        <button
          class="cell cell-plock cell-vol"
          class:cursor={isCursor && cursorCol === 5}
          onpointerdown={() => clickCell(si, 5)}
          style:color={trig.active && trig.paramLocks?.vol != null ? COL_COLORS.VOL : undefined}
        >
          {#if trig.active}
            {plockLabel(trig, 'vol', 'VOL')}
          {:else}
            ··
          {/if}
        </button>

        <!-- PAN -->
        <button
          class="cell cell-plock cell-pan"
          class:cursor={isCursor && cursorCol === 6}
          onpointerdown={() => clickCell(si, 6)}
          style:color={trig.active && trig.paramLocks?.pan != null ? COL_COLORS.PAN : undefined}
        >
          {#if trig.active}
            {plockLabel(trig, 'pan', 'PAN')}
          {:else}
            ···
          {/if}
        </button>

        <!-- VERB -->
        <button
          class="cell cell-plock cell-verb"
          class:cursor={isCursor && cursorCol === 7}
          onpointerdown={() => clickCell(si, 7)}
          style:color={trig.active && trig.paramLocks?.reverbSend != null ? COL_COLORS.VERB : undefined}
        >
          {#if trig.active}
            {plockLabel(trig, 'reverbSend', 'VERB')}
          {:else}
            ··
          {/if}
        </button>

        <!-- DLY -->
        <button
          class="cell cell-plock cell-dly"
          class:cursor={isCursor && cursorCol === 8}
          onpointerdown={() => clickCell(si, 8)}
          style:color={trig.active && trig.paramLocks?.delaySend != null ? COL_COLORS.DLY : undefined}
        >
          {#if trig.active}
            {plockLabel(trig, 'delaySend', 'DLY')}
          {:else}
            ··
          {/if}
        </button>

        <!-- GLT -->
        <button
          class="cell cell-plock cell-glt"
          class:cursor={isCursor && cursorCol === 9}
          onpointerdown={() => clickCell(si, 9)}
          style:color={trig.active && trig.paramLocks?.glitchSend != null ? COL_COLORS.GLT : undefined}
        >
          {#if trig.active}
            {plockLabel(trig, 'glitchSend', 'GLT')}
          {:else}
            ··
          {/if}
        </button>

        <!-- GRN -->
        <button
          class="cell cell-plock cell-grn"
          class:cursor={isCursor && cursorCol === 10}
          onpointerdown={() => clickCell(si, 10)}
          style:color={trig.active && trig.paramLocks?.granularSend != null ? COL_COLORS.GRN : undefined}
        >
          {#if trig.active}
            {plockLabel(trig, 'granularSend', 'GRN')}
          {:else}
            ··
          {/if}
        </button>
      </div>
    {/each}
    </div>
  </div>
</div>

<style>
  .tracker-view {
    display: flex;
    flex-direction: row;
    flex: 1;
    overflow: hidden;
    background: var(--color-fg);
    color: rgba(237,232,220,0.55);
  }

  /* ── Track sidebar (left) ── */
  .track-sidebar {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 148px;
    border-right: 1px solid rgba(237,232,220,0.08);
    overflow-y: auto;
    padding: 4px 0;
  }

  .track-btn {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 6px;
    border: 1px solid transparent;
    border-bottom: 1px solid rgba(237,232,220,0.05);
    transition: background 40ms;
  }
  .track-btn.selected {
    border-color: var(--color-olive);
    background: rgba(120,120,69,0.12);
  }
  .track-btn:last-child { border-bottom-color: transparent; }
  .track-btn.muted { opacity: 0.4; }
  .track-btn.soloed .track-label { color: var(--color-olive); }

  .track-label {
    border: none;
    background: transparent;
    color: rgba(237,232,220,0.40);
    font-family: var(--font-data);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    padding: 2px 4px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .track-btn.selected .track-label { color: rgba(237,232,220,0.90); }

  .track-act {
    border: 1px solid rgba(237,232,220,0.15);
    background: transparent;
    color: rgba(237,232,220,0.30);
    width: 18px;
    height: 18px;
    font-size: 8px;
    font-weight: 700;
    font-family: var(--font-data);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .track-act:active { background: rgba(237,232,220,0.10); }
  .track-act.active { color: var(--color-olive); border-color: var(--color-olive); }

  /* ── Data area (right) ── */
  .tracker-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

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
  .col-h.col-sep { margin-left: 6px; }

  .col-num  { width: 28px; flex-shrink: 0; }
  .col-note { width: 48px; flex-shrink: 0; }
  .col-vel  { width: 36px; flex-shrink: 0; }
  .col-dur  { width: 36px; flex-shrink: 0; }
  .col-sld  { width: 36px; flex-shrink: 0; }
  .col-chn  { width: 40px; flex-shrink: 0; }
  .col-vol  { width: 32px; flex-shrink: 0; }
  .col-pan  { width: 32px; flex-shrink: 0; }
  .col-verb { width: 36px; flex-shrink: 0; }
  .col-dly  { width: 32px; flex-shrink: 0; }
  .col-glt  { width: 32px; flex-shrink: 0; }
  .col-grn  { width: 32px; flex-shrink: 0; }

  /* ── Grid ── */
  .tracker-grid {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding-top: 1px;
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
  .cell-chn,
  .cell-plock {
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
  .cell-vol  { width: 32px; flex-shrink: 0; margin-left: 6px; }
  .cell-pan  { width: 32px; flex-shrink: 0; }
  .cell-verb { width: 36px; flex-shrink: 0; margin-left: 6px; }
  .cell-dly  { width: 32px; flex-shrink: 0; }
  .cell-glt  { width: 32px; flex-shrink: 0; }
  .cell-grn  { width: 32px; flex-shrink: 0; }

  /* Active step styling */
  .tracker-row.active .cell-note { color: var(--color-olive); }
  .tracker-row.active .cell-vel  { color: rgba(237,232,220,0.70); }
  .tracker-row.active .cell-dur  { color: rgba(237,232,220,0.55); }
  .tracker-row.active .cell-sld  { color: var(--color-blue); }
  .tracker-row.active .cell-chn  { color: rgba(237,232,220,0.50); }
  .tracker-row.active .cell-plock { color: rgba(237,232,220,0.35); }

  /* Cursor cell */
  .cell.cursor {
    border-color: var(--color-olive);
    background: rgba(120,120,69,0.12);
  }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .tracker-view { flex-direction: column; }
    .track-sidebar {
      flex-direction: row;
      width: auto;
      border-right: none;
      border-bottom: 1px solid rgba(237,232,220,0.08);
      overflow-x: auto;
      overflow-y: hidden;
      padding: 2px 4px;
    }
    .track-btn { border-bottom: none; border-right: 1px solid rgba(237,232,220,0.05); padding: 2px 4px; }
    .track-btn:last-child { border-right-color: transparent; }
    .track-label { font-size: 9px; max-width: 64px; }

    .col-h { font-size: 7px; }
    .cell { font-size: 10px; }
    .cell-num { font-size: 8px; }

    .col-num, .cell-num   { width: 24px; }
    .col-note, .cell-note { width: 42px; }
    .col-vel, .cell-vel   { width: 32px; }
    .col-dur, .cell-dur   { width: 32px; }
    .col-sld, .cell-sld   { width: 32px; }
    .col-chn, .cell-chn   { width: 36px; }
    .col-vol, .cell-vol   { width: 28px; }
    .col-pan, .cell-pan   { width: 28px; }
    .col-verb, .cell-verb { width: 28px; }
    .col-dly, .cell-dly   { width: 28px; }
    .col-glt, .cell-glt   { width: 28px; }
    .col-grn, .cell-grn   { width: 28px; }
  }
</style>
