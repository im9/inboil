/**
 * Pattern-level operations (clear, copy/paste, duplicate, rename, templates).
 * Extracted from state.svelte.ts for modularity.
 */

import { song, ui, pushUndo, copySamplesForPattern } from './state.svelte.ts'
import type { Pattern } from './state.svelte.ts'
import {
  makePatternId, makeEmptyCell, makeTrack,
  FACTORY_COUNT, getTemplate,
} from './factory.ts'

// ── Internal helpers (needed for pattern ops) ──

function cloneCell(c: Pattern['cells'][0]) {
  return {
    ...c,
    trigs: c.trigs.map(t => ({
      ...t,
      ...(t.notes ? { notes: [...t.notes] } : {}),
      ...(t.paramLocks ? { paramLocks: { ...t.paramLocks } } : {}),
    })),
    voiceParams: { ...c.voiceParams },
  }
}

function clonePattern(p: Pattern): Pattern {
  return { id: p.id, name: p.name, color: p.color, cells: p.cells.map(cloneCell) }
}

// ── Pattern operations ──

/** Clear a pattern's cells to empty (preserves per-cell voiceId, ADR 062) */
export function patternClear(patternIndex: number): void {
  pushUndo('Clear pattern')
  const pat = song.patterns[patternIndex]
  pat.cells = pat.cells.map((c) => {
    const note = c.trigs.find(t => t.active)?.note ?? 60
    return makeEmptyCell(c.trackId, c.name, c.voiceId, note)
  })
}

/** Apply a pattern template — overwrites cells for this pattern only (ADR 015 §C) */
export function patternApplyTemplate(patternIndex: number, templateId: string): void {
  pushUndo('Apply template')
  const tmpl = getTemplate(templateId)
  const pat = song.patterns[patternIndex]

  // Ensure song has enough tracks
  while (song.tracks.length < tmpl.tracks.length) {
    const id = song.tracks.length > 0 ? Math.max(...song.tracks.map(t => t.id)) + 1 : 0
    song.tracks.push(makeTrack(id))
  }

  // Build cells using existing track IDs — only this pattern is affected
  pat.cells = tmpl.tracks.map((d, i) => {
    return makeEmptyCell(song.tracks[i].id, d.name, d.voiceId, d.note)
  })

  // Remove orphaned tracks (no cells in any pattern)
  pruneOrphanedTracks()
}

/** Remove song.tracks entries that have no cells in any pattern */
function pruneOrphanedTracks(): void {
  const usedIds = new Set<number>()
  for (const pat of song.patterns) {
    for (const cell of pat.cells) usedIds.add(cell.trackId)
  }
  song.tracks = song.tracks.filter(t => usedIds.has(t.id))
}

/** Rename a pattern (max 8 chars, uppercase) */
export function patternRename(patternIndex: number, name: string): void {
  pushUndo('Rename pattern')
  song.patterns[patternIndex].name = name.slice(0, 8).toUpperCase()
}

/** Set pattern color (index into PATTERN_COLORS) */
export function patternSetColor(patternIndex: number, color: number): void {
  pushUndo('Set pattern color')
  song.patterns[patternIndex].color = color
}

/** Duplicate pattern to the first empty slot, returns new index or -1 */
export function duplicatePattern(srcIndex: number): number {
  pushUndo('Duplicate pattern')
  const emptyIdx = song.patterns.findIndex((p, i) =>
    i >= FACTORY_COUNT && !p.cells.some(c => c.trigs.some(t => t.active))
  )
  if (emptyIdx === -1) return -1
  const src = song.patterns[srcIndex]
  song.patterns[emptyIdx] = {
    id: makePatternId(emptyIdx),
    name: src.name,
    color: src.color,
    cells: src.cells.map(cloneCell),
  }
  copySamplesForPattern(srcIndex, emptyIdx)
  ui.currentPattern = emptyIdx
  return emptyIdx
}

// ── Pattern clipboard ──

let patternClipboard: Pattern | null = null
let patternClipboardSrcIndex = -1

/** Copy pattern to internal clipboard */
export function patternCopy(index: number): void {
  patternClipboard = clonePattern(song.patterns[index])
  patternClipboardSrcIndex = index
}

/** Paste clipboard into pattern slot (overwrites) */
export function patternPaste(index: number): void {
  if (!patternClipboard) return
  pushUndo('Paste pattern')
  song.patterns[index] = {
    id: song.patterns[index].id,
    name: patternClipboard.name,
    color: patternClipboard.color,
    cells: patternClipboard.cells.map(cloneCell),
  }
  if (patternClipboardSrcIndex !== -1) copySamplesForPattern(patternClipboardSrcIndex, index)
}

/** Returns true if the pattern clipboard has content */
export function hasPatternClipboard(): boolean {
  return patternClipboard !== null
}

// ── Cell (track) clipboard ──

let cellClipboard: Pattern['cells'][0] | null = null

/** Copy a single cell (track data) to internal clipboard */
export function cellCopy(patternIndex: number, trackId: number): void {
  const pat = song.patterns[patternIndex]
  const cell = pat.cells.find(c => c.trackId === trackId)
  if (cell) cellClipboard = cloneCell(cell)
}

/** Paste cell clipboard into the target track (overwrites trigs, voice, params) */
export function cellPaste(patternIndex: number, trackId: number): void {
  if (!cellClipboard) return
  pushUndo('Paste cell')
  const pat = song.patterns[patternIndex]
  const idx = pat.cells.findIndex(c => c.trackId === trackId)
  if (idx < 0) return
  pat.cells[idx] = { ...cloneCell(cellClipboard), trackId }
}

/** Returns true if the cell clipboard has content */
export function hasCellClipboard(): boolean {
  return cellClipboard !== null
}
