<script lang="ts">
  import '../styles/playground.css'
  import { song, ui } from '$app/lib/state.svelte.ts'
  import MatrixView from '$app/lib/components/MatrixView.svelte'

  song.patterns[0].name = 'Verse'
  song.patterns[1].name = 'Chorus'
  song.patterns[2].name = 'Break'
  for (let p = 0; p < 3; p++) {
    const pat = song.patterns[p]
    for (const cell of pat.cells) {
      for (let i = 0; i < cell.steps; i++) {
        if (Math.random() < 0.3) { cell.trigs[i].active = true; cell.trigs[i].velocity = 0.5 + Math.random() * 0.4 }
      }
    }
  }
</script>

<div class="playground" style="height: 360px;">
  <MatrixView />
</div>
