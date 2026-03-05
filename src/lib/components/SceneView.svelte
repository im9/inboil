<script lang="ts">
  import { song, playback, ui, selectPattern, sceneUpdateNode, sceneAddNode, sceneDeleteNode, sceneAddEdge, sceneDeleteEdge, sceneSetRoot, sceneAddFunctionNode, sceneUpdateNodeParams, sceneReorderEdge, sceneCopyNode, sceneCopySubgraph, scenePaste, hasSceneClipboard } from '../state.svelte.ts'
  import { TAP_THRESHOLD, PAD_INSET, COLORS_RGB, PATTERN_COLORS } from '../constants.ts'
  import { FACTORY_COUNT } from '../factory.ts'

  let viewEl: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let animFrameId: number | null = null

  // ── Drag state ──
  let dragging: string | null = $state(null)  // node id being dragged
  let dragMoved = false
  let startPos = { x: 0, y: 0 }

  // ── Edge creation state ──
  let edgeFrom: string | null = $state(null)  // source node id during edge draw
  let edgeCursor = { x: 0, y: 0 }            // cursor pixel position during edge draw

  // ── Double-click tracking ──
  let lastTapTime = 0
  let lastTapNode = ''

  // ── Long-press (mobile edge creation) ──
  let longPressTimer: ReturnType<typeof setTimeout> | null = null

  // ── Add-node picker ──
  let pickerOpen = $state(false)

  // ── Drop from MatrixView ──
  let dropActive = $state(false)

  // ── Zoom/Pan state ──
  let zoom = $state(1)      // 0.5 .. 3.0
  let panX = $state(0)      // pixel offset
  let panY = $state(0)      // pixel offset
  let isPanning = false
  let panPointerStart = { x: 0, y: 0 }
  let panStartX = 0
  let panStartY = 0
  let activePointers = new Map<number, { x: number; y: number }>()
  let pinchStartDist = 0
  let pinchStartZoom = 1

  /** Patterns with data for the picker */
  const pickerPatterns = $derived.by(() => {
    const result: { index: number; name: string; density: number }[] = []
    for (let i = 0; i < song.patterns.length; i++) {
      const p = song.patterns[i]
      let total = 0, active = 0
      for (const c of p.cells) {
        total += c.steps
        for (let s = 0; s < c.steps; s++) {
          if (c.trigs[s]?.active) active++
        }
      }
      // Show factory patterns + any with data
      if (i < FACTORY_COUNT || active > 0) {
        result.push({ index: i, name: p.name, density: total > 0 ? active / total : 0 })
      }
    }
    return result
  })

  /** Convert client coordinates to normalized 0-1 coords (accounting for zoom/pan) */
  function toNormXY(cx: number, cy: number): { x: number; y: number } | null {
    if (!viewEl) return null
    const rect = viewEl.getBoundingClientRect()
    const canvasX = (cx - rect.left - panX) / zoom
    const canvasY = (cy - rect.top - panY) / zoom
    const x = Math.max(0, Math.min(1, (canvasX - PAD_INSET) / (rect.width - PAD_INSET * 2)))
    const y = Math.max(0, Math.min(1, (canvasY - PAD_INSET) / (rect.height - PAD_INSET * 2)))
    return { x, y }
  }

  function toNorm(e: PointerEvent) { return toNormXY(e.clientX, e.clientY) }

  /** Convert normalized coords to pixel position for canvas drawing */
  function toPixel(nx: number, ny: number, w: number, h: number) {
    return {
      x: PAD_INSET + nx * (w - PAD_INSET * 2),
      y: PAD_INSET + ny * (h - PAD_INSET * 2),
    }
  }

  /** Bezier edge endpoints: offset from node center by half-size toward direction */
  const PAT_HALF_W = 36, PAT_HALF_H = 17
  const FN_HALF_W = 18, FN_HALF_H = 10
  type Pt = { x: number; y: number }
  type BezierEdge = { p0: Pt; cp: Pt; p1: Pt }

  function bezierEdge(from: Pt, to: Pt, fromFn = false, toFn = false): BezierEdge {
    const dx = to.x - from.x, dy = to.y - from.y
    const dist = Math.hypot(dx, dy)
    if (dist < 1) return { p0: from, cp: from, p1: to }
    const nx = dx / dist, ny = dy / dist
    const hw0 = fromFn ? FN_HALF_W : PAT_HALF_W
    const hh0 = fromFn ? FN_HALF_H : PAT_HALF_H
    const hw1 = toFn ? FN_HALF_W : PAT_HALF_W
    const hh1 = toFn ? FN_HALF_H : PAT_HALF_H
    // Exit/enter at node edge along the line direction
    const r0 = Math.min(hw0 / Math.max(Math.abs(nx), 0.01), hh0 / Math.max(Math.abs(ny), 0.01))
    const r1 = Math.min(hw1 / Math.max(Math.abs(nx), 0.01), hh1 / Math.max(Math.abs(ny), 0.01))
    const p0: Pt = { x: from.x + nx * r0, y: from.y + ny * r0 }
    const p1: Pt = { x: to.x - nx * r1, y: to.y - ny * r1 }
    // Control point: offset perpendicular to the line
    const cx = (p0.x + p1.x) / 2 + dy * 0.15
    const cy = (p0.y + p1.y) / 2 - dx * 0.15
    return { p0, cp: { x: cx, y: cy }, p1 }
  }

  /** Draw a quadratic bezier edge with arrowhead */
  function drawBezier(ctx: CanvasRenderingContext2D, b: BezierEdge, strokeStyle: string, fillStyle: string, lineWidth: number) {
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(b.p0.x, b.p0.y)
    ctx.quadraticCurveTo(b.cp.x, b.cp.y, b.p1.x, b.p1.y)
    ctx.stroke()
    // Arrowhead: direction at t=1 of quadratic bezier is (p1 - cp)
    const angle = Math.atan2(b.p1.y - b.cp.y, b.p1.x - b.cp.x)
    const al = 7
    ctx.fillStyle = fillStyle
    ctx.beginPath()
    ctx.moveTo(b.p1.x, b.p1.y)
    ctx.lineTo(b.p1.x - al * Math.cos(angle - 0.4), b.p1.y - al * Math.sin(angle - 0.4))
    ctx.lineTo(b.p1.x - al * Math.cos(angle + 0.4), b.p1.y - al * Math.sin(angle + 0.4))
    ctx.closePath(); ctx.fill()
  }

  /** Min distance from point to a quadratic bezier (sample 12 points) */
  function bezierDist(px: number, py: number, b: BezierEdge): number {
    let min = Infinity
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      const u = 1 - t
      const x = u * u * b.p0.x + 2 * u * t * b.cp.x + t * t * b.p1.x
      const y = u * u * b.p0.y + 2 * u * t * b.cp.y + t * t * b.p1.y
      const d = Math.hypot(px - x, py - y)
      if (d < min) min = d
    }
    return min
  }

  /** Point at t on quadratic bezier */
  function bezierAt(b: BezierEdge, t: number): Pt {
    const u = 1 - t
    return {
      x: u * u * b.p0.x + 2 * u * t * b.cp.x + t * t * b.p1.x,
      y: u * u * b.p0.y + 2 * u * t * b.cp.y + t * t * b.p1.y,
    }
  }

  /** Find node under pointer (normalized coords, 28px radius in pixels) */
  function hitTestNode(normX: number, normY: number): string | null {
    if (!viewEl) return null
    const rect = viewEl.getBoundingClientRect()
    const w = rect.width, h = rect.height
    const px = PAD_INSET + normX * (w - PAD_INSET * 2)
    const py = PAD_INSET + normY * (h - PAD_INSET * 2)
    for (const node of song.scene.nodes) {
      const np = toPixel(node.x, node.y, w, h)
      if (Math.abs(px - np.x) < 32 / zoom && Math.abs(py - np.y) < 18 / zoom) {
        return node.id
      }
    }
    return null
  }

  function startDrag(e: PointerEvent, nodeId: string) {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    // Check if pointer is in right zone of node (edge-draw mode)
    const btn = e.currentTarget as HTMLElement
    const btnRect = btn.getBoundingClientRect()
    const relX = e.clientX - btnRect.left
    if (relX > btnRect.width * 0.67) {
      // Start edge drawing
      edgeFrom = nodeId
      edgeCursor = { x: e.clientX, y: e.clientY }
      dragMoved = false
      startPos = { x: e.clientX, y: e.clientY }
      return
    }

    dragging = nodeId
    dragMoved = false
    startPos = { x: e.clientX, y: e.clientY }

    // Long-press: switch to edge-draw mode after 500ms (mobile-friendly)
    if (longPressTimer) clearTimeout(longPressTimer)
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      if (!dragMoved && dragging === nodeId) {
        dragging = null
        edgeFrom = nodeId
        edgeCursor = { x: e.clientX, y: e.clientY }
        if (navigator.vibrate) navigator.vibrate(30)
      }
    }, 500)
  }

  function onMove(e: PointerEvent) {
    // Pan / pinch zoom
    if (isPanning) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (activePointers.size >= 2) {
        const pts = [...activePointers.values()]
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
        const newZoom = Math.max(0.5, Math.min(3, pinchStartZoom * (dist / pinchStartDist)))
        panX = panStartX + (mid.x - panPointerStart.x)
        panY = panStartY + (mid.y - panPointerStart.y)
        zoom = newZoom
      } else {
        panX = panStartX + (e.clientX - panPointerStart.x)
        panY = panStartY + (e.clientY - panPointerStart.y)
      }
      return
    }

    // Edge drawing mode
    if (edgeFrom) {
      edgeCursor = { x: e.clientX, y: e.clientY }
      if (!dragMoved) {
        const dx = Math.abs(e.clientX - startPos.x)
        const dy = Math.abs(e.clientY - startPos.y)
        if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) dragMoved = true
      }
      return
    }

    if (!dragging) return
    if (!dragMoved) {
      const dx = Math.abs(e.clientX - startPos.x)
      const dy = Math.abs(e.clientY - startPos.y)
      if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
        dragMoved = true
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
      }
    }
    if (dragMoved) {
      const pos = toNorm(e)
      if (pos) sceneUpdateNode(dragging, pos.x, pos.y)
    }
  }

  function endDrag(e: PointerEvent) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    activePointers.delete(e.pointerId)
    if (isPanning) {
      if (activePointers.size === 0) isPanning = false
      return
    }

    // Edge drawing — create edge on drop
    if (edgeFrom) {
      const sourceId = edgeFrom
      edgeFrom = null
      if (dragMoved) {
        const pos = toNorm(e)
        if (pos) {
          const targetId = hitTestNode(pos.x, pos.y)
          if (targetId && targetId !== sourceId) {
            sceneAddEdge(sourceId, targetId)
          }
        }
      }
      return
    }

    if (!dragging) return
    const nodeId = dragging
    if (!dragMoved) {
      // Double-click detection
      const now = Date.now()
      if (lastTapNode === nodeId && now - lastTapTime < 300) {
        // Double-click → set root
        sceneSetRoot(nodeId)
        lastTapTime = 0
        lastTapNode = ''
      } else {
        // Single click — select
        const node = song.scene.nodes.find(n => n.id === nodeId)
        if (node?.patternId) {
          const pi = song.patterns.findIndex(p => p.id === node.patternId)
          if (pi >= 0) selectPattern(pi)
        }
        ui.selectedSceneNode = nodeId
        ui.selectedSceneEdge = null
        lastTapTime = now
        lastTapNode = nodeId
      }
    }
    dragging = null
  }

  function onBgDown(e: PointerEvent) {
    // Middle mouse or Ctrl+left → start pan
    if (e.button === 1 || (e.ctrlKey && e.button === 0)) {
      e.preventDefault()
      isPanning = true
      panPointerStart = { x: e.clientX, y: e.clientY }
      panStartX = panX; panStartY = panY
      viewEl?.setPointerCapture(e.pointerId)
      return
    }

    // Track active pointers for pinch zoom
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activePointers.size === 2) {
      const pts = [...activePointers.values()]
      pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      pinchStartZoom = zoom
      panPointerStart = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      panStartX = panX; panStartY = panY
      isPanning = true
      return
    }

    // Edge hit-testing on background click
    if (!viewEl || !canvasEl) {
      ui.selectedSceneNode = null
      ui.selectedSceneEdge = null
      return
    }
    const rect = viewEl.getBoundingClientRect()
    // Transform to canvas coords (undo pan/zoom)
    const px = (e.clientX - rect.left - panX) / zoom
    const py = (e.clientY - rect.top - panY) / zoom
    const w = rect.width, h = rect.height

    // Check each edge for proximity
    const { nodes, edges } = song.scene
    let hitEdge: string | null = null
    let bestDist = 8 / zoom
    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.from)
      const toNode = nodes.find(n => n.id === edge.to)
      if (!fromNode || !toNode) continue
      const from = toPixel(fromNode.x, fromNode.y, w, h)
      const to = toPixel(toNode.x, toNode.y, w, h)
      const d = bezierDist(px, py, bezierEdge(from, to, fromNode.type !== 'pattern', toNode.type !== 'pattern'))
      if (d < bestDist) {
        bestDist = d
        hitEdge = edge.id
      }
    }

    if (hitEdge) {
      ui.selectedSceneEdge = hitEdge
      ui.selectedSceneNode = null
    } else {
      ui.selectedSceneNode = null
      ui.selectedSceneEdge = null
      onBgDblCheck() // double-click background → reset zoom
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (ui.phraseView !== 'scene') return
    if (e.target instanceof HTMLInputElement) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (ui.selectedSceneEdge) {
        sceneDeleteEdge(ui.selectedSceneEdge)
      } else if (ui.selectedSceneNode) {
        sceneDeleteNode(ui.selectedSceneNode)
      }
    }
    if (ui.selectedSceneEdge && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      sceneReorderEdge(ui.selectedSceneEdge, e.key === 'ArrowUp' ? 'up' : 'down')
    }
    if (e.key === 'Escape') {
      ui.selectedSceneNode = null
      ui.selectedSceneEdge = null
      pickerOpen = false
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && ui.selectedSceneNode) {
      e.preventDefault()
      if (e.shiftKey) sceneCopySubgraph(ui.selectedSceneNode)
      else sceneCopyNode(ui.selectedSceneNode)
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && hasSceneClipboard()) {
      e.preventDefault()
      const ids = scenePaste(0.4 + Math.random() * 0.2, 0.4 + Math.random() * 0.2)
      if (ids.length > 0) { ui.selectedSceneNode = ids[0]; ui.selectedSceneEdge = null }
    }
  }

  /** Get display label for a node */
  function nodeName(node: typeof song.scene.nodes[0]): string {
    if (node.type === 'pattern') {
      const pat = song.patterns.find(p => p.id === node.patternId)
      return pat?.name || '---'
    }
    if (node.type === 'transpose') {
      const s = node.params?.semitones ?? 0
      return `T${s >= 0 ? '+' : ''}${s}`
    }
    if (node.type === 'tempo') return `×${node.params?.bpm ?? 120}`
    if (node.type === 'repeat') return `RPT${node.params?.count ?? 2}`
    if (node.type === 'probability') return '?%'
    return '?'
  }

  /** Get color hex for a pattern node (function nodes return null) */
  function nodeColor(node: typeof song.scene.nodes[0]): string | null {
    if (node.type !== 'pattern') return null
    const pat = song.patterns.find(p => p.id === node.patternId)
    return PATTERN_COLORS[pat?.color ?? 0]
  }

  // ── Selected node helpers ──

  const selectedPatternNode = $derived.by(() => {
    if (!ui.selectedSceneNode) return null
    const n = song.scene.nodes.find(n => n.id === ui.selectedSceneNode)
    return (n && n.type === 'pattern') ? n : null
  })

  const selectedPatternIndex = $derived.by(() => {
    if (!selectedPatternNode) return -1
    return song.patterns.findIndex(p => p.id === selectedPatternNode.patternId)
  })

  function toggleSolo() {
    if (selectedPatternIndex < 0) return
    playback.soloPattern = playback.soloPattern === selectedPatternIndex ? null : selectedPatternIndex
    selectPattern(selectedPatternIndex)
  }

  const selectedFnNode = $derived.by(() => {
    if (!ui.selectedSceneNode) return null
    const n = song.scene.nodes.find(n => n.id === ui.selectedSceneNode)
    return (n && n.type !== 'pattern') ? n : null
  })

  const paramDisplay = $derived.by(() => {
    if (!selectedFnNode) return ''
    if (selectedFnNode.type === 'transpose') return String(selectedFnNode.params?.semitones ?? 0)
    if (selectedFnNode.type === 'tempo') return String(selectedFnNode.params?.bpm ?? 120)
    if (selectedFnNode.type === 'repeat') return String(selectedFnNode.params?.count ?? 2)
    return ''
  })

  function incParam(e: PointerEvent) {
    e.stopPropagation()
    if (!selectedFnNode) return
    const p = { ...(selectedFnNode.params || {}) }
    if (selectedFnNode.type === 'transpose') p.semitones = Math.min(12, (p.semitones ?? 0) + 1)
    else if (selectedFnNode.type === 'tempo') p.bpm = Math.min(300, (p.bpm ?? 120) + 5)
    else if (selectedFnNode.type === 'repeat') p.count = Math.min(16, (p.count ?? 2) + 1)
    sceneUpdateNodeParams(selectedFnNode.id, p)
  }

  function decParam(e: PointerEvent) {
    e.stopPropagation()
    if (!selectedFnNode) return
    const p = { ...(selectedFnNode.params || {}) }
    if (selectedFnNode.type === 'transpose') p.semitones = Math.max(-12, (p.semitones ?? 0) - 1)
    else if (selectedFnNode.type === 'tempo') p.bpm = Math.max(60, (p.bpm ?? 120) - 5)
    else if (selectedFnNode.type === 'repeat') p.count = Math.max(1, (p.count ?? 2) - 1)
    sceneUpdateNodeParams(selectedFnNode.id, p)
  }

  // ── Picker ──

  function openPicker(e: PointerEvent) {
    e.stopPropagation()
    pickerOpen = !pickerOpen
  }

  function pickPattern(patternIndex: number) {
    const pat = song.patterns[patternIndex]
    const id = sceneAddNode(pat.id, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4)
    ui.selectedSceneNode = id
    ui.selectedSceneEdge = null
    pickerOpen = false
  }

  function pickFunctionNode(type: 'transpose' | 'tempo' | 'repeat' | 'probability') {
    const id = sceneAddFunctionNode(type, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4)
    ui.selectedSceneNode = id
    ui.selectedSceneEdge = null
    pickerOpen = false
  }

  // ── Zoom/Pan interactions ──

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    if (!viewEl) return
    const rect = viewEl.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.5, Math.min(3, zoom * factor))
    // Zoom centered on cursor
    panX = cx - (cx - panX) * (newZoom / zoom)
    panY = cy - (cy - panY) * (newZoom / zoom)
    zoom = newZoom
  }

  let lastBgClickTime = 0
  function onBgDblCheck() {
    const now = Date.now()
    if (now - lastBgClickTime < 300 && zoom !== 1) {
      zoom = 1; panX = 0; panY = 0
    }
    lastBgClickTime = now
  }

  // ── Canvas rendering ──

  function draw() {
    if (!canvasEl) { animFrameId = requestAnimationFrame(draw); return }

    const ctx = canvasEl.getContext('2d')!
    const w = canvasEl.clientWidth
    const h = canvasEl.clientHeight
    if (w === 0 || h === 0) { animFrameId = requestAnimationFrame(draw); return }

    // DPR scaling
    const dpr = window.devicePixelRatio || 1
    if (canvasEl.width !== w * dpr || canvasEl.height !== h * dpr) {
      canvasEl.width = w * dpr
      canvasEl.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Background (warm cream, matching pattern view)
    ctx.fillStyle = '#EDE8DC'
    ctx.fillRect(0, 0, w, h)

    // Apply zoom/pan transform for all subsequent drawing
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, panX * dpr, panY * dpr)

    // Grid lines
    ctx.strokeStyle = 'rgba(30, 32, 40, 0.06)'
    ctx.lineWidth = 1
    const gridStep = 40
    for (let x = PAD_INSET; x <= w - PAD_INSET; x += gridStep) {
      ctx.beginPath()
      ctx.moveTo(x, PAD_INSET)
      ctx.lineTo(x, h - PAD_INSET)
      ctx.stroke()
    }
    for (let y = PAD_INSET; y <= h - PAD_INSET; y += gridStep) {
      ctx.beginPath()
      ctx.moveTo(PAD_INSET, y)
      ctx.lineTo(w - PAD_INSET, y)
      ctx.stroke()
    }

    // Edges (bezier curves)
    const { nodes, edges } = song.scene
    const fg = { r: 30, g: 32, b: 40 } // --color-fg navy
    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.from)
      const toNode = nodes.find(n => n.id === edge.to)
      if (!fromNode || !toNode) continue

      const from = toPixel(fromNode.x, fromNode.y, w, h)
      const to = toPixel(toNode.x, toNode.y, w, h)
      const isSel = ui.selectedSceneEdge === edge.id
      const b = bezierEdge(from, to, fromNode.type !== 'pattern', toNode.type !== 'pattern')

      drawBezier(ctx, b,
        isSel ? `rgba(${fg.r}, ${fg.g}, ${fg.b}, 0.5)` : `rgba(${fg.r}, ${fg.g}, ${fg.b}, 0.18)`,
        isSel ? `rgba(${fg.r}, ${fg.g}, ${fg.b}, 0.6)` : `rgba(${fg.r}, ${fg.g}, ${fg.b}, 0.22)`,
        isSel ? 2.5 : 1.5,
      )
    }

    // Edge order badges (only when source has >1 outgoing)
    const edgeCounts = new Map<string, number>()
    for (const e of edges) edgeCounts.set(e.from, (edgeCounts.get(e.from) || 0) + 1)
    for (const edge of edges) {
      if ((edgeCounts.get(edge.from) || 0) <= 1) continue
      const fn = nodes.find(n => n.id === edge.from)
      const tn = nodes.find(n => n.id === edge.to)
      if (!fn || !tn) continue
      const fp = toPixel(fn.x, fn.y, w, h)
      const tp = toPixel(tn.x, tn.y, w, h)
      const b = bezierEdge(fp, tp, fn.type !== 'pattern', tn.type !== 'pattern')
      // Badge at bezier midpoint
      const mid = bezierAt(b, 0.5)
      const mx = mid.x, my = mid.y
      ctx.fillStyle = 'rgba(237, 232, 220, 0.85)'
      ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill()
      const isSel = ui.selectedSceneEdge === edge.id
      ctx.fillStyle = isSel
        ? `rgba(${fg.r}, ${fg.g}, ${fg.b}, 0.9)`
        : `rgba(${fg.r}, ${fg.g}, ${fg.b}, 0.5)`
      ctx.font = '700 8px monospace'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(edge.order), mx, my)
    }

    // Active playback edge highlight
    if (playback.playing && playback.sceneEdgeId) {
      const activeEdge = edges.find(e => e.id === playback.sceneEdgeId)
      if (activeEdge) {
        const fn = nodes.find(n => n.id === activeEdge.from)
        const tn = nodes.find(n => n.id === activeEdge.to)
        if (fn && tn) {
          const fp = toPixel(fn.x, fn.y, w, h)
          const tp = toPixel(tn.x, tn.y, w, h)
          const bl = COLORS_RGB.blue
          const be = bezierEdge(fp, tp, fn.type !== 'pattern', tn.type !== 'pattern')
          drawBezier(ctx, be,
            `rgba(${bl.r}, ${bl.g}, ${bl.b}, 0.6)`,
            `rgba(${bl.r}, ${bl.g}, ${bl.b}, 0.7)`,
            2.5,
          )
        }
      }
    }

    // Temporary edge during edge-draw mode
    if (edgeFrom && dragMoved && viewEl) {
      const srcNode = nodes.find(n => n.id === edgeFrom)
      if (srcNode) {
        const from = toPixel(srcNode.x, srcNode.y, w, h)
        const rect = viewEl.getBoundingClientRect()
        const toX = (edgeCursor.x - rect.left - panX) / zoom
        const toY = (edgeCursor.y - rect.top - panY) / zoom
        const tb = bezierEdge(from, { x: toX, y: toY }, srcNode.type !== 'pattern', false)

        ctx.setLineDash([4, 4])
        drawBezier(ctx, tb,
          `rgba(${fg.r}, ${fg.g}, ${fg.b}, 0.35)`,
          `rgba(${fg.r}, ${fg.g}, ${fg.b}, 0.35)`,
          1.5,
        )
        ctx.setLineDash([])
      }
    }

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
    if (ui.phraseView === 'scene') startVis()
    else stopVis()
    return () => stopVis()
  })

  // ── Drop handlers (MatrixView → SceneView) ──
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('application/x-inboil-pattern')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    dropActive = true
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    dropActive = false
    const pi = Number(e.dataTransfer?.getData('application/x-inboil-pattern'))
    if (isNaN(pi)) return
    const pat = song.patterns[pi]
    if (!pat) return
    const norm = toNormXY(e.clientX, e.clientY)
    if (!norm) return
    const id = sceneAddNode(pat.id, norm.x, norm.y)
    ui.selectedSceneNode = id
  }

  function onDragLeave() {
    dropActive = false
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="scene-view"
  class:drop-active={dropActive}
  bind:this={viewEl}
  onpointermove={onMove}
  onpointerup={endDrag}
  onpointercancel={(e) => { activePointers.delete(e.pointerId); dragging = null; edgeFrom = null; isPanning = false }}
  onpointerdown={onBgDown}
  onwheel={onWheel}
  ondragover={onDragOver}
  ondrop={onDrop}
  ondragleave={onDragLeave}
>
  <canvas bind:this={canvasEl} class="scene-canvas"></canvas>

  <!-- Transform container for nodes (zoom/pan) -->
  <div class="scene-transform" style="transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: 0 0">
    {#each song.scene.nodes as node (node.id)}
      {@const isFn = node.type !== 'pattern'}
      {@const isRoot = node.root}
      {@const isSelected = ui.selectedSceneNode === node.id}
      {@const isDragging = dragging === node.id}
      {@const isEdgeSource = edgeFrom === node.id}
      {@const isPlaying = playback.playing && playback.sceneNodeId === node.id}
      {@const nc = nodeColor(node)}
      <button
        class="scene-node"
        class:fn={isFn}
        class:root={isRoot}
        class:selected={isSelected}
        class:dragging={isDragging}
        class:edge-source={isEdgeSource}
        class:playing={isPlaying}
        style="
          left: calc({PAD_INSET}px + {node.x} * (100% - {PAD_INSET * 2}px));
          top: calc({PAD_INSET}px + {node.y} * (100% - {PAD_INSET * 2}px));
          {nc ? `--nc: ${nc}` : ''}
        "
        onpointerdown={e => startDrag(e, node.id)}
      >
        <span class="node-label">{nodeName(node)}</span>
      </button>
    {/each}

    <!-- Solo button for selected pattern node -->
    {#if selectedPatternNode}
      <button
        class="solo-btn"
        class:active={playback.soloPattern === selectedPatternIndex}
        style="
          left: calc({PAD_INSET}px + {selectedPatternNode.x} * (100% - {PAD_INSET * 2}px) + 36px);
          top: calc({PAD_INSET}px + {selectedPatternNode.y} * (100% - {PAD_INSET * 2}px));
        "
        onpointerdown={e => { e.stopPropagation(); toggleSolo() }}
        data-tip="Solo pattern" data-tip-ja="パターンソロ"
      >▶</button>
    {/if}

    <!-- Param popup for selected function node -->
    {#if selectedFnNode && selectedFnNode.type !== 'probability'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="param-popup" style="
        left: calc({PAD_INSET}px + {selectedFnNode.x} * (100% - {PAD_INSET * 2}px) + 36px);
        top: calc({PAD_INSET}px + {selectedFnNode.y} * (100% - {PAD_INSET * 2}px));
      " onpointerdown={e => e.stopPropagation()}>
        <button class="param-btn" onpointerdown={decParam}>−</button>
        <span class="param-val">{paramDisplay}</span>
        <button class="param-btn" onpointerdown={incParam}>+</button>
      </div>
    {/if}
  </div>

  <!-- UI controls (outside zoom/pan transform) -->
  <button
    class="scene-add-btn"
    data-tip="Add node" data-tip-ja="ノードを追加"
    onpointerdown={openPicker}
  >+</button>

  {#if zoom !== 1}
    <button
      class="zoom-reset-btn"
      data-tip="Reset zoom" data-tip-ja="ズームリセット"
      onpointerdown={() => { zoom = 1; panX = 0; panY = 0 }}
    >{Math.round(zoom * 100)}%</button>
  {/if}

  <!-- Node picker -->
  {#if pickerOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="picker-backdrop" onpointerdown={e => { e.stopPropagation(); pickerOpen = false }}></div>
    <div class="node-picker">
      {#each pickerPatterns as pp}
        <button class="picker-row" onpointerdown={e => { e.stopPropagation(); pickPattern(pp.index) }}>
          <span class="picker-name">{pp.name}</span>
          <span class="picker-density" style="--d: {pp.density}"></span>
        </button>
      {/each}
      <div class="picker-sep"></div>
      <button class="picker-row fn-row" onpointerdown={e => { e.stopPropagation(); pickFunctionNode('transpose') }}>
        <span class="picker-name">TRANSPOSE</span><span class="picker-fn-tag">T±</span>
      </button>
      <button class="picker-row fn-row" onpointerdown={e => { e.stopPropagation(); pickFunctionNode('tempo') }}>
        <span class="picker-name">TEMPO</span><span class="picker-fn-tag">BPM</span>
      </button>
      <button class="picker-row fn-row" onpointerdown={e => { e.stopPropagation(); pickFunctionNode('repeat') }}>
        <span class="picker-name">REPEAT</span><span class="picker-fn-tag">RPT</span>
      </button>
      <button class="picker-row fn-row" onpointerdown={e => { e.stopPropagation(); pickFunctionNode('probability') }}>
        <span class="picker-name">PROBABILITY</span><span class="picker-fn-tag">?%</span>
      </button>
    </div>
  {/if}

  {#if song.scene.nodes.length === 0}
    <div class="scene-empty">No nodes — press + to add</div>
  {/if}
</div>

<style>
  .scene-view {
    flex: 1;
    position: relative;
    background: var(--color-bg);
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }
  .scene-view.drop-active {
    outline: 2px dashed rgba(30,32,40,0.25);
    outline-offset: -2px;
  }

  .scene-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  .scene-transform {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }
  .scene-transform > :global(*) {
    pointer-events: auto;
  }

  /* ── Pattern nodes (flat color labels) ── */
  .scene-node {
    --nc: #787845; /* fallback */
    position: absolute;
    min-width: 72px;
    height: 32px;
    border-radius: 0;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(30, 32, 40, 0.1);
    background: var(--nc);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    cursor: grab;
    transition: border-color 80ms;
    z-index: 2;
  }

  .scene-node.root {
    border: 1px solid var(--color-fg);
  }

  .scene-node.selected {
    border: 1px solid var(--color-fg);
  }

  .scene-node.dragging {
    cursor: grabbing;
    z-index: 3;
    transform: translate(-50%, -50%) scale(1.04);
  }

  /* ── Function nodes (small dark shapes) ── */
  .scene-node.fn {
    min-width: 36px;
    height: 22px;
    border-radius: 0;
    background: var(--color-fg);
    color: rgba(237, 232, 220, 0.7);
    padding: 0 8px;
  }
  .scene-node.fn .node-label {
    font-size: 7px;
  }
  .scene-node.fn.selected {
    color: var(--color-bg);
    border: 1px solid var(--color-fg);
  }

  .scene-node.playing {
    border: 1px solid var(--color-blue);
  }
  .scene-node.playing .node-label {
    color: white;
  }
  .scene-node.fn.playing {
    border: 1px solid var(--color-blue);
  }
  .scene-node.fn.playing .node-label {
    color: var(--color-blue);
  }

  .scene-node.edge-source {
    border: 1px solid var(--color-fg);
  }

  .scene-node:active {
    opacity: 0.85;
  }

  .node-label {
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
    pointer-events: none;
  }



  /* ── Solo button (near selected pattern node) ── */
  .solo-btn {
    position: absolute;
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    border-radius: 4px;
    border: 1.5px solid rgba(68, 114, 180, 0.4);
    background: rgba(255, 255, 255, 0.85);
    color: rgba(68, 114, 180, 0.7);
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 6;
    transition: background 80ms, border-color 80ms, color 80ms;
  }
  .solo-btn:hover {
    background: rgba(68, 114, 180, 0.12);
    border-color: var(--color-blue);
    color: var(--color-blue);
  }
  .solo-btn.active {
    background: rgba(68, 114, 180, 0.2);
    border-color: var(--color-blue);
    color: var(--color-blue);
    box-shadow: 0 0 6px rgba(68, 114, 180, 0.25);
  }

  /* ── Add button ── */
  .scene-add-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1.5px solid rgba(120, 120, 69, 0.4);
    background: rgba(255, 255, 255, 0.8);
    color: var(--color-olive);
    font-family: var(--font-data);
    font-size: 16px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
    transition: background 80ms, border-color 80ms;
  }
  .scene-add-btn:hover {
    background: rgba(120, 120, 69, 0.1);
    border-color: var(--color-olive);
  }

  /* ── Zoom reset ── */
  .zoom-reset-btn {
    position: absolute;
    top: 8px;
    right: 42px;
    height: 28px;
    padding: 0 8px;
    border-radius: 4px;
    border: 1.5px solid rgba(30, 32, 40, 0.12);
    background: rgba(255, 255, 255, 0.8);
    color: rgba(30, 32, 40, 0.5);
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    z-index: 5;
  }
  .zoom-reset-btn:hover {
    background: rgba(255, 255, 255, 0.95);
    color: var(--color-fg);
  }

  /* ── Picker ── */
  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9;
  }
  .node-picker {
    position: absolute;
    top: 40px;
    right: 8px;
    width: 140px;
    max-height: 200px;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(30, 32, 40, 0.1);
    border-radius: 4px;
    z-index: 10;
    box-shadow: 0 4px 16px rgba(30, 32, 40, 0.15);
  }
  .node-picker::-webkit-scrollbar { width: 0; display: none; }

  .picker-row {
    display: flex;
    align-items: center;
    width: 100%;
    height: 24px;
    padding: 0 8px;
    border: none;
    background: transparent;
    color: rgba(30, 32, 40, 0.6);
    cursor: pointer;
    transition: background 40ms;
  }
  .picker-row:hover {
    background: rgba(120, 120, 69, 0.1);
    color: var(--color-fg);
  }

  .picker-name {
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    flex: 1;
    text-align: left;
  }

  .picker-density {
    width: 24px;
    height: 4px;
    background: rgba(120, 120, 69, calc(0.1 + var(--d) * 0.6));
    border-radius: 1px;
    flex-shrink: 0;
  }

  /* ── Param popup ── */
  .param-popup {
    position: absolute;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(30, 32, 40, 0.12);
    border-radius: 4px;
    padding: 2px;
    z-index: 6;
    box-shadow: 0 2px 8px rgba(30, 32, 40, 0.15);
  }
  .param-btn {
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--color-fg);
    font-family: var(--font-data);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .param-btn:hover {
    background: rgba(30, 32, 40, 0.06);
  }
  .param-btn:active {
    background: rgba(30, 32, 40, 0.12);
  }
  .param-val {
    font-family: var(--font-data);
    font-size: 10px;
    font-weight: 700;
    color: var(--color-fg);
    min-width: 28px;
    text-align: center;
    letter-spacing: 0.04em;
  }

  /* ── Picker separator & function rows ── */
  .picker-sep {
    height: 1px;
    background: rgba(30, 32, 40, 0.08);
    margin: 2px 8px;
  }
  .picker-row.fn-row {
    color: rgba(30, 32, 40, 0.4);
  }
  .picker-row.fn-row:hover {
    background: rgba(30, 32, 40, 0.05);
    color: rgba(30, 32, 40, 0.7);
  }
  .picker-fn-tag {
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    color: rgba(30, 32, 40, 0.3);
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  /* ── Empty state ── */
  .scene-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-data);
    font-size: 10px;
    color: rgba(30, 32, 40, 0.2);
    pointer-events: none;
  }

  /* ── Mobile responsive ── */
  @media (max-width: 639px) {
    .scene-node {
      min-width: 84px;
      height: 40px;
      padding: 0 20px 0 10px;
    }
    .scene-node.fn {
      min-width: 44px;
      height: 24px;
      padding: 0 10px;
    }
    .scene-node.fn .node-label { font-size: 9px; }
    .node-label { font-size: 11px; }
    .scene-add-btn { width: 36px; height: 36px; font-size: 20px; }
    .zoom-reset-btn { right: 50px; }
    .param-btn { width: 32px; height: 32px; font-size: 18px; }
    .param-val { font-size: 13px; min-width: 36px; }
    .node-picker { width: 180px; max-height: 260px; }
    .picker-row { height: 32px; padding: 0 12px; }
    .picker-name { font-size: 10px; }
  }
</style>
