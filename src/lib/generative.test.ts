import { describe, it, expect } from 'vitest'
import { turingGenerate, quantizeTrigs, tonnetzGenerate, resolveRhythm, SCALE_MAP } from './generative.ts'
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

// ── Tonnetz (ADR 126 v2: 1 step = 1 transform) ──

describe('tonnetzGenerate', () => {
  const baseParams: TonnetzParams = {
    engine: 'tonnetz',
    startChord: [60, 64, 67], // C major
    sequence: ['P', 'L', 'R'],
    voicing: 'close',
  }

  it('generates the requested number of steps', () => {
    const trigs = tonnetzGenerate(baseParams, 16)
    expect(trigs).toHaveLength(16)
  })

  it('every step is active by default (rhythm: all)', () => {
    const trigs = tonnetzGenerate(baseParams, 8)
    expect(trigs.every(t => t.active)).toBe(true)
  })

  it('every active trig has poly notes (chords)', () => {
    const trigs = tonnetzGenerate(baseParams, 8)
    for (const t of trigs.filter(t => t.active)) {
      expect(t.notes).toBeDefined()
      expect(t.notes!.length).toBe(3)
    }
  })

  it('step 0 plays startChord (no transform)', () => {
    const trigs = tonnetzGenerate(baseParams, 1)
    expect(trigs[0].notes).toEqual([60, 64, 67])
  })

  it('step 1 applies sequence[0], step 2 applies sequence[1]', () => {
    const trigs = tonnetzGenerate(baseParams, 3)
    // step 0: C major (start)
    // step 1: P(C maj) = C minor
    // step 2: L(C min) = Ab major (or normalized equivalent)
    expect(trigs[0].notes).toEqual([60, 64, 67])
    expect(trigs[1].notes).not.toEqual(trigs[0].notes) // P changed it
    expect(trigs[2].notes).not.toEqual(trigs[1].notes) // L changed it
  })

  it('P transform flips major to minor on step 1', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'] }
    const trigs = tonnetzGenerate(params, 2)
    const chord2 = trigs[1].notes!
    const intervals = [chord2[1] - chord2[0], chord2[2] - chord2[1]]
    expect(intervals).toEqual([3, 4]) // minor triad
  })

  it('transforms produce chord changes across steps', () => {
    const trigs = tonnetzGenerate(baseParams, 4)
    // step 0: C major, step 1: P(C)=Cm, step 2: L(Cm), step 3: R(L(Cm))
    expect(trigs[0].notes).not.toEqual(trigs[1].notes) // P changes chord
    expect(trigs[1].notes).not.toEqual(trigs[2].notes) // L changes chord
    // Note: some transforms can return to a previously visited chord (lattice cycles)
    // so we don't assert all consecutive pairs differ
  })

  it('sequence cycles when exhausted', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'] }
    const trigs = tonnetzGenerate(params, 5)
    // P flips major↔minor each step: C→Cm→C→Cm→C
    expect(trigs[0].notes).toEqual(trigs[2].notes) // same after 2 P's
    expect(trigs[0].notes).toEqual(trigs[4].notes) // same after 4 P's
    expect(trigs[0].notes).not.toEqual(trigs[1].notes)
  })

  it('hold op ("") keeps chord unchanged', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['', 'P'] }
    const trigs = tonnetzGenerate(params, 3)
    // step 0: startChord, step 1: hold (same), step 2: P (changes)
    expect(trigs[0].notes).toEqual(trigs[1].notes)
    expect(trigs[2].notes).not.toEqual(trigs[1].notes)
  })

  it('spread voicing raises middle note', () => {
    const params: TonnetzParams = { ...baseParams, voicing: 'spread' }
    const trigs = tonnetzGenerate(params, 1)
    const notes = trigs[0].notes!
    expect(notes[1] - notes[0]).toBeGreaterThan(12)
  })

  it('drop2 voicing reorders voices', () => {
    const params: TonnetzParams = { ...baseParams, voicing: 'drop2' }
    const trigs = tonnetzGenerate(params, 1)
    const notes = trigs[0].notes!
    expect(notes[2]).toBeGreaterThan(notes[1])
    expect(notes[2] - notes[0]).toBeGreaterThan(12)
  })

  it('MIDI notes stay in reasonable range over 64 steps', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P', 'L', 'R', 'PL', 'PR', 'LR'] }
    const trigs = tonnetzGenerate(params, 64)
    for (const t of trigs.filter(t => t.active)) {
      for (const n of t.notes!) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(127)
      }
    }
  })

  it('offbeat rhythm makes alternating steps active/rest', () => {
    const params: TonnetzParams = { ...baseParams, rhythm: 'offbeat' }
    const trigs = tonnetzGenerate(params, 8)
    expect(trigs[0].active).toBe(false)
    expect(trigs[1].active).toBe(true)
    expect(trigs[2].active).toBe(false)
    expect(trigs[3].active).toBe(true)
    expect(trigs.filter(t => t.active).length).toBe(4)
  })

  it('rest steps still advance the transform sequence', () => {
    // Use P,L so transforms don't cancel out
    const params: TonnetzParams = { ...baseParams, sequence: ['P', 'L'], rhythm: 'offbeat' }
    const trigs = tonnetzGenerate(params, 4)
    // step 0: rest, step 1: active (P+L applied so far), step 2: rest, step 3: active
    // Active trigs at 1 and 3 should have different chords (2 more transforms applied)
    expect(trigs[1].active).toBe(true)
    expect(trigs[3].active).toBe(true)
    expect(trigs[1].notes).not.toEqual(trigs[3].notes)
  })

  it('anchor resets chord at specific step', () => {
    const params: TonnetzParams = {
      ...baseParams,
      sequence: ['P', 'L', 'R'],
      anchors: [{ step: 4, chord: [53, 57, 60] }], // F major at step 4
    }
    const trigs = tonnetzGenerate(params, 6)
    // step 4: anchor resets to F major
    expect(trigs[4].notes).toEqual([53, 57, 60])
    // step 5: transform continues from F major
    expect(trigs[5].notes).not.toEqual(trigs[4].notes)
  })

  it('anchor at step 0 overrides startChord', () => {
    const params: TonnetzParams = {
      ...baseParams,
      anchors: [{ step: 0, chord: [53, 57, 60] }],
    }
    const trigs = tonnetzGenerate(params, 2)
    expect(trigs[0].notes).toEqual([53, 57, 60]) // F major, not C major
  })

  it('multiple anchors create a progression with evolving fills', () => {
    const params: TonnetzParams = {
      engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'close',
      sequence: ['P', 'L'],
      anchors: [
        { step: 0, chord: [60, 64, 67] },  // C
        { step: 4, chord: [53, 57, 60] },  // F
      ],
    }
    const trigs = tonnetzGenerate(params, 8)
    expect(trigs[0].notes).toEqual([60, 64, 67]) // C anchor
    expect(trigs[4].notes).toEqual([53, 57, 60]) // F anchor
    // steps 1-3: P,L,P from C — evolving
    // steps 5-7: L,P,L from F — evolving
    expect(trigs[1].notes).not.toEqual(trigs[0].notes)
    expect(trigs[5].notes).not.toEqual(trigs[4].notes)
  })

  it('euclidean rhythm distributes hits', () => {
    const params: TonnetzParams = { ...baseParams, rhythm: { preset: 'euclidean', hits: 3 } }
    const trigs = tonnetzGenerate(params, 8)
    expect(trigs.filter(t => t.active).length).toBe(3)
  })

  // stepsPerTransform tests
  it('stepsPerTransform=4 holds chord for 4 steps before next transform', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'], stepsPerTransform: 4 }
    const trigs = tonnetzGenerate(params, 8)
    // Steps 0-3: startChord, steps 4-7: P(startChord)
    expect(trigs[0].notes).toEqual(trigs[1].notes)
    expect(trigs[0].notes).toEqual(trigs[3].notes)
    expect(trigs[4].notes).not.toEqual(trigs[0].notes) // P applied at boundary
    expect(trigs[4].notes).toEqual(trigs[7].notes) // held for 4 steps
  })

  it('stepsPerTransform=1 changes chord every step (default)', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'] }
    const trigs = tonnetzGenerate(params, 3)
    // step 0: start, step 1: P(start), step 2: PP(start)
    expect(trigs[0].notes).not.toEqual(trigs[1].notes)
    expect(trigs[1].notes).not.toEqual(trigs[2].notes)
  })

  it('legato rhythm triggers only at chord boundaries', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'], stepsPerTransform: 4, rhythm: 'legato' }
    const trigs = tonnetzGenerate(params, 8)
    // Step 0: active (chord boundary), steps 1-3: inactive (held)
    expect(trigs[0].active).toBe(true)
    expect(trigs[0].duration).toBe(4)
    expect(trigs[1].active).toBe(false)
    expect(trigs[3].active).toBe(false)
    // Step 4: active (new chord)
    expect(trigs[4].active).toBe(true)
    expect(trigs[4].duration).toBe(4)
    expect(trigs.filter(t => t.active).length).toBe(2)
  })

  it('offbeat + stepsPerTransform=4 gives stabs within each chord', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'], stepsPerTransform: 4, rhythm: 'offbeat' }
    const trigs = tonnetzGenerate(params, 8)
    // offbeat: .x.x.x.x — all use the same chord within each 4-step block
    expect(trigs[0].active).toBe(false)
    expect(trigs[1].active).toBe(true)
    expect(trigs[1].notes).toEqual(trigs[3].notes) // same chord in block
    expect(trigs[5].notes).not.toEqual(trigs[1].notes) // different chord after transform
  })
})

// ── resolveRhythm ──

describe('resolveRhythm', () => {
  it('all: every step true', () => {
    const r = resolveRhythm('all', 4)
    expect(r).toEqual([true, true, true, true])
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
    expect(r.filter(Boolean).length).toBe(3)
    expect(r).toHaveLength(8)
  })

  it('boolean array: padded or trimmed to length', () => {
    expect(resolveRhythm([true, false], 4)).toEqual([true, false, false, false])
    expect(resolveRhythm([true, false, true, true, true], 3)).toEqual([true, false, true])
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
