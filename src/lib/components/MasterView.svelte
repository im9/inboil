<script lang="ts">
  import { masterPad, perf, effects, masterLevels } from '../state.svelte.ts'
  import { TAP_THRESHOLD, PAD_INSET } from '../constants.ts'

  type NodeKey = 'comp' | 'duck' | 'ret'

  const nodes: { key: NodeKey; label: string; color: string; xLabel: string; yLabel: string; tip: string; tipJa: string }[] = [
    { key: 'comp', label: 'COMP', color: 'var(--color-olive)',  xLabel: 'THR', yLabel: 'RAT', tip: 'Compressor — X: threshold, Y: ratio', tipJa: 'コンプレッサー — X: スレッショルド, Y: レシオ' },
    { key: 'duck', label: 'DUCK', color: 'var(--color-blue)',   xLabel: 'DPT', yLabel: 'REL', tip: 'Sidechain ducker — X: depth, Y: release', tipJa: 'サイドチェインダッカー — X: 深さ, Y: リリース' },
    { key: 'ret',  label: 'RET',  color: 'var(--color-salmon)', xLabel: 'VRB', yLabel: 'DLY', tip: 'FX returns — X: reverb level, Y: delay level', tipJa: 'FXリターン — X: リバーブレベル, Y: ディレイレベル' },
  ]

  let padEl: HTMLDivElement
  let dragging: NodeKey | null = $state(null)
  let dragMoved = false
  let startPos = { x: 0, y: 0 }
  let dragRect: DOMRect | null = null

  function toNorm(e: PointerEvent): { x: number; y: number } | null {
    const rect = dragRect
    if (!rect) return null
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD_INSET) / (rect.width  - PAD_INSET * 2)))
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top - PAD_INSET) / (rect.height - PAD_INSET * 2)))
    return { x, y }
  }

  function startDrag(key: NodeKey, e: PointerEvent) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragging = key
    dragMoved = false
    startPos = { x: e.clientX, y: e.clientY }
    dragRect = padEl?.getBoundingClientRect() ?? null
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return
    if (!dragMoved) {
      const dx = Math.abs(e.clientX - startPos.x)
      const dy = Math.abs(e.clientY - startPos.y)
      if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) dragMoved = true
    }
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
    return { xVal: `${Math.round(st.x * 200)}%`, yVal: `${Math.round(st.y * 200)}%` }
  }

  // Pad-relative percent for crosshair lines
  function pct(v: number): string {
    return `calc(${PAD_INSET}px + ${v} * (100% - ${PAD_INSET * 2}px))`
  }

  // ── Fader state ──
  type FaderKey = 'gain' | 'mkp' | 'swg'
  const faders: { key: FaderKey; label: string; tip: string; tipJa: string }[] = [
    { key: 'gain', label: 'GAIN', tip: 'Master output volume', tipJa: 'マスター出力音量' },
    { key: 'mkp',  label: 'MKP',  tip: 'Compressor makeup gain', tipJa: 'コンプレッサーメイクアップゲイン' },
    { key: 'swg',  label: 'SWG',  tip: 'Swing amount (shuffle feel)', tipJa: 'スウィング量 (シャッフル感)' },
  ]

  function getFaderValue(key: FaderKey): number {
    if (key === 'gain') return perf.masterGain
    if (key === 'mkp') return (effects.comp.makeup - 1) / 3
    return perf.swing
  }

  function setFaderValue(key: FaderKey, v: number) {
    if (key === 'gain') perf.masterGain = v
    else if (key === 'mkp') effects.comp.makeup = 1 + v * 3
    else perf.swing = v
  }

  let faderDragging: FaderKey | null = $state(null)
  let faderRect: DOMRect | null = null
  const FADER_PAD = 8

  function faderToNorm(e: PointerEvent): number {
    if (!faderRect) return 0
    return Math.max(0, Math.min(1, 1 - (e.clientY - faderRect.top - FADER_PAD) / (faderRect.height - FADER_PAD * 2)))
  }

  function startFaderDrag(key: FaderKey, e: PointerEvent) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    faderDragging = key
    const track = (e.currentTarget as HTMLElement).querySelector('.fader-track')
    faderRect = track?.getBoundingClientRect() ?? null
    setFaderValue(key, faderToNorm(e))
  }

  function onFaderMove(e: PointerEvent) {
    if (!faderDragging) return
    setFaderValue(faderDragging, faderToNorm(e))
  }

  function endFaderDrag() {
    faderDragging = null
    faderRect = null
  }

  function faderDisplay(key: FaderKey): string {
    const v = getFaderValue(key)
    if (key === 'mkp') return `${(1 + v * 3).toFixed(1)}`
    return `${Math.round(v * 100)}`
  }

  // ── VU Meter ──
  // Convert linear peak to meter width (0–100%), with -60dB floor
  function peakToWidth(peak: number): number {
    if (peak < 0.001) return 0
    const db = 20 * Math.log10(peak)
    return Math.max(0, Math.min(100, (db + 60) / 60 * 100))
  }

  // Peak hold with 1.5s decay
  let holdL = $state(0)
  let holdR = $state(0)
  let holdTimerL = 0
  let holdTimerR = 0

  $effect(() => {
    const wL = peakToWidth(masterLevels.peakL)
    const wR = peakToWidth(masterLevels.peakR)
    if (wL >= holdL) { holdL = wL; holdTimerL = 90 }  // ~1.5s at 60fps
    if (wR >= holdR) { holdR = wR; holdTimerR = 90 }
  })

  // Decay peak hold
  let rafId = 0
  function decayLoop() {
    if (holdTimerL > 0) holdTimerL--
    else holdL = Math.max(0, holdL - 1.2)
    if (holdTimerR > 0) holdTimerR--
    else holdR = Math.max(0, holdR - 1.2)
    rafId = requestAnimationFrame(decayLoop)
  }

  $effect(() => {
    rafId = requestAnimationFrame(decayLoop)
    return () => cancelAnimationFrame(rafId)
  })

  const clipL = $derived(masterLevels.peakL >= 0.99)
  const clipR = $derived(masterLevels.peakR >= 0.99)
