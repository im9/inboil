<script lang="ts">
  import { song, ui, playback, pushUndo } from '../state.svelte.ts'
  import type { AutomationPoint, AutomationParams } from '../types.ts'
  import { sceneAddDecorator, sceneRemoveDecorator } from '../sceneActions.ts'
  import {
    type CanvasLayout, SNAP_OPTIONS,
    toCanvas, fromCanvas, hitPoint, rdpSimplify,
    targetKey, findTargetByKey, buildTargetOptions,
    targetColor, initCanvas, drawGrid, drawCurve, drawPoints, drawFreehandPreview,
  } from '../automationDraw.ts'

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
  const layout: CanvasLayout = {
    W, H,
    PAD: { l: 4, r: 4, t: 6, b: 6 },
    plotW: 252 - 4 - 4,
    plotH: 120 - 6 - 6,
  }

  // ── Snap ──
  let snap: number = $state(0)

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

  function curveColor(): string {
    return targetColor(autoParams?.target)
  }

  // ── Target options ──
  const allTargetOptions = $derived(buildTargetOptions(hostPattern, {
    includeSwing: true,
    includeMaster: true,
    includeEQ: true,
  }))

  const targetOptions = $derived.by(() => {
    if (viewContext === 'fx') return allTargetOptions.filter(g => g.group === 'FX' || g.group === 'Send')
    if (viewContext === 'master') return allTargetOptions.filter(g => g.group === 'Global' || g.group === 'Master')
    if (viewContext === 'eq') return allTargetOptions.filter(g => g.group === 'EQ')
    return allTargetOptions
  })

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
    draw()
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
    draw()
  }

  function close() {
    ui.editingAutomationInline = null
  }

  function addNewCurve() {
    sceneAddDecorator(nodeId, 'automation')
    const node = song.scene.nodes.find(n => n.id === nodeId)
    if (node?.decorators) {
      ui.editingAutomationInline = { nodeId, decoratorIndex: node.decorators.length - 1 }
    }
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

  /** Check if click is near an inactive curve and switch to it */
  function trySelectInactiveCurve(cx: number, cy: number): boolean {
    const threshold = 8
    for (const ad of allAutoDecorators) {
      if (ad.idx === decoratorIndex) continue
      const pts = ad.dec.automationParams!.points
      if (pts.length < 2) continue
      for (let i = 0; i < pts.length - 1; i++) {
        const a = toCanvas(layout, pts[i].t, pts[i].v)
        const b = toCanvas(layout, pts[i + 1].t, pts[i + 1].v)
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
      const { t, v } = fromCanvas(layout, cx, cy, snap)
      if (!lineStart) {
        lineStart = { t, v }
        draw()
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
    if (hitPoint(layout, autoParams.points, cx, cy) < 0 && trySelectInactiveCurve(cx, cy)) return

    // Bezier mode
    const idx = hitPoint(layout, autoParams.points, cx, cy)
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
      const { t, v } = fromCanvas(layout, cx, cy, snap)
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
      draw()
      return
    }

    if (mode === 'eraser' && isErasing) {
      eraseNear(cx, cy)
      return
    }

    if (dragging && dragIndex >= 0) {
      const params = getParamsRef()
      if (!params) return
      const { t, v } = fromCanvas(layout, cx, cy, snap)
      params.points[dragIndex] = { t, v }
      params.points.sort((a, b) => a.t - b.t)
      dragIndex = params.points.findIndex(p => p.t === t && p.v === v)
      draw()
    }
  }

  function onPointerUp() {
    if (mode === 'pencil' && isDrawing) {
      isDrawing = false
      if (freehandPoints.length > 2) {
        pushLocalUndo()
        const simplified = rdpSimplify(freehandPoints, 3)
        const pts: AutomationPoint[] = simplified.map(p => fromCanvas(layout, p.x, p.y, snap))
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
      const cp = toCanvas(layout, p.t, p.v)
      return Math.hypot(cx - cp.x, cy - cp.y) > r
    })
    if (params.points.length < 2) {
      params.points = [{ t: 0, v: 0.5 }, { t: 1, v: 0.5 }]
    }
    if (params.points.length !== before) draw()
  }

  // ── Canvas drawing ──
  function draw() {
    if (!canvasEl || !autoParams) return
    const ctx = initCanvas(canvasEl, W, H)
    if (!ctx) return

    // Background
    ctx.fillStyle = 'rgba(30, 32, 40, 0.04)'
    ctx.fillRect(layout.PAD.l, layout.PAD.t, layout.plotW, layout.plotH)

    drawGrid(ctx, layout, snap, { dotted: true })

    // Draw inactive curves (multi-lane overlay)
    for (const ad of allAutoDecorators) {
      if (ad.idx === decoratorIndex) continue
      const pts = ad.dec.automationParams!.points
      if (pts.length < 2) continue
      const color = targetColor(ad.dec.automationParams!.target)
      drawCurve(ctx, layout, pts, ad.dec.automationParams!.interpolation, color, {
        opacity: 0.2, lineWidth: 3.5, lineJoin: 'round', lineCap: 'round',
      })
    }

    // Draw active curve
    const points = autoParams.points
    const color = curveColor()
    if (points.length >= 2) {
      drawCurve(ctx, layout, points, interpolation, color, {
        lineWidth: 3.5, lineJoin: 'round', lineCap: 'round', fill: true,
      })
    }

    // Draw points for active curve
    drawPoints(ctx, layout, points, color, dragIndex, 3)

    // Freehand preview
    if (isDrawing) {
      drawFreehandPreview(ctx, freehandPoints, color, { opacity: 0.5, lineWidth: 3 })
    }

    // Line mode start indicator
    if (lineStart) {
      const lp = toCanvas(layout, lineStart.t, lineStart.v)
      ctx.beginPath()
      ctx.arc(lp.x, lp.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }

    // Playhead
    if (playheadProgress >= 0 && playheadProgress <= 1) {
      const px = layout.PAD.l + playheadProgress * layout.plotW
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, layout.PAD.t)
      ctx.lineTo(px, layout.PAD.t + layout.plotH)
      ctx.stroke()
    }
  }

  // Redraw on data change + playhead
  $effect(() => {
    if (autoParams && canvasEl) {
      void autoParams.points.length
      void autoParams.interpolation
      void autoParams.target
      void playheadProgress
      void allAutoDecorators.length
      draw()
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
        const t = findTargetByKey(targetOptions, (e.target as HTMLSelectElement).value)
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
    <div class="dae-toggle" role="tablist" aria-label="Draw mode">
      {#each [
        { id: 'pencil', label: 'Pencil' },
        { id: 'line', label: 'Line' },
        { id: 'eraser', label: 'Eraser' },
        { id: 'bezier', label: 'Bezier' },
      ] as m}
        <button
          role="tab"
          aria-selected={mode === m.id}
          class:active={mode === m.id}
          onpointerdown={() => { mode = m.id as typeof mode; lineStart = null }}
        >{m.label}</button>
      {/each}
    </div>
  </div>

  <!-- Interpolation + Snap -->
  <div class="dae-row">
    <span class="dae-label">INTERP</span>
    <div class="dae-toggle" role="tablist" aria-label="Interpolation">
      <button role="tab" aria-selected={interpolation === 'linear'} class:active={interpolation === 'linear'} onpointerdown={() => mutate(p => { p.interpolation = 'linear' })}>Lin</button>
      <button role="tab" aria-selected={interpolation === 'smooth'} class:active={interpolation === 'smooth'} onpointerdown={() => mutate(p => { p.interpolation = 'smooth' })}>Smo</button>
    </div>
    <span class="dae-label" style="margin-left:6px">SNAP</span>
    <div class="dae-toggle" role="tablist" aria-label="Snap">
      {#each SNAP_OPTIONS as opt}
        <button role="tab" aria-selected={snap === opt.value} class:active={snap === opt.value} onpointerdown={() => snap = opt.value}>{opt.label}</button>
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
