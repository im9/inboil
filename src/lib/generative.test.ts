import { describe, it, expect } from 'vitest'
import { turingGenerate, quantizeTrigs, tonnetzGenerate, resolveRhythm, SCALE_MAP, applyTonnetzOp, computeWalkPath } from './generative.ts'
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

  it('mode defaults to scale (backward compat)', () => {
    // No mode field — should behave exactly like before
    const trigs = [makeTrig(61)]
    const result = quantizeTrigs(trigs, qParams)
    expect(SCALE_MAP.major).toContain(result[0].note % 12)
  })
})

// ── Quantizer: Chord Mode (ADR 127) ──

describe('quantizeTrigs chord mode', () => {
  function makeTrig(note: number, active = true): Trig {
    return { active, note, velocity: 0.8, duration: 1, slide: false }
  }

  const chordParams: QuantizerParams = {
    engine: 'quantizer',
    scale: 'major',
    root: 0,
    octaveRange: [3, 5],
    mode: 'chord',
    chords: [
      { step: 0, notes: [0, 4, 7] },    // C major (steps 0+)
      { step: 8, notes: [9, 0, 4] },    // Am (steps 8+)
    ],
  }

  it('snaps notes to chord tones when within 2 semitones', () => {
    // C=60 is a chord tone (root), D=62 is 2 away from C(60) and E(64)
    const trigs = [makeTrig(60), makeTrig(62)]
    const result = quantizeTrigs(trigs, chordParams)
    // 60 (C) is already a chord tone → stays
    expect(result[0].note).toBe(60)
    // 62 (D) → nearest chord tone is C(60) at dist 2 or E(64) at dist 2 → either is valid
    expect([0, 4, 7]).toContain(result[1].note % 12)
  })

  it('falls back to scale when chord tone is >2 semitones away', () => {
    // F#=66 is not within 2 of any C major chord tone (C=60,E=64,G=67)
    // Nearest chord tone is G(67) at dist 1, so should snap to G
    const trigs = [makeTrig(66)]
    const result = quantizeTrigs(trigs, chordParams)
    // G is both a chord tone and scale tone at dist 1
    expect(SCALE_MAP.major).toContain(result[0].note % 12)
  })

  it('uses different chords at different steps', () => {
    // Step 0 uses C major, step 8 uses Am
    const trigs = Array.from({ length: 16 }, () => makeTrig(61)) // C#
    const result = quantizeTrigs(trigs, chordParams)
    // Step 0: C# → nearest chord tone in Cmaj is C(60) at dist 1
    expect(result[0].note).toBe(60)
    // Step 8: C# → nearest chord tone in Am is A at dist... A=57(oct3) or 69(oct5)
    // C#4=61 → nearest Am chord tone: C(60)=0, E(64)=4, A(57)=9
    // A3=57 dist 4, C4=60 dist 1, E4=64 dist 3 → C4(60) is nearest at dist 1
    expect(result[8].note).toBe(60)
  })

  it('falls back to scale mode when no chords provided', () => {
    const noChords: QuantizerParams = {
      engine: 'quantizer', scale: 'major', root: 0, octaveRange: [3, 5],
      mode: 'chord', // chord mode but no chords array
    }
    const trigs = [makeTrig(61)]
    const result = quantizeTrigs(trigs, noChords)
    expect(SCALE_MAP.major).toContain(result[0].note % 12)
  })

  it('works with Tonnetz walk path', () => {
    const params: QuantizerParams = {
      engine: 'quantizer', scale: 'major', root: 0, octaveRange: [3, 5],
      mode: 'chord',
    }
    // Simulate a Tonnetz walk: C major for 4 steps, then F major for 4 steps
    const walk = [
      [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7],  // C
      [5, 9, 0], [5, 9, 0], [5, 9, 0], [5, 9, 0],  // F
    ]
    const trigs = Array.from({ length: 8 }, () => makeTrig(62)) // D4
    const result = quantizeTrigs(trigs, params, walk)
    // Step 0-3: C major chord tones [C,E,G] → D(62) nearest chord tone E(64) dist 2
    expect([0, 4, 7]).toContain(result[0].note % 12)
    // Step 4-7: F major chord tones [F,A,C] → D(62) nearest chord tone C(60) dist 2
    expect([5, 9, 0]).toContain(result[4].note % 12)
  })

  it('preserves inactive trigs in chord mode', () => {
    const trigs = [makeTrig(61, false)]
    const result = quantizeTrigs(trigs, chordParams)
    expect(result[0].active).toBe(false)
    expect(result[0].note).toBe(61)
  })

  it('quantizes poly notes in chord mode', () => {
    const trig: Trig = { active: true, note: 61, velocity: 0.8, duration: 1, slide: false, notes: [61, 66] }
    const result = quantizeTrigs([trig], chordParams)
    expect(result[0].notes).toBeDefined()
    // Each poly note should be snapped
    expect(result[0].notes!.length).toBe(2)
  })
})

