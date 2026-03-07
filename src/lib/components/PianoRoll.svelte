<script lang="ts">
  import { activeCell, playback, perf, prefs, vkbd, setTrigDuration, placeNoteBar, findNoteHead, addNoteToStep, removeNoteFromStep, trigHasNote, isViewingPlayingPattern } from '../state.svelte.ts'
  import { NOTE_NAMES, SCALE_DEGREES, SCALE_DEGREES_SET, PIANO_ROLL_MIN, PIANO_ROLL_MAX } from '../constants.ts'

  interface Props {
    trackId: number
  }
  let { trackId }: Props = $props()

  const ph = $derived(activeCell(trackId))
  const isPoly = $derived(ph.voiceId === 'Poly')

  // ── Octave shift: ▲▼ buttons shift the 2-octave window ──
  // Linked to vkbd.octave (single source of truth for both piano roll and virtual keyboard)
  const RANGE = PIANO_ROLL_MAX - PIANO_ROLL_MIN + 1  // 24 notes
  const octaveOffset = $derived(vkbd.octave - 4)
  let scrollDir = $state<'up' | 'down' | null>(null)

  function shiftOctave(dir: 1 | -1) {
    const next = vkbd.octave + dir
    if (next < 2 || next > 7) return
    scrollDir = dir === 1 ? 'up' : 'down'
    vkbd.octave = next
  }

  const rollMax = $derived(PIANO_ROLL_MAX + octaveOffset * 12)
  const NOTES = $derived(Array.from({ length: RANGE }, (_, i) => rollMax - i))
  const SCALE_TEMPLATES: number[][] = [
    [0, 2, 4, 5, 7, 9, 11],  //  0 C  Ionian
    [0, 2, 4, 5, 7, 9, 11],  //  1 C# major
    [0, 2, 3, 5, 7, 9, 10],  //  2 D  Dorian
    [0, 2, 4, 5, 7, 9, 11],  //  3 Eb major
    [0, 1, 3, 5, 7, 8, 10],  //  4 E  Phrygian
    [0, 2, 4, 6, 7, 9, 11],  //  5 F  Lydian
    [0, 2, 4, 5, 7, 9, 11],  //  6 F# major
    [0, 2, 4, 5, 7, 9, 10],  //  7 G  Mixolydian
    [0, 2, 4, 5, 7, 9, 11],  //  8 Ab major
    [0, 2, 3, 5, 7, 8, 10],  //  9 A  Aeolian
    [0, 2, 4, 5, 7, 9, 11],  // 10 Bb major
    [0, 1, 3, 5, 6, 8, 10],  // 11 B  Locrian
  ]
  const PC_TO_DEG = (() => {
    const m = new Int8Array(12)
    for (let p = 0; p < 12; p++) {
      let b = 0, bd = 12
      for (let d = 0; d < 7; d++) {
        const dist = Math.min(Math.abs(p - SCALE_DEGREES[d]), 12 - Math.abs(p - SCALE_DEGREES[d]))
        if (dist < bd) { bd = dist; b = d }
      }
      m[p] = b
    }
    return m
  })()

  /** Mirror worklet's transposeNote — Brain formula */
  function transposedMidi(pos: number): number {
    const root = perf.rootNote
    if (root === 0) return pos
    const pc = pos % 12
    const octave = Math.floor(pos / 12)
    const degree = PC_TO_DEG[pc]
    const chromaOffset = pc - SCALE_DEGREES[degree]
    const scale = SCALE_TEMPLATES[root]
    return root + scale[degree] + chromaOffset + octave * 12
  }

  function noteLabel(pos: number): string {
    if (pos % 12 === 0) {
      const midi = transposedMidi(pos)
      return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1)
    }
    return ''
  }
  function isBlack(pos: number): boolean {
    const midi = transposedMidi(pos)
    return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
  }
  function isOutOfScale(note: number): boolean {
    return prefs.scaleMode && !SCALE_DEGREES_SET.has(note % 12)
  }
  /** Snap an out-of-scale note to the nearest in-scale degree */
  function snapToScale(note: number): number {
    if (!isOutOfScale(note)) return note
    for (let d = 1; d <= 6; d++) {
      if (!isOutOfScale(note - d)) return note - d
      if (!isOutOfScale(note + d)) return note + d
    }
    return note
  }

  /** Returns cell visual state for duration rendering */
  function getCellState(stepIdx: number, note: number): 'empty' | 'head' | 'continuation' {
    const trig = ph.trigs[stepIdx]
    if (trig?.active && trigHasNote(trig, note)) return 'head'
    // Look backwards for a head whose duration covers this step
    const maxLook = Math.min(16, ph.steps)
    for (let d = 1; d < maxLook; d++) {
      const prevStep = ((stepIdx - d) % ph.steps + ph.steps) % ph.steps
      const prevTrig = ph.trigs[prevStep]
      if (prevTrig?.active && trigHasNote(prevTrig, note)) {
        return (prevTrig.duration ?? 1) > d ? 'continuation' : 'empty'
      }
    }
    return 'empty'
  }

  // ── DAW-style note bar drag state ──
  let barDragging = $state(false)
  let barStartStep = -1
  let barNote = -1
  let noteGridEl: HTMLElement | null = null

  // ── Note move drag state (long-press on existing note) ──
  let moveDragging = $state(false)
  let moveStep = -1
  let movePointerId = -1
  let moveTimer: number | null = null
  let moveFromHead = false       // true if long-press started on head cell
  let moveTapNote = -1           // note of the tapped cell (for empty-cell short-tap)
  let moveStartX = 0             // pointer start position for jitter tolerance
  let moveStartY = 0

  /** Calculate which note row the pointer Y falls on */
  function getNoteFromY(relY: number): number {
    if (!noteGridEl) return -1
    const rowH = noteGridEl.scrollHeight / RANGE
    const idx = Math.max(0, Math.min(RANGE - 1, Math.floor(relY / rowH)))
    return NOTES[idx]
  }

  function noteStartDrag(e: PointerEvent, stepIdx: number, note: number) {
    e.preventDefault()
    const state = getCellState(stepIdx, note)
    noteGridEl = (e.currentTarget as HTMLElement).closest('.grid') as HTMLElement

    if (state === 'head') {
      if (isPoly) {
        // Poly mode: tap on head → remove this note from chord
        removeNoteFromStep(trackId, stepIdx, note)
        barDragging = false
        return
      }
      // Long-press → move mode; short tap → delete
      moveStep = stepIdx
      movePointerId = e.pointerId
      moveFromHead = true
      moveTapNote = note
      moveStartX = e.clientX
      moveStartY = e.clientY
      moveTimer = window.setTimeout(() => {
        moveTimer = null
        moveDragging = true
        noteGridEl?.setPointerCapture(movePointerId)
      }, 180)
    } else if (state === 'continuation') {
      // Click on continuation → delete the parent note
      const headStep = findNoteHead(trackId, stepIdx, note)
      if (headStep >= 0) {
        if (isPoly) {
          removeNoteFromStep(trackId, headStep, note)
        } else {
          ph.trigs[headStep].active = false
        }
      }
      barDragging = false
    } else {
      // Empty cell — check if this step already has an active note
      const trig = ph.trigs[stepIdx]
      if (trig?.active) {
        if (isPoly) {
          // Poly mode: add this note to the chord
          addNoteToStep(trackId, stepIdx, note)
          barDragging = false
          return
        }
        // Step has a note: long-press → move mode, short tap → move note to tapped pitch
        moveStep = stepIdx
        movePointerId = e.pointerId
        moveFromHead = false
        moveTapNote = note
        moveStartX = e.clientX
        moveStartY = e.clientY
        moveTimer = window.setTimeout(() => {
          moveTimer = null
          moveDragging = true
          noteGridEl?.setPointerCapture(movePointerId)
        }, 180)
      } else {
        // Truly empty step → place a new note and start bar drag
        if (isPoly) {
          addNoteToStep(trackId, stepIdx, note)
          barDragging = false
        } else {
          placeNoteBar(trackId, stepIdx, note, 1)
          barDragging = true
          barStartStep = stepIdx
          barNote = note
          noteGridEl?.setPointerCapture(e.pointerId)
        }
      }
    }
  }

  function noteOnMove(e: PointerEvent) {
    if (!noteGridEl) return

    // Cancel long-press timer only if pointer moves beyond tolerance
    if (moveTimer !== null) {
      const dx = e.clientX - moveStartX
      const dy = e.clientY - moveStartY
      if (dx * dx + dy * dy > 64) {  // ~8px threshold
        clearTimeout(moveTimer)
        moveTimer = null
      }
      return
    }

    // Move mode: drag existing note vertically
    if (moveDragging) {
      const relY = e.clientY - noteGridEl.getBoundingClientRect().top
      const newNote = getNoteFromY(relY)
      const snapped = newNote >= 0 ? snapToScale(newNote) : -1
      if (snapped >= 0 && snapped !== ph.trigs[moveStep].note) {
        ph.trigs[moveStep].note = snapped
      }
      return
    }

    if (durationDragging) {
      const rect = noteGridEl.getBoundingClientRect()
      const relX = e.clientX - rect.left + noteGridEl.scrollLeft
      const dur = Math.max(1, Math.min(ph.steps, Math.floor((relX - durationDragStep * 26) / 26) + 1))
      setTrigDuration(trackId, durationDragStep, dur)
      return
    }
    if (!barDragging) return
    const rect = noteGridEl.getBoundingClientRect()
    const relX = e.clientX - rect.left + noteGridEl.scrollLeft
    const relY = e.clientY - rect.top
    const endStep = Math.max(barStartStep, Math.min(ph.steps - 1, Math.floor(relX / 26)))
    const duration = endStep - barStartStep + 1

    // Vertical: change note pitch during drag (snap to scale)
    const newNote = getNoteFromY(relY)
    if (newNote >= 0) {
      barNote = snapToScale(newNote)
    }

    placeNoteBar(trackId, barStartStep, barNote, duration)
  }

  function noteEndDrag() {
    if (moveTimer !== null) {
      clearTimeout(moveTimer)
      moveTimer = null
      if (moveStep >= 0) {
        if (moveFromHead) {
          // Short tap on head → delete
          ph.trigs[moveStep].active = false
        } else {
          // Short tap on empty cell in active step → move note to tapped pitch
          ph.trigs[moveStep].note = moveTapNote
        }
      }
    }
    barDragging = false
    durationDragging = false
    moveDragging = false
    moveStep = -1
    moveFromHead = false
    moveTapNote = -1
    noteGridEl = null
  }

  // ── Duration-resize drag state ──
  let durationDragging = $state(false)
  let durationDragStep = -1

  function startDurationDrag(e: PointerEvent, stepIdx: number) {
    e.preventDefault()
    e.stopPropagation()
    durationDragging = true
    durationDragStep = stepIdx
    noteGridEl = (e.currentTarget as HTMLElement).closest('.grid') as HTMLElement
    noteGridEl?.setPointerCapture(e.pointerId)
  }
