import { describe, it, expect } from 'vitest'
import { makeEmptyCell, makeTrack } from './factory.ts'
import type { Pattern, Track, Cell } from './state.svelte.ts'

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

function addTrack(s: TestSong, currentPattern: number): number {
  const idx = s.tracks.length
  s.tracks.push(makeTrack(idx))
  // Only add to current pattern
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
    expect(cellFor(s.patterns[1], newTrackId)).toBeDefined()
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
