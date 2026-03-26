<script lang="ts">
  // Sweep editor — dark-zone review/edit overlay (ADR 123 Phase 1)
  // Recording-based input replaces draw palette. Point editing is always active.
  import { song, ui, playback, pushUndo, fxPad, masterPad, perf } from '../state.svelte.ts'
  import { findSweepNodeForPattern, sceneUpdateModifierParams } from '../sceneActions.ts'
  import { sweepRec, armRecording, disarmRecording, stopRecording, findPatternForSweep } from '../sweepRecorder.svelte.ts'

  import { getParamDefs } from '../paramDefs.ts'
  import { evaluateCurve } from '../sweepEval.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import type { SweepCurve, SweepTarget, SweepToggleTarget, VoiceId } from '../types.ts'

  // ── Sweep node detection ──
  const sweepNode = $derived.by(() => {
    const pat = song.patterns[ui.currentPattern]
    if (!pat) return null
    return findSweepNodeForPattern(pat.id)
  })

  const recState = $derived(sweepRec.sweepNodeId === sweepNode?.id ? sweepRec.state : 'idle')

  const sweepData = $derived(sweepNode?.modifierParams?.sweep ?? { curves: [] })

  // ── Pattern info ──
  const pat = $derived(song.patterns[ui.currentPattern])
  const patName = $derived(pat?.name || `Pattern ${ui.currentPattern + 1}`)
  const patColor = $derived(PATTERN_COLORS[pat?.color ?? 0])

  const { onClose }: { onClose: () => void } = $props()

  // ── Selected curve/toggle ──
  let selectedCurveIdx = $state<number | null>(null)
  let selectedToggleIdx = $state<number | null>(null)
  const selectedCurve = $derived(selectedCurveIdx !== null ? sweepData.curves[selectedCurveIdx] ?? null : null)

  // ── Canvas state ──
  let canvasEl: HTMLCanvasElement | undefined = $state()
  let canvasW = $state(600)
  let canvasH = $state(200)

  // ── Bézier point editing (always active) ──
  let draggingPointIdx = $state<number | null>(null)
  let lastClickTime = $state(0)
  let dragging = $state(false)
  const POINT_HIT_RADIUS = 8

  // ── Zoom state ──
  let zoomedRepeat = $state<number | null>(null)

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

  // Visible t-range based on zoom
  const viewStart = $derived(zoomedRepeat !== null ? zoomedRepeat / repeatCount : 0)
  const viewEnd = $derived(zoomedRepeat !== null ? (zoomedRepeat + 1) / repeatCount : 1)
  const viewSpan = $derived(viewEnd - viewStart)

  const TIMELINE_H = 22

  // ── Dark-zone canvas colors ──
  const DZ_BG = '#1E2028'
  const DZ_GRID = 'rgba(237,232,220, 0.08)'
  const DZ_GRID_BEAT = 'rgba(237,232,220, 0.12)'
  const DZ_DIVIDER = 'rgba(237,232,220, 0.06)'
  const DZ_TEXT = 'rgba(237,232,220, 0.55)'
  const DZ_CENTER_LINE = 'rgba(237,232,220, 0.15)'
  const DZ_CURSOR = 'rgba(196, 122, 42, 0.8)'

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
    const isZoomed = zoomedRepeat !== null

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

    // Step tick marks & repeat boundaries
    for (let s = 0; s < totalSteps; s++) {
      const t = s / totalSteps
      if (t < viewStart - 0.01 || t > viewEnd + 0.01) continue
      const x = tToX(t, w)
      const isBeat = s % 4 === 0
      const isRepeatBoundary = s % spp === 0 && s > 0
      if (isRepeatBoundary && !isZoomed) {
        ctx.strokeStyle = DZ_GRID_BEAT
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      const showTick = isZoomed ? true : isBeat
      if (showTick) {
        ctx.strokeStyle = DZ_GRID
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, TIMELINE_H - (isBeat ? 8 : 4))
        ctx.lineTo(x, TIMELINE_H)
        ctx.stroke()
      }
    }

    // Timeline labels
    ctx.fillStyle = DZ_TEXT
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    if (isZoomed) {
      ctx.fillText(`← R${zoomedRepeat! + 1}`, 4, 12)
      for (let s = 0; s < spp; s += 4) {
        const t = (zoomedRepeat! * spp + s) / totalSteps
        const x = tToX(t, w)
        if (x > 30) ctx.fillText(`${s + 1}`, x + 2, 12)
      }
    } else {
      for (let r = 0; r < rc; r++) {
        const x = tToX(r / rc, w) + 4
        ctx.fillText(`R${r + 1}`, x, 12)
      }
    }

    // ── Drawing area (below timeline) ──
    const drawH = h - TIMELINE_H
    const drawY = TIMELINE_H

    // Grid dots
    ctx.fillStyle = DZ_GRID
    for (let s = 0; s < totalSteps; s++) {
      const showDot = isZoomed ? true : s % 4 === 0
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

    // Draw all curves
    for (const curve of sweepData.curves) {
      if ((curve.target as { kind: string }).kind === 'mute') continue
      const isActive = selectedCurve && targetsEqual(curve.target, selectedCurve.target)
      drawCurve(ctx, curve, w, drawY, drawH, isActive ? 1.0 : 0.3)
    }

    // Halation clear effect (adapted for dark zone)
    if (halationProgress !== null) {
      const cx = w / 2
      const cy = drawY + drawH / 2
      const maxR = Math.sqrt(w * w + drawH * drawH)
      const r = halationProgress * maxR * 1.2
      const ringW = maxR * 0.15

      for (let i = 3; i >= 0; i--) {
        const ri = r - i * ringW * 0.3
        if (ri <= 0) continue
        ctx.beginPath()
        ctx.arc(cx, cy, ri, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(196, 122, 42, ${0.06 * (4 - i)})`
        ctx.fill()
      }

      if (r > ringW) {
        ctx.beginPath()
        ctx.arc(cx, cy, r - ringW, 0, Math.PI * 2)
        ctx.fillStyle = DZ_BG
        ctx.fill()
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
    for (let s = 0; s < totalSteps; s++) {
      const t = s / totalSteps
      if (t < viewStart - 0.01 || t > viewEnd + 0.01) continue
      const x = tToX(t, w)
      const isBeat = s % 4 === 0
      const showTick = isZoomed ? true : isBeat
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
    if (isZoomed) {
      ctx.fillText(`← R${zoomedRepeat! + 1}`, 4, 12)
      for (let s = 0; s < spp; s += 4) {
        const t = (zoomedRepeat! * spp + s) / totalSteps
        const x = tToX(t, w)
        if (x > 30) ctx.fillText(`${s + 1}`, x + 2, 12)
      }
    } else {
      for (let r = 0; r < rc; r++) {
        const x = tToX(r / rc, w) + 4
        ctx.fillText(`R${r + 1}`, x, 12)
      }
    }

    // Playback cursor
    if (playback.playing && rc > 0) {
      const stepsArr = pat ? pat.cells.map(c => c.steps) : [16]
      const longestIdx = stepsArr.indexOf(Math.max(...stepsArr))
      const currentStep = playback.playheads[longestIdx] ?? 0
      const repIdx = playback.sceneRepeatTotal > 1 ? playback.sceneRepeatIndex : 0
      const progress = (repIdx + currentStep / spp) / rc
      const cx = tToX(progress, w)
      if (cx >= 0 && cx <= w) {
        ctx.strokeStyle = DZ_CURSOR
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx, TIMELINE_H)
        ctx.lineTo(cx, h)
        ctx.stroke()
        ctx.fillStyle = '#c47a2a'
        ctx.beginPath()
        ctx.arc(cx, TIMELINE_H / 2, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  function drawCurve(ctx: CanvasRenderingContext2D, curve: SweepCurve, w: number, drawY: number, drawH: number, alpha: number) {
    if (curve.points.length < 2) return
    const xFor = (t: number) => tToX(t, w)
    const yForV = (v: number) => drawY + (0.5 - v / 2) * drawH
    const midY = drawY + drawH / 2
    const isActive = alpha > 0.5
    const pts = curve.points
    const first = pts[0], last = pts[pts.length - 1]

    // Extension lines for partial curves
    if (isActive) {
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

    // Neon glow fill — subtle accent color
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

    // Anchor dots (always visible for active curve — point editing is always on)
    if (isActive) {
      for (const p of pts) {
        const px = xFor(p.t)
        if (px < -5 || px > w + 5) continue
        // Outer ring
        ctx.fillStyle = curve.color
        ctx.globalAlpha = alpha * 0.6
        ctx.beginPath()
        ctx.arc(px, yForV(p.v), 6, 0, Math.PI * 2)
        ctx.fill()
        // Inner bright dot
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = alpha * 0.9
        ctx.beginPath()
        ctx.arc(px, yForV(p.v), 3, 0, Math.PI * 2)
        ctx.fill()
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

  function targetsEqual(a: SweepTarget, b: SweepTarget): boolean {
    if (a.kind !== b.kind) return false
    if (a.kind === 'master' && b.kind === 'master') return a.param === b.param
    if (a.kind === 'fx' && b.kind === 'fx') return a.param === b.param
    if (a.kind === 'track' && b.kind === 'track') return a.trackId === b.trackId && a.param === b.param
    if (a.kind === 'send' && b.kind === 'send') return a.trackId === b.trackId && a.param === b.param
    if (a.kind === 'eq' && b.kind === 'eq') return a.band === b.band && a.param === b.param
    return false
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
      if ((curve.target as { kind: string }).kind === 'mute') continue
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
      if (zoomedRepeat !== null) {
        zoomedRepeat = null
      } else {
        const rect = canvasEl.getBoundingClientRect()
        const screenT = (e.clientX - rect.left) / rect.width
        const rc = repeatCount
        const clickedRepeat = Math.floor(screenT * rc)
        zoomedRepeat = Math.max(0, Math.min(rc - 1, clickedRepeat))
      }
      redraw()
      return
    }

    canvasEl.setPointerCapture(e.pointerId)

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
        dragging = true
        return
      }

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
    if (!dragging || draggingPointIdx === null || !selectedCurve) return
    const norm = pointerToNorm(e)
    const pts = [...selectedCurve.points]
    pts[draggingPointIdx] = norm
    pts.sort((a, b) => a.t - b.t)
    draggingPointIdx = pts.findIndex(p => p.t === norm.t && p.v === norm.v)
    commitCurve(selectedCurve.target, selectedCurve.color, pts)
    redraw()
  }

  function onPointerUp(_e: PointerEvent) {
    draggingPointIdx = null
    dragging = false
  }

  // ── Halation clear effect ──
  let halationProgress = $state<number | null>(null)
  function clearAllWithHalation() {
    if (!sweepNode || halationProgress !== null) return
    const startTime = performance.now()
    const duration = 600

    function animate() {
      const elapsed = performance.now() - startTime
      halationProgress = Math.min(1, elapsed / duration)
      redraw()

      if (halationProgress < 1) {
        requestAnimationFrame(animate)
      } else {
        pushUndo('Clear all sweep curves')
        sceneUpdateModifierParams(sweepNode!.id, { sweep: { curves: [] } })
        selectedCurveIdx = null
        selectedToggleIdx = null
        halationProgress = null
        redraw()
      }
    }
    requestAnimationFrame(animate)
  }

  // ── Commit curve to sweep data ──
  function commitCurve(target: SweepTarget, color: string, points: { t: number; v: number }[]) {
    if (!sweepNode) return
    const curves = sweepData.curves.filter(c => (c.target as { kind: string }).kind !== 'mute')
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
    const curves = sweepData.curves.filter(c => (c.target as { kind: string }).kind !== 'mute' && !targetsEqual(c.target, target))
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

  // ── Toggle editing helpers ──
  let toggleDragState = $state<{
    toggleIdx: number
    boundaryIdx: number  // index of the point whose t is being dragged
    side: 'left' | 'right'
  } | null>(null)

  function onToggleBoundaryDown(e: PointerEvent, toggleIdx: number, boundaryIdx: number, side: 'left' | 'right') {
    e.preventDefault()
    e.stopPropagation()
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

  // Redraw on data or size change
  $effect(() => {
    sweepData.curves.length
    canvasW
    canvasH
    selectedCurveIdx
    zoomedRepeat
    playback.sceneRepeatIndex
    playback.playheads[0]
    redraw()
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
    {/if}
    <span class="sweep-toolbar-sep"></span>
    <button class="sweep-tool-btn" onpointerdown={clearAllWithHalation}
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
          {#if (curve.target as { kind: string }).kind !== 'mute'}
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
      {#if sweepData.curves.length === 0 && (!sweepData.toggles || sweepData.toggles.length === 0)}
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
      ></canvas>
      <div class="sweep-axis-labels">
        <span>+1</span>
        <span>±0</span>
        <span>−1</span>
      </div>
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
    background: rgba(232, 160, 144, 0.15);
  }
  .sweep-rec-circle.armed {
    background: rgba(232, 160, 144, 0.2);
    animation: sweep-rec-pulse 1.5s ease-in-out infinite;
  }
  .sweep-rec-circle.recording {
    background: var(--color-salmon);
    color: var(--color-fg);
    animation: sweep-rec-pulse 1s ease-in-out infinite;
  }
  @keyframes sweep-rec-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
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
</style>
