<script lang="ts">
  import { fxPad, ui } from '../state.svelte.ts'
  import { engine } from '../audio/engine.ts'
  import { TAP_THRESHOLD, PAD_INSET, COLORS_RGB } from '../constants.ts'
  import TrackSelector from './TrackSelector.svelte'

  let padEl: HTMLDivElement
  let dragging: 'filter' | 'eqLow' | 'eqMid' | 'eqHigh' | null = $state(null)
  let dragMoved = false
  let startPos = { x: 0, y: 0 }

  // ── Node definitions ───────────────────────────────────────────
  const nodes = [
    { key: 'filter' as const, label: () => filtLabel, color: 'var(--color-teal)',   tip: 'Filter — sweep between low-pass and high-pass', tipJa: 'フィルター — ローパスとハイパスをスイープ' },
    { key: 'eqLow'  as const, label: () => fxPad.eqLow.on  ? 'LOW'  : 'OFF', color: 'var(--color-olive)',  tip: 'Low EQ — boost or cut low frequencies', tipJa: '低域EQ — 低音域のブースト/カット' },
    { key: 'eqMid'  as const, label: () => fxPad.eqMid.on  ? 'MID'  : 'OFF', color: 'var(--color-blue)',   tip: 'Mid EQ — boost or cut mid frequencies', tipJa: '中域EQ — 中音域のブースト/カット' },
    { key: 'eqHigh' as const, label: () => fxPad.eqHigh.on ? 'HIGH' : 'OFF', color: 'var(--color-salmon)', tip: 'High EQ — boost or cut high frequencies', tipJa: '高域EQ — 高音域のブースト/カット' },
  ] as const

  const filtLabel = $derived(
    fxPad.filter.on
      ? fxPad.filter.x < 0.4 ? 'LP' : fxPad.filter.x > 0.6 ? 'HP' : 'FLAT'
      : 'OFF'
  )

  function toNorm(e: PointerEvent): { x: number; y: number } | null {
    if (!padEl) return null
    const rect = padEl.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD_INSET) / (rect.width  - PAD_INSET * 2)))
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top - PAD_INSET) / (rect.height - PAD_INSET * 2)))
    return { x, y }
  }

  function startDrag(key: typeof nodes[number]['key'], e: PointerEvent) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragging = key
    dragMoved = false
    startPos = { x: e.clientX, y: e.clientY }
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
    if (!dragMoved) fxPad[dragging].on = !fxPad[dragging].on
    dragging = null
  }

  // ── EQ curve computation (biquad frequency response) ───────────
  const EQ_CURVE_POINTS = 128
  const SR = 44100
  const EQ_Q = 1.5
  const DB_RANGE = 12  // ±12 dB

  // Logarithmic frequency mapping: t ∈ [0,1] → freq ∈ [20, 20000]
  function tToFreq(t: number): number { return 20 * Math.pow(1000, t) }
  function freqToT(f: number): number { return Math.log(f / 20) / Math.log(1000) }

  function peakingResponse(freq: number, centerFreq: number, dBgain: number): number {
    if (dBgain === 0) return 1
    const fc = Math.max(1, Math.min(centerFreq, SR * 0.49))
    const A = Math.pow(10, dBgain / 40)
    const w0 = 2 * Math.PI * fc / SR
    const sinw = Math.sin(w0)
    const cosw = Math.cos(w0)
    const alpha = sinw / (2 * EQ_Q)
    const a0 = 1 + alpha / A
    const b0 = (1 + alpha * A) / a0
    const b1 = (-2 * cosw) / a0
    const b2 = (1 - alpha * A) / a0
    const a1 = b1
    const a2 = (1 - alpha / A) / a0
    const w = 2 * Math.PI * freq / SR
    const cw = Math.cos(w); const c2w = Math.cos(2 * w)
    const sw = Math.sin(w); const s2w = Math.sin(2 * w)
    const numR = b0 + b1 * cw + b2 * c2w
    const numI = -(b1 * sw + b2 * s2w)
    const denR = 1 + a1 * cw + a2 * c2w
    const denI = -(a1 * sw + a2 * s2w)
    return Math.sqrt((numR * numR + numI * numI) / (denR * denR + denI * denI))
  }

  // ── Colors (raw RGB for canvas) ────────────────────────────────
  const COL_OLIVE  = COLORS_RGB.olive
  const COL_BLUE   = COLORS_RGB.blue
  const COL_SALMON = COLORS_RGB.salmon
  const COL_CREAM  = COLORS_RGB.cream

  // ── Grid frequencies & dB labels ───────────────────────────────
  const FREQ_GRID = [50, 100, 200, 500, 1000, 2000, 5000, 10000]
  const FREQ_LABELS: [number, string][] = [[100, '100'], [1000, '1k'], [10000, '10k']]
  const DB_GRID = [-9, -6, -3, 3, 6, 9]
  const DB_LABELS: [number, string][] = [[-12, '-12'], [-6, '-6'], [0, '0dB'], [6, '+6'], [12, '+12']]

  // ── WebGL2 Dot Matrix (background spectrum) ─────────────────────
  let glCanvasEl: HTMLCanvasElement
  let glCtx: WebGL2RenderingContext | null = null
  let glProgram: WebGLProgram | null = null
  let glVao: WebGLVertexArrayObject | null = null
  let glFreqTex: WebGLTexture | null = null
  let glUResolution: WebGLUniformLocation | null = null
  let glUTime: WebGLUniformLocation | null = null
  let glUFreqData: WebGLUniformLocation | null = null
  let glFreqData: Uint8Array<ArrayBuffer> | null = null

  const GL_VERT = `#version 300 es
    in vec2 aPosition;
    out vec2 vUV;
    void main() {
      vUV = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `

  const GL_FRAG = `#version 300 es
    precision mediump float;
    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform sampler2D uFreqData;

    const float COLS = 48.0;
    const float DOT_SPACING = 0.7;

    const vec3 COL_OLIVE  = vec3(0.471, 0.471, 0.271);
    const vec3 COL_BLUE   = vec3(0.267, 0.447, 0.706);
    const vec3 COL_SALMON = vec3(0.910, 0.627, 0.565);
    const vec3 COL_PURPLE = vec3(0.608, 0.420, 0.627);
    const vec3 COL_BG     = vec3(0.118, 0.125, 0.157);

    vec3 freqCol(float t) {
      if (t < 0.333) return mix(COL_OLIVE, COL_BLUE, t / 0.333);
      if (t < 0.666) return mix(COL_BLUE, COL_SALMON, (t - 0.333) / 0.333);
      return mix(COL_SALMON, COL_PURPLE, (t - 0.666) / 0.334);
    }

    void main() {
      float aspect = uResolution.x / uResolution.y;
      vec2 grid = vec2(COLS, COLS / aspect);
      float visibleRows = grid.y;

      vec2 cell = vUV * grid;
      vec2 cellIdx = floor(cell);
      vec2 cellFrac = fract(cell) - 0.5;

      float colNorm = (cellIdx.x + 0.5) / COLS;
      float rowNorm = (cellIdx.y + 0.5) / visibleRows;

      float logFreq = pow(colNorm, 2.0);
      float amplitude = texture(uFreqData, vec2(logFreq, 0.5)).r;

      float lit = step(rowNorm, amplitude);
      float peakDist = amplitude - rowNorm;
      float brightness = lit * (0.4 + 0.6 * smoothstep(0.0, 0.15, peakDist));

      float baseRadius = DOT_SPACING * 0.35;
      float radius = baseRadius + lit * baseRadius * 0.5 * smoothstep(0.0, 0.1, peakDist);

      float dist = length(cellFrac);
      float dot = 1.0 - smoothstep(radius - 0.04, radius + 0.04, dist);

      float dimDot = (1.0 - lit) * 0.06 * (1.0 - smoothstep(baseRadius - 0.02, baseRadius + 0.02, dist));

      vec3 color = freqCol(colNorm);

      float glowRadius = radius * 2.5;
      float glow = lit * 0.15 * smoothstep(0.0, 0.1, peakDist)
                 * (1.0 - smoothstep(radius, glowRadius, dist));

      fragColor = vec4(COL_BG + color * brightness * dot + color * dimDot + color * glow, 1.0);
    }
  `

  function glCompile(g: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const s = g.createShader(type)!
    g.shaderSource(s, src)
    g.compileShader(s)
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) {
      console.error('Shader compile:', g.getShaderInfoLog(s))
      g.deleteShader(s); return null
    }
    return s
  }

  function initGL(): boolean {
    glCtx = glCanvasEl.getContext('webgl2', { antialias: false, alpha: false })
    if (!glCtx) return false
    const g = glCtx

    const vs = glCompile(g, g.VERTEX_SHADER, GL_VERT)
    const fs = glCompile(g, g.FRAGMENT_SHADER, GL_FRAG)
    if (!vs || !fs) return false

    glProgram = g.createProgram()!
    g.attachShader(glProgram, vs); g.attachShader(glProgram, fs)
    g.linkProgram(glProgram)
    if (!g.getProgramParameter(glProgram, g.LINK_STATUS)) return false
    g.deleteShader(vs); g.deleteShader(fs)

    glUResolution = g.getUniformLocation(glProgram, 'uResolution')
    glUTime = g.getUniformLocation(glProgram, 'uTime')
    glUFreqData = g.getUniformLocation(glProgram, 'uFreqData')

    glVao = g.createVertexArray()!
    g.bindVertexArray(glVao)
    const buf = g.createBuffer()!
    g.bindBuffer(g.ARRAY_BUFFER, buf)
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), g.STATIC_DRAW)
    const aPos = g.getAttribLocation(glProgram, 'aPosition')
    g.enableVertexAttribArray(aPos)
    g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0)
    g.bindVertexArray(null)

    glFreqTex = g.createTexture()!
    g.activeTexture(g.TEXTURE0)
    g.bindTexture(g.TEXTURE_2D, glFreqTex)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE)
    g.texImage2D(g.TEXTURE_2D, 0, g.R8, 512, 1, 0, g.RED, g.UNSIGNED_BYTE, null)
    return true
  }

  function destroyGL() {
    if (glCtx && glProgram) {
      glCtx.deleteProgram(glProgram)
      glCtx.deleteTexture(glFreqTex)
      glCtx.deleteVertexArray(glVao)
    }
    glCtx = null; glProgram = null; glFreqTex = null; glVao = null
  }

  const glT0 = performance.now()

  function drawGL(analyser: AnalyserNode) {
    if (!glCtx || !glProgram || !glCanvasEl) return
    const g = glCtx
    const w = glCanvasEl.clientWidth, h = glCanvasEl.clientHeight
    if (w === 0 || h === 0) return
    const dpr = window.devicePixelRatio || 1
    const dw = Math.round(w * dpr), dh = Math.round(h * dpr)
    if (glCanvasEl.width !== dw || glCanvasEl.height !== dh) {
      glCanvasEl.width = dw; glCanvasEl.height = dh
    }
    g.viewport(0, 0, dw, dh)

    if (!glFreqData) glFreqData = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(glFreqData)

    // Zero out near-silent residual to prevent frozen dots after context suspends
    let maxBin = 0
    for (let i = 0; i < glFreqData.length; i++) if (glFreqData[i] > maxBin) maxBin = glFreqData[i]
    if (maxBin < 3) glFreqData.fill(0)

    g.activeTexture(g.TEXTURE0)
    g.bindTexture(g.TEXTURE_2D, glFreqTex)
    g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, glFreqData.length, 1, g.RED, g.UNSIGNED_BYTE, glFreqData)

    g.useProgram(glProgram)
    g.uniform2f(glUResolution, dw, dh)
    g.uniform1f(glUTime, (performance.now() - glT0) / 1000)
    g.uniform1i(glUFreqData, 0)

    g.bindVertexArray(glVao)
    g.drawArrays(g.TRIANGLES, 0, 6)
    g.bindVertexArray(null)
  }

  // ── Canvas 2D EQ overlay ───────────────────────────────────────────
  let canvasEl: HTMLCanvasElement
  let animFrameId: number | null = null

  function draw() {
    const analyser = engine.getAnalyser()

    // Draw WebGL dot matrix (works even without analyser — shows dim grid)
    if (analyser) drawGL(analyser)

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
    ctx.clearRect(0, 0, w, h)

    const padL = PAD_INSET, padR = w - PAD_INSET
    const padT = PAD_INSET, padB = h - PAD_INSET
    const padW = padR - padL
    const padH = padB - padT
    const midY = padT + padH * 0.5

    function fToX(f: number): number { return padL + freqToT(f) * padW }
    function dBToY(dB: number): number { return midY - (dB / DB_RANGE) * (padH * 0.5) }
    function tToX(t: number): number { return padL + t * padW }

    // ── 1. Grid lines ──
    ctx.lineWidth = 1
    for (const f of FREQ_GRID) {
      const x = fToX(f)
      if (x < padL || x > padR) continue
      ctx.beginPath()
      ctx.moveTo(x, padT); ctx.lineTo(x, padB)
      ctx.strokeStyle = `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},0.05)`
      ctx.stroke()
    }
    for (const dB of DB_GRID) {
      const y = dBToY(dB)
      ctx.beginPath()
      ctx.moveTo(padL, y); ctx.lineTo(padR, y)
      ctx.strokeStyle = `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},0.04)`
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(padL, midY); ctx.lineTo(padR, midY)
    ctx.strokeStyle = `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},0.12)`
    ctx.stroke()

    // ── 2. Grid labels ──
    ctx.font = '9px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    for (const [f, label] of FREQ_LABELS) {
      ctx.fillStyle = `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},0.22)`
      ctx.fillText(label, fToX(f), padB + 4)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const [dB, label] of DB_LABELS) {
      ctx.fillStyle = `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},${dB === 0 ? 0.3 : 0.18})`
      ctx.fillText(label, padL - 6, dBToY(dB))
    }

    // ── 3. Individual band curves (colored, subtle) ──
    const eqBands = [
      { state: fxPad.eqLow,  col: COL_OLIVE },
      { state: fxPad.eqMid,  col: COL_BLUE },
      { state: fxPad.eqHigh, col: COL_SALMON },
    ]

    for (const band of eqBands) {
      if (!band.state.on) continue
      const freq = tToFreq(band.state.x)
      const gain = (band.state.y - 0.5) * 24
      if (Math.abs(gain) < 0.1) continue

      const c = band.col
      ctx.beginPath()
      for (let i = 0; i < EQ_CURVE_POINTS; i++) {
        const t = i / (EQ_CURVE_POINTS - 1)
        const f = tToFreq(t)
        const mag = peakingResponse(f, freq, gain)
        const dB = 20 * Math.log10(mag)
        const x = tToX(t)
        const y = dBToY(dB)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.35)`
      ctx.lineWidth = 1
      ctx.stroke()

      // Subtle fill between curve and 0dB
      ctx.beginPath()
      for (let i = 0; i < EQ_CURVE_POINTS; i++) {
        const t = i / (EQ_CURVE_POINTS - 1)
        const f = tToFreq(t)
        const mag = peakingResponse(f, freq, gain)
        const dB = 20 * Math.log10(mag)
        if (i === 0) ctx.moveTo(tToX(t), dBToY(dB))
        else ctx.lineTo(tToX(t), dBToY(dB))
      }
      ctx.lineTo(padR, midY)
      ctx.lineTo(padL, midY)
      ctx.closePath()
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.06)`
      ctx.fill()
    }

    // ── 5. Combined EQ curve (bright, with gradient fill) ──
    const activeBands: { freq: number; gain: number }[] = []
    for (const band of eqBands) {
      if (!band.state.on) continue
      activeBands.push({
        freq: tToFreq(band.state.x),
        gain: (band.state.y - 0.5) * 24,
      })
    }

    if (activeBands.length > 0) {
      const curveX: number[] = []
      const curveY: number[] = []
      for (let i = 0; i < EQ_CURVE_POINTS; i++) {
        const t = i / (EQ_CURVE_POINTS - 1)
        const f = tToFreq(t)
        let totalMag = 1
        for (const b of activeBands) totalMag *= peakingResponse(f, b.freq, b.gain)
        const dB = 20 * Math.log10(totalMag)
        curveX.push(tToX(t))
        curveY.push(dBToY(dB))
      }

      // Gradient fill between curve and 0dB
      ctx.beginPath()
      for (let i = 0; i < EQ_CURVE_POINTS; i++) {
        if (i === 0) ctx.moveTo(curveX[i], curveY[i])
        else ctx.lineTo(curveX[i], curveY[i])
      }
      ctx.lineTo(padR, midY)
      ctx.lineTo(padL, midY)
      ctx.closePath()
      const fillGrad = ctx.createLinearGradient(0, padT, 0, padB)
      fillGrad.addColorStop(0, `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},0.10)`)
      fillGrad.addColorStop(0.5, `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},0.03)`)
      fillGrad.addColorStop(1, `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},0.10)`)
      ctx.fillStyle = fillGrad
      ctx.fill()

      // Bright stroke
      ctx.beginPath()
      for (let i = 0; i < EQ_CURVE_POINTS; i++) {
        if (i === 0) ctx.moveTo(curveX[i], curveY[i])
        else ctx.lineTo(curveX[i], curveY[i])
      }
      ctx.strokeStyle = `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},0.50)`
      ctx.lineWidth = 1.5
      ctx.shadowBlur = 4
      ctx.shadowColor = `rgba(${COL_CREAM.r},${COL_CREAM.g},${COL_CREAM.b},0.2)`
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    animFrameId = requestAnimationFrame(draw)
  }

  function startVis() {
    if (animFrameId !== null) return
    if (!glCtx && glCanvasEl && !initGL()) return
    draw()
  }

  function stopVis() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
  }

  $effect(() => {
    if (ui.view === 'eq') startVis()
    else stopVis()
    return () => { stopVis(); destroyGL() }
  })
