<script lang="ts">
  import { onMount } from 'svelte'
  import type { SampleMeta } from '../types.ts'

  const {
    sample,
    start = 0,
    end = 1,
    chopSlices = 0,
    activeSlice = -1,
    onchangestart,
    onchangeend,
  }: {
    sample: SampleMeta | undefined
    start: number
    end: number
    chopSlices: number
    activeSlice: number
    onchangestart?: (v: number) => void
    onchangeend?: (v: number) => void
  } = $props()

  let canvas: HTMLCanvasElement | undefined = $state(undefined)
  let container: HTMLDivElement | undefined = $state(undefined)

  // High-res peak data (regenerated when sample changes)
  let peaks: Float32Array = $state(new Float32Array(0))

  // Zoom/scroll state
  let zoom = $state(1)       // 1 = full view, higher = zoomed in
  let scrollX = $state(0)    // 0–1 normalized scroll position

  // Drag state
  let dragging: 'start' | 'end' | 'scroll' | null = $state(null)
  let dragStartX = 0
  let dragStartVal = 0

  const HANDLE_W = 8        // hit zone width in px for start/end handles
  const PEAK_RESOLUTION = 4096

  // Generate high-res peak array from raw buffer
  $effect(() => {
    if (!sample?.rawBuffer) { peaks = new Float32Array(0); return }
    const buf = sample.rawBuffer
    const ctx = new OfflineAudioContext(1, 1, 44100)
    ctx.decodeAudioData(buf.slice(0)).then(decoded => {
      const ch = decoded.getChannelData(0)
      const len = PEAK_RESOLUTION
      const out = new Float32Array(len * 2) // min/max pairs
      const blockSize = ch.length / len
      for (let i = 0; i < len; i++) {
        const from = Math.floor(i * blockSize)
        const to = Math.min(Math.floor((i + 1) * blockSize), ch.length)
        let mn = 1, mx = -1
        for (let j = from; j < to; j++) {
          const v = ch[j]
          if (v < mn) mn = v
          if (v > mx) mx = v
        }
        out[i * 2] = mn
        out[i * 2 + 1] = mx
      }
      peaks = out
    }).catch(() => { peaks = new Float32Array(0) })
  })

  // Visible range in normalized [0,1] coordinates
  const viewStart = $derived(Math.max(0, scrollX))
  const viewEnd = $derived(Math.min(1, scrollX + 1 / zoom))

  // Convert normalized position → canvas pixel x
  function normToX(norm: number, w: number): number {
    return ((norm - viewStart) / (viewEnd - viewStart)) * w
  }

  // Convert canvas pixel x → normalized position
  function xToNorm(px: number, w: number): number {
    return viewStart + (px / w) * (viewEnd - viewStart)
  }

  // Draw waveform
  function draw() {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, 0, w, h)

    const mid = h / 2
    const peakCount = peaks.length / 2

    if (peakCount > 0) {
      // Inactive regions (before start, after end)
      const startX = normToX(start, w)
      const endX = normToX(end, w)

      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      if (startX > 0) ctx.fillRect(0, 0, startX, h)
      if (endX < w) ctx.fillRect(endX, 0, w - endX, h)

      // Waveform
      ctx.strokeStyle = 'rgba(237,232,220,0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x < w; x++) {
        const norm = xToNorm(x, w)
        if (norm < 0 || norm > 1) continue
        const idx = Math.floor(norm * peakCount)
        const mn = peaks[idx * 2] ?? 0
        const mx = peaks[idx * 2 + 1] ?? 0
        ctx.moveTo(x + 0.5, mid - mx * mid)
        ctx.lineTo(x + 0.5, mid - mn * mid)
      }
      ctx.stroke()

      // Center line
      ctx.strokeStyle = 'rgba(237,232,220,0.1)'
      ctx.beginPath()
      ctx.moveTo(0, mid)
      ctx.lineTo(w, mid)
      ctx.stroke()

      // Active slice highlight
      if (chopSlices > 0 && activeSlice >= 0 && activeSlice < chopSlices) {
        const regionStart = start
        const regionLen = end - start
        const sliceStart = regionStart + (activeSlice / chopSlices) * regionLen
        const sliceEnd = regionStart + ((activeSlice + 1) / chopSlices) * regionLen
        const sx = normToX(sliceStart, w)
        const ex = normToX(sliceEnd, w)
        ctx.fillStyle = 'rgba(108,119,68,0.15)'
        ctx.fillRect(sx, 0, ex - sx, h)
      }

      // Chop slice markers
      if (chopSlices > 0) {
        const regionStart = start
        const regionLen = end - start
        ctx.strokeStyle = 'rgba(108,119,68,0.6)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let i = 1; i < chopSlices; i++) {
          const norm = regionStart + (i / chopSlices) * regionLen
          const sx = Math.round(normToX(norm, w)) + 0.5
          if (sx >= 0 && sx <= w) {
            ctx.moveTo(sx, 0)
            ctx.lineTo(sx, h)
          }
        }
        ctx.stroke()
      }

      // Start handle
      ctx.fillStyle = 'rgba(108,119,68,0.9)'
      ctx.fillRect(Math.round(startX) - 2, 0, 3, h)

      // End handle
      ctx.fillStyle = 'rgba(108,119,68,0.9)'
      ctx.fillRect(Math.round(endX) - 1, 0, 3, h)

      // Handle labels
      ctx.fillStyle = 'rgba(108,119,68,1)'
      ctx.font = '9px var(--font-data)'
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText('S', Math.round(startX) + 4, 2)
      ctx.textAlign = 'right'
      ctx.fillText('E', Math.round(endX) - 4, 2)
    } else {
      // No sample loaded
      ctx.fillStyle = 'rgba(237,232,220,0.2)'
      ctx.font = '11px var(--font-data)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No sample loaded', w / 2, mid)
    }
  }

  // Redraw on any reactive change
  $effect(() => {
    void peaks; void start; void end; void chopSlices; void activeSlice; void zoom; void scrollX
    draw()
  })

  // Redraw on resize
  onMount(() => {
    if (!container) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(container)
    return () => ro.disconnect()
  })

  // Pointer interaction
  function pointerDown(e: PointerEvent) {
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = rect.width

    const startX = normToX(start, w)
    const endX = normToX(end, w)

    // Check if near start handle
    if (Math.abs(x - startX) < HANDLE_W) {
      dragging = 'start'
      dragStartX = e.clientX
      dragStartVal = start
      canvas.setPointerCapture(e.pointerId)
      return
    }

    // Check if near end handle
    if (Math.abs(x - endX) < HANDLE_W) {
      dragging = 'end'
      dragStartX = e.clientX
      dragStartVal = end
      canvas.setPointerCapture(e.pointerId)
      return
    }

    // Otherwise: scroll drag (when zoomed in)
    if (zoom > 1) {
      dragging = 'scroll'
      dragStartX = e.clientX
      dragStartVal = scrollX
      canvas.setPointerCapture(e.pointerId)
    }
  }

  function pointerMove(e: PointerEvent) {
    if (!dragging || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const dx = e.clientX - dragStartX
    const dnorm = (dx / w) * (viewEnd - viewStart)

    if (dragging === 'start') {
      const v = Math.max(0, Math.min(end - 0.01, dragStartVal + dnorm))
      onchangestart?.(v)
    } else if (dragging === 'end') {
      const v = Math.max(start + 0.01, Math.min(1, dragStartVal + dnorm))
      onchangeend?.(v)
    } else if (dragging === 'scroll') {
      const maxScroll = 1 - 1 / zoom
      scrollX = Math.max(0, Math.min(maxScroll, dragStartVal - dnorm))
    }
  }

  function pointerUp() {
    dragging = null
  }

  function wheel(e: WheelEvent) {
    e.preventDefault()
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseNorm = xToNorm(e.clientX - rect.left, rect.width)

    const oldZoom = zoom
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    zoom = Math.max(1, Math.min(32, zoom * delta))

    // Keep the mouse position stable
    const maxScroll = Math.max(0, 1 - 1 / zoom)
    scrollX = Math.max(0, Math.min(maxScroll, mouseNorm - (mouseNorm - scrollX) * (oldZoom / zoom)))
  }

  function resetZoom() {
    zoom = 1
    scrollX = 0
  }
</script>

<div class="waveform-wrap" bind:this={container}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <canvas
    bind:this={canvas}
    class="waveform-canvas"
    onpointerdown={pointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={pointerUp}
    onwheel={wheel}
  ></canvas>
  {#if zoom > 1}
    <div class="zoom-controls">
      <button class="zoom-btn" onpointerdown={resetZoom}
        data-tip="Reset zoom" data-tip-ja="ズームリセット"
      >1:1</button>
      <span class="zoom-label">{zoom.toFixed(1)}x</span>
    </div>
  {/if}
</div>

<style>
  .waveform-wrap {
    position: relative;
    flex: 1;
    min-height: 120px;
  }

  .waveform-canvas {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    touch-action: none;
  }

  .waveform-canvas:active {
    cursor: grabbing;
  }

  .zoom-controls {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .zoom-btn {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    padding: 1px 6px;
    border: 1px solid var(--lz-border-strong);
    background: rgba(0,0,0,0.4);
    color: var(--color-fg);
    cursor: pointer;
    opacity: 0.6;
  }

  .zoom-btn:hover {
    opacity: 1;
  }

  .zoom-label {
    font-family: var(--font-data);
    font-size: var(--fs-sm);
    opacity: 0.4;
  }
</style>
