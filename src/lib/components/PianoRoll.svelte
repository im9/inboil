<script module lang="ts">
  // Module-level note clipboard — persists across track switches
  interface ClipNote {
    stepOffset: number; note: number  // stepOffset from selection start, note is absolute
    velocity: number; duration: number; slide: boolean
    chance?: number; paramLocks?: Record<string, number>
  }
  let noteClipboard: ClipNote[] | null = null
</script>

<script lang="ts">
  import { activeCell, playback, perf, prefs, vkbd, ui, pushUndo } from '../state.svelte.ts'
  import { isViewingPlayingPattern } from '../scenePlayback.ts'
  import type { BrushMode, ChordShape } from '../state.svelte.ts'
  import { setTrigDuration, placeNoteBar, findNoteHead, removeNoteFromStep, trigHasNote } from '../stepActions.ts'
  import { NOTE_NAMES, SCALE_DEGREES, SCALE_TEMPLATES, PIANO_ROLL_MIN, PIANO_ROLL_MAX } from '../constants.ts'
  import { ICON } from '../icons.ts'

  interface Props {
    trackId: number
  }
  let { trackId }: Props = $props()

  const ph = $derived(activeCell(trackId))
  const isPoly = $derived(ph.voiceId === 'Sampler' || ((ph.voiceId === 'WT' || ph.voiceId === 'FM') && (ph.voiceParams?.polyMode ?? 0) >= 0.5))

  // ── Step paging ──
  const PAGE_SIZE = 16
  const pageStart = $derived(ui.stepPage * PAGE_SIZE)
  const pageEnd = $derived(Math.min(ph.steps, pageStart + PAGE_SIZE))
  const visibleSteps = $derived(pageEnd - pageStart)
  const playheadCol = $derived.by(() => {
    if (!isViewingPlayingPattern()) return -1
    const raw = playback.playheads[trackId]
    if (raw == null || raw < pageStart || raw >= pageEnd) return -1
    return raw - pageStart
  })

  // ── Octave shift: ▲▼ buttons shift the 2-octave window ──
  // Linked to vkbd.octave (single source of truth for both piano roll and virtual keyboard)
  const FULL_RANGE = PIANO_ROLL_MAX - PIANO_ROLL_MIN + 1  // 24 notes
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
  const NOTES = $derived(Array.from({ length: FULL_RANGE }, (_, i) => rollMax - i))
  const RANGE = FULL_RANGE
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
    if (!prefs.scaleMode) return false
    const midi = transposedMidi(note)
    const root = perf.rootNote
    const pc = ((midi % 12) - root + 12) % 12
    return !SCALE_TEMPLATES[root].includes(pc)
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
    // Look backwards for a head whose duration covers this step (no wrap-around)
    const maxLook = Math.min(16, stepIdx)
    for (let d = 1; d <= maxLook; d++) {
      const prevStep = stepIdx - d
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

  function noteStartDrag(e: PointerEvent, stepIdx: number, note: number, noteIdx: number) {
    if (activeBrush === 'select') { selectStart(e, stepIdx, noteIdx); return }
    brushStart(e, stepIdx, note)
  }

  function noteOnMove(e: PointerEvent) {
    if (selectDragging) { selectMove(e); return }
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
      const localStep = durationDragStep - pageStart
      const dur = Math.max(1, Math.min(ph.steps - durationDragStep, Math.floor((relX - localStep * 26) / 26) + 1))
      setTrigDuration(trackId, durationDragStep, dur)
      return
    }
    if (!barDragging) return
    const rect = noteGridEl.getBoundingClientRect()
    const relX = e.clientX - rect.left + noteGridEl.scrollLeft
    const relY = e.clientY - rect.top
    const endStep = Math.max(barStartStep, Math.min(pageEnd - 1, pageStart + Math.floor(relX / 26)))
    const duration = endStep - barStartStep + 1

    // Vertical: change note pitch during drag (snap to scale)
    const newNote = getNoteFromY(relY)
    if (newNote >= 0) {
      barNote = snapToScale(newNote)
    }

    placeNoteBar(trackId, barStartStep, barNote, duration)
  }

  function noteEndDrag() {
    if (selectDragging) { selectEnd(); return }
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
  let brushStrumStart = -1     // first step of strum placement
  let brushStrumLen = 0        // number of strum notes placed
  let brushRightClick = false  // right-click in draw mode → erase
  let brushMoveStep = -1       // draw brush: pitch-move mode (step of note being moved)
  let brushMoved = false       // true if pitch was actually changed during move

  function toggleBrush(mode: BrushMode) {
    ui.brushMode = ui.brushMode === mode ? 'draw' : mode
    if (ui.brushMode !== 'select') {
      selectedNotes = {}
      selMinStep = selMaxStep = selMinNoteIdx = selMaxNoteIdx = -1
    }
  }

  // ── Select mode (rectangle select, copy, delete) ──
  let selectedNotes = $state<Record<string, true>>({})
  const hasSelection = $derived(Object.keys(selectedNotes).length > 0)
  let selectDragging = $state(false)
  let selectStartStep = $state(-1)
  let selectStartNoteIdx = $state(-1)
  let selectEndStep = $state(-1)
  let selectEndNoteIdx = $state(-1)
  let selectShift = false
  // Committed selection bounds (persist after drag ends for visual feedback)
  let selMinStep = $state(-1)
  let selMaxStep = $state(-1)
  let selMinNoteIdx = $state(-1)
  let selMaxNoteIdx = $state(-1)
  // Paste cursor step (set on click in select mode)
  let pasteStep = $state(0)

  function selectStart(e: PointerEvent, stepIdx: number, noteIdx: number) {
    e.preventDefault()
    selectShift = e.shiftKey
    if (!e.shiftKey) {
      selectedNotes = {}
      selMinStep = selMaxStep = selMinNoteIdx = selMaxNoteIdx = -1
    }
    selectDragging = true
    selectStartStep = stepIdx
    selectStartNoteIdx = noteIdx
    selectEndStep = stepIdx
    selectEndNoteIdx = noteIdx
    pasteStep = stepIdx
    noteGridEl = (e.currentTarget as HTMLElement).closest('.grid') as HTMLElement
    noteGridEl?.setPointerCapture(e.pointerId)
  }

  function selectMove(e: PointerEvent) {
    if (!selectDragging || !noteGridEl) return
    const rect = noteGridEl.getBoundingClientRect()
    const relX = e.clientX - rect.left + noteGridEl.scrollLeft
    const relY = e.clientY - rect.top
    selectEndStep = Math.max(pageStart, Math.min(pageEnd - 1, pageStart + Math.floor(relX / 26)))
    selectEndNoteIdx = Math.max(0, Math.min(RANGE - 1, Math.floor(relY / (noteGridEl.scrollHeight / RANGE))))
  }

  function selectEnd() {
    if (!selectDragging) return
    selectDragging = false
    // Compute notes in rectangle
    const minStep = Math.min(selectStartStep, selectEndStep)
    const maxStep = Math.max(selectStartStep, selectEndStep)
    const minNoteIdx = Math.min(selectStartNoteIdx, selectEndNoteIdx)
    const maxNoteIdx = Math.max(selectStartNoteIdx, selectEndNoteIdx)
    const newSel: Record<string, true> = selectShift ? { ...selectedNotes } : {}
    for (let ni = minNoteIdx; ni <= maxNoteIdx; ni++) {
      const note = NOTES[ni]
      for (let s = minStep; s <= maxStep; s++) {
        if (getCellState(s, note) === 'head') {
          newSel[`${s}:${note}`] = true
        }
      }
    }
    selectedNotes = newSel
    // Persist bounds for visual feedback (marching ants)
    if (Object.keys(newSel).length > 0) {
      selMinStep = minStep; selMaxStep = maxStep
      selMinNoteIdx = minNoteIdx; selMaxNoteIdx = maxNoteIdx
    } else {
      selMinStep = selMaxStep = selMinNoteIdx = selMaxNoteIdx = -1
    }
    noteGridEl = null
  }

  /** Selection rectangle bounds (pixel coords relative to grid) */
  const selectRectStyle = $derived.by(() => {
    let minStep: number, maxStep: number, minNoteIdx: number, maxNoteIdx: number
    let committed = false
    if (selectDragging) {
      minStep = Math.min(selectStartStep, selectEndStep)
      maxStep = Math.max(selectStartStep, selectEndStep)
      minNoteIdx = Math.min(selectStartNoteIdx, selectEndNoteIdx)
      maxNoteIdx = Math.max(selectStartNoteIdx, selectEndNoteIdx)
    } else if (selMinStep >= 0) {
      minStep = selMinStep; maxStep = selMaxStep
      minNoteIdx = selMinNoteIdx; maxNoteIdx = selMaxNoteIdx
      committed = true
    } else {
      return null
    }
    return `left:${minStep * 26}px;top:${minNoteIdx * 9}px;width:${(maxStep - minStep + 1) * 26 - 2}px;height:${(maxNoteIdx - minNoteIdx + 1) * 9}px`
      + (committed ? ';--march:1' : '')
  })

  function deleteSelectedNotes() {
    if (!hasSelection) return
    pushUndo('Delete notes')
    for (const key of Object.keys(selectedNotes)) {
      const [s, n] = key.split(':').map(Number)
      const trig = ph.trigs[s]
      if (!trig?.active) continue
      if (isPoly && trig.notes) {
        removeNoteFromStep(trackId, s, n)
      } else if (trigHasNote(trig, n)) {
        trig.active = false
      }
    }
    selectedNotes = {}
    selMinStep = selMaxStep = selMinNoteIdx = selMaxNoteIdx = -1
  }

  function copySelectedNotes() {
    if (!hasSelection) return
    const keys = Object.keys(selectedNotes).map(k => {
      const [s, n] = k.split(':').map(Number)
      return { step: s, note: n }
    })
    const minStep = Math.min(...keys.map(k => k.step))
    noteClipboard = keys.map(({ step, note }) => {
      const trig = ph.trigs[step]
      return {
        stepOffset: step - minStep, note,
        velocity: trig.velocity,
        duration: trig.duration ?? 1,
        slide: trig.slide,
        ...(trig.chance != null ? { chance: trig.chance } : {}),
        ...(trig.paramLocks ? { paramLocks: { ...trig.paramLocks } } : {}),
      }
    })
  }

  function pasteNotes() {
    if (!noteClipboard || noteClipboard.length === 0) return
    pushUndo('Paste notes')
    // Paste at click position (pasteStep), same pitch — works across tracks
    for (const cn of noteClipboard) {
      const step = pasteStep + cn.stepOffset
      if (step < 0 || step >= ph.steps || cn.note < 0 || cn.note > 127) continue
      const trig = ph.trigs[step]
      trig.active = true
      trig.note = cn.note
      trig.velocity = cn.velocity
      trig.duration = cn.duration
      trig.slide = cn.slide
      if (cn.chance != null) trig.chance = cn.chance
      if (cn.paramLocks) trig.paramLocks = { ...cn.paramLocks }
    }
  }

  function brushPlaceNote(stepIdx: number, note: number) {
    const trig = ph.trigs[stepIdx]
    if (isPoly && trig.active) {
      // Poly: add note to existing active step
      const existing = trig.notes ?? [trig.note]
      if (!existing.includes(note)) {
        existing.push(note)
        existing.sort((a: number, b: number) => a - b)
      }
      trig.notes = existing
      trig.note = existing[0]
    } else if (isPoly && !trig.active) {
      // Poly: placing on a continuation or empty cell — don't truncate prior legato
      trig.active = true
      trig.note = note
      trig.duration = 1
      delete trig.notes
    } else {
      // Mono: truncate any prior note whose duration overlaps this step
      for (let d = 1; d <= 16; d++) {
        const prev = stepIdx - d
        if (prev < 0) break
        const pt = ph.trigs[prev]
        if (pt.active) {
          if ((pt.duration ?? 1) > d) pt.duration = d
          break
        }
      }
      trig.active = true
      trig.note = note
      trig.duration = 1
      delete trig.notes
    }
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
    let mode = activeBrush
    // Right-click in draw mode → erase
    if (mode === 'draw' && e.button === 2) mode = 'eraser'
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
    brushRightClick = e.button === 2
    noteGridEl?.setPointerCapture(e.pointerId)
    const key = `${stepIdx}:${note}`
    brushVisited.add(key)
    if (mode === 'draw') {
      // If clicking on an existing note head, enter pitch-move mode
      const trig = ph.trigs[stepIdx]
      if (trig?.active && trigHasNote(trig, note)) {
        brushMoveStep = stepIdx
      } else {
        brushPlaceNote(stepIdx, note)
      }
    }
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
    const stepIdx = Math.max(pageStart, Math.min(pageEnd - 1, pageStart + Math.floor(relX / 26)))
    let note = getNoteFromY(relY)
    if (note < 0) return
    if (activeBrush !== 'eraser' && !brushRightClick) note = snapToScale(note)
    // Draw brush: existing note → pitch-move (Y free), empty cell → legato (Y locked)
    if (activeBrush === 'draw') {
      if (brushMoveStep >= 0) {
        // Move mode: drag existing note vertically (pitch) and horizontally (step)
        const snapped = snapToScale(note)
        const src = ph.trigs[brushMoveStep]

        // Horizontal move: relocate trig to a different step
        if (stepIdx !== brushMoveStep && src.active && !ph.trigs[stepIdx].active) {
          const dst = ph.trigs[stepIdx]
          // Copy trig data to destination
          dst.active = true
          dst.note = src.note
          dst.velocity = src.velocity
          dst.duration = src.duration
          dst.slide = src.slide
          if (src.notes) dst.notes = [...src.notes]
          else delete dst.notes
          if (src.paramLocks) dst.paramLocks = { ...src.paramLocks }
          else delete dst.paramLocks
          // Clear source
          src.active = false
          delete src.notes
          delete src.paramLocks
          brushMoveStep = stepIdx
          brushMoved = true
        }

        // Vertical move: update pitch
        const trig = ph.trigs[brushMoveStep]
        if (trig.active && snapped !== trig.note) {
          if (isPoly && trig.notes) {
            const idx = trig.notes.indexOf(brushConstrainNote)
            if (idx >= 0) {
              trig.notes[idx] = snapped
              trig.notes.sort((a: number, b: number) => a - b)
              trig.note = trig.notes[0]
            }
          } else {
            trig.note = snapped
          }
          brushConstrainNote = snapped
          brushMoved = true
        }
        return
      }
      // Legato mode: lock Y to initial pitch (9px rows make Y-drift inevitable)
      note = brushConstrainNote
    }
    const key = `${stepIdx}:${note}`
    if (brushVisited.has(key)) return
    brushVisited.add(key)
    if (activeBrush === 'eraser' || brushRightClick) {
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
      const maxDur = Math.min(16, ph.steps - brushHeadStep)
      const dur = Math.min(maxDur, stepIdx - brushHeadStep + 1)
      ph.trigs[brushHeadStep].duration = dur
      for (let s = brushHeadStep + 1; s <= stepIdx; s++) {
        ph.trigs[s].active = false
      }
    }
  }

  function brushEnd() {
    // Draw brush on existing note with no drag → delete (DAW standard toggle)
    if (brushMoveStep >= 0 && !brushMoved) {
      brushEraseNote(brushMoveStep, brushConstrainNote)
    }
    brushDragging = false
    brushVisited.clear()
    brushConstrainNote = -1
    brushHeadStep = -1
    brushStrumStart = -1
    brushStrumLen = 0
    brushRightClick = false
    brushMoveStep = -1
    brushMoved = false
  }

  // Keyboard shortcuts (brush hold + select mode copy/delete)
  $effect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (vkbd.enabled) return
      // Only handle keys when select brush is active (piano roll is being interacted with)
      if (activeBrush !== 'select') return
      // Select mode: Cmd+C, Cmd+V, Cmd+A, Delete/Backspace
      if (!e.repeat && (e.ctrlKey || e.metaKey)) {
        if (e.code === 'KeyC' && hasSelection) { e.preventDefault(); copySelectedNotes(); return }
        if (e.code === 'KeyV' && noteClipboard) { e.preventDefault(); pasteNotes(); return }
        if (e.code === 'KeyA') {
          e.preventDefault()
          // Select all notes
          const all: Record<string, true> = {}
          for (let s = 0; s < ph.steps; s++) {
            for (const note of NOTES) {
              if (getCellState(s, note) === 'head') all[`${s}:${note}`] = true
            }
          }
          selectedNotes = all
          return
        }
      }
      if (!e.repeat && (e.code === 'Delete' || e.code === 'Backspace') && hasSelection) {
        e.preventDefault(); deleteSelectedNotes(); return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
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
      <button
        class="brush-btn flip-host"
        data-tip="Select (⌘C copy, ⌘A all, Del delete)" data-tip-ja="選択 (⌘C コピー, ⌘A 全選択, Del 削除)"
        onclick={() => toggleBrush('select')}
      ><span class="flip-card" class:flipped={activeBrush === 'select'}>
          <span class="flip-face brush-off"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.select}</svg></span>
          <span class="flip-face back brush-on"><svg viewBox="0 0 14 14" width="14" height="14">{@html ICON.select}</svg></span>
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
      style="--steps: {visibleSteps}; --ph-col: {playheadCol}"
      data-tip="Tap or drag to place/erase notes" data-tip-ja="タップ/ドラッグでノートを配置/消去"
      onpointermove={noteOnMove}
      onpointerup={noteEndDrag}
      onpointercancel={noteEndDrag}
      oncontextmenu={(e) => e.preventDefault()}
    >
      {#each NOTES as note, noteIdx}
        <div class="row" class:black={isBlack(note)} class:disabled={isOutOfScale(note)}>
          {#each { length: visibleSteps } as _, i}
            {@const stepIdx = pageStart + i}
            {@const state = getCellState(stepIdx, note)}
            <button
              class="cell"
              class:active={state === 'head'}
              class:continuation={state === 'continuation'}
              class:selected={`${stepIdx}:${note}` in selectedNotes}
              aria-label="Step {stepIdx + 1} note {note}"
              onpointerdown={(e) => noteStartDrag(e, stepIdx, activeBrush === 'eraser' ? note : snapToScale(note), noteIdx)}
            >
              {#if state === 'head'}
                <div class="resize-handle" role="separator" onpointerdown={(e) => startDurationDrag(e, stepIdx)}></div>
              {/if}
            </button>
          {/each}
        </div>
      {/each}
      {#if selectRectStyle}
        <div class="select-rect" class:marching={!selectDragging} style={selectRectStyle}></div>
      {/if}
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
    height: calc(216px / var(--rows, 24));
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
  .grid[data-brush="select"] { cursor: crosshair; }
  .grid[data-brush="select"] .cell { cursor: crosshair; }
  .grid {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .row {
    height: calc(216px / var(--rows, 24));
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
  .row.disabled .cell.active,
  .row.disabled .cell.continuation {
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
  .cell.selected {
    outline: 1.5px solid var(--color-blue);
    outline-offset: -1px;
    z-index: 1;
  }
  .cell.active.selected {
    background: var(--color-blue);
  }
  .select-rect {
    position: absolute;
    border: 1.5px dashed var(--color-blue);
    background: rgba(68,114,180,0.08);
    pointer-events: none;
    z-index: 2;
  }
  .select-rect.marching {
    border: none;
    background:
      repeating-linear-gradient(90deg, var(--color-blue) 0 3px, transparent 3px 6px) 0 0 / 100% 1.5px no-repeat,
      repeating-linear-gradient(90deg, var(--color-blue) 0 3px, transparent 3px 6px) 0 100% / 100% 1.5px no-repeat,
      repeating-linear-gradient(0deg, var(--color-blue) 0 3px, transparent 3px 6px) 0 0 / 1.5px 100% no-repeat,
      repeating-linear-gradient(0deg, var(--color-blue) 0 3px, transparent 3px 6px) 100% 0 / 1.5px 100% no-repeat,
      rgba(68,114,180,0.06);
    animation: march 0.3s linear infinite;
  }
  @keyframes march {
    to { background-position: 6px 0, -6px 100%, 0 -6px, 100% 6px, 0 0; }
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
      padding-left: 2px;
      padding-right: 4px;
    }
    .piano-spacer {
      width: auto;
    }
    .oct-keys { width: 26px; }
    .keys { width: 26px; }
    .key-label { font-size: 6px; }
    .grid { overflow-x: auto; }
    .row {
      grid-template-columns: repeat(var(--steps), 18px);
      gap: 1px;
    }
    .cell { width: 18px; }
  }
</style>
