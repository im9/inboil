<script lang="ts">
  import '../styles/playground.css'
  import EnvGraph from '$app/lib/components/EnvGraph.svelte'
  import Knob from '$app/lib/components/Knob.svelte'

  let attack = $state(0.1)
  let decay = $state(0.3)
  let sustain = $state(0.6)
  let release = $state(0.4)
</script>

<div class="playground dark-zone playground-env">
  <EnvGraph {attack} {decay} {sustain} {release} />
  <div class="env-knobs">
    <Knob value={attack} label="ATK" size={36} displayValue={Math.round(attack * 100) + '%'} onchange={(v) => { attack = v }} />
    <Knob value={decay} label="DCY" size={36} displayValue={Math.round(decay * 100) + '%'} onchange={(v) => { decay = v }} />
    <Knob value={sustain} label="SUS" size={36} displayValue={Math.round(sustain * 100) + '%'} onchange={(v) => { sustain = v }} />
    <Knob value={release} label="REL" size={36} displayValue={Math.round(release * 100) + '%'} onchange={(v) => { release = v }} />
  </div>
</div>

<style>
  .playground-env {
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: fit-content;
  }
  .env-knobs {
    display: flex;
    gap: 16px;
  }
</style>
