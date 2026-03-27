<script lang="ts">
  // NOTE: Large file by design — Canvas rendering + pointer handlers + reactive state are tightly coupled (same pattern as SceneView/PianoRoll)
  // Sweep editor — dark-zone review/edit overlay (ADR 123 Phase 1)
  // Recording-based input replaces draw palette. Point editing is always active.
  import { song, ui, playback, pushUndo, fxPad, masterPad, perf, playFromNode } from '../state.svelte.ts'
  import { findSweepNodeForPattern, sceneUpdateModifierParams } from '../sceneActions.ts'
  import { sweepRec, armRecording, disarmRecording, stopRecording, findPatternForSweep } from '../sweepRecorder.svelte.ts'

  import { getParamDefs } from '../paramDefs.ts'
  import { evaluateCurve, targetsEqual, isMuteCurve } from '../sweepEval.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import Knob from './Knob.svelte'
  import type { SweepCurve, SweepTarget, SweepToggleTarget, VoiceId } from '../types.ts'

  // ── Sweep node detection (follows playback during scene play) ──
  const activePatIdx = $derived(
    playback.playing && playback.mode === 'scene' && playback.playingPattern != null
      ? playback.playingPattern
      : ui.currentPattern
  )
  const sweepNode = $derived.by(() => {
    const pat = song.patterns[activePatIdx]
    if (!pat) return null
    return findSweepNodeForPattern(pat.id)
  })

  const recState = $derived(sweepRec.sweepNodeId === sweepNode?.id ? sweepRec.state : 'idle')

  const sweepData = $derived(sweepNode?.modifierParams?.sweep ?? { curves: [] })

  // ── Pattern info ──
  const pat = $derived(song.patterns[activePatIdx])
  const patName = $derived(pat?.name || `Pattern ${activePatIdx + 1}`)
  const patColor = $derived(PATTERN_COLORS[pat?.color ?? 0])

  // ── Auto-zoom to recorded range after REC stops ──
  let prevRecState = 'idle'
  $effect(() => {
    const rs = recState
    if (prevRecState === 'recording' && rs === 'idle' && sweepData.curves.length > 0) {
      // Find t extent of all curves
      let minT = 1, maxT = 0
      for (const c of sweepData.curves) {
        for (const p of c.points) {
          if (p.t < minT) minT = p.t
          if (p.t > maxT) maxT = p.t
        }
      }
      const span = maxT - minT
      if (span > 0 && span < 0.8) {
        // Zoom to recorded range with 10% padding
        const pad = span * 0.1
        zoomOverride = { start: Math.max(0, minT - pad), end: Math.min(1, maxT + pad) }
      }
    }
    prevRecState = rs
  })

  // ── Pattern switch flash ──
  let flashPatName = $state('')
  let flashOpacity = $state(0)
  let flashTimer: ReturnType<typeof setTimeout> | null = null
  let prevActivePatIdx = -1

  $effect(() => {
    const idx = activePatIdx
    if (prevActivePatIdx >= 0 && idx !== prevActivePatIdx && playback.playing) {
      flashPatName = song.patterns[idx]?.name || `Pattern ${idx + 1}`
      flashOpacity = 1
      if (flashTimer) clearTimeout(flashTimer)
      flashTimer = setTimeout(() => { flashOpacity = 0; flashTimer = null }, 800)
    }
    prevActivePatIdx = idx
  })

  const { onClose, onstop }: { onClose: () => void; onstop?: () => void } = $props()

  // ── Selected curve/toggle ──
  let selectedCurveIdx = $state<number | null>(null)
  let selectedToggleIdx = $state<number | null>(null)
  const selectedCurve = $derived(selectedCurveIdx !== null ? sweepData.curves[selectedCurveIdx] ?? null : null)

  // ── Canvas state ──
  let canvasEl: HTMLCanvasElement | undefined = $state()
  let canvasW = $state(600)
  let canvasH = $state(200)

  // ── Point editing (always active) ──
  let draggingPointIdx = $state<number | null>(null)
  let selectedPointIdx = $state<number | null>(null) // for knob precision
  let lastClickTime = $state(0)
  let dragging = $state(false)
  const POINT_HIT_RADIUS = 8

  // ── Range selection (trim/splice) ──
  let rangeStart = $state<number | null>(null) // t value
  let rangeEnd = $state<number | null>(null)   // t value
  let rangeDragging = $state(false)
  let rangeDragEdge = $state<'start' | 'end' | null>(null) // for edge drag
  const hasRange = $derived(rangeStart !== null && rangeEnd !== null && Math.abs(rangeEnd - rangeStart) > 0.002)
  const rangeLo = $derived(hasRange ? Math.min(rangeStart!, rangeEnd!) : 0)
  const rangeHi = $derived(hasRange ? Math.max(rangeStart!, rangeEnd!) : 0)

  // ── Zoom state (page-based) ──
  // page=0: full view. page=1: R1. page=1.5: between R1&R2. page=2: R2. etc.
  let scrollPage = $state(0)
  let scrollPageTarget = $state<number | null>(null) // animated target
  let scrollAnimId = 0

  function animateScrollPage() {
    if (scrollPageTarget === null) return
    const diff = scrollPageTarget - scrollPage
    if (Math.abs(diff) < 0.01) {
      scrollPage = scrollPageTarget
      scrollPageTarget = null
      redraw()
      return
    }
    scrollPage += diff * 0.15 // ease toward target
    redraw()
    scrollAnimId = requestAnimationFrame(animateScrollPage)
  }

  function scrollPageTo(target: number) {
    scrollPageTarget = target
    zoomOverride = null
    cancelAnimationFrame(scrollAnimId)
    scrollAnimId = requestAnimationFrame(animateScrollPage)
  }
  // Direct zoom override (auto-zoom, pinch) — null = use scrollPage
  let zoomOverride = $state<{ start: number; end: number } | null>(null)
  const zoomStart = $derived.by(() => {
    if (zoomOverride) return zoomOverride.start
    const rc = repeatCount
    if (scrollPage <= 0 || rc <= 1) return 0
    const p = Math.min(scrollPage, rc)
    if (p < 1) return 0 // interpolating: full view → R1 (start stays at 0 during zoom-in)
    return (p - 1) / rc
  })
  const zoomEnd = $derived.by(() => {
    if (zoomOverride) return zoomOverride.end
    const rc = repeatCount
    if (scrollPage <= 0 || rc <= 1) return 1
    const p = Math.min(scrollPage, rc)
    if (p < 1) return 1 - p * (1 - 1 / rc) // interpolate: 1 → 1/rc
    return p / rc
  })

  // ── Pattern metrics ──
  const repeatCount = $derived.by(() => {
    if (playback.sceneRepeatTotal > 1) return playback.sceneRepeatTotal
    const patId = pat?.id
    if (!patId) return 1
    for (const node of song.scene.nodes) {
      if (node.type !== 'pattern' || node.patternId !== patId) continue
      for (const edge of song.scene.edges) {
        if (edge.to !== node.id) continue
        const src = song.scene.nodes.find(n => n.id === edge.from)
        if (src?.type === 'repeat' && src.modifierParams?.repeat) return src.modifierParams.repeat.count
      }
    }
    return 1
  })
  const stepsPerPattern = $derived(pat ? Math.max(...pat.cells.map(c => c.steps)) : 16)

  // Visible t-range
  const viewStart = $derived(zoomStart)
  const viewEnd = $derived(zoomEnd)
  const viewSpan = $derived(zoomEnd - zoomStart)

  const TIMELINE_H = 22

  // ── Dark-zone canvas colors ──
  const DZ_BG = '#1E2028'
  const DZ_GRID = 'rgba(237,232,220, 0.08)'
  const DZ_GRID_BEAT = 'rgba(237,232,220, 0.12)'
  const DZ_DIVIDER = 'rgba(237,232,220, 0.06)'
  const DZ_TEXT = 'rgba(237,232,220, 0.55)'
  const DZ_TEXT_DIM = 'rgba(237,232,220, 0.35)'
  const DZ_CENTER_LINE = 'rgba(237,232,220, 0.15)'

  // ── Canvas rendering ──

  function tToX(t: number, w: number): number {
    return ((t - viewStart) / viewSpan) * w
  }

  function redraw() {
    if (!canvasEl) return
    const ctx = canvasEl.getContext('2d')
    if (!ctx) return
    const w = canvasW
    const h = canvasH
    const dpr = window.devicePixelRatio || 1
    canvasEl.width = w * dpr
    canvasEl.height = h * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, w, h)

    const rc = repeatCount
    const spp = stepsPerPattern
    const totalSteps = spp * rc
    const isZoomed = viewSpan < 0.99

    // Dark-zone background
    ctx.fillStyle = DZ_BG
    ctx.fillRect(0, 0, w, h)

    // ── Timeline header ──
    ctx.fillStyle = isZoomed ? 'rgba(237,232,220, 0.06)' : 'rgba(237,232,220, 0.03)'
    ctx.fillRect(0, 0, w, TIMELINE_H)
    ctx.strokeStyle = DZ_DIVIDER
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, TIMELINE_H)
    ctx.lineTo(w, TIMELINE_H)
    ctx.stroke()

    // Density: show individual step ticks when zoomed enough
    const pxPerStep = w / (totalSteps * viewSpan)
    const showAllSteps = pxPerStep > 4 // enough room for every step tick
    const showBeats = pxPerStep > 1     // enough room for beat ticks

    // Step tick marks & repeat boundaries
    for (let s = 0; s <= totalSteps; s++) {
      const t = s / totalSteps
      if (t < viewStart - 0.01 || t > viewEnd + 0.01) continue
      const x = tToX(t, w)
      const isBeat = s % 4 === 0
      const isRepeatBoundary = s % spp === 0
      // Repeat boundary lines (full height)
      if (isRepeatBoundary && s > 0) {
        ctx.strokeStyle = DZ_GRID_BEAT
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      // Tick marks in timeline header
      const showTick = showAllSteps || (showBeats && isBeat)
      if (showTick) {
        ctx.strokeStyle = DZ_GRID
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, TIMELINE_H - (isBeat ? 8 : 4))
        ctx.lineTo(x, TIMELINE_H)
        ctx.stroke()
      }
    }

    // Timeline labels — show all visible repeats with step numbers when zoomed
    ctx.fillStyle = DZ_TEXT
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    const firstVisibleR = Math.max(0, Math.floor(viewStart * rc))
    const lastVisibleR = Math.min(rc - 1, Math.floor(viewEnd * rc))
    for (let r = firstVisibleR; r <= lastVisibleR; r++) {
      const rx = tToX(r / rc, w) + 4
      if (rx > -20 && rx < w + 20) {
        ctx.fillText(`R${r + 1}`, rx, 12)
      }
      // Step numbers within repeat (when zoomed enough)
      if (showBeats) {
        for (let s = 4; s < spp; s += 4) {
          const t = (r * spp + s) / totalSteps
          const sx = tToX(t, w)
          if (sx > rx + 20 && sx < w - 10) {
            ctx.fillStyle = DZ_TEXT_DIM
            ctx.fillText(`${s + 1}`, sx + 2, 12)
            ctx.fillStyle = DZ_TEXT
          }
        }
      }
    }

    // ── Drawing area (below timeline) ──
    const drawH = h - TIMELINE_H
    const drawY = TIMELINE_H

    // Grid dots
    ctx.fillStyle = DZ_GRID
    for (let s = 0; s < totalSteps; s++) {
      const showDot = showAllSteps || (showBeats && s % 4 === 0)
      if (!showDot) continue
      const t = s / totalSteps
      if (t < viewStart - 0.01 || t > viewEnd + 0.01) continue
      const x = tToX(t, w)
      for (let gy = 1; gy < 4; gy++) {
        ctx.beginPath()
        ctx.arc(x, drawY + (gy / 4) * drawH, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Clip drawing area
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, drawY, w, drawH)
    ctx.clip()

    // Center line (±0)
    ctx.strokeStyle = DZ_CENTER_LINE
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(0, drawY + drawH / 2)
    ctx.lineTo(w, drawY + drawH / 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Base value indicator for selected curve
    if (selectedCurve && pat) {
      const baseNorm = getBaseValueNormalized(selectedCurve.target)
      if (baseNorm !== null) {
        const baseLabel = `base: ${(baseNorm * 100).toFixed(0)}%`
        ctx.fillStyle = selectedCurve.color
        ctx.globalAlpha = 0.85
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(baseLabel, 6, drawY + 14)
        ctx.globalAlpha = 1.0
      }
    }

    // Playback progress: use interpolated value for smooth 60fps animation
    const isPlaying = playback.playing && rc > 0
    const playProgress = isPlaying ? interpolatedProgress : -1

    // Range selection highlight
    if (hasRange) {
      const x0 = tToX(rangeLo, w)
      const x1 = tToX(rangeHi, w)
      ctx.fillStyle = 'rgba(237,232,220, 0.06)'
      ctx.fillRect(x0, drawY, x1 - x0, drawH)
      // Edge lines
      ctx.strokeStyle = 'rgba(237,232,220, 0.3)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x0, drawY); ctx.lineTo(x0, drawY + drawH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x1, drawY); ctx.lineTo(x1, drawY + drawH); ctx.stroke()
      // Edge drag handles
      const handleH = 16
      const handleY = drawY + drawH / 2 - handleH / 2
      ctx.fillStyle = 'rgba(237,232,220, 0.4)'
      ctx.fillRect(x0 - 2, handleY, 4, handleH)
      ctx.fillRect(x1 - 2, handleY, 4, handleH)
    }

    // Draw all curves (with flash-fade during clear)
    if (clearProgress === null) {
      for (const curve of sweepData.curves) {
        if (isMuteCurve(curve)) continue
        const isActive = selectedCurve && targetsEqual(curve.target, selectedCurve.target)
        drawCurve(ctx, curve, w, drawY, drawH, isActive ? 1.0 : 0.3, playProgress)
      }
    } else {
      const fade = 1 - clearProgress
      for (const curve of sweepData.curves) {
        if (isMuteCurve(curve)) continue
        drawCurve(ctx, curve, w, drawY, drawH, fade)
      }
    }

    ctx.restore()

    // Repaint timeline header
    ctx.fillStyle = DZ_BG
    ctx.fillRect(0, 0, w, TIMELINE_H)
    ctx.fillStyle = isZoomed ? 'rgba(237,232,220, 0.06)' : 'rgba(237,232,220, 0.03)'
    ctx.fillRect(0, 0, w, TIMELINE_H)
    ctx.strokeStyle = DZ_DIVIDER
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, TIMELINE_H)
    ctx.lineTo(w, TIMELINE_H)
    ctx.stroke()
    // Re-draw ticks
    for (let s = 0; s <= totalSteps; s++) {
      const t = s / totalSteps
      if (t < viewStart - 0.01 || t > viewEnd + 0.01) continue
      const x = tToX(t, w)
      const isBeat = s % 4 === 0
      const showTick = showAllSteps || (showBeats && isBeat)
      if (showTick) {
        ctx.strokeStyle = DZ_GRID
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, TIMELINE_H - (isBeat ? 8 : 4))
        ctx.lineTo(x, TIMELINE_H)
        ctx.stroke()
      }
    }
    // Re-draw labels
    ctx.fillStyle = DZ_TEXT
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    for (let r = firstVisibleR; r <= lastVisibleR; r++) {
      const rx = tToX(r / rc, w) + 4
      if (rx > -20 && rx < w + 20) ctx.fillText(`R${r + 1}`, rx, 12)
      if (showBeats) {
        for (let s = 4; s < spp; s += 4) {
          const t2 = (r * spp + s) / totalSteps
          const sx = tToX(t2, w)
          if (sx > rx + 20 && sx < w - 10) {
            ctx.fillStyle = DZ_TEXT_DIM
            ctx.fillText(`${s + 1}`, sx + 2, 12)
            ctx.fillStyle = DZ_TEXT
          }
        }
      }
    }

    // Playback cursor with glow
    if (isPlaying && playProgress >= 0) {
      const cx = tToX(playProgress, w)
      if (cx >= 0 && cx <= w) {
        ctx.save()
        ctx.strokeStyle = '#c47a2a'
        ctx.lineWidth = 2
        ctx.shadowColor = '#c47a2a'
        ctx.shadowBlur = 8
        ctx.globalAlpha = 0.8
        ctx.beginPath()
        ctx.moveTo(cx, TIMELINE_H)
        ctx.lineTo(cx, h)
        ctx.stroke()
        ctx.restore()
        ctx.fillStyle = '#c47a2a'
        ctx.beginPath()
        ctx.arc(cx, TIMELINE_H / 2, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  function drawCurve(ctx: CanvasRenderingContext2D, curve: SweepCurve, w: number, drawY: number, drawH: number, alpha: number, playProgress = -1) {
    if (curve.points.length < 2) return
    const xFor = (t: number) => tToX(t, w)
    const yForV = (v: number) => drawY + (0.5 - v / 2) * drawH
    const midY = drawY + drawH / 2
    const isActive = alpha > 0.5
    const isPlaying = playProgress >= 0
    const pts = curve.points
    const first = pts[0], last = pts[pts.length - 1]

    // Extension lines for partial curves (edit mode only)
    if (isActive && !isPlaying) {
      ctx.strokeStyle = curve.color
      ctx.lineWidth = 1
      ctx.globalAlpha = alpha * 0.3
      ctx.setLineDash([3, 3])
      if (first.t > viewStart) {
        ctx.beginPath()
        ctx.moveTo(xFor(viewStart), yForV(first.v))
        ctx.lineTo(xFor(first.t), yForV(first.v))
        ctx.stroke()
      }
      if (last.t < viewEnd) {
        ctx.beginPath()
        ctx.moveTo(xFor(last.t), yForV(last.v))
        ctx.lineTo(xFor(viewEnd), yForV(last.v))
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1.0
    }

    // Build smooth path using evaluateCurve from sweepEval
    const tracePath = (ctx: CanvasRenderingContext2D) => {
      ctx.moveTo(xFor(first.t), yForV(first.v))
      if (pts.length <= 2) {
        ctx.lineTo(xFor(last.t), yForV(last.v))
      } else {
        const steps = Math.max(pts.length * 8, 40)
        for (let s = 1; s <= steps; s++) {
          const progress = first.t + (s / steps) * (last.t - first.t)
          const v = evaluateCurve(pts, progress)
          ctx.lineTo(xFor(progress), yForV(v))
        }
      }
    }

    const pathFn = (action: 'stroke' | 'fill') => {
      ctx.beginPath()
      if (action === 'fill') {
        ctx.moveTo(xFor(first.t), midY)
        ctx.lineTo(xFor(first.t), yForV(first.v))
      }
      tracePath(ctx)
      if (action === 'fill') {
        ctx.lineTo(xFor(last.t), midY)
        ctx.closePath()
      }
    }

    if (isPlaying) {
      // ── Playback mode: gradient trail — cursor leaves a fading wake ──
      const cursorX = xFor(playProgress)
      const trailPx = w * 0.15 // trail length in pixels

      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      // Dim base: full curve always visible as context
      ctx.strokeStyle = curve.color
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.2
      pathFn('stroke')
      ctx.stroke()

      // Trail gradient: fade in behind cursor, sharp cutoff ahead
      const trailStart = Math.max(0, cursorX - trailPx)
      const fadeAhead = Math.min(w, cursorX + trailPx * 0.15) // very short fade-out ahead
      const gradEnd = Math.max(fadeAhead + 1, cursorX + 2)
      const span = gradEnd - trailStart
      const stopMid = span > 0 ? Math.max(0, Math.min(0.85, (cursorX - trailStart) / span)) : 0
      const stopCut = span > 0 ? Math.max(stopMid, Math.min(0.99, (cursorX - trailStart + 1) / span)) : 0
      const grad = ctx.createLinearGradient(trailStart, 0, gradEnd, 0)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(stopMid, curve.color)
      grad.addColorStop(stopCut, curve.color)
      grad.addColorStop(1, 'rgba(0,0,0,0)')

      // Outer glow pass
      ctx.strokeStyle = grad
      ctx.lineWidth = 6
      ctx.globalAlpha = 0.12
      pathFn('stroke')
      ctx.stroke()

      // Mid pass
      ctx.lineWidth = 3
      ctx.globalAlpha = 0.3
      pathFn('stroke')
      ctx.stroke()

      // White core gradient
      const coreStopMid = span > 0 ? Math.max(0, Math.min(0.9, (cursorX - trailStart) / span)) : 0
      const coreStopCut = span > 0 ? Math.max(coreStopMid, Math.min(0.99, (cursorX - trailStart + 1) / span)) : 0
      const coreGrad = ctx.createLinearGradient(trailStart, 0, gradEnd, 0)
      coreGrad.addColorStop(0, 'rgba(0,0,0,0)')
      coreGrad.addColorStop(coreStopMid, '#fff')
      coreGrad.addColorStop(coreStopCut, '#fff')
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)')

      ctx.strokeStyle = coreGrad
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.7
      pathFn('stroke')
      ctx.stroke()

      // Cursor crossing dot
      if (playProgress >= first.t && playProgress <= last.t) {
        const curveVal = evaluateCurve(pts, playProgress)
        const cy = yForV(curveVal)
        ctx.fillStyle = curve.color
        ctx.globalAlpha = 0.2
        ctx.beginPath(); ctx.arc(cursorX, cy, 6, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = 0.9
        ctx.beginPath(); ctx.arc(cursorX, cy, 2.5, 0, Math.PI * 2); ctx.fill()
      }
    } else {
      // ── Edit mode: subtle glow, point handles ──

      // Neon glow fill
      ctx.save()
      ctx.globalAlpha = alpha * 0.15
      ctx.fillStyle = curve.color
      pathFn('fill')
      ctx.fill()
      ctx.restore()

      // Outer glow stroke
      if (isActive) {
        ctx.save()
        ctx.strokeStyle = curve.color
        ctx.lineWidth = 8
        ctx.globalAlpha = alpha * 0.15
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.shadowColor = curve.color
        ctx.shadowBlur = 12
        pathFn('stroke')
        ctx.stroke()
        ctx.restore()
      }

      // Main stroke
      ctx.strokeStyle = curve.color
      ctx.lineWidth = isActive ? 3 : 1.5
      ctx.globalAlpha = alpha * 0.9
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      pathFn('stroke')
      ctx.stroke()

      // Bright core for active
      if (isActive) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.globalAlpha = alpha * 0.4
        pathFn('stroke')
        ctx.stroke()
      }

      // Anchor dots (point editing)
      if (isActive) {
        for (const p of pts) {
          const px = xFor(p.t)
          if (px < -5 || px > w + 5) continue
          ctx.fillStyle = curve.color
          ctx.globalAlpha = alpha * 0.6
          ctx.beginPath()
          ctx.arc(px, yForV(p.v), 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.globalAlpha = alpha * 0.9
          ctx.beginPath()
          ctx.arc(px, yForV(p.v), 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    ctx.globalAlpha = 1.0
  }

  // ── Target label helpers ──
  function curveLabel(target: SweepTarget): string {
    if (target.kind === 'master') {
      const labels: Record<string, string> = {
        masterVolume: 'Volume', swing: 'Swing', compThreshold: 'Comp thr', compRatio: 'Comp rat',
        duckDepth: 'Duck dep', duckRelease: 'Duck rel', retVerb: 'Ret verb', retDelay: 'Ret dly',
        satDrive: 'Sat drv', satTone: 'Sat tone', filterCutoff: 'Filter freq', filterResonance: 'Filter reso',
      }
      return labels[target.param] ?? target.param
    }
    if (target.kind === 'track') {
      const cell = pat?.cells.find(c => c.trackId === target.trackId)
      const name = cell?.name || `Trk ${target.trackId + 1}`
      return `${name} ${target.param}`
    }
    if (target.kind === 'send') {
      const cell = pat?.cells.find(c => c.trackId === target.trackId)
      const name = cell?.name || `Trk ${target.trackId + 1}`
      const sendLabels: Record<string, string> = { reverbSend: 'verb', delaySend: 'dly', glitchSend: 'glitch', granularSend: 'grain' }
      return `${name} ${sendLabels[target.param] ?? target.param}`
    }
    if (target.kind === 'fx') {
      const labels: Record<string, string> = {
        reverbWet: 'Verb wet', reverbDamp: 'Verb damp', delayTime: 'Dly time', delayFeedback: 'Dly feed',
        glitchX: 'Glitch X', glitchY: 'Glitch Y', granularSize: 'Gran size', granularDensity: 'Gran dens',
      }
      return labels[target.param] ?? target.param
    }
    if (target.kind === 'eq') {
      const bandLabels: Record<string, string> = { eqLow: 'Low', eqMid: 'Mid', eqHigh: 'High' }
      return `${bandLabels[target.band] ?? target.band} ${target.param}`
    }
    return 'Unknown'
  }

  function toggleLabel(target: SweepToggleTarget): string {
    if (target.kind === 'hold') return `${target.fx} hold`
    if (target.kind === 'fxOn') return `${target.fx} on`
    if (target.kind === 'mute') {
      const cell = pat?.cells.find(c => c.trackId === target.trackId)
      return `${cell?.name || `Trk ${target.trackId + 1}`} mute`
    }
    return 'Unknown'
  }

  // ── Base value display ──
  function getBaseValueNormalized(target: SweepTarget): number | null {
    if (!pat) return null
    if (target.kind === 'master') {
      const MASTER_BASE: Record<string, () => number> = {
        masterVolume: () => perf.masterGain, swing: () => perf.swing,
        compThreshold: () => masterPad.comp.x, compRatio: () => masterPad.comp.y,
        duckDepth: () => masterPad.duck.x, duckRelease: () => masterPad.duck.y,
        retVerb: () => masterPad.ret.x, retDelay: () => masterPad.ret.y,
        satDrive: () => masterPad.sat.x, satTone: () => masterPad.sat.y,
        filterCutoff: () => fxPad.filter.x, filterResonance: () => fxPad.filter.y,
      }
      const fn = MASTER_BASE[target.param]
      return fn ? fn() : null
    }
    if (target.kind === 'track') {
      const track = song.tracks.find(t => t.id === target.trackId)
      if (!track) return null
      if (target.param === 'volume') return track.volume
      if (target.param === 'pan') return (track.pan + 1) / 2
      const cell = pat.cells.find(c => c.trackId === target.trackId)
      if (!cell?.voiceId) return null
      const defs = getParamDefs(cell.voiceId as VoiceId)
      const def = defs.find(d => d.key === target.param)
      if (!def) return null
      const val = cell.voiceParams?.[target.param] ?? def.default
      return (val - def.min) / (def.max - def.min)
    }
    if (target.kind === 'send') {
      const cell = pat.cells.find(c => c.trackId === target.trackId)
      if (!cell) return null
      return cell[target.param]
    }
    if (target.kind === 'fx') {
      const FX_BASE: Record<string, [keyof typeof fxPad, string]> = {
        reverbWet: ['verb', 'x'], reverbDamp: ['verb', 'y'],
        delayTime: ['delay', 'x'], delayFeedback: ['delay', 'y'],
        glitchX: ['glitch', 'x'], glitchY: ['glitch', 'y'],
        granularSize: ['granular', 'x'], granularDensity: ['granular', 'y'],
      }
      const m = FX_BASE[target.param]
      if (m) return (fxPad[m[0]] as Record<string, number | boolean>)[m[1]] as number
    }
    if (target.kind === 'eq') {
      const pad = fxPad[target.band]
      const key = target.param === 'freq' ? 'x' : target.param === 'gain' ? 'y' : 'q'
      return key === 'q' ? (pad[key] as number) / 3 : pad[key] as number
    }
    return null
  }

  // ── Pointer handlers (point editing only) ──
  function pointerToNorm(e: PointerEvent): { t: number; v: number } {
    if (!canvasEl) return { t: 0, v: 0 }
    const rect = canvasEl.getBoundingClientRect()
    const timelineH = TIMELINE_H * (rect.height / canvasH)
    const screenT = (e.clientX - rect.left) / rect.width
    const t = Math.max(0, Math.min(1, viewStart + screenT * viewSpan))
    const drawTop = rect.top + timelineH
    const drawHeight = rect.height - timelineH
    const y = (e.clientY - drawTop) / drawHeight
    const v = Math.max(-1, Math.min(1, (0.5 - y) * 2))
    return { t, v }
  }

  function isInTimeline(e: PointerEvent): boolean {
    if (!canvasEl) return false
    const rect = canvasEl.getBoundingClientRect()
    const timelineH = TIMELINE_H * (rect.height / canvasH)
    return (e.clientY - rect.top) < timelineH
  }

  function hitTestPoint(e: PointerEvent): number {
    if (!selectedCurve || !canvasEl) return -1
    const rect = canvasEl.getBoundingClientRect()
    const w = rect.width
    const timelineH = TIMELINE_H * (rect.height / canvasH)
    const drawH = rect.height - timelineH
    for (let i = 0; i < selectedCurve.points.length; i++) {
      const px = tToX(selectedCurve.points[i].t, w)
      const py = (0.5 - selectedCurve.points[i].v / 2) * drawH + timelineH
      const dx = e.clientX - rect.left - px
      const dy = e.clientY - rect.top - py
      if (Math.sqrt(dx * dx + dy * dy) < POINT_HIT_RADIUS) return i
    }
    return -1
  }

  /** Hit-test which curve is near the pointer (for click-to-select) */
  function hitTestCurve(e: PointerEvent): number {
    if (!canvasEl) return -1
    const norm = pointerToNorm(e)
    const HIT_DIST = 0.05 // normalized v distance threshold

    let bestIdx = -1
    let bestDist = HIT_DIST
    for (let ci = 0; ci < sweepData.curves.length; ci++) {
      const curve = sweepData.curves[ci]
      if (isMuteCurve(curve)) continue
      if (curve.points.length < 2) continue
      // Evaluate curve at pointer's t position
      const v = evaluateCurve(curve.points, norm.t)
      const dist = Math.abs(v - norm.v)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = ci
      }
    }
    return bestIdx
  }

  function onPointerDown(e: PointerEvent) {
    if (!canvasEl) return

    // Timeline click → zoom in/out
    if (isInTimeline(e)) {
      e.preventDefault()
      if (viewSpan < 0.99) {
        scrollPageTo(0) // zoom out to full view
      } else {
        const rect = canvasEl.getBoundingClientRect()
        const screenT = (e.clientX - rect.left) / rect.width
        const rc = repeatCount
        const clickedRepeat = Math.max(0, Math.min(rc - 1, Math.floor(screenT * rc)))
        scrollPageTo(clickedRepeat + 1) // zoom to clicked repeat
      }
      redraw()
      return
    }

    canvasEl.setPointerCapture(e.pointerId)

    // Edge drag on existing range
    if (hasRange && selectedCurve) {
      const norm = pointerToNorm(e)
      const edgeThreshold = viewSpan * 0.015
      if (Math.abs(norm.t - rangeLo) < edgeThreshold) {
        rangeDragEdge = 'start'
        rangeDragging = true
        return
      }
      if (Math.abs(norm.t - rangeHi) < edgeThreshold) {
        rangeDragEdge = 'end'
        rangeDragging = true
        return
      }
    }

    // Shift+drag → range selection
    if (e.shiftKey && selectedCurve) {
      const norm = pointerToNorm(e)
      rangeStart = norm.t
      rangeEnd = norm.t
      rangeDragging = true
      rangeDragEdge = null
      selectedPointIdx = null
      return
    }

    // Click outside range → clear range
    if (hasRange && !e.shiftKey) {
      const norm = pointerToNorm(e)
      if (norm.t < rangeLo || norm.t > rangeHi) {
        rangeStart = null
        rangeEnd = null
        redraw()
      }
    }

    // If a curve is selected, try point editing first
    if (selectedCurve) {
      const now = Date.now()
      const hitIdx = hitTestPoint(e)

      // Double-click → delete point
      if (hitIdx >= 0 && now - lastClickTime < 300) {
        lastClickTime = 0
        if (selectedCurve.points.length > 2) {
          pushUndo('Delete sweep point')
          const pts = [...selectedCurve.points]
          pts.splice(hitIdx, 1)
          commitCurve(selectedCurve.target, selectedCurve.color, pts)
          redraw()
        }
        return
      }
      lastClickTime = now

      if (hitIdx >= 0) {
        draggingPointIdx = hitIdx
        selectedPointIdx = hitIdx
        dragging = true
        return
      }
      // Click elsewhere → deselect point
      selectedPointIdx = null

      // Click on the selected curve's line → add new point
      const norm = pointerToNorm(e)
      const v = evaluateCurve(selectedCurve.points, norm.t)
      if (Math.abs(v - norm.v) < 0.08) {
        const pts = [...selectedCurve.points]
        pts.push(norm)
        pts.sort((a, b) => a.t - b.t)
        pushUndo('Add sweep point')
        commitCurve(selectedCurve.target, selectedCurve.color, pts)
        draggingPointIdx = pts.findIndex(p => p.t === norm.t && p.v === norm.v)
        dragging = true
        redraw()
        return
      }
    }

    // Click on a different curve → select it
    const curveIdx = hitTestCurve(e)
    if (curveIdx >= 0) {
      selectedCurveIdx = curveIdx
      selectedToggleIdx = null
      redraw()
    } else {
      // Click on empty space → deselect
      selectedCurveIdx = null
      selectedToggleIdx = null
      redraw()
    }
  }

  function onPointerMove(e: PointerEvent) {
    // Range selection / edge drag
    if (rangeDragging) {
      const norm = pointerToNorm(e)
      if (rangeDragEdge === 'start') {
        rangeStart = Math.min(norm.t, rangeHi)
      } else if (rangeDragEdge === 'end') {
        rangeEnd = Math.max(norm.t, rangeLo)
      } else {
        rangeEnd = norm.t
      }
      redraw()
      return
    }
    if (!dragging || draggingPointIdx === null || !selectedCurve) return
    const norm = pointerToNorm(e)
    const pts = [...selectedCurve.points]
    pts[draggingPointIdx] = norm
    pts.sort((a, b) => a.t - b.t)
    draggingPointIdx = pts.findIndex(p => p.t === norm.t && p.v === norm.v)
    commitCurve(selectedCurve.target, selectedCurve.color, pts)
    redraw()
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    if (!canvasEl) return

    if (e.ctrlKey) {
      // Pinch → free zoom centered on cursor (override page model)
      const rect = canvasEl.getBoundingClientRect()
      const cursorFrac = (e.clientX - rect.left) / rect.width
      const cursorT = viewStart + cursorFrac * viewSpan
      const span = viewSpan
      const zoomDelta = -e.deltaY * 0.01
      const factor = Math.pow(2, zoomDelta)
      const newSpan = Math.max(0.01, Math.min(1, span / factor))
      const newStart = cursorT - cursorFrac * newSpan
      zoomOverride = {
        start: Math.max(0, Math.min(1 - newSpan, newStart)),
        end: Math.max(0, Math.min(1 - newSpan, newStart)) + newSpan,
      }
    } else {
      // Scroll → page through repeats (0=full, 1=R1, 2=R2, ...)
      zoomOverride = null // return to page model
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY)
      scrollPage = Math.max(0, Math.min(repeatCount, scrollPage + delta * 0.008))
    }
    redraw()
  }

  function onKeyDown(e: KeyboardEvent) {
    // Delete/Backspace with range selection → delete points in range
    if ((e.key === 'Delete' || e.key === 'Backspace') && hasRange && selectedCurve) {
      e.preventDefault()
      pushUndo('Delete range')
      const pts = selectedCurve.points.filter(p => p.t < rangeLo || p.t > rangeHi)
      if (pts.length >= 2) {
        commitCurve(selectedCurve.target, selectedCurve.color, pts)
      } else {
        // Not enough points left — delete entire curve
        deleteCurve(selectedCurve.target)
      }
      rangeStart = null
      rangeEnd = null
      selectedPointIdx = null
      redraw()
      return
    }
    // Escape → clear range
    if (e.key === 'Escape' && hasRange) {
      rangeStart = null
      rangeEnd = null
      redraw()
    }
  }

  function onPointerUp(_e: PointerEvent) {
    if (rangeDragging) {
      rangeDragging = false
      rangeDragEdge = null
      return
    }
    draggingPointIdx = null
    dragging = false
  }

  // ── Flash-fade clear effect ──
  let clearProgress = $state<number | null>(null)
  let clearRafId = 0

  function clearAllWithDisintegration() {
    if (!sweepNode || clearProgress !== null) return
    if (sweepData.curves.length === 0 && (!sweepData.toggles || sweepData.toggles.length === 0)) return
    const startTime = performance.now()
    const duration = 350
    const nodeId = sweepNode.id

    function animate() {
      const elapsed = performance.now() - startTime
      clearProgress = Math.min(1, elapsed / duration)
      redraw()
      if (clearProgress < 1) {
        clearRafId = requestAnimationFrame(animate)
      } else {
        pushUndo('Clear all sweep curves')
        sceneUpdateModifierParams(nodeId, { sweep: { curves: [] } })
        if (song.scene.globalSweep) song.scene.globalSweep = undefined
        selectedCurveIdx = null; selectedToggleIdx = null
        clearProgress = null; clearRafId = 0
        redraw()
      }
    }
    clearRafId = requestAnimationFrame(animate)
  }

  // ── Commit curve to sweep data ──
  function commitCurve(target: SweepTarget, color: string, points: { t: number; v: number }[]) {
    if (!sweepNode) return
    const curves = [...sweepData.curves]
    const existingIdx = curves.findIndex(c => targetsEqual(c.target, target))
    const newCurve: SweepCurve = { target, points, color }
    if (existingIdx >= 0) {
      curves[existingIdx] = newCurve
    } else {
      curves.push(newCurve)
    }
    sceneUpdateModifierParams(sweepNode.id, { sweep: { curves, toggles: sweepData.toggles } })
  }

  function deleteCurve(target: SweepTarget) {
    if (!sweepNode) return
    pushUndo('Delete sweep curve')
    const curves = sweepData.curves.filter(c => !targetsEqual(c.target, target))
    sceneUpdateModifierParams(sweepNode.id, { sweep: { curves, toggles: sweepData.toggles } })
    selectedCurveIdx = null
    redraw()
  }

  function deleteToggle(idx: number) {
    if (!sweepNode || !sweepData.toggles) return
    pushUndo('Delete sweep toggle')
    const toggles = sweepData.toggles.filter((_, i) => i !== idx)
    sceneUpdateModifierParams(sweepNode.id, { sweep: { curves: sweepData.curves, toggles: toggles.length > 0 ? toggles : undefined } })
    selectedToggleIdx = null
  }

  // ── Global sweep management (ADR 123 Phase 5) ──
  function deleteGlobalCurve(idx: number) {
    if (!song.scene.globalSweep) return
    pushUndo('Delete global sweep curve')
    const curves = song.scene.globalSweep.curves.filter((_, i) => i !== idx)
    const toggles = song.scene.globalSweep.toggles
    if (curves.length === 0 && (!toggles || toggles.length === 0)) {
      song.scene.globalSweep = undefined
    } else {
      song.scene.globalSweep = { ...song.scene.globalSweep, curves }
    }
  }

  function deleteGlobalToggle(idx: number) {
    if (!song.scene.globalSweep?.toggles) return
    pushUndo('Delete global sweep toggle')
    const toggles = song.scene.globalSweep.toggles.filter((_, i) => i !== idx)
    const curves = song.scene.globalSweep.curves
    if (curves.length === 0 && toggles.length === 0) {
      song.scene.globalSweep = undefined
    } else {
      song.scene.globalSweep = { ...song.scene.globalSweep, toggles: toggles.length > 0 ? toggles : undefined }
    }
  }

  // ── Toggle editing helpers ──
  let toggleDragState = $state<{
    toggleIdx: number
    boundaryIdx: number  // index of the point whose t is being dragged
    side: 'left' | 'right'
  } | null>(null)

  function onToggleBoundaryDown(e: PointerEvent, toggleIdx: number, boundaryIdx: number, side: 'left' | 'right') {
    e.preventDefault()
    e.stopPropagation()
    if (toggleDragState) return // guard against double-initiation
    toggleDragState = { toggleIdx, boundaryIdx, side }
    window.addEventListener('pointermove', onToggleBoundaryMove)
    window.addEventListener('pointerup', onToggleBoundaryUp)
  }

  function onToggleBoundaryMove(e: PointerEvent) {
    if (!toggleDragState || !sweepNode || !sweepData.toggles) return
    const toggle = sweepData.toggles[toggleDragState.toggleIdx]
    if (!toggle) return

    // Convert screen X to t
    const listEl = document.querySelector('.sweep-toggle-bar') as HTMLElement | null
    if (!listEl) return
    const rect = listEl.getBoundingClientRect()
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))

    const pts = [...toggle.points]
    const bi = toggleDragState.boundaryIdx
    if (bi < 0 || bi >= pts.length) return
    pts[bi] = { ...pts[bi], t }
    pts.sort((a, b) => a.t - b.t)

    const toggles = [...sweepData.toggles]
    toggles[toggleDragState.toggleIdx] = { ...toggle, points: pts }
    sceneUpdateModifierParams(sweepNode.id, { sweep: { curves: sweepData.curves, toggles } })
    // Update boundary index after sort
    toggleDragState.boundaryIdx = pts.findIndex(p => p.t === t)
  }

  function onToggleBoundaryUp() {
    toggleDragState = null
    window.removeEventListener('pointermove', onToggleBoundaryMove)
    window.removeEventListener('pointerup', onToggleBoundaryUp)
  }

  function splitToggleBlock(toggleIdx: number, t: number) {
    if (!sweepNode || !sweepData.toggles) return
    const toggle = sweepData.toggles[toggleIdx]
    if (!toggle) return
    pushUndo('Split sweep toggle')
    const pts = [...toggle.points]
    // Insert off-on pair to create a gap
    const gap = 0.02
    pts.push({ t: Math.max(0, t - gap / 2), on: false })
    pts.push({ t: Math.min(1, t + gap / 2), on: true })
    pts.sort((a, b) => a.t - b.t)
    const toggles = [...sweepData.toggles]
    toggles[toggleIdx] = { ...toggle, points: pts }
    sceneUpdateModifierParams(sweepNode.id, { sweep: { curves: sweepData.curves, toggles } })
  }

  // ── Knob precision editing ──
  const selectedPoint = $derived(
    selectedCurve && selectedPointIdx !== null && selectedPointIdx < selectedCurve.points.length
      ? selectedCurve.points[selectedPointIdx]
      : null
  )

  function setPointT(v: number) {
    if (!selectedCurve || selectedPointIdx === null) return
    pushUndo('Move sweep point')
    const pts = [...selectedCurve.points]
    pts[selectedPointIdx] = { t: v, v: pts[selectedPointIdx].v }
    pts.sort((a, b) => a.t - b.t)
    const newIdx = pts.findIndex(p => p.t === v)
    commitCurve(selectedCurve.target, selectedCurve.color, pts)
    selectedPointIdx = newIdx >= 0 ? newIdx : null
    redraw()
  }

  function setPointV(v: number) {
    if (!selectedCurve || selectedPointIdx === null) return
    pushUndo('Move sweep point')
    const mapped = v * 2 - 1 // 0–1 knob → -1 to +1 curve value
    const pts = [...selectedCurve.points]
    pts[selectedPointIdx] = { t: pts[selectedPointIdx].t, v: mapped }
    commitCurve(selectedCurve.target, selectedCurve.color, pts)
    redraw()
  }

  // ── Resize observer ──
  let canvasWrapEl: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (!canvasWrapEl) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        canvasW = Math.floor(entry.contentRect.width)
        canvasH = Math.floor(entry.contentRect.height)
      }
    })
    obs.observe(canvasWrapEl)
    return () => obs.disconnect()
  })

  // ── Smooth playback animation ──
  // During playback, use rAF for 60fps cursor interpolation instead of step-driven updates
  let rafId = 0
  let lastStepTime = 0
  let lastStepProgress = 0
  let interpolatedProgress = $state(-1)

  function animatePlayback() {
    if (!playback.playing) { interpolatedProgress = -1; return }
    const rc = repeatCount
    const spp = stepsPerPattern
    const stepsArr = pat ? pat.cells.map(c => c.steps) : [16]
    const longestIdx = stepsArr.indexOf(Math.max(...stepsArr))
    const currentStep = playback.playheads[longestIdx] ?? 0
    const repIdx = playback.sceneRepeatTotal > 1 ? playback.sceneRepeatIndex : 0
    const stepProgress = (repIdx + currentStep / spp) / rc

    // Detect step change → reset interpolation baseline
    if (stepProgress !== lastStepProgress) {
      lastStepTime = performance.now()
      lastStepProgress = stepProgress
    }

    // Interpolate between steps using BPM timing
    const msPerStep = 60000 / song.bpm / 4
    const elapsed = performance.now() - lastStepTime
    const stepFrac = Math.min(1, elapsed / msPerStep) // 0→1 within current step
    interpolatedProgress = stepProgress + stepFrac / (spp * rc)

    redraw()
    rafId = requestAnimationFrame(animatePlayback)
  }

  $effect(() => {
    if (playback.playing) {
      lastStepTime = performance.now()
      lastStepProgress = 0
      rafId = requestAnimationFrame(animatePlayback)
      return () => { cancelAnimationFrame(rafId); interpolatedProgress = -1 }
    } else {
      interpolatedProgress = -1
    }
  })

  // Cancel clear animation if sweep node changes mid-fade
  $effect(() => {
    sweepNode // track dependency
    if (clearRafId) { cancelAnimationFrame(clearRafId); clearRafId = 0; clearProgress = null }
  })

  // Redraw on data or size change (non-playback)
  $effect(() => {
    sweepData.curves.length
    canvasW
    canvasH
    selectedCurveIdx
    scrollPage
    zoomOverride
    if (!playback.playing) redraw()
  })
