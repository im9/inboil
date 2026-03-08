import { PAD_INSET, TAP_THRESHOLD } from './constants.ts'

/** Normalize pointer position within a padded rectangle to 0–1 range */
export function padNorm(
  e: PointerEvent,
  rect: DOMRect,
  invertY = true,
): { x: number; y: number } {
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD_INSET) / (rect.width - PAD_INSET * 2)))
  const rawY = (e.clientY - rect.top - PAD_INSET) / (rect.height - PAD_INSET * 2)
  const y = Math.max(0, Math.min(1, invertY ? 1 - rawY : rawY))
  return { x, y }
}

/** Check if pointer has moved beyond tap threshold */
export function movedPastTap(
  e: PointerEvent,
  start: { x: number; y: number },
): boolean {
  return Math.abs(e.clientX - start.x) > TAP_THRESHOLD || Math.abs(e.clientY - start.y) > TAP_THRESHOLD
}
