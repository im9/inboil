<script lang="ts">
  import { activeCell, playback, perf, prefs, vkbd, ui, pushUndo, isViewingPlayingPattern } from '../state.svelte.ts'
  import type { BrushMode, ChordShape } from '../state.svelte.ts'
  import { setTrigDuration, placeNoteBar, findNoteHead, addNoteToStep, removeNoteFromStep, trigHasNote } from '../stepActions.ts'
  import { NOTE_NAMES, SCALE_DEGREES, SCALE_DEGREES_SET, PIANO_ROLL_MIN, PIANO_ROLL_MAX } from '../constants.ts'
  import { ICON } from '../icons.ts'

  interface Props {
    trackId: number
  }
  let { trackId }: Props = $props()

  const ph = $derived(activeCell(trackId))
  const isPoly = $derived((ph.voiceId === 'WT' || ph.voiceId === 'FM') && (ph.voiceParams?.polyMode ?? 0) >= 0.5)
  const playheadCol = $derived(isViewingPlayingPattern() ? playback.playheads[trackId] : -1)

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

  let wheelAccum = 0
  function onOctWheel(e: WheelEvent) {
    e.preventDefault()
    wheelAccum += e.deltaY
    const threshold = 60
    if (wheelAccum >= threshold) {
      shiftOctave(-1)    // scroll down → lower octave
      wheelAccum = 0
    } else if (wheelAccum <= -threshold) {
      shiftOctave(1)     // scroll up → higher octave
      wheelAccum = 0
    }
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

  // ── Chord generation (ADR 067 Phase 2) ──
  const CHORD_DEGS: Record<ChordShape, number[]> = {
    triad: [0, 2, 4],
    '7th': [0, 2, 4, 6],
    sus2:  [0, 1, 4],
    sus4:  [0, 3, 4],
  }

  function chordNotesFromRoot(rootNote: number): number[] {
    const root = perf.rootNote
    const scale = SCALE_TEMPLATES[root] ?? SCALE_TEMPLATES[0]
    const pc = ((rootNote % 12) - root + 12) % 12
    let baseDeg = 0
    for (let d = 0; d < 7; d++) {
      if (scale[d] <= pc) baseDeg = d
    }
    const baseOctave = Math.floor(rootNote / 12)
    const degOffsets = CHORD_DEGS[ui.chordShape]
    const notes: number[] = []
    for (const dOff of degOffsets) {
      const deg = baseDeg + dOff
      const octShift = Math.floor(deg / 7)
      const scaleDeg = ((deg % 7) + 7) % 7
      notes.push(root + scale[scaleDeg] + (baseOctave + octShift) * 12)
    }
    return notes
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
    // Brush mode intercepts before default behavior
    if (activeBrush !== 'default' && brushStart(e, stepIdx, note)) return
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
    if (brushDragging) { brushMove(e); return }
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
    if (brushDragging) { brushEnd(); noteGridEl = null; return }
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

  // ── Brush mode (ADR 067 Phase 1) ──
  let heldBrush = $state<BrushMode | null>(null)
  const activeBrush = $derived(heldBrush ?? ui.brushMode)

  let brushDragging = $state(false)
  let brushVisited = new Set<string>()
  let brushConstrainNote = -1
  let brushHeadStep = -1       // start step of current legato note
  let brushLastNote = -1       // last drawn pitch (for legato detection)
  let brushStrumStart = -1     // first step of strum placement
  let brushStrumLen = 0        // number of strum notes placed

  function toggleBrush(mode: BrushMode) {
    ui.brushMode = ui.brushMode === mode ? 'default' : mode
  }

  function brushPlaceNote(stepIdx: number, note: number) {
    // Truncate any prior note whose duration overlaps this step
    for (let d = 1; d <= 16; d++) {
      const prev = stepIdx - d
      if (prev < 0) break
      const pt = ph.trigs[prev]
      if (pt.active) {
        if ((pt.duration ?? 1) > d) pt.duration = d
        break
      }
    }
    const trig = ph.trigs[stepIdx]
    // Draw brush always places single notes (mono behavior)
    trig.active = true
    trig.note = note
    trig.duration = 1
    delete trig.notes
  }

  function brushEraseNote(stepIdx: number, note: number) {
    const trig = ph.trigs[stepIdx]
    if (!trig.active) {
      // Continuation cell — erase the parent head
      const headStep = findNoteHead(trackId, stepIdx, note)
      if (headStep >= 0) {
        if (isPoly) removeNoteFromStep(trackId, headStep, note)
        else ph.trigs[headStep].active = false
      }
      return
    }
    if (isPoly && trig.notes) {
      const idx = trig.notes.indexOf(note)
      if (idx < 0) return
      trig.notes.splice(idx, 1)
      if (trig.notes.length === 0) { trig.active = false; delete trig.notes }
      else if (trig.notes.length === 1) { trig.note = trig.notes[0]; delete trig.notes }
      else trig.note = trig.notes[0]
    } else {
      if (trigHasNote(trig, note)) trig.active = false
    }
  }

  /** Place a full chord at a single step (chord brush mode) */
  function brushChordPlace(stepIdx: number, note: number) {
    const chordNotes = chordNotesFromRoot(note)
    const trig = ph.trigs[stepIdx]
    trig.active = true
    if (isPoly) {
      const existing = trig.notes ?? (trig.active ? [trig.note] : [])
      for (const cn of chordNotes) {
        if (!existing.includes(cn)) existing.push(cn)
      }
      existing.sort((a, b) => a - b)
      trig.notes = existing
      trig.note = existing[0]
    } else {
      trig.note = chordNotes[0]
      trig.duration = 1
      delete trig.notes
    }
  }

  /** Place chord notes with strum offset across consecutive steps */
  function brushStrumPlace(stepIdx: number, note: number) {
    const chordNotes = chordNotesFromRoot(note)
    for (let i = 0; i < chordNotes.length && stepIdx + i < ph.steps; i++) {
      const t = ph.trigs[stepIdx + i]
      t.active = true
      if (isPoly) {
        const existing = t.notes ?? (t.active ? [t.note] : [])
        if (!existing.includes(chordNotes[i])) existing.push(chordNotes[i])
        existing.sort((a, b) => a - b)
        t.notes = existing
        t.note = existing[0]
      } else {
        t.note = chordNotes[i]
        t.duration = 1
        delete t.notes
      }
    }
  }

  function brushStart(e: PointerEvent, stepIdx: number, note: number) {
    const mode = activeBrush
    if (mode === 'default') return false
    e.preventDefault()
    noteGridEl = (e.currentTarget as HTMLElement).closest('.grid') as HTMLElement
    const labels: Record<string, string> = {
      draw: 'Draw notes', eraser: 'Erase notes',
      chord: 'Chord brush', strum: 'Strum brush',
    }
    pushUndo(labels[mode] ?? 'Brush')
    brushDragging = true
    brushVisited.clear()
    brushConstrainNote = note
    brushHeadStep = stepIdx
    brushLastNote = note
    noteGridEl?.setPointerCapture(e.pointerId)
    const key = `${stepIdx}:${note}`
    brushVisited.add(key)
    if (mode === 'draw') brushPlaceNote(stepIdx, note)
    else if (mode === 'eraser') brushEraseNote(stepIdx, note)
    else if (mode === 'chord') brushChordPlace(stepIdx, note)
    else if (mode === 'strum') {
      brushStrumPlace(stepIdx, note)
      const chordLen = Math.min(CHORD_DEGS[ui.chordShape].length, ph.steps - stepIdx)
      brushStrumStart = stepIdx
      brushStrumLen = chordLen
      brushHeadStep = stepIdx + chordLen - 1
    }
    return true
  }

  function brushMove(e: PointerEvent) {
    if (!brushDragging || !noteGridEl) return
    const rect = noteGridEl.getBoundingClientRect()
    const relX = e.clientX - rect.left + noteGridEl.scrollLeft
    const relY = e.clientY - rect.top
    const stepIdx = Math.max(0, Math.min(ph.steps - 1, Math.floor(relX / 26)))
    let note = getNoteFromY(relY)
    if (note < 0) return
    note = snapToScale(note)
    // Draw brush: lock Y to initial pitch so horizontal drag = legato
    // (9px rows make Y-drift inevitable; without this, legato never fires)
    if (activeBrush === 'draw') note = brushConstrainNote
    const key = `${stepIdx}:${note}`
    if (brushVisited.has(key)) return
    brushVisited.add(key)
    if (activeBrush === 'eraser') {
      brushEraseNote(stepIdx, note)
    } else if (activeBrush === 'strum' && brushStrumLen > 0) {
      // Strum: extend all strum notes' duration equally
      if (stepIdx <= brushHeadStep) return
      const extra = stepIdx - brushHeadStep
      for (let i = 0; i < brushStrumLen; i++) {
        const s = brushStrumStart + i
        ph.trigs[s].duration = Math.min(16, 1 + extra)
      }
      // Clear steps between strum end and drag position
      for (let s = brushHeadStep + 1; s <= stepIdx; s++) {
        ph.trigs[s].active = false
      }
    } else {
      // draw / chord: forward drag extends duration (legato)
      if (stepIdx <= brushHeadStep) return
      const dur = stepIdx - brushHeadStep + 1
      ph.trigs[brushHeadStep].duration = Math.min(16, dur)
      for (let s = brushHeadStep + 1; s <= stepIdx; s++) {
        ph.trigs[s].active = false
      }
    }
  }

  function brushEnd() {
    brushDragging = false
    brushVisited.clear()
    brushConstrainNote = -1
    brushHeadStep = -1
    brushLastNote = -1
    brushStrumStart = -1
    brushStrumLen = 0
  }

  // D/E modifier key shortcuts (disabled when vkbd is active)
  $effect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (vkbd.enabled || e.repeat) return
      if (e.key === 'd' || e.key === 'D') heldBrush = 'draw'
      else if (e.key === 'e' || e.key === 'E') heldBrush = 'eraser'
      else if (e.key === 'c' || e.key === 'C') heldBrush = 'chord'
    }
    function onKeyUp(e: KeyboardEvent) {
      if ((e.key === 'd' || e.key === 'D') && heldBrush === 'draw') heldBrush = null
      else if ((e.key === 'e' || e.key === 'E') && heldBrush === 'eraser') heldBrush = null
      else if ((e.key === 'c' || e.key === 'C') && heldBrush === 'chord') heldBrush = null
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="piano-roll" data-scroll={scrollDir} onanimationend={() => scrollDir = null} onwheel={onOctWheel}>
  <!-- Left spacer to align grid with step columns -->
  <div class="piano-spacer">
    <div class="brush-bar">
      <button
        class="brush-btn flip-host"
        data-tip="Draw mode (hold D)" data-tip-ja="描画モード (D長押し)"
        onclick={() => toggleBrush('draw')}
      ><span class="flip-card" class:flipped={activeBrush === 'draw'}>
          <span class="flip-face brush-off"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.pen}</svg></span>
          <span class="flip-face back brush-on"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.pen}</svg></span>
        </span></button>
      <button
        class="brush-btn flip-host"
        data-tip="Eraser mode (hold E)" data-tip-ja="消しゴムモード (E長押し)"
        onclick={() => toggleBrush('eraser')}
      ><span class="flip-card" class:flipped={activeBrush === 'eraser'}>
          <span class="flip-face brush-off"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.eraser}</svg></span>
          <span class="flip-face back brush-on"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.eraser}</svg></span>
        </span></button>
      <button
        class="brush-btn flip-host"
        data-tip="Chord brush (hold C)" data-tip-ja="コードブラシ (C長押し)"
        onclick={() => toggleBrush('chord')}
      ><span class="flip-card" class:flipped={activeBrush === 'chord'}>
          <span class="flip-face brush-off"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.chord}</svg></span>
          <span class="flip-face back brush-on"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.chord}</svg></span>
        </span></button>
      <button
        class="brush-btn flip-host"
        data-tip="Strum brush" data-tip-ja="ストラムブラシ"
        onclick={() => toggleBrush('strum')}
      ><span class="flip-card" class:flipped={activeBrush === 'strum'}>
          <span class="flip-face brush-off"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.strum}</svg></span>
          <span class="flip-face back brush-on"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.strum}</svg></span>
        </span></button>
      {#if activeBrush === 'chord' || activeBrush === 'strum'}
        <select class="chord-select" name="chord-shape"
          value={ui.chordShape}
          onchange={(e) => { ui.chordShape = (e.currentTarget as HTMLSelectElement).value as ChordShape }}
          data-tip="Chord type" data-tip-ja="コードタイプ">
          <option value="triad">Triad</option>
          <option value="7th">7th</option>
          <option value="sus2">Sus2</option>
          <option value="sus4">Sus4</option>
        </select>
      {/if}
    </div>
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
      data-brush={activeBrush}
      role="application"
      class:has-playhead={playheadCol >= 0}
      style="--steps: {ph.steps}; --ph-col: {playheadCol}"
      data-tip="Tap or drag to place/erase notes" data-tip-ja="タップ/ドラッグでノートを配置/消去"
      onpointermove={noteOnMove}
      onpointerup={noteEndDrag}
      onpointercancel={noteEndDrag}
    >
      {#each NOTES as note}
        <div class="row" class:black={isBlack(note)} class:disabled={isOutOfScale(note)}>
          {#each ph.trigs as _trig, stepIdx}
            {@const state = getCellState(stepIdx, note)}
            <button
              class="cell"
              class:active={state === 'head'}
              class:continuation={state === 'continuation'}
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
  .brush-bar {
    display: grid;
    grid-template-columns: 20px 20px;
    gap: 2px;
    flex: 1;
    min-width: 0;
    padding-top: 8px;
    align-content: start;
  }
  .chord-select {
    grid-column: 1 / -1;
    width: 100%;
    font-size: 9px;
    border: 1px solid var(--color-olive);
    background: var(--color-surface);
    color: var(--color-text);
    border-radius: 3px;
    padding: 1px 0;
    text-align: center;
    cursor: pointer;
  }
  .brush-btn {
    border: none;
    background: transparent;
    cursor: pointer;
    width: 20px;
    height: 20px;
    line-height: 0;
    position: relative;
    padding: 0;
    perspective: 60px;
  }
  .brush-btn :global(.flip-card) {
    position: absolute;
    inset: 0;
  }
  .brush-off {
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
  }
  .brush-on {
    border: 1.5px solid var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .grid { cursor: pointer; }
  .grid[data-brush="draw"] { cursor: crosshair; }
  .grid[data-brush="draw"] .cell { cursor: crosshair; }
  .grid[data-brush="eraser"] { cursor: pointer; }
  .grid[data-brush="eraser"] .cell { cursor: pointer; }
  .grid[data-brush="chord"] { cursor: cell; }
  .grid[data-brush="chord"] .cell { cursor: cell; }
  .grid[data-brush="strum"] { cursor: cell; }
  .grid[data-brush="strum"] .cell { cursor: cell; }
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
  /* ── Playhead column overlay ── */
  .grid {
    position: relative;
  }
  .grid.has-playhead::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    /* 24px cell + 2px gap = 26px per step */
    left: calc(var(--ph-col) * 26px);
    width: 24px;
    background: rgba(68,114,180,0.13);
    pointer-events: none;
    z-index: 1;
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
