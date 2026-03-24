<script lang="ts">
  import { masterPad, masterLevels, playback, song, pushUndo } from '../state.svelte.ts'
  import { PAD_INSET } from '../constants.ts'
  import { padNorm, movedPastTap } from '../padHelpers.ts'

  type NodeKey = 'comp' | 'duck' | 'ret' | 'sat'

  const nodes: { key: NodeKey; label: string; color: string; xLabel: string; yLabel: string; tip: string; tipJa: string }[] = [
    { key: 'comp', label: 'COMP', color: 'var(--color-olive)',  xLabel: 'THR', yLabel: 'RAT', tip: 'Compressor — X: threshold, Y: ratio', tipJa: 'コンプレッサー — X: スレッショルド, Y: レシオ' },
    { key: 'duck', label: 'DUCK', color: 'var(--color-blue)',   xLabel: 'DPT', yLabel: 'REL', tip: 'Sidechain ducker — X: depth, Y: release', tipJa: 'サイドチェインダッカー — X: 深さ, Y: リリース' },
    { key: 'ret',  label: 'RET',  color: 'var(--color-salmon)', xLabel: 'VRB', yLabel: 'DLY', tip: 'FX returns — X: reverb level, Y: delay level', tipJa: 'FXリターン — X: リバーブレベル, Y: ディレイレベル' },
    { key: 'sat',  label: 'SAT',  color: 'var(--color-purple)', xLabel: 'DRV', yLabel: 'TNE', tip: 'Tape saturator — X: drive, Y: tone', tipJa: 'テープサチュレーター — X: ドライブ, Y: トーン' },
  ]

  // ── Node size based on parameter intensity + audio-reactive pulse ──
  function nodeIntensity(key: NodeKey): number {
    const st = masterPad[key]
    if (!st.on) return 0
    if (key === 'comp') return st.x * st.y  // threshold × ratio
    if (key === 'duck') return st.x          // depth
    if (key === 'sat')  return st.x          // drive
    return (st.x + st.y) / 2                // avg of reverb + delay sends
  }

  function nodeScale(key: NodeKey): number {
    const intensity = nodeIntensity(key)
    // Base scale: 1.0 at min, up to 1.35 at max intensity
    const base = 1 + intensity * 0.35
    // Audio-reactive pulse: subtle throb when playing and ON
    if (playback.playing && masterPad[key].on) {
      const peak = Math.max(masterLevels.peakL, masterLevels.peakR)
      return base + peak * 0.12
    }
    return base
  }

  let padEl: HTMLDivElement
  let dragging: NodeKey | null = $state(null)
  let dragMoved = false
  let startPos = { x: 0, y: 0 }
  let dragRect: DOMRect | null = null

  function toNorm(e: PointerEvent) {
    return dragRect ? padNorm(e, dragRect) : null
  }

  function startDrag(key: NodeKey, e: PointerEvent) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pushUndo('Master pad')
    dragging = key
    dragMoved = false
    startPos = { x: e.clientX, y: e.clientY }
    dragRect = padEl?.getBoundingClientRect() ?? null
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return
    if (!dragMoved && movedPastTap(e, startPos)) dragMoved = true
    if (dragMoved) {
      const pos = toNorm(e)
      if (pos) {
        masterPad[dragging].x = pos.x
        masterPad[dragging].y = pos.y
      }
    }
  }

  function endDrag() {
    if (!dragging) return
    if (!dragMoved) masterPad[dragging].on = !masterPad[dragging].on
    dragging = null
    dragRect = null
  }

  // ── Denormalized display values per node ──
  function nodeValues(key: NodeKey): { xVal: string; yVal: string } {
    const st = masterPad[key]
    if (key === 'comp') return { xVal: `${Math.round((0.1 + st.x * 0.9) * 100)}%`, yVal: `1:${Math.round(1 + st.y * 19)}` }
    if (key === 'duck') return { xVal: `${Math.round(st.x * 100)}%`, yVal: `${Math.round(20 + st.y * 480)}ms` }
    if (key === 'sat')  return { xVal: `${(0.1 + st.x * 2.9).toFixed(1)}`, yVal: `${Math.round(st.y * 100)}%` }
    return { xVal: `${Math.round(st.x * 200)}%`, yVal: `${Math.round(st.y * 200)}%` }
  }

  // Pad-relative percent for crosshair lines
  function pct(v: number): string {
    return `calc(${PAD_INSET}px + ${v} * (100% - ${PAD_INSET * 2}px))`
  }

  // ── VU Meter (vertical dot matrix) ──
  const VU_DOTS = 20  // number of dots per channel
  const VU_DB_MIN = -60
  const VU_DB_MAX = 6   // +6dB headroom above 0dB
  const VU_DB_RANGE = VU_DB_MAX - VU_DB_MIN  // 66dB total
  const VU_0DB_DOT = (0 - VU_DB_MIN) / VU_DB_RANGE * VU_DOTS  // ~18.18

  // Convert linear peak to dot count (0–VU_DOTS)
  function peakToDots(peak: number): number {
    if (peak < 0.001) return 0
    const db = 20 * Math.log10(peak)
    return Math.max(0, Math.min(VU_DOTS, (db - VU_DB_MIN) / VU_DB_RANGE * VU_DOTS))
  }

  // Peak hold with 1.5s decay (in dot units)
  let holdL = $state(0)
  let holdR = $state(0)
  let holdTimerL = 0
  let holdTimerR = 0

  $effect(() => {
    const dL = peakToDots(masterLevels.peakL)
    const dR = peakToDots(masterLevels.peakR)
    if (dL >= holdL) { holdL = dL; holdTimerL = 90 }  // ~1.5s at 60fps
    if (dR >= holdR) { holdR = dR; holdTimerR = 90 }
  })

  // Decay peak hold
  let rafId = 0
  function decayLoop() {
    if (holdTimerL > 0) holdTimerL--
    else holdL = Math.max(0, holdL - 0.4)
    if (holdTimerR > 0) holdTimerR--
    else holdR = Math.max(0, holdR - 0.4)
    rafId = requestAnimationFrame(decayLoop)
  }

  $effect(() => {
    rafId = requestAnimationFrame(decayLoop)
    return () => cancelAnimationFrame(rafId)
  })

  const clipL = $derived(masterLevels.peakL >= 0.95)
  const clipR = $derived(masterLevels.peakR >= 0.95)
  const levelL = $derived(peakToDots(masterLevels.peakL))
  const levelR = $derived(peakToDots(masterLevels.peakR))

  // GR meter: convert linear gain to dot count (inverted: top-down)
  const GR_DOTS = 12
  function grToDots(gr: number): number {
    if (gr >= 1.0) return 0
    const dB = -20 * Math.log10(gr)  // positive dB of reduction
    return Math.min(GR_DOTS, dB / 24 * GR_DOTS)  // 24dB max range
  }
  const grLevel = $derived(grToDots(masterLevels.gr))
  const grIndices = Array.from({ length: GR_DOTS }, (_, i) => i)

  // Dot color: olive (low) → blue (mid) → salmon (0dB) → red (over)
  const CLIP_RED = '#ff4444'
  function dotColor(index: number): string {
    if (index >= VU_0DB_DOT) return CLIP_RED      // above 0dB
    const t = index / VU_0DB_DOT                   // 0–1 within sub-0dB range
    if (t < 0.55) return 'var(--color-olive)'
    if (t < 0.88) return 'var(--color-blue)'
    return 'var(--color-salmon)'
  }

  const dotIndices = Array.from({ length: VU_DOTS }, (_, i) => i)

  // ── BPM-synced beat pulse ──
  const beatDuration = $derived(60 / song.bpm)  // seconds per beat

  // ── Clip state (either channel) ──
  const clipping = $derived(clipL || clipR)

  // ── Level-reactive background glow ──
  // Normalized peak (0–1) mapped to VU color zones
  const peakNorm = $derived(Math.max(masterLevels.peakL, masterLevels.peakR))
  // dB-scaled level for dot threshold matching
  const peakLevel = $derived(peakToDots(peakNorm) / VU_DOTS)

  function padGlowColor(): string {
    if (clipping) return CLIP_RED
    if (peakLevel > 0.85) return 'var(--color-salmon)'
    if (peakLevel > 0.5) return 'var(--color-blue)'
    return 'var(--color-olive)'
  }

  function padGlowIntensity(): number {
    if (!playback.playing) return 0
    if (clipping) return 0.25
    if (peakLevel > 0.85) return 0.12 + (peakLevel - 0.85) * 0.6
    if (peakLevel > 0.5) return 0.06 + (peakLevel - 0.5) * 0.17
    return peakLevel * 0.08
  }

  function padGlowRadius(): number {
    if (clipping) return 85
    if (peakLevel > 0.85) return 70
    if (peakLevel > 0.5) return 55
    return 40
  }