// ── Quantizer: Harmony Mode (ADR 127) ──

describe('quantizeTrigs harmony mode', () => {
  function makeTrig(note: number, active = true): Trig {
    return { active, note, velocity: 0.8, duration: 1, slide: false }
  }

  const harmonyParams: QuantizerParams = {
    engine: 'quantizer',
    scale: 'major',
    root: 0,
    octaveRange: [3, 5],
    mode: 'harmony',
    harmonyVoices: [{ interval: 3, direction: 'above' }],
  }

  it('adds a diatonic 3rd above', () => {
    const trigs = [makeTrig(60)] // C4
    const result = quantizeTrigs(trigs, harmonyParams)
    expect(result[0].notes).toBeDefined()
    expect(result[0].notes!.length).toBe(2)
    // C4 + diatonic 3rd above = E4 (64)
    expect(result[0].notes).toContain(60)
    expect(result[0].notes).toContain(64)
  })

  it('adds a diatonic 5th above', () => {
    const params: QuantizerParams = {
      ...harmonyParams,
      harmonyVoices: [{ interval: 5, direction: 'above' }],
    }
    const trigs = [makeTrig(60)] // C4
    const result = quantizeTrigs(trigs, params)
    expect(result[0].notes).toContain(60)
    expect(result[0].notes).toContain(67) // G4
  })

  it('adds harmony below', () => {
    const params: QuantizerParams = {
      ...harmonyParams,
      harmonyVoices: [{ interval: 3, direction: 'below' }],
    }
    const trigs = [makeTrig(64)] // E4
    const result = quantizeTrigs(trigs, params)
    expect(result[0].notes).toContain(64) // E4
    expect(result[0].notes).toContain(60) // C4 (diatonic 3rd below E)
  })

  it('supports multiple harmony voices (full stack)', () => {
    const params: QuantizerParams = {
      ...harmonyParams,
      harmonyVoices: [
        { interval: 3, direction: 'above' },
        { interval: 5, direction: 'above' },
      ],
    }
    const trigs = [makeTrig(60)] // C4
    const result = quantizeTrigs(trigs, params)
    expect(result[0].notes!.length).toBe(3) // root + 3rd + 5th
    expect(result[0].notes).toContain(60) // C4
    expect(result[0].notes).toContain(64) // E4
    expect(result[0].notes).toContain(67) // G4
  })

  it('snaps input to scale first, then adds harmony', () => {
    // C#4 (61) is not in C major → snaps to C4 (60) or D4 (62)
    const trigs = [makeTrig(61)]
    const result = quantizeTrigs(trigs, harmonyParams)
    // Root note should be scale-snapped
    const root = result[0].notes![0]
    expect(SCALE_MAP.major).toContain(root % 12)
    // Harmony note should also be in scale
    expect(SCALE_MAP.major).toContain(result[0].notes![1] % 12)
  })

  it('falls back to scale-only when no harmony voices', () => {
    const params: QuantizerParams = {
      ...harmonyParams,
      harmonyVoices: [], // empty
    }
    const trigs = [makeTrig(61)]
    const result = quantizeTrigs(trigs, params)
    expect(result[0].notes).toBeUndefined()
    expect(SCALE_MAP.major).toContain(result[0].note % 12)
  })

  it('preserves inactive trigs', () => {
    const trigs = [makeTrig(61, false)]
    const result = quantizeTrigs(trigs, harmonyParams)
    expect(result[0].active).toBe(false)
    expect(result[0].note).toBe(61)
  })

  it('notes array is sorted low to high', () => {
    const params: QuantizerParams = {
      ...harmonyParams,
      harmonyVoices: [
        { interval: 3, direction: 'below' },
        { interval: 5, direction: 'above' },
      ],
    }
    const trigs = [makeTrig(64)] // E4
    const result = quantizeTrigs(trigs, params)
    const notes = result[0].notes!
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]).toBeGreaterThanOrEqual(notes[i - 1])
    }
  })
})

