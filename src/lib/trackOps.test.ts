import { describe, it, expect } from 'vitest'
import { makeEmptyCell, makeTrack } from './factory.ts'
import type { Pattern, Track, Cell } from './types.ts'

// ── Simulate the actual app state structure ──

interface TestSong {
  tracks: Track[]
  patterns: Pattern[]
}

function makeTestSong(patternCount: number, trackCount: number): TestSong {
  const tracks = Array.from({ length: trackCount }, (_, i) =>
    makeTrack(i)
  )
  const patterns = Array.from({ length: patternCount }, (_, pi) => ({
    id: `pat_${String(pi).padStart(2, '0')}`,
    name: `P${pi}`,
    color: 0,
    cells: Array.from({ length: trackCount }, (_, ti) =>
      makeEmptyCell(ti, `TR${ti + 1}`, null, 60)
    ),
  }))
  return { tracks, patterns }
}

/** Find cell by trackId (mirrors cellForTrack in state.svelte.ts) */
function cellFor(pat: Pattern, trackId: number): Cell | undefined {
  return pat.cells.find(c => c.trackId === trackId)
}

// ── Replicate the actual removeTrack / addTrack logic (ADR 079) ──

function removeTrack(s: TestSong, currentPattern: number, trackId: number): boolean {
  const pat = s.patterns[currentPattern]
  if (!pat) return false
  const cellIdx = pat.cells.findIndex(c => c.trackId === trackId)
  if (cellIdx < 0) return false
  // CRITICAL: only splice current pattern's cells. song.tracks untouched.
  pat.cells.splice(cellIdx, 1)
  return true
}

const MAX_TRACKS = 16

function findOrphanTrackId(s: TestSong): number | null {
  const usedIds = new Set<number>()
  for (const pat of s.patterns) {
    for (const cell of pat.cells) usedIds.add(cell.trackId)
  }
  for (const track of s.tracks) {
    if (!usedIds.has(track.id)) return track.id
  }
  return null
}

function addTrack(s: TestSong, currentPattern: number): number | null {
  let idx: number
  const orphanId = s.tracks.length >= MAX_TRACKS ? findOrphanTrackId(s) : null
  if (s.tracks.length >= MAX_TRACKS && orphanId == null) return null
  if (orphanId != null) {
    idx = orphanId
    const slot = s.tracks.find(t => t.id === orphanId)!
    slot.muted = false; slot.volume = 0.8; slot.pan = 0
  } else {
    idx = s.tracks.length
    s.tracks.push(makeTrack(idx))
  }
  const pat = s.patterns[currentPattern]
  if (pat) {
    pat.cells.push(makeEmptyCell(idx, `TR${idx + 1}`, null, 60))
  }
  return idx
}

// ── Tests ──

describe('Cell.trackId integrity', () => {
  it('makeEmptyCell stores trackId', () => {
    const cell = makeEmptyCell(5, 'TEST', null, 60)
    expect(cell.trackId).toBe(5)
  })

  it('cells in a new song have correct trackIds', () => {
    const s = makeTestSong(1, 4)
    expect(s.patterns[0].cells.map(c => c.trackId)).toEqual([0, 1, 2, 3])
  })
})

describe('removeTrack — per-pattern isolation (ADR 079)', () => {
  it('does not modify song.tracks', () => {
    const s = makeTestSong(2, 8)
    removeTrack(s, 0, 3)

    expect(s.tracks.length).toBe(8)
  })

  it('does not affect other patterns', () => {
    const s = makeTestSong(3, 8)
    removeTrack(s, 0, 3)

    expect(s.patterns[0].cells.length).toBe(7)
    expect(s.patterns[1].cells.length).toBe(8)
    expect(s.patterns[2].cells.length).toBe(8)
  })

  it('preserves cell data in other patterns', () => {
    const s = makeTestSong(2, 4)
    cellFor(s.patterns[1], 2)!.name = 'IMPORTANT'

    removeTrack(s, 0, 2)

    // Pattern 1 untouched — cell with trackId=2 still exists
    expect(cellFor(s.patterns[1], 2)!.name).toBe('IMPORTANT')
  })

  it('preserves trackId after splice', () => {
    const s = makeTestSong(1, 4)
    // Remove track 1 from pattern 0
    removeTrack(s, 0, 1)

    // Remaining cells should keep their original trackIds
    expect(s.patterns[0].cells.map(c => c.trackId)).toEqual([0, 2, 3])
  })

  it('cellForTrack still finds correct cell after removal', () => {
    const s = makeTestSong(1, 4)
    cellFor(s.patterns[0], 3)!.name = 'LEAD'

    removeTrack(s, 0, 1)

    // trackId=3 cell should still be findable and have correct data
    expect(cellFor(s.patterns[0], 3)!.name).toBe('LEAD')
    // trackId=1 should be gone
    expect(cellFor(s.patterns[0], 1)).toBeUndefined()
  })

  it('multiple removes from same pattern work', () => {
    const s = makeTestSong(2, 8)

    removeTrack(s, 0, 0)
    removeTrack(s, 0, 1)
    removeTrack(s, 0, 2)

    expect(s.patterns[0].cells.length).toBe(5)
    expect(s.patterns[0].cells.map(c => c.trackId)).toEqual([3, 4, 5, 6, 7])
    expect(s.patterns[1].cells.length).toBe(8)
    expect(s.tracks.length).toBe(8)
  })

  it('removing non-existent trackId returns false', () => {
    const s = makeTestSong(1, 4)
    expect(removeTrack(s, 0, 99)).toBe(false)
  })
})

