<script lang="ts">
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange } from '../paramHelpers.ts'
  import { captureValue } from '../sweepRecorder.svelte.ts'
  import { ui } from '../state.svelte.ts'
  import Knob from './Knob.svelte'

  const params = $derived(getParamDefs('Sampler'))
</script>

<div class="params-grid">
  {#each params as p}
    {#if p.key === 'reverse'}
      {@const isOn = (knobValue(p) ?? p.default) >= 0.5}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="toggle-row" onpointerdown={() => knobChange(p, isOn ? 0 : 1)}
        data-tip={p.tip} data-tip-ja={p.tipJa}>
        <span class="toggle-label">{isOn ? 'REV' : 'FWD'}</span>
        <span class="toggle-switch" class:on={isOn}><span class="toggle-thumb"></span></span>
      </div>
    {:else}
      <span data-tip={p.tip ?? ''} data-tip-ja={p.tipJa ?? ''}>
        <Knob
          value={normalizeParam(p, knobValue(p))}
          label={p.label}
          size={36}
          light={true}
          steps={paramSteps(p)}
          displayValue={displayLabel(p, knobValue(p))}
          onchange={v => { knobChange(p, v); captureValue({ kind: 'track', trackId: ui.selectedTrack, param: p.key as 'cutoff' }, v) }}
        />
      </span>
    {/if}
  {/each}
</div>

<style>
  .params-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: start;
    align-content: start;
    flex: 1;
    overflow-y: auto;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 2px 4px;
  }

  .toggle-label {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--lz-text-strong);
    opacity: 0.6;
  }

  .toggle-switch {
    width: 24px;
    height: 12px;
    border: 1px solid var(--lz-border-strong);
    background: transparent;
    position: relative;
    display: inline-block;
  }

  .toggle-switch.on {
    background: var(--olive-bg);
  }

  .toggle-thumb {
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--color-fg);
    top: 0;
    left: 0;
    transition: left 80ms;
  }

  .toggle-switch.on .toggle-thumb {
    left: 12px;
  }
</style>
