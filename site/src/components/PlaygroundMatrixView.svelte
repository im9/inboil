<script lang="ts">
  import '../styles/playground.css'
  import { initTutorialPatterns } from './tutorialSetup.ts'
  import MatrixView from '$app/lib/components/MatrixView.svelte'
  import StepGrid from '$app/lib/components/StepGrid.svelte'

  initTutorialPatterns()
</script>

<div class="playground matrix-with-grid">
  <MatrixView />
  <StepGrid />
</div>

<style>
  .matrix-with-grid {
    flex-direction: row;
    height: 420px;
  }
</style>
