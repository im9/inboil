<script lang="ts">
  import { song, ui, pushUndo, primarySelectedNode } from '../state.svelte.ts'
  import type { AutomationPoint, AutomationParams, SceneNode } from '../types.ts'
  import { PAD_INSET } from '../constants.ts'
  import { WORLD_W, WORLD_H } from '../sceneGeometry.ts'
  import {
    type CanvasLayout, SNAP_OPTIONS,
    fromCanvas, hitPoint, rdpSimplify,
    targetKey, findTargetByKey, buildTargetOptions,
    initCanvas, drawGrid, drawCurve, drawPoints, drawFreehandPreview,
    SCENE_CURVE_COLOR,
  } from '../automationDraw.ts'
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in template calc()
  void PAD_INSET; void WORLD_W; void WORLD_H

  // ── Data source: decorator OR standalone node ──
  const decoratorSource = $derived.by(() => {
    const ed = ui.editingAutomationDecorator
    if (!ed) return null
    const node = song.scene.nodes.find(n => n.id === ed.nodeId)
    if (!node?.decorators?.[ed.decoratorIndex]) return null
    const dec = node.decorators[ed.decoratorIndex]
    if (dec.type !== 'automation' || !dec.automationParams) return null
    return { node, decoratorIndex: ed.decoratorIndex, params: dec.automationParams }
  })

  const standaloneNode = $derived.by((): SceneNode | null => {
    if (decoratorSource) return null
    const id = primarySelectedNode()
    if (!id) return null
    const node = song.scene.nodes.find(n => n.id === id)
    return node?.type === 'automation' ? node : null
  })

  const autoParams = $derived(decoratorSource?.params ?? standaloneNode?.automationParams ?? null)
  const isDecorator = $derived(!!decoratorSource)
  const anchorNode = $derived(decoratorSource?.node ?? standaloneNode)

  const hostPattern = $derived.by(() => {
    if (!decoratorSource) return null
    const node = decoratorSource.node
    if (node.type !== 'pattern' || !node.patternId) return null
    return song.patterns.find(p => p.id === node.patternId) ?? null
  })

  // ── Drawing mode ──
  let mode: 'bezier' | 'freehand' = $state('bezier')
  let interpolation = $derived(autoParams?.interpolation ?? 'linear')

  // ── Canvas ──
  let canvasEl: HTMLCanvasElement | undefined = $state()
  const W = 248, H = 140
  const layout: CanvasLayout = {
    W, H,
    PAD: { l: 24, r: 8, t: 8, b: 16 },
    plotW: 248 - 24 - 8,
    plotH: 140 - 8 - 16,
  }

  // ── Snap ──
  let snap: number = $state(0)

  // ── Local undo stack ──
  let undoStack: AutomationPoint[][] = $state([])

  // ── Dragging state ──
  let dragIndex: number = $state(-1)
  let dragging = $state(false)

  // ── Freehand state ──
  let freehandPoints: { x: number; y: number }[] = $state([])
  let isDrawing = $state(false)

  // ── Target options ──
  const targetOptions = $derived(buildTargetOptions(hostPattern))
  const currentTargetKey = $derived(autoParams ? targetKey(autoParams.target) : '')

  // ── Mutation helpers ──
  function getParamsRef(): AutomationParams | null {
    if (decoratorSource) return decoratorSource.params
    if (standaloneNode?.automationParams) return standaloneNode.automationParams
    return null
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

  function closeEditor() {
    ui.editingAutomationDecorator = null
  }

  // ── Pointer events ──
  let lastClickTime = 0
  let lastClickIndex = -1

  function onPointerDown(e: PointerEvent) {
    if (!autoParams || !canvasEl) return
    const rect = canvasEl.getBoundingClientRect()
    const cx = (e.clientX - rect.left) * (W / rect.width)
    const cy = (e.clientY - rect.top) * (H / rect.height)

    if (mode === 'freehand') {
      isDrawing = true
      freehandPoints = [{ x: cx, y: cy }]
      canvasEl.setPointerCapture(e.pointerId)
      return
    }

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

    if (mode === 'freehand' && isDrawing) {
      freehandPoints = [...freehandPoints, { x: cx, y: cy }]
      draw()
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

  function onPointerUp(_e: PointerEvent) {
    if (mode === 'freehand' && isDrawing) {
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
    if (dragging) {
      dragging = false
      dragIndex = -1
      const params = getParamsRef()
      if (params) params.points.sort((a, b) => a.t - b.t)
    }
  }

  // ── Canvas drawing ──
  function draw() {
    if (!canvasEl || !autoParams) return
    const ctx = initCanvas(canvasEl, W, H)
    if (!ctx) return

    // Background
    ctx.fillStyle = 'rgba(30, 32, 40, 0.06)'
    ctx.fillRect(layout.PAD.l, layout.PAD.t, layout.plotW, layout.plotH)

    drawGrid(ctx, layout, snap, { axisLabels: true })

    const points = autoParams.points
    if (points.length > 0) {
      drawCurve(ctx, layout, points, interpolation, SCENE_CURVE_COLOR)
      drawPoints(ctx, layout, points, 'rgba(120, 120, 69, 0.8)', dragIndex)
    }

    if (isDrawing) {
      drawFreehandPreview(ctx, freehandPoints, SCENE_CURVE_COLOR)
    }
  }

  $effect(() => {
    if (autoParams && canvasEl) {
      void autoParams.points.length
      void autoParams.interpolation
      void autoParams.target
      draw()
    }
  })
</script>

{#if anchorNode && autoParams}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="auto-editor" style="
  left: calc({PAD_INSET}px + {anchorNode.x} * (100% - {PAD_INSET * 2}px) + 32px);
  top: calc({PAD_INSET}px + {anchorNode.y} * (100% - {PAD_INSET * 2}px) - 20px);
" onpointerdown={e => e.stopPropagation()}>
  <div class="auto-header">
    <span>AUTOMATION</span>
    {#if isDecorator}
      <button class="close-btn" onpointerdown={closeEditor}
        data-tip="Close editor" data-tip-ja="エディタを閉じる">×</button>
    {/if}
  </div>

  <!-- Target selector -->
  <div class="auto-row">
    <span class="auto-label">TARGET</span>
    <select
      class="auto-select"
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

  <!-- Mode toggle -->
  <div class="auto-row">
    <span class="auto-label">MODE</span>
    <div class="auto-toggle" role="tablist" aria-label="Draw mode">
      <button role="tab" aria-selected={mode === 'bezier'} class:active={mode === 'bezier'} onpointerdown={() => mode = 'bezier'}>Bezier</button>
      <button role="tab" aria-selected={mode === 'freehand'} class:active={mode === 'freehand'} onpointerdown={() => mode = 'freehand'}>Freehand</button>
    </div>
  </div>

  <!-- Canvas -->
  <canvas
    class="auto-canvas"
    bind:this={canvasEl}
    style="width: {W}px; height: {H}px"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  ></canvas>

  <!-- Controls row -->
  <div class="auto-row">
    <span class="auto-label">INTERP</span>
    <div class="auto-toggle" role="tablist" aria-label="Interpolation">
      <button role="tab" aria-selected={interpolation === 'linear'} class:active={interpolation === 'linear'} onpointerdown={() => mutate(p => { p.interpolation = 'linear' })}>Linear</button>
      <button role="tab" aria-selected={interpolation === 'smooth'} class:active={interpolation === 'smooth'} onpointerdown={() => mutate(p => { p.interpolation = 'smooth' })}>Smooth</button>
    </div>
  </div>

  <div class="auto-row">
    <span class="auto-label">SNAP</span>
    <div class="auto-toggle" role="tablist" aria-label="Snap">
      {#each SNAP_OPTIONS as opt}
        <button role="tab" aria-selected={snap === opt.value} class:active={snap === opt.value} onpointerdown={() => snap = opt.value}>{opt.label}</button>
      {/each}
    </div>
  </div>

  <div class="auto-actions">
    <button
      onpointerdown={() => { pushLocalUndo(); mutate(p => { p.points = [{ t: 0, v: 0.5 }, { t: 1, v: 0.5 }] }) }}
      data-tip="Reset to flat line" data-tip-ja="フラットにリセット"
    >Clear</button>
    <button
      onpointerdown={localUndo}
      disabled={undoStack.length === 0}
      data-tip="Undo last edit" data-tip-ja="直前の編集を元に戻す"
    >Undo</button>
  </div>
</div>
{/if}

<style>
  .auto-editor {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid rgba(30, 32, 40, 0.12);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(30, 32, 40, 0.18);
    z-index: 7;
    animation: auto-pop 120ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes auto-pop {
    from { opacity: 0; transform: scale(0.95); }
    to   { opacity: 1; transform: scale(1); }
  }
  .auto-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--font-data);
    font-size: 9px;
    color: rgba(30, 32, 40, 0.4);
    letter-spacing: 0.5px;
  }
  .close-btn {
    border: none;
    background: transparent;
    color: rgba(30, 32, 40, 0.35);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }
  .close-btn:hover {
    color: rgba(30, 32, 40, 0.7);
  }
  .auto-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .auto-label {
    font-family: var(--font-data);
    font-size: 8px;
    color: rgba(30, 32, 40, 0.4);
    width: 38px;
    flex-shrink: 0;
  }
  .auto-select {
    flex: 1;
    font-family: var(--font-data);
    font-size: 9px;
    background: rgba(30, 32, 40, 0.04);
    color: var(--color-fg);
    border: 1px solid rgba(30, 32, 40, 0.12);
    border-radius: 3px;
    padding: 2px 4px;
    outline: none;
  }
  .auto-select:focus {
    border-color: rgba(30, 32, 40, 0.25);
  }
  .auto-toggle {
    display: flex;
    gap: 0;
  }
  .auto-toggle button {
    font-family: var(--font-data);
    font-size: 8px;
    padding: 2px 6px;
    border: 1px solid rgba(30, 32, 40, 0.12);
    background: transparent;
    color: rgba(30, 32, 40, 0.5);
    cursor: pointer;
  }
  .auto-toggle button:first-child { border-radius: 3px 0 0 3px; }
  .auto-toggle button:last-child { border-radius: 0 3px 3px 0; }
  .auto-toggle button:not(:first-child) { border-left: none; }
  .auto-toggle button.active {
    background: rgba(30, 32, 40, 0.08);
    color: var(--color-fg);
  }
  .auto-canvas {
    border-radius: 4px;
    cursor: crosshair;
    touch-action: none;
  }
  .auto-actions {
    display: flex;
    gap: 6px;
  }
  .auto-actions button {
    font-family: var(--font-data);
    font-size: 8px;
    padding: 3px 8px;
    border: 1px solid rgba(30, 32, 40, 0.12);
    border-radius: 3px;
    background: transparent;
    color: rgba(30, 32, 40, 0.5);
    cursor: pointer;
  }
  .auto-actions button:hover {
    background: rgba(30, 32, 40, 0.06);
    color: var(--color-fg);
  }
  .auto-actions button:disabled {
    opacity: 0.3;
    cursor: default;
  }
</style>
