<script lang="ts">
  import '../styles/playground.css'
  import { song, ui } from '$app/lib/state.svelte.ts'
  import TrackerView from '$app/lib/components/TrackerView.svelte'

  const pat = song.patterns[ui.currentPattern]
  if (pat) {
    const kick = pat.cells.find(c => c.voiceId === 'Kick')
    if (kick) {
      for (let i = 0; i < 16; i += 4) { kick.trigs[i].active = true; kick.trigs[i].velocity = 0.9 }
    }
    const snare = pat.cells.find(c => c.voiceId === 'Snare')
    if (snare) { snare.trigs[4].active = true; snare.trigs[12].active = true }
  }
</script>

<div class="playground" style="max-height: 400px;">
  <TrackerView />
</div>
