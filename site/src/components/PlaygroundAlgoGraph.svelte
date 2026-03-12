<script lang="ts">
  import '../styles/playground.css'
  import AlgoGraph from '$app/lib/components/AlgoGraph.svelte'

  let algorithm = $state(0)
  const algos = ['1', '2', '3', '4', '5', '6', '7', '8']
</script>

<div class="playground dark-zone playground-algo">
  <AlgoGraph {algorithm} />
  <div class="algo-buttons">
    {#each algos as label, i}
      <button class:active={algorithm === i} onclick={() => { algorithm = i }}>{label}</button>
    {/each}
  </div>
  <p class="algo-hint">FM operator routing — tap to switch algorithm</p>
</div>

<style>
  .playground-algo {
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: fit-content;
  }
  .algo-buttons {
    display: flex;
    gap: 4px;
  }
  .algo-buttons button {
    width: 28px;
    height: 28px;
    border: 1px solid var(--color-muted) !important;
    border-radius: 4px;
    color: var(--color-muted);
    font-size: 12px;
  }
  .algo-buttons button.active {
    background: var(--color-blue) !important;
    border-color: var(--color-blue) !important;
    color: var(--color-bg);
  }
  .algo-hint {
    font-size: 12px;
    color: var(--color-muted);
  }
</style>
