<script lang="ts">
  import { pattern, playback, perf, prefs, setTrigNote } from '../state.svelte.ts'
  import { NOTE_NAMES, SCALE_DEGREES, SCALE_DEGREES_SET, PIANO_ROLL_MIN, PIANO_ROLL_MAX } from '../constants.ts'

  interface Props {
    trackId: number
  }
  let { trackId }: Props = $props()

  const track = $derived(pattern.tracks[trackId])

  // 2 octaves: C3–B4, rendered top=high → bottom=low
  const NOTES = Array.from({ length: PIANO_ROLL_MAX - PIANO_ROLL_MIN + 1 }, (_, i) => PIANO_ROLL_MAX - i)
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
  function isCellActive(stepIdx: number, note: number): boolean {
    const trig = track.trigs[stepIdx]
    return trig.active && trig.note === note
  }

  function isOutOfScale(note: number): boolean {
    return prefs.scaleMode && !SCALE_DEGREES_SET.has(note % 12)
  }

  // ── Drag-to-paint state ──
  let noteDragging = $state(false)
  let notePaintOn = $state(true)
  let noteLastStep = -1
  let noteLastNote = -1
  let noteGridEl: HTMLElement | null = null

  function noteStartDrag(e: PointerEvent, stepIdx: number, note: number) {
    e.preventDefault()
    const active = isCellActive(stepIdx, note)
    notePaintOn = !active
    noteDragging = true
    noteLastStep = stepIdx
    noteLastNote = note
    noteGridEl = (e.currentTarget as HTMLElement).closest('.grid') as HTMLElement
    noteGridEl?.setPointerCapture(e.pointerId)
    setTrigNote(trackId, stepIdx, note)
  }

  function noteOnMove(e: PointerEvent) {
    if (!noteDragging || !noteGridEl) return
    const rect = noteGridEl.getBoundingClientRect()
    const relX = e.clientX - rect.left + noteGridEl.scrollLeft
    const relY = e.clientY - rect.top
    const stepIdx = Math.max(0, Math.min(track.steps - 1, Math.floor(relX / 26)))
    const rowHeight = rect.height / NOTES.length
    const noteRowIdx = Math.max(0, Math.min(NOTES.length - 1, Math.floor(relY / rowHeight)))
    const note = NOTES[noteRowIdx]
    if (stepIdx === noteLastStep && note === noteLastNote) return
    if (isOutOfScale(note)) return
    noteLastStep = stepIdx
    noteLastNote = note
    const trig = track.trigs[stepIdx]
    if (notePaintOn) {
      trig.active = true
      trig.note = note
    } else {
      if (trig.active) trig.active = false
    }
  }

  function noteEndDrag() {
    noteDragging = false
    noteGridEl = null
  }
</script>

<div class="piano-roll">
  <!-- Left spacer to align grid with step columns -->
  <div class="piano-spacer">
    <!-- Piano keys -->
    <div class="keys" data-tip="Note reference — shows transposed pitch" data-tip-ja="音程リファレンス (移調後のピッチ)">
      {#each NOTES as note}
        <div class="key" class:black={isBlack(note)} class:disabled={isOutOfScale(note)}>
          <span class="key-label">{noteLabel(note)}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Note grid -->
  <div
    class="grid"
    role="application"
    style="--steps: {track.steps}"
    data-tip="Tap or drag to place/erase notes" data-tip-ja="タップ/ドラッグでノートを配置/消去"
    onpointermove={noteOnMove}
    onpointerup={noteEndDrag}
    onpointercancel={noteEndDrag}
  >
    {#each NOTES as note}
      <div class="row" class:black={isBlack(note)} class:disabled={isOutOfScale(note)}>
        {#each track.trigs as _trig, stepIdx}
          {@const isPlayhead = playback.playing && playback.playheads[trackId] === stepIdx}
          <button
            class="cell"
            class:active={isCellActive(stepIdx, note)}
            class:playhead={isPlayhead}
            aria-label="Step {stepIdx + 1} note {note}"
            onpointerdown={(e) => { if (!isOutOfScale(note)) noteStartDrag(e, stepIdx, note) }}
          ></button>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .piano-roll {
    display: flex;
    height: 180px;
    overflow: hidden;
    background: var(--color-surface);
    border-bottom: 1px solid rgba(30,32,40,0.08);
    border-left: 3px solid var(--color-olive);
    padding-left: 5px;
    padding-right: 8px;
  }

  /* ── Left spacer: aligns grid with step columns ── */
  .piano-spacer {
    /* Must match: label(64) + gap(4) + knobs(42) + gap(4) + mute(20) + gap(4) = 138px */
    width: 138px;
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    justify-content: flex-end;
  }

  /* ── Keys ── */
  .keys {
    flex-shrink: 0;
    width: 28px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid rgba(30,32,40,0.15);
  }
  .key {
    flex: 1;
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

  /* ── Grid ── */
  .grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .row {
    flex: 1;
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
    pointer-events: none;
  }
  .row.disabled .cell {
    opacity: 0.12;
  }

  .cell {
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
  .cell.playhead {
    background: rgba(68,114,180,0.15) !important;
  }
  .cell.active.playhead {
    background: var(--color-blue) !important;
  }
</style>
