<script lang="ts">
  // NOTE: Large file by design — curve painting, bézier editing, target palette, and canvas rendering
  import { song, ui, playback, pushUndo, fxPad, masterPad, perf } from '../state.svelte.ts'
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
    isMix?: boolean  // true for volume, pan, sends — outline dot; false for voice params — filled dot
    category: 'mix' | 'synth' | 'send'
  }

  const PARAM_COLORS = [
    '#d94030', '#2878c0', '#c8a020', '#28a060',
    '#a838a8', '#e06848', '#1898a0', '#889020',
    '#c07828', '#5858d0', '#20a8a8', '#a0a030',
  ]

  // ── Drill-down palette ──
  // null = top-level list, number = per-track params, 'all'/'eq'/'fx' = global sections
  let expandedTrackId = $state<number | null>(null)
  let expandedSection = $state<'master' | 'eq' | 'fx' | null>(null)

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
    if (!pat) return []
    // MASTER section: master bus parameters
    if (expandedSection === 'master') {
      const masterItems: { label: string; param: SweepTarget & { kind: 'master' } extends { param: infer P } ? P : never; category: 'mix' | 'synth' | 'send' }[] = [
        { label: 'Volume', param: 'masterVolume', category: 'mix' },
        { label: 'Swing', param: 'swing', category: 'mix' },
        { label: 'Comp thr', param: 'compThreshold', category: 'synth' },
        { label: 'Comp rat', param: 'compRatio', category: 'synth' },
        { label: 'Duck dep', param: 'duckDepth', category: 'synth' },
        { label: 'Duck rel', param: 'duckRelease', category: 'synth' },
        { label: 'Ret verb', param: 'retVerb', category: 'send' },
        { label: 'Ret dly', param: 'retDelay', category: 'send' },
        { label: 'Sat drv', param: 'satDrive', category: 'send' },
        { label: 'Sat tone', param: 'satTone', category: 'send' },
      ]
      return masterItems.map((m, i) => ({
        label: m.label,
        target: { kind: 'master' as const, param: m.param },
        color: PARAM_COLORS[i % PARAM_COLORS.length],
        isMix: true,
        category: m.category,
      }))
    }
    // FX section: global effect parameters, grouped by effect unit
    if (expandedSection === 'fx') {
      type FxParam = SweepTarget & { kind: 'fx' } extends { param: infer P } ? P : never
      const fxItems: { label: string; param: FxParam; group: string }[] = [
        { label: 'Verb wet', param: 'reverbWet', group: 'verb' },
        { label: 'Verb damp', param: 'reverbDamp', group: 'verb' },
        { label: 'Dly time', param: 'delayTime', group: 'delay' },
        { label: 'Dly feed', param: 'delayFeedback', group: 'delay' },
        { label: 'Filter freq', param: 'filterCutoff', group: 'filter' },
        { label: 'Filter reso', param: 'filterResonance', group: 'filter' },
        { label: 'Glitch X', param: 'glitchX', group: 'glitch' },
        { label: 'Glitch Y', param: 'glitchY', group: 'glitch' },
        { label: 'Gran size', param: 'granularSize', group: 'granular' },
        { label: 'Gran dens', param: 'granularDensity', group: 'granular' },
      ]
      return fxItems.map((f, i) => ({
        label: f.label,
        target: { kind: 'fx' as const, param: f.param },
        color: PARAM_COLORS[i % PARAM_COLORS.length],
        isMix: true,
        category: f.group as 'mix' | 'synth' | 'send',
      }))
    }
    // EQ section: 3 bands × freq/gain/q
    if (expandedSection === 'eq') {
      const bands = [
        { band: 'eqLow' as const, label: 'Low' },
        { band: 'eqMid' as const, label: 'Mid' },
        { band: 'eqHigh' as const, label: 'High' },
      ]
      const params = ['freq', 'gain', 'q'] as const
      const items: PaletteItem[] = []
      let colorIdx = 0
      for (const b of bands) {
        for (const p of params) {
          items.push({
            label: `${b.label} ${p}`,
            target: { kind: 'eq', band: b.band, param: p },
            color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length],
            isMix: true,
            category: b.band === 'eqLow' ? 'mix' : b.band === 'eqMid' ? 'synth' : 'send',
          })
        }
      }
      return items
    }
    // Per-track params
    if (expandedTrackId === null) return []
    const cell = pat.cells.find(c => c.trackId === expandedTrackId)
    if (!cell) return []
    const items: PaletteItem[] = []
    let colorIdx = 0
    // Mix params
    items.push({ label: 'Volume', target: { kind: 'track', trackId: expandedTrackId, param: 'volume' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length], isMix: true, category: 'mix' })
    items.push({ label: 'Pan', target: { kind: 'track', trackId: expandedTrackId, param: 'pan' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length], isMix: true, category: 'mix' })
    // Voice-specific params from paramDefs
    const voiceId = cell.voiceId
    if (voiceId) {
      const defs = getParamDefs(voiceId)
      for (const def of defs) {
        items.push({
          label: def.label,
          target: { kind: 'track', trackId: expandedTrackId, param: def.key as 'cutoff' },
          color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length],
          category: 'synth',
        })
      }
    }
    // Send levels
    items.push({ label: 'Verb', target: { kind: 'send', trackId: expandedTrackId, param: 'reverbSend' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length], isMix: true, category: 'send' })
    items.push({ label: 'Delay', target: { kind: 'send', trackId: expandedTrackId, param: 'delaySend' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length], isMix: true, category: 'send' })
    items.push({ label: 'Glitch', target: { kind: 'send', trackId: expandedTrackId, param: 'glitchSend' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length], isMix: true, category: 'send' })
    items.push({ label: 'Grain', target: { kind: 'send', trackId: expandedTrackId, param: 'granularSend' }, color: PARAM_COLORS[colorIdx++ % PARAM_COLORS.length], isMix: true, category: 'send' })
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
    ctx.fillStyle = isZoomed ? 'rgba(30, 32, 40, 0.08)' : 'rgba(30, 32, 40, 0.05)'
    ctx.fillRect(0, 0, w, TIMELINE_H)
    ctx.strokeStyle = 'rgba(30, 32, 40, 0.1)'
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
        ctx.strokeStyle = 'rgba(30, 32, 40, 0.2)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      // Tick in timeline header
      const showTick = isZoomed ? true : isBeat
      if (showTick) {
        ctx.strokeStyle = 'rgba(30, 32, 40, 0.15)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, TIMELINE_H - (isBeat ? 8 : 4))
        ctx.lineTo(x, TIMELINE_H)
        ctx.stroke()
      }
    }

    // Timeline labels
    ctx.fillStyle = 'rgba(30, 32, 40, 0.5)'
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
        ctx.fillText(`R${r + 1}`, x, 12)
      }
    }

    // ── Drawing area (below timeline) ──
    const drawH = h - TIMELINE_H
    const drawY = TIMELINE_H

    // Grid dots in drawing area
    ctx.fillStyle = 'rgba(30, 32, 40, 0.08)'
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
    ctx.strokeStyle = 'rgba(30, 32, 40, 0.2)'
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

    // Draw curves: all at top level, filtered when track/section is expanded
    for (const curve of sweepData.curves) {
      if (curve.target.kind === 'mute' as string) continue
      if (expandedSection === 'master') {
        if (curve.target.kind !== 'master') continue
      } else if (expandedSection === 'fx') {
        if (curve.target.kind !== 'fx') continue
      } else if (expandedSection === 'eq') {
        if (curve.target.kind !== 'eq') continue
      } else if (expandedTrackId !== null) {
        // Track drill-down: only show this track's curves
        if (curve.target.kind === 'fx' || curve.target.kind === 'master' || curve.target.kind === 'eq') continue
        if ('trackId' in curve.target && curve.target.trackId !== expandedTrackId) continue
      }
      const isActive = activeBrush && targetsEqual(curve.target, activeBrush.target)
      drawCurve(ctx, curve, w, drawY, drawH, isActive ? 1.0 : 0.2)
    }

    // Draw current freehand stroke — thick brush feel
    if (drawing && rawPoints.length > 1 && activeBrush) {
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      // Outer thick stroke
      ctx.strokeStyle = activeBrush.color
      ctx.lineWidth = 8
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.moveTo(tToX(rawPoints[0].t, w), drawY + (0.5 - rawPoints[0].v / 2) * drawH)
      for (let i = 1; i < rawPoints.length; i++) {
        ctx.lineTo(tToX(rawPoints[i].t, w), drawY + (0.5 - rawPoints[i].v / 2) * drawH)
      }
      ctx.stroke()
      // Inner bright stroke
      ctx.lineWidth = 3
      ctx.globalAlpha = 0.8
      ctx.stroke()
      ctx.globalAlpha = 1.0
    }

    // Halation clear effect
    if (halationProgress !== null) {
      const cx = w / 2
      const cy = drawY + drawH / 2
      const maxR = Math.sqrt(w * w + drawH * drawH)
      const r = halationProgress * maxR * 1.2
      const ringW = maxR * 0.15

      // Expanding ring of amber
      for (let i = 3; i >= 0; i--) {
        const ri = r - i * ringW * 0.3
        if (ri <= 0) continue
        ctx.beginPath()
        ctx.arc(cx, cy, ri, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(196, 122, 42, ${0.08 * (4 - i)})`
        ctx.fill()
      }

      // White-out behind the ring (erase effect)
      if (r > ringW) {
        ctx.beginPath()
        ctx.arc(cx, cy, r - ringW, 0, Math.PI * 2)
        ctx.fillStyle = '#f5f0e6'
        ctx.fill()
      }
    }

    // Restore clip (curves done)
    ctx.restore()

    // Repaint timeline header to ensure no bleed-through
    ctx.fillStyle = '#f5f0e6'
    ctx.fillRect(0, 0, w, TIMELINE_H)
    // Re-draw timeline header content
    ctx.fillStyle = isZoomed ? 'rgba(30, 32, 40, 0.08)' : 'rgba(30, 32, 40, 0.05)'
    ctx.fillRect(0, 0, w, TIMELINE_H)
    ctx.strokeStyle = 'rgba(30, 32, 40, 0.1)'
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
        ctx.strokeStyle = 'rgba(30, 32, 40, 0.15)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, TIMELINE_H - (isBeat ? 8 : 4))
        ctx.lineTo(x, TIMELINE_H)
        ctx.stroke()
      }
    }
    // Re-draw labels
    ctx.fillStyle = 'rgba(30, 32, 40, 0.5)'
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

  function isMixTarget(target: SweepTarget): boolean {
    if (target.kind === 'send') return true
    if (target.kind === 'track' && (target.param === 'volume' || target.param === 'pan')) return true
    return false
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

    const mix = isMixTarget(curve.target)

    // Fill — solid for synth, hatched for mix
    ctx.save()
    ctx.globalAlpha = alpha * 0.35
    if (mix) {
      // Diagonal stripe pattern
      const pat = document.createElement('canvas')
      pat.width = 6; pat.height = 6
      const pc = pat.getContext('2d')!
      pc.strokeStyle = curve.color
      pc.lineWidth = 1.5
      pc.beginPath()
      pc.moveTo(0, 6); pc.lineTo(6, 0)
      pc.stroke()
      const pattern = ctx.createPattern(pat, 'repeat')
      if (pattern) {
        ctx.fillStyle = pattern
        ctx.globalAlpha = alpha * 0.25
      }
    } else {
      ctx.fillStyle = curve.color
    }
    pathFn('fill')
    ctx.fill()
    ctx.restore()

    // Thick brush stroke
    ctx.strokeStyle = curve.color
    ctx.lineWidth = isActive ? 6 : 3
    ctx.globalAlpha = alpha * 0.7
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    pathFn('stroke')
    ctx.stroke()

    // Bright center line for definition
    if (isActive) {
      ctx.strokeStyle = curve.color
      ctx.lineWidth = 2
      ctx.globalAlpha = alpha
      pathFn('stroke')
      ctx.stroke()
    }

    // Anchor dots in bézier mode
    if (isActive && drawMode === 'bezier') {
      ctx.fillStyle = curve.color
      ctx.globalAlpha = alpha
      for (const p of pts) {
        const px = xFor(p.t)
        if (px < -5 || px > w + 5) continue
        ctx.beginPath()
        ctx.arc(px, yForV(p.v), 5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1.0
  }

  /** Get the base value of a parameter as a 0–1 normalized value */
  function getBaseValueNormalized(target: SweepTarget): number | null {
    if (!pat) return null
    if (target.kind === 'master') {
      const MASTER_BASE: Record<string, () => number> = {
        masterVolume: () => perf.masterGain,
        swing: () => perf.swing,
        compThreshold: () => masterPad.comp.x,
        compRatio: () => masterPad.comp.y,
        duckDepth: () => masterPad.duck.x,
        duckRelease: () => masterPad.duck.y,
        retVerb: () => masterPad.ret.x,
        retDelay: () => masterPad.ret.y,
        satDrive: () => masterPad.sat.x,
        satTone: () => masterPad.sat.y,
      }
      const fn = MASTER_BASE[target.param]
      return fn ? fn() : null
    }
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
    if (target.kind === 'send') {
      const cell = pat.cells.find(c => c.trackId === target.trackId)
      if (!cell) return null
      return cell[target.param]
    }
    if (target.kind === 'fx') {
      const FX_BASE: Record<string, [keyof typeof fxPad, string]> = {
        reverbWet: ['verb', 'x'], reverbDamp: ['verb', 'y'],
        delayTime: ['delay', 'x'], delayFeedback: ['delay', 'y'],
        filterCutoff: ['filter', 'x'], filterResonance: ['filter', 'y'],
        glitchX: ['glitch', 'x'], glitchY: ['glitch', 'y'],
        granularSize: ['granular', 'x'], granularDensity: ['granular', 'y'],
      }
      const m = FX_BASE[target.param]
      if (m) return (fxPad[m[0]] as Record<string, number | boolean>)[m[1]] as number
    }
    if (target.kind === 'eq') {
      const pad = fxPad[target.band]
      const key = target.param === 'freq' ? 'x' : target.param === 'gain' ? 'y' : 'q'
      return key === 'q' ? (pad[key] as number) / 3 : pad[key] as number  // q: 0–3 → 0–1
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

  // ── Presets ──
  const SWEEP_PRESETS = [
    { name: '╱', tip: 'Ramp Up', tipJa: 'ランプアップ',
      points: [{ t: 0, v: 0 }, { t: 1, v: 1 }] },
    { name: '╲', tip: 'Ramp Down', tipJa: 'ランプダウン',
      points: [{ t: 0, v: 0 }, { t: 1, v: -1 }] },
    { name: '╱╲', tip: 'Triangle', tipJa: 'トライアングル',
      points: [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }] },
    { name: '╲╱', tip: 'V (Dip)', tipJa: 'V (ディップ)',
      points: [{ t: 0, v: 0 }, { t: 0.5, v: -1 }, { t: 1, v: 0 }] },
    { name: '⌒', tip: 'S-Curve Up', tipJa: 'S字上昇',
      points: [{ t: 0, v: 0 }, { t: 0.2, v: 0.05 }, { t: 0.5, v: 0.4 }, { t: 0.8, v: 0.9 }, { t: 1, v: 1 }] },
  ] as const

  let presetOpen = $state(false)

  function applyPreset(preset: typeof SWEEP_PRESETS[number]) {
    if (!activeBrush || !sweepNode) return
    pushUndo('Apply sweep preset')
    commitCurve(activeBrush.target, activeBrush.color, [...preset.points])
    presetOpen = false
    redraw()
  }

  // ── Clear all with halation effect ──
  let halationProgress = $state<number | null>(null)
  function clearAllWithHalation() {
    if (!sweepNode || halationProgress !== null) return
    const startTime = performance.now()
    const duration = 600  // ms

    function animate() {
      const elapsed = performance.now() - startTime
      halationProgress = Math.min(1, elapsed / duration)
      redraw()

      if (halationProgress < 1) {
        requestAnimationFrame(animate)
      } else {
        // Actually clear
        pushUndo('Clear all sweep curves')
        sceneUpdateFnParams(sweepNode!.id, { sweep: { curves: [] } })
        halationProgress = null
        redraw()
      }
    }
    requestAnimationFrame(animate)
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
    <span class="sweep-toolbar-sep"></span>
    <div class="sweep-preset-wrap">
      <button class="sweep-preset-btn" class:open={presetOpen}
        onpointerdown={() => { presetOpen = !presetOpen }}
        data-tip="Apply preset shape" data-tip-ja="プリセット形状を適用"
      >Shape</button>
      {#if presetOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="sweep-preset-backdrop" onpointerdown={() => { presetOpen = false }}></div>
        <div class="sweep-preset-dropdown">
          {#each SWEEP_PRESETS as preset}
            <button class="sweep-preset-option" onpointerdown={() => applyPreset(preset)}
              data-tip={preset.tip} data-tip-ja={preset.tipJa}
            >
              <span class="sweep-preset-icon">{preset.name}</span>
              <span class="sweep-preset-label">{preset.tip}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="sweep-preset-btn" onpointerdown={clearAllWithHalation}
      data-tip="Clear all curves" data-tip-ja="全カーブを消去"
    >Clear</button>
    <div class="sweep-toolbar-spacer"></div>
    <button class="sweep-close" onpointerdown={onClose}
      aria-label="Close sweep editor" data-tip="Close" data-tip-ja="閉じる"
    >✕</button>
  </div>
  <div class="sweep-layout">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- Palette — drill-down by track -->
    <div class="sweep-palette" tabindex="0" onkeydown={onKeyDown}>
      {#if expandedTrackId === null && expandedSection === null}
        <!-- MASTER entry -->
        {@const hasMasterCurve = sweepData.curves.some(c => c.target.kind === 'master')}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="palette-track" class:has-curve={hasMasterCurve}
          onpointerdown={() => { expandedSection = 'master'; activeBrushIdx = 0 }}
        >
          <span class="palette-track-name">MASTER</span>
          <span class="palette-track-arrow">›</span>
        </div>
        <div class="palette-cat-sep"></div>
        <!-- Track list -->
        {#each trackList as entry}
          {@const hasAnyCurve = sweepData.curves.some(c => c.target.kind !== 'fx' && c.target.kind !== 'eq' && c.target.kind !== 'master' && 'trackId' in c.target && c.target.trackId === entry.trackId)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="palette-track" class:has-curve={hasAnyCurve}
            onpointerdown={() => { expandedTrackId = entry.trackId; activeBrushIdx = 0 }}
          >
            <span class="palette-track-name">{entry.trackName}</span>
            <span class="palette-track-arrow">›</span>
          </div>
        {/each}
        <div class="palette-cat-sep"></div>
        <!-- FX entry -->
        {@const hasFxCurve = sweepData.curves.some(c => c.target.kind === 'fx')}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="palette-track" class:has-curve={hasFxCurve}
          onpointerdown={() => { expandedSection = 'fx'; activeBrushIdx = 0 }}
        >
          <span class="palette-track-name">FX</span>
          <span class="palette-track-arrow">›</span>
        </div>
        <!-- EQ entry -->
        {@const hasEqCurve = sweepData.curves.some(c => c.target.kind === 'eq')}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="palette-track" class:has-curve={hasEqCurve}
          onpointerdown={() => { expandedSection = 'eq'; activeBrushIdx = 0 }}
        >
          <span class="palette-track-name">EQ</span>
          <span class="palette-track-arrow">›</span>
        </div>
      {:else}
        <!-- Back button + param list for selected track/section -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="palette-back" onpointerdown={() => { expandedTrackId = null; expandedSection = null }}>
          <span>← {expandedSection === 'master' ? 'MASTER' : expandedSection === 'fx' ? 'FX' : expandedSection === 'eq' ? 'EQ' : trackList.find(t => t.trackId === expandedTrackId)?.trackName ?? 'Back'}</span>
        </div>
        {#each paletteItems as item, i}
          {@const hasCurve = sweepData.curves.some(c => targetsEqual(c.target, item.target))}
          {@const prevCat = i > 0 ? paletteItems[i - 1].category : null}
          {#if prevCat && prevCat !== item.category}
            <div class="palette-cat-sep"></div>
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="palette-item"
            class:active={activeBrushIdx === i}
            style="--accent: {item.color}"
            onpointerdown={() => { activeBrushIdx = i }}
          >
            <span class="palette-dot" class:has-curve={hasCurve} class:mix={item.isMix}></span>
            <span class="palette-label">{item.label}</span>
            {#if hasCurve}
              <button class="palette-del" onpointerdown={(e: PointerEvent) => { e.stopPropagation(); deleteCurve(item.target) }}
                data-tip="Delete curve" data-tip-ja="カーブを削除"
              >✕</button>
            {:else}
              <span class="palette-del-placeholder"></span>
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
    border-bottom: 1px solid rgba(30, 32, 40, 0.10);
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
    font-size: 11px;
    font-weight: 600;
    color: var(--color-muted);
  }
  .sweep-mode-toggle {
    display: flex;
    gap: 0;
  }
  .sweep-mode-btn + .sweep-mode-btn {
    margin-left: -1px;
  }
  .sweep-mode-btn {
    height: 24px;
    padding: 0 12px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--color-muted);
    text-align: center;
    cursor: pointer;
    user-select: none;
    border: 1px solid rgba(30, 32, 40, 0.15);
    background: transparent;
    transition: color 80ms, border-color 80ms, background 80ms;
    line-height: 24px;
  }
  .sweep-mode-btn.active {
    color: var(--color-fg);
    border-color: var(--color-fg);
    background: rgba(30, 32, 40, 0.06);
  }
  .sweep-preset-wrap {
    position: relative;
  }
  .sweep-preset-btn {
    border: 1.5px solid var(--color-olive);
    background: transparent;
    color: var(--color-olive);
    height: 24px;
    padding: 0 8px;
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .sweep-preset-btn.open {
    background: var(--color-olive);
    color: var(--color-bg);
  }
  .sweep-preset-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9;
  }
  .sweep-preset-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 10;
    min-width: 120px;
    background: var(--color-bg);
    border: 1px solid rgba(30, 32, 40, 0.15);
    display: flex;
    flex-direction: column;
    padding: 2px;
  }
  .sweep-preset-option {
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(30, 32, 40, 0.70);
    background: none;
    border: none;
    padding: 6px 8px;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    transition: background 40ms, color 40ms;
  }
  .sweep-preset-option:hover {
    background: rgba(30, 32, 40, 0.06);
    color: var(--color-fg);
  }
  .sweep-preset-icon {
    font-size: 11px;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
  }
  .sweep-preset-label {
    font-weight: 600;
  }
  .sweep-toolbar-sep {
    width: 1px;
    height: 16px;
    background: rgba(30, 32, 40, 0.12);
    margin: 0 4px;
    flex-shrink: 0;
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
    border-right: 1px solid rgba(30, 32, 40, 0.10);
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
    color: var(--color-muted);
    font-size: 11px;
    font-weight: 600;
  }
  .palette-track:hover { background: rgba(30, 32, 40, 0.06); }
  .palette-track.has-curve { color: var(--color-fg); }
  .palette-track-name { flex: 1; }
  .palette-track-arrow {
    font-size: 12px;
    opacity: 0.4;
  }
  .palette-back {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-muted);
    border-bottom: 1px solid rgba(30, 32, 40, 0.1);
    margin-bottom: 4px;
  }
  .palette-back:hover { background: rgba(30, 32, 40, 0.06); }
  .palette-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 4px 16px;
    border: none;
    background: transparent;
    color: var(--color-muted);
    font-size: 11px;
    cursor: pointer;
    border-radius: 4px;
    text-align: left;
    position: relative;
  }
  .palette-item:hover {
    background: rgba(30, 32, 40, 0.06);
  }
  .palette-item.active {
    background: rgba(30, 32, 40, 0.08);
    color: var(--color-fg);
  }
  .palette-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    background: var(--accent);
    flex-shrink: 0;
  }
  .palette-dot.mix {
    background: transparent;
  }
  .palette-dot.has-curve.mix {
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
    font-size: 12px;
    color: var(--color-muted);
    cursor: pointer;
    padding: 0 2px;
    width: 12px;
    text-align: center;
  }
  .palette-cat-sep {
    height: 1px;
    background: rgba(30, 32, 40, 0.10);
    margin: 4px 8px;
  }
  .palette-del-placeholder {
    width: 12px;
    flex-shrink: 0;
  }

  /* ── Canvas ── */
  .sweep-canvas-wrap {
    flex: 1;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid rgba(30, 32, 40, 0.10);
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
    color: var(--color-muted);
  }

</style>
