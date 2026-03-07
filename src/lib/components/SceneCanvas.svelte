<script lang="ts">
  import { song, playback, ui } from '../state.svelte.ts'
  import { PAD_INSET, COLORS_RGB } from '../constants.ts'
  import { PAT_HALF_W, PAT_HALF_H, WORLD_W, WORLD_H, toPixel, bezierEdge, drawBezier, bezierAt } from '../sceneGeometry.ts'

  const {
    zoom, panX, panY,
    edgeFrom, dragMoved, edgeCursor,
    viewEl,
  }: {
    zoom: number
    panX: number
    panY: number
    edgeFrom: string | null
    dragMoved: boolean
    edgeCursor: { x: number; y: number }
    viewEl: HTMLDivElement | undefined
  } = $props()

  let canvasEl = $state<HTMLCanvasElement>() as HTMLCanvasElement
  let animFrameId: number | null = null

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

    // Grid lines (drawn in world space)
    ctx.strokeStyle = 'rgba(30, 32, 40, 0.06)'
    ctx.lineWidth = 1
    const gridStep = 40
    for (let x = PAD_INSET; x <= WORLD_W - PAD_INSET; x += gridStep) {
      ctx.beginPath()
      ctx.moveTo(x, PAD_INSET)
      ctx.lineTo(x, WORLD_H - PAD_INSET)
      ctx.stroke()
    }
    for (let y = PAD_INSET; y <= WORLD_H - PAD_INSET; y += gridStep) {
      ctx.beginPath()
      ctx.moveTo(PAD_INSET, y)
      ctx.lineTo(WORLD_W - PAD_INSET, y)
      ctx.stroke()
    }

    // Edges (bezier curves)
    const { nodes, edges } = song.scene
    const fg = { r: 30, g: 32, b: 40 } // --color-fg navy
    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.from)
      const toNode = nodes.find(n => n.id === edge.to)
      if (!fromNode || !toNode) continue

      const from = toPixel(fromNode.x, fromNode.y, WORLD_W, WORLD_H)
      const to = toPixel(toNode.x, toNode.y, WORLD_W, WORLD_H)
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
      const fp = toPixel(fn.x, fn.y, WORLD_W, WORLD_H)
      const tp = toPixel(tn.x, tn.y, WORLD_W, WORLD_H)
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

    // Temporary edge during edge-draw mode
    if (edgeFrom && dragMoved && viewEl) {
      const srcNode = nodes.find(n => n.id === edgeFrom)
      if (srcNode) {
        const from = toPixel(srcNode.x, srcNode.y, WORLD_W, WORLD_H)
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

    // Progress bar under active pattern node
    if (playback.playing) {
      const patIndex = playback.playingPattern ?? ui.currentPattern
      const playingPatId = song.patterns[patIndex]?.id
      const activeNode = playback.sceneNodeId
        ? nodes.find(n => n.id === playback.sceneNodeId && n.type === 'pattern')
        : playingPatId ? nodes.find(n => n.type === 'pattern' && n.patternId === playingPatId) : null
      if (activeNode) {
        const pat = song.patterns[patIndex]
        if (pat) {
          const maxSteps = Math.max(...pat.cells.map(c => c.steps))
          const maxHead = Math.max(...playback.playheads)
          const progress = maxSteps > 0 ? Math.min(1, maxHead / maxSteps) : 0
          const pos = toPixel(activeNode.x, activeNode.y, WORLD_W, WORLD_H)
          const barW = PAT_HALF_W * 2 - 4
          const barH = 2.5
          const bx = pos.x - PAT_HALF_W + 2
          const by = pos.y + PAT_HALF_H + 3

          // Background
          ctx.fillStyle = 'rgba(30, 32, 40, 0.1)'
          ctx.beginPath()
          ctx.roundRect(bx, by, barW, barH, 1)
          ctx.fill()
          // Fill
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
          ctx.beginPath()
          ctx.roundRect(bx, by, barW * progress, barH, 1)
          ctx.fill()
        }
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
    if (ui.phraseView === 'pattern' || ui.phraseView === 'scene') startVis()
    else stopVis()
    return () => stopVis()
  })
</script>

<canvas bind:this={canvasEl} class="scene-canvas"></canvas>

<style>
  .scene-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }
</style>
