/** True when the keyboard event target is a text-input element (input, textarea, contenteditable). */
export function isTextInputTarget(e: KeyboardEvent): boolean {
  const t = e.target
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return true
  if (t instanceof HTMLElement && t.isContentEditable) return true
  return false
}

/** Pointer position relative to an element, optionally including scroll offset. */
export function relativeCoords(
  e: PointerEvent,
  el: HTMLElement,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return {
    x: e.clientX - rect.left + el.scrollLeft,
    y: e.clientY - rect.top + el.scrollTop,
  }
}

/**
 * Convert relative pixel X to a clamped step index.
 * `cellW` is the step cell pitch in px (e.g. 26 = 24px cell + 2px gap).
 */
export function stepIndexFromX(
  relX: number,
  cellW: number,
  min: number,
  max: number,
  offset = 0,
): number {
  return Math.max(min, Math.min(max, offset + Math.floor(relX / cellW)))
}

/** Draw a waveform overview on a canvas with optional chop-slice markers. */
export function drawWaveform(canvas: HTMLCanvasElement, waveform: Float32Array, slices = 0): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(237,232,220,0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  const scaleX = waveform.length / w
  const step = Math.max(1, Math.floor(scaleX))
  const mid = h / 2
  for (let x = 0; x < w; x++) {
    const idx = Math.floor(x * scaleX)
    let min = 1, max = -1
    for (let j = 0; j < step; j++) {
      const v = waveform[idx + j] ?? 0
      if (v < min) min = v
      if (v > max) max = v
    }
    ctx.moveTo(x + 0.5, mid - max * mid)
    ctx.lineTo(x + 0.5, mid - min * mid)
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(237,232,220,0.15)'
  ctx.beginPath()
  ctx.moveTo(0, mid)
  ctx.lineTo(w, mid)
  ctx.stroke()
  if (slices > 0) {
    ctx.strokeStyle = 'rgba(108,119,68,0.6)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 1; i < slices; i++) {
      const sx = Math.round((i / slices) * w) + 0.5
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, h)
    }
    ctx.stroke()
  }
}
