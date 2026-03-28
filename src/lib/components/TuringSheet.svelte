<script lang="ts">
  import type { TuringParams } from '../types.ts'
  import { song, ui, playback, pushUndo } from '../state.svelte.ts'
  import { sceneUpdateGenerativeParams, sceneSetSeed, autoGenerateFromNode, findTargetPatternNode } from '../sceneActions.ts'
  import GenSheetCommon from './GenSheetCommon.svelte'
  import { turingSimulate } from '../generative.ts'
  import type { TuringStepSnapshot } from '../generative.ts'

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const { onclose }: { onclose: () => void } = $props()

  const nodeId = $derived(ui.turingNodeId)
  const node = $derived(nodeId ? song.scene.nodes.find(n => n.id === nodeId) : null)
  const gen = $derived(node?.generative)
  const params = $derived(gen?.params as TuringParams | undefined)

  // Derive step count from target pattern cell
  const targetSteps = $derived.by(() => {
    if (!node?.generative || !nodeId) return 16
    const patNode = findTargetPatternNode(nodeId)
    if (!patNode?.patternId) return 16
    const pat = song.patterns.find(p => p.id === patNode.patternId)
    if (!pat) return 16
    const trackIdx = node.generative.targetTrack ?? 0
    const cell = pat.cells.find(c => c.trackId === trackIdx)
    return cell?.steps ?? 16
  })

  // Simulate the Turing Machine to get register snapshots
  const snapshots = $derived.by((): TuringStepSnapshot[] => {
    if (!params) return []
    return turingSimulate(params, targetSteps, gen?.seed)
  })

  // Playback step — follows generative chain to find target pattern
  const currentStep = $derived.by(() => {
    if (!playback.playing || !node?.generative || !nodeId) return -1
    const patNode = findTargetPatternNode(nodeId)
    if (!patNode?.patternId) return -1
    const pat = song.patterns.find(p => p.id === patNode.patternId)
    if (!pat) return -1
    const trackIdx = node.generative.targetTrack ?? 0
    return playback.playheads[trackIdx] ?? -1
  })

  // Display snapshot: current playback step or step 0
  const displaySnap = $derived(
    currentStep >= 0 && snapshots[currentStep] ? snapshots[currentStep] : snapshots[0]
  )

  // Display register: follows playhead during playback, otherwise step 0
  const displayReg = $derived(displaySnap?.register ?? (snapshots.length > 0 ? snapshots[0].register : []))

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
  const RING_R = 120
  const RING_CX = 155
  const RING_CY = 155
  const BIT_R = 14

  function bitPos(idx: number, total: number): { x: number; y: number } {
    const angle = (idx / total) * Math.PI * 2 - Math.PI / 2 // start from top
    return {
      x: RING_CX + RING_R * Math.cos(angle),
      y: RING_CY + RING_R * Math.sin(angle),
    }
  }

  // ── Output history ──
  const BAR_W = 18
  const BAR_GAP = 4
  const BAR_MAX_H = 64
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
    <GenSheetCommon {nodeId} />
  </div>

  <!-- Register ring + output history side by side -->
  <div class="t-main">
    <!-- SVG Register Ring -->
    <div class="t-ring">
      <svg width="310" height="310" viewBox="0 0 310 310">
        <!-- Ring circle (guide) -->
        <circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none" stroke="var(--color-fg)" stroke-width="0.5" opacity="0.15" />
        <!-- Read head: small triangle well above bit 0 -->
        <polygon points="{RING_CX},{RING_CY - RING_R - BIT_R - 12} {RING_CX - 4},{RING_CY - RING_R - BIT_R - 6} {RING_CX + 4},{RING_CY - RING_R - BIT_R - 6}"
          fill="var(--color-fg)" opacity="0.3" />
        <!-- Bits -->
        {#each displayReg as bit, idx}
          {@const pos = bitPos(idx, displayReg.length)}
          {@const isMutated = currentStep < 0 && displaySnap?.mutatedBit === idx}
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
          <text x={pos.x} y={pos.y + 4.5} class="bit-label">{bit}</text>
        {/each}
        <!-- Center info -->
        <text x={RING_CX} y={RING_CY - 8} class="ring-info">{displaySnap?.value.toFixed(2) ?? '—'}</text>
        <text x={RING_CX} y={RING_CY + 14} class="ring-note" class:playing={currentStep >= 0}>
          {displaySnap ? NOTE_NAMES[displaySnap.note % 12] + String(Math.floor(displaySnap.note / 12)) : '—'}
        </text>
      </svg>
    </div>

    <!-- Output History -->
    <div class="t-history">
      <svg width={histWidth} height={BAR_MAX_H + 20} viewBox="0 0 {histWidth} {BAR_MAX_H + 20}">
        {#each snapshots as snap, i}
          {@const h = snap.active ? Math.max(3, snap.value * BAR_MAX_H) : 3}
          <rect
            x={i * (BAR_W + BAR_GAP)} y={BAR_MAX_H - h + 4}
            width={BAR_W} height={h}
            rx="2"
            class="hist-bar"
            class:active={snap.active}
            class:rest={!snap.active}
            class:playing={i === currentStep}
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
    fill: var(--color-olive);
    stroke: var(--color-olive);
  }
  .bit-off {
    fill: transparent;
    stroke: var(--color-olive);
    opacity: 0.35;
  }
  .bit-mutated {
    fill: var(--color-salmon);
    stroke: var(--color-salmon);
    opacity: 1;
  }
  .bit-label {
    font-family: var(--font-data);
    font-size: 10px; font-weight: 700;
    fill: var(--color-bg);
    text-anchor: middle;
    pointer-events: none; user-select: none;
  }
  /* bit-label fill handled by parent circle opacity */
  .ring-info {
    font-family: var(--font-data);
    font-size: 20px; font-weight: 700;
    fill: var(--color-fg);
    text-anchor: middle;
  }
  .ring-note {
    font-family: var(--font-data);
    font-size: 14px; font-weight: 700;
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
  .hist-bar.playing {
    fill: #fff;
    opacity: 1;
    stroke: var(--color-fg);
    stroke-width: 0.5;
  }
  .hist-bar.rest {
    fill: var(--color-fg);
    opacity: 0.08;
  }
  .ring-note.playing {
    font-weight: 900;
  }
  .hist-label {
    font-family: var(--font-data);
    font-size: 9px;
    fill: var(--color-fg);
    text-anchor: middle;
    opacity: 0.4;
  }
</style>
