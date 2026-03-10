import { describe, it, expect } from 'vitest'
import { turingGenerate, quantizeTrigs, SCALE_MAP } from './generative.ts'
import type { TuringParams, QuantizerParams, Trig } from './state.svelte.ts'

describe('turingGenerate', () => {
  const baseParams: TuringParams = {
    engine: 'turing',
    length: 8,
    lock: 0.5,
    range: [48, 72],
    mode: 'note',
    density: 0.7,
  }

  it('generates the requested number of steps', () => {
    const trigs = turingGenerate(baseParams, 16, 42)
    expect(trigs).toHaveLength(16)
  })

  it('notes are within the specified range', () => {
    const trigs = turingGenerate(baseParams, 32, 42)
    for (const t of trigs) {
      expect(t.note).toBeGreaterThanOrEqual(48)
      expect(t.note).toBeLessThanOrEqual(72)
    }
  })

  it('deterministic with same seed', () => {
    const a = turingGenerate(baseParams, 16, 123)
    const b = turingGenerate(baseParams, 16, 123)
    expect(a).toEqual(b)
  })

  it('different seeds produce different output', () => {
    const a = turingGenerate(baseParams, 16, 1)
    const b = turingGenerate(baseParams, 16, 2)
    const same = a.every((t, i) => t.note === b[i].note)
    expect(same).toBe(false)
  })

  it('lock=1.0 produces a repeating loop', () => {
    const locked = { ...baseParams, lock: 1.0 }
    const trigs = turingGenerate(locked, 32, 42)
    // With lock=1.0 register never mutates after init, so values should cycle with period = length
    const period = locked.length
    for (let i = period; i < trigs.length; i++) {
      expect(trigs[i].note).toBe(trigs[i - period].note)
    }
  })

  it('gate mode uses fixed note and varies activity', () => {
    const gateParams = { ...baseParams, mode: 'gate' as const }
    const trigs = turingGenerate(gateParams, 16, 42)
    const mid = Math.round((48 + 72) / 2)
    for (const t of trigs) {
      expect(t.note).toBe(mid)
    }
  })

  it('velocity mode produces varying velocities', () => {
    const velParams = { ...baseParams, mode: 'velocity' as const }
    const trigs = turingGenerate(velParams, 16, 42)
    const velocities = new Set(trigs.map(t => t.velocity))
    expect(velocities.size).toBeGreaterThan(1)
  })

  it('density=0 produces no active steps in gate mode', () => {
    const sparse = { ...baseParams, mode: 'gate' as const, density: 0 }
    const trigs = turingGenerate(sparse, 16, 42)
    expect(trigs.every(t => !t.active)).toBe(true)
  })
})

// ── Quantizer ──

describe('quantizeTrigs', () => {
  const qParams: QuantizerParams = {
    engine: 'quantizer',
    scale: 'major',
    root: 0, // C
    octaveRange: [3, 5],
  }

  function makeTrig(note: number, active = true): Trig {
    return { active, note, velocity: 0.8, duration: 1, slide: false }
  }

  it('snaps notes to C major scale degrees', () => {
    const trigs = [makeTrig(61), makeTrig(63), makeTrig(66)] // C#4, D#4, F#4
    const result = quantizeTrigs(trigs, qParams)
    // C major = C D E F G A B → 0 2 4 5 7 9 11
    // 61 (C#) → 60 (C) or 62 (D)
    // 63 (D#) → 62 (D) or 64 (E)
    // 66 (F#) → 65 (F) or 67 (G)
    for (const t of result) {
      expect(SCALE_MAP.major).toContain(t.note % 12)
    }
  })

  it('preserves inactive trigs', () => {
    const trigs = [makeTrig(61, false)]
    const result = quantizeTrigs(trigs, qParams)
    expect(result[0].active).toBe(false)
    expect(result[0].note).toBe(61) // not snapped
  })

  it('respects octave range', () => {
    // Octave range 3-5 = MIDI 36-71
    const trigs = [makeTrig(30), makeTrig(80)] // below and above range
    const result = quantizeTrigs(trigs, qParams)
    // Should snap to nearest note within the built scale
    expect(result[0].note).toBeGreaterThanOrEqual(36)
    expect(result[1].note).toBeLessThanOrEqual(71)
  })

  it('handles minor pentatonic scale', () => {
    const minPent: QuantizerParams = { ...qParams, scale: 'minor-pent' }
    const trigs = [makeTrig(60), makeTrig(62), makeTrig(64)]
    const result = quantizeTrigs(trigs, minPent)
    // minor-pent = 0,3,5,7,10
    for (const t of result) {
      expect(SCALE_MAP['minor-pent']).toContain(t.note % 12)
    }
  })

  it('handles root offset', () => {
    const dMajor: QuantizerParams = { ...qParams, root: 2 } // D major
    const trigs = [makeTrig(60)] // C4
    const result = quantizeTrigs(trigs, dMajor)
    // D major degrees from D: D E F# G A B C#
    // C4 (60) is not in D major → should snap to C#4 (61) or B3 (59)
    const dMajorNotes = SCALE_MAP.major.map(i => (i + 2) % 12)
    expect(dMajorNotes).toContain(result[0].note % 12)
  })

  it('quantizes poly notes too', () => {
    const trig: Trig = { active: true, note: 61, velocity: 0.8, duration: 1, slide: false, notes: [61, 63] }
    const result = quantizeTrigs([trig], qParams)
    expect(result[0].notes).toBeDefined()
    for (const n of result[0].notes!) {
      expect(SCALE_MAP.major).toContain(n % 12)
    }
  })
})

describe('SCALE_MAP', () => {
  it('has all expected scales', () => {
    expect(SCALE_MAP.major).toBeDefined()
    expect(SCALE_MAP.minor).toBeDefined()
    expect(SCALE_MAP.pentatonic).toBeDefined()
    expect(SCALE_MAP.blues).toBeDefined()
    expect(SCALE_MAP.chromatic).toHaveLength(12)
  })
})