</script>

<div class="filt-view">
  <div
    class="filt-pad"
    role="application"
    bind:this={padEl}
    onpointermove={onMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    data-tip="Tap node to toggle, drag to adjust frequency & gain" data-tip-ja="ノードをタップでON/OFF、ドラッグで周波数&ゲインを調整"
  >
    <canvas bind:this={glCanvasEl} class="visualizer gl-layer"></canvas>
    <canvas bind:this={canvasEl} class="visualizer eq-layer"></canvas>

    <!-- All nodes -->
    {#each nodes as node}
      {@const st = fxPad[node.key]}
      <button
        class="filt-node"
        class:on={st.on}
        class:active={dragging === node.key}
        style="
          left: calc({PAD_INSET}px + {st.x} * (100% - {PAD_INSET * 2}px));
          bottom: calc({PAD_INSET}px + {st.y} * (100% - {PAD_INSET * 2}px));
          --node-color: {node.color};
        "
        onpointerdown={(e) => startDrag(node.key, e)}
        data-tip={node.tip}
        data-tip-ja={node.tipJa}
      >
        <span class="node-label">{node.label()}</span>
      </button>
    {/each}
  </div>

  <TrackSelector />
</div>

<style>
  .filt-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .filt-pad {
    flex: 1;
    position: relative;
    background: var(--color-fg);
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  .visualizer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .gl-layer { z-index: 0; }
  .eq-layer { z-index: 1; }

  /* ── Node ── */
  .filt-node {
    position: absolute;
    width: 40px;
    height: 40px;
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
  .filt-node.active {
    cursor: grabbing;
    transform: translate(-50%, 50%) scale(1.15);
    z-index: 3;
    box-shadow: 0 0 24px color-mix(in srgb, var(--node-color) 50%, transparent);
  }
  .filt-node.on {
    background: var(--node-color);
    color: var(--color-bg);
    box-shadow: 0 0 16px color-mix(in srgb, var(--node-color) 35%, transparent);
  }
  .filt-node.on.active {
    box-shadow: 0 0 32px color-mix(in srgb, var(--node-color) 60%, transparent);
  }

  .node-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    pointer-events: none;
  }

</style>
