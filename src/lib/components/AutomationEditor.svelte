<script lang="ts">
  import { song, ui, pushUndo, primarySelectedNode } from '../state.svelte.ts'
  import type { AutomationPoint, AutomationTarget, AutomationParams, SceneNode } from '../state.svelte.ts'
  import { PAD_INSET } from '../constants.ts'
  import { WORLD_W, WORLD_H } from '../sceneGeometry.ts'
  import { VOICE_LIST } from '../audio/dsp/voices.ts'
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
    if (decoratorSource) return null  // decorator takes priority
    const id = primarySelectedNode()
    if (!id) return null
    const node = song.scene.nodes.find(n => n.id === id)
    return node?.type === 'automation' ? node : null
  })

  const autoParams = $derived(decoratorSource?.params ?? standaloneNode?.automationParams ?? null)
  const isDecorator = $derived(!!decoratorSource)

  // Position anchor: pattern node (decorator) or automation node (standalone)
  const anchorNode = $derived(decoratorSource?.node ?? standaloneNode)

  // Host pattern for context-aware targets (decorator mode only)
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
  const PAD = { l: 24, r: 8, t: 8, b: 16 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  // ── Snap ──
  let snap: number = $state(0)  // 0=off, 4=1/4, 8=1/8, 16=1/16
  const SNAP_OPTIONS = [
    { value: 0, label: 'OFF' },
    { value: 4, label: '1/4' },
    { value: 8, label: '1/8' },
    { value: 16, label: '1/16' },
  ]

  // ── Local undo stack ──
  let undoStack: AutomationPoint[][] = $state([])

  // ── Dragging state ──
  let dragIndex: number = $state(-1)
  let dragging = $state(false)

  // ── Freehand state ──
  let freehandPoints: { x: number; y: number }[] = $state([])
  let isDrawing = $state(false)

  // ── Target options (context-aware for decorators) ──
  type TargetOption = { label: string; target: AutomationTarget }
  const targetOptions = $derived.by((): { group: string; items: TargetOption[] }[] => {
    const groups: { group: string; items: TargetOption[] }[] = [
      {
        group: 'Global',
        items: [
          { label: 'Tempo', target: { kind: 'global', param: 'tempo' } },
          { label: 'Master Volume', target: { kind: 'global', param: 'masterVolume' } },
        ],
      },
    ]

    // Determine which track IDs to show
    const trackIndices: number[] = []
    if (hostPattern) {
      // Context-aware: only tracks with assigned voiceId in this pattern
      for (const c of hostPattern.cells) {
        if (c.voiceId) trackIndices.push(c.trackId)
      }
    } else {
      // Standalone mode: all tracks
      for (const t of song.tracks) trackIndices.push(t.id)
    }

    // Track params
    const trackItems: TargetOption[] = []
    for (const i of trackIndices) {
      const voiceLabel = getVoiceLabel(i)
      trackItems.push({ label: `T${i + 1} ${voiceLabel} Vol`, target: { kind: 'track', trackIndex: i, param: 'volume' } })
      trackItems.push({ label: `T${i + 1} ${voiceLabel} Pan`, target: { kind: 'track', trackIndex: i, param: 'pan' } })
    }
    if (trackItems.length > 0) groups.push({ group: 'Track', items: trackItems })

    // FX params
    groups.push({
      group: 'FX',
      items: [
        { label: 'Reverb Wet', target: { kind: 'fx', param: 'reverbWet' } },
        { label: 'Reverb Damp', target: { kind: 'fx', param: 'reverbDamp' } },
        { label: 'Delay Time', target: { kind: 'fx', param: 'delayTime' } },
        { label: 'Delay Feedback', target: { kind: 'fx', param: 'delayFeedback' } },
        { label: 'Filter Cutoff', target: { kind: 'fx', param: 'filterCutoff' } },
        { label: 'Glitch X', target: { kind: 'fx', param: 'glitchX' } },
        { label: 'Glitch Y', target: { kind: 'fx', param: 'glitchY' } },
        { label: 'Granular Size', target: { kind: 'fx', param: 'granularSize' } },
        { label: 'Granular Density', target: { kind: 'fx', param: 'granularDensity' } },
      ],
    })

    // Send params
    const sendItems: TargetOption[] = []
    for (const i of trackIndices) {
      const voiceLabel = getVoiceLabel(i)
      sendItems.push({ label: `T${i + 1} ${voiceLabel} VrbSnd`, target: { kind: 'send', trackIndex: i, param: 'reverbSend' } })
      sendItems.push({ label: `T${i + 1} ${voiceLabel} DlySnd`, target: { kind: 'send', trackIndex: i, param: 'delaySend' } })
      sendItems.push({ label: `T${i + 1} ${voiceLabel} GltSnd`, target: { kind: 'send', trackIndex: i, param: 'glitchSend' } })
      sendItems.push({ label: `T${i + 1} ${voiceLabel} GrnSnd`, target: { kind: 'send', trackIndex: i, param: 'granularSend' } })
    }
    if (sendItems.length > 0) groups.push({ group: 'Send', items: sendItems })
    return groups
  })

  function getVoiceLabel(trackIndex: number): string {
    const pat = hostPattern ?? song.patterns[ui.currentPattern]
    const vid = pat?.cells.find(c => c.trackId === trackIndex)?.voiceId
    if (!vid) return ''
    const meta = VOICE_LIST.find(v => v.id === vid)
    return meta?.label ?? vid.slice(0, 4).toUpperCase()
  }

  // ── Serialize target for <select> value ──
  function targetKey(t: AutomationTarget): string {
    if (t.kind === 'global') return `global:${t.param}`
    if (t.kind === 'track') return `track:${t.trackIndex}:${t.param}`
    if (t.kind === 'fx') return `fx:${t.param}`
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
    if (decoratorSource) return decoratorSource.params
    if (standaloneNode?.automationParams) return standaloneNode.automationParams
    return null
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

  function closeEditor() {
    ui.editingAutomationDecorator = null
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
    const r = 8
    for (let i = 0; i < autoParams.points.length; i++) {
      const p = toCanvas(autoParams.points[i].t, autoParams.points[i].v)
      if (Math.hypot(cx - p.x, cy - p.y) < r) return i
    }
    return -1
  }

  // ── Pointer events (Bezier mode) ──
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
    const idx = hitPoint(cx, cy)
    const now = Date.now()

    if (idx >= 0) {
      // Double-click to delete
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
      // Add new point
      const { t, v } = fromCanvas(cx, cy)
      pushLocalUndo()
      mutate(p => {
        p.points.push({ t, v })
        p.points.sort((a, b) => a.t - b.t)
      })
      // Start dragging the new point
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
      drawCanvas()
      return
    }

    if (dragging && dragIndex >= 0) {
      const params = getParamsRef()
      if (!params) return
      const { t, v } = fromCanvas(cx, cy)
      params.points[dragIndex] = { t, v }
      params.points.sort((a, b) => a.t - b.t)
      // Re-find index after sort
      dragIndex = params.points.findIndex(p => p.t === t && p.v === v)
      drawCanvas()
    }
  }

  function onPointerUp(_e: PointerEvent) {
    if (mode === 'freehand' && isDrawing) {
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
    if (dragging) {
      dragging = false
      dragIndex = -1
      const params = getParamsRef()
      if (params) params.points.sort((a, b) => a.t - b.t)
    }
  }

  // ── Ramer-Douglas-Peucker simplification ──
  function rdpSimplify(pts: { x: number; y: number }[], epsilon: number): { x: number; y: number }[] {
    if (pts.length <= 2) return pts
    let maxDist = 0, maxIdx = 0
    const first = pts[0], last = pts[pts.length - 1]
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpDist(pts[i], first, last)
      if (d > maxDist) { maxDist = d; maxIdx = i }
    }
    if (maxDist > epsilon) {
      const left = rdpSimplify(pts.slice(0, maxIdx + 1), epsilon)
      const right = rdpSimplify(pts.slice(maxIdx), epsilon)
      return [...left.slice(0, -1), ...right]
    }
    return [first, last]
  }

  function perpDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x, dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 0.001) return Math.hypot(p.x - a.x, p.y - a.y)
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
  }

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
    ctx.fillStyle = 'rgba(30, 32, 40, 0.06)'
    ctx.fillRect(PAD.l, PAD.t, plotW, plotH)

    // Grid lines
    ctx.strokeStyle = 'rgba(30, 32, 40, 0.08)'
    ctx.lineWidth = 0.5
    // Horizontal (value)
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (i / 4) * plotH
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + plotW, y); ctx.stroke()
    }
    // Vertical (time) — beat divisions
    const divisions = snap > 0 ? snap : 4
    for (let i = 0; i <= divisions; i++) {
      const x = PAD.l + (i / divisions) * plotW
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke()
    }

    // Axis labels
    ctx.fillStyle = 'rgba(30, 32, 40, 0.3)'
    ctx.font = '7px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('1.0', PAD.l - 3, PAD.t + 5)
    ctx.fillText('0.0', PAD.l - 3, PAD.t + plotH + 1)
    ctx.textAlign = 'center'
    ctx.fillText('0', PAD.l, PAD.t + plotH + 11)
    ctx.fillText('1', PAD.l + plotW, PAD.t + plotH + 11)

    const points = autoParams.points
    if (points.length === 0) return

    // Draw curve
    ctx.strokeStyle = 'rgba(120, 120, 69, 0.9)'  // olive
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const p0 = toCanvas(points[0].t, points[0].v)
    ctx.moveTo(p0.x, p0.y)

    if (interpolation === 'smooth' && points.length > 2) {
      // Monotone cubic spline approximation
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

    // Draw points
    for (let i = 0; i < points.length; i++) {
      const p = toCanvas(points[i].t, points[i].v)
      ctx.beginPath()
      ctx.arc(p.x, p.y, dragIndex === i ? 5 : 3.5, 0, Math.PI * 2)
      ctx.fillStyle = dragIndex === i ? 'rgba(120, 120, 69, 1)' : 'white'
      ctx.fill()
      ctx.strokeStyle = 'rgba(120, 120, 69, 0.8)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Freehand preview
    if (isDrawing && freehandPoints.length > 1) {
      ctx.strokeStyle = 'rgba(120, 120, 69, 0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(freehandPoints[0].x, freehandPoints[0].y)
      for (let i = 1; i < freehandPoints.length; i++) {
        ctx.lineTo(freehandPoints[i].x, freehandPoints[i].y)
      }
      ctx.stroke()
    }
  }

  // Redraw when node selection or params change
  $effect(() => {
    if (autoParams && canvasEl) {
      // Touch points to track reactivity
      void autoParams.points.length
      void autoParams.interpolation
      void autoParams.target
      drawCanvas()
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

  <!-- Mode toggle -->
  <div class="auto-row">
    <span class="auto-label">MODE</span>
    <div class="auto-toggle">
      <button class:active={mode === 'bezier'} onpointerdown={() => mode = 'bezier'}>Bezier</button>
      <button class:active={mode === 'freehand'} onpointerdown={() => mode = 'freehand'}>Freehand</button>
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
    <div class="auto-toggle">
      <button class:active={interpolation === 'linear'} onpointerdown={() => mutate(p => { p.interpolation = 'linear' })}>Linear</button>
      <button class:active={interpolation === 'smooth'} onpointerdown={() => mutate(p => { p.interpolation = 'smooth' })}>Smooth</button>
    </div>
  </div>

  <div class="auto-row">
    <span class="auto-label">SNAP</span>
    <div class="auto-toggle">
      {#each SNAP_OPTIONS as opt}
        <button class:active={snap === opt.value} onpointerdown={() => snap = opt.value}>{opt.label}</button>
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
