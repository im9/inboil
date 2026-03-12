<script lang="ts">
  import '../styles/playground.css'
  import WaveGraph from '$app/lib/components/WaveGraph.svelte'
  import Knob from '$app/lib/components/Knob.svelte'

  let position = $state(0)
</script>

<div class="playground dark-zone playground-wave">
  <WaveGraph {position} />
  <Knob value={position} label="WAVE" size={36} displayValue={Math.round(position * 100) + '%'} onchange={(v) => { position = v }} />
  <p class="wave-hint">Morph between waveforms: saw → square → tri → sine → pulse</p>
</div>

<style>
  .playground-wave {
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: fit-content;
  }
  .wave-hint {
    font-size: 12px;
    color: var(--color-muted);
  }
</style>
