/**
 * Delta sync for multi-device host (ADR 019).
 *
 * Tracks song state changes and broadcasts JSON Patch diffs to guests.
 * Uses a shallow recursive diff — only changed leaf values produce patches.
 */

import type { JsonPatch } from './protocol.ts'
import { broadcastToGuests } from './connection.ts'

let prevSnapshot: string | null = null

/**
 * Call after each state change (rAF-throttled in App.svelte).
 * Compares current song JSON against previous snapshot,
 * computes minimal JSON Patch set, and broadcasts to guests.
 */
export function syncDelta(song: object): void {
  const current = JSON.stringify(song)

  if (prevSnapshot === null) {
    // First call — just record the snapshot, no diff to send
    prevSnapshot = current
    return
  }

  if (current === prevSnapshot) return

  const prev = JSON.parse(prevSnapshot) as Record<string, unknown>
  const curr = JSON.parse(current) as Record<string, unknown>
  const patches: JsonPatch[] = []
  diffObjects(prev, curr, '', patches)

  prevSnapshot = current

  if (patches.length > 0) {
    broadcastToGuests({ t: 'delta', patches })
  }
}

/** Reset snapshot (e.g. when session ends). */
export function resetDeltaSync(): void {
  prevSnapshot = null
}

// ── Recursive diff ────────────────────────────────────────────

function diffObjects(
  prev: Record<string, unknown>,
  curr: Record<string, unknown>,
  path: string,
  patches: JsonPatch[],
): void {
  // Check removed keys
  for (const key in prev) {
    if (!(key in curr)) {
      patches.push({ op: 'remove', path: `${path}/${key}` })
    }
  }

  // Check added/changed keys
  for (const key in curr) {
    const p = `${path}/${key}`
    if (!(key in prev)) {
      patches.push({ op: 'add', path: p, value: curr[key] })
    } else {
      diffValues(prev[key], curr[key], p, patches)
    }
  }
}

function diffValues(
  prev: unknown,
  curr: unknown,
  path: string,
  patches: JsonPatch[],
): void {
  if (prev === curr) return

  const prevType = typeof prev
  const currType = typeof curr

  // Primitive or type change → replace
  if (prevType !== currType || prevType !== 'object' || prev === null || curr === null) {
    patches.push({ op: 'replace', path, value: curr })
    return
  }

  // Both arrays
  if (Array.isArray(prev) && Array.isArray(curr)) {
    // If lengths differ significantly or arrays are short, just replace
    if (Math.abs(prev.length - curr.length) > 0 || prev.length <= 2) {
      // Check if actually equal
      const ps = JSON.stringify(prev)
      const cs = JSON.stringify(curr)
      if (ps !== cs) {
        patches.push({ op: 'replace', path, value: curr })
      }
      return
    }
    // Same-length arrays: diff element by element
    for (let i = 0; i < prev.length; i++) {
      diffValues(prev[i], curr[i], `${path}/${i}`, patches)
    }
    return
  }

  // Both objects
  if (!Array.isArray(prev) && !Array.isArray(curr)) {
    diffObjects(
      prev as Record<string, unknown>,
      curr as Record<string, unknown>,
      path,
      patches,
    )
    return
  }

  // Mismatched (one array, one object) → replace
  patches.push({ op: 'replace', path, value: curr })
}