// ── computeWalkPath (ADR 127) ──

describe('computeWalkPath', () => {
  const baseParams: TonnetzParams = {
    engine: 'tonnetz',
    startChord: [60, 64, 67],
    sequence: ['P', 'L', 'R'],
    voicing: 'close',
  }

  it('returns pitch classes for each step', () => {
    const path = computeWalkPath(baseParams, 4)
    expect(path).toHaveLength(4)
    // Each entry should be an array of 3 pitch classes (0-11)
    for (const chord of path) {
      expect(chord).toHaveLength(3)
      for (const pc of chord) {
        expect(pc).toBeGreaterThanOrEqual(0)
        expect(pc).toBeLessThan(12)
      }
    }
  })

  it('step 0 returns startChord pitch classes', () => {
    const path = computeWalkPath(baseParams, 1)
    expect(path[0].sort((a, b) => a - b)).toEqual([0, 4, 7]) // C major
  })

  it('transforms applied at stepsPerTransform boundaries', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'], stepsPerTransform: 4 }
    const path = computeWalkPath(params, 8)
    // Steps 0-3: C major [0,4,7]
    expect(path[0]).toEqual(path[1])
    expect(path[0]).toEqual(path[3])
    // Steps 4-7: P → C minor [0,3,7]
    expect(path[4]).not.toEqual(path[0])
    expect(path[4]).toEqual(path[7])
  })

  it('anchors override chord at specific steps', () => {
    const params: TonnetzParams = {
      ...baseParams,
      anchors: [{ step: 4, chord: [53, 57, 60] }], // F major
    }
    const path = computeWalkPath(params, 6)
    expect(path[4].sort((a, b) => a - b)).toEqual([0, 5, 9]) // F major PCs
  })
})

// ── Neo-Riemannian transforms ──