describe('addTrack — per-pattern isolation', () => {
  it('adds to song.tracks globally', () => {
    const s = makeTestSong(2, 4)
    addTrack(s, 0)

    expect(s.tracks.length).toBe(5)
  })

  it('only adds cell to current pattern', () => {
    const s = makeTestSong(3, 4)
    const newTrackId = addTrack(s, 1)

    expect(s.patterns[0].cells.length).toBe(4)
    expect(s.patterns[1].cells.length).toBe(5)
    expect(s.patterns[2].cells.length).toBe(4)
    // New cell has correct trackId
    expect(cellFor(s.patterns[1], newTrackId!)).toBeDefined()
  })

  it('new cell trackId matches new track id', () => {
    const s = makeTestSong(1, 4)
    const newId = addTrack(s, 0)

    expect(newId).toBe(4)
    const newCell = cellFor(s.patterns[0], 4)
    expect(newCell).toBeDefined()
    expect(newCell!.trackId).toBe(4)
  })
})

describe('addTrack — orphan track reuse at MAX_TRACKS', () => {
  it('reuses orphan trackId when at capacity', () => {
    const s = makeTestSong(2, MAX_TRACKS)
    // Remove track 3 from ALL patterns so it becomes orphan
    removeTrack(s, 0, 3)
    removeTrack(s, 1, 3)

    const newId = addTrack(s, 0)
    expect(newId).toBe(3) // reused orphan
    expect(s.tracks.length).toBe(MAX_TRACKS) // no growth
    expect(cellFor(s.patterns[0], 3)).toBeDefined()
  })

  it('returns null when at capacity with no orphans', () => {
    const s = makeTestSong(1, MAX_TRACKS)
    expect(addTrack(s, 0)).toBeNull()
  })

  it('resets reused track state', () => {
    const s = makeTestSong(1, MAX_TRACKS)
    s.tracks[5].muted = true
    s.tracks[5].volume = 0.3
    s.tracks[5].pan = -1
    // Remove track 5 from all patterns
    removeTrack(s, 0, 5)

    addTrack(s, 0)
    const slot = s.tracks.find(t => t.id === 5)!
    expect(slot.muted).toBe(false)
    expect(slot.volume).toBe(0.8)
    expect(slot.pan).toBe(0)
  })

  it('does not reuse track still referenced by another pattern', () => {
    const s = makeTestSong(2, MAX_TRACKS)
    // Remove track 7 from pattern 0 only — still in pattern 1
    removeTrack(s, 0, 7)

    const newId = addTrack(s, 0)
    // Track 7 is NOT orphan (still in pattern 1), so should fail
    expect(newId).toBeNull()
  })

  it('repeated add/remove cycles can always add', () => {
    const s = makeTestSong(1, MAX_TRACKS)
    for (let i = 0; i < 5; i++) {
      // Remove last cell's track
      const lastCell = s.patterns[0].cells[s.patterns[0].cells.length - 1]
      removeTrack(s, 0, lastCell.trackId)
      // Should be able to add again
      const newId = addTrack(s, 0)
      expect(newId).not.toBeNull()
    }
  })
})

describe('patterns can have different track counts (ADR 079)', () => {
  it('remove from one, add to another', () => {
    const s = makeTestSong(2, 8)

    removeTrack(s, 0, 7)
    removeTrack(s, 0, 6)
    addTrack(s, 1)

    expect(s.patterns[0].cells.length).toBe(6)
    expect(s.patterns[1].cells.length).toBe(9)
    expect(s.tracks.length).toBe(9)
  })

  it('trackIds stay stable across pattern manipulation', () => {
    const s = makeTestSong(2, 4)

    // Remove track 1 from pattern 0
    removeTrack(s, 0, 1)
    // Add new track to pattern 1
    addTrack(s, 1)

    // Pattern 0: tracks [0, 2, 3]
    expect(s.patterns[0].cells.map(c => c.trackId)).toEqual([0, 2, 3])
    // Pattern 1: tracks [0, 1, 2, 3, 4]
    expect(s.patterns[1].cells.map(c => c.trackId)).toEqual([0, 1, 2, 3, 4])
    // Mixer tracks all present
    expect(s.tracks.map(t => t.id)).toEqual([0, 1, 2, 3, 4])
  })
})
