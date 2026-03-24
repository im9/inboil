<script lang="ts">
  import '../styles/playground.css'
  import Knob from '$app/lib/components/Knob.svelte'

  let value = $state(0.5)
  let displayValue = $derived(Math.round(value * 100) + '%')
</script>

<div class="playground dark-zone knob-demo">
  <Knob {value} label="TRY ME" size={48} {displayValue} onchange={(v) => { value = v }} />
  <p class="knob-hint">Drag up/down to change value</p>
</div>

<style>
  .knob-demo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px;
    width: fit-content;
  }
  .knob-hint {
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
</style>
