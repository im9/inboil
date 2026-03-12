/**
 * Generative music engines (ADR 078).
 * Pure functions — no state imports. Caller handles undo + pattern writes.
 */

import type { Trig, TuringParams, QuantizerParams, TonnetzParams } from './types.ts'

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

/** Parallel transform: flip the third (major ↔ minor) */
function nrP(chord: Triad): Triad {
  const [a, b, c] = chord
  const i1 = b - a, i2 = c - b
  // Major (4,3) → minor (3,4) and vice versa
  if (i1 === 4 && i2 === 3) return [a, a + 3, c]
  if (i1 === 3 && i2 === 4) return [a, a + 4, c]
  return chord // not a triad we recognize
}

/** Leading-tone transform: move root (major) or fifth (minor) */
function nrL(chord: Triad): Triad {
  const [a, b, c] = chord
  const i1 = b - a, i2 = c - b
  if (i1 === 4 && i2 === 3) return [b, c, a + 12]  // major → minor (1st inv context)
  if (i1 === 3 && i2 === 4) return [c - 12, a, b]   // minor → major
  return chord
}

/** Relative transform: move fifth (major) or root (minor) */
function nrR(chord: Triad): Triad {
  const [a, b, c] = chord
  const i1 = b - a, i2 = c - b
  if (i1 === 4 && i2 === 3) return [c - 12, a, b] // C maj → A min (relative minor, shifted down)
  if (i1 === 3 && i2 === 4) return [b, c, a + 12] // A min → C maj
  return chord
}

/** Normalize triad to close voicing within a reasonable range */
function normalizeTriad(chord: Triad): Triad {
  // Sort and compact to close position
  const sorted = [...chord].sort((a, b) => a - b) as Triad
  // Keep within MIDI range and compact intervals
  while (sorted[2] - sorted[0] > 12) {
    sorted[2] -= 12
    sorted.sort((a, b) => a - b)
  }
  // Keep in reasonable range (don't drift too far)
  while (sorted[0] < 36) { sorted[0] += 12; sorted[1] += 12; sorted[2] += 12 }
  while (sorted[0] > 84) { sorted[0] -= 12; sorted[1] -= 12; sorted[2] -= 12 }
  return sorted as Triad
}

/** Apply a named neo-Riemannian operation (single or compound) */
function applyTonnetzOp(chord: Triad, op: string): Triad {
  let result = chord
  for (const ch of op) {
    if (ch === 'P') result = nrP(result)
    else if (ch === 'L') result = nrL(result)
    else if (ch === 'R') result = nrR(result)
  }
  return normalizeTriad(result)
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

/**
 * Generate a chord sequence by walking the Tonnetz lattice.
 * Each step in `sequence` transforms the current chord; each chord is held for `stepsPerChord` steps.
 */
export function tonnetzGenerate(params: TonnetzParams, steps: number): Trig[] {
  const trigs: Trig[] = []
  let chord: Triad = [...params.startChord] as Triad
  const seq = params.sequence
  let seqIdx = 0
  const spc = params.stepsPerChord

  for (let step = 0; step < steps; step++) {
    const isNewChord = step % spc === 0

    // Apply next transform at each new chord boundary (skip first chord)
    if (isNewChord && step > 0) {
      const op = seq[seqIdx % seq.length]
      chord = applyTonnetzOp(chord, op)
      seqIdx++
    }

    if (isNewChord) {
      // Legato: one trig per chord, duration spans until next chord or end
      const remaining = steps - step
      const dur = Math.min(spc, remaining)
      const voiced = applyVoicing(chord, params.voicing)
      trigs.push({
        active: true,
        note: voiced[0],
        notes: voiced,
        velocity: 0.9,
        duration: dur,
        slide: false,
      })
    } else {
      // Inactive steps within a chord — no retrigger
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
  // Tonnetz presets
  { name: 'Classic P·L·R', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [60, 64, 67], sequence: ['P', 'L', 'R'], stepsPerChord: 4, voicing: 'close' } },
  { name: 'Cinematic', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [48, 52, 55], sequence: ['L', 'P', 'R', 'L'], stepsPerChord: 8, voicing: 'spread' } },
  { name: 'Jazz Tonnetz', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [60, 64, 67], sequence: ['PL', 'R', 'L', 'PR'], stepsPerChord: 4, voicing: 'drop2' } },
  { name: 'Minimal Shift', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [60, 64, 67], sequence: ['P'], stepsPerChord: 8, voicing: 'close' } },
  { name: 'Dark Chords', engine: 'tonnetz', params: { engine: 'tonnetz', startChord: [48, 51, 55], sequence: ['R', 'L', 'P'], stepsPerChord: 4, voicing: 'spread' } },
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