</script>

<div class="master-view">
  <div
    class="master-pad"
    class:playing={playback.playing}
    class:clipping
    role="application"
    bind:this={padEl}
    onpointermove={onMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    style="--beat-dur: {beatDuration}s; --glow-color: {padGlowColor()}; --glow-alpha: {padGlowIntensity()}; --glow-radius: {padGlowRadius()}%;"
  >
    {#each nodes as node}
      {@const st = masterPad[node.key]}
      {@const vals = nodeValues(node.key)}
      {@const isDragging = dragging === node.key}

      <!-- Crosshair lines (visible while dragging or when on) -->
      {#if st.on || isDragging}
        <div
          class="crosshair-h"
          class:dragging={isDragging}
          style="bottom: {pct(st.y)}; --node-color: {node.color};"
        ></div>
        <div
          class="crosshair-v"
          class:dragging={isDragging}
          style="left: {pct(st.x)}; --node-color: {node.color};"
        ></div>
      {/if}

      <!-- Axis value labels (visible while dragging) -->
      {#if isDragging}
        <div class="axis-label axis-x" style="left: {pct(st.x)}; --node-color: {node.color};">
          {node.xLabel} {vals.xVal}
        </div>
        <div class="axis-label axis-y" style="bottom: {pct(st.y)}; --node-color: {node.color};">
          {node.yLabel} {vals.yVal}
        </div>
      {/if}

      <!-- Node -->
      {@const scale = nodeScale(node.key)}
      <button
        class="pad-node"
        class:on={st.on}
        class:active={isDragging}
        style="
          left: {pct(st.x)};
          bottom: {pct(st.y)};
          --node-color: {node.color};
          --node-scale: {isDragging ? scale * 1.15 : scale};
        "
        onpointerdown={(e) => startDrag(node.key, e)}
        data-tip={node.tip}
        data-tip-ja={node.tipJa}
      >
        <span class="node-label">{node.label}</span>
      </button>
    {/each}


    <!-- Static readout (top-left) -->
    <div class="readout">
      {#each nodes as node}
        {@const vals = nodeValues(node.key)}
        <span class="ro-group" style="--node-color: {node.color};">
          <span class="ro-tag">{node.label}</span>
          <span class="ro-label">{node.xLabel}</span><span class="ro-val">{vals.xVal}</span>
          <span class="ro-label">{node.yLabel}</span><span class="ro-val">{vals.yVal}</span>
        </span>
      {/each}
    </div>

    <!-- Vertical dot-matrix VU meters (inside pad, right edge) -->
    <div class="vu-meters" data-tip="Output level meter" data-tip-ja="出力レベルメーター">
      <div class="vu-dot-col">
        <span class="vu-ch">L</span>
        <div class="vu-dot-track vu-dot-track-ref">
          {#each dotIndices as i}
            {@const lit = i < levelL}
            {@const hold = Math.abs(i - holdL) < 0.6 && holdL > 0.5}
            <div
              class="vu-dot"
              class:lit
              class:hold
              class:clip={lit && i >= VU_0DB_DOT}
              style="--dot-color: {dotColor(i)};"
            ></div>
          {/each}
        </div>
      </div>
      <div class="vu-dot-col">
        <span class="vu-ch">R</span>
        <div class="vu-dot-track">
          {#each dotIndices as i}
            {@const lit = i < levelR}
            {@const hold = Math.abs(i - holdR) < 0.6 && holdR > 0.5}
            <div
              class="vu-dot"
              class:lit
              class:hold
              class:clip={lit && i >= VU_0DB_DOT}
              style="--dot-color: {dotColor(i)};"
            ></div>
          {/each}
        </div>
      </div>
      <!-- GR meter (top-down, orange) -->
      <div class="vu-dot-col gr-col" data-tip="Gain reduction" data-tip-ja="ゲインリダクション">
        <span class="vu-ch">GR</span>
        <div class="vu-dot-track">
          {#each grIndices as i}
            {@const lit = i < grLevel}
            <div
              class="vu-dot gr-dot"
              class:lit
            ></div>
          {/each}
        </div>
      </div>
    </div>
  </div>

</div>

<style>
  .master-view {
    flex: 1;
    display: flex;
    flex-direction: row;
    overflow: hidden;
  }

  .master-pad {
    flex: 1;
    position: relative;
    background: var(--color-fg);
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }
  /* Level-reactive glow (driven by audio peak) */
  .master-pad::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, var(--glow-color, transparent) 0%, transparent var(--glow-radius, 50%));
    opacity: var(--glow-alpha, 0);
    pointer-events: none;
    z-index: 0;
    transition: opacity 80ms linear;
  }
  /* Clip: red flash pulse */
  .master-pad.clipping::after {
    animation: clip-bg-throb 300ms ease-in-out infinite alternate;
  }
  @keyframes clip-bg-throb {
    0%   { opacity: var(--glow-alpha, 0.2); }
    100% { opacity: calc(var(--glow-alpha, 0.2) * 1.6); }
  }
  /* BPM beat tick (subtle overlay) */
  .master-pad.playing::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, var(--dz-divider) 0%, transparent 60%);
    animation: beat-pulse var(--beat-dur, 0.5s) ease-out infinite;
    pointer-events: none;
    z-index: 0;
  }
  @keyframes beat-pulse {
    0%   { opacity: 1; transform: scale(1); }
    15%  { opacity: 0.4; transform: scale(1.02); }
    50%  { opacity: 0; transform: scale(1.04); }
    100% { opacity: 0; transform: scale(1.06); }
  }

  /* ── Crosshair lines ── */
  .crosshair-h, .crosshair-v {
    position: absolute;
    pointer-events: none;
    z-index: 1;
    transition: opacity 120ms;
  }
  .crosshair-h {
    left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--node-color) 15%, transparent) 20%, color-mix(in srgb, var(--node-color) 15%, transparent) 80%, transparent);
    transform: translateY(0.5px);
    opacity: 0.5;
  }
  .crosshair-v {
    top: 0; bottom: 0;
    width: 1px;
    background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--node-color) 15%, transparent) 20%, color-mix(in srgb, var(--node-color) 15%, transparent) 80%, transparent);
    transform: translateX(-0.5px);
    opacity: 0.5;
  }
  .crosshair-h.dragging, .crosshair-v.dragging {
    opacity: 1;
  }

  /* ── Axis value labels (shown during drag) ── */
  .axis-label {
    position: absolute;
    font-size: var(--fs-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
    color: var(--node-color);
    pointer-events: none;
    z-index: 4;
    white-space: nowrap;
    opacity: 0.8;
  }
  .axis-x {
    bottom: 6px;
    transform: translateX(-50%);
  }
  .axis-y {
    right: 8px;
    transform: translateY(50%);
  }

  /* ── Node ── */
  .pad-node {
    position: absolute;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    transform: translate(-50%, 50%) scale(var(--node-scale, 1));
    border: 2px solid var(--node-color);
    background: transparent;
    color: var(--node-color);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    transition: background 120ms ease-out, box-shadow 120ms ease-out, transform 80ms ease-out;
    z-index: 2;
  }
  .pad-node.active {
    cursor: grabbing;
    z-index: 3;
    box-shadow: 0 0 24px color-mix(in srgb, var(--node-color) 50%, transparent);
  }
  .pad-node.on {
    background: var(--node-color);
    color: var(--color-bg);
    box-shadow: 0 0 16px color-mix(in srgb, var(--node-color) 35%, transparent);
  }
  .pad-node.on.active {
    box-shadow: 0 0 32px color-mix(in srgb, var(--node-color) 60%, transparent);
  }

  .node-label {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.08em;
    pointer-events: none;
  }

  /* ── Readout ── */
  .readout {
    position: absolute;
    top: 8px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    z-index: 5;
    pointer-events: none;
    background: var(--lz-text-mid);
    padding: 4px 6px;
    border-radius: 0;
    backdrop-filter: blur(4px);
  }
  .ro-group {
    display: flex;
    gap: 4px;
    align-items: baseline;
  }
  .ro-tag {
    font-size: var(--fs-md);
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--node-color);
    opacity: 0.7;
    min-width: 36px;
  }
  .ro-label {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-transport-border);
  }
  .ro-val {
    font-size: var(--fs-lg);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--dz-text);
    min-width: 36px;
  }

  /* ── Vertical dot-matrix VU (inside pad, right edge) ── */
  .vu-meters {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: 4px;
    z-index: 1;
    pointer-events: none;
  }
  /* 0dB reference: positioned on the L-channel dot track via pseudo-element.
     column-reverse means dot 0 is at bottom, dot 19 at top.
     0dB ≈ dot 18.18 from bottom → ~1.82 dots from top.
     Each dot stride = 8px + 3px gap = 11px. Offset from top ≈ 1.82 × 11 - 4 ≈ 16px */
  .vu-dot-track-ref {
    position: relative;
  }
  .vu-dot-track-ref::before {
    content: '0dB';
    position: absolute;
    top: 16px;
    right: calc(100% + 5px);
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--dz-text-dim);
    line-height: 1;
    white-space: nowrap;
    transform: translateY(-50%);
  }
  .vu-dot-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .vu-ch {
    font-size: var(--fs-sm);
    font-weight: 700;
    color: var(--dz-border-mid);
    order: 1;
  }
  .vu-dot-track {
    display: flex;
    flex-direction: column-reverse;
    gap: 3px;
    align-items: center;
  }
  .vu-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--dot-color) 12%, transparent);
    transition: background 60ms linear;
    flex-shrink: 0;
  }
  .vu-dot.lit {
    background: var(--dot-color);
    box-shadow: 0 0 4px color-mix(in srgb, var(--dot-color) 40%, transparent);
  }
  .vu-dot.hold {
    background: var(--dot-color);
    opacity: 0.7;
  }
  .vu-dot.clip {
    background: var(--color-danger);
    box-shadow: 0 0 8px rgba(255,68,68,0.7);
    animation: clip-throb 200ms ease-in-out infinite alternate;
  }
  @keyframes clip-throb {
    0%   { transform: scale(1); }
    100% { transform: scale(1.4); }
  }
  /* GR meter (orange, top-down) */
  .gr-col { margin-left: 3px; }
  .gr-dot {
    --dot-color: var(--color-salmon);
    background: color-mix(in srgb, var(--color-salmon) 12%, transparent);
  }
  .gr-dot.lit {
    background: var(--color-salmon);
    box-shadow: 0 0 4px color-mix(in srgb, var(--color-salmon) 40%, transparent);
  }
  .master-pad.clipping .vu-ch {
    color: var(--color-danger);
    transition: color 60ms;
  }

</style>
