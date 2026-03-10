/**
 * Generative music engines (ADR 078).
 * Pure functions — no state imports. Caller handles undo + pattern writes.
 */

import type { Trig, TuringParams, QuantizerParams } from './state.svelte.ts'

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
