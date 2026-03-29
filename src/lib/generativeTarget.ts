/**
 * Pure helper for resolving generative node target cells.
 * Extracted for testability — no dependency on reactive state.
 */
import type { Cell } from './types.ts'

/**
 * Resolve the target cell for a generative node.
 * Returns undefined if targetTrack is unset or no matching cell exists.
 * Callers should skip generation when result is undefined.
 */
export function resolveTargetCell(cells: Cell[], targetTrack: number | undefined): Cell | undefined {
  if (targetTrack === undefined) return undefined
  return cells.find(c => c.trackId === targetTrack)
}
