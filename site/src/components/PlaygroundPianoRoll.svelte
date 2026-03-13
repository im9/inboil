<script lang="ts">
  import '../styles/playground.css'
  import { song, ui } from '$app/lib/state.svelte.ts'
  import PianoRoll from '$app/lib/components/PianoRoll.svelte'

  // Use an FM synth track in poly mode so chords work in the piano roll
  const pat = song.patterns[ui.currentPattern]
  let trackId = song.tracks[0]?.id ?? 0

  if (pat) {
    // Find a cell with FM or WT voice, or pick the first synth-like cell and switch it
    let cell = pat.cells.find(c => c.voiceId === 'FM' || c.voiceId === 'WT')
    if (!cell) {
      // Fall back to Bass cell and switch it to FM
      cell = pat.cells.find(c => c.voiceId === 'Bass303') ?? pat.cells[0]
    }
    if (cell) {
      trackId = cell.trackId
      if (cell.voiceId !== 'FM' && cell.voiceId !== 'WT') {
        cell.voiceId = 'FM'
        cell.voiceParams = { ...cell.voiceParams, polyMode: 1 }
      } else if (cell.voiceParams.polyMode === 0) {
        cell.voiceParams = { ...cell.voiceParams, polyMode: 1 }
      }

      // Pre-fill a simple chord pattern (C major → C minor)
      const chords: { step: number, notes: number[], vel: number }[] = [
        { step: 0,  notes: [48, 52, 55], vel: 0.9 },  // C major
        { step: 8,  notes: [48, 51, 55], vel: 0.8 },  // C minor
      ]
      for (const ch of chords) {
        const t = cell.trigs[ch.step]
        if (t) {
          t.active = true
          t.note = ch.notes[0]
          t.notes = ch.notes
          t.velocity = ch.vel
        }
      }
    }
  }
  ui.selectedTrack = trackId
</script>

<div class="playground" style="height: 320px;">
  <PianoRoll {trackId} />
</div>
