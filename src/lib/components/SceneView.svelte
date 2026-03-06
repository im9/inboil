<script lang="ts">
  import { song, playback, ui, selectPattern, sceneUpdateNode, sceneAddNode, sceneDeleteNode, sceneAddEdge, sceneDeleteEdge, sceneSetRoot, sceneAddFunctionNode, sceneUpdateNodeParams, sceneReorderEdge, sceneCopyNode, sceneCopySubgraph, scenePaste, hasSceneClipboard, hasScenePlayback } from '../state.svelte.ts'
  import { TAP_THRESHOLD, PAD_INSET, PATTERN_COLORS } from '../constants.ts'
  import { PAT_HALF_W, FN_HALF_W, WORLD_W, WORLD_H, toPixel, bezierEdge, bezierDist } from '../sceneGeometry.ts'
  import SceneCanvas from './SceneCanvas.svelte'
  import SceneBubbleMenu from './SceneBubbleMenu.svelte'
  import type { FnNodeType } from './SceneBubbleMenu.svelte'

  const { onplay, onstop }: { onplay?: () => void, onstop?: () => void } = $props()

  let viewEl = $state<HTMLDivElement>() as HTMLDivElement

  // ── Drag state ──
  let dragging: string | null = $state(null)  // node id being dragged
  let dragMoved = $state(false)
  let startPos = { x: 0, y: 0 }

  // ── Edge creation state ──
  let edgeFrom: string | null = $state(null)  // source node id during edge draw
  let edgeCursor = $state({ x: 0, y: 0 })     // cursor pixel position during edge draw

  // ── Double-click tracking ──
  let lastTapTime = 0
  let lastTapNode = ''

  // ── Long-press (mobile edge creation) ──
  let longPressTimer: ReturnType<typeof setTimeout> | null = null

  // ── Add-node picker (bubble menu) ──
  let pickerOpen = $state(false)
  let pickerPos = $state({ x: 0, y: 0 })  // pixel position within .scene-view

  // ── Background long-press (mobile: open bubble menu) ──
  let bgLongPressTimer: ReturnType<typeof setTimeout> | null = null
  let bgPointerStart = { x: 0, y: 0 }
  let bgPointerMoved = false

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
    if (bgLongPressTimer) { clearTimeout(bgLongPressTimer); bgLongPressTimer = null }
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
    // Close bubble menu on any background interaction
    if (pickerOpen) { pickerOpen = false }

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
    if (!viewEl) {
      ui.selectedSceneNode = null
      ui.selectedSceneEdge = null
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
      ui.selectedSceneNode = null
    } else {
      ui.selectedSceneNode = null
      ui.selectedSceneEdge = null

      // Double-click background → open bubble menu at pointer
      const now = Date.now()
      if (lastBgClickTime && now - lastBgClickTime < 300) {
        openPickerAt(e.clientX, e.clientY)
        lastBgClickTime = 0
      } else {
        lastBgClickTime = now
        // Start pan on left-click drag of empty space
        isPanning = true
        panPointerStart = { x: e.clientX, y: e.clientY }
        panStartX = panX; panStartY = panY
        viewEl?.setPointerCapture(e.pointerId)

        // Long-press on empty space → open bubble menu (mobile)
        bgPointerStart = { x: e.clientX, y: e.clientY }
        bgPointerMoved = false
        if (bgLongPressTimer) clearTimeout(bgLongPressTimer)
        bgLongPressTimer = setTimeout(() => {
          bgLongPressTimer = null
          if (!bgPointerMoved && isPanning) {
            isPanning = false
            openPickerAt(e.clientX, e.clientY)
            if (navigator.vibrate) navigator.vibrate(30)
          }
        }, 500)
      }
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
    if (!ui.selectedSceneNode) return null
    const n = song.scene.nodes.find(n => n.id === ui.selectedSceneNode)
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

  function pickFunctionNode(type: FnNodeType) {
    // Convert picker pixel position to normalized coords (accounting for zoom/pan)
    const canvasX = (pickerPos.x - panX) / zoom
    const canvasY = (pickerPos.y - panY) / zoom
    const nx = Math.max(0.05, Math.min(0.95, (canvasX - PAD_INSET) / (WORLD_W - PAD_INSET * 2)))
    const ny = Math.max(0.05, Math.min(0.95, (canvasY - PAD_INSET) / (WORLD_H - PAD_INSET * 2)))
    const id = sceneAddFunctionNode(type, nx, ny)
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
  <SceneCanvas {zoom} {panX} {panY} {edgeFrom} {dragMoved} {edgeCursor} {viewEl} />

  <!-- Transform container for nodes (zoom/pan) -->
  <div class="scene-transform" style="width: {WORLD_W}px; height: {WORLD_H}px; transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: 0 0">
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
          left: {PAD_INSET + node.x * (WORLD_W - PAD_INSET * 2)}px;
          top: {PAD_INSET + node.y * (WORLD_H - PAD_INSET * 2)}px;
          {nc ? `--nc: ${nc}` : ''}
        "
        onpointerdown={e => startDrag(e, node.id)}
      >
        {#if node.type === 'transpose'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" fill="currentColor" aria-hidden="true">
            <rect x="3" y="2" width="5" height="1.5" rx="0.5"/><rect x="3" y="2" width="1.5" height="8"/>
            <circle cx="3.5" cy="11" r="2"/><rect x="6.5" y="2" width="1.5" height="6.5"/><circle cx="7.5" cy="9.5" r="2"/>
          </svg>
          <span class="node-label">{nodeName(node)}</span>
        {:else if node.type === 'tempo'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/>
            <line x1="7" y1="7" x2="7" y2="3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <line x1="7" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <circle cx="7" cy="7" r="0.7" fill="currentColor"/>
          </svg>
          <span class="node-label">{nodeName(node)}</span>
        {:else if node.type === 'repeat'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
            <path d="M11 5.5A4.5 4.5 0 0 0 3.5 4"/><path d="M3 8.5A4.5 4.5 0 0 0 10.5 10"/>
            <polyline points="3.5,1.5 3.5,4.5 6.5,4.5"/><polyline points="10.5,12.5 10.5,9.5 7.5,9.5"/>
          </svg>
          <span class="node-label">{nodeName(node)}</span>
        {:else if node.type === 'probability'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
            <rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>
            <circle cx="4" cy="10" r="1.3" fill="currentColor"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/><circle cx="10" cy="4" r="1.3" fill="currentColor"/>
          </svg>
        {:else if node.type === 'fx'}
          <svg class="fn-icon" viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
            <path d="M1 5 Q3.5 3 7 5 Q10.5 7 13 5"/><path d="M1 9 Q3.5 7 7 9 Q10.5 11 13 9"/>
          </svg>
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
        {@const isSelected = node.id === ui.selectedSceneNode}
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
            <svg class="solo-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
              <path d="M12.5 6A4.5 4.5 0 0 0 4.5 4.5"/>
              <path d="M3.5 10A4.5 4.5 0 0 0 11.5 11.5"/>
              <polyline points="4.5,2 4.5,5 7.5,5"/>
              <polyline points="11.5,14 11.5,11 8.5,11"/>
            </svg>
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
  </div>

  <!-- UI controls (outside zoom/pan transform) -->
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
      onpick={pickFunctionNode}
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
    cursor: grab;
  }
  .scene-view:active {
    cursor: grabbing;
  }
  .scene-view.drop-active {
    outline: 2px dashed rgba(30,32,40,0.25);
    outline-offset: -2px;
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
    border: 1px solid var(--color-fg);
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

  /* ── Edge connection handle ── */
  .edge-handle {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(68, 114, 180, 0.3);
    border: 1.5px solid rgba(68, 114, 180, 0.5);
    transform: translate(-50%, -50%);
    cursor: crosshair;
    z-index: 4;
    transition: background 80ms, transform 80ms;
  }
  .edge-handle:hover {
    background: rgba(68, 114, 180, 0.6);
    border-color: var(--color-blue);
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
  .solo-btn.armed {
    background: rgba(68, 114, 180, 0.08);
    border-color: rgba(68, 114, 180, 0.5);
    color: rgba(68, 114, 180, 0.5);
    border-style: dashed;
  }
  .solo-btn.active {
    background: rgba(68, 114, 180, 0.2);
    border-color: var(--color-blue);
    color: var(--color-blue);
    box-shadow: 0 0 6px rgba(68, 114, 180, 0.25);
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

  /* ── Zoom reset ── */
  .zoom-reset-btn {
    position: absolute;
    top: 8px;
    right: 8px;
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