</script>

<div class="master-view">
  <div
    class="master-pad"
    role="application"
    bind:this={padEl}
    onpointermove={onMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
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
      <button
        class="pad-node"
        class:on={st.on}
        class:active={isDragging}
        style="
          left: {pct(st.x)};
          bottom: {pct(st.y)};
          --node-color: {node.color};
        "
        onpointerdown={(e) => startDrag(node.key, e)}
        data-tip={node.tip}
        data-tip-ja={node.tipJa}
      >
        <span class="node-label">{node.label}</span>
      </button>
    {/each}

    <!-- VU Meters (bottom of pad) -->
    <div class="vu-meters" data-tip="Output level meter" data-tip-ja="出力レベルメーター">
      <div class="vu-row">
        <span class="vu-ch">L</span>
        <div class="vu-track">
          <div class="vu-fill" class:clip={clipL} style="width: {peakToWidth(masterLevels.peakL)}%;"></div>
          <div class="vu-hold" style="left: {holdL}%;"></div>
        </div>
      </div>
      <div class="vu-row">
        <span class="vu-ch">R</span>
        <div class="vu-track">
          <div class="vu-fill" class:clip={clipR} style="width: {peakToWidth(masterLevels.peakR)}%;"></div>
          <div class="vu-hold" style="left: {holdR}%;"></div>
        </div>
      </div>
    </div>

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
  </div>

  <!-- Fader strip -->
  <div class="fader-strip">
    {#each faders as fader}
      {@const val = getFaderValue(fader.key)}
      {@const active = faderDragging === fader.key}
      <div
        class="fader"
        class:active
        data-tip={fader.tip}
        data-tip-ja={fader.tipJa}
        onpointerdown={(e) => startFaderDrag(fader.key, e)}
        onpointermove={onFaderMove}
        onpointerup={endFaderDrag}
        onpointercancel={endFaderDrag}
      >
        <span class="fader-label">{fader.label}</span>
        <div class="fader-track">
          <div class="fader-fill" style="height: {val * 100}%;"></div>
          <div class="fader-thumb" style="bottom: {val * 100}%;"></div>
        </div>
        <span class="fader-val">{faderDisplay(fader.key)}</span>
      </div>
    {/each}
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
    font-size: 9px;
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
    transform: translate(-50%, 50%);
    border: 2px solid var(--node-color);
    background: transparent;
    color: var(--node-color);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    transition: background 120ms ease-out, box-shadow 120ms ease-out, transform 120ms ease-out;
    z-index: 2;
  }
  .pad-node.active {
    cursor: grabbing;
    transform: translate(-50%, 50%) scale(1.15);
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
    font-size: 10px;
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
    z-index: 1;
    pointer-events: none;
  }
  .ro-group {
    display: flex;
    gap: 4px;
    align-items: baseline;
  }
  .ro-tag {
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--node-color);
    opacity: 0.4;
    min-width: 30px;
  }
  .ro-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: rgba(237,232,220,0.22);
  }
  .ro-val {
    font-size: 9px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgba(237,232,220,0.40);
    min-width: 32px;
  }

  /* ── VU Meters ── */
  .vu-meters {
    position: absolute;
    bottom: 8px;
    left: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    z-index: 1;
    pointer-events: none;
  }
  .vu-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .vu-ch {
    font-size: 7px;
    font-weight: 700;
    color: rgba(237,232,220,0.25);
    width: 8px;
    text-align: right;
  }
  .vu-track {
    flex: 1;
    height: 3px;
    background: rgba(237,232,220,0.06);
    border-radius: 1.5px;
    position: relative;
    overflow: hidden;
  }
  .vu-fill {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    background: rgba(237,232,220,0.25);
    border-radius: 1.5px;
    transition: width 50ms linear;
  }
  .vu-fill.clip {
    background: var(--color-salmon);
  }
  .vu-hold {
    position: absolute;
    top: 0; bottom: 0;
    width: 1px;
    background: rgba(237,232,220,0.50);
    transform: translateX(-0.5px);
  }

  /* ── Fader strip ── */
  .fader-strip {
    display: flex;
    flex-direction: row;
    gap: 0;
    background: var(--color-fg);
    border-left: 1px solid rgba(237,232,220,0.08);
  }

  .fader {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 8px;
    width: 36px;
    touch-action: none;
    user-select: none;
    cursor: ns-resize;
  }

  .fader-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: rgba(237,232,220,0.40);
  }

  .fader-track {
    flex: 1;
    width: 4px;
    background: rgba(237,232,220,0.08);
    border-radius: 2px;
    position: relative;
    min-height: 40px;
    max-height: 120px;
    pointer-events: none;
  }

  .fader-fill {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(237,232,220,0.20);
    border-radius: 2px;
    transition: height 40ms linear;
  }
  .fader.active .fader-fill {
    background: rgba(237,232,220,0.35);
    transition: none;
  }

  .fader-thumb {
    position: absolute;
    left: 50%;
    width: 14px;
    height: 6px;
    transform: translate(-50%, 50%);
    background: rgba(237,232,220,0.65);
    border-radius: 2px;
    transition: bottom 40ms linear;
    pointer-events: none;
  }
  .fader.active .fader-thumb {
    background: rgba(237,232,220,0.90);
    box-shadow: 0 0 8px rgba(237,232,220,0.25);
    transition: none;
  }

  .fader-val {
    font-size: 8px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgba(237,232,220,0.35);
    min-width: 20px;
    text-align: center;
  }
  .fader.active .fader-val {
    color: rgba(237,232,220,0.70);
  }
</style>
