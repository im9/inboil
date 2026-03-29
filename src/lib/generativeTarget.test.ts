import { describe, it, expect } from 'vitest'
import type { Cell, Trig } from './types.ts'

// Will be extracted from sceneActions.ts
import { resolveTargetCell } from './generativeTarget.ts'

// ── Helpers ──

function makeCell(trackId: number, name = `Track ${trackId + 1}`): Cell {
  const trigs: Trig[] = Array.from({ length: 16 }, () => ({
    active: false, note: 60, velocity: 100, accent: false, duration: 1, slide: false,
  }))
  return {
    trackId, name, voiceId: null, steps: 16, trigs,
    voiceParams: {}, reverbSend: 0, delaySend: 0, glitchSend: 0, granularSend: 0,
  }
}

// ── resolveTargetCell ──

describe('resolveTargetCell', () => {
  const cells = [makeCell(0), makeCell(1), makeCell(2)]

  it('returns undefined when targetTrack is undefined', () => {
    expect(resolveTargetCell(cells, undefined)).toBeUndefined()
  })

  it('returns the matching cell when targetTrack is set', () => {
    const result = resolveTargetCell(cells, 1)
    expect(result?.trackId).toBe(1)
  })

  it('returns undefined when targetTrack does not match any cell', () => {
    expect(resolveTargetCell(cells, 99)).toBeUndefined()
  })

  it('returns correct cell when trackIds are non-contiguous', () => {
    const sparse = [makeCell(0), makeCell(5), makeCell(10)]
    expect(resolveTargetCell(sparse, 5)?.trackId).toBe(5)
    expect(resolveTargetCell(sparse, 1)).toBeUndefined()
  })

  it('does NOT fall back to cells[0] when targetTrack is undefined', () => {
    // This is the key behavioral change: no implicit fallback
    const result = resolveTargetCell(cells, undefined)
    expect(result).toBeUndefined()  // NOT cells[0]
  })
})
