import { describe, it, expect } from 'vitest'
import { turingGenerate, quantizeTrigs, tonnetzGenerate, legacyToSlots, resolveRhythm, SCALE_MAP } from './generative.ts'
import type { TuringParams, QuantizerParams, TonnetzParams, Trig } from './types.ts'

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

// ── Tonnetz ──

describe('tonnetzGenerate', () => {
  const baseParams: TonnetzParams = {
    engine: 'tonnetz',
    startChord: [60, 64, 67], // C major
    sequence: ['P', 'L', 'R'],
    stepsPerChord: 4,
    voicing: 'close',
  }

  it('generates the requested number of steps', () => {
    const trigs = tonnetzGenerate(baseParams, 16)
    expect(trigs).toHaveLength(16)
  })

  it('active trigs have poly notes (chords)', () => {
    const trigs = tonnetzGenerate(baseParams, 16)
    for (const t of trigs.filter(t => t.active)) {
      expect(t.notes).toBeDefined()
      expect(t.notes!.length).toBe(3)
    }
  })

  it('first chord matches startChord', () => {
    const trigs = tonnetzGenerate(baseParams, 4)
    // First chord should be C major [60, 64, 67] in close voicing
    expect(trigs[0].notes).toEqual([60, 64, 67])
  })

  it('P transform flips major to minor', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'], stepsPerChord: 4 }
    const trigs = tonnetzGenerate(params, 8)
    // Step 4 should be C minor (P of C major): root stays, third moves
    const chord2 = trigs[4].notes!
    // C minor = [60, 63, 67] (but may be normalized)
    const intervals = [chord2[1] - chord2[0], chord2[2] - chord2[1]]
    expect(intervals).toEqual([3, 4]) // minor triad
  })

  it('chords change at stepsPerChord boundaries', () => {
    const trigs = tonnetzGenerate(baseParams, 12)
    // Step 0: active chord trig, steps 1-3: inactive (legato)
    expect(trigs[0].active).toBe(true)
    expect(trigs[1].active).toBe(false)
    expect(trigs[3].active).toBe(false)
    // Step 4: new chord (different)
    expect(trigs[4].active).toBe(true)
    expect(trigs[0].notes).not.toEqual(trigs[4].notes)
  })

  it('legato duration spans chord steps', () => {
    const trigs = tonnetzGenerate(baseParams, 16)
    // Each chord boundary trig should have duration = stepsPerChord
    expect(trigs[0].duration).toBe(4)
    expect(trigs[4].duration).toBe(4)
    expect(trigs[8].duration).toBe(4)
  })

  it('spread voicing raises middle note', () => {
    const params: TonnetzParams = { ...baseParams, voicing: 'spread' }
    const trigs = tonnetzGenerate(params, 4)
    const notes = trigs[0].notes!
    // Spread: [root, middle+12, fifth]
    expect(notes[1] - notes[0]).toBeGreaterThan(12)
  })

  it('drop2 voicing reorders voices', () => {
    const params: TonnetzParams = { ...baseParams, voicing: 'drop2' }
    const trigs = tonnetzGenerate(params, 4)
    const notes = trigs[0].notes!
    // Drop2: [root, fifth, middle+12]
    expect(notes[2]).toBeGreaterThan(notes[1])
    expect(notes[2] - notes[0]).toBeGreaterThan(12)
  })

  it('only chord boundary trigs are active', () => {
    const trigs = tonnetzGenerate(baseParams, 16)
    // 16 steps / 4 per chord = 4 active trigs
    expect(trigs.filter(t => t.active).length).toBe(4)
    expect(trigs[0].active).toBe(true)
    expect(trigs[4].active).toBe(true)
    expect(trigs[8].active).toBe(true)
    expect(trigs[12].active).toBe(true)
  })

  it('MIDI notes stay in reasonable range', () => {
    // Long sequence to test range doesn't drift
    const params: TonnetzParams = { ...baseParams, sequence: ['P', 'L', 'R', 'PL', 'PR', 'LR'], stepsPerChord: 2 }
    const trigs = tonnetzGenerate(params, 64)
    for (const t of trigs.filter(t => t.active)) {
      for (const n of t.notes!) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(127)
      }
    }
  })
})

// ── legacyToSlots ──

describe('legacyToSlots', () => {
  it('converts sequence + stepsPerChord to slot array', () => {
    const params: TonnetzParams = {
      engine: 'tonnetz', startChord: [60, 64, 67],
      sequence: ['P', 'L', 'R'], stepsPerChord: 4, voicing: 'close',
    }
    const slots = legacyToSlots(params)
    // First slot is explicit chord (startChord), rest are transforms
    expect(slots).toHaveLength(4) // 1 chord + 3 ops
    expect((slots[0] as { chord: number[] }).chord).toEqual([60, 64, 67])
    expect(slots[0].steps).toBe(4)
    expect((slots[1] as { op: string }).op).toBe('P')
    expect((slots[2] as { op: string }).op).toBe('L')
    expect((slots[3] as { op: string }).op).toBe('R')
  })
})

// ── resolveRhythm ──

