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
