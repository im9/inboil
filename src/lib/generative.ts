/**
 * Generative music engines (ADR 078).
 * Pure functions — no state imports. Caller handles undo + pattern writes.
 */

import type { Trig, TuringParams, QuantizerParams, TonnetzParams, TonnetzRhythm } from './types.ts'

// ── Turing Machine (shift-register random) ──

/** Internal shift register state */
export interface TuringState {
  register: number[]   // 0 or 1 per bit
  position: number     // current read head
}

/** Create a fresh shift register, optionally seeded */
export function initTuringRegister(length: number, seed?: number): TuringState {
  const rng = seed != null ? seededRng(seed) : Math.random
  const register = Array.from({ length }, () => rng() < 0.5 ? 1 : 0)
  return { register, position: 0 }
}

/**
 * Run the Turing Machine for `steps` iterations and return generated trigs.
 * Each step: read current bit → decide note/gate/velocity → shift with flip probability.
 */
export function turingGenerate(
  params: TuringParams,
  steps: number,
  seed?: number,
): Trig[] {
  const rng = seed != null ? seededRng(seed) : Math.random
  const len = params.length
  const register = Array.from({ length: len }, () => rng() < 0.5 ? 1 : 0)
  const [lo, hi] = params.range
  const trigs: Trig[] = []

  for (let step = 0; step < steps; step++) {
    // Read register as a value (interpret bits as fraction of range)
    const regValue = registerToFraction(register, len)

    // Decide if step is active
    const isActive = params.mode === 'gate'
      ? rng() < params.density
      : regValue > (1 - params.density) * 0.5  // higher density = more notes

    const trig: Trig = {
      active: isActive,
      note: Math.round(lo + regValue * (hi - lo)),
      velocity: params.mode === 'velocity'
        ? 0.3 + regValue * 0.7  // 0.3–1.0 range
        : 0.8,
      duration: 1,
      slide: false,
    }

    // In gate mode, note stays constant (use middle of range)
    if (params.mode === 'gate') {
      trig.note = Math.round((lo + hi) / 2)
    }

    // In velocity mode, always active but velocity varies
    if (params.mode === 'velocity') {
      trig.active = rng() < params.density
    }

    trigs.push(trig)

    // Shift register: last bit is flipped with probability (1 - lock)
    const flipProb = 1 - params.lock
    const lastBit = register[len - 1]
    // Shift right
    for (let i = len - 1; i > 0; i--) {
      register[i] = register[i - 1]
    }
    // New bit: either keep the old last bit or flip it
    register[0] = (rng() < flipProb ? (1 - lastBit) : lastBit) as 0 | 1
  }

  return trigs
}

/** Convert register bits to a 0–1 fraction */
function registerToFraction(register: number[], length: number): number {
  let sum = 0
  for (let i = 0; i < length; i++) {
    sum += register[i] * (1 << i)
  }
  return sum / ((1 << length) - 1 || 1)
}

// ── Arpeggiator helper ──

/** Pick next note from chord based on arp mode. Mutates arpIdx in-place. */
function arpNext(notes: number[], mode: 'up' | 'down' | 'updown' | 'random', arpState: { idx: number; dir: 1 | -1 }, rng: () => number): number {
  const n = notes.length
  if (mode === 'random') return notes[Math.floor(rng() * n)]
  const note = notes[arpState.idx]
  if (mode === 'up') {
    arpState.idx = (arpState.idx + 1) % n
  } else if (mode === 'down') {
    arpState.idx = (arpState.idx - 1 + n) % n
  } else {
    // updown: bounce without repeating endpoints
    arpState.idx += arpState.dir
    if (arpState.idx >= n - 1) { arpState.idx = n - 1; arpState.dir = -1 }
    if (arpState.idx <= 0) { arpState.idx = 0; arpState.dir = 1 }
  }
  return note
}

// ── Quantizer (scale-constrained note mapping) ──

