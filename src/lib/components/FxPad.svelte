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

  const WAVE_PTS = 48    // waveform sample points per line
  const colors = [COLORS_RGB.olive, COLORS_RGB.blue, COLORS_RGB.salmon, COLORS_RGB.purple]

  // Per-band frequency ranges (bin indices) — mapped to each effect's character
  // verb=low-mid(warm), delay=mid(rhythmic), glitch=hi-mid(transients), granular=high(air)
  const BANDS: [number, number][] = [[2, 16], [16, 48], [48, 96], [80, 160]]

  // Smoothed levels (persists across frames for decay)
  let smoothLow = 0
  let smoothAvg = 0
  const smoothBand = [0, 0, 0, 0]  // per-effect band energy

  /** Convert fxPad normalized coords → canvas pixels */
  function nodePos(key: typeof nodes[number]['key'], w: number, h: number) {
    const s = fxPad[key]
    return {
      x: PAD_INSET + s.x * (w - PAD_INSET * 2),
      y: h - PAD_INSET - s.y * (h - PAD_INSET * 2),
    }
  }

  function draw() {
    const analyser = engine.getAnalyser()
    if (!canvasEl) { animFrameId = requestAnimationFrame(draw); return }

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

    // Grab frequency data — per-band + overall
    let rawLow = 0
    let rawAvg = 0
    const rawBand = [0, 0, 0, 0]
    if (analyser) {
      if (!freqData) freqData = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(freqData)
      let sumAll = 0
      for (let i = 0; i < freqData.length; i++) sumAll += freqData[i]
      rawAvg = sumAll / freqData.length / 255
      // Low (kick)
      let sumLow = 0
      for (let i = 0; i < 8; i++) sumLow += freqData[i]
      rawLow = sumLow / 8 / 255
      // Per-effect bands
      for (let b = 0; b < 4; b++) {
        const [lo, hi] = BANDS[b]
        const end = Math.min(hi, freqData.length)
        let s = 0
        for (let i = lo; i < end; i++) s += freqData[i]
        rawBand[b] = s / (end - lo) / 255
      }
    }
    // Smooth: fast attack, slow release
    smoothAvg = rawAvg > smoothAvg ? rawAvg : smoothAvg * 0.90 + rawAvg * 0.10
    smoothLow = rawLow > smoothLow ? rawLow : smoothLow * 0.85 + rawLow * 0.15
    for (let b = 0; b < 4; b++) {
      smoothBand[b] = rawBand[b] > smoothBand[b] ? rawBand[b] : smoothBand[b] * 0.86 + rawBand[b] * 0.14
    }

    // ── Audio-reactive background ──
    // Base: #1E2028 (30,32,40) — only reacts when at least one FX is ON
    let tintR = 0, tintG = 0, tintB = 0, tintCount = 0
    for (let ni = 0; ni < nodes.length; ni++) {
      if (fxPad[nodes[ni].key].on) {
        tintR += colors[ni].r
        tintG += colors[ni].g
        tintB += colors[ni].b
        tintCount++
      }
    }
    let bgR = 30, bgG = 32, bgB = 40
    if (tintCount > 0) {
      const bgBright = smoothLow * 20
      const bgWarm = smoothAvg * 8
      const tintMix = smoothAvg * 0.12
      bgR = Math.min(255, 30 + bgBright + bgWarm + (tintR / tintCount) * tintMix)
      bgG = Math.min(255, 32 + bgBright + bgWarm * 0.5 + (tintG / tintCount) * tintMix)
      bgB = Math.min(255, 40 + bgBright * 0.6 + (tintB / tintCount) * tintMix)
    }
    ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`
    ctx.fillRect(0, 0, w, h)

    const binCount = freqData?.length ?? 0

    // ── Grid lines (audio-reactive) ──
    const gridAlpha = 0.03 + smoothAvg * 0.12 + smoothLow * 0.15
    for (let i = 1; i <= 3; i++) {
      const frac = i * 0.25
      ctx.strokeStyle = `rgba(237, 232, 220, ${gridAlpha})`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(0, h * frac)
      ctx.lineTo(w, h * frac)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(w * frac, 0)
      ctx.lineTo(w * frac, h)
      ctx.stroke()
    }

    // ── Ghost lines (all pairs, very faint) ──
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodePos(nodes[i].key, w, h)
        const b = nodePos(nodes[j].key, w, h)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = `rgba(237, 232, 220, ${0.04 + smoothAvg * 0.04})`
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }

    // ── Active constellation lines (ON pairs, waveform) ──
    const onNodes = nodes.filter(n => fxPad[n.key].on)
    for (let i = 0; i < onNodes.length; i++) {
      for (let j = i + 1; j < onNodes.length; j++) {
        const a = nodePos(onNodes[i].key, w, h)
        const b = nodePos(onNodes[j].key, w, h)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len < 1) continue
        const px = -dy / len
        const py =  dx / len
        const ci = nodes.indexOf(onNodes[i])
        const cj = nodes.indexOf(onNodes[j])
        // Drive line energy from the stronger of the two nodes' bands
        const lineEnergy = Math.max(smoothBand[ci], smoothBand[cj])
        const amp = len * 0.10 * lineEnergy
        const alpha = 0.20 + lineEnergy * 0.60
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        grad.addColorStop(0, `rgba(${colors[ci].r}, ${colors[ci].g}, ${colors[ci].b}, ${alpha})`)
        grad.addColorStop(1, `rgba(${colors[cj].r}, ${colors[cj].g}, ${colors[cj].b}, ${alpha})`)

        ctx.beginPath()
        for (let p = 0; p <= WAVE_PTS; p++) {
          const t = p / WAVE_PTS
          const lx = a.x + dx * t
          const ly = a.y + dy * t
          const binIdx = Math.floor(t * (binCount - 1) * 0.8)
          const val = freqData ? freqData[binIdx] / 255 : 0
          const taper = Math.sin(t * Math.PI)
          const offset = val * amp * taper
          const fx = lx + px * offset
          const fy = ly + py * offset
          if (p === 0) ctx.moveTo(fx, fy)
          else ctx.lineTo(fx, fy)
        }
        ctx.strokeStyle = grad
        ctx.lineWidth = 1 + lineEnergy * 3
        ctx.stroke()
      }
    }

    // ── Per-effect node animations (canvas, band-driven) ──
    for (let ni = 0; ni < nodes.length; ni++) {
      const node = nodes[ni]
      const state = fxPad[node.key]
      if (!state.on) continue
      const pos = nodePos(node.key, w, h)
      const c = colors[ni]
      const band = smoothBand[ni]
      const intensity = Math.sqrt(state.x * state.x + state.y * state.y) / Math.SQRT2

      // intensity drives base size; band drives audio-reactive scaling
      // Use intensity^0.5 to exaggerate difference between low/high param positions
      const intPow = intensity * intensity  // quadratic: low values shrink fast

      switch (node.key) {
        case 'verb': {
          // Wide breathing glow — low-mid energy
          const r = 30 + intPow * 90 + band * 120
          const a = 0.05 + intPow * 0.15 + band * 0.50
          const grd = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r)
          grd.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`)
          grd.addColorStop(0.3, `rgba(${c.r}, ${c.g}, ${c.b}, ${a * 0.5})`)
          grd.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`)
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'delay': {
          // Echo rings expanding outward — mid energy
          const ringCount = 3 + Math.floor(intPow * 4)
          for (let ri = 0; ri < ringCount; ri++) {
            const phase = (band * 1.2 + ri / ringCount) % 1
            const rr = 24 + phase * (50 + intPow * 80) + band * 30
            const ra = (0.08 + intPow * 0.20 + band * 0.55) * (1 - phase * 0.5)
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, rr, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${ra})`
            ctx.lineWidth = 1 + intPow * 2 + band * 3
            ctx.stroke()
          }
          break
        }
        case 'glitch': {
          // Erratic jitter — hi-mid transients
          const jScale = 12 + intPow * 40
          const jx = (Math.random() - 0.5) * band * jScale
          const jy = (Math.random() - 0.5) * band * jScale
          const r = 20 + intPow * 60 + band * 90
          const a = 0.05 + intPow * 0.15 + band * 0.60
          const grd = ctx.createRadialGradient(pos.x + jx, pos.y + jy, 0, pos.x + jx, pos.y + jy, r)
          grd.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`)
          grd.addColorStop(0.6, `rgba(${c.r}, ${c.g}, ${c.b}, ${a * 0.3})`)
          grd.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`)
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(pos.x + jx, pos.y + jy, r, 0, Math.PI * 2)
          ctx.fill()
          // Secondary flash on transient peaks
          if (band > 0.4) {
            const fr = 15 + intPow * 25 + band * 40
            ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${(band - 0.4) * 0.7})`
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, fr, 0, Math.PI * 2)
            ctx.fill()
          }
          break
        }
        case 'granular': {
          // Scattered grains — high frequency shimmer
          const count = 5 + Math.floor(intPow * 20 + band * 30)
          const spread = 15 + intPow * 55 + band * 40
          for (let g = 0; g < count; g++) {
            const angle = (g / count) * Math.PI * 2 + smoothAvg * 6
            const dist = spread * (0.3 + Math.random() * 0.7)
            const gx = pos.x + Math.cos(angle) * dist
            const gy = pos.y + Math.sin(angle) * dist
            const gr = 0.8 + Math.random() * (1.5 + intPow * 3) + band * 2
            ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${0.10 + intPow * 0.25 + band * 0.55})`
            ctx.beginPath()
            ctx.arc(gx, gy, gr, 0, Math.PI * 2)
            ctx.fill()
          }
          // Central glow
          const r = 20 + intPow * 50 + band * 60
          const a = 0.04 + intPow * 0.10 + band * 0.30
          const grd = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r)
          grd.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`)
          grd.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`)
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
          ctx.fill()
          break
        }
      }
    }

    // ── Pulse CSS variable on DOM nodes (kick-driven scale) ──
    const pulse = 1 + smoothLow * 0.45
    padEl?.style.setProperty('--kick-pulse', `${pulse}`)

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

  /* ── Nodes ── */
  .fx-pad {
    --kick-pulse: 1;
  }

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
    transform: translate(-50%, 50%) scale(var(--kick-pulse));
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
