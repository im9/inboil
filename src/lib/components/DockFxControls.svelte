<script lang="ts">
  import { fxPad, fxFlavours, perf, ui } from '../state.svelte.ts'
  import { FX_FLAVOURS } from '../constants.ts'
  import type { FxFlavourKey } from '../constants.ts'
  import Knob from './Knob.svelte'

  const FX_NODES = [
    { key: 'verb'     as const, label: 'VERB',  flavourKey: 'verb'     as const, color: 'var(--color-olive)' },
    { key: 'delay'    as const, label: 'DLY',   flavourKey: 'delay'    as const, color: 'var(--color-blue)' },
    { key: 'glitch'   as const, label: 'GLT',   flavourKey: 'glitch'   as const, color: 'var(--color-salmon)' },
    { key: 'granular' as const, label: 'GRN',   flavourKey: 'granular' as const, color: 'var(--color-purple)' },
    { key: 'filter'   as const, label: 'FLTR',  flavourKey: null,                color: 'var(--color-olive)' },
  ] as const

  type FxKey = typeof FX_NODES[number]['key']

  function fxXLabel(key: FxKey): string {
    if (key === 'verb') return fxFlavours.verb === 'shimmer' ? 'SIZE' : 'SIZE'
    if (key === 'delay') return fxFlavours.delay === 'dotted' ? 'TIME' : 'TIME'
    if (key === 'glitch') return fxFlavours.glitch === 'stutter' ? 'SLICE' : 'RATE'
    if (key === 'granular') return 'SIZE'
    return 'FREQ'
  }

  function fxYLabel(key: FxKey): string {
    if (key === 'verb') return fxFlavours.verb === 'shimmer' ? 'SHIM' : 'DAMP'
    if (key === 'delay') return 'FB'
    if (key === 'glitch') return fxFlavours.glitch === 'stutter' ? '—' : 'BITS'
    if (key === 'granular') return 'DENS'
    return 'RESO'
  }

  function fxXDisplay(key: FxKey, x: number): string {
    if (key === 'verb') return `${Math.round(x * 100)}%`
    if (key === 'delay') return `${Math.round(x * 100)}%`
    if (key === 'glitch') {
      if (fxFlavours.glitch === 'stutter') return `${Math.round(10 + x * 190)}ms`
      return `${Math.round(x * 100)}%`
    }
    if (key === 'granular') return `${Math.round(10 + x * 190)}ms`
    if (key === 'filter') {
      const f = x <= 0.5 ? 80 * Math.pow(250, x / 0.5) : 20 * Math.pow(400, (x - 0.5) / 0.5)
      return f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${Math.round(f)}`
    }
    return `${Math.round(x * 100)}%`
  }

  function fxYDisplay(key: FxKey, y: number): string {
    if (key === 'verb') {
      if (fxFlavours.verb === 'shimmer') return `${Math.round(y * 60)}%`
      return `${Math.round((1 - y) * 100)}%`
    }
    if (key === 'delay') return `${Math.round(y * 85)}%`
    if (key === 'glitch') return fxFlavours.glitch === 'stutter' ? '—' : `${Math.round((1 - y) * 100)}%`
    if (key === 'granular') return `${Math.round(y * 100)}%`
    if (key === 'filter') return `${Math.round(y * 100)}%`
    return `${Math.round(y * 100)}%`
  }

  function setFxX(key: FxKey, v: number) {
    fxPad[key].x = v
  }

  function setFxY(key: FxKey, v: number) {
    fxPad[key].y = v
  }

  function toggleFxOn(key: FxKey) {
    const wasOn = fxPad[key].on
    fxPad[key].on = !wasOn
    // Auto-release hold when pad is turned off (ADR 121)
    if (wasOn) { const hk = HOLD_MAP[key]; if (hk) perf[hk] = false }
  }

  function fxFlavourKey(key: FxKey): FxFlavourKey | null {
    if (key === 'verb' || key === 'delay' || key === 'glitch' || key === 'granular') return key
    return null
  }

  function setFlavour(fKey: FxFlavourKey, id: string) {
    if (fKey === 'verb') fxFlavours.verb = id as typeof fxFlavours.verb
    else if (fKey === 'delay') fxFlavours.delay = id as typeof fxFlavours.delay
    else if (fKey === 'glitch') fxFlavours.glitch = id as typeof fxFlavours.glitch
    else if (fKey === 'granular') fxFlavours.granular = id as typeof fxFlavours.granular
  }

  function currentFlavourId(fKey: FxFlavourKey): string {
    return fxFlavours[fKey]
  }

  type HoldKey = 'reverbHold' | 'delayHold' | 'glitchHold' | 'granularHold'
  const HOLD_MAP: Record<string, HoldKey> = {
    verb: 'reverbHold', delay: 'delayHold', glitch: 'glitchHold', granular: 'granularHold',
  }

  function toggleHold(key: FxKey) {
    const hk = HOLD_MAP[key]
    if (hk) perf[hk] = !perf[hk]
  }

  function isHeld(key: FxKey): boolean {
    const hk = HOLD_MAP[key]
    return hk ? perf[hk] : false
  }
</script>

<span class="section-label">FX CONTROLS</span>
<div class="fx-dock-grid">
  {#each FX_NODES as node}
    {@const pad = fxPad[node.key]}
    {@const fKey = fxFlavourKey(node.key)}
    <div class="fx-dock-band" class:disabled={!pad.on} style:--fx-color={node.color}>
      <div class="fx-dock-header">
        <button
          class="fx-dock-toggle"
          class:active={pad.on}
          aria-pressed={pad.on}
          onpointerdown={() => toggleFxOn(node.key)}
        >{node.label}</button>
        {#if fKey}
          <div class="fx-dock-flavours">
            {#each FX_FLAVOURS[fKey] as fl}
              <button
                class="fx-flv-btn"
                class:active={currentFlavourId(fKey) === fl.id}
                onpointerdown={() => setFlavour(fKey, fl.id)}
                data-tip={fl.tip}
                data-tip-ja={fl.tipJa}
              >{fl.label}</button>
            {/each}
          </div>
        {/if}
      </div>
      <div class="fx-dock-knobs">
        <Knob
          value={pad.x}
          label={fxXLabel(node.key)}
          size={36}
          displayValue={fxXDisplay(node.key, pad.x)}
          onchange={v => setFxX(node.key, v)}
        />
        <Knob
          value={pad.y}
          label={fxYLabel(node.key)}
          size={36}
          displayValue={fxYDisplay(node.key, pad.y)}
          onchange={v => setFxY(node.key, v)}
        />
      </div>
      {#if HOLD_MAP[node.key]}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fx-hold-row" onpointerdown={() => toggleHold(node.key)}
          data-tip="Hold — sustain current buffer indefinitely" data-tip-ja="ホールド — 現在のバッファを無限に保持">
          <span class="fx-hold-label">HOLD</span>
          <span class="fx-hold-switch" class:on={isHeld(node.key)}><span class="fx-hold-thumb"></span></span>
        </div>
      {/if}
      {#if node.key === 'granular'}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fx-hold-row" onpointerdown={() => { ui.granularMode2 = !ui.granularMode2 }}
          data-tip="Mode 2 — FxPad drag controls pitch/scatter instead of size/density" data-tip-ja="モード2 — FxPadのドラッグがピッチ/スキャッターを操作">
          <span class="fx-hold-label">M2</span>
          <span class="fx-hold-switch" class:on={ui.granularMode2}><span class="fx-hold-thumb"></span></span>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .section-label {
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dz-transport-border);
    padding-bottom: 2px;
  }
  .fx-dock-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }
  .fx-dock-band {
    padding: 6px 8px;
    border: 1px solid var(--dz-border);
    border-radius: 0;
  }
  .fx-dock-band.disabled {
    opacity: 0.35;
  }
  .fx-dock-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .fx-dock-toggle {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 1px 6px;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-transport-border);
    cursor: pointer;
    border-radius: 0;
  }
  .fx-dock-toggle.active {
    background: var(--fx-color);
    border-color: var(--fx-color);
    color: var(--color-bg);
  }
  .fx-dock-flavours {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }
  .fx-flv-btn {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 4px;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-transport-border);
    cursor: pointer;
    border-radius: 0;
  }
  .fx-flv-btn.active {
    background: var(--fx-color);
    border-color: var(--fx-color);
    color: var(--color-bg);
  }
  .fx-dock-knobs {
    display: flex;
    gap: 4px;
  }
  .fx-hold-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0 0;
    cursor: pointer;
  }
  .fx-hold-label {
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-text-mid);
  }
  .fx-hold-switch {
    margin-left: auto;
    width: 28px;
    height: 14px;
    border-radius: var(--radius-md);
    background: var(--dz-bg-press);
    position: relative;
    flex-shrink: 0;
    transition: background 100ms;
  }
  .fx-hold-switch.on {
    background: var(--fx-color);
  }
  .fx-hold-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--dz-text);
    transition: left 100ms;
  }
  .fx-hold-switch.on .fx-hold-thumb {
    left: 16px;
    background: var(--color-bg);
  }
</style>