/** Scale interval definitions (semitones from root) */
export const SCALE_MAP: Record<string, number[]> = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian:    [0, 1, 3, 5, 6, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  'minor-pent': [0, 3, 5, 7, 10],
  blues:      [0, 3, 5, 6, 7, 10],
  harmonic:   [0, 2, 3, 5, 7, 8, 11],
  melodic:    [0, 2, 3, 5, 7, 9, 11],
  whole:      [0, 2, 4, 6, 8, 10],
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

/** All available scale names (for UI dropdowns) */
export const SCALE_NAMES = Object.keys(SCALE_MAP)

/** Build the set of all valid MIDI notes for a scale + root + octave range */
function buildScaleNotes(root: number, scale: number[], octLo: number, octHi: number): number[] {
  const notes: number[] = []
  for (let oct = octLo; oct <= octHi; oct++) {
    for (const interval of scale) {
      const midi = oct * 12 + root + interval
      if (midi >= 0 && midi <= 127) notes.push(midi)
    }
  }
  return notes
}

/** Snap a MIDI note to the nearest note in a sorted list */
function snapToNearest(note: number, scaleNotes: number[]): number {
  if (scaleNotes.length === 0) return note
  let best = scaleNotes[0]
  let bestDist = Math.abs(note - best)
  for (let i = 1; i < scaleNotes.length; i++) {
    const d = Math.abs(note - scaleNotes[i])
    if (d < bestDist) { best = scaleNotes[i]; bestDist = d }
    if (scaleNotes[i] > note) break // sorted, no need to continue
  }
  return best
}

/** Quantize an array of trigs: snap notes to the nearest scale degree */
export function quantizeTrigs(trigs: Trig[], params: QuantizerParams): Trig[] {
  const intervals = SCALE_MAP[params.scale] ?? SCALE_MAP.major
  const [octLo, octHi] = params.octaveRange
  const scaleNotes = buildScaleNotes(params.root, intervals, octLo, octHi)
  if (scaleNotes.length === 0) return trigs

  return trigs.map(t => {
    if (!t.active) return { ...t }
    const snapped = snapToNearest(t.note, scaleNotes)
    const result: Trig = { ...t, note: snapped }
    // Also quantize poly notes if present
    if (t.notes) {
      result.notes = t.notes.map(n => snapToNearest(n, scaleNotes))
    }
    return result
  })
}

// ── Tonnetz (neo-Riemannian chord transforms) ──

type Triad = [number, number, number]

/** Identify root pitch class and quality of a triad (works in any inversion) */
function identifyTriad(chord: Triad): { rootPc: number; minor: boolean } {
  const pcs = chord.map(n => ((n % 12) + 12) % 12)
  for (const pc of pcs) {
    const ints = pcs.map(p => ((p - pc) % 12 + 12) % 12).sort((a, b) => a - b)
    if (ints[1] === 4 && ints[2] === 7) return { rootPc: pc, minor: false }
    if (ints[1] === 3 && ints[2] === 7) return { rootPc: pc, minor: true }
  }
  return { rootPc: ((chord[0] % 12) + 12) % 12, minor: false }
}

/** Build a root-position triad near a reference pitch */
function buildFromPc(rootPc: number, minor: boolean, refRoot: number): Triad {
  let root = Math.floor(refRoot / 12) * 12 + rootPc
  // Choose octave closest to reference
  if (root - refRoot > 6) root -= 12
  if (refRoot - root > 6) root += 12
  // Clamp to reasonable MIDI range
  while (root < 36) root += 12
  while (root > 84) root -= 12
  return [root, root + (minor ? 3 : 4), root + 7]
}

/**
 * Parallel transform: flip major ↔ minor (same root)
 * C major → C minor, C minor → C major
 */
function nrP(chord: Triad): Triad {
  const { rootPc, minor } = identifyTriad(chord)
  return buildFromPc(rootPc, !minor, chord[0])
}

/**
 * Leading-tone exchange: move the note outside the minor 3rd by semitone
 * Major root r → minor root (r+4)  [C major → E minor]
 * Minor root r → major root (r+8)  [E minor → C major]
 */
function nrL(chord: Triad): Triad {
  const { rootPc, minor } = identifyTriad(chord)
  const newRootPc = minor ? (rootPc + 8) % 12 : (rootPc + 4) % 12
  return buildFromPc(newRootPc, !minor, chord[0])
}

/**
 * Relative transform: move the note outside the major 3rd by whole tone
 * Major root r → minor root (r+9)  [C major → A minor]
 * Minor root r → major root (r+3)  [A minor → C major]
 */
function nrR(chord: Triad): Triad {
  const { rootPc, minor } = identifyTriad(chord)
  const newRootPc = minor ? (rootPc + 3) % 12 : (rootPc + 9) % 12
  return buildFromPc(newRootPc, !minor, chord[0])
}

/** Apply a named neo-Riemannian operation (single or compound) */
export function applyTonnetzOp(chord: Triad, op: string): Triad {
  let result = chord
  for (const ch of op) {
    if (ch === 'P') result = nrP(result)
    else if (ch === 'L') result = nrL(result)
    else if (ch === 'R') result = nrR(result)
  }
  return result
}

/** Apply voicing to a triad */
function applyVoicing(chord: Triad, voicing: TonnetzParams['voicing']): number[] {
  const [a, b, c] = chord
  switch (voicing) {
    case 'close': return [a, b, c]
    case 'spread': return [a, b + 12, c] // spread middle voice up an octave
    case 'drop2': return [a, c, b + 12]  // drop 2nd voice down, move to top
  }
}

/** Add 7th to a voiced chord. Major triad → maj7, minor triad → min7. */
function addSeventh(voiced: number[], triad: Triad): number[] {
  const isMajor = (triad[1] - triad[0] + 12) % 12 === 4
  const seventh = triad[0] + (isMajor ? 11 : 10)
  return [...voiced, seventh]
}

/** Bjorklund algorithm for euclidean rhythm distribution */
function bjorklund(hits: number, steps: number): boolean[] {
  if (hits >= steps) return Array(steps).fill(true)
  if (hits <= 0) return Array(steps).fill(false)
  let pattern: number[][] = []
  for (let i = 0; i < steps; i++) pattern.push(i < hits ? [1] : [0])
  let k = hits
  let m = steps - hits
  while (m > 1) {
    const take = Math.min(k, m)
    for (let i = 0; i < take; i++) {
      pattern[i] = pattern[i].concat(pattern[pattern.length - 1])
      pattern.pop()
    }
    m = m > k ? m - k : k - take
    k = take
    if (pattern.length <= k) break
  }
  return pattern.flat().map(v => v === 1)
}

/** Resolve a rhythm spec to a boolean array of the given length (ADR 126 v2) */
export function resolveRhythm(rhythm: TonnetzRhythm, steps: number): boolean[] {
  if (Array.isArray(rhythm)) {
    if (rhythm.length >= steps) return rhythm.slice(0, steps)
    return [...rhythm, ...Array(steps - rhythm.length).fill(false)]
  }
  if (rhythm === 'all') return Array(steps).fill(true)
  if (rhythm === 'legato') {
    // Handled specially in tonnetzGenerate — return all-true here as fallback
    return Array(steps).fill(true)
  }
  if (rhythm === 'offbeat') return Array.from({ length: steps }, (_, i) => i % 2 === 1)
  if (rhythm === 'onbeat') return Array.from({ length: steps }, (_, i) => i % 4 === 0)
  if (rhythm === 'syncopated') {
    const pat = [true, false, true, false, false, true, false, true]
    return Array.from({ length: steps }, (_, i) => pat[i % pat.length])
  }
  if (rhythm.preset === 'turing') return turingRhythm(rhythm.length, rhythm.lock, steps, rhythm.seed)
  return bjorklund(rhythm.hits, steps)
}

/** Generate a stochastic rhythm pattern using a Turing Machine shift register */
function turingRhythm(length: number, lock: number, steps: number, seed?: number): boolean[] {
  const rng = seed != null ? seededRng(seed) : Math.random
  const register = Array.from({ length }, () => rng() < 0.5 ? 1 : 0)
  const result: boolean[] = []
  for (let i = 0; i < steps; i++) {
    const frac = registerToFraction(register, length)
    result.push(frac >= 0.5)
    // Shift register
    const flipProb = 1 - lock
    const lastBit = register[length - 1]
    for (let j = length - 1; j > 0; j--) register[j] = register[j - 1]
    register[0] = (rng() < flipProb ? (1 - lastBit) : lastBit) as 0 | 1
  }
  return result
}

/**
 * Generate a chord sequence by walking the Tonnetz lattice.
 * ADR 126 v2: transforms applied every `stepsPerTransform` steps.
 * stepsPerTransform=1 → O&C style (chord changes every step).
 * stepsPerTransform=4 → classic pad style (chord held for 4 steps).
 */
export function tonnetzGenerate(params: TonnetzParams, steps: number): Trig[] {
  const trigs: Trig[] = []
  const seq = params.sequence
  const spt = params.stepsPerTransform ?? 1
  let chord: Triad = [...params.startChord] as Triad
  const isLegato = params.rhythm === 'legato'
  const rhythm = resolveRhythm(params.rhythm ?? 'all', steps)
  const arp = params.arp

  // Arp state: resets when chord changes
  const arpState = { idx: arp?.mode === 'down' ? 2 : 0, dir: 1 as 1 | -1 }
  const arpRng = arp?.seed != null ? seededRng(arp.seed) : Math.random

  // Build anchor lookup
  const anchorMap = new Map<number, Triad>()
  if (params.anchors) {
    for (const a of params.anchors) {
      anchorMap.set(a.step, [...a.chord] as Triad)
    }
  }

  let seqIdx = 0
  let prevChordKey = ''
  for (let step = 0; step < steps; step++) {
    // Check for anchor reset
    if (anchorMap.has(step)) {
      chord = anchorMap.get(step)!
    } else if (step > 0 && step % spt === 0) {
      // Apply next transform at each stepsPerTransform boundary
      const op = seq[seqIdx % seq.length]
      if (op) chord = applyTonnetzOp(chord, op)
      seqIdx++
    }

    let voiced = applyVoicing(chord, params.voicing)
    if (params.chordQuality === '7th') voiced = addSeventh(voiced, chord)
    const isChordBoundary = step % spt === 0

    // Reset arp when chord changes
    if (arp) {
      const chordKey = voiced.join(',')
      if (chordKey !== prevChordKey) {
        arpState.idx = arp.mode === 'down' ? voiced.length - 1 : 0
        arpState.dir = 1
        prevChordKey = chordKey
      }
    }

    if (isLegato) {
      // Legato: active only at chord boundaries, held for stepsPerTransform
      if (isChordBoundary) {
        const dur = Math.min(spt, steps - step)
        trigs.push({ active: true, note: voiced[0], notes: voiced, velocity: 0.9, duration: dur, slide: false })
      } else {
        trigs.push({ active: false, note: 0, velocity: 0, duration: 1, slide: false })
      }
    } else if (rhythm[step]) {
      if (arp) {
        const note = arpNext(voiced, arp.mode, arpState, arpRng)
        trigs.push({ active: true, note, velocity: 0.9, duration: 1, slide: false })
      } else {
        trigs.push({ active: true, note: voiced[0], notes: voiced, velocity: 0.9, duration: 1, slide: false })
      }
    } else {
      trigs.push({ active: false, note: 0, velocity: 0, duration: 1, slide: false })
    }
  }

  return trigs
}

// ── Factory Presets (ADR 078 Phase 4) ──

export interface GenerativePreset {
  name: string
  engine: string
  params: Record<string, unknown>
}

export const GENERATIVE_PRESETS: GenerativePreset[] = [
  // Turing Machine presets
  { name: 'Evolving Melody', engine: 'turing', params: { engine: 'turing', length: 8, lock: 0.6, range: [48, 72], mode: 'note', density: 0.8 } },
  { name: 'Locked Loop', engine: 'turing', params: { engine: 'turing', length: 8, lock: 1.0, range: [48, 72], mode: 'note', density: 0.9 } },
  { name: 'Random Gate', engine: 'turing', params: { engine: 'turing', length: 16, lock: 0.3, range: [48, 72], mode: 'gate', density: 0.5 } },
  { name: 'Hi-Hat Pattern', engine: 'turing', params: { engine: 'turing', length: 16, lock: 0.7, range: [60, 60], mode: 'gate', density: 0.6 } },
  { name: 'Velocity Drift', engine: 'turing', params: { engine: 'turing', length: 8, lock: 0.5, range: [48, 72], mode: 'velocity', density: 0.7 } },
  { name: 'Ambient Random', engine: 'turing', params: { engine: 'turing', length: 16, lock: 0.4, range: [36, 84], mode: 'note', density: 0.4 } },
  { name: 'Bass Drift', engine: 'turing', params: { engine: 'turing', length: 4, lock: 0.7, range: [36, 48], mode: 'note', density: 0.9 } },
  // Quantizer presets
  { name: 'C Minor Pent', engine: 'quantizer', params: { engine: 'quantizer', scale: 'minor-pent', root: 0, octaveRange: [3, 5] } },
  { name: 'D Dorian', engine: 'quantizer', params: { engine: 'quantizer', scale: 'dorian', root: 2, octaveRange: [3, 5] } },
  { name: 'A Blues', engine: 'quantizer', params: { engine: 'quantizer', scale: 'blues', root: 9, octaveRange: [3, 5] } },
  { name: 'Whole Tone', engine: 'quantizer', params: { engine: 'quantizer', scale: 'whole', root: 0, octaveRange: [3, 6] } },
  { name: 'Pentatonic Wide', engine: 'quantizer', params: { engine: 'quantizer', scale: 'pentatonic', root: 0, octaveRange: [2, 6] } },
  // Tonnetz presets (ADR 126 v2: per-step transforms)
  { name: 'Classic P·L·R', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [60, 64, 67], sequence: ['P', 'L', 'R'], voicing: 'close' } },
  { name: 'Cinematic', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [48, 52, 55], sequence: ['L', 'P', 'R', 'L'], voicing: 'spread' } },
  { name: 'Jazz Drift', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [60, 64, 67], sequence: ['PL', 'R', 'L', 'PR'], voicing: 'drop2' } },
  { name: 'Minimal P', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [60, 64, 67], sequence: ['P'], voicing: 'close' } },
  { name: 'Dark Walk', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [48, 51, 55], sequence: ['R', 'L', 'P'], voicing: 'spread' } },
  // Tonnetz with anchors (chord progressions)
  { name: 'House Stabs', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [60, 64, 67], sequence: [''], rhythm: 'offbeat', voicing: 'close',
    anchors: [{ step: 0, chord: [60, 64, 67] }, { step: 16, chord: [55, 60, 64] }, { step: 32, chord: [57, 60, 64] }, { step: 48, chord: [53, 57, 60] }],
  } },
  { name: 'Pad Progression', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [60, 64, 67], sequence: [''], voicing: 'spread',
    anchors: [{ step: 0, chord: [60, 64, 67] }, { step: 32, chord: [53, 57, 60] }, { step: 48, chord: [55, 59, 62] }],
  } },
  { name: 'Walk & Reset', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [60, 64, 67], sequence: ['P', 'L', 'R'], voicing: 'spread',
    anchors: [{ step: 32, chord: [60, 64, 67] }],
  } },
]

// ── Seeded PRNG (simple mulberry32) ──

function seededRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
