<script lang="ts">
  import '../styles/playground.css'
  import { song, ui } from '$app/lib/state.svelte.ts'
  import PianoRoll from '$app/lib/components/PianoRoll.svelte'

  const bassTrack = song.tracks.find(t => t.voiceId === 'Bass')
  const trackId = bassTrack?.id ?? song.tracks[0]?.id ?? 0
  ui.selectedTrack = trackId

  const pat = song.patterns[ui.currentPattern]
  if (pat) {
    const cell = pat.cells.find(c => c.trackId === trackId)
    if (cell) {
      const notes = [
        { step: 0, note: 36, vel: 0.9 },
        { step: 4, note: 43, vel: 0.7 },
        { step: 8, note: 36, vel: 0.8 },
        { step: 12, note: 43, vel: 0.6 },
      ]
      for (const n of notes) {
        if (cell.trigs[n.step]) {
          cell.trigs[n.step].active = true
          cell.trigs[n.step].note = n.note
          cell.trigs[n.step].velocity = n.vel
        }
      }
    }
  }
</script>

<div class="playground" style="height: 320px;">
  <PianoRoll {trackId} />
</div>
