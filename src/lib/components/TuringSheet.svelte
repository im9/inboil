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
    if (params.lock === 1.0) {
      // Unfreeze: restore previous lock, or 0.5 if no saved value
      update({ lock: preFreezelock ?? 0.5 })
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
  const RING_R = 105
  const RING_CX = 125
  const RING_CY = 125
  const len = $derived(params?.length ?? 8)
  const bitR = $derived(Math.min(14, Math.PI * RING_R / Math.max(len, 4) - 2))

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
  const BAR_MAX_H = 100
  const histWidth = $derived(snapshots.length * (BAR_W + BAR_GAP))

  // ── Revolver rotation ──
  const initialReg = $derived(snapshots.length > 0 ? snapshots[0].register : [])
  let cumulativeSteps = $state(0)
  let prevStep = $state(-1)

  $effect(() => {
    if (currentStep < 0) {
      cumulativeSteps = 0
      prevStep = -1
      return
    }
    if (currentStep !== prevStep) {
      cumulativeSteps++
      prevStep = currentStep
    }
  })

  const stepAngle = $derived(360 / len)
  const rotationDeg = $derived(currentStep >= 0 ? cumulativeSteps * stepAngle : 0)
  const readingIdx = $derived(currentStep >= 0 && cumulativeSteps > 0 ? (len - (cumulativeSteps - 1) % len) % len : -1)

  // Clamp length when target steps shrinks
  const lenOptions = [2, 4, 8, 16, 32, 64] as const
  $effect(() => {
    if (params && params.length > targetSteps) {
      const valid = lenOptions.filter(v => v <= targetSteps)
      update({ length: valid[valid.length - 1] ?? 2 })
    }
  })

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

  <!-- Main body: 2-column layout -->
  <div class="t-body">
    <!-- Left: Ring visualization -->
    <div class="t-ring">
      <div class="t-ring-actions">
        <button class="action-btn" class:frozen={params.lock === 1.0} onpointerdown={freeze}>FREEZE</button>
        <button class="action-btn" onpointerdown={roll}>ROLL</button>
      </div>
      <svg viewBox="0 0 250 250">
        <circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none" stroke="var(--color-fg)" stroke-width="0.5" opacity="0.15" />
        <polygon points="{RING_CX},{RING_CY - RING_R - bitR - 10} {RING_CX - 3},{RING_CY - RING_R - bitR - 5} {RING_CX + 3},{RING_CY - RING_R - bitR - 5}"
          fill="var(--color-fg)" opacity="0.3" />
        <g class="bit-ring" style="transform: rotate({rotationDeg}deg); transform-origin: {RING_CX}px {RING_CY}px">
          {#each initialReg as bit, idx}
            {@const pos = bitPos(idx, initialReg.length)}
            {@const isMutated = currentStep < 0 && displaySnap?.mutatedBit === idx}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle
              cx={pos.x} cy={pos.y} r={bitR}
              class="bit-circle"
              class:bit-on={bit === 1 && idx !== readingIdx}
              class:bit-off={bit === 0 && idx !== readingIdx}
              class:bit-mutated={isMutated}
              class:bit-reading={idx === readingIdx}
              role="button" tabindex="-1"
              onpointerdown={toggleBit}
            />
          {/each}
        </g>
        <text x={RING_CX} y={RING_CY - 6} class="ring-info">{displaySnap?.value.toFixed(2) ?? '—'}</text>
        <text x={RING_CX} y={RING_CY + 12} class="ring-note" class:playing={currentStep >= 0}>
          {displaySnap ? NOTE_NAMES[displaySnap.note % 12] + String(Math.floor(displaySnap.note / 12)) : '—'}
        </text>
      </svg>

    </div>

    <!-- Right: Controls -->
    <div class="t-controls">
      <fieldset class="t-group">
        <legend>Parameters</legend>
        <div class="t-row">
          <span class="ctl-label">LEN</span>
          <select class="ctl-select"
            value={params.length}
            onchange={e => update({ length: parseInt((e.target as HTMLSelectElement).value) })}
          >
            {#each [2, 4, 8, 16, 32, 64].filter(v => v <= targetSteps) as v}
              <option value={v} selected={v === params.length}>{v}</option>
            {/each}
          </select>
          <span class="ctl-desc">bits</span>
        </div>
        <div class="t-row">
          <span class="ctl-label">LOCK</span>
          <input class="ctl-slider" type="range" min="0" max="1" step="0.01"
            value={params.lock}
            oninput={e => update({ lock: parseFloat((e.target as HTMLInputElement).value) })}
          />
          <span class="ctl-val">{params.lock.toFixed(2)}</span>
        </div>
        <div class="t-row">
          <span class="ctl-label">DENS</span>
          <input class="ctl-slider" type="range" min="0" max="1" step="0.01"
            value={params.density}
            oninput={e => update({ density: parseFloat((e.target as HTMLInputElement).value) })}
          />
          <span class="ctl-val">{params.density.toFixed(2)}</span>
        </div>
      </fieldset>

      <fieldset class="t-group">
        <legend>Mode</legend>
        <div class="mode-pills">
          {#each ['note', 'gate', 'velocity'] as m}
            <button
              class="mode-pill"
              class:active={params.mode === m}
              onpointerdown={() => update({ mode: m as TuringParams['mode'] })}
            >{m.toUpperCase().slice(0, 3)}</button>
          {/each}
        </div>
        <div class="ctl-desc mode-desc">
          {params.mode === 'note' ? 'bits → pitch' : params.mode === 'gate' ? 'bits → on/off' : 'bits → velocity'}
        </div>
      </fieldset>

      <fieldset class="t-group">
        <legend>Target</legend>
        <GenSheetCommon {nodeId} />
      </fieldset>
    </div>
  </div>

  <!-- Output History (read-only, below) -->
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
{/if}

<style>
  /* ── Layout: header / controls / ring(flex) / history ── */
  .turing-sheet {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
  }

  /* ── Header — 40px ── */
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

  /* ── 2-column body: ring (left) + controls (right) ── */
  .t-body {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  /* ── Left: Ring ── */
  .t-ring {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px;
  }
  .t-ring svg {
    width: 100%;
    height: 100%;
    max-width: 400px;
    max-height: 400px;
  }
  .t-ring-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  /* ── Right: Controls (fixed width) ── */
  .t-controls {
    width: 280px;
    flex-shrink: 0;
    border-left: 1px solid var(--lz-border);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
  }
  .t-group {
    border: 1px solid var(--lz-border);
    padding: 6px 8px;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .t-group legend {
    font-family: var(--font-data);
    font-size: 9px; font-weight: 700;
    letter-spacing: 0.1em;
    opacity: 0.4;
    padding: 0 4px;
  }
  .t-row {
    display: flex; align-items: center; gap: 8px;
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
  .ctl-desc {
    font-family: var(--font-data);
    font-size: 9px;
    opacity: 0.4;
    letter-spacing: 0.02em;
  }
  .ctl-select {
    font-family: var(--font-data);
    font-size: var(--fs-lg); font-weight: 700;
    padding: 1px 4px;
    border: 1px solid var(--lz-border-mid);
    background: transparent; color: inherit;
    cursor: pointer;
  }
  .mode-pills {
    display: flex;
    gap: 4px;
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
  .mode-desc {
    margin-top: 4px;
  }
  .bit-ring {
    transition: transform 200ms ease-out;
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
    fill: var(--color-bg);
    stroke: var(--color-olive);
    stroke-opacity: 0.35;
  }
  .bit-reading {
    fill: var(--color-bg);
    stroke: var(--color-olive);
    stroke-width: 2.5;
    opacity: 1;
  }
  .bit-mutated {
    fill: var(--color-salmon);
    stroke: var(--color-salmon);
    opacity: 1;
  }
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
  .ring-note.playing {
    font-weight: 900;
  }

  /* ── History (read-only, bottom, fixed height) ── */
  .t-history {
    height: 136px;
    flex-shrink: 0;
    border-top: 1px solid var(--lz-border);
    overflow-x: auto;
    padding: 8px 12px;
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
    fill: var(--color-bg);
    opacity: 1;
    stroke: var(--color-fg);
    stroke-width: 0.5;
  }
  .hist-bar.rest {
    fill: var(--color-fg);
    opacity: 0.08;
  }
  .hist-label {
    font-family: var(--font-data);
    font-size: 9px;
    fill: var(--color-fg);
    text-anchor: middle;
    opacity: 0.4;
  }
</style>
