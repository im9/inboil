<script lang="ts">
  import type { TuringParams } from '../types.ts'
  import { song, ui, pushUndo } from '../state.svelte.ts'
  import { sceneUpdateGenerativeParams, sceneSetSeed, autoGenerateFromNode } from '../sceneActions.ts'
  import { turingSimulate } from '../generative.ts'
  import type { TuringStepSnapshot } from '../generative.ts'

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const { onclose }: { onclose: () => void } = $props()

  const nodeId = $derived(ui.turingNodeId)
  const node = $derived(nodeId ? song.scene.nodes.find(n => n.id === nodeId) : null)
  const gen = $derived(node?.generative)
  const params = $derived(gen?.params as TuringParams | undefined)

  // Simulate the Turing Machine to get register snapshots
  const steps = $derived(16) // default view length
  const snapshots = $derived.by((): TuringStepSnapshot[] => {
    if (!params) return []
    return turingSimulate(params, steps, gen?.seed)
  })

  // Current register (step 0's state = initial register)
  const currentReg = $derived(snapshots.length > 0 ? snapshots[0].register : [])

  // FREEZE state tracking
  let preFreezelock = $state<number | null>(null)

  function update(patch: Partial<TuringParams>) {
    if (!nodeId) return
    pushUndo('Update Turing Machine')
    sceneUpdateGenerativeParams(nodeId, patch)
    autoGenerateFromNode(nodeId)
  }

  function freeze() {
    if (!params || !nodeId) return
    if (params.lock === 1.0 && preFreezelock !== null) {
      // Unfreeze: restore previous lock
      update({ lock: preFreezelock })
      preFreezelock = null
    } else {
      preFreezelock = params.lock
      update({ lock: 1.0 })
    }
  }

  function roll() {
    if (!nodeId) return
    pushUndo('Re-roll Turing seed')
    sceneSetSeed(nodeId, Math.floor(Math.random() * 100000))
    autoGenerateFromNode(nodeId)
    preFreezelock = null
  }

  function toggleBit() {
    if (!params || !nodeId || !gen) return
    // Register is deterministic from seed — re-roll to get a different pattern.
    // Direct bit editing would require persistent register state (future).
    roll()
  }

  // ── Ring geometry ──
  const RING_R = 90
  const RING_CX = 120
  const RING_CY = 120
  const BIT_R = 10

  function bitPos(idx: number, total: number): { x: number; y: number } {
    const angle = (idx / total) * Math.PI * 2 - Math.PI / 2 // start from top
    return {
      x: RING_CX + RING_R * Math.cos(angle),
      y: RING_CY + RING_R * Math.sin(angle),
    }
  }

  // ── Output history ──
  const BAR_W = 12
  const BAR_GAP = 2
  const BAR_MAX_H = 48
  const histWidth = $derived(snapshots.length * (BAR_W + BAR_GAP))

  function onkeydown(e: KeyboardEvent) {
    if (e.code === 'Escape') { e.preventDefault(); onclose() }
  }
</script>

<svelte:window {onkeydown} />

