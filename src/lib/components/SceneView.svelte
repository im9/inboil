<script lang="ts">
  import { song, playback, ui, primarySelectedNode, selectPattern, pushUndo } from '../state.svelte.ts'
  import { hasScenePlayback } from '../scenePlayback.ts'
  import { sceneUpdateNode, sceneAddNode, sceneDeleteNode, sceneAddEdge, sceneDeleteEdge, sceneAddGenerativeNode, sceneGenerateWrite, sceneReorderEdge, sceneCopyNode, sceneCopySubgraph, sceneCopySelected, scenePaste, hasSceneClipboard, sceneAlignNodes, sceneAddLabel, sceneDeleteLabel, sceneAttachDecorator } from '../sceneActions.ts'
  import type { AlignMode } from '../sceneActions.ts'
  import { ICON } from '../icons.ts'
  import { TAP_THRESHOLD, PAD_INSET } from '../constants.ts'
  import { PAT_HALF_W, FN_HALF_W, GEN_HALF_W, WORLD_W, WORLD_H, toPixel, bezierEdge, bezierDist, nodeName, nodeColor, nodeSizeKind, decoratorLabel } from '../sceneGeometry.ts'
  import type { GenerativeEngine } from '../state.svelte.ts'
  import { SCALE_MAP } from '../generative.ts'
  import SceneCanvas from './SceneCanvas.svelte'
  import SceneBubbleMenu from './SceneBubbleMenu.svelte'
  import type { BubblePickType } from './SceneBubbleMenu.svelte'
  import SceneLabels from './SceneLabels.svelte'
  import SceneToolbar from './SceneToolbar.svelte'
  import SceneNodePopup from './SceneNodePopup.svelte'
  import AutomationEditor from './AutomationEditor.svelte'

  const { onplay, onstop }: { onplay?: () => void, onstop?: () => void } = $props()

  let viewEl = $state<HTMLDivElement>() as HTMLDivElement

  // ── Drag state ──
  let dragging: string | null = $state(null)  // node id being dragged
  let dragMoved = $state(false)
  let startPos = { x: 0, y: 0 }
  let dragStartNorm = { x: 0, y: 0 }
  let nodeStartPositions = new Map<string, { x: number; y: number }>()
  let dragUndoPushed = false

  // ── Edge creation state ──
  let edgeFrom: string | null = $state(null)  // source node id during edge draw
  let edgeCursor = $state({ x: 0, y: 0 })     // cursor pixel position during edge draw

  // ── Double-click tracking ──
  let lastTapTime = 0
  let lastTapNode = ''

  // ── Long-press (mobile edge creation) ──
  let longPressTimer: ReturnType<typeof setTimeout> | null = null

  // ── Free label editing (delegated to SceneLabels) ──
  let sceneLabelsRef: ReturnType<typeof SceneLabels> | undefined = $state()

  // ── Add-node picker (bubble menu) ──
  let pickerOpen = $state(false)
  let pickerPos = $state({ x: 0, y: 0 })  // pixel position within .scene-view

  // ── Background long-press (mobile: open bubble menu) ──
  let bgLongPressTimer: ReturnType<typeof setTimeout> | null = null
  let bgPointerStart = { x: 0, y: 0 }
  let bgPointerMoved = false

  // ── Space key pan mode ──
  let spaceHeld = $state(false)

  // ── Selection rectangle ──
  let selectRect: { x1: number; y1: number; x2: number; y2: number } | null = $state(null)

  // ── Snap-attach state (ADR 062) ──
  let snapTarget: string | null = $state(null)  // pattern node id for snap highlight
  let justAttached: string | null = $state(null)  // pattern node id for bounce animation

  // ── Drop from MatrixView ──
  let dropActive = $state(false)

  // ── Zoom/Pan state ──
  let zoom = $state(1)      // 0.5 .. 3.0
  let panX = $state(0)      // pixel offset
  let panY = $state(0)      // pixel offset
  let panInitialized = false
  let isPanning = false
  let panPointerStart = { x: 0, y: 0 }
  let panStartX = 0
  let panStartY = 0
  let activePointers = new Map<number, { x: number; y: number }>()
  let pinchStartDist = 0
  let pinchStartZoom = 1

  // ── Automation mini-curve on playing pattern nodes ──
  const MINI_W = 48, MINI_H = 14

  function evaluateMiniCurve(points: import('../state.svelte.ts').AutomationPoint[], t: number): number {
    if (points.length === 0) return 0.5
    if (t <= points[0].t) return points[0].v
    if (t >= points[points.length - 1].t) return points[points.length - 1].v
    let i = 0
    while (i < points.length - 1 && points[i + 1].t <= t) i++
    const p0 = points[i], p1 = points[i + 1]
    const segT = p1.t === p0.t ? 0 : (t - p0.t) / (p1.t - p0.t)
    return p0.v + (p1.v - p0.v) * segT
  }

  function autoMiniPolyline(points: import('../state.svelte.ts').AutomationPoint[]): string {
    if (points.length < 2) return ''
    return points.map(p => `${(p.t * MINI_W).toFixed(1)},${((1 - p.v) * MINI_H).toFixed(1)}`).join(' ')
  }

  /** Playback progress 0–1 for the currently playing pattern */
  const autoProgress = $derived.by(() => {
    if (!playback.playing || playback.playingPattern == null) return 0
    const pat = song.patterns[playback.playingPattern]
    if (!pat) return 0
    const totalSteps = Math.max(1, ...pat.cells.map(c => c.steps))
    const step = playback.playheads[0] ?? 0
    return totalSteps > 1 ? step / (totalSteps - 1) : 0
  })

  /** Center the world in the viewport */
  function centerPan() {
    if (!viewEl) return
    const rect = viewEl.getBoundingClientRect()
    panX = (rect.width - WORLD_W) / 2
    panY = (rect.height - WORLD_H) / 2
  }


  $effect(() => {
    if (viewEl && !panInitialized) {
      panInitialized = true
      centerPan()
    }
  })

  // ── Focus on node from DockPanel navigator (ADR 070) ──
  $effect(() => {
    const nodeId = ui.focusSceneNodeId
    if (!nodeId || !viewEl) return
    const node = song.scene.nodes.find(n => n.id === nodeId)
    if (!node) { ui.focusSceneNodeId = null; return }
    const rect = viewEl.getBoundingClientRect()
    const px = PAD_INSET + node.x * (WORLD_W - PAD_INSET * 2)
    const py = PAD_INSET + node.y * (WORLD_H - PAD_INSET * 2)
    panX = rect.width / 2 - px * zoom
    panY = rect.height / 2 - py * zoom
    ui.focusSceneNodeId = null
  })

  /** Convert client coordinates to normalized 0-1 coords (accounting for zoom/pan) */
  function toNormXY(cx: number, cy: number): { x: number; y: number } | null {
    if (!viewEl) return null
    const rect = viewEl.getBoundingClientRect()
    const canvasX = (cx - rect.left - panX) / zoom
    const canvasY = (cy - rect.top - panY) / zoom
    const x = Math.max(0, Math.min(1, (canvasX - PAD_INSET) / (WORLD_W - PAD_INSET * 2)))
    const y = Math.max(0, Math.min(1, (canvasY - PAD_INSET) / (WORLD_H - PAD_INSET * 2)))
    return { x, y }
  }

  function toNorm(e: PointerEvent) { return toNormXY(e.clientX, e.clientY) }

  /** Find node under pointer (normalized coords, 28px radius in pixels) */
  function hitTestNode(normX: number, normY: number): string | null {
    const px = PAD_INSET + normX * (WORLD_W - PAD_INSET * 2)
    const py = PAD_INSET + normY * (WORLD_H - PAD_INSET * 2)
    for (const node of song.scene.nodes) {
      const np = toPixel(node.x, node.y, WORLD_W, WORLD_H)
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

    dragging = nodeId
    dragMoved = false
    dragUndoPushed = false
    startPos = { x: e.clientX, y: e.clientY }

    // Snapshot positions for group drag
    const norm = toNorm(e)
    if (norm) dragStartNorm = { x: norm.x, y: norm.y }
    nodeStartPositions.clear()
    if (ui.selectedSceneNodes[nodeId]) {
      for (const id of Object.keys(ui.selectedSceneNodes)) {
        const n = song.scene.nodes.find(n => n.id === id)
        if (n) nodeStartPositions.set(id, { x: n.x, y: n.y })
      }
    }

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

  function startEdgeDraw(e: PointerEvent, nodeId: string) {
    e.preventDefault()
    e.stopPropagation()
    // Capture on root element so onMove/endDrag fire correctly
    viewEl?.setPointerCapture(e.pointerId)
    edgeFrom = nodeId
    edgeCursor = { x: e.clientX, y: e.clientY }
    dragMoved = false
    startPos = { x: e.clientX, y: e.clientY }
  }

  function onMove(e: PointerEvent) {
    // Pan / pinch zoom
    if (isPanning) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      // Cancel long-press if pointer moved
      if (bgLongPressTimer && !bgPointerMoved) {
        const dx = Math.abs(e.clientX - bgPointerStart.x)
        const dy = Math.abs(e.clientY - bgPointerStart.y)
        if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
          bgPointerMoved = true
          clearTimeout(bgLongPressTimer)
          bgLongPressTimer = null
        }
      }
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

    // Rectangle selection
    if (selectRect) {
      // Cancel long-press if pointer moved
      if (bgLongPressTimer && !bgPointerMoved) {
        const dx = Math.abs(e.clientX - bgPointerStart.x)
        const dy = Math.abs(e.clientY - bgPointerStart.y)
        if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
          bgPointerMoved = true
          clearTimeout(bgLongPressTimer)
          bgLongPressTimer = null
        }
      }
      selectRect = { ...selectRect, x2: e.clientX, y2: e.clientY }
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
      if (pos) {
        if (ui.selectedSceneNodes[dragging] && nodeStartPositions.size > 1) {
          if (!dragUndoPushed) { pushUndo('Move nodes'); dragUndoPushed = true }
          // Group drag — move all selected nodes by delta
          const dx = pos.x - dragStartNorm.x
          const dy = pos.y - dragStartNorm.y
          for (const [id, start] of nodeStartPositions) {
            const node = song.scene.nodes.find(n => n.id === id)
            if (node) {
              node.x = Math.max(0, Math.min(1, start.x + dx))
              node.y = Math.max(0, Math.min(1, start.y + dy))
            }
          }
        } else {
          sceneUpdateNode(dragging, pos.x, pos.y)
        }
        // Snap detection disabled — legacy fn nodes no longer created (ADR 078)
        snapTarget = null
      }
    }
  }

  /** Handle pointerup directly on a node button (bypasses delegation issues with setPointerCapture) */
  function endNodeDrag(e: PointerEvent, nodeId: string) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }

    // Snap-attach: function node dropped near pattern node (ADR 062)
    if (dragMoved && snapTarget) {
      const attached = sceneAttachDecorator(nodeId, snapTarget)
      if (attached) {
        justAttached = snapTarget
        const id = snapTarget
        setTimeout(() => { if (justAttached === id) justAttached = null }, 200)
      }
      snapTarget = null
      dragging = null
      return
    }
    snapTarget = null

    if (!dragMoved) {
      // Double-click detection
      const now = Date.now()
      if (lastTapNode === nodeId && now - lastTapTime < 300) {
        // Double-click on pattern node → open pattern sheet
        const dblNode = song.scene.nodes.find(n => n.id === nodeId)
        if (dblNode?.type === 'pattern' && dblNode.patternId) {
          const pi = song.patterns.findIndex(p => p.id === dblNode.patternId)
          if (pi >= 0) selectPattern(pi)
          ui.patternSheetOrigin = { x: e.clientX, y: e.clientY }
          ui.patternSheet = true
        } else if (dblNode?.type === 'automation') {
          // Double-click on automation node → ensure dock is open for editing
          // dock is always visible (no minimize)
        } else {
          // Double-click on function/generative node → no-op
        }
        lastTapTime = 0
        lastTapNode = ''
      } else {
        // Single click — select (Shift toggles)
        const node = song.scene.nodes.find(n => n.id === nodeId)
        if (node?.patternId) {
          const pi = song.patterns.findIndex(p => p.id === node.patternId)
          if (pi >= 0) selectPattern(pi)
        }
        if (e.shiftKey) {
          if (ui.selectedSceneNodes[nodeId]) {
            delete ui.selectedSceneNodes[nodeId]
          } else {
            ui.selectedSceneNodes[nodeId] = true
          }
        } else {
          ui.selectedSceneNodes = {}
          ui.selectedSceneNodes[nodeId] = true
        }
        ui.selectedSceneEdge = null
        lastTapTime = now
        lastTapNode = nodeId
      }
    }
    dragging = null
  }

  function endDrag(e: PointerEvent) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    if (bgLongPressTimer) { clearTimeout(bgLongPressTimer); bgLongPressTimer = null }
    activePointers.delete(e.pointerId)
    if (isPanning) {
      if (activePointers.size === 0) isPanning = false
      return
    }

    // Finalize rectangle selection
    if (selectRect) {
      const r = selectRect
      selectRect = null
      const dx = Math.abs(r.x2 - r.x1)
      const dy = Math.abs(r.y2 - r.y1)
      if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
        // Convert rect to canvas coords and select nodes inside
        if (viewEl) {
          const rect = viewEl.getBoundingClientRect()
          const cx1 = (Math.min(r.x1, r.x2) - rect.left - panX) / zoom
          const cy1 = (Math.min(r.y1, r.y2) - rect.top - panY) / zoom
          const cx2 = (Math.max(r.x1, r.x2) - rect.left - panX) / zoom
          const cy2 = (Math.max(r.y1, r.y2) - rect.top - panY) / zoom
          if (!e.shiftKey) ui.selectedSceneNodes = {}
          for (const node of song.scene.nodes) {
            const np = toPixel(node.x, node.y, WORLD_W, WORLD_H)
            if (np.x >= cx1 && np.x <= cx2 && np.y >= cy1 && np.y <= cy2) {
              ui.selectedSceneNodes[node.id] = true
            }
          }
        }
      }
      // If it was just a click (no drag), selection was already cleared in onBgDown
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

    // Node drag is handled by endNodeDrag on the button itself
    if (dragging) {
      dragging = null
    }
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault()
    openPickerAt(e.clientX, e.clientY)
  }

  function onBgDown(e: PointerEvent) {
    // Close bubble menu on any background interaction
    if (pickerOpen) { pickerOpen = false }

    // Middle mouse, Ctrl+left, or Space+left → start pan
    if (e.button === 1 || (e.ctrlKey && e.button === 0) || (spaceHeld && e.button === 0)) {
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
    if (!viewEl) {
      ui.selectedSceneNodes = {}
      ui.selectedSceneEdge = null
      ui.selectedSceneLabel = null
      return
    }
    const rect = viewEl.getBoundingClientRect()
    const px = (e.clientX - rect.left - panX) / zoom
    const py = (e.clientY - rect.top - panY) / zoom
    const { nodes, edges } = song.scene
    let hitEdge: string | null = null
    let bestDist = 8 / zoom
    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.from)
      const toNode = nodes.find(n => n.id === edge.to)
      if (!fromNode || !toNode) continue
      const from = toPixel(fromNode.x, fromNode.y, WORLD_W, WORLD_H)
      const to = toPixel(toNode.x, toNode.y, WORLD_W, WORLD_H)
      const d = bezierDist(px, py, bezierEdge(from, to, nodeSizeKind(fromNode), nodeSizeKind(toNode)))
      if (d < bestDist) {
        bestDist = d
        hitEdge = edge.id
      }
    }

    if (hitEdge) {
      ui.selectedSceneEdge = hitEdge
      ui.selectedSceneNodes = {}
      ui.selectedSceneLabel = null
    } else {
      // Double-click background → open bubble menu at pointer
      const now = Date.now()
      if (lastBgClickTime && now - lastBgClickTime < 300) {
        openPickerAt(e.clientX, e.clientY)
        lastBgClickTime = 0
      } else {
        lastBgClickTime = now

        // Start rectangle selection on background drag
        if (!e.shiftKey) {
          ui.selectedSceneNodes = {}
        }
        ui.selectedSceneEdge = null
        ui.selectedSceneLabel = null
        selectRect = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY }
        viewEl?.setPointerCapture(e.pointerId)

        // Long-press on empty space → open bubble menu (mobile)
        bgPointerStart = { x: e.clientX, y: e.clientY }
        bgPointerMoved = false
        if (bgLongPressTimer) clearTimeout(bgLongPressTimer)
        bgLongPressTimer = setTimeout(() => {
          bgLongPressTimer = null
          if (!bgPointerMoved && selectRect) {
            selectRect = null
            openPickerAt(e.clientX, e.clientY)
            if (navigator.vibrate) navigator.vibrate(30)
          }
        }, 500)
      }
    }
  }

  function onKeydown(e: KeyboardEvent) {
    // Space key → pan mode
    if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault()
      spaceHeld = true
      return
    }
    if (ui.patternSheet) return
    if (e.target instanceof HTMLInputElement) return
    // Let MatrixView handle its own keyboard shortcuts when focused
    if ((e.target as HTMLElement)?.closest?.('.matrix-view')) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (ui.selectedSceneLabel) {
        sceneDeleteLabel(ui.selectedSceneLabel)
        ui.selectedSceneLabel = null
      } else if (ui.selectedSceneEdge) {
        sceneDeleteEdge(ui.selectedSceneEdge)
      } else if (Object.keys(ui.selectedSceneNodes).length > 0) {
        for (const id of Object.keys(ui.selectedSceneNodes)) {
          sceneDeleteNode(id)
        }
        ui.selectedSceneNodes = {}
      }
    }
    if (ui.selectedSceneEdge && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      sceneReorderEdge(ui.selectedSceneEdge, e.key === 'ArrowUp' ? 'up' : 'down')
    }
    if (e.key === 'Escape') {
      ui.selectedSceneNodes = {}
      ui.selectedSceneEdge = null
      ui.selectedSceneLabel = null
      sceneLabelsRef?.clearEditing()
      pickerOpen = false
    }
    const selectedCount = Object.keys(ui.selectedSceneNodes).length
    const primary = primarySelectedNode()
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && primary) {
      e.preventDefault()
      if (e.shiftKey) sceneCopySubgraph(primary)
      else if (selectedCount > 1) sceneCopySelected(ui.selectedSceneNodes)
      else sceneCopyNode(primary)
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && hasSceneClipboard()) {
      e.preventDefault()
      const ids = scenePaste(0.4 + Math.random() * 0.2, 0.4 + Math.random() * 0.2)
      if (ids.length > 0) {
        ui.selectedSceneNodes = {}
        for (const id of ids) ui.selectedSceneNodes[id] = true
        ui.selectedSceneEdge = null
      }
    }
    // Alt+key alignment shortcuts (2+ nodes selected)
    if (e.altKey && Object.keys(ui.selectedSceneNodes).length >= 2) {
      const alignMap: Record<string, AlignMode> = e.shiftKey
        ? { KeyX: 'distribute-h', KeyE: 'distribute-v' }
        : { KeyA: 'left', KeyD: 'right', KeyW: 'top', KeyS: 'bottom', KeyX: 'center-h', KeyE: 'center-v' }
      const mode = alignMap[e.code]
      if (mode) {
        e.preventDefault()
        sceneAlignNodes(ui.selectedSceneNodes, mode)
      }
    }
  }

  function onKeyup(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spaceHeld = false
    }
  }

  // ── Root node helper ──
  const rootNode = $derived(song.scene.nodes.find(n => n.root) ?? null)

  // ── Picker ──

  /** Open bubble menu at a specific position within the scene view */
  function openPickerAt(clientX: number, clientY: number) {
    if (!viewEl) return
    const rect = viewEl.getBoundingClientRect()
    pickerPos = { x: clientX - rect.left, y: clientY - rect.top }
    pickerOpen = true
  }

  /** Check if a pitch class is in a given scale */
  function isScaleDegree(root: number, scale: string, pc: number): boolean {
    const intervals = SCALE_MAP[scale] ?? SCALE_MAP.major
    return intervals.includes((pc - root + 12) % 12)
  }

  function pickBubbleItem(type: BubblePickType) {
    // Convert picker pixel position to normalized coords (accounting for zoom/pan)
    const canvasX = (pickerPos.x - panX) / zoom
    const canvasY = (pickerPos.y - panY) / zoom
    const nx = Math.max(0.05, Math.min(0.95, (canvasX - PAD_INSET) / (WORLD_W - PAD_INSET * 2)))
    const ny = Math.max(0.05, Math.min(0.95, (canvasY - PAD_INSET) / (WORLD_H - PAD_INSET * 2)))
    if (type === 'label') {
      const id = sceneAddLabel(nx, ny)
      ui.selectedSceneNodes = {}
      requestAnimationFrame(() => { sceneLabelsRef?.startEditing(id) })
    } else {
      const id = sceneAddGenerativeNode(type as GenerativeEngine, nx, ny)
      ui.selectedSceneNodes = {}
      ui.selectedSceneNodes[id] = true
    }
    ui.selectedSceneEdge = null
    pickerOpen = false
  }

  /** Add a node near the viewport center with slight random offset to avoid stacking */
  function addNodeAtCenter(type: BubblePickType) {
    if (!viewEl) return
    const rect = viewEl.getBoundingClientRect()
    const jitter = 40 / zoom
    const cx = (rect.width / 2 - panX) / zoom + (Math.random() - 0.5) * jitter * 2
    const cy = (rect.height / 2 - panY) / zoom + (Math.random() - 0.5) * jitter * 2
    const nx = Math.max(0.05, Math.min(0.95, (cx - PAD_INSET) / (WORLD_W - PAD_INSET * 2)))
    const ny = Math.max(0.05, Math.min(0.95, (cy - PAD_INSET) / (WORLD_H - PAD_INSET * 2)))
    if (type === 'label') {
      const id = sceneAddLabel(nx, ny)
      ui.selectedSceneNodes = {}
      requestAnimationFrame(() => { sceneLabelsRef?.startEditing(id) })
    } else {
      const id = sceneAddGenerativeNode(type as GenerativeEngine, nx, ny)
      ui.selectedSceneNodes = {}
      ui.selectedSceneNodes[id] = true
    }
    ui.selectedSceneEdge = null
  }

  // ── Zoom/Pan interactions ──

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    if (!viewEl) return
    if (e.ctrlKey || e.metaKey) {
      // Pinch-to-zoom (trackpad) or Ctrl+scroll (mouse)
      const rect = viewEl.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.5, Math.min(3, zoom * factor))
      panX = cx - (cx - panX) * (newZoom / zoom)
      panY = cy - (cy - panY) * (newZoom / zoom)
      zoom = newZoom
    } else {
      // 2-finger swipe (trackpad) or scroll wheel → pan
      panX -= e.deltaX
      panY -= e.deltaY
    }
  }

  let lastBgClickTime = 0

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
    ui.selectedSceneNodes = {}
    ui.selectedSceneNodes[id] = true
  }

  function onDragLeave() {
    dropActive = false
  }
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="scene-view"
  class:drop-active={dropActive}
  class:space-pan={spaceHeld}
  bind:this={viewEl}
  onpointermove={onMove}
  onpointerup={endDrag}
  onpointercancel={(e) => { activePointers.delete(e.pointerId); dragging = null; edgeFrom = null; isPanning = false; selectRect = null }}
  onpointerdown={onBgDown}
  oncontextmenu={onContextMenu}
  onwheel={onWheel}
  ondragover={onDragOver}
  ondrop={onDrop}
  ondragleave={onDragLeave}
