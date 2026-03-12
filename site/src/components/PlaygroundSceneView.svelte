<script lang="ts">
  import '../styles/playground.css'
  import { song, ui } from '$app/lib/state.svelte.ts'
  import SceneView from '$app/lib/components/SceneView.svelte'

  function initTutorialScene() {
    if (song.patterns[0]) song.patterns[0].name = 'Verse'
    if (song.patterns[1]) song.patterns[1].name = 'Chorus'
    if (song.patterns[2]) song.patterns[2].name = 'Break'
    song.scene.nodes = [
      { id: 'n1', type: 'pattern', patternId: song.patterns[0]?.id ?? 'pat_00', x: 150, y: 100, decorators: [] },
      { id: 'n2', type: 'pattern', patternId: song.patterns[1]?.id ?? 'pat_01', x: 350, y: 100, decorators: [] },
      { id: 'n3', type: 'pattern', patternId: song.patterns[2]?.id ?? 'pat_02', x: 250, y: 260, decorators: [] },
    ]
    song.scene.edges = [
      { id: 'e1', from: 'n1', to: 'n2', weight: 1 },
      { id: 'e2', from: 'n2', to: 'n3', weight: 1 },
      { id: 'e3', from: 'n3', to: 'n1', weight: 1 },
    ]
    song.scene.labels = []
  }
  initTutorialScene()
</script>

<div class="playground" style="height: 400px;">
  <SceneView />
</div>
