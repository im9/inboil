<script lang="ts">
  import { song, ui, selectPattern, sceneUpdateNode } from '../state.svelte.ts'
  import { TAP_THRESHOLD, PAD_INSET, COLORS_RGB } from '../constants.ts'

  let viewEl: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let animFrameId: number | null = null

  // ── Drag state ──
  let dragging: string | null = $state(null)  // node id being dragged
  let dragMoved = false
  let startPos = { x: 0, y: 0 }

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

  function startDrag(e: PointerEvent, nodeId: string) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragging = nodeId
    dragMoved = false
    startPos = { x: e.clientX, y: e.clientY }
  }

  function onMove(e: PointerEvent) {
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

  function endDrag() {
    if (!dragging) return
    const nodeId = dragging
    if (!dragMoved) {
      // Click — select this node's pattern
      const node = song.scene.nodes.find(n => n.id === nodeId)
      if (node?.patternId) {
        const pi = song.patterns.findIndex(p => p.id === node.patternId)
        if (pi >= 0) selectPattern(pi)
      }
      ui.selectedSceneNode = nodeId
    }
    dragging = null
  }

  function onBgClick() {
    ui.selectedSceneNode = null
  }

  /** Get pattern name for a node */
  function nodeName(node: typeof song.scene.nodes[0]): string {
    if (node.type !== 'pattern') return node.type.toUpperCase()
    const pat = song.patterns.find(p => p.id === node.patternId)
    return pat?.name || '---'
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
    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.from)
      const toNode = nodes.find(n => n.id === edge.to)
      if (!fromNode || !toNode) continue

      const from = toPixel(fromNode.x, fromNode.y, w, h)
      const to = toPixel(toNode.x, toNode.y, w, h)

      // Edge line
      const c = COLORS_RGB.cream
      ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.2)`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()

      // Arrowhead
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      const arrowLen = 8
      const arrowOff = 20  // offset from target center
      const ax = to.x - Math.cos(angle) * arrowOff
      const ay = to.y - Math.sin(angle) * arrowOff
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.25)`
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4))
      ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4))
      ctx.closePath()
      ctx.fill()
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="scene-view"
  bind:this={viewEl}
  onpointermove={onMove}
  onpointerup={endDrag}
  onpointercancel={endDrag}
  onpointerdown={onBgClick}
>
  <canvas bind:this={canvasEl} class="scene-canvas"></canvas>

  {#each song.scene.nodes as node (node.id)}
    {@const isRoot = node.root}
    {@const isSelected = ui.selectedSceneNode === node.id}
    {@const isDragging = dragging === node.id}
    <button
      class="scene-node"
      class:root={isRoot}
      class:selected={isSelected}
      class:dragging={isDragging}
      style="
        left: calc({PAD_INSET}px + {node.x} * (100% - {PAD_INSET * 2}px));
        top: calc({PAD_INSET}px + {node.y} * (100% - {PAD_INSET * 2}px));
      "
      onpointerdown={e => startDrag(e, node.id)}
    >
      <span class="node-label">{nodeName(node)}</span>
    </button>
  {/each}

  {#if song.scene.nodes.length === 0}
    <div class="scene-empty">No nodes in scene</div>
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
    padding: 0 8px;
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
