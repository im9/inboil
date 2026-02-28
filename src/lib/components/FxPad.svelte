<script lang="ts">
  import { fxPad, ui, pattern, setTrackSend } from '../state.svelte.ts'
  import { engine } from '../audio/engine.ts'
  import { TAP_THRESHOLD, PAD_INSET, COLORS_RGB } from '../constants.ts'
  import Knob from './Knob.svelte'

  const track = $derived(pattern.tracks[ui.selectedTrack])

  const nodes = [
    { key: 'verb'     as const, label: 'VERB', color: 'var(--color-olive)',  tip: 'Reverb — adds space and depth', tipJa: 'リバーブ — 空間と奥行きを付加' },
    { key: 'delay'    as const, label: 'DLY',  color: 'var(--color-blue)',   tip: 'Delay — rhythmic echo repeats', tipJa: 'ディレイ — リズミカルなエコー' },
    { key: 'glitch'   as const, label: 'GLT',  color: 'var(--color-salmon)', tip: 'Glitch — stutter and slice effects', tipJa: 'グリッチ — スタッター/スライスエフェクト' },
    { key: 'granular' as const, label: 'GRN',  color: 'var(--color-purple)', tip: 'Granular — texture and grain effects', tipJa: 'グラニュラー — テクスチャ/粒子エフェクト' },
  ]

  let padEl: HTMLDivElement
  let dragging: typeof nodes[number]['key'] | null = $state(null)
  let dragMoved = false
  let startPos = { x: 0, y: 0 }

  function startDrag(e: PointerEvent, key: typeof nodes[number]['key']) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragging = key
    dragMoved = false
    startPos = { x: e.clientX, y: e.clientY }
  }

  function toNorm(e: PointerEvent): { x: number; y: number } | null {
    if (!padEl) return null
    const rect = padEl.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD_INSET) / (rect.width  - PAD_INSET * 2)))
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top - PAD_INSET) / (rect.height - PAD_INSET * 2)))
    return { x, y }
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
        fxPad[dragging].x = pos.x
        fxPad[dragging].y = pos.y
      }
    }
  }

  function endDrag() {
    if (!dragging) return
    // Tap (no drag) → toggle on/off
    if (!dragMoved) fxPad[dragging].on = !fxPad[dragging].on
    dragging = null
  }

  // ── Audio Visualizer ──────────────────────────────────────────────
  let canvasEl: HTMLCanvasElement
  let animFrameId: number | null = null
  let freqData: Uint8Array<ArrayBuffer> | null = null

  const ROWS = 18
  const COLS = 32
  const colors = [COLORS_RGB.olive, COLORS_RGB.blue, COLORS_RGB.salmon, COLORS_RGB.purple]

  function draw() {
    const analyser = engine.getAnalyser()
    if (!canvasEl) { animFrameId = requestAnimationFrame(draw); return }
    if (!analyser) { animFrameId = requestAnimationFrame(draw); return }

    const ctx = canvasEl.getContext('2d')!
    const w = canvasEl.clientWidth
    const h = canvasEl.clientHeight
    if (w === 0 || h === 0) { animFrameId = requestAnimationFrame(draw); return }

    const dpr = window.devicePixelRatio || 1
    if (canvasEl.width !== w * dpr || canvasEl.height !== h * dpr) {
      canvasEl.width = w * dpr
      canvasEl.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (!freqData) freqData = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(freqData)

    ctx.clearRect(0, 0, w, h)

    const binCount = freqData.length

    for (let row = 0; row < ROWS; row++) {
      const depth = row / (ROWS - 1)
      const alpha = 0.06 + depth * 0.28
      const amplitude = 8 + depth * 45
      const yBase = h * 0.88 - depth * h * 0.58
      const xScale = 0.3 + depth * 0.7

      ctx.beginPath()
      for (let col = 0; col < COLS; col++) {
        const t = col / (COLS - 1)
        const binIdx = Math.floor(t * binCount * 0.75)
        const val = freqData[binIdx] / 255
        const x = w * 0.5 + (t - 0.5) * w * xScale
        const y = yBase - val * amplitude
        if (col === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }

      const cIdx = Math.min(3, Math.floor(depth * 4))
      const c = colors[cIdx]
      ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
      ctx.lineWidth = 0.5 + depth * 1.5
      if (depth > 0.7) {
        ctx.shadowBlur = 4
        ctx.shadowColor = `rgba(${c.r}, ${c.g}, ${c.b}, 0.3)`
      } else {
        ctx.shadowBlur = 0
      }
      ctx.stroke()
    }
    ctx.shadowBlur = 0

    animFrameId = requestAnimationFrame(draw)
  }

  function startVis() {
    if (animFrameId !== null) return
    draw()
  }

  function stopVis() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
  }

  $effect(() => {
    if (ui.view === 'fx') startVis()
    else stopVis()
    return () => stopVis()
  })
</script>

<div class="fx-view">
  <div
    class="fx-pad"
    role="application"
    bind:this={padEl}
    onpointermove={onMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    data-tip="Tap node to toggle, drag to adjust" data-tip-ja="ノードをタップでON/OFF、ドラッグで調整"
  >
    <!-- Audio visualizer canvas -->
    <canvas bind:this={canvasEl} class="visualizer"></canvas>

    <!-- Grid lines -->
    <div class="grid-lines" aria-hidden="true">
      <div class="grid-line h" style="bottom: 25%"></div>
      <div class="grid-line h" style="bottom: 50%"></div>
      <div class="grid-line h" style="bottom: 75%"></div>
      <div class="grid-line v" style="left: 25%"></div>
      <div class="grid-line v" style="left: 50%"></div>
      <div class="grid-line v" style="left: 75%"></div>
    </div>

    <!-- Nodes -->
    {#each nodes as node}
      {@const state = fxPad[node.key]}
      <button
        class="fx-node"
        class:on={state.on}
        class:dragging={dragging === node.key}
        style="
          left: calc({PAD_INSET}px + {state.x} * (100% - {PAD_INSET * 2}px));
          bottom: calc({PAD_INSET}px + {state.y} * (100% - {PAD_INSET * 2}px));
          --node-color: {node.color};
        "
        onpointerdown={e => startDrag(e, node.key)}
        data-tip={node.tip}
        data-tip-ja={node.tipJa}
      >
        <span class="node-label">{node.label}</span>
      </button>
    {/each}
  </div>

  <!-- Per-track send mixer -->
  <div class="sends-bar">
    <div class="track-dots" data-tip="Select track for send mix" data-tip-ja="センドミックスのトラックを選択">
      {#each pattern.tracks as _t, i}
        <button
          class="dot"
          class:active={i === ui.selectedTrack}
          onpointerdown={() => { ui.selectedTrack = i }}
          aria-label="Track {i + 1}"
        ></button>
      {/each}
    </div>
    <span class="send-track-name">{track.name}</span>
    <div class="send-sep" aria-hidden="true"></div>
    <span data-tip="Reverb send amount" data-tip-ja="リバーブセンド量">
    <Knob
      value={track.reverbSend}
      label="VERB"
      size={28}
      onchange={v => setTrackSend(ui.selectedTrack, 'reverbSend', v)}
    />
    </span>
    <span data-tip="Delay send amount" data-tip-ja="ディレイセンド量">
    <Knob
      value={track.delaySend}
      label="DLY"
      size={28}
      onchange={v => setTrackSend(ui.selectedTrack, 'delaySend', v)}
    />
    </span>
    <span data-tip="Glitch send amount" data-tip-ja="グリッチセンド量">
    <Knob
      value={track.glitchSend}
      label="GLT"
      size={28}
      onchange={v => setTrackSend(ui.selectedTrack, 'glitchSend', v)}
    />
    </span>
    <span data-tip="Granular send amount" data-tip-ja="グラニュラーセンド量">
    <Knob
      value={track.granularSend}
      label="GRN"
      size={28}
      onchange={v => setTrackSend(ui.selectedTrack, 'granularSend', v)}
    />
    </span>
    <div class="send-sep" aria-hidden="true"></div>
    <span data-tip="Stereo panning" data-tip-ja="ステレオパン">
    <Knob
      value={(track.pan + 1) / 2}
      label="PAN"
      size={28}
      onchange={v => { pattern.tracks[ui.selectedTrack].pan = v * 2 - 1 }}
    />
    </span>
  </div>
</div>

<style>
  .fx-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .fx-pad {
    flex: 1;
    position: relative;
    background: var(--color-fg);
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  /* ── Visualizer canvas ── */
  .visualizer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  /* ── Grid ── */
  .grid-lines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }
  .grid-line {
    position: absolute;
    background: rgba(237,232,220,0.06);
  }
  .grid-line.h {
    left: 0; right: 0;
    height: 1px;
  }
  .grid-line.v {
    top: 0; bottom: 0;
    width: 1px;
  }

  /* ── Nodes ── */
  .fx-node {
    position: absolute;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    transform: translate(-50%, 50%);  /* center on (left, bottom) */
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
  .fx-node.dragging {
    cursor: grabbing;
    transform: translate(-50%, 50%) scale(1.25);
    z-index: 3;
    box-shadow: 0 0 24px color-mix(in srgb, var(--node-color) 50%, transparent);
  }
  .fx-node.on {
    background: var(--node-color);
    color: var(--color-bg);
    box-shadow: 0 0 16px color-mix(in srgb, var(--node-color) 40%, transparent);
  }
  .fx-node.on.dragging {
    box-shadow: 0 0 28px color-mix(in srgb, var(--node-color) 60%, transparent);
  }

  .node-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    pointer-events: none;
  }

  /* ── Sends bar ── */
  .sends-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--color-fg);
    border-top: 1px solid rgba(237,232,220,0.08);
    flex-shrink: 0;
  }
  .track-dots {
    display: flex;
    gap: 5px;
    flex-shrink: 0;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1px solid rgba(237,232,220,0.35);
    background: transparent;
    padding: 0;
  }
  .dot.active {
    background: var(--color-olive);
    border-color: var(--color-olive);
  }
  .send-track-name {
    font-size: 9px;
    font-weight: 700;
    color: rgba(237,232,220,0.55);
    letter-spacing: 0.06em;
    min-width: 36px;
    flex-shrink: 0;
  }
  .send-sep {
    width: 1px;
    height: 24px;
    background: rgba(237,232,220,0.1);
    flex-shrink: 0;
  }
</style>
