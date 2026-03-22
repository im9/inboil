<script lang="ts">
  import { song, ui, playback, pushUndo, fxPad } from '../state.svelte.ts'
  import { findSweepNodeForPattern, sceneUpdateFnParams } from '../sceneActions.ts'
  import { getParamDefs } from '../paramDefs.ts'
  import { PATTERN_COLORS } from '../constants.ts'
  import type { SweepCurve, SweepTarget } from '../types.ts'

  // ── Sweep node detection ──
  const sweepNode = $derived.by(() => {
    const pat = song.patterns[ui.currentPattern]
    if (!pat) return null
    return findSweepNodeForPattern(pat.id)
  })

  const sweepData = $derived(sweepNode?.fnParams?.sweep ?? { curves: [] })

  // ── Palette: available targets from current pattern's tracks ──
  const pat = $derived(song.patterns[ui.currentPattern])
  const patName = $derived(pat?.name || `Pattern ${ui.currentPattern + 1}`)
  const patColor = $derived(PATTERN_COLORS[pat?.color ?? 0])

  interface PaletteItem {
    label: string
    target: SweepTarget
    color: string
  }

  const PARAM_COLORS = [
    '#e07040', '#40a0e0', '#e0c040', '#60c080',
    '#c060c0', '#e08080', '#60a0a0', '#a0a060',
    '#c09060', '#8080e0', '#60c0c0', '#c0c060',
  ]

  // ── Drill-down palette ──
  let expandedTrackId = $state<number | null>(null)

  interface TrackEntry {
    trackId: number
    trackName: string
    voiceId: string
  }

  const trackList = $derived.by((): TrackEntry[] => {
    if (!pat) return []
    return pat.cells.map(cell => ({
      trackId: cell.trackId,
      trackName: cell.name || `Trk ${cell.trackId + 1}`,
      voiceId: cell.voiceId ?? '',
    }))
  })

  const paletteItems = $derived.by((): PaletteItem[] => {
    if (!pat || expandedTrackId === null) return []
    const cell = pat.cells.find(c => c.trackId === expandedTrackId)
    if (!cell) return []
    const items: PaletteItem[] = []
    let colorIdx = 0
    // Track-level params
    items.push({ label: 'Volume', target: { kind: 'track', trackId: expandedTrackId, param: 'volume' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length] })
    items.push({ label: 'Pan', target: { kind: 'track', trackId: expandedTrackId, param: 'pan' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length] })
    // Voice-specific params from paramDefs
    const voiceId = cell.voiceId
    if (voiceId) {
      const defs = getParamDefs(voiceId)
      for (const def of defs) {
        items.push({
          label: def.label,
          target: { kind: 'track', trackId: expandedTrackId, param: def.key as 'cutoff' },
          color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length],
        })
      }
    }
    // Send levels
    items.push({ label: 'Verb Send', target: { kind: 'send', trackId: expandedTrackId, param: 'reverbSend' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length] })
    items.push({ label: 'Dly Send', target: { kind: 'send', trackId: expandedTrackId, param: 'delaySend' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length] })
    return items
  })

  // ── Active brush ──
  let activeBrushIdx = $state(0)
  const activeBrush = $derived(paletteItems[activeBrushIdx] ?? null)

  // ── Canvas state ──
  let canvasEl: HTMLCanvasElement | undefined = $state()
  let canvasW = $state(600)
  let canvasH = $state(200)
  let drawing = $state(false)
  let rawPoints: { t: number; v: number }[] = $state([])

  const { onClose }: { onClose: () => void } = $props()

  // ── Drawing mode ──
  let drawMode = $state<'free' | 'bezier'>('free')

  // ── Bézier state ──
  let draggingPointIdx = $state<number | null>(null)
  let lastClickTime = $state(0)
  const POINT_HIT_RADIUS = 8  // px

  // ── Zoom state ──
  // null = full view, number = zoomed into specific repeat (0-based)
  let zoomedRepeat = $state<number | null>(null)

  // ── Pattern info ──
  // Read repeat count from the connected repeat fn node (for editing), fallback to playback state
  const repeatCount = $derived.by(() => {
    if (playback.sceneRepeatTotal > 1) return playback.sceneRepeatTotal
    // Find repeat fn node attached to the same pattern node as the sweep
    const patId = pat?.id
    if (!patId) return 1
    for (const node of song.scene.nodes) {
      if (node.type !== 'pattern' || node.patternId !== patId) continue
      for (const edge of song.scene.edges) {
        if (edge.to !== node.id) continue
        const src = song.scene.nodes.find(n => n.id === edge.from)
        if (src?.type === 'repeat' && src.fnParams?.repeat) return src.fnParams.repeat.count
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

  // ── Canvas rendering ──

  /** Map data t (0–1) to screen x, accounting for zoom */
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

    // Background
    ctx.fillStyle = '#f5f0e6'
    ctx.fillRect(0, 0, w, h)

    // ── Timeline header ──
    ctx.fillStyle = isZoomed ? 'rgba(160, 140, 110, 0.12)' : 'rgba(160, 140, 110, 0.08)'
    ctx.fillRect(0, 0, w, TIMELINE_H)
    ctx.strokeStyle = 'rgba(160, 140, 110, 0.15)'
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
        ctx.strokeStyle = 'rgba(160, 140, 110, 0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      // Tick in timeline header
      const showTick = isZoomed ? true : isBeat
      if (showTick) {
        ctx.strokeStyle = 'rgba(160, 140, 110, 0.25)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, TIMELINE_H - (isBeat ? 8 : 4))
        ctx.lineTo(x, TIMELINE_H)
        ctx.stroke()
      }
    }

    // Timeline labels
    ctx.fillStyle = 'rgba(120, 100, 70, 0.5)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    if (isZoomed) {
      // Show "← R3" back label + step numbers
      ctx.fillText(`← R${zoomedRepeat! + 1}`, 4, 12)
      // Step numbers at beat boundaries
      for (let s = 0; s < spp; s += 4) {
        const t = (zoomedRepeat! * spp + s) / totalSteps
        const x = tToX(t, w)
        if (x > 30) ctx.fillText(`${s + 1}`, x + 2, 12)
      }
    } else {
      for (let r = 0; r < rc; r++) {
        const x = tToX(r / rc, w) + 4
        ctx.fillText(`${r + 1}`, x, 12)
      }
    }

    // ── Drawing area (below timeline) ──
    const drawH = h - TIMELINE_H
    const drawY = TIMELINE_H

    // Grid dots in drawing area
    ctx.fillStyle = 'rgba(160, 140, 110, 0.12)'
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

    // Clip drawing area — prevent curves from bleeding into timeline header
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, drawY, w, drawH)
    ctx.clip()

    // Center line (±0)
    ctx.strokeStyle = 'rgba(160, 140, 110, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(0, drawY + drawH / 2)
    ctx.lineTo(w, drawY + drawH / 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Base value indicator for active brush (ADR 118)
    if (activeBrush && pat) {
      const baseNorm = getBaseValueNormalized(activeBrush.target)
      if (baseNorm !== null) {
        const baseLabel = `base: ${(baseNorm * 100).toFixed(0)}%`
        ctx.fillStyle = activeBrush.color
        ctx.globalAlpha = 0.85
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(baseLabel, 6, drawY + 14)
        ctx.globalAlpha = 1.0
      }
    }

    // Draw only curves for the selected track (or FX when at top level)
    for (const curve of sweepData.curves) {
      // Skip legacy mute curves (removed from SweepTarget in ADR 118)
      if (curve.target.kind === 'mute' as string) continue
      // Filter: only show curves belonging to the expanded track
      if (expandedTrackId !== null) {
        if (curve.target.kind === 'fx') continue
        if ('trackId' in curve.target && curve.target.trackId !== expandedTrackId) continue
      } else {
        // Top-level: only show FX curves
        if (curve.target.kind !== 'fx') continue
      }
      const isActive = activeBrush && targetsEqual(curve.target, activeBrush.target)
      drawCurve(ctx, curve, w, drawY, drawH, isActive ? 1.0 : 0.3)
    }

    // Draw current freehand stroke
    if (drawing && rawPoints.length > 1 && activeBrush) {
      ctx.strokeStyle = activeBrush.color
      ctx.lineWidth = 3
      ctx.globalAlpha = 0.85
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(tToX(rawPoints[0].t, w), drawY + (0.5 - rawPoints[0].v / 2) * drawH)
      for (let i = 1; i < rawPoints.length; i++) {
        ctx.lineTo(tToX(rawPoints[i].t, w), drawY + (0.5 - rawPoints[i].v / 2) * drawH)
      }
      ctx.stroke()
      ctx.globalAlpha = 1.0
    }

    // Restore clip (curves done)
    ctx.restore()

    // Repaint timeline header to ensure no bleed-through
    ctx.fillStyle = '#f5f0e6'
    ctx.fillRect(0, 0, w, TIMELINE_H)
    // Re-draw timeline header content
    ctx.fillStyle = isZoomed ? 'rgba(160, 140, 110, 0.12)' : 'rgba(160, 140, 110, 0.08)'
    ctx.fillRect(0, 0, w, TIMELINE_H)
    ctx.strokeStyle = 'rgba(160, 140, 110, 0.15)'
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
        ctx.strokeStyle = 'rgba(160, 140, 110, 0.25)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, TIMELINE_H - (isBeat ? 8 : 4))
        ctx.lineTo(x, TIMELINE_H)
        ctx.stroke()
      }
    }
    // Re-draw labels
    ctx.fillStyle = 'rgba(120, 100, 70, 0.5)'
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
        ctx.fillText(`${r + 1}`, x, 12)
      }
    }

    // Playback cursor — uses longest track's playhead for accurate position
    if (playback.playing && rc > 0) {
      const stepsArr = pat ? pat.cells.map(c => c.steps) : [16]
      const longestIdx = stepsArr.indexOf(Math.max(...stepsArr))
      const currentStep = playback.playheads[longestIdx] ?? 0
      const repIdx = playback.sceneRepeatTotal > 1 ? playback.sceneRepeatIndex : 0
      const progress = (repIdx + currentStep / spp) / rc
      const cx = tToX(progress, w)
      if (cx >= 0 && cx <= w) {
        ctx.strokeStyle = 'rgba(196, 122, 42, 0.7)'
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

    // Extension lines for partial curves (dotted line showing held value)
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

    // Build smooth path
    const tracePath = (ctx: CanvasRenderingContext2D) => {
      ctx.moveTo(xFor(first.t), yForV(first.v))
      if (pts.length <= 2) {
        ctx.lineTo(xFor(last.t), yForV(last.v))
      } else {
        // Catmull-Rom spline: sample at sub-pixel resolution for smooth curves
        const steps = Math.max(pts.length * 8, 40)
        for (let s = 1; s <= steps; s++) {
          const progress = s / steps
          const t = first.t + progress * (last.t - first.t)
          // Find segment
          let si = 0
          for (let j = 0; j < pts.length - 1; j++) {
            if (t >= pts[j].t && t <= pts[j + 1].t) { si = j; break }
          }
          const p0 = pts[Math.max(0, si - 1)]
          const p1 = pts[si]
          const p2 = pts[si + 1]
          const p3 = pts[Math.min(pts.length - 1, si + 2)]
          const seg = (p2.t - p1.t) > 0.0001 ? (t - p1.t) / (p2.t - p1.t) : 0
          const seg2 = seg * seg, seg3 = seg2 * seg
          const v = 0.5 * (
            (2 * p1.v) +
            (-p0.v + p2.v) * seg +
            (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * seg2 +
            (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * seg3
          )
          ctx.lineTo(xFor(t), yForV(v))
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

    // Filled area
    ctx.globalAlpha = alpha * 0.15
    ctx.fillStyle = curve.color
    pathFn('fill')
    ctx.fill()

    // Stroke
    ctx.strokeStyle = curve.color
    ctx.lineWidth = isActive ? 3 : 1.5
    ctx.globalAlpha = alpha
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    pathFn('stroke')
    ctx.stroke()

    // Dots on anchor points for active curve
    if (isActive) {
      ctx.fillStyle = curve.color
      for (const p of pts) {
        const px = xFor(p.t)
        if (px < -5 || px > w + 5) continue
        ctx.beginPath()
        ctx.arc(px, yForV(p.v), drawMode === 'bezier' ? 5 : 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1.0
  }

  /** Get the base value of a parameter as a 0–1 normalized value */
  function getBaseValueNormalized(target: SweepTarget): number | null {
    if (!pat) return null
    if (target.kind === 'track') {
      const track = song.tracks.find(t => t.id === target.trackId)
      if (!track) return null
      if (target.param === 'volume') return track.volume
      if (target.param === 'pan') return (track.pan + 1) / 2  // -1..1 → 0..1
      // Voice param
      const cell = pat.cells.find(c => c.trackId === target.trackId)
      if (!cell?.voiceId) return null
      const defs = getParamDefs(cell.voiceId as import('../types.ts').VoiceId)
      const def = defs.find(d => d.key === target.param)
      if (!def) return null
      const val = cell.voiceParams?.[target.param] ?? def.default
      return (val - def.min) / (def.max - def.min)
    }
    if (target.kind === 'fx') {
      if (target.param === 'reverbWet') return fxPad.verb.x
      if (target.param === 'reverbDamp') return fxPad.verb.y
      if (target.param === 'delayTime') return fxPad.delay.x
      if (target.param === 'delayFeedback') return fxPad.delay.y
    }
    return null
  }

  function targetsEqual(a: SweepTarget, b: SweepTarget): boolean {
    if (a.kind !== b.kind) return false
    if (a.kind === 'fx' && b.kind === 'fx') return a.param === b.param
    if (a.kind === 'track' && b.kind === 'track') return a.trackId === b.trackId && a.param === b.param
    if (a.kind === 'send' && b.kind === 'send') return a.trackId === b.trackId && a.param === b.param
    return false
  }

  // ── Pointer handlers ──
  function pointerToNorm(e: PointerEvent): { t: number; v: number } {
    if (!canvasEl) return { t: 0, v: 0 }
    const rect = canvasEl.getBoundingClientRect()
    const timelineH = TIMELINE_H * (rect.height / canvasH)
    // Map screen x to visible t-range
    const screenT = (e.clientX - rect.left) / rect.width
    const t = Math.max(0, Math.min(1, viewStart + screenT * viewSpan))
    const drawTop = rect.top + timelineH
    const drawHeight = rect.height - timelineH
    const y = (e.clientY - drawTop) / drawHeight
    const v = Math.max(-1, Math.min(1, (0.5 - y) * 2))
    return { t, v }
  }

  /** Check if pointer is in the timeline header area */
  function isInTimeline(e: PointerEvent): boolean {
    if (!canvasEl) return false
    const rect = canvasEl.getBoundingClientRect()
    const timelineH = TIMELINE_H * (rect.height / canvasH)
    return (e.clientY - rect.top) < timelineH
  }

  // ── Bézier helpers ──

  /** Find the index of a point near the pointer, or -1 */
  function hitTestPoint(e: PointerEvent): number {
    if (!activeBrush || !canvasEl) return -1
    const curve = sweepData.curves.find(c => targetsEqual(c.target, activeBrush.target))
    if (!curve) return -1
    const rect = canvasEl.getBoundingClientRect()
    const w = rect.width
    const timelineH = TIMELINE_H * (rect.height / canvasH)
    const drawH = rect.height - timelineH
    for (let i = 0; i < curve.points.length; i++) {
      const px = tToX(curve.points[i].t, w)
      const py = (0.5 - curve.points[i].v / 2) * drawH + timelineH
      const dx = e.clientX - rect.left - px
      const dy = e.clientY - rect.top - py
      if (Math.sqrt(dx * dx + dy * dy) < POINT_HIT_RADIUS) return i
    }
    return -1
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

    if (!activeBrush) return
    canvasEl.setPointerCapture(e.pointerId)

    if (drawMode === 'bezier') {
      const now = Date.now()
      const hitIdx = hitTestPoint(e)

      // Double-click → delete point
      if (hitIdx >= 0 && now - lastClickTime < 300) {
        lastClickTime = 0
        const curve = sweepData.curves.find(c => targetsEqual(c.target, activeBrush.target))
        if (curve && curve.points.length > 2) {
          pushUndo('Delete sweep point')
          const pts = [...curve.points]
          pts.splice(hitIdx, 1)
          commitCurve(activeBrush.target, activeBrush.color, pts)
          redraw()
        }
        return
      }
      lastClickTime = now

      if (hitIdx >= 0) {
        // Start dragging existing point
        draggingPointIdx = hitIdx
        drawing = true
      } else {
        // Add new point at click position
        const norm = pointerToNorm(e)
        const curve = sweepData.curves.find(c => targetsEqual(c.target, activeBrush.target))
        const pts = curve ? [...curve.points] : []
        pts.push(norm)
        pts.sort((a, b) => a.t - b.t)
        pushUndo('Add sweep point')
        commitCurve(activeBrush.target, activeBrush.color, pts)
        // Start dragging the newly added point
        draggingPointIdx = pts.findIndex(p => p.t === norm.t && p.v === norm.v)
        drawing = true
        redraw()
      }
      return
    }

    // Freehand mode
    drawing = true
    rawPoints = [pointerToNorm(e)]
  }

  function onPointerMove(e: PointerEvent) {
    if (!drawing) return

    if (drawMode === 'bezier' && draggingPointIdx !== null) {
      // Drag bézier point
      const norm = pointerToNorm(e)
      const curve = sweepData.curves.find(c => activeBrush && targetsEqual(c.target, activeBrush.target))
      if (curve && draggingPointIdx < curve.points.length) {
        const pts = [...curve.points]
        pts[draggingPointIdx] = norm
        pts.sort((a, b) => a.t - b.t)
        // Update dragging index after sort
        draggingPointIdx = pts.findIndex(p => p.t === norm.t && p.v === norm.v)
        commitCurve(activeBrush!.target, activeBrush!.color, pts)
        redraw()
      }
      return
    }

    // Freehand mode
    rawPoints.push(pointerToNorm(e))
    redraw()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault()
      const dir = e.code === 'ArrowUp' ? -1 : 1
      const len = paletteItems.length
      if (len > 0) {
        activeBrushIdx = ((activeBrushIdx + dir) % len + len) % len
        redraw()
      }
    }
  }

  function onPointerUp(_e: PointerEvent) {
    if (drawMode === 'bezier') {
      draggingPointIdx = null
      drawing = false
      return
    }

    if (!drawing || !activeBrush || !sweepNode) { drawing = false; return }
    drawing = false

    if (rawPoints.length < 2) {
      rawPoints = []
      return
    }

    let pts = smoothPoints(rawPoints)
    pts = rdpSimplify(pts, 0.03)
    commitCurve(activeBrush.target, activeBrush.color, pts)
    rawPoints = []
    redraw()
  }

  // ── Smoothing ──
  function smoothPoints(pts: { t: number; v: number }[]): { t: number; v: number }[] {
    const win = 6
    return pts.map((p, i) => {
      let sumV = 0, count = 0
      for (let j = Math.max(0, i - win); j <= Math.min(pts.length - 1, i + win); j++) {
        sumV += pts[j].v
        count++
      }
      return { t: p.t, v: sumV / count }
    })
  }

  // Ramer-Douglas-Peucker
  function rdpSimplify(pts: { t: number; v: number }[], epsilon: number): { t: number; v: number }[] {
    if (pts.length <= 2) return pts
    let maxDist = 0, maxIdx = 0
    const first = pts[0], last = pts[pts.length - 1]
    for (let i = 1; i < pts.length - 1; i++) {
      const d = pointLineDistance(pts[i], first, last)
      if (d > maxDist) { maxDist = d; maxIdx = i }
    }
    if (maxDist > epsilon) {
      const left = rdpSimplify(pts.slice(0, maxIdx + 1), epsilon)
      const right = rdpSimplify(pts.slice(maxIdx), epsilon)
      return [...left.slice(0, -1), ...right]
    }
    return [first, last]
  }

  function pointLineDistance(p: { t: number; v: number }, a: { t: number; v: number }, b: { t: number; v: number }): number {
    const dx = b.t - a.t, dy = b.v - a.v
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return Math.sqrt((p.t - a.t) ** 2 + (p.v - a.v) ** 2)
    return Math.abs(dx * (a.v - p.v) - (a.t - p.t) * dy) / len
  }

  // ── Commit curve to sweep data ──
  function commitCurve(target: SweepTarget, color: string, points: { t: number; v: number }[]) {
    if (!sweepNode) return
    pushUndo('Edit sweep curve')
    // Filter out legacy mute curves on any write
    const curves = sweepData.curves.filter(c => (c.target as { kind: string }).kind !== 'mute')
    // Replace existing curve for same target, or add new
    const existingIdx = curves.findIndex(c => targetsEqual(c.target, target))
    const newCurve: SweepCurve = { target, points, color }
    if (existingIdx >= 0) {
      curves[existingIdx] = newCurve
    } else {
      curves.push(newCurve)
    }
    sceneUpdateFnParams(sweepNode.id, { sweep: { curves } })
  }

  function deleteCurve(target: SweepTarget) {
    if (!sweepNode) return
    pushUndo('Delete sweep curve')
    const curves = sweepData.curves.filter(c => (c.target as { kind: string }).kind !== 'mute' && !targetsEqual(c.target, target))
    sceneUpdateFnParams(sweepNode.id, { sweep: { curves } })
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

  // Redraw on data or size change
  $effect(() => {
    // Touch reactive deps
    sweepData.curves.length
    canvasW
    canvasH
    activeBrushIdx
    zoomedRepeat
    playback.sceneRepeatIndex
    playback.playheads[0]
    redraw()
  })
</script>

<div class="sweep-root">
  <!-- Toolbar — matches PatternToolbar structure -->
  <div class="sweep-toolbar">
    <div class="sweep-pat-indicator">
      <span class="sweep-pat-dot" style="background: {patColor}"></span>
      <span class="sweep-pat-name">{patName}</span>
    </div>
    <div class="sweep-toolbar-spacer"></div>
    <div class="sweep-mode-toggle">
      <button class="sweep-mode-btn" class:active={drawMode === 'free'} onpointerdown={() => drawMode = 'free'}
        data-tip="Freehand draw" data-tip-ja="フリーハンド描画"
      >Draw</button>
      <button class="sweep-mode-btn" class:active={drawMode === 'bezier'} onpointerdown={() => drawMode = 'bezier'}
        data-tip="Click to add, drag to move, double-click to delete" data-tip-ja="クリックで追加、ドラッグで移動、ダブルクリックで削除"
      >Point</button>
    </div>
    <div class="sweep-toolbar-spacer"></div>
    <button class="sweep-close" onpointerdown={onClose}
      aria-label="Close sweep editor" data-tip="Close" data-tip-ja="閉じる"
    >✕</button>
  </div>
  <div class="sweep-layout">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- Palette — drill-down by track -->
    <div class="sweep-palette" tabindex="0" onkeydown={onKeyDown}>
      {#if expandedTrackId === null}
        <!-- Track list -->
        {#each trackList as entry}
          {@const hasAnyCurve = sweepData.curves.some(c => c.target.kind !== 'fx' && 'trackId' in c.target && c.target.trackId === entry.trackId)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="palette-track" class:has-curve={hasAnyCurve}
            onpointerdown={() => { expandedTrackId = entry.trackId; activeBrushIdx = 0 }}
          >
            <span class="palette-track-name">{entry.trackName}</span>
            <span class="palette-track-arrow">›</span>
          </div>
        {/each}
        <!-- FX params -->
        <div class="palette-group-sep">FX</div>
        {#each [
          { label: 'Verb Wet', target: { kind: 'fx' as const, param: 'reverbWet' as const }, color: '#6a9a8a' },
          { label: 'Verb Damp', target: { kind: 'fx' as const, param: 'reverbDamp' as const }, color: '#5a8a7a' },
          { label: 'Dly Time', target: { kind: 'fx' as const, param: 'delayTime' as const }, color: '#7a8a6a' },
          { label: 'Dly Fb', target: { kind: 'fx' as const, param: 'delayFeedback' as const }, color: '#8a7a5a' },
        ] as fxItem}
          {@const hasCurve = sweepData.curves.some(c => targetsEqual(c.target, fxItem.target))}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="palette-item" style="--accent: {fxItem.color}"
            onpointerdown={() => {
              expandedTrackId = null
              const idx = paletteItems.findIndex(p => targetsEqual(p.target, fxItem.target))
              if (idx >= 0) activeBrushIdx = idx
            }}
          >
            <span class="palette-dot" class:has-curve={hasCurve}></span>
            <span class="palette-label">{fxItem.label}</span>
          </div>
        {/each}
      {:else}
        <!-- Back button + param list for selected track -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="palette-back" onpointerdown={() => { expandedTrackId = null }}>
          <span>← {trackList.find(t => t.trackId === expandedTrackId)?.trackName ?? 'Back'}</span>
        </div>
        {#each paletteItems as item, i}
          {@const hasCurve = sweepData.curves.some(c => targetsEqual(c.target, item.target))}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="palette-item"
            class:active={activeBrushIdx === i}
            style="--accent: {item.color}"
            onpointerdown={() => { activeBrushIdx = i }}
          >
            <span class="palette-dot" class:has-curve={hasCurve}></span>
            <span class="palette-label">{item.label}</span>
            {#if hasCurve}
              <button class="palette-del" onpointerdown={(e: PointerEvent) => { e.stopPropagation(); deleteCurve(item.target) }}
                data-tip="Delete curve" data-tip-ja="カーブを削除"
              >✕</button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <!-- Canvas -->
    <div class="sweep-canvas-wrap" bind:this={canvasWrapEl}>
      <!-- svelte-ignore a11y_positive_tabindex -->
      <canvas
        bind:this={canvasEl}
        class="sweep-canvas"
        class:bezier-mode={drawMode === 'bezier'}
        tabindex="0"
        onpointerdown={(e) => { canvasEl?.focus(); onPointerDown(e) }}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onkeydown={onKeyDown}
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
  }

  /* ── Toolbar ── */
  .sweep-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px 10px;
    background: var(--color-bg);
    border-bottom: 1px solid rgba(30, 32, 40, 0.08);
    flex-shrink: 0;
  }
  .sweep-pat-indicator {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .sweep-pat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .sweep-pat-name {
    font-size: 11px;
    font-weight: 600;
    color: rgba(80, 70, 50, 0.7);
  }
  .sweep-mode-toggle {
    display: flex;
    gap: 1px;
    background: rgba(80, 70, 50, 0.06);
    border: 1px solid rgba(80, 70, 50, 0.1);
    border-radius: 4px;
    padding: 1px;
  }
  .sweep-mode-btn {
    all: unset;
    padding: 3px 10px;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: rgba(80, 70, 50, 0.4);
    border-radius: 3px;
    cursor: pointer;
  }
  .sweep-mode-btn:hover { color: rgba(80, 70, 50, 0.7); }
  .sweep-mode-btn.active {
    background: rgba(80, 70, 50, 0.12);
    color: rgba(80, 70, 50, 0.9);
    font-weight: 600;
  }
  .sweep-toolbar-spacer { flex: 1; }
  .sweep-close {
    border: 1.5px solid var(--color-fg);
    background: transparent;
    color: var(--color-fg);
    width: 24px;
    height: 24px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
  }
  .sweep-layout {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 8px;
    padding: 8px;
  }

  /* ── Palette ── */
  .sweep-palette:focus { outline: none; }
  .sweep-palette {
    width: 140px;
    flex-shrink: 0;
    overflow-y: auto;
    padding: 4px 0;
    border-right: 1px solid rgba(237, 232, 220, 0.08);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .palette-track {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
    color: rgba(80, 70, 50, 0.7);
    font-size: 11px;
    font-weight: 600;
  }
  .palette-track:hover { background: rgba(80, 70, 50, 0.06); }
  .palette-track.has-curve { color: rgba(80, 70, 50, 0.9); }
  .palette-track-name { flex: 1; }
  .palette-track-arrow {
    font-size: 14px;
    opacity: 0.4;
  }
  .palette-group-sep {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: rgba(80, 70, 50, 0.4);
    padding: 10px 8px 3px;
    text-transform: uppercase;
  }
  .palette-back {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(80, 70, 50, 0.7);
    border-bottom: 1px solid rgba(80, 70, 50, 0.1);
    margin-bottom: 4px;
  }
  .palette-back:hover { background: rgba(80, 70, 50, 0.06); }
  .palette-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 16px;
    border: none;
    background: transparent;
    color: rgba(80, 70, 50, 0.55);
    font-size: 11px;
    cursor: pointer;
    border-radius: 4px;
    text-align: left;
    position: relative;
  }
  .palette-item:hover {
    background: rgba(80, 70, 50, 0.06);
  }
  .palette-item.active {
    background: rgba(80, 70, 50, 0.1);
    color: rgba(80, 70, 50, 0.9);
  }
  .palette-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--accent);
    flex-shrink: 0;
  }
  .palette-dot.has-curve {
    background: var(--accent);
  }
  .palette-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .palette-del {
    all: unset;
    font-size: 9px;
    opacity: 0.4;
    cursor: pointer;
    padding: 0 2px;
  }
  .palette-del:hover {
    opacity: 1;
  }

  /* ── Canvas ── */
  .sweep-canvas-wrap {
    flex: 1;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-radius: 6px;
    border: 1px solid rgba(160, 140, 110, 0.2);
    box-shadow: inset 0 1px 4px rgba(120, 100, 70, 0.08);
  }
  .sweep-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    touch-action: none;
  }
  .sweep-canvas:focus { outline: none; }
  .sweep-canvas.bezier-mode {
    cursor: default;
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
    font-size: 9px;
    color: rgba(120, 100, 70, 0.4);
  }

</style>
