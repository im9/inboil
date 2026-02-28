<script lang="ts">
  import { pattern, playback, perf, setTrigNote } from '../state.svelte.ts'

  interface Props {
    trackId: number
  }
  let { trackId }: Props = $props()

  const track = $derived(pattern.tracks[trackId])

  // 2 octaves: C3(48) to B4(71), rendered top=high → bottom=low
  const MIN_NOTE = 48
  const MAX_NOTE = 71
  const NOTES = Array.from({ length: MAX_NOTE - MIN_NOTE + 1 }, (_, i) => MAX_NOTE - i)
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const BASE_SCALE = [0, 2, 4, 5, 7, 9, 11]
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
        const dist = Math.min(Math.abs(p - BASE_SCALE[d]), 12 - Math.abs(p - BASE_SCALE[d]))
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
    const chromaOffset = pc - BASE_SCALE[degree]
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
</script>

<div class="piano-roll">
  <!-- Left spacer to align grid with step columns -->
  <div class="piano-spacer">
    <!-- Piano keys -->
    <div class="keys">
      {#each NOTES as note}
        <div class="key" class:black={isBlack(note)}>
          <span class="key-label">{noteLabel(note)}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Note grid -->
  <div class="grid" style="--steps: {track.steps}">
    {#each NOTES as note}
      <div class="row" class:black={isBlack(note)}>
        {#each track.trigs as _trig, stepIdx}
          {@const isPlayhead = playback.playing && playback.playheads[trackId] === stepIdx}
          <button
            class="cell"
            class:active={isCellActive(stepIdx, note)}
            class:playhead={isPlayhead}
            onpointerdown={() => setTrigNote(trackId, stepIdx, note)}
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