{#if params && nodeId}
<div class="turing-sheet">
  <!-- Header -->
  <div class="t-header">
    <span class="t-title">TURING MACHINE</span>
    <span class="t-info">{params.length}×{params.lock.toFixed(2)}</span>
    <button class="t-close" onpointerdown={onclose}>×</button>
  </div>

  <!-- Controls -->
  <div class="t-controls">
    <div class="t-row">
      <span class="ctl-label">LEN</span>
      <span class="ctl-val">{params.length}</span>
      <span class="ctl-label">LOCK</span>
      <input class="ctl-slider" type="range" min="0" max="1" step="0.01"
        value={params.lock}
        oninput={e => update({ lock: parseFloat((e.target as HTMLInputElement).value) })}
      />
      <span class="ctl-val">{params.lock.toFixed(2)}</span>
    </div>
    <div class="t-row">
      <span class="ctl-label">DENS</span>
      <span class="ctl-val">{params.density.toFixed(2)}</span>
      <span class="ctl-label">MODE</span>
      <div class="mode-pills">
        {#each ['note', 'gate', 'velocity'] as m}
          <button
            class="mode-pill"
            class:active={params.mode === m}
            onpointerdown={() => update({ mode: m as TuringParams['mode'] })}
          >{m.toUpperCase().slice(0, 3)}</button>
        {/each}
      </div>
    </div>
    <div class="t-row">
      <button class="action-btn" class:frozen={params.lock === 1.0} onpointerdown={freeze}
        data-tip="Freeze register (lock=1.0)" data-tip-ja="レジスタをフリーズ"
      >{params.lock === 1.0 ? 'THAW' : 'FREEZE'}</button>
      <button class="action-btn" onpointerdown={roll}
        data-tip="Re-randomize seed" data-tip-ja="シードをランダム化"
      >ROLL</button>
    </div>
    <div class="t-row hint">
      <span>tap bit = re-roll · FREEZE = lock pattern · ROLL = new seed</span>
    </div>
  </div>

  <!-- Register ring + output history side by side -->
  <div class="t-main">
    <!-- SVG Register Ring -->
    <div class="t-ring">
      <svg width="240" height="240" viewBox="0 0 240 240">
        <!-- Ring circle (guide) -->
        <circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none" stroke="var(--color-fg)" stroke-width="0.5" opacity="0.15" />
        <!-- Read head indicator at top -->
        <polygon points="{RING_CX},{RING_CY - RING_R - 18} {RING_CX - 5},{RING_CY - RING_R - 10} {RING_CX + 5},{RING_CY - RING_R - 10}"
          fill="var(--color-fg)" opacity="0.4" />
        <!-- Bits -->
        {#each currentReg as bit, idx}
          {@const pos = bitPos(idx, currentReg.length)}
          {@const isMutated = snapshots[0]?.mutatedBit === idx}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <circle
            cx={pos.x} cy={pos.y} r={BIT_R}
            class="bit-circle"
            class:bit-on={bit === 1}
            class:bit-off={bit === 0}
            class:bit-mutated={isMutated}
            role="button" tabindex="-1"
            onpointerdown={toggleBit}
          />
          <text x={pos.x} y={pos.y + 3.5} class="bit-label">{bit}</text>
        {/each}
        <!-- Center info -->
        <text x={RING_CX} y={RING_CY - 6} class="ring-info">{snapshots[0]?.value.toFixed(2) ?? '—'}</text>
        <text x={RING_CX} y={RING_CY + 10} class="ring-note">
          {snapshots[0] ? NOTE_NAMES[snapshots[0].note % 12] + String(Math.floor(snapshots[0].note / 12)) : '—'}
        </text>
      </svg>
    </div>

    <!-- Output History -->
    <div class="t-history">
      <svg width={histWidth} height={BAR_MAX_H + 16} viewBox="0 0 {histWidth} {BAR_MAX_H + 16}">
        {#each snapshots as snap, i}
          {@const h = snap.active ? Math.max(2, snap.value * BAR_MAX_H) : 2}
          <rect
            x={i * (BAR_W + BAR_GAP)} y={BAR_MAX_H - h + 8}
            width={BAR_W} height={h}
            rx="1"
            class="hist-bar"
            class:active={snap.active}
            class:rest={!snap.active}
          />
          <text
            x={i * (BAR_W + BAR_GAP) + BAR_W / 2} y={BAR_MAX_H + 16}
            class="hist-label"
          >{snap.active ? NOTE_NAMES[snap.note % 12] : '·'}</text>
        {/each}
      </svg>
    </div>
  </div>
</div>
{/if}

<style>
  .turing-sheet {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
  }

  /* ── Header ── */
  .t-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--lz-border);
  }
  .t-title {
    font-family: var(--font-data);
    font-size: var(--fs-lg);
    font-weight: 700;
    letter-spacing: 0.12em;
  }
  .t-info {
    font-family: var(--font-data);
    font-size: var(--fs-lg);
    font-weight: 700;
    color: var(--color-olive);
  }
  .t-close {
    width: 24px; height: 24px;
    border: 1px solid var(--color-fg);
    background: transparent; color: inherit;
    font-size: 14px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    margin-left: auto;
  }

  /* ── Controls ── */
  .t-controls {
    padding: 8px 12px;
    border-bottom: 1px solid var(--lz-border);
    display: flex; flex-direction: column; gap: 6px;
  }
  .t-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .t-row.hint {
    opacity: 0.4;
    font-family: var(--font-data);
    font-size: 8px;
  }
  .ctl-label {
    font-family: var(--font-data);
    font-size: var(--fs-md); font-weight: 700;
    letter-spacing: 0.06em; opacity: 0.6;
  }
  .ctl-val {
    font-family: var(--font-data); font-size: var(--fs-lg);
    font-weight: 700; min-width: 28px; text-align: center;
  }
  .ctl-slider {
    width: 80px; height: 16px;
    accent-color: var(--color-olive);
    cursor: pointer;
  }

  .mode-pills {
    display: flex; gap: 3px;
  }
  .mode-pill {
    font-family: var(--font-data);
    font-size: var(--fs-md); font-weight: 700;
    padding: 2px 8px;
    border: 1px solid var(--lz-border-mid);
    background: transparent; color: inherit;
    cursor: pointer; opacity: 0.5;
  }
  .mode-pill.active {
    border-color: var(--color-olive);
    color: var(--color-olive);
    opacity: 1;
  }

  .action-btn {
    font-family: var(--font-data);
    font-size: var(--fs-md); font-weight: 700;
    letter-spacing: 0.06em;
    padding: 3px 12px;
    border: 1px solid var(--lz-border-mid);
    background: transparent; color: inherit;
    cursor: pointer;
  }
  .action-btn:hover { background: var(--lz-bg-hover); }
  .action-btn.frozen {
    border-color: var(--color-blue);
    color: var(--color-blue);
  }

  /* ── Main area ── */
  .t-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 16px;
    overflow: auto;
    flex-wrap: wrap;
  }

  /* ── Register Ring ── */
  .t-ring {
    flex-shrink: 0;
  }
  .bit-circle {
    cursor: pointer;
    stroke-width: 1.5;
    transition: fill 80ms;
    outline: none;
  }
  .bit-circle:focus-visible {
    stroke: var(--color-olive);
    stroke-width: 2.5;
  }
  .bit-on {
    fill: var(--color-fg);
    stroke: var(--color-fg);
  }
  .bit-off {
    fill: transparent;
    stroke: var(--color-fg);
    opacity: 0.35;
  }
  .bit-mutated {
    fill: var(--color-salmon);
    stroke: var(--color-salmon);
    opacity: 1;
  }
  .bit-label {
    font-family: var(--font-data);
    font-size: 8px; font-weight: 700;
    fill: var(--color-bg);
    text-anchor: middle;
    pointer-events: none; user-select: none;
  }
  /* bit-label fill handled by parent circle opacity */
  .ring-info {
    font-family: var(--font-data);
    font-size: 14px; font-weight: 700;
    fill: var(--color-fg);
    text-anchor: middle;
  }
  .ring-note {
    font-family: var(--font-data);
    font-size: 11px; font-weight: 700;
    fill: var(--color-olive);
    text-anchor: middle;
  }

  /* ── Output History ── */
  .t-history {
    overflow-x: auto;
    flex-shrink: 0;
    -webkit-overflow-scrolling: touch;
  }
  .hist-bar {
    transition: fill 80ms;
  }
  .hist-bar.active {
    fill: var(--color-olive);
    opacity: 0.7;
  }
  .hist-bar.rest {
    fill: var(--color-fg);
    opacity: 0.08;
  }
  .hist-label {
    font-family: var(--font-data);
    font-size: 7px;
    fill: var(--color-fg);
    text-anchor: middle;
    opacity: 0.4;
  }
</style>
