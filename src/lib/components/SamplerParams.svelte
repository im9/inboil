<script lang="ts">
  import { getParamDefs, normalizeParam, displayLabel, paramSteps } from '../paramDefs.ts'
  import { knobValue, knobChange, isParamLocked } from '../paramHelpers.ts'
  import { captureValue } from '../sweepRecorder.svelte.ts'
  import { ui, activeCell } from '../state.svelte.ts'
  import { clearAllParamLocks } from '../stepActions.ts'
  import Knob from './Knob.svelte'

  const params = $derived(getParamDefs('Sampler'))
  const selTrig = $derived(ui.lockMode && ui.selectedStep !== null ? activeCell(ui.selectedTrack)?.trigs[ui.selectedStep] : null)
  const hasAnyLock = $derived(!!(selTrig?.paramLocks && Object.keys(selTrig.paramLocks).length > 0))

  const GROUP_LABELS: Record<string, string> = {
    amp: 'AMP', sample: 'SAMPLE', chop: 'CHOP', sync: 'SYNC',
  }

  const grouped = $derived.by(() => {
    const groups: { key: string; label: string; items: typeof params }[] = []
    let currentGroup = ''
    for (const p of params) {
      const g = p.group ?? ''
      if (g !== currentGroup) {
        currentGroup = g
        groups.push({ key: g, label: GROUP_LABELS[g] ?? g.toUpperCase(), items: [] })
      }
      groups[groups.length - 1].items.push(p)
    }
    return groups
  })
</script>

<div class="params-panel">
  <!-- P-LOCK -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="plock-row" onpointerdown={() => { ui.lockMode = !ui.lockMode; ui.selectedStep = null }}
    data-tip="Per-step parameter override" data-tip-ja="ステップごとにパラメータを変更"
  >
    <span class="plock-label">P-LOCK</span>
    <span class="plock-switch" class:on={ui.lockMode}><span class="plock-thumb"></span></span>
    {#if ui.lockMode && ui.selectedStep !== null}
      <span class="plock-step">STEP {ui.selectedStep + 1}</span>
    {:else if ui.lockMode}
      <span class="plock-hint">select a step</span>
    {/if}
    {#if hasAnyLock}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <button class="plock-clr" onpointerdown={(e) => { e.stopPropagation(); clearAllParamLocks(ui.selectedTrack, ui.selectedStep!) }}>CLR</button>
    {/if}
  </div>

  <!-- Param groups as bordered cards -->
  <div class="groups-grid">
    {#each grouped as group}
      <div class="param-card">
        <span class="card-label">{group.label}</span>
        <div class="card-knobs">
          {#each group.items as p}
            {#if p.key === 'reverse'}
              {@const isOn = (knobValue(p) ?? p.default) >= 0.5}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="toggle-cell" onpointerdown={() => knobChange(p, isOn ? 0 : 1)}
                data-tip={p.tip} data-tip-ja={p.tipJa}>
                <span class="toggle-switch" class:on={isOn}><span class="toggle-thumb"></span></span>
                <span class="toggle-val">{isOn ? 'REV' : 'FWD'}</span>
              </div>
            {:else}
              <span data-tip={p.tip ?? ''} data-tip-ja={p.tipJa ?? ''}>
                <Knob
                  value={normalizeParam(p, knobValue(p))}
                  label={p.label}
                  size={36}
                  light={true}
                  locked={isParamLocked(p.key)}
                  steps={paramSteps(p)}
                  displayValue={displayLabel(p, knobValue(p))}
                  onchange={v => { knobChange(p, v); captureValue({ kind: 'track', trackId: ui.selectedTrack, param: p.key as 'cutoff' }, v) }}
                />
              </span>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .params-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  /* P-LOCK row */
  .plock-row {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 2px 0;
  }

  .plock-label {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--lz-text-hint);
  }

  .plock-step {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--color-olive);
  }

  .plock-hint {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    color: var(--lz-text-hint);
    opacity: 0.5;
  }

  .plock-clr {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    padding: 1px 6px;
    border: 1px solid var(--lz-step-border);
    background: transparent;
    color: var(--lz-text-hint);
    cursor: pointer;
  }

  .plock-clr:hover {
    color: var(--lz-text-strong);
  }

  .plock-switch {
    width: 24px;
    height: 12px;
    border: 1px solid var(--lz-step-border);
    position: relative;
  }

  .plock-switch.on { border-color: var(--color-olive); }

  .plock-thumb {
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--lz-text-hint);
    top: 0;
    left: 0;
    transition: left 80ms;
  }

  .plock-switch.on .plock-thumb {
    left: 12px;
    background: var(--color-olive);
  }

  .groups-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .param-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    border: 1px solid var(--lz-border-strong);
  }

  .card-label {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--lz-text-hint);
    opacity: 0.5;
  }

  .card-knobs {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .toggle-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    padding: 2px;
  }

  .toggle-val {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--lz-text-strong);
    line-height: 1;
  }

  .toggle-switch {
    width: 24px;
    height: 12px;
    border: 1px solid var(--lz-step-border);
    position: relative;
  }

  .toggle-switch.on { border-color: var(--color-olive); }

  .toggle-thumb {
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--lz-text-hint);
    top: 0;
    left: 0;
    transition: left 80ms;
  }

  .toggle-switch.on .toggle-thumb {
    left: 12px;
    background: var(--color-olive);
  }
</style>
