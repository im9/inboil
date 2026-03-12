<script lang="ts">
  import '../styles/playground.css'
  import { song, ui } from '$app/lib/state.svelte.ts'
  import StepGrid from '$app/lib/components/StepGrid.svelte'

  function initTutorialState() {
    const pat = song.patterns[ui.currentPattern]
    if (!pat) return
    const kick = pat.cells.find(c => c.voiceId === 'Kick')
    if (kick) {
      for (let i = 0; i < kick.steps; i += 4) { kick.trigs[i].active = true; kick.trigs[i].velocity = 0.9 }
    }
    const hh = pat.cells.find(c => c.voiceId === 'CHH')
    if (hh) {
      for (let i = 0; i < hh.steps; i += 2) { hh.trigs[i].active = true; hh.trigs[i].velocity = 0.6 }
    }
    const snare = pat.cells.find(c => c.voiceId === 'Snare')
    if (snare) { snare.trigs[4].active = true; snare.trigs[12].active = true }
  }
  initTutorialState()
</script>

<div class="playground" style="max-height: 360px;">
  <StepGrid />
</div>
