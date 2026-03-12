<script lang="ts">
  import { song, ui, playback, pushUndo } from '../state.svelte.ts'
  import type { AutomationPoint, AutomationTarget, AutomationParams } from '../state.svelte.ts'
  import { VOICE_LIST } from '../audio/dsp/voices.ts'
  import { sceneAddDecorator, sceneRemoveDecorator } from '../sceneActions.ts'

  const { nodeId, decoratorIndex, viewContext }: {
    nodeId: string;
    decoratorIndex: number;
    viewContext?: string | null;
  } = $props()

  // ── Data source ──
  const autoParams = $derived.by((): AutomationParams | null => {
    const node = song.scene.nodes.find(n => n.id === nodeId)
    if (!node?.decorators?.[decoratorIndex]) return null
    const dec = node.decorators[decoratorIndex]
    if (dec.type !== 'automation' || !dec.automationParams) return null
    return dec.automationParams
  })

  // Host pattern for context-aware targets
  const hostPattern = $derived.by(() => {
    const node = song.scene.nodes.find(n => n.id === nodeId)
    if (!node || node.type !== 'pattern' || !node.patternId) return null
    return song.patterns.find(p => p.id === node.patternId) ?? null
  })

  // ── Drawing mode ──
  let mode: 'pencil' | 'line' | 'eraser' | 'bezier' = $state('pencil')
  let interpolation = $derived(autoParams?.interpolation ?? 'linear')

  // ── Canvas ──
  let canvasEl: HTMLCanvasElement | undefined = $state()
  const W = 252, H = 120
  const PAD = { l: 4, r: 4, t: 6, b: 6 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  // ── Snap ──
  let snap: number = $state(0)
  const SNAP_OPTIONS = [
    { value: 0, label: 'OFF' },
    { value: 4, label: '1/4' },
    { value: 8, label: '1/8' },
    { value: 16, label: '1/16' },
  ]

  // ── Local undo ──
  let undoStack: AutomationPoint[][] = $state([])

  // ── Drag state ──
  let dragIndex: number = $state(-1)
  let dragging = $state(false)

  // ── Freehand state ──
  let freehandPoints: { x: number; y: number }[] = $state([])
  let isDrawing = $state(false)

  // ── Line mode state ──
  let lineStart: { t: number; v: number } | null = $state(null)

  // ── Eraser state ──
  let isErasing = $state(false)

  // ── Automation colors matched to XY pad node colors ──
  const OLIVE  = '#787845'
  const BLUE   = '#4472B4'
  const SALMON = '#E8A090'
  const PURPLE = '#9B6BA0'
  const TEAL   = '#4A9B9B'
  const AMBER  = 'hsl(35, 80%, 55%)'

  function targetColor(t?: AutomationTarget): string {
    if (!t) return AMBER
    if (t.kind === 'fx') {
      if (t.param.startsWith('reverb')) return OLIVE
      if (t.param.startsWith('delay')) return BLUE
      if (t.param.startsWith('glitch')) return SALMON
      if (t.param.startsWith('granular')) return PURPLE
      if (t.param.startsWith('filter')) return TEAL
    }
    if (t.kind === 'eq') {
      if (t.band === 'eqLow') return OLIVE
      if (t.band === 'eqMid') return BLUE
      if (t.band === 'eqHigh') return SALMON
    }
    if (t.kind === 'global') {
      if (t.param.startsWith('comp')) return OLIVE
      if (t.param.startsWith('duck')) return BLUE
      if (t.param.startsWith('ret')) return SALMON
    }
    if (t.kind === 'track') return TEAL
    if (t.kind === 'send') {
      if (t.param === 'reverbSend') return OLIVE
      if (t.param === 'delaySend') return BLUE
      if (t.param === 'glitchSend') return SALMON
      if (t.param === 'granularSend') return PURPLE
    }
    return AMBER
  }

  function curveColor(): string {
    return targetColor(autoParams?.target)
  }

  // ── Target options ──
  type TargetOption = { label: string; target: AutomationTarget }
  const targetOptions = $derived.by((): { group: string; items: TargetOption[] }[] => {
    const groups: { group: string; items: TargetOption[] }[] = [
      { group: 'Global', items: [
        { label: 'Tempo', target: { kind: 'global', param: 'tempo' } },
        { label: 'Master Vol', target: { kind: 'global', param: 'masterVolume' } },
        { label: 'Swing', target: { kind: 'global', param: 'swing' } },
      ]},
      { group: 'Master', items: [
        { label: 'Comp THR', target: { kind: 'global', param: 'compThreshold' } },
        { label: 'Comp RAT', target: { kind: 'global', param: 'compRatio' } },
        { label: 'Comp MKP', target: { kind: 'global', param: 'compMakeup' } },
        { label: 'Comp ATK', target: { kind: 'global', param: 'compAttack' } },
        { label: 'Comp REL', target: { kind: 'global', param: 'compRelease' } },
        { label: 'Duck DPT', target: { kind: 'global', param: 'duckDepth' } },
        { label: 'Duck REL', target: { kind: 'global', param: 'duckRelease' } },
        { label: 'Ret VRB', target: { kind: 'global', param: 'retVerb' } },
        { label: 'Ret DLY', target: { kind: 'global', param: 'retDelay' } },
      ]},
    ]
    const trackIndices: number[] = []
    if (hostPattern) {
      for (const c of hostPattern.cells) { if (c.voiceId) trackIndices.push(c.trackId) }
    } else {
      for (const t of song.tracks) trackIndices.push(t.id)
    }
    const trackItems: TargetOption[] = []
    for (const i of trackIndices) {
      const vl = getVoiceLabel(i)
      trackItems.push({ label: `T${i + 1} ${vl} Vol`, target: { kind: 'track', trackIndex: i, param: 'volume' } })
      trackItems.push({ label: `T${i + 1} ${vl} Pan`, target: { kind: 'track', trackIndex: i, param: 'pan' } })
    }
    if (trackItems.length > 0) groups.push({ group: 'Track', items: trackItems })
    groups.push({ group: 'FX', items: [
      { label: 'Reverb Wet', target: { kind: 'fx', param: 'reverbWet' } },
      { label: 'Reverb Damp', target: { kind: 'fx', param: 'reverbDamp' } },
      { label: 'Delay Time', target: { kind: 'fx', param: 'delayTime' } },
      { label: 'Delay FB', target: { kind: 'fx', param: 'delayFeedback' } },
      { label: 'Filter Cut', target: { kind: 'fx', param: 'filterCutoff' } },
      { label: 'Glitch X', target: { kind: 'fx', param: 'glitchX' } },
      { label: 'Glitch Y', target: { kind: 'fx', param: 'glitchY' } },
      { label: 'Gran Size', target: { kind: 'fx', param: 'granularSize' } },
      { label: 'Gran Dens', target: { kind: 'fx', param: 'granularDensity' } },
    ]})
    const sendItems: TargetOption[] = []
    for (const i of trackIndices) {
      const vl = getVoiceLabel(i)
      sendItems.push({ label: `T${i + 1} ${vl} VrbSnd`, target: { kind: 'send', trackIndex: i, param: 'reverbSend' } })
      sendItems.push({ label: `T${i + 1} ${vl} DlySnd`, target: { kind: 'send', trackIndex: i, param: 'delaySend' } })
    }
    if (sendItems.length > 0) groups.push({ group: 'Send', items: sendItems })
    groups.push({ group: 'EQ', items: [
      { label: 'Low Freq', target: { kind: 'eq', band: 'eqLow', param: 'freq' } },
      { label: 'Low Gain', target: { kind: 'eq', band: 'eqLow', param: 'gain' } },
      { label: 'Low Q', target: { kind: 'eq', band: 'eqLow', param: 'q' } },
      { label: 'Mid Freq', target: { kind: 'eq', band: 'eqMid', param: 'freq' } },
      { label: 'Mid Gain', target: { kind: 'eq', band: 'eqMid', param: 'gain' } },
      { label: 'Mid Q', target: { kind: 'eq', band: 'eqMid', param: 'q' } },
      { label: 'High Freq', target: { kind: 'eq', band: 'eqHigh', param: 'freq' } },
      { label: 'High Gain', target: { kind: 'eq', band: 'eqHigh', param: 'gain' } },
      { label: 'High Q', target: { kind: 'eq', band: 'eqHigh', param: 'q' } },
    ]})

    // Filter to match dock knobs/XY pad params in each overlay view
    if (viewContext === 'fx') return groups.filter(g => g.group === 'FX' || g.group === 'Send')
    if (viewContext === 'master') return groups.filter(g => g.group === 'Global' || g.group === 'Master')
    if (viewContext === 'eq') return groups.filter(g => g.group === 'EQ')
    return groups
  })

  function getVoiceLabel(trackIndex: number): string {
    const pat = hostPattern ?? song.patterns[ui.currentPattern]
    const vid = pat?.cells.find(c => c.trackId === trackIndex)?.voiceId
    if (!vid) return ''
    const meta = VOICE_LIST.find(v => v.id === vid)
    return meta?.label ?? vid.slice(0, 4).toUpperCase()
  }

  function targetKey(t: AutomationTarget): string {
    if (t.kind === 'global') return `global:${t.param}`
    if (t.kind === 'track') return `track:${t.trackIndex}:${t.param}`
    if (t.kind === 'fx') return `fx:${t.param}`
    if (t.kind === 'eq') return `eq:${t.band}:${t.param}`
    return `send:${(t as any).trackIndex}:${t.param}`
  }

  function findTargetByKey(key: string): AutomationTarget | null {
    for (const g of targetOptions) {
      for (const item of g.items) {
        if (targetKey(item.target) === key) return item.target
      }
    }
    return null
  }

  const currentTargetKey = $derived(autoParams ? targetKey(autoParams.target) : '')

  // ── Mutation helpers ──
  function getParamsRef(): AutomationParams | null {
    const node = song.scene.nodes.find(n => n.id === nodeId)
    if (!node?.decorators?.[decoratorIndex]) return null
    const dec = node.decorators[decoratorIndex]
    return dec.type === 'automation' ? dec.automationParams ?? null : null
  }

  function mutate(fn: (p: AutomationParams) => void) {
    const params = getParamsRef()
    if (!params) return
    pushUndo('Edit automation')
    fn(params)
    drawCanvas()
  }

  function pushLocalUndo() {
    if (!autoParams) return
    undoStack = [...undoStack, autoParams.points.map(p => ({ ...p }))]
    if (undoStack.length > 30) undoStack = undoStack.slice(-30)
  }

  function localUndo() {
    const params = getParamsRef()
    if (undoStack.length === 0 || !params) return
    const prev = undoStack[undoStack.length - 1]
    undoStack = undoStack.slice(0, -1)
    pushUndo('Undo automation edit')
    params.points = prev
    drawCanvas()
  }

  function close() {
    ui.editingAutomationInline = null
  }

  function addNewCurve() {
    sceneAddDecorator(nodeId, 'automation')
    // Switch to the newly added decorator
    const node = song.scene.nodes.find(n => n.id === nodeId)
    if (node?.decorators) {
      ui.editingAutomationInline = { nodeId, decoratorIndex: node.decorators.length - 1 }
    }
  }

  // ── Coordinate conversion ──
  function toCanvas(t: number, v: number): { x: number; y: number } {
    return { x: PAD.l + t * plotW, y: PAD.t + (1 - v) * plotH }
  }

  function fromCanvas(cx: number, cy: number): { t: number; v: number } {
    let t = (cx - PAD.l) / plotW
    let v = 1 - (cy - PAD.t) / plotH
    t = Math.max(0, Math.min(1, t))
    v = Math.max(0, Math.min(1, v))
    if (snap > 0) t = Math.round(t * snap) / snap
    return { t, v }
  }

  // ── Hit test ──
  function hitPoint(cx: number, cy: number): number {
    if (!autoParams) return -1
    for (let i = 0; i < autoParams.points.length; i++) {
      const p = toCanvas(autoParams.points[i].t, autoParams.points[i].v)
      if (Math.hypot(cx - p.x, cy - p.y) < 8) return i
    }
    return -1
  }

  /** Check if click is near an inactive curve and switch to it */
  function trySelectInactiveCurve(cx: number, cy: number): boolean {
    const threshold = 8
    for (const ad of allAutoDecorators) {
      if (ad.idx === decoratorIndex) continue
      const pts = ad.dec.automationParams!.points
      if (pts.length < 2) continue
      // Check distance to each line segment
      for (let i = 0; i < pts.length - 1; i++) {
        const a = toCanvas(pts[i].t, pts[i].v)
        const b = toCanvas(pts[i + 1].t, pts[i + 1].v)
        const dx = b.x - a.x, dy = b.y - a.y
        const len2 = dx * dx + dy * dy
        let t = len2 > 0 ? ((cx - a.x) * dx + (cy - a.y) * dy) / len2 : 0
        t = Math.max(0, Math.min(1, t))
        const px = a.x + t * dx, py = a.y + t * dy
        if (Math.hypot(cx - px, cy - py) < threshold) {
          ui.editingAutomationInline = { nodeId, decoratorIndex: ad.idx }
          return true
        }
      }
    }
    return false
  }

  // ── Pointer events ──
  let lastClickTime = 0
  let lastClickIndex = -1

  function onPointerDown(e: PointerEvent) {
    if (!autoParams || !canvasEl) return
    const rect = canvasEl.getBoundingClientRect()
    const cx = (e.clientX - rect.left) * (W / rect.width)
    const cy = (e.clientY - rect.top) * (H / rect.height)

    if (mode === 'pencil') {
      isDrawing = true
      freehandPoints = [{ x: cx, y: cy }]
      canvasEl.setPointerCapture(e.pointerId)
      return
    }

    if (mode === 'eraser') {
      isErasing = true
      eraseNear(cx, cy)
      canvasEl.setPointerCapture(e.pointerId)
      return
    }

    if (mode === 'line') {
      const { t, v } = fromCanvas(cx, cy)
      if (!lineStart) {
        lineStart = { t, v }
        drawCanvas()
      } else {
        pushLocalUndo()
        mutate(p => {
          p.points.push({ t: lineStart!.t, v: lineStart!.v }, { t, v })
          p.points.sort((a, b) => a.t - b.t)
        })
        lineStart = null
      }
      return
    }

    // Try switching to an inactive curve if clicked near it
    if (hitPoint(cx, cy) < 0 && trySelectInactiveCurve(cx, cy)) return

    // Bezier mode
    const idx = hitPoint(cx, cy)
    const now = Date.now()
    if (idx >= 0) {
      if (lastClickIndex === idx && now - lastClickTime < 300 && autoParams.points.length > 2) {
        pushLocalUndo()
        mutate(p => { p.points.splice(idx, 1) })
        lastClickIndex = -1
        return
      }
      lastClickTime = now
      lastClickIndex = idx
      dragIndex = idx
      dragging = true
      canvasEl.setPointerCapture(e.pointerId)
    } else {
      const { t, v } = fromCanvas(cx, cy)
      pushLocalUndo()
      mutate(p => { p.points.push({ t, v }); p.points.sort((a, b) => a.t - b.t) })
      const newIdx = autoParams.points.findIndex(p => p.t === t && p.v === v)
      if (newIdx >= 0) {
        dragIndex = newIdx
        dragging = true
        canvasEl.setPointerCapture(e.pointerId)
      }
      lastClickTime = now
      lastClickIndex = -1
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!autoParams || !canvasEl) return
    const rect = canvasEl.getBoundingClientRect()
    const cx = (e.clientX - rect.left) * (W / rect.width)
    const cy = (e.clientY - rect.top) * (H / rect.height)

    if (mode === 'pencil' && isDrawing) {
      freehandPoints = [...freehandPoints, { x: cx, y: cy }]
      drawCanvas()
      return
    }

    if (mode === 'eraser' && isErasing) {
      eraseNear(cx, cy)
      return
    }

    if (dragging && dragIndex >= 0) {
      const params = getParamsRef()
      if (!params) return
      const { t, v } = fromCanvas(cx, cy)
      params.points[dragIndex] = { t, v }
      params.points.sort((a, b) => a.t - b.t)
      dragIndex = params.points.findIndex(p => p.t === t && p.v === v)
      drawCanvas()
    }
  }

  function onPointerUp() {
    if (mode === 'pencil' && isDrawing) {
      isDrawing = false
      if (freehandPoints.length > 2) {
        pushLocalUndo()
        const simplified = rdpSimplify(freehandPoints, 3)
        const pts: AutomationPoint[] = simplified.map(p => fromCanvas(p.x, p.y))
        mutate(p => { p.points = pts.length >= 2 ? pts : [{ t: 0, v: 0.5 }, { t: 1, v: 0.5 }] })
      }
      freehandPoints = []
      return
    }
    if (mode === 'eraser') {
      isErasing = false
      return
    }
    if (dragging) {
      dragging = false
      dragIndex = -1
      const params = getParamsRef()
      if (params) params.points.sort((a, b) => a.t - b.t)
    }
  }

  function eraseNear(cx: number, cy: number) {
    const params = getParamsRef()
    if (!params || params.points.length <= 2) return
    const r = 12
    const before = params.points.length
    params.points = params.points.filter(p => {
      const cp = toCanvas(p.t, p.v)
      return Math.hypot(cx - cp.x, cy - cp.y) > r
    })
    if (params.points.length < 2) {
      params.points = [{ t: 0, v: 0.5 }, { t: 1, v: 0.5 }]
    }
    if (params.points.length !== before) drawCanvas()
  }

  // ── RDP simplification ──
  function rdpSimplify(pts: { x: number; y: number }[], epsilon: number): { x: number; y: number }[] {
    if (pts.length <= 2) return pts
    let maxDist = 0, maxIdx = 0
    const first = pts[0], last = pts[pts.length - 1]
    for (let i = 1; i < pts.length - 1; i++) {
      const dx = last.x - first.x, dy = last.y - first.y
      const len = Math.hypot(dx, dy)
      const d = len < 0.001 ? Math.hypot(pts[i].x - first.x, pts[i].y - first.y)
        : Math.abs(dy * pts[i].x - dx * pts[i].y + last.x * first.y - last.y * first.x) / len
      if (d > maxDist) { maxDist = d; maxIdx = i }
    }
    if (maxDist > epsilon) {
      const left = rdpSimplify(pts.slice(0, maxIdx + 1), epsilon)
      const right = rdpSimplify(pts.slice(maxIdx), epsilon)
      return [...left.slice(0, -1), ...right]
    }
    return [first, last]
  }

  // ── Multi-lane: all automation decorators on this node ──
  const allAutoDecorators = $derived.by(() => {
    const node = song.scene.nodes.find(n => n.id === nodeId)
    if (!node?.decorators) return []
    return node.decorators
      .map((d, i) => ({ dec: d, idx: i }))
      .filter(x => x.dec.type === 'automation' && x.dec.automationParams)
  })

  // ── Playhead progress ──
  const playheadProgress = $derived.by(() => {
    if (!playback.playing) return -1
    const node = song.scene.nodes.find(n => n.id === nodeId)
    if (!node?.patternId) return -1
    const pat = song.patterns.find(p => p.id === node.patternId)
    if (!pat) return -1
    const totalSteps = Math.max(1, ...pat.cells.map(c => c.steps))
    return playback.playheads[0] / (totalSteps - 1 || 1)
  })

  // ── Canvas drawing ──
  function drawCanvas() {
    if (!canvasEl || !autoParams) return
    const ctx = canvasEl.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvasEl.width = W * dpr
    canvasEl.height = H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = 'rgba(30, 32, 40, 0.04)'
    ctx.fillRect(PAD.l, PAD.t, plotW, plotH)

    // Grid — dotted beat divisions
    const divisions = snap > 0 ? snap : 4
    ctx.strokeStyle = 'rgba(30, 32, 40, 0.08)'
    ctx.lineWidth = 0.5
    ctx.setLineDash([2, 4])
    for (let i = 0; i <= divisions; i++) {
      const x = PAD.l + (i / divisions) * plotW
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke()
    }
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (i / 4) * plotH
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + plotW, y); ctx.stroke()
    }
    ctx.setLineDash([])

    // Draw inactive curves (multi-lane overlay)
    for (const ad of allAutoDecorators) {
      if (ad.idx === decoratorIndex) continue
      const pts = ad.dec.automationParams!.points
      if (pts.length < 2) continue
      const color = targetColor(ad.dec.automationParams!.target)
      drawCurve(ctx, pts, ad.dec.automationParams!.interpolation, color, 0.2, false)
    }

    // Draw active curve
    const points = autoParams.points
    if (points.length >= 2) {
      drawCurve(ctx, points, interpolation, curveColor(), 1, true)
    }

    // Draw points for active curve
    const color = curveColor()
    for (let i = 0; i < points.length; i++) {
      const p = toCanvas(points[i].t, points[i].v)
      ctx.beginPath()
      ctx.arc(p.x, p.y, dragIndex === i ? 5 : 3, 0, Math.PI * 2)
      ctx.fillStyle = dragIndex === i ? color : 'white'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Freehand preview
    if (isDrawing && freehandPoints.length > 1) {
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.moveTo(freehandPoints[0].x, freehandPoints[0].y)
      for (let i = 1; i < freehandPoints.length; i++) ctx.lineTo(freehandPoints[i].x, freehandPoints[i].y)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Line mode start indicator
    if (lineStart) {
      const lp = toCanvas(lineStart.t, lineStart.v)
      ctx.beginPath()
      ctx.arc(lp.x, lp.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }

    // Playhead
    if (playheadProgress >= 0 && playheadProgress <= 1) {
      const px = PAD.l + playheadProgress * plotW
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, PAD.t)
      ctx.lineTo(px, PAD.t + plotH)
      ctx.stroke()
    }
  }

  function drawCurve(
    ctx: CanvasRenderingContext2D,
    points: AutomationPoint[],
    interp: string,
    color: string,
    opacity: number,
    fill: boolean,
  ) {
    ctx.globalAlpha = opacity
    ctx.strokeStyle = color
    ctx.lineWidth = 3.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    ctx.beginPath()
    const p0 = toCanvas(points[0].t, points[0].v)
    ctx.moveTo(p0.x, p0.y)

    if (interp === 'smooth' && points.length > 2) {
      for (let i = 0; i < points.length - 1; i++) {
        const curr = toCanvas(points[i].t, points[i].v)
        const next = toCanvas(points[i + 1].t, points[i + 1].v)
        const cpx = (curr.x + next.x) / 2
        ctx.bezierCurveTo(cpx, curr.y, cpx, next.y, next.x, next.y)
      }
    } else {
      for (let i = 1; i < points.length; i++) {
        const p = toCanvas(points[i].t, points[i].v)
        ctx.lineTo(p.x, p.y)
      }
    }
    ctx.stroke()

    // Translucent fill under curve
    if (fill) {
      const last = toCanvas(points[points.length - 1].t, points[points.length - 1].v)
      ctx.lineTo(last.x, PAD.t + plotH)
      ctx.lineTo(p0.x, PAD.t + plotH)
      ctx.closePath()
      ctx.globalAlpha = opacity * 0.15
      ctx.fillStyle = color
      ctx.fill()
    }

    ctx.globalAlpha = 1
  }

  // Redraw on data change + playhead
  $effect(() => {
    if (autoParams && canvasEl) {
      void autoParams.points.length
      void autoParams.interpolation
      void autoParams.target
      void playheadProgress
      void allAutoDecorators.length
      drawCanvas()
    }
  })
</script>

{#if autoParams}
<div class="dae-section">
  <div class="dae-header">
    <span class="dae-title">AUTOMATION</span>
    <button class="dae-close" onpointerdown={close}
      data-tip="Close editor" data-tip-ja="エディタを閉じる">×</button>
  </div>

  <!-- Target selector -->
  <div class="dae-row">
    <span class="dae-label">TARGET</span>
    <select class="dae-select"
      value={currentTargetKey}
      onchange={e => {
        const t = findTargetByKey((e.target as HTMLSelectElement).value)
        if (t) mutate(p => { p.target = t })
      }}
    >
      {#each targetOptions as group}
        <optgroup label={group.group}>
          {#each group.items as item}
            <option value={targetKey(item.target)}>{item.label}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </div>

  <!-- Canvas -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <canvas
    class="dae-canvas"
    class:eraser={mode === 'eraser'}
    bind:this={canvasEl}
    style="width: {W}px; height: {H}px"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  ></canvas>

  <!-- Mode buttons -->
  <div class="dae-row">
    <div class="dae-toggle">
      {#each [
        { id: 'pencil', label: 'Pencil' },
        { id: 'line', label: 'Line' },
        { id: 'eraser', label: 'Eraser' },
        { id: 'bezier', label: 'Bezier' },
      ] as m}
        <button
          class:active={mode === m.id}
          onpointerdown={() => { mode = m.id as typeof mode; lineStart = null }}
        >{m.label}</button>
      {/each}
    </div>
  </div>

  <!-- Interpolation + Snap -->
  <div class="dae-row">
    <span class="dae-label">INTERP</span>
    <div class="dae-toggle">
      <button class:active={interpolation === 'linear'} onpointerdown={() => mutate(p => { p.interpolation = 'linear' })}>Lin</button>
      <button class:active={interpolation === 'smooth'} onpointerdown={() => mutate(p => { p.interpolation = 'smooth' })}>Smo</button>
    </div>
    <span class="dae-label" style="margin-left:6px">SNAP</span>
    <div class="dae-toggle">
      {#each SNAP_OPTIONS as opt}
        <button class:active={snap === opt.value} onpointerdown={() => snap = opt.value}>{opt.label}</button>
      {/each}
    </div>
  </div>

  <!-- Actions -->
  <div class="dae-actions">
    <button onpointerdown={() => { pushLocalUndo(); mutate(p => { p.points = [{ t: 0, v: 0.5 }, { t: 1, v: 0.5 }] }) }}
      data-tip="Reset curve" data-tip-ja="カーブをリセット"
    >Clear</button>
    <button onpointerdown={localUndo} disabled={undoStack.length === 0}
      data-tip="Undo" data-tip-ja="元に戻す"
    >Undo</button>
    <button class="btn-del" onpointerdown={() => { sceneRemoveDecorator(nodeId, decoratorIndex); close() }}
      data-tip="Delete this automation" data-tip-ja="このオートメーションを削除"
    >Del</button>
    <button class="btn-add" onpointerdown={addNewCurve}
      data-tip="Add new automation curve" data-tip-ja="新しいオートメーションカーブを追加"
    >+ Draw</button>
  </div>
</div>
<div class="section-divider" aria-hidden="true"></div>
{/if}

<style>
  .dae-section {
    margin-bottom: 4px;
  }
  .dae-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .dae-title {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--dk-text-dim);
  }
  .dae-close {
    border: none;
    background: transparent;
    color: var(--dk-text-dim);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }
  .dae-close:hover {
    color: var(--dk-text);
  }
  .dae-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
  }
  .dae-label {
    font-family: var(--font-data);
    font-size: var(--dk-fs-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    opacity: 0.6;
    min-width: 36px;
    flex-shrink: 0;
  }
  .dae-select {
    flex: 1;
    font-family: var(--font-data);
    font-size: var(--dk-fs-sm);
    background: transparent;
    border: 1px solid rgba(237, 232, 220, 0.2);
    color: inherit;
    padding: 2px 4px;
  }
  .dae-canvas {
    width: 100%;
    border-radius: 4px;
    cursor: crosshair;
    touch-action: none;
    margin-bottom: 4px;
    background: rgba(30, 32, 40, 0.1);
  }
  .dae-canvas.eraser {
    cursor: not-allowed;
  }
  .dae-toggle {
    display: flex;
    gap: 0;
  }
  .dae-toggle button {
    font-family: var(--font-data);
    font-size: var(--dk-fs-xs);
    padding: 2px 5px;
    border: 1px solid rgba(237, 232, 220, 0.2);
    background: transparent;
    color: var(--dk-text-mid);
    cursor: pointer;
  }
  .dae-toggle button:first-child { border-radius: 3px 0 0 3px; }
  .dae-toggle button:last-child { border-radius: 0 3px 3px 0; }
  .dae-toggle button:not(:first-child) { border-left: none; }
  .dae-toggle button.active {
    background: var(--dk-bg-active);
    color: rgba(237, 232, 220, 0.9);
    border-color: var(--dk-text-dim);
  }
  .dae-actions {
    display: flex;
    gap: 4px;
  }
  .dae-actions button {
    font-family: var(--font-data);
    font-size: var(--dk-fs-xs);
    padding: 2px 6px;
    border: 1px solid rgba(237, 232, 220, 0.2);
    border-radius: 3px;
    background: transparent;
    color: var(--dk-text-mid);
    cursor: pointer;
  }
  .dae-actions button:hover {
    background: var(--dk-bg-hover);
    color: var(--dk-text);
  }
  .dae-actions button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .dae-actions .btn-del {
    color: hsl(0, 60%, 55%);
    border-color: hsl(0, 40%, 35%);
  }
  .dae-actions .btn-del:hover {
    background: hsl(0, 40%, 25%);
    color: hsl(0, 70%, 65%);
  }
  .dae-actions .btn-add {
    margin-left: auto;
    border-color: rgba(237, 232, 220, 0.3);
  }
  .section-divider {
    width: 100%;
    height: 1px;
    background: var(--dk-bg-active);
    margin: 8px 0;
  }
</style>