</script>

<div class="piano-roll" data-scroll={scrollDir} onanimationend={() => scrollDir = null}>
  <!-- Left spacer to align grid with step columns -->
  <div class="piano-spacer">
    <!-- Octave shift buttons + Piano keys -->
    <div class="oct-keys">
      <button class="oct-btn" disabled={vkbd.octave >= 7} onclick={() => shiftOctave(1)}>▲</button>
      <div class="keys" data-tip="Note reference — shows transposed pitch" data-tip-ja="音程リファレンス (移調後のピッチ)">
        {#each NOTES as note}
          <div class="key" class:black={isBlack(note)} class:disabled={isOutOfScale(note)}>
            <span class="key-label">{noteLabel(note)}</span>
          </div>
        {/each}
      </div>
      <button class="oct-btn" disabled={vkbd.octave <= 2} onclick={() => shiftOctave(-1)}>▼</button>
    </div>
  </div>

  <!-- Note grid (wrapped to mirror oct-keys structure) -->
  <div class="grid-outer">
    <div class="grid-cap"></div>
    <div
      class="grid"
      role="application"
      style="--steps: {ph.steps}"
      data-tip="Tap or drag to place/erase notes" data-tip-ja="タップ/ドラッグでノートを配置/消去"
      onpointermove={noteOnMove}
      onpointerup={noteEndDrag}
      onpointercancel={noteEndDrag}
    >
      {#each NOTES as note}
        <div class="row" class:black={isBlack(note)} class:disabled={isOutOfScale(note)}>
          {#each ph.trigs as _trig, stepIdx}
            {@const isPlayhead = isViewingPlayingPattern() && playback.playheads[trackId] === stepIdx}
            {@const state = getCellState(stepIdx, note)}
            <button
              class="cell"
              class:active={state === 'head'}
              class:continuation={state === 'continuation'}
              class:playhead={isPlayhead}
              aria-label="Step {stepIdx + 1} note {note}"
              onpointerdown={(e) => noteStartDrag(e, stepIdx, snapToScale(note))}
            >
              {#if state === 'head'}
                <div class="resize-handle" role="separator" onpointerdown={(e) => startDurationDrag(e, stepIdx)}></div>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>
    <div class="grid-cap"></div>
  </div>
</div>

<style>
  .piano-roll {
    display: flex;
    height: 244px;
    overflow: hidden;
    background: var(--color-surface);
    border-bottom: 1px solid rgba(30,32,40,0.08);
    border-left: 3px solid var(--color-olive);
    padding-left: 5px;
    padding-right: 8px;
  }

  /* ── Left spacer: aligns grid with step columns ── */
  .piano-spacer {
    /* --head-w is defined on .step-grid and inherited via CSS custom property */
    width: calc(var(--head-w) + 4px);
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    justify-content: flex-end;
  }

  /* ── Octave buttons + keys wrapper ── */
  .oct-keys {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 28px;
    flex-shrink: 0;
  }
  .oct-btn {
    height: 14px;
    border: none;
    background: var(--color-surface);
    color: var(--color-muted);
    font-size: 8px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    border-right: 1px solid rgba(30,32,40,0.15);
  }
  .oct-btn:hover:not(:disabled) {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .oct-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }

  /* ── Keys ── */
  .keys {
    flex: 1;
    min-height: 0;
    width: 28px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid rgba(30,32,40,0.15);
  }
  .key {
    height: 9px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 3px;
    background: var(--color-bg);
    border-bottom: 1px solid rgba(30,32,40,0.07);
  }
  .key.black {
    background: var(--color-surface);
  }
  .key.disabled {
    opacity: 0.3;
    background: rgba(232,160,144,0.08);
  }
  .key-label {
    font-size: 7px;
    color: var(--color-muted);
  }

  /* ── Grid (mirrors .oct-keys structure) ── */
  .grid-outer {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .grid-cap {
    height: 14px;
    flex-shrink: 0;
  }
  .grid {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .row {
    height: 9px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(var(--steps), 24px);
    gap: 2px;
    border-bottom: 1px solid rgba(30,32,40,0.06);
  }
  .row.black {
    background: rgba(30,32,40,0.025);
  }
  .row.disabled {
    background: rgba(232,160,144,0.06);
  }
  .row.disabled .cell {
    opacity: 0.2;
    cursor: pointer;
  }
  .row.disabled .cell.playhead {
    opacity: 1;
  }

  .cell {
    position: relative;
    border: none;
    background: transparent;
    width: 24px;
    cursor: pointer;
    transition: opacity 60ms linear;
    padding: 0;
  }
  .cell:active { opacity: 0.6; }

  .cell.active {
    background: var(--color-olive);
    margin: 1px;
    border-radius: 1px;
    border-color: transparent;
  }
  .cell.continuation {
    background: rgba(108,119,68,0.3);
    margin: 1px;
    border-radius: 1px;
  }
  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    cursor: ew-resize;
    background: rgba(0,0,0,0.15);
    border-radius: 0 1px 1px 0;
  }
  .cell.playhead {
    background: rgba(68,114,180,0.15) !important;
  }
  .cell.active.playhead {
    background: var(--color-blue) !important;
  }

  /* ── Octave scroll animation (~100ms, matching SplitFlap tempo) ── */
  .piano-roll[data-scroll="up"] .keys,
  .piano-roll[data-scroll="up"] .grid-outer {
    animation: oct-slide-up 100ms ease-out;
  }
  .piano-roll[data-scroll="down"] .keys,
  .piano-roll[data-scroll="down"] .grid-outer {
    animation: oct-slide-down 100ms ease-out;
  }
  @keyframes oct-slide-up {
    from { transform: translateY(-50%); }
    to   { transform: translateY(0); }
  }
  @keyframes oct-slide-down {
    from { transform: translateY(50%); }
    to   { transform: translateY(0); }
  }

  /* ── Mobile ── */
  @media (max-width: 639px) {
    .piano-roll {
      height: auto;
      padding-left: 2px;
      padding-right: 4px;
    }
    .piano-spacer {
      width: auto;
    }
    .oct-keys { width: 26px; }
    .keys { width: 26px; }
    .key { height: auto; flex: 1; min-height: 12px; }
    .key-label { font-size: 6px; }
    .grid { overflow-x: auto; }
    .row {
      height: auto; flex: 1; min-height: 12px;
      grid-template-columns: repeat(var(--steps), 18px);
      gap: 1px;
    }
    .cell { width: 18px; }
  }
</style>