</script>

<div class="sweep-root">
  <!-- Toolbar -->
  <div class="sweep-toolbar">
    <div class="sweep-pat-indicator">
      <span class="sweep-pat-dot" style="background: {patColor}"></span>
      <span class="sweep-pat-name">{patName}</span>
    </div>
    <div class="sweep-toolbar-spacer"></div>
    <!-- Scene play/stop -->
    <button class="sweep-play-circle" class:playing={playback.playing && playback.mode === 'scene'}
      onpointerdown={() => {
        if (playback.playing && playback.mode === 'scene') {
          onstop?.()
        } else if (sweepNode) {
          const patNodeId = findPatternForSweep(sweepNode.id)
          if (patNodeId) playFromNode(patNodeId)
        }
      }}
      data-tip={playback.playing && playback.mode === 'scene' ? 'Stop scene' : 'Play scene from this pattern'}
      data-tip-ja={playback.playing && playback.mode === 'scene' ? 'シーン停止' : 'このパターンからシーン再生'}
    >
      <svg viewBox="0 0 12 14" width="10" height="12" fill="currentColor" aria-hidden="true">
        {#if playback.playing && playback.mode === 'scene'}
          <rect x="1" y="1" width="3.5" height="12" rx="0.8"/>
          <rect x="7.5" y="1" width="3.5" height="12" rx="0.8"/>
        {:else}
          <polygon points="1,1 11,7 1,13"/>
        {/if}
      </svg>
    </button>
    <button class="sweep-rec-circle" class:armed={recState === 'armed'} class:recording={recState === 'recording'}
      onpointerdown={() => {
        if (recState === 'recording') {
          stopRecording()
        } else if (recState === 'armed') {
          disarmRecording()
        } else if (sweepNode) {
          const patNodeId = findPatternForSweep(sweepNode.id)
          if (!patNodeId) return
          armRecording(sweepNode.id, patNodeId)
        }
      }}
      data-tip={recState === 'recording' ? `Recording ${sweepRec.elapsedDisplay}` : recState === 'armed' ? 'Armed — touch any param' : 'Record sweep'}
      data-tip-ja={recState === 'recording' ? `録音中 ${sweepRec.elapsedDisplay}` : recState === 'armed' ? 'アーム中 — 操作で開始' : 'スイープ録音'}
    >
      <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true">
        {#if recState === 'recording'}
          <rect x="2" y="2" width="8" height="8" rx="1"/>
        {:else}
          <circle cx="6" cy="6" r="5"/>
        {/if}
      </svg>
    </button>
    {#if recState === 'recording'}
      <span class="sweep-rec-time">{sweepRec.elapsedDisplay}</span>
      {#if sweepRec.captureCount > 0}
        <span class="sweep-rec-count">{sweepRec.captureCount} param</span>
      {/if}
    {/if}
    <span class="sweep-toolbar-sep"></span>
    <button class="sweep-tool-btn" onpointerdown={clearAllWithDisintegration}
      data-tip="Clear all curves" data-tip-ja="全カーブを消去"
    >Clear</button>
    <div class="sweep-toolbar-spacer"></div>
    <button class="sweep-close" onpointerdown={onClose}
      aria-label="Close sweep editor" data-tip="Close" data-tip-ja="閉じる"
    >✕</button>
  </div>

  <div class="sweep-layout">
    <!-- Curve/Toggle list panel -->
    <div class="sweep-list">
      {#if sweepData.curves.length > 0}
        <div class="sweep-section-label">Curves</div>
        {#each sweepData.curves as curve, i}
          {#if !isMuteCurve(curve)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="sweep-list-item"
              class:active={selectedCurveIdx === i}
              style="--accent: {curve.color}"
              onpointerdown={() => { selectedCurveIdx = i; selectedToggleIdx = null }}
            >
              <span class="sweep-list-dot"></span>
              <span class="sweep-list-label">{curveLabel(curve.target)}</span>
              <button class="sweep-list-del" onpointerdown={(e: PointerEvent) => { e.stopPropagation(); deleteCurve(curve.target) }}
                data-tip="Delete curve" data-tip-ja="カーブを削除"
              >✕</button>
            </div>
          {/if}
        {/each}
      {/if}
      {#if sweepData.toggles && sweepData.toggles.length > 0}
        <div class="sweep-section-label">Toggles</div>
        {#each sweepData.toggles as toggle, i}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="sweep-list-item toggle-item"
            class:active={selectedToggleIdx === i}
            style="--accent: {toggle.color}"
            onpointerdown={() => { selectedToggleIdx = i; selectedCurveIdx = null }}
          >
            <span class="sweep-list-label">{toggleLabel(toggle.target)}</span>
            <button class="sweep-list-del" onpointerdown={(e: PointerEvent) => { e.stopPropagation(); deleteToggle(i) }}
              data-tip="Delete toggle" data-tip-ja="トグルを削除"
            >✕</button>
          </div>
          <!-- Toggle block visualization -->
          <div class="sweep-toggle-row" class:active={selectedToggleIdx === i}>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sweep-toggle-bar"
              style="--accent: {toggle.color}"
              onpointerdown={(e: PointerEvent) => {
                if (selectedToggleIdx === i) {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const t = (e.clientX - rect.left) / rect.width
                  splitToggleBlock(i, t)
                }
              }}
            >
              {#each toggle.points as pt, pi}
                {@const nextT = pi < toggle.points.length - 1 ? toggle.points[pi + 1].t : 1}
                {#if pt.on}
                  <div
                    class="toggle-block on"
                    style="left: {pt.t * 100}%; width: {(nextT - pt.t) * 100}%"
                  ></div>
                {/if}
                <!-- Boundary handle -->
                {#if selectedToggleIdx === i}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="toggle-boundary"
                    style="left: {pt.t * 100}%"
                    onpointerdown={(e: PointerEvent) => onToggleBoundaryDown(e, i, pi, 'left')}
                  ></div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      {/if}
      {#if song.scene.globalSweep && ((song.scene.globalSweep.curves?.length ?? 0) > 0 || (song.scene.globalSweep.toggles?.length ?? 0) > 0)}
        <div class="sweep-section-label global-label">Global</div>
        {#each song.scene.globalSweep.curves ?? [] as curve, i}
          <div class="sweep-list-item global-item" style="--accent: {curve.color}">
            <span class="sweep-list-dot"></span>
            <span class="sweep-list-label">{curveLabel(curve.target)}</span>
            <button class="sweep-list-del" onpointerdown={() => deleteGlobalCurve(i)}
              data-tip="Delete global curve" data-tip-ja="グローバルカーブを削除"
            >✕</button>
          </div>
        {/each}
        {#each song.scene.globalSweep.toggles ?? [] as toggle, i}
          <div class="sweep-list-item global-item" style="--accent: {toggle.color}">
            <span class="sweep-list-label">{toggleLabel(toggle.target)}</span>
            <button class="sweep-list-del" onpointerdown={() => deleteGlobalToggle(i)}
              data-tip="Delete global toggle" data-tip-ja="グローバルトグルを削除"
            >✕</button>
          </div>
        {/each}
      {/if}
      {#if sweepData.curves.length === 0 && (!sweepData.toggles || sweepData.toggles.length === 0) && !song.scene.globalSweep?.curves?.length}
        <div class="sweep-empty">No recorded curves</div>
      {/if}
    </div>

    <!-- Canvas -->
    <div class="sweep-canvas-wrap" bind:this={canvasWrapEl}>
      <canvas
        bind:this={canvasEl}
        class="sweep-canvas"
        tabindex="0"
        onpointerdown={(e) => { canvasEl?.focus(); onPointerDown(e) }}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onkeydown={onKeyDown}
        onwheel={onWheel}
      ></canvas>
      {#if flashOpacity > 0}
        <div class="sweep-flash" style="opacity: {flashOpacity}">
          {flashPatName}
        </div>
      {/if}
      <div class="sweep-axis-labels">
        <span>+1</span>
        <span>±0</span>
        <span>−1</span>
      </div>
      {#if selectedPoint}
        <div class="sweep-knob-panel">
          <Knob value={selectedPoint.t} label="T" size={28}
            onchange={setPointT}
          />
          <span class="sweep-knob-val">{(selectedPoint.t * 100).toFixed(1)}%</span>
          <Knob value={(selectedPoint.v + 1) / 2} label="V" size={28} defaultValue={0.5}
            onchange={setPointV}
          />
          <span class="sweep-knob-val">{selectedPoint.v >= 0 ? '+' : ''}{(selectedPoint.v * 100).toFixed(0)}%</span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .sweep-root {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    background: var(--color-fg);
  }

  /* ── Toolbar ── */
  .sweep-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px 10px;
    background: var(--color-fg);
    border-bottom: 1px solid var(--dz-divider);
    flex-shrink: 0;
  }
  .sweep-pat-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .sweep-pat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .sweep-pat-name {
    font-size: var(--fs-lg);
    font-weight: 600;
    color: var(--dz-text-strong);
  }
  .sweep-tool-btn {
    border: 1.5px solid var(--dz-btn-border);
    background: transparent;
    color: var(--dz-text);
    height: 24px;
    padding: 0 8px;
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .sweep-tool-btn:hover {
    border-color: var(--dz-text);
    color: var(--dz-text-strong);
  }
  .sweep-play-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--dz-btn-border);
    background: transparent;
    color: var(--dz-text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 80ms, border-color 80ms, color 80ms;
  }
  .sweep-play-circle:hover {
    border-color: var(--dz-text-strong);
    color: var(--dz-text-strong);
  }
  .sweep-play-circle.playing {
    border-color: var(--dz-text-strong);
    color: var(--dz-text-strong);
  }
  .sweep-rec-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--color-salmon);
    background: transparent;
    color: var(--color-salmon);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 80ms, border-color 80ms, color 80ms;
  }
  .sweep-rec-circle:hover {
    background: var(--salmon-bg-key);
  }
  .sweep-rec-circle.armed {
    background: var(--salmon-bg-key);
    animation: sweep-rec-armed-glow 1.5s ease-in-out infinite;
  }
  .sweep-rec-circle.recording {
    background: var(--color-salmon);
    color: var(--color-fg);
    box-shadow: 0 0 8px rgba(232, 160, 144, 0.6);
    animation: sweep-rec-recording-glow 1s ease-in-out infinite;
  }
  @keyframes sweep-rec-armed-glow {
    0%, 100% { box-shadow: 0 0 4px rgba(232, 160, 144, 0.3); }
    50%      { box-shadow: 0 0 12px rgba(232, 160, 144, 0.7), 0 0 24px rgba(232, 160, 144, 0.3); }
  }
  @keyframes sweep-rec-recording-glow {
    0%, 100% { box-shadow: 0 0 6px rgba(232, 160, 144, 0.5); }
    50%      { box-shadow: 0 0 14px rgba(232, 160, 144, 0.8), 0 0 28px rgba(232, 160, 144, 0.3); }
  }
  .sweep-rec-count {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 600;
    color: var(--dz-text-mid);
    letter-spacing: 0.04em;
  }
  .sweep-rec-time {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    font-weight: 700;
    color: var(--color-salmon);
    letter-spacing: 0.04em;
  }
  .sweep-toolbar-sep {
    width: 1px;
    height: 16px;
    background: var(--dz-border);
    margin: 0 4px;
    flex-shrink: 0;
  }
  .sweep-toolbar-spacer { flex: 1; }
  .sweep-close {
    border: 1.5px solid var(--dz-btn-border);
    background: transparent;
    color: var(--dz-text);
    width: 24px;
    height: 24px;
    font-size: var(--fs-base);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
  }
  .sweep-close:hover {
    border-color: var(--dz-text-strong);
    color: var(--dz-text-strong);
  }

  .sweep-layout {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 0;
  }

  /* ── Curve/Toggle list ── */
  .sweep-list {
    width: 140px;
    flex-shrink: 0;
    overflow-y: auto;
    padding: 4px 0;
    border-right: 1px solid var(--dz-divider);
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .sweep-section-label {
    font-size: var(--fs-min);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--dz-text-dim);
    padding: 8px 8px 4px;
    text-transform: uppercase;
  }
  .sweep-section-label.global-label {
    color: var(--dz-text-mid);
    border-top: 1px solid var(--dz-divider);
    margin-top: 4px;
  }
  .sweep-list-item.global-item {
    opacity: 0.75;
  }
  .sweep-list-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    cursor: pointer;
    color: var(--dz-text-mid);
    font-size: var(--fs-sm);
    transition: background 40ms;
  }
  .sweep-list-item:hover {
    background: var(--dz-bg-hover);
  }
  .sweep-list-item.active {
    background: var(--dz-bg-active);
    color: var(--dz-text-strong);
  }
  .sweep-list-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }
  .sweep-list-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sweep-list-del {
    all: unset;
    font-size: var(--fs-sm);
    color: var(--dz-text-dim);
    cursor: pointer;
    padding: 0 2px;
    width: 12px;
    text-align: center;
    opacity: 0;
    transition: opacity 80ms;
  }
  .sweep-list-item:hover .sweep-list-del,
  .sweep-list-item.active .sweep-list-del {
    opacity: 1;
  }
  .sweep-list-del:hover {
    color: var(--color-danger);
  }
  .sweep-empty {
    padding: 16px 8px;
    color: var(--dz-text-dim);
    font-size: var(--fs-sm);
    text-align: center;
  }

  /* ── Toggle blocks ── */
  .sweep-toggle-row {
    padding: 2px 8px 4px;
  }
  .sweep-toggle-bar {
    position: relative;
    height: 12px;
    background: var(--dz-bg-hover);
    border-radius: 2px;
    overflow: visible;
  }
  .sweep-toggle-row.active .sweep-toggle-bar {
    cursor: crosshair;
  }
  .toggle-block {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 2px;
  }
  .toggle-block.on {
    background: var(--accent);
    opacity: 0.6;
  }
  .sweep-toggle-row.active .toggle-block.on {
    opacity: 0.8;
  }
  .toggle-boundary {
    position: absolute;
    top: -2px;
    width: 6px;
    height: 16px;
    margin-left: -3px;
    background: var(--dz-text-strong);
    border-radius: 2px;
    cursor: ew-resize;
    opacity: 0;
    transition: opacity 80ms;
    z-index: 1;
  }
  .sweep-toggle-row.active .toggle-boundary {
    opacity: 0.6;
  }
  .toggle-boundary:hover {
    opacity: 1 !important;
  }

  /* ── Canvas ── */
  .sweep-canvas-wrap {
    flex: 1;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-left: 1px solid var(--dz-divider);
  }
  .sweep-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: default;
    touch-action: none;
  }
  .sweep-canvas:focus { outline: none; }
  .sweep-flash {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: var(--font-data);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dz-text-bright);
    pointer-events: none;
    transition: opacity 400ms ease-out;
  }
  .sweep-axis-labels {
    position: absolute;
    right: 6px;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 6px 0;
    pointer-events: none;
  }
  .sweep-axis-labels span {
    font-size: var(--fs-sm);
    color: var(--dz-text-dim);
  }
  .sweep-knob-panel {
    position: absolute;
    bottom: 8px;
    left: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--color-fg);
    border: 1px solid var(--dz-border);
    border-radius: 4px;
  }
  .sweep-knob-val {
    font-family: var(--font-data);
    font-size: var(--fs-min);
    color: var(--dz-text);
    min-width: 36px;
  }
</style>