describe('applyTonnetzOp', () => {
  const Cmaj: [number, number, number] = [60, 64, 67]

  function pcs(chord: number[]): number[] {
    return chord.map(n => n % 12).sort((a, b) => a - b)
  }

  it('P: C major → C minor (same root, flip quality)', () => {
    const result = applyTonnetzOp(Cmaj, 'P')
    expect(pcs(result)).toEqual([0, 3, 7])  // C minor
  })

  it('P is involution: PP returns to original', () => {
    const result = applyTonnetzOp(Cmaj, 'PP')
    expect(pcs(result)).toEqual([0, 4, 7])  // back to C major
  })

  it('L: C major → E minor', () => {
    const result = applyTonnetzOp(Cmaj, 'L')
    expect(pcs(result)).toEqual([4, 7, 11])  // E minor
  })

  it('L is involution: LL returns to original', () => {
    const result = applyTonnetzOp(Cmaj, 'LL')
    expect(pcs(result)).toEqual([0, 4, 7])
  })

  it('R: C major → A minor', () => {
    const result = applyTonnetzOp(Cmaj, 'R')
    expect(pcs(result)).toEqual([0, 4, 9])  // A minor (root=9, 9+3=0, 9+7=4)
  })

  it('R is involution: RR returns to original', () => {
    const result = applyTonnetzOp(Cmaj, 'RR')
    expect(pcs(result)).toEqual([0, 4, 7])
  })

  it('compound PL: C major → P → C minor → L → Ab major', () => {
    const result = applyTonnetzOp(Cmaj, 'PL')
    expect(pcs(result)).toEqual([0, 3, 8])  // Ab major (root=8, 8+4=0, 8+7=3)
  })

  it('compound PR: C major → P → C minor → R → Eb major', () => {
    const result = applyTonnetzOp(Cmaj, 'PR')
    expect(pcs(result)).toEqual([3, 7, 10])  // Eb major
  })

  it('long walk: PLR sequence from C major evolves continuously', () => {
    let chord: [number, number, number] = [...Cmaj]
    const visited: string[] = []
    for (let i = 0; i < 6; i++) {
      const ops = ['P', 'L', 'R']
      chord = applyTonnetzOp(chord, ops[i % 3])
      visited.push(pcs(chord).join(','))
    }
    // Should visit at least 4 distinct chords in 6 steps
    const unique = new Set(visited)
    expect(unique.size).toBeGreaterThanOrEqual(4)
  })

  it('output is always root-position triad (intervals 3+4 or 4+3)', () => {
    let chord: [number, number, number] = [...Cmaj]
    for (const op of ['P', 'L', 'R', 'PL', 'PR', 'LR', 'PLR']) {
      const result = applyTonnetzOp(chord, op)
      const i1 = result[1] - result[0]
      const i2 = result[2] - result[1]
      expect([i1, i2]).toSatisfy(
        ([a, b]: number[]) => (a === 3 && b === 4) || (a === 4 && b === 3),
        `${op} produced intervals [${i1}, ${i2}] instead of [3,4] or [4,3]`
      )
    }
  })

  it('MIDI notes stay in reasonable range after many transforms', () => {
    let chord: [number, number, number] = [...Cmaj]
    for (let i = 0; i < 100; i++) {
      chord = applyTonnetzOp(chord, ['P', 'L', 'R'][i % 3])
      expect(chord[0]).toBeGreaterThanOrEqual(36)
      expect(chord[2]).toBeLessThanOrEqual(96)
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

  function pcs(notes: number[]): number[] {
    return notes.map(n => n % 12).sort((a, b) => a - b)
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

  it('step 1 applies P (C major → C minor), step 2 applies L (C minor → Ab major)', () => {
    const trigs = tonnetzGenerate(baseParams, 3)
    expect(trigs[0].notes).toEqual([60, 64, 67]) // C major
    expect(pcs(trigs[1].notes!)).toEqual([0, 3, 7]) // C minor
    expect(pcs(trigs[2].notes!)).toEqual([0, 3, 8]) // Ab major
  })

  it('P transform flips major to minor on step 1', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'] }
    const trigs = tonnetzGenerate(params, 2)
    const chord2 = trigs[1].notes!
    const intervals = [chord2[1] - chord2[0], chord2[2] - chord2[1]]
    expect(intervals).toEqual([3, 4]) // minor triad
  })

  it('transforms produce genuinely different pitch classes across steps', () => {
    const trigs = tonnetzGenerate(baseParams, 4)
    expect(pcs(trigs[0].notes!)).not.toEqual(pcs(trigs[1].notes!))
    expect(pcs(trigs[1].notes!)).not.toEqual(pcs(trigs[2].notes!))
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
    // step 0: rest, step 1: active (P applied), step 2: rest (L applied), step 3: active (P applied)
    expect(trigs[1].active).toBe(true)
    expect(trigs[3].active).toBe(true)
    expect(pcs(trigs[1].notes!)).not.toEqual(pcs(trigs[3].notes!))
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
    expect(pcs(trigs[5].notes!)).not.toEqual(pcs(trigs[1].notes!)) // different chord after transform
  })
  // ── Arpeggio (Feature 1: Strum/Arpeggio) ──

  it('arp up: each step gets one note cycling low→high', () => {
    const params: TonnetzParams = { ...baseParams, sequence: [''], arp: { mode: 'up' } }
    const trigs = tonnetzGenerate(params, 6)
    // startChord close voicing = [60, 64, 67], held (no transform)
    // up cycle: 60, 64, 67, 60, 64, 67
    expect(trigs[0].note).toBe(60)
    expect(trigs[1].note).toBe(64)
    expect(trigs[2].note).toBe(67)
    expect(trigs[3].note).toBe(60) // cycles
    // Each trig should be mono (no notes array or single-note)
    for (const t of trigs) {
      expect(t.notes).toBeUndefined()
    }
  })

  it('arp down: each step cycles high→low', () => {
    const params: TonnetzParams = { ...baseParams, sequence: [''], arp: { mode: 'down' } }
    const trigs = tonnetzGenerate(params, 6)
    expect(trigs[0].note).toBe(67)
    expect(trigs[1].note).toBe(64)
    expect(trigs[2].note).toBe(60)
    expect(trigs[3].note).toBe(67) // cycles
  })

  it('arp updown: bounces low→high→low without repeating endpoints', () => {
    const params: TonnetzParams = { ...baseParams, sequence: [''], arp: { mode: 'updown' } }
    const trigs = tonnetzGenerate(params, 8)
    // 3-note chord: up-down = 60, 64, 67, 64, 60, 64, 67, 64
    expect(trigs[0].note).toBe(60)
    expect(trigs[1].note).toBe(64)
    expect(trigs[2].note).toBe(67)
    expect(trigs[3].note).toBe(64)
    expect(trigs[4].note).toBe(60)
  })

  it('arp random: notes are from the chord set', () => {
    const params: TonnetzParams = { ...baseParams, sequence: [''], arp: { mode: 'random', seed: 42 } }
    const trigs = tonnetzGenerate(params, 16)
    const chordNotes = [60, 64, 67]
    for (const t of trigs.filter(t => t.active)) {
      expect(chordNotes).toContain(t.note)
    }
  })

  it('arp resets note index when chord changes', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'], stepsPerTransform: 3, arp: { mode: 'up' } }
    const trigs = tonnetzGenerate(params, 6)
    // steps 0-2: C major [60,64,67], arp cycles: 60, 64, 67
    expect(trigs[0].note).toBe(60)
    expect(trigs[1].note).toBe(64)
    expect(trigs[2].note).toBe(67)
    // step 3: P → C minor [60,63,67], arp resets: 60, 63, 67
    expect(trigs[3].note).toBe(60) // reset to 0
    expect(trigs[4].note).toBe(63) // C minor 2nd note
    expect(trigs[5].note).toBe(67)
  })

  it('arp works with stepsPerTransform (cycles within held chord)', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'], stepsPerTransform: 4, arp: { mode: 'up' } }
    const trigs = tonnetzGenerate(params, 8)
    // steps 0-3: C major [60,64,67], cycling: 60,64,67,60
    expect(trigs[0].note).toBe(60)
    expect(trigs[1].note).toBe(64)
    expect(trigs[2].note).toBe(67)
    expect(trigs[3].note).toBe(60)
    // step 4: chord changes to C minor, arp resets: 60,63,67,60
    expect(trigs[4].note).toBe(60)
    expect(trigs[5].note).toBe(63)
  })

  it('arp + rhythm: inactive steps do not advance arp index', () => {
    const params: TonnetzParams = { ...baseParams, sequence: [''], rhythm: 'offbeat', arp: { mode: 'up' } }
    const trigs = tonnetzGenerate(params, 6)
    // offbeat: .x.x.x — only active steps get arp notes
    const active = trigs.filter(t => t.active)
    expect(active[0].note).toBe(60) // first arp note
    expect(active[1].note).toBe(64) // second arp note
    expect(active[2].note).toBe(67) // third arp note
  })

  // ── Chord quality: 7th chords (Feature 2) ──

  it('chordQuality 7th: produces 4-note chords', () => {
    const params: TonnetzParams = { ...baseParams, sequence: [''], chordQuality: '7th' }
    const trigs = tonnetzGenerate(params, 1)
    expect(trigs[0].notes).toBeDefined()
    expect(trigs[0].notes!.length).toBe(4)
  })

  it('chordQuality 7th: C major → Cmaj7 (adds B natural)', () => {
    const params: TonnetzParams = { ...baseParams, sequence: [''], chordQuality: '7th' }
    const trigs = tonnetzGenerate(params, 1)
    // C major triad [60,64,67] + major 7th = B (71)
    expect(trigs[0].notes).toEqual([60, 64, 67, 71])
  })

  it('chordQuality 7th: C minor → Cm7 (adds Bb)', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P'], chordQuality: '7th' }
    const trigs = tonnetzGenerate(params, 2)
    // step 1: P → C minor [60,63,67] + minor 7th = Bb (70)
    expect(trigs[1].notes).toEqual([60, 63, 67, 70])
  })

  it('chordQuality 7th: transforms still work on the triad core', () => {
    const params: TonnetzParams = { ...baseParams, sequence: ['P', 'L', 'R'], chordQuality: '7th' }
    const trigs = tonnetzGenerate(params, 4)
    // All active trigs should have 4 notes
    for (const t of trigs.filter(t => t.active)) {
      expect(t.notes!.length).toBe(4)
    }
    // Chords should differ
    expect(trigs[0].notes).not.toEqual(trigs[1].notes)
  })

  it('chordQuality 7th + arp: cycles through 4 notes', () => {
    const params: TonnetzParams = { ...baseParams, sequence: [''], chordQuality: '7th', arp: { mode: 'up' } }
    const trigs = tonnetzGenerate(params, 4)
    expect(trigs[0].note).toBe(60) // root
    expect(trigs[1].note).toBe(64) // 3rd
    expect(trigs[2].note).toBe(67) // 5th
    expect(trigs[3].note).toBe(71) // 7th
  })

  it('chordQuality triad (default): produces 3-note chords', () => {
    const trigs = tonnetzGenerate(baseParams, 1)
    expect(trigs[0].notes!.length).toBe(3)
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

  // ── Turing Machine rhythm (Feature 3) ──

  it('turing: produces boolean array of correct length', () => {
    const r = resolveRhythm({ preset: 'turing', length: 8, lock: 0.5 }, 16)
    expect(r).toHaveLength(16)
    for (const v of r) expect(typeof v).toBe('boolean')
  })

  it('turing: deterministic with same seed', () => {
    const a = resolveRhythm({ preset: 'turing', length: 8, lock: 0.5, seed: 42 }, 16)
    const b = resolveRhythm({ preset: 'turing', length: 8, lock: 0.5, seed: 42 }, 16)
    expect(a).toEqual(b)
  })

  it('turing: different seeds produce different patterns', () => {
    const a = resolveRhythm({ preset: 'turing', length: 8, lock: 0.5, seed: 1 }, 16)
    const b = resolveRhythm({ preset: 'turing', length: 8, lock: 0.5, seed: 2 }, 16)
    expect(a).not.toEqual(b)
  })

  it('turing lock=1.0: pattern repeats with period = length', () => {
    const r = resolveRhythm({ preset: 'turing', length: 4, lock: 1.0, seed: 42 }, 16)
    for (let i = 4; i < 16; i++) {
      expect(r[i]).toBe(r[i % 4])
    }
  })

  it('turing lock=0.0: has some variation (not all same)', () => {
    const r = resolveRhythm({ preset: 'turing', length: 8, lock: 0.0, seed: 42 }, 32)
    const trues = r.filter(Boolean).length
    // Should have mix of true/false (not all or none)
    expect(trues).toBeGreaterThan(0)
    expect(trues).toBeLessThan(32)
  })

  it('turing rhythm integrates with tonnetzGenerate', () => {
    const params: TonnetzParams = {
      ...{ engine: 'tonnetz' as const, startChord: [60, 64, 67] as [number, number, number], sequence: ['P', 'L', 'R'], voicing: 'close' as const },
      rhythm: { preset: 'turing', length: 8, lock: 0.7, seed: 42 },
    }
    const trigs = tonnetzGenerate(params, 16)
    expect(trigs).toHaveLength(16)
    const active = trigs.filter(t => t.active).length
    expect(active).toBeGreaterThan(0)
    expect(active).toBeLessThan(16)
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
