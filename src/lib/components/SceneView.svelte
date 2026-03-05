<script lang="ts">
  import { song, ui, selectPattern, sceneUpdateNode, sceneAddNode, sceneDeleteNode, sceneAddEdge, sceneDeleteEdge, sceneSetRoot } from '../state.svelte.ts'
  import { TAP_THRESHOLD, PAD_INSET, COLORS_RGB } from '../constants.ts'
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

  // ── Add-node picker ──
  let pickerOpen = $state(false)

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

  /** Convert pointer event to normalized 0-1 coords */
  function toNorm(e: PointerEvent): { x: number; y: number } | null {
    if (!viewEl) return null
    const rect = viewEl.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD_INSET) / (rect.width - PAD_INSET * 2)))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top - PAD_INSET) / (rect.height - PAD_INSET * 2)))
    return { x, y }
  }

  /** Convert normalized coords to pixel position for canvas drawing */
  function toPixel(nx: number, ny: number, w: number, h: number) {
    return {
      x: PAD_INSET + nx * (w - PAD_INSET * 2),
      y: PAD_INSET + ny * (h - PAD_INSET * 2),
    }
  }

  /** Point-to-line-segment distance for edge hit-testing */
  function ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(px - ax, py - ay)
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
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
      if (Math.abs(px - np.x) < 32 && Math.abs(py - np.y) < 18) {
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
  }

  function onMove(e: PointerEvent) {
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
      if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) dragMoved = true
    }
    if (dragMoved) {
      const pos = toNorm(e)
      if (pos) sceneUpdateNode(dragging, pos.x, pos.y)
    }
  }

  function endDrag(e: PointerEvent) {
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
    // Edge hit-testing on background click
    if (!viewEl || !canvasEl) {
      ui.selectedSceneNode = null
      ui.selectedSceneEdge = null
      return
    }
    const rect = viewEl.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const w = rect.width, h = rect.height

    // Check each edge for proximity
    const { nodes, edges } = song.scene
    let hitEdge: string | null = null
    let bestDist = 8 // 8px threshold
    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.from)
      const toNode = nodes.find(n => n.id === edge.to)
      if (!fromNode || !toNode) continue
      const from = toPixel(fromNode.x, fromNode.y, w, h)
      const to = toPixel(toNode.x, toNode.y, w, h)
      const d = ptSegDist(px, py, from.x, from.y, to.x, to.y)
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
    if (e.key === 'Escape') {
      ui.selectedSceneNode = null
      ui.selectedSceneEdge = null
      pickerOpen = false
    }
  }

  /** Get pattern name for a node */
  function nodeName(node: typeof song.scene.nodes[0]): string {
    if (node.type !== 'pattern') return node.type.toUpperCase()
    const pat = song.patterns.find(p => p.id === node.patternId)
    return pat?.name || '---'
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

    // Background
    ctx.fillStyle = 'rgb(26, 26, 24)'
    ctx.fillRect(0, 0, w, h)

    // Grid lines
    ctx.strokeStyle = 'rgba(237, 232, 220, 0.04)'
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

    // Edges
    const { nodes, edges } = song.scene
    const c = COLORS_RGB.cream
    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.from)
      const toNode = nodes.find(n => n.id === edge.to)
      if (!fromNode || !toNode) continue

      const from = toPixel(fromNode.x, fromNode.y, w, h)
      const to = toPixel(toNode.x, toNode.y, w, h)
      const isSel = ui.selectedSceneEdge === edge.id

      // Edge line
      ctx.strokeStyle = isSel
        ? `rgba(${c.r}, ${c.g}, ${c.b}, 0.6)`
        : `rgba(${c.r}, ${c.g}, ${c.b}, 0.2)`
      ctx.lineWidth = isSel ? 2.5 : 1.5
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()

      // Arrowhead
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      const arrowLen = 8
      const arrowOff = 20
      const ax = to.x - Math.cos(angle) * arrowOff
      const ay = to.y - Math.sin(angle) * arrowOff
      ctx.fillStyle = isSel
        ? `rgba(${c.r}, ${c.g}, ${c.b}, 0.7)`
        : `rgba(${c.r}, ${c.g}, ${c.b}, 0.25)`
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4))
      ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4))
      ctx.closePath()
      ctx.fill()
    }

    // Temporary edge during edge-draw mode
    if (edgeFrom && dragMoved && viewEl) {
      const srcNode = nodes.find(n => n.id === edgeFrom)
      if (srcNode) {
        const from = toPixel(srcNode.x, srcNode.y, w, h)
        const rect = viewEl.getBoundingClientRect()
        const toX = edgeCursor.x - rect.left
        const toY = edgeCursor.y - rect.top

        ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.4)`
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(toX, toY)
        ctx.stroke()
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
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="scene-view"
  bind:this={viewEl}
  onpointermove={onMove}
  onpointerup={endDrag}
  onpointercancel={() => { dragging = null; edgeFrom = null }}
  onpointerdown={onBgDown}
>
  <canvas bind:this={canvasEl} class="scene-canvas"></canvas>

  {#each song.scene.nodes as node (node.id)}
    {@const isRoot = node.root}
    {@const isSelected = ui.selectedSceneNode === node.id}
    {@const isDragging = dragging === node.id}
    {@const isEdgeSource = edgeFrom === node.id}
    <button
      class="scene-node"
      class:root={isRoot}
      class:selected={isSelected}
      class:dragging={isDragging}
      class:edge-source={isEdgeSource}
      style="
        left: calc({PAD_INSET}px + {node.x} * (100% - {PAD_INSET * 2}px));
        top: calc({PAD_INSET}px + {node.y} * (100% - {PAD_INSET * 2}px));
      "
      onpointerdown={e => startDrag(e, node.id)}
    >
      <span class="node-label">{nodeName(node)}</span>
      <span class="node-port"></span>
    </button>
  {/each}

  <!-- Add node button -->
  <button
    class="scene-add-btn"
    data-tip="Add pattern node" data-tip-ja="パターンノードを追加"
    onpointerdown={openPicker}
  >+</button>

  <!-- Pattern picker -->
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
    background: rgb(26, 26, 24);
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  .scene-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  /* ── Nodes ── */
  .scene-node {
    position: absolute;
    min-width: 56px;
    height: 28px;
    border-radius: 4px;
    transform: translate(-50%, -50%);
    border: 1.5px solid rgba(120, 120, 69, 0.6);
    background: rgba(26, 26, 24, 0.9);
    color: rgba(237, 232, 220, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 16px 0 8px;
    cursor: grab;
    transition: background 80ms, border-color 80ms, box-shadow 80ms;
    z-index: 2;
  }

  .scene-node.root {
    border-color: var(--color-olive);
    background: rgba(120, 120, 69, 0.2);
    color: var(--color-olive);
  }

  .scene-node.selected {
    border-color: var(--color-olive);
    background: var(--color-olive);
    color: var(--color-bg);
    box-shadow: 0 0 12px rgba(120, 120, 69, 0.4);
  }

  .scene-node.dragging {
    cursor: grabbing;
    z-index: 3;
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.5);
    transform: translate(-50%, -50%) scale(1.08);
  }

  .scene-node.edge-source {
    border-color: var(--color-cream);
    box-shadow: 0 0 8px rgba(237, 232, 220, 0.2);
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

  /* Output port indicator (right side of node) */
  .node-port {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(237, 232, 220, 0.15);
    pointer-events: none;
    transition: background 80ms;
  }
  .scene-node:hover .node-port {
    background: rgba(237, 232, 220, 0.4);
  }
  .scene-node.selected .node-port {
    background: rgba(26, 26, 24, 0.4);
  }

  /* ── Add button ── */
  .scene-add-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1.5px solid rgba(120, 120, 69, 0.5);
    background: rgba(26, 26, 24, 0.9);
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
    background: rgba(120, 120, 69, 0.15);
    border-color: var(--color-olive);
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
    background: var(--color-fg);
    border: 1px solid rgba(237, 232, 220, 0.12);
    border-radius: 4px;
    z-index: 10;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
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
    color: rgba(237, 232, 220, 0.5);
    cursor: pointer;
    transition: background 40ms;
  }
  .picker-row:hover {
    background: rgba(120, 120, 69, 0.12);
    color: var(--color-cream);
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

  /* ── Empty state ── */
  .scene-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-data);
    font-size: 10px;
    color: rgba(237, 232, 220, 0.15);
    pointer-events: none;
  }
</style>
