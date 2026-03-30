<script lang="ts">
  // NOTE: Large file by design — canvas audio-reactive viz + node drag + bubble menu share FX pad state
  import { fxPad, perf, ui, fxFlavours, pushUndo } from '../state.svelte.ts'
  import { captureValue, captureToggle } from '../sweepRecorder.svelte.ts'
  // ui.granularMode2 is now in ui state — accessible from DockFxControls too
  import { engine } from '../audio/engine.ts'
  import { PAD_INSET, COLORS_RGB, FX_FLAVOURS } from '../constants.ts'
  import type { FxFlavourKey } from '../constants.ts'
  import { padNorm, movedPastTap } from '../padHelpers.ts'
  import FxBubbleMenu from './FxBubbleMenu.svelte'

  const nodes = [
    { key: 'verb'     as const, label: 'VERB', color: 'var(--color-olive)',  tip: 'Reverb — adds space and depth', tipJa: 'リバーブ — 空間と奥行きを付加' },
    { key: 'delay'    as const, label: 'DLY',  color: 'var(--color-blue)',   tip: 'Delay — rhythmic echo repeats', tipJa: 'ディレイ — リズミカルなエコー' },
    { key: 'glitch'   as const, label: 'GLT',  color: 'var(--color-salmon)', tip: 'Glitch — stutter and slice effects', tipJa: 'グリッチ — スタッター/スライスエフェクト' },
    { key: 'granular' as const, label: 'GRN',  color: 'var(--color-purple)', tip: 'Granular — drag: size/density, hold+drag: pitch/scatter, hold: hold', tipJa: 'グラニュラー — ドラッグ: サイズ/密度, 長押し+ドラッグ: ピッチ/スキャッタ, 長押し: ホールド' },
  ]

  // REFACTOR-OK: drag lifecycle similar to FilterView/MasterView — unique long-press/hold/bubble-menu logic makes extraction a net-negative
  let padEl: HTMLDivElement
  let dragging: typeof nodes[number]['key'] | null = $state(null)
  let dragMoved = false
  let startPos = { x: 0, y: 0 }
  let dragRect: DOMRect | null = null
  // ui.granularMode2 moved to ui.granularMode2
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let bubbleMenu: { key: FxFlavourKey; pos: { x: number; y: number } } | null = $state(null)
  let bubbleContainerSize = $state({ w: 0, h: 0 })

  function startDrag(e: PointerEvent, key: typeof nodes[number]['key']) {
    e.preventDefault()
    if (bubbleMenu) return  // don't start drag while menu is open
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pushUndo('FX pad')
    dragging = key
    dragMoved = false
    startPos = { x: e.clientX, y: e.clientY }
    dragRect = padEl?.getBoundingClientRect() ?? null
    // Long-press: hold toggle (pad ON) or flavour bubble menu (pad OFF)
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      if (fxPad[key].on) {
        // Pad ON: toggle hold (ADR 121 — unified across all 4 buses)
        const holdKeys = { verb: 'reverbHold', delay: 'delayHold', glitch: 'glitchHold', granular: 'granularHold' } as const
        const hk = holdKeys[key as keyof typeof holdKeys]
        if (hk) {
          perf[hk] = !perf[hk]
          // Sweep recording: capture hold toggle (ADR 123)
          captureToggle({ kind: 'hold', fx: key as 'verb' | 'delay' | 'glitch' | 'granular' }, perf[hk] as boolean)
        }
        dragging = null
        dragRect = null
      } else {
        // Pad OFF: open flavour bubble menu
        const rect = padEl?.getBoundingClientRect()
        if (rect) {
          bubbleContainerSize = { w: rect.width, h: rect.height }
          bubbleMenu = { key, pos: { x: e.clientX - rect.left, y: e.clientY - rect.top } }
        }
        dragging = null
        dragRect = null
      }
    }, 400)
  }

  function toNorm(e: PointerEvent) {
    return dragRect ? padNorm(e, dragRect) : null
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return
    if (!dragMoved && movedPastTap(e, startPos)) {
      dragMoved = true
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    }
    if (dragMoved) {
      const pos = toNorm(e)
      if (pos) {
        if (dragging === 'granular' && ui.granularMode2) {
          perf.granularPitch = pos.x
          perf.granularScatter = pos.y
        } else {
          fxPad[dragging].x = pos.x
          fxPad[dragging].y = pos.y
          // Sweep recording capture (ADR 123)
          const xParam = FX_SWEEP_X[dragging]
          const yParam = FX_SWEEP_Y[dragging]
          if (xParam) captureValue({ kind: 'fx', param: xParam }, pos.x)
          if (yParam) captureValue({ kind: 'fx', param: yParam }, pos.y)
        }
      }
    }
  }

  function endDrag() {
    if (!dragging) return
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    if (!dragMoved) {
      const wasOn = fxPad[dragging].on
      fxPad[dragging].on = !wasOn
      // Sweep recording: capture FX on/off toggle (ADR 123)
      captureToggle({ kind: 'fxOn', fx: dragging as 'verb' | 'delay' | 'glitch' | 'granular' }, !wasOn)
      // Auto-release hold when pad is turned off (ADR 121)
      if (wasOn && nodeHeld(dragging)) {
        const holdKeys = { verb: 'reverbHold', delay: 'delayHold', glitch: 'glitchHold', granular: 'granularHold' } as const
        const hk = holdKeys[dragging as keyof typeof holdKeys]
        if (hk) perf[hk] = false
      }
    }
    dragging = null
    dragRect = null
  }

  // FX pad key → SweepTarget param mapping (ADR 123)
  const FX_SWEEP_X: Record<string, 'reverbWet' | 'delayTime' | 'glitchX' | 'granularSize'> = {
    verb: 'reverbWet', delay: 'delayTime', glitch: 'glitchX', granular: 'granularSize',
  }
  const FX_SWEEP_Y: Record<string, 'reverbDamp' | 'delayFeedback' | 'glitchY' | 'granularDensity'> = {
    verb: 'reverbDamp', delay: 'delayFeedback', glitch: 'glitchY', granular: 'granularDensity',
  }

  function nodeHeld(key: string): boolean {
    if (key === 'verb') return perf.reverbHold
    if (key === 'delay') return perf.delayHold
    if (key === 'glitch') return perf.glitchHold
    if (key === 'granular') return perf.granularHold
    return false
  }

  function pickFlavour(id: string) {
    if (!bubbleMenu) return
    const key = bubbleMenu.key
    // Type-safe assignment per key
    if (key === 'verb')          fxFlavours.verb = id as typeof fxFlavours.verb
    else if (key === 'delay')    fxFlavours.delay = id as typeof fxFlavours.delay
    else if (key === 'glitch')   fxFlavours.glitch = id as typeof fxFlavours.glitch
    else if (key === 'granular') fxFlavours.granular = id as typeof fxFlavours.granular
    bubbleMenu = null
  }

  function closeBubble() { bubbleMenu = null }

  /** Flavour label for a node — always returns current flavour label */
  function flavourLabel(key: FxFlavourKey): string {
    const cur = fxFlavours[key]
    const item = FX_FLAVOURS[key].find((f: { id: string }) => f.id === cur)
    return item?.label ?? key.toUpperCase()
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
    let tintR = 0, tintG = 0, tintB = 0, tintW = 0
    for (let ni = 0; ni < nodes.length; ni++) {
      if (fxPad[nodes[ni].key].on) {
        // VERB drives background brightness; others contribute subtly
        const weight = nodes[ni].key === 'verb' ? 2.0 : 0.5
        tintR += colors[ni].r * weight
        tintG += colors[ni].g * weight
        tintB += colors[ni].b * weight
        tintW += weight
      }
    }
    let bgR = 30, bgG = 32, bgB = 40
    if (tintW > 0) {
      // VERB position drives background brightness; others stay dark
      const verbOn = fxPad.verb.on
      const verbInt = verbOn ? Math.sqrt(fxPad.verb.x ** 2 + fxPad.verb.y ** 2) / Math.SQRT2 : 0
      const brightScale = verbOn ? 0.3 + verbInt * 0.7 : 0.25
      const bgBright = smoothLow * 20 * brightScale
      const bgWarm = smoothAvg * 8 * brightScale
      const tintMix = smoothAvg * (verbOn ? 0.04 + verbInt * 0.10 : 0.04)
      bgR = Math.min(255, 30 + bgBright + bgWarm + (tintR / tintW) * tintMix)
      bgG = Math.min(255, 32 + bgBright + bgWarm * 0.5 + (tintG / tintW) * tintMix)
      bgB = Math.min(255, 40 + bgBright * 0.6 + (tintB / tintW) * tintMix)
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
    const screenR = Math.hypot(w, h)
    const now = performance.now() / 1000

    for (let ni = 0; ni < nodes.length; ni++) {
      const node = nodes[ni]
      const state = fxPad[node.key]
      if (!state.on) continue
      const pos = nodePos(node.key, w, h)
      const c = colors[ni]
      const band = smoothBand[ni]
      const intensity = Math.sqrt(state.x * state.x + state.y * state.y) / Math.SQRT2

      // intensity drives base size; band drives audio-reactive scaling
      const intPow = intensity * intensity  // quadratic: low values shrink fast

      switch (node.key) {
        case 'verb': {
          // Wide breathing glow — low-mid energy
          const r = 20 + intPow * 120 + band * 100
          const a = 0.03 + intPow * 0.25 + band * 0.40
          const grd = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r)
          grd.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`)
          grd.addColorStop(0.3, `rgba(${c.r}, ${c.g}, ${c.b}, ${a * 0.5})`)
          grd.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`)
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
          ctx.fill()
          // Fog wash — position drives coverage, audio adds shimmer
          const fogR = screenR * (0.15 + intPow * 0.85)
          const fogA = 0.01 + intPow * 0.25 + band * 0.10
          if (fogA > 0.005) {
            const fog = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, fogR)
            fog.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${fogA})`)
            fog.addColorStop(0.3, `rgba(${c.r}, ${c.g}, ${c.b}, ${fogA * 0.55})`)
            fog.addColorStop(0.7, `rgba(${c.r}, ${c.g}, ${c.b}, ${fogA * 0.15})`)
            fog.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`)
            ctx.fillStyle = fog
            ctx.fillRect(0, 0, w, h)
          }
          // Breathing pulse — swells with audio
          const breathPhase = Math.sin(now * 1.2) * 0.5 + 0.5
          const breathR = screenR * (0.1 + intPow * 0.6) * (0.7 + breathPhase * 0.3 + band * 0.4)
          const breathA = (0.01 + intPow * 0.15 + band * 0.06) * (0.6 + breathPhase * 0.4)
          if (breathA > 0.005) {
            const breath = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, breathR)
            breath.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${breathA})`)
            breath.addColorStop(0.5, `rgba(${c.r}, ${c.g}, ${c.b}, ${breathA * 0.3})`)
            breath.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`)
            ctx.fillStyle = breath
            ctx.fillRect(0, 0, w, h)
          }
          // Room ambient — position dominates
          const roomA = intPow * 0.08 + band * 0.03
          if (roomA > 0.003) {
            ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${roomA})`
            ctx.fillRect(0, 0, w, h)
          }
          break
        }
        case 'delay': {
          // Echo rings — close-range audio-reactive
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
          // Expanding ripples — born, expand outward past screen, fade and die
          const expandRate = 60 + intPow * 200 + band * 100
          const birthInterval = 1 / (1 + intPow * 3)
          const decayRate = 1.8 - intPow * 1.0
          const rippleAlpha = 0.08 + intPow * 0.20 + band * 0.25
          const latestBirth = Math.floor(now / birthInterval) * birthInterval
          for (let ri = 0; ri < 8; ri++) {
            const age = now - (latestBirth - ri * birthInterval)
            const rr = age * expandRate
            if (rr < 4 || rr > screenR * 1.5) continue
            const fade = Math.exp(-age * decayRate)
            if (fade < 0.005) continue
            // Glow band around the ring — fading halo
            const glowW = 8 + fade * (12 + intPow * 20)
            const inner = Math.max(0, rr - glowW)
            const outer = rr + glowW
            const glowA = fade * rippleAlpha * 0.5
            const glow = ctx.createRadialGradient(pos.x, pos.y, inner, pos.x, pos.y, outer)
            glow.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`)
            glow.addColorStop(0.45, `rgba(${c.r}, ${c.g}, ${c.b}, ${glowA})`)
            glow.addColorStop(0.55, `rgba(${c.r}, ${c.g}, ${c.b}, ${glowA})`)
            glow.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`)
            ctx.fillStyle = glow
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, outer, 0, Math.PI * 2)
            ctx.fill()
            // Crisp ring stroke
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, rr, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${fade * rippleAlpha})`
            ctx.lineWidth = fade * (1.5 + intPow * 3)
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
          // Scan lines — broken CRT at high intensity
          const lineCount = Math.floor(intPow * 6 + band * 8)
          for (let li = 0; li < lineCount; li++) {
            const seed = Math.sin(now * 3.7 + li * 127.1) * 0.5 + 0.5
            const ly = seed * h
            const lh = 1 + Math.random() * (2 + intPow * 4)
            const la = (0.03 + intPow * 0.10 + band * 0.18) * (0.3 + Math.random() * 0.7)
            ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${la})`
            ctx.fillRect(0, ly, w, lh)
          }
          break
        }
        case 'granular': {
          // Pollen particles — drifting in wind
          const GA = 2.3998277  // golden angle
          const pollenCount = 60 + Math.floor(intPow * 120 + band * 40)  // 60–220
          const birthGap = 0.06 - intPow * 0.035  // 0.06s→0.025s
          const driftSpeed = 20 + intPow * 90 + band * 45
          const windSpeed = 15 + intPow * 45
          const windAngle = now * 0.13  // slowly rotating wind direction
          const lifetime = 4 + intPow * 9  // 4s→13s
          const pollenAlpha = 0.07 + intPow * 0.18 + band * 0.25
          const latestBirth = Math.floor(now / birthGap) * birthGap

          for (let pi = 0; pi < pollenCount; pi++) {
            const born = latestBirth - pi * birthGap
            const age = now - born
            if (age < 0 || age > lifetime) continue
            const t = age / lifetime
            const fade = Math.sqrt(1 - t)  // stays visible longer, then quick fade

            // Per-particle deterministic variation (no Math.random)
            const seed = (pi * 7 + 3) % 11 / 10  // 0.27–1.0
            const baseAngle = pi * GA + Math.floor(born / birthGap) * 0.381

            // Radial drift from center (varied speed per particle)
            const radialDist = age * driftSpeed * (0.3 + seed * 0.7)

            // Wind push — shared direction, slight per-particle spread
            const wx = age * windSpeed * Math.cos(windAngle + pi * 0.08)
            const wy = age * windSpeed * Math.sin(windAngle + pi * 0.08) * 0.5

            // Sinusoidal wobble — pollen floating feel
            const wFreq = 0.5 + (pi % 7) * 0.2
            const wAmp = 6 + intPow * 18 + t * 20
            const wobX = Math.sin(now * wFreq + pi * 2.3) * wAmp
            const wobY = Math.cos(now * wFreq * 0.65 + pi * 1.7) * wAmp * 0.7

            const px = pos.x + Math.cos(baseAngle) * radialDist + wx + wobX
            const py = pos.y + Math.sin(baseAngle) * radialDist + wy + wobY

            const pr = 0.5 + fade * (1.0 + intPow * 2.2) + band * 1.5
            ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${fade * pollenAlpha})`
            ctx.beginPath()
            ctx.arc(px, py, pr, 0, Math.PI * 2)
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
    if (ui.phraseView === 'fx') startVis()
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
        class:frozen={node.key === 'granular' && perf.granularHold}
        class:mode2={node.key === 'granular' && ui.granularMode2}
        style="
          left: calc({PAD_INSET}px + {state.x} * (100% - {PAD_INSET * 2}px));
          bottom: calc({PAD_INSET}px + {state.y} * (100% - {PAD_INSET * 2}px));
          --node-color: {node.color};
        "
        onpointerdown={e => startDrag(e, node.key)}
        data-tip={node.tip}
        data-tip-ja={node.tipJa}
      >
        <span class="node-label">{nodeHeld(node.key) ? 'HOLD' : node.key === 'granular' && ui.granularMode2 ? 'M2' : flavourLabel(node.key)}</span>
      </button>
    {/each}

    {#if bubbleMenu}
      <FxBubbleMenu
        fxKey={bubbleMenu.key}
        pos={bubbleMenu.pos}
        containerWidth={bubbleContainerSize.w}
        containerHeight={bubbleContainerSize.h}
        onpick={pickFlavour}
        onclose={closeBubble}
      />
    {/if}
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

  .fx-node.frozen {
    border-style: dashed;
    animation: freeze-pulse 2s ease-in-out infinite;
  }
  @keyframes freeze-pulse {
    0%, 100% { box-shadow: 0 0 16px color-mix(in srgb, var(--node-color) 40%, transparent); }
    50% { box-shadow: 0 0 24px color-mix(in srgb, var(--color-blue, #4472b4) 60%, transparent); }
  }
  .fx-node.mode2 {
    border-width: 3px;
  }

  .node-label {
    font-size: var(--fs-md);
    font-weight: 700;
    letter-spacing: 0.1em;
    pointer-events: none;
  }


</style>
