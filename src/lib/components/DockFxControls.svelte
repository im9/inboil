<script lang="ts">
  import { fxPad, fxFlavours } from '../state.svelte.ts'
  import { FX_FLAVOURS } from '../constants.ts'
  import type { FxFlavourKey } from '../constants.ts'
  import Knob from './Knob.svelte'

  const FX_NODES = [
    { key: 'verb'     as const, label: 'VERB',  flavourKey: 'verb'     as const },
    { key: 'delay'    as const, label: 'DLY',   flavourKey: 'delay'    as const },
    { key: 'glitch'   as const, label: 'GLT',   flavourKey: 'glitch'   as const },
    { key: 'granular' as const, label: 'GRN',   flavourKey: 'granular' as const },
    { key: 'filter'   as const, label: 'FLTR',  flavourKey: null },
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
    fxPad[key].on = !fxPad[key].on
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
</script>

<span class="section-label">FX CONTROLS</span>
<div class="fx-dock-grid">
  {#each FX_NODES as node}
    {@const pad = fxPad[node.key]}
    {@const fKey = fxFlavourKey(node.key)}
    <div class="fx-dock-band" class:disabled={!pad.on}>
      <div class="fx-dock-header">
        <button
          class="fx-dock-toggle"
          class:active={pad.on}
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
          size={32}
          displayValue={fxXDisplay(node.key, pad.x)}
          onchange={v => setFxX(node.key, v)}
        />
        <Knob
          value={pad.y}
          label={fxYLabel(node.key)}
          size={32}
          displayValue={fxYDisplay(node.key, pad.y)}
          onchange={v => setFxY(node.key, v)}
        />
      </div>
    </div>
  {/each}
</div>

<style>
  .section-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(237,232,220, 0.4);
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
    border: 1px solid rgba(237,232,220, 0.15);
    border-radius: 4px;
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
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 1px 6px;
    border: 1px solid rgba(237,232,220, 0.15);
    background: transparent;
    color: rgba(237,232,220, 0.4);
    cursor: pointer;
    border-radius: 2px;
  }
  .fx-dock-toggle.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .fx-dock-flavours {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }
  .fx-flv-btn {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 4px;
    border: 1px solid rgba(237,232,220, 0.15);
    background: transparent;
    color: rgba(237,232,220, 0.4);
    cursor: pointer;
    border-radius: 2px;
  }
  .fx-flv-btn.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
    color: var(--color-bg);
  }
  .fx-dock-knobs {
    display: flex;
    gap: 4px;
  }
</style>
