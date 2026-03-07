<script lang="ts">
  import { song, playback, ui, primarySelectedNode, selectPattern, sceneUpdateNode, sceneAddNode, sceneDeleteNode, sceneAddEdge, sceneDeleteEdge, sceneSetRoot, sceneAddFunctionNode, sceneUpdateNodeParams, sceneReorderEdge, sceneCopyNode, sceneCopySubgraph, scenePaste, hasSceneClipboard, hasScenePlayback, sceneFormatNodes, sceneAddLabel, sceneUpdateLabel, sceneDeleteLabel, sceneMoveLabel, sceneResizeLabel, pushUndo } from '../state.svelte.ts'
  import { ICON } from '../icons.ts'
  import { TAP_THRESHOLD, PAD_INSET, PATTERN_COLORS } from '../constants.ts'
  import { PAT_HALF_W, FN_HALF_W, WORLD_W, WORLD_H, toPixel, bezierEdge, bezierDist } from '../sceneGeometry.ts'
  import SceneCanvas from './SceneCanvas.svelte'
  import SceneBubbleMenu from './SceneBubbleMenu.svelte'
  import type { BubblePickType } from './SceneBubbleMenu.svelte'

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

  // ── Free label editing ──
  let editingLabelId: string | null = $state(null)
  let draggingLabel: string | null = $state(null)
  let resizingLabel: string | null = $state(null)
  let resizeStartY = 0
  let resizeStartSize = 1

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

  /** Center the world in the viewport */
  function centerPan() {
    if (!viewEl) return
    const rect = viewEl.getBoundingClientRect()
    panX = (rect.width - WORLD_W) / 2
    panY = (rect.height - WORLD_H) / 2
  }

  /** Pan to center the root node in the viewport */
  function focusRoot() {
    const root = song.scene.nodes.find(n => n.root)
    if (!root || !viewEl) return
    const rect = viewEl.getBoundingClientRect()
    const pos = toPixel(root.x, root.y, WORLD_W, WORLD_H)
    panX = rect.width / 2 - pos.x * zoom
    panY = rect.height / 2 - pos.y * zoom
  }

  /** Pan to center the currently playing node */
  function focusPlaying() {
    if (!playback.sceneNodeId || !viewEl) return
    const node = song.scene.nodes.find(n => n.id === playback.sceneNodeId)
    if (!node) return
    const rect = viewEl.getBoundingClientRect()
    const pos = toPixel(node.x, node.y, WORLD_W, WORLD_H)
    panX = rect.width / 2 - pos.x * zoom
    panY = rect.height / 2 - pos.y * zoom
  }

  $effect(() => {
    if (viewEl && !panInitialized) {
      panInitialized = true
      centerPan()
    }
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
      }
    }
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

    if (!dragging) return
    const nodeId = dragging
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
        } else {
          // Double-click on function node → set root
          sceneSetRoot(nodeId)
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
      const d = bezierDist(px, py, bezierEdge(from, to, fromNode.type !== 'pattern', toNode.type !== 'pattern'))
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
      editingLabelId = null
      pickerOpen = false
    }
    const primary = primarySelectedNode()
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && primary) {
      e.preventDefault()
      if (e.shiftKey) sceneCopySubgraph(primary)
      else sceneCopyNode(primary)
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && hasSceneClipboard()) {
      e.preventDefault()
      const ids = scenePaste(0.4 + Math.random() * 0.2, 0.4 + Math.random() * 0.2)
      if (ids.length > 0) {
        ui.selectedSceneNodes = {}
        ui.selectedSceneNodes[ids[0]] = true
        ui.selectedSceneEdge = null
      }
    }
  }

  function onKeyup(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spaceHeld = false
    }
  }

  /** Get display label for a node */
  function nodeName(node: typeof song.scene.nodes[0]): string {
    if (node.type === 'pattern') {
      const pat = song.patterns.find(p => p.id === node.patternId)
      return pat?.name || '---'
    }
    if (node.type === 'transpose') {
      if (node.params?.mode === 1) {
        const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        return `KEY ${NOTE_NAMES[node.params?.key ?? 0]}`
      }
      const s = node.params?.semitones ?? 0
      return `T${s >= 0 ? '+' : ''}${s}`
    }
    if (node.type === 'tempo') return `×${node.params?.bpm ?? 120}`
    if (node.type === 'repeat') return `RPT${node.params?.count ?? 2}`
    if (node.type === 'probability') return '?%'
    if (node.type === 'fx') {
      const p = node.params ?? {}
      const tags = []
      if (p.verb) tags.push('V')
      if (p.delay) tags.push('D')
      if (p.glitch) tags.push('G')
      if (p.granular) tags.push('R')
      return tags.length > 0 ? `FX ${tags.join('')}` : 'FX'
    }
    return '?'
  }

  /** Get color hex for a pattern node (function nodes return null) */
  function nodeColor(node: typeof song.scene.nodes[0]): string | null {
    if (node.type !== 'pattern') return null
    const pat = song.patterns.find(p => p.id === node.patternId)
    return PATTERN_COLORS[pat?.color ?? 0]
  }

  // ── Root node helper ──
  const rootNode = $derived(song.scene.nodes.find(n => n.root) ?? null)

  // ── Selected node helpers ──

  const selectedFnNode = $derived.by(() => {
    const primary = primarySelectedNode()
    if (!primary || Object.keys(ui.selectedSceneNodes).length !== 1) return null
    const n = song.scene.nodes.find(n => n.id === primary)
    return (n && n.type !== 'pattern') ? n : null
  })

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const paramDisplay = $derived.by(() => {
    if (!selectedFnNode) return ''
    if (selectedFnNode.type === 'transpose') {
      if (selectedFnNode.params?.mode === 1) return NOTE_NAMES[selectedFnNode.params?.key ?? 0]
      return String(selectedFnNode.params?.semitones ?? 0)
    }
    if (selectedFnNode.type === 'tempo') return String(selectedFnNode.params?.bpm ?? 120)
    if (selectedFnNode.type === 'repeat') return String(selectedFnNode.params?.count ?? 2)
    return ''
  })

  function incParam(e: PointerEvent) {
    e.stopPropagation()
    if (!selectedFnNode) return
    const p = { ...(selectedFnNode.params || {}) }
    if (selectedFnNode.type === 'transpose') {
      if (p.mode === 1) p.key = ((p.key ?? 0) + 1) % 12
      else p.semitones = Math.min(12, (p.semitones ?? 0) + 1)
    }
    else if (selectedFnNode.type === 'tempo') p.bpm = Math.min(300, (p.bpm ?? 120) + 5)
    else if (selectedFnNode.type === 'repeat') p.count = Math.min(16, (p.count ?? 2) + 1)
    sceneUpdateNodeParams(selectedFnNode.id, p)
  }

  function decParam(e: PointerEvent) {
    e.stopPropagation()
    if (!selectedFnNode) return
    const p = { ...(selectedFnNode.params || {}) }
    if (selectedFnNode.type === 'transpose') {
      if (p.mode === 1) p.key = ((p.key ?? 0) + 11) % 12
      else p.semitones = Math.max(-12, (p.semitones ?? 0) - 1)
    }
    else if (selectedFnNode.type === 'tempo') p.bpm = Math.max(60, (p.bpm ?? 120) - 5)
    else if (selectedFnNode.type === 'repeat') p.count = Math.max(1, (p.count ?? 2) - 1)
    sceneUpdateNodeParams(selectedFnNode.id, p)
  }

  function toggleTransposeMode(e: PointerEvent) {
    e.stopPropagation()
    if (!selectedFnNode || selectedFnNode.type !== 'transpose') return
    const p = { ...(selectedFnNode.params || {}) }
    p.mode = p.mode === 1 ? 0 : 1
    sceneUpdateNodeParams(selectedFnNode.id, p)
  }

  // ── Picker ──

  /** Open bubble menu at a specific position within the scene view */
  function openPickerAt(clientX: number, clientY: number) {
    if (!viewEl) return
    const rect = viewEl.getBoundingClientRect()
    pickerPos = { x: clientX - rect.left, y: clientY - rect.top }
    pickerOpen = true
  }

  function toggleFxParam(key: string) {
    if (!selectedFnNode || selectedFnNode.type !== 'fx') return
    const p = { ...(selectedFnNode.params || {}) }
    p[key] = p[key] ? 0 : 1
    sceneUpdateNodeParams(selectedFnNode.id, p)
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
      // Defer editing mode so the label renders first
      requestAnimationFrame(() => { editingLabelId = id })
    } else {
      const id = sceneAddFunctionNode(type, nx, ny)
      ui.selectedSceneNodes = {}
      ui.selectedSceneNodes[id] = true
    }
    ui.selectedSceneEdge = null
    pickerOpen = false
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
      {@const isFn = node.type !== 'pattern'}
      {@const isRoot = node.root}
      {@const isSelected = ui.selectedSceneNodes[node.id]}
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
          left: {PAD_INSET + node.x * (WORLD_W - PAD_INSET * 2)}px;
          top: {PAD_INSET + node.y * (WORLD_H - PAD_INSET * 2)}px;
          {nc ? `--nc: ${nc};` : ''}
          {isPlaying ? `--beat: ${30 / song.bpm}s` : ''}
        "
        onpointerdown={e => startDrag(e, node.id)}
      >
        {#if node.type === 'transpose'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" fill="currentColor" aria-hidden="true">{@html ICON.transpose}</svg>
          <span class="node-label">{nodeName(node)}</span>
        {:else if node.type === 'tempo'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">{@html ICON.tempo}</svg>
          <span class="node-label">{nodeName(node)}</span>
        {:else if node.type === 'repeat'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">{@html ICON.repeat}</svg>
          <span class="node-label">{nodeName(node)}</span>
        {:else if node.type === 'probability'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">{@html ICON.probability}</svg>
        {:else if node.type === 'fx'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">{@html ICON.fx}</svg>
          <span class="node-label">{nodeName(node)}</span>
        {:else}
          <span class="node-label">{nodeName(node)}</span>
        {/if}
      </button>
      <!-- Output handle for edge creation -->
      <div
        class="edge-handle"
        class:fn={isFn}
        style="
          left: calc({PAD_INSET}px + {node.x} * (100% - {PAD_INSET * 2}px) + {isFn ? FN_HALF_W : PAT_HALF_W}px);
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
          left: calc({PAD_INSET}px + {rootNode.x} * (100% - {PAD_INSET * 2}px) - {rootNode.type === 'pattern' ? 52 : 40}px);
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

    <!-- Param popup for selected function node -->
    {#if selectedFnNode && selectedFnNode.type !== 'probability' && selectedFnNode.type !== 'fx'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="param-popup" style="
        left: calc({PAD_INSET}px + {selectedFnNode.x} * (100% - {PAD_INSET * 2}px) + 28px);
        top: calc({PAD_INSET}px + {selectedFnNode.y} * (100% - {PAD_INSET * 2}px));
      " onpointerdown={e => e.stopPropagation()}>
        {#if selectedFnNode.type === 'transpose'}
          <button
            class="mode-toggle"
            class:absolute={selectedFnNode.params?.mode === 1}
            onpointerdown={toggleTransposeMode}
            data-tip={selectedFnNode.params?.mode === 1 ? 'Switch to relative' : 'Switch to absolute key'}
            data-tip-ja={selectedFnNode.params?.mode === 1 ? '相対モードに切替' : '絶対キーに切替'}
          >{selectedFnNode.params?.mode === 1 ? 'ABS' : 'REL'}</button>
        {/if}
        <button class="param-btn" onpointerdown={decParam}>−</button>
        <span class="param-val">{paramDisplay}</span>
        <button class="param-btn" onpointerdown={incParam}>+</button>
      </div>
    {/if}

    <!-- FX toggle popup for selected fx node -->
    {#if selectedFnNode && selectedFnNode.type === 'fx'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="param-popup fx-popup" style="
        left: calc({PAD_INSET}px + {selectedFnNode.x} * (100% - {PAD_INSET * 2}px) + 28px);
        top: calc({PAD_INSET}px + {selectedFnNode.y} * (100% - {PAD_INSET * 2}px));
      " onpointerdown={e => e.stopPropagation()}>
        {#each [['verb', 'VRB'], ['delay', 'DLY'], ['glitch', 'GLT'], ['granular', 'GRN']] as [key, label]}
          <button
            class="fx-toggle"
            class:active={selectedFnNode.params?.[key]}
            onpointerdown={e => { e.stopPropagation(); toggleFxParam(key) }}
          >{label}</button>
        {/each}
      </div>
    {/if}

    <!-- Free-floating labels -->
    {#each (song.scene.labels ?? []) as label (label.id)}
      {@const fontSize = 10 * (label.size ?? 1)}
      {#if editingLabelId === label.id}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="scene-label-edit"
          style="
            left: {PAD_INSET + label.x * (WORLD_W - PAD_INSET * 2)}px;
            top: {PAD_INSET + label.y * (WORLD_H - PAD_INSET * 2)}px;
            font-size: {fontSize}px;
          "
          type="text"
          value={label.text}
          maxlength={32}
          autofocus
          onpointerdown={(e: PointerEvent) => e.stopPropagation()}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
            if (e.key === 'Escape') { editingLabelId = null }
          }}
          onblur={(e: FocusEvent) => {
            sceneUpdateLabel(label.id, (e.currentTarget as HTMLInputElement).value)
            editingLabelId = null
          }}
        />
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="scene-label"
          class:selected={ui.selectedSceneLabel === label.id}
          style="
            left: {PAD_INSET + label.x * (WORLD_W - PAD_INSET * 2)}px;
            top: {PAD_INSET + label.y * (WORLD_H - PAD_INSET * 2)}px;
            font-size: {fontSize}px;
          "
          onpointerdown={(e: PointerEvent) => {
            e.stopPropagation()
            ui.selectedSceneNodes = {}
            ui.selectedSceneEdge = null
            ui.selectedSceneLabel = label.id
            draggingLabel = label.id
            dragMoved = false
            startPos = { x: e.clientX, y: e.clientY }
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onpointermove={(e: PointerEvent) => {
            if (draggingLabel !== label.id) return
            if (!dragMoved) {
              const dx = Math.abs(e.clientX - startPos.x)
              const dy = Math.abs(e.clientY - startPos.y)
              if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) dragMoved = true
            }
            if (dragMoved) {
              const pos = toNorm(e)
              if (pos) sceneMoveLabel(label.id, pos.x, pos.y)
            }
          }}
          onpointerup={() => {
            if (draggingLabel === label.id && !dragMoved) {
              // Single tap — check for double-tap to edit
              const now = Date.now()
              if (lastTapNode === label.id && now - lastTapTime < 300) {
                editingLabelId = label.id
                lastTapTime = 0
                lastTapNode = ''
              } else {
                lastTapTime = now
                lastTapNode = label.id
              }
            }
            draggingLabel = null
          }}
        >{label.text || '…'}{#if ui.selectedSceneLabel === label.id}<!-- svelte-ignore a11y_no_static_element_interactions --><span
              class="label-resize-handle"
              onpointerdown={(e: PointerEvent) => {
                e.stopPropagation()
                resizingLabel = label.id
                resizeStartY = e.clientY
                resizeStartSize = label.size ?? 1
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              }}
              onpointermove={(e: PointerEvent) => {
                if (resizingLabel !== label.id) return
                const dy = resizeStartY - e.clientY
                const newSize = Math.max(0.5, Math.min(4, resizeStartSize + dy / 50))
                sceneResizeLabel(label.id, newSize - (label.size ?? 1))
              }}
              onpointerup={() => { resizingLabel = null }}
            ></span>{/if}</span>
      {/if}
    {/each}
  </div>

  <!-- UI controls (outside zoom/pan transform) -->
  {#if song.scene.nodes.length > 1}
    <button
      class="scene-format-btn"
      aria-label="Auto-layout"
      data-tip="Auto-layout" data-tip-ja="自動整列"
      onpointerdown={() => sceneFormatNodes(Object.keys(ui.selectedSceneNodes).length > 0 ? ui.selectedSceneNodes : undefined)}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">{@html ICON.autoLayout}</svg>
    </button>
    <button
      class="scene-focus-root-btn"
      aria-label="Focus root node"
      data-tip="Focus root" data-tip-ja="ルートにフォーカス"
      onpointerdown={focusRoot}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html ICON.focusRoot}</svg>
    </button>
    {#if playback.playing && playback.mode === 'scene' && playback.sceneNodeId}
      <button
        class="scene-focus-playing-btn"
        aria-label="Focus playing node"
        data-tip="Focus playing" data-tip-ja="再生中にフォーカス"
        style="--beat: {30 / song.bpm}s"
        onpointerdown={focusPlaying}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="4"/></svg>
      </button>
    {/if}
  {/if}
  {#if zoom !== 1}
    <button
      class="zoom-reset-btn"
      data-tip="Reset zoom" data-tip-ja="ズームリセット"
      onpointerdown={() => { zoom = 1; centerPan() }}
    >{Math.round(zoom * 100)}%</button>
  {/if}

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

  {#if song.scene.nodes.length === 0}
    <div class="scene-empty" data-tip="Double-click to add nodes" data-tip-ja="ダブルクリックでノード追加">Double-click to add nodes</div>
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
  .fn-icon {
    flex-shrink: 0;
    pointer-events: none;
    opacity: 0.85;
  }
  .scene-node.fn.selected {
    color: var(--color-bg);
    outline: 1.5px dashed var(--color-fg);
    outline-offset: 2px;
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

  /* ── Free-floating labels ── */
  .scene-label {
    position: absolute;
    transform: translate(-50%, -50%);
    font-family: var(--font-data);
    color: rgba(30, 32, 40, 0.35);
    white-space: nowrap;
    cursor: grab;
    z-index: 1;
    padding: 2px 6px;
    border-radius: 3px;
    user-select: none;
    transition: color 80ms, background 80ms;
  }
  .scene-label:hover {
    color: rgba(30, 32, 40, 0.6);
    background: rgba(30, 32, 40, 0.04);
  }
  .scene-label.selected {
    color: rgba(30, 32, 40, 0.7);
    background: rgba(30, 32, 40, 0.06);
    outline: 1px solid rgba(30, 32, 40, 0.15);
  }
  .label-resize-handle {
    position: absolute;
    right: -5px;
    top: -5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(30, 32, 40, 0.3);
    cursor: ns-resize;
    touch-action: none;
  }
  .label-resize-handle:hover {
    background: rgba(30, 32, 40, 0.6);
    transform: scale(1.3);
  }

  .scene-label-edit {
    position: absolute;
    transform: translate(-50%, -50%);
    font-family: var(--font-data);
    color: var(--color-fg);
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(30, 32, 40, 0.25);
    border-radius: 3px;
    padding: 2px 6px;
    width: 100px;
    text-align: center;
    outline: none;
    z-index: 8;
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

  /* ── Toolbar buttons ── */
  .scene-format-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1.5px solid rgba(30, 32, 40, 0.12);
    background: rgba(255, 255, 255, 0.8);
    color: rgba(30, 32, 40, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
  }
  .scene-format-btn:hover {
    background: rgba(255, 255, 255, 0.95);
    color: var(--color-fg);
  }

  .scene-focus-root-btn {
    position: absolute;
    top: 8px;
    right: 42px;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1.5px solid rgba(30, 32, 40, 0.12);
    background: rgba(255, 255, 255, 0.8);
    color: rgba(30, 32, 40, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
  }
  .scene-focus-root-btn:hover {
    background: rgba(255, 255, 255, 0.95);
    color: var(--color-fg);
  }

  .scene-focus-playing-btn {
    position: absolute;
    top: 8px;
    right: 76px;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1.5px solid rgba(30, 32, 40, 0.12);
    background: rgba(255, 255, 255, 0.8);
    color: var(--color-olive);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
    animation: node-pulse var(--beat, 0.25s) ease-out infinite alternate;
  }
  .scene-focus-playing-btn:hover {
    background: rgba(255, 255, 255, 0.95);
    color: var(--color-fg);
  }

  .zoom-reset-btn {
    position: absolute;
    top: 8px;
    right: 110px;
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

  /* ── Radial bubble menu ── */
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

  /* ── Mode toggle (REL/ABS) ── */
  .mode-toggle {
    border: none;
    border-radius: 3px;
    background: rgba(30, 32, 40, 0.06);
    color: rgba(30, 32, 40, 0.45);
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 3px 4px;
    cursor: pointer;
    margin-right: 2px;
  }
  .mode-toggle:hover {
    background: rgba(30, 32, 40, 0.1);
  }
  .mode-toggle.absolute {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  /* ── FX toggle popup ── */
  .fx-popup {
    gap: 2px;
  }
  .fx-toggle {
    border: none;
    border-radius: 3px;
    background: rgba(30, 32, 40, 0.06);
    color: rgba(30, 32, 40, 0.35);
    font-family: var(--font-data);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 3px 5px;
    cursor: pointer;
  }
  .fx-toggle:hover {
    background: rgba(30, 32, 40, 0.1);
  }
  .fx-toggle.active {
    background: var(--color-fg);
    color: var(--color-bg);
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
      min-width: 56px;
      height: 28px;
      border-radius: 14px;
      padding: 0 8px;
      gap: 4px;
    }
    .scene-node.fn .node-label { font-size: 9px; }
    .fn-icon { width: 14px; height: 14px; }
    .node-label { font-size: 11px; }
    .zoom-reset-btn { right: 12px; }
    .param-btn { width: 32px; height: 32px; font-size: 18px; }
    .param-val { font-size: 13px; min-width: 36px; }
    .scene-play-btn { width: 34px; height: 34px; }
  }
</style>