describe('resolveRhythm', () => {
  it('legato: first step true, rest false', () => {
    const r = resolveRhythm('legato', 4)
    expect(r).toEqual([true, false, false, false])
  })

  it('offbeat: alternating false/true', () => {
    const r = resolveRhythm('offbeat', 8)
    expect(r).toEqual([false, true, false, true, false, true, false, true])
  })

  it('onbeat: every 4 steps', () => {
    const r = resolveRhythm('onbeat', 8)
    expect(r).toEqual([true, false, false, false, true, false, false, false])
  })

  it('syncopated: x.x..x.x repeating', () => {
    const r = resolveRhythm('syncopated', 8)
    expect(r).toEqual([true, false, true, false, false, true, false, true])
  })

  it('euclidean: distributes hits evenly', () => {
    const r = resolveRhythm({ preset: 'euclidean', hits: 3 }, 8)
    // Bjorklund(3,8) = [true, false, false, true, false, false, true, false]
    expect(r.filter(Boolean).length).toBe(3)
    expect(r).toHaveLength(8)
  })

  it('boolean array: padded or trimmed to length', () => {
    expect(resolveRhythm([true, false], 4)).toEqual([true, false, false, false])
    expect(resolveRhythm([true, false, true, true, true], 3)).toEqual([true, false, true])
  })
})

// ── tonnetzGenerate with slots (ADR 126) ──

describe('tonnetzGenerate with slots', () => {
  const baseSlotParams: TonnetzParams = {
    engine: 'tonnetz',
    startChord: [60, 64, 67],
    voicing: 'close',
    slots: [
      { chord: [60, 64, 67], steps: 4 },  // C major
      { op: 'P', steps: 4 },               // → C minor
    ],
  }

  it('generates correct step count', () => {
    const trigs = tonnetzGenerate(baseSlotParams, 16)
    expect(trigs).toHaveLength(16)
  })

  it('explicit chord slot uses given chord', () => {
    const trigs = tonnetzGenerate(baseSlotParams, 8)
    expect(trigs[0].notes).toEqual([60, 64, 67])
  })

  it('transform slot applies op to previous chord', () => {
    const trigs = tonnetzGenerate(baseSlotParams, 8)
    // Slot 1 is P transform of C major → C minor
    const chord2 = trigs[4].notes!
    const intervals = [chord2[1] - chord2[0], chord2[2] - chord2[1]]
    expect(intervals).toEqual([3, 4]) // minor triad
  })

  it('variable duration per slot', () => {
    const params: TonnetzParams = {
      engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'close',
      slots: [
        { chord: [60, 64, 67], steps: 8 },
        { chord: [53, 57, 60], steps: 4 },
        { chord: [55, 59, 62], steps: 4 },
      ],
    }
    const trigs = tonnetzGenerate(params, 16)
    expect(trigs[0].active).toBe(true)
    expect(trigs[0].duration).toBe(8)
    expect(trigs[8].active).toBe(true)
    expect(trigs[8].duration).toBe(4)
    expect(trigs[12].active).toBe(true)
    expect(trigs[12].duration).toBe(4)
  })

  it('slots loop when exhausted', () => {
    const params: TonnetzParams = {
      engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'close',
      slots: [{ chord: [60, 64, 67], steps: 4 }],
    }
    const trigs = tonnetzGenerate(params, 12)
    // Single 4-step slot loops 3 times
    expect(trigs.filter(t => t.active).length).toBe(3)
    expect(trigs[0].notes).toEqual(trigs[4].notes)
    expect(trigs[0].notes).toEqual(trigs[8].notes)
  })

  it('offbeat rhythm produces alternating rests and trigs', () => {
    const params: TonnetzParams = {
      engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'close',
      slots: [{ chord: [60, 64, 67], steps: 8, rhythm: 'offbeat' }],
    }
    const trigs = tonnetzGenerate(params, 8)
    // offbeat: .x.x.x.x — steps 1,3,5,7 active
    expect(trigs[0].active).toBe(false)
    expect(trigs[1].active).toBe(true)
    expect(trigs[2].active).toBe(false)
    expect(trigs[3].active).toBe(true)
    expect(trigs.filter(t => t.active).length).toBe(4)
  })

  it('onbeat rhythm triggers every 4 steps', () => {
    const params: TonnetzParams = {
      engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'close',
      slots: [{ chord: [60, 64, 67], steps: 8, rhythm: 'onbeat' }],
    }
    const trigs = tonnetzGenerate(params, 8)
    expect(trigs[0].active).toBe(true)
    expect(trigs[4].active).toBe(true)
    expect(trigs.filter(t => t.active).length).toBe(2)
  })

  it('transform after explicit chord operates on that chord', () => {
    const params: TonnetzParams = {
      engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'close',
      slots: [
        { chord: [53, 57, 60], steps: 4 },  // F major
        { op: 'P', steps: 4 },               // → F minor
      ],
    }
    const trigs = tonnetzGenerate(params, 8)
    // First slot: F major
    expect(trigs[0].notes).toEqual([53, 57, 60])
    // Second slot: P of F major = F minor [53, 56, 60]
    const chord2 = trigs[4].notes!
    const intervals = [chord2[1] - chord2[0], chord2[2] - chord2[1]]
    expect(intervals).toEqual([3, 4]) // minor
  })

  it('legacy params (no slots) still work via fallback', () => {
    const params: TonnetzParams = {
      engine: 'tonnetz', startChord: [60, 64, 67],
      sequence: ['P'], stepsPerChord: 4, voicing: 'close',
    }
    const trigs = tonnetzGenerate(params, 8)
    expect(trigs).toHaveLength(8)
    expect(trigs[0].active).toBe(true)
    expect(trigs[0].notes).toEqual([60, 64, 67])
    // Step 4: P transform → minor
    const intervals = [trigs[4].notes![1] - trigs[4].notes![0], trigs[4].notes![2] - trigs[4].notes![1]]
    expect(intervals).toEqual([3, 4])
  })

  it('euclidean rhythm distributes hits correctly', () => {
    const params: TonnetzParams = {
      engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'close',
      slots: [{ chord: [60, 64, 67], steps: 8, rhythm: { preset: 'euclidean', hits: 3 } }],
    }
    const trigs = tonnetzGenerate(params, 8)
    expect(trigs.filter(t => t.active).length).toBe(3)
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