>
  <SceneCanvas {zoom} {panX} {panY} {edgeFrom} {dragMoved} {edgeCursor} {viewEl} />

  <!-- Selection rectangle -->
  {#if selectRect && viewEl}
    {@const rect = viewEl.getBoundingClientRect()}
    {@const sx = Math.min(selectRect.x1, selectRect.x2) - rect.left}
    {@const sy = Math.min(selectRect.y1, selectRect.y2) - rect.top}
    {@const sw = Math.abs(selectRect.x2 - selectRect.x1)}
    {@const sh = Math.abs(selectRect.y2 - selectRect.y1)}
    {#if sw > TAP_THRESHOLD || sh > TAP_THRESHOLD}
      <div class="select-rect" style="left:{sx}px;top:{sy}px;width:{sw}px;height:{sh}px"></div>
    {/if}
  {/if}

  <!-- Transform container for nodes (zoom/pan) -->
  <div class="scene-transform" style="width: {WORLD_W}px; height: {WORLD_H}px; transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: 0 0">
    {#each song.scene.nodes as node (node.id)}
      {@const isFn = node.type !== 'pattern' && node.type !== 'generative'}
      {@const isGen = node.type === 'generative'}
      {@const isRoot = node.root}
      {@const isSelected = ui.selectedSceneNodes[node.id]}
      {@const isDragging = dragging === node.id}
      {@const isEdgeSource = edgeFrom === node.id}
      {@const isPlaying = playback.playing && playback.sceneNodeId === node.id}
      {@const isSnapTarget = snapTarget === node.id}
      {@const isBouncing = justAttached === node.id}
      {@const decs = node.decorators ?? []}
      {@const nc = nodeColor(node, song.patterns)}
      {@const handleOffset = isGen ? GEN_HALF_W : isFn ? FN_HALF_W : PAT_HALF_W}
      <button
        class="scene-node"
        class:fn={isFn}
        class:gen={isGen}
        class:root={isRoot}
        class:selected={isSelected}
        class:dragging={isDragging}
        class:edge-source={isEdgeSource}
        class:playing={isPlaying}
        class:snap-target={isSnapTarget}
        class:just-attached={isBouncing}
        style="
          left: {PAD_INSET + node.x * (WORLD_W - PAD_INSET * 2)}px;
          top: {PAD_INSET + node.y * (WORLD_H - PAD_INSET * 2)}px;
          {nc ? `--nc: ${nc};` : ''}
          {isPlaying ? `--beat: ${30 / song.bpm}s` : ''}
        "
        onpointerdown={e => startDrag(e, node.id)}
        onpointerup={e => endNodeDrag(e, node.id)}
      >
        {#if isGen && node.generative}
          <!-- Generative node faceplate (ADR 078) -->
          {#if node.generative.engine === 'turing'}
            {@const tp = node.generative.params}
            <div class="gen-faceplate turing">
              <div class="turing-bits">
                {#each Array(tp.engine === 'turing' ? (tp as import('../state.svelte.ts').TuringParams).length : 8) as _, i}
                  <span class="turing-bit" class:on={i % 3 === 0}></span>
                {/each}
              </div>
              <span class="gen-label">{nodeName(node, song.patterns)}</span>
              <div class="gen-controls">
                <!-- svelte-ignore node_invalid_placement_ssr -->
                <span class="gen-run-btn" role="button" tabindex="-1"
                  data-tip="Generate" data-tip-ja="生成"
                  onpointerdown={e => { e.stopPropagation(); sceneGenerateWrite(node.id) }}
                >GEN</span>
              </div>
            </div>
          {:else if node.generative.engine === 'quantizer'}
            {@const qp = node.generative.params as import('../state.svelte.ts').QuantizerParams}
            <div class="gen-faceplate quantizer">
              <div class="quant-keys">
                {#each [0,1,2,3,4,5,6,7,8,9,10,11] as pc}
                  {@const isBlack = [1,3,6,8,10].includes(pc)}
                  <span class="quant-key" class:black={isBlack} class:active={isScaleDegree(qp.root, qp.scale, pc)}></span>
                {/each}
              </div>
              <span class="gen-label">{nodeName(node, song.patterns)}</span>
              <div class="gen-controls">
                <!-- svelte-ignore node_invalid_placement_ssr -->
                <span class="gen-run-btn" role="button" tabindex="-1"
                  data-tip="Generate" data-tip-ja="生成"
                  onpointerdown={e => { e.stopPropagation(); sceneGenerateWrite(node.id) }}
                >GEN</span>
              </div>
            </div>
          {:else if node.generative.engine === 'tonnetz'}
            {@const tnp = node.generative.params as import('../state.svelte.ts').TonnetzParams}
            <div class="gen-faceplate tonnetz">
              <div class="tonnetz-ops">
                {#each tnp.sequence.slice(0, 5) as op}
                  <span class="tonnetz-op">{op}</span>
                {/each}
              </div>
              <span class="gen-label">{nodeName(node, song.patterns)}</span>
              <div class="gen-controls">
                <!-- svelte-ignore node_invalid_placement_ssr -->
                <span class="gen-run-btn" role="button" tabindex="-1"
                  data-tip="Generate" data-tip-ja="生成"
                  onpointerdown={e => { e.stopPropagation(); sceneGenerateWrite(node.id) }}
                >GEN</span>
              </div>
            </div>
          {:else}
            <span class="node-label">{nodeName(node, song.patterns)}</span>
          {/if}
        {:else}
          <span class="node-label">{nodeName(node, song.patterns)}</span>
        {/if}
        {#if !isFn && !isGen && decs.length > 0}
          <span class="dec-row">
            {#each decs as dec}
              <span class="dec-tag">{decoratorLabel(dec)}</span>
            {/each}
          </span>
        {/if}
        {#if isPlaying && !isFn && !isGen && decs.some(d => d.type === 'automation' && d.automationParams)}
          {@const autoDecs = decs.filter(d => d.type === 'automation' && d.automationParams)}
          <span class="auto-mini-row">
            {#each autoDecs as ad}
              <svg class="auto-mini" viewBox="0 0 {MINI_W} {MINI_H}" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={autoMiniPolyline(ad.automationParams!.points)} fill="none" stroke="rgba(120,120,69,0.5)" stroke-width="1.2" />
                <circle cx={autoProgress * MINI_W} cy={(1 - (ad.automationParams!.points.length > 0 ? evaluateMiniCurve(ad.automationParams!.points, autoProgress) : 0.5)) * MINI_H} r="2" fill="rgba(120,120,69,0.9)" />
              </svg>
            {/each}
          </span>
        {/if}
      </button>
      <!-- Output handle for edge creation -->
      <div
        class="edge-handle"
        class:fn={isFn}
        class:gen={isGen}
        style="
          left: calc({PAD_INSET}px + {node.x} * (100% - {PAD_INSET * 2}px) + {handleOffset}px);
          top: calc({PAD_INSET}px + {node.y} * (100% - {PAD_INSET * 2}px));
        "
        onpointerdown={e => startEdgeDraw(e, node.id)}
        role="button"
        tabindex="-1"
      ></div>
    {/each}

    <!-- Scene play/stop button next to root node -->
    {#if rootNode && hasScenePlayback()}
      <button
        class="scene-play-btn"
        class:playing={playback.mode === 'scene' && playback.playing}
        class:active={playback.mode === 'scene'}
        style="
          left: calc({PAD_INSET}px + {rootNode.x} * (100% - {PAD_INSET * 2}px) - {rootNode.type === 'pattern' ? 52 : rootNode.type === 'generative' ? 76 : 40}px);
          top: calc({PAD_INSET}px + {rootNode.y} * (100% - {PAD_INSET * 2}px));
        "
        onpointerdown={e => {
          e.stopPropagation()
          if (playback.playing && playback.mode === 'scene') {
            onstop?.()
          } else if (playback.playing) {
            playback.mode = 'scene'
          } else {
            playback.mode = 'scene'
            onplay?.()
          }
        }}
        data-tip="Scene play/stop" data-tip-ja="シーン再生/停止"
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
    {/if}

    <!-- Solo button: show on soloed node or selected pattern node -->
    {#each song.scene.nodes as node (node.id)}
      {#if node.type === 'pattern'}
        {@const isSoloing = playback.soloNodeId === node.id}
        {@const isLooping = isSoloing && playback.sceneNodeId === node.id}
        {@const isArmed = isSoloing && !isLooping}
        {@const isSelected = ui.selectedSceneNodes[node.id]}
        {#if isSoloing || isSelected}
          <button
            class="solo-btn"
            class:active={isLooping}
            class:armed={isArmed}
            style="
              left: calc({PAD_INSET}px + {node.x} * (100% - {PAD_INSET * 2}px) + 36px);
              top: calc({PAD_INSET}px + {node.y} * (100% - {PAD_INSET * 2}px));
            "
            onpointerdown={e => {
              e.stopPropagation()
              if (isSoloing) {
                playback.soloNodeId = null
              } else {
                playback.soloNodeId = node.id
                const patIdx = song.patterns.findIndex(p => p.id === node.patternId)
                if (patIdx >= 0) selectPattern(patIdx)
              }
            }}
            data-tip="Solo pattern" data-tip-ja="パターンソロ"
            aria-label="Solo pattern"
          >
            <svg class="solo-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">{@html ICON.solo}</svg>
          </button>
        {/if}
      {/if}
    {/each}

    <SceneNodePopup />
    <AutomationEditor />

    <SceneLabels bind:this={sceneLabelsRef} {zoom} {panX} {panY} {viewEl} />
  </div>

  <!-- UI controls (outside zoom/pan transform) -->
  <SceneToolbar {zoom} {viewEl}
    onpan={(x, y) => { panX = x; panY = y }}
    onreset={(x, y) => { zoom = 1; panX = x; panY = y }}
    onadd={addNodeAtCenter}
  />

  <!-- Radial bubble menu for function nodes (appears at pointer position) -->
  {#if pickerOpen}
    <SceneBubbleMenu
      pos={pickerPos}
      containerWidth={viewEl?.clientWidth ?? 0}
      containerHeight={viewEl?.clientHeight ?? 0}
      onpick={pickBubbleItem}
      onclose={() => { pickerOpen = false }}
    />
  {/if}

  {#if true}
    <div class="scene-empty" class:has-nodes={song.scene.nodes.length > 0} data-tip="Drag patterns from the matrix, then connect them" data-tip-ja="マトリクスからパターンをドラッグし、接続して曲を作ろう">
      <div class="empty-steps">
        <span class="empty-step">
          <span class="empty-icon">■</span>
          <span>Drag patterns here</span>
        </span>
        <span class="empty-arrow">→</span>
        <span class="empty-step">
          <span class="empty-nodes">
            <span class="empty-node root"></span>
            <span class="empty-edge"></span>
            <span class="empty-node"></span>
          </span>
          <span>Connect to build a song</span>
        </span>
      </div>
    </div>
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
    cursor: default;
  }
  .scene-view.space-pan {
    cursor: grab;
  }
  .scene-view.space-pan:active {
    cursor: grabbing;
  }
  .scene-view.drop-active {
    outline: 2px dashed rgba(30,32,40,0.25);
    outline-offset: -2px;
  }

  .select-rect {
    position: absolute;
    border: 1px dashed rgba(30, 32, 40, 0.4);
    background: rgba(30, 32, 40, 0.06);
    z-index: 8;
    pointer-events: none;
  }

  .scene-transform {
    position: absolute;
    top: 0;
    left: 0;
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
    border: 2px solid var(--color-fg);
  }

  /* ── Scene play/stop button (next to root node) ── */
  .scene-play-btn {
    position: absolute;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid rgba(30, 32, 40, 0.3);
    background: rgba(255, 255, 255, 0.95);
    color: rgba(30, 32, 40, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 6;
    transition: background 80ms, border-color 80ms, color 80ms, box-shadow 80ms;
    box-shadow: 0 1px 4px rgba(30, 32, 40, 0.15);
  }
  .scene-play-btn:hover {
    border-color: var(--color-fg);
    color: var(--color-fg);
    background: white;
  }
  .scene-play-btn.active {
    border-color: var(--color-fg);
    background: white;
    color: var(--color-fg);
    box-shadow: 0 1px 4px rgba(30, 32, 40, 0.2);
  }
  .scene-play-btn.playing {
    border-color: var(--color-fg);
    background: white;
    color: var(--color-fg);
    animation: scene-pulse 1.2s ease-in-out infinite;
  }
  @keyframes scene-pulse {
    0%, 100% { box-shadow: 0 1px 4px rgba(30, 32, 40, 0.15); }
    50% { box-shadow: 0 0 0 5px rgba(30, 32, 40, 0.1); }
  }

  /* ── Snap-attach highlight (ADR 062) ── */
  .scene-node.snap-target {
    outline: 2px solid var(--color-olive);
    outline-offset: 3px;
    filter: brightness(1.1);
  }
  .scene-node.just-attached {
    animation: dec-bounce 200ms cubic-bezier(0.2, 0, 0, 1.3);
  }
  @keyframes dec-bounce {
    0%   { transform: translate(-50%, -50%) scale(1.08); }
    100% { transform: translate(-50%, -50%) scale(1); }
  }

  /* ── Decorator row on pattern nodes (ADR 062) ── */
  .dec-row {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    padding-top: 2px;
    pointer-events: none;
  }
  .dec-tag {
    background: var(--color-fg);
    color: rgba(237, 232, 220, 0.7);
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 4px;
    border-radius: 6px;
    white-space: nowrap;
    animation: dec-pop-in 120ms cubic-bezier(0.2, 0, 0, 1.3);
  }
  .scene-node.playing .dec-tag {
    animation: dec-flash 80ms ease-out;
  }
  @keyframes dec-pop-in {
    0%   { transform: scale(0.8); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes dec-flash {
    0%   { filter: brightness(1.6); }
    100% { filter: brightness(1); }
  }
  .dec-tag:hover {
    transform: translateY(-1px);
    transition: transform 60ms ease-out;
  }

  /* ── Automation mini-curve on playing pattern nodes ── */
  .auto-mini-row {
    position: absolute;
    bottom: 2px;
    left: 4px;
    right: 4px;
    display: flex;
    gap: 2px;
    pointer-events: none;
    overflow: hidden;
  }
  .auto-mini {
    opacity: 0.8;
    flex: 1 1 0;
    min-width: 0;
    height: 12px;
  }

  .scene-node.selected {
    outline: 1.5px dashed var(--color-fg);
    outline-offset: 2px;
  }

  .scene-node.dragging {
    cursor: grabbing;
    z-index: 3;
    transform: translate(-50%, -50%) scale(1.04);
  }

  /* ── Function nodes (pill-shaped with SVG icons) ── */
  .scene-node.fn {
    min-width: 48px;
    height: 24px;
    border-radius: 12px;
    background: var(--color-fg);
    color: rgba(237, 232, 220, 0.7);
    padding: 0 6px;
    gap: 3px;
  }
  .scene-node.fn .node-label {
    font-size: 8px;
  }
  .scene-node.fn.selected {
    color: var(--color-bg);
    outline: 1.5px dashed var(--color-fg);
    outline-offset: 2px;
  }

  /* ── Generative node faceplate (ADR 078) ── */
  .scene-node.gen {
    width: 120px;
    height: 72px;
    border-radius: 8px;
    background: var(--nc, var(--color-fg));
    color: rgba(237, 232, 220, 0.9);
    border: 1.5px dashed rgba(237, 232, 220, 0.3);
    padding: 6px 8px;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
  }
  .scene-node.gen.selected {
    outline: 2px solid rgba(237, 232, 220, 0.8);
    outline-offset: 2px;
  }
  .gen-faceplate {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    height: 100%;
  }
  .gen-label {
    font-family: var(--font-data);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    opacity: 0.9;
  }
  .gen-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .gen-run-btn {
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border: 1px solid rgba(237, 232, 220, 0.3);
    border-radius: 3px;
    background: rgba(237, 232, 220, 0.1);
    color: rgba(237, 232, 220, 0.8);
    cursor: pointer;
  }
  .gen-run-btn:hover {
    background: rgba(237, 232, 220, 0.25);
    color: white;
  }
  .gen-run-btn:active {
    transform: scale(0.95);
  }
  /* Turing Machine bits */
  .turing-bits {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
  }
  .turing-bit {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: rgba(237, 232, 220, 0.2);
    flex-shrink: 0;
  }
  .turing-bit.on {
    background: rgba(237, 232, 220, 0.85);
  }
  /* Quantizer mini keyboard */
  .quant-keys {
    display: flex;
    gap: 1px;
    height: 16px;
  }
  .quant-key {
    flex: 1;
    border-radius: 1px;
    background: rgba(237, 232, 220, 0.15);
  }
  .quant-key.black {
    background: rgba(237, 232, 220, 0.08);
    margin-top: 2px;
  }
  .quant-key.active {
    background: rgba(237, 232, 220, 0.75);
  }
  .quant-key.black.active {
    background: rgba(237, 232, 220, 0.6);
  }
  /* Tonnetz transform ops */
  .tonnetz-ops {
    display: flex;
    gap: 3px;
  }
  .tonnetz-op {
    font-family: var(--font-data);
    font-size: 8px;
    font-weight: 700;
    padding: 1px 3px;
    border-radius: 2px;
    background: rgba(237, 232, 220, 0.2);
    color: rgba(237, 232, 220, 0.85);
  }

  .scene-node.playing {
    border: 1.5px solid rgba(255, 255, 255, 0.75);
    animation: node-pulse var(--beat, 0.25s) ease-out infinite alternate;
  }
  .scene-node.playing .node-label {
    color: white;
  }
  .scene-node.fn.playing {
    border: 1.5px solid rgba(255, 255, 255, 0.75);
    animation: node-pulse var(--beat, 0.25s) ease-out infinite alternate;
  }

  @keyframes node-pulse {
    from { filter: brightness(1.35); }
    to   { filter: brightness(1.0); }
  }
  .scene-node.fn.playing .node-label {
    color: rgba(255, 255, 255, 0.9);
  }

  .scene-node.edge-source {
    border: 1px solid var(--color-fg);
  }

  .scene-node:active {
    opacity: 0.85;
  }

  /* ── Edge connection handle ── */
  .edge-handle {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(30, 32, 40, 0.25);
    border: 1.5px solid rgba(30, 32, 40, 0.4);
    transform: translate(-50%, -50%);
    cursor: crosshair;
    z-index: 4;
    transition: background 80ms, transform 80ms;
  }
  .edge-handle:hover {
    background: rgba(30, 32, 40, 0.5);
    border-color: var(--color-fg);
    transform: translate(-50%, -50%) scale(1.3);
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
    border: 1.5px solid rgba(30, 32, 40, 0.3);
    background: rgba(255, 255, 255, 0.85);
    color: rgba(30, 32, 40, 0.5);
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
    background: rgba(255, 255, 255, 0.95);
    border-color: var(--color-fg);
    color: var(--color-fg);
  }
  .solo-btn.armed {
    background: rgba(30, 32, 40, 0.06);
    border-color: rgba(30, 32, 40, 0.4);
    color: rgba(30, 32, 40, 0.4);
    border-style: dashed;
  }
  .solo-btn.active {
    background: rgba(30, 32, 40, 0.12);
    border-color: var(--color-fg);
    color: var(--color-fg);
    box-shadow: 0 0 6px rgba(30, 32, 40, 0.15);
  }
  .solo-btn.active .solo-icon {
    animation: solo-spin 1.5s linear infinite;
  }
  @keyframes solo-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .solo-icon {
    pointer-events: none;
  }

  /* ── Empty state ── */
  .scene-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .scene-empty.has-nodes {
    display: none;
  }
  .empty-steps {
    display: flex;
    align-items: center;
    gap: 16px;
    font-family: var(--font-data);
    font-size: 13px;
    color: var(--color-olive);
  }
  .empty-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .empty-icon {
    font-size: 24px;
    line-height: 1;
    opacity: 0.5;
  }
  .empty-arrow {
    font-size: 18px;
    opacity: 0.35;
    margin-top: -14px;
  }
  .empty-nodes {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .empty-node {
    width: 28px;
    height: 14px;
    background: var(--color-olive);
    opacity: 0.45;
  }
  .empty-node.root {
    border: 1.5px solid var(--color-fg);
    opacity: 0.55;
  }
  .empty-edge {
    width: 12px;
    height: 0;
    border-top: 1.5px solid var(--color-olive);
    opacity: 0.35;
  }

  /* ── Mobile responsive ── */
  @media (max-width: 639px) {
    .scene-node {
      min-width: 84px;
      height: 40px;
      padding: 0 20px 0 10px;
    }
    .scene-node.fn {
      min-width: 56px;
      height: 28px;
      border-radius: 14px;
      padding: 0 8px;
      gap: 4px;
    }
    .scene-node.fn .node-label { font-size: 9px; }
    .node-label { font-size: 11px; }
    .scene-play-btn { width: 34px; height: 34px; }
  }
</style>
