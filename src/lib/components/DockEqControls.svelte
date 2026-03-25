<script lang="ts">
  import { fxPad, pushUndo } from '../state.svelte.ts'
  import Knob from './Knob.svelte'

  const EQ_BANDS = [
    { key: 'eqLow' as const, label: 'LOW', hasShelf: true, color: 'var(--color-olive)' },
    { key: 'eqMid' as const, label: 'MID', hasShelf: false, color: 'var(--color-blue)' },
    { key: 'eqHigh' as const, label: 'HIGH', hasShelf: true, color: 'var(--color-salmon)' },
  ]

  function eqQNorm(q: number): number { return (q - 0.3) / (8.0 - 0.3) }
  function eqQDenorm(v: number): number { return 0.3 + v * (8.0 - 0.3) }
  function eqQDisplay(q: number): string { return q.toFixed(1) }

  function eqFreqDisplay(x: number): string {
    const f = 20 * Math.pow(1000, x)
    return f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${Math.round(f)}`
  }
  function eqGainDisplay(y: number): string {
    const dB = (y - 0.5) * 24
    return `${dB >= 0 ? '+' : ''}${dB.toFixed(1)}`
  }

  function setEqQ(bandKey: 'eqLow' | 'eqMid' | 'eqHigh', v: number) {
    pushUndo('EQ')
    const q = Math.round(eqQDenorm(v) * 10) / 10
    fxPad[bandKey].q = q
  }
  function setEqX(bandKey: 'eqLow' | 'eqMid' | 'eqHigh', v: number) {
    pushUndo('EQ')
    fxPad[bandKey].x = v
  }
  function setEqY(bandKey: 'eqLow' | 'eqMid' | 'eqHigh', v: number) {
    pushUndo('EQ')
    fxPad[bandKey].y = v
  }
  function toggleEqShelf(bandKey: 'eqLow' | 'eqHigh') {
    pushUndo('Toggle EQ shelf')
    fxPad[bandKey].shelf = !fxPad[bandKey].shelf
  }
  function getEqShelf(bandKey: 'eqLow' | 'eqMid' | 'eqHigh'): boolean {
    if (bandKey === 'eqMid') return false
    return (fxPad[bandKey] as { shelf?: boolean }).shelf ?? false
  }
  function toggleEqOn(bandKey: 'eqLow' | 'eqMid' | 'eqHigh') {
    pushUndo('Toggle EQ band')
    fxPad[bandKey].on = !fxPad[bandKey].on
  }
</script>

<span class="section-label">EQ CONTROLS</span>
<div class="eq-dock-grid">
  {#each EQ_BANDS as band}
    {@const pad = fxPad[band.key]}
    {@const shelf = getEqShelf(band.key)}
    <div class="eq-dock-band" class:disabled={!pad.on} style:--fx-color={band.color}>
      <button
        class="eq-dock-toggle"
        class:active={pad.on}
        aria-pressed={pad.on}
        onpointerdown={() => toggleEqOn(band.key)}
        data-tip="Toggle {band.label} EQ band" data-tip-ja="{band.label} EQバンド切替"
      >{band.label}{shelf ? ' SH' : ''}</button>
      <div class="eq-dock-knobs">
        <span data-tip="Frequency" data-tip-ja="周波数">
          <Knob
            value={pad.x}
            label="FREQ"
            size={36}
            displayValue={eqFreqDisplay(pad.x)}
            onchange={v => setEqX(band.key, v)}
          />
        </span>
        <span data-tip="Gain (dB)" data-tip-ja="ゲイン (dB)">
          <Knob
            value={pad.y}
            label="GAIN"
            size={36}
            displayValue={eqGainDisplay(pad.y)}
            onchange={v => setEqY(band.key, v)}
          />
        </span>
        <span data-tip="Q (resonance) — scroll wheel on EQ node also works" data-tip-ja="Q (レゾナンス) — EQノード上のスクロールでも変更可能">
          <Knob
            value={eqQNorm(pad.q ?? 1.5)}
            label="Q"
            size={36}
            displayValue={eqQDisplay(pad.q ?? 1.5)}
            onchange={v => setEqQ(band.key, v)}
          />
        </span>
      </div>
      {#if band.hasShelf}
        <button
          class="btn-shelf"
          class:active={shelf}
          aria-pressed={shelf}
          onpointerdown={() => toggleEqShelf(band.key as 'eqLow' | 'eqHigh')}
          data-tip={shelf ? 'Switch to peaking EQ' : 'Switch to shelf EQ'}
          data-tip-ja={shelf ? 'ピーキングEQに切替' : 'シェルフEQに切替'}
        >{shelf ? 'SHELF' : 'PEAK'}</button>
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
  .eq-dock-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 6px;
  }
  .eq-dock-band {
    padding: 6px 8px;
    border: 1px solid var(--dz-border);
    border-radius: 0;
  }
  .eq-dock-band.disabled {
    opacity: 0.35;
  }
  .eq-dock-toggle {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 1px 6px;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-transport-border);
    cursor: pointer;
    border-radius: 0;
    margin-bottom: 4px;
  }
  .eq-dock-toggle.active {
    background: var(--fx-color);
    border-color: var(--fx-color);
    color: var(--color-bg);
  }
  .eq-dock-knobs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .btn-shelf {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    border: 1px solid var(--dz-border);
    background: transparent;
    color: var(--dz-transport-border);
    cursor: pointer;
    border-radius: 0;
  }
  .btn-shelf.active {
    background: var(--fx-color);
    border-color: var(--fx-color);
    color: var(--color-bg);
  }
</style>
