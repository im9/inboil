/**
 * Pattern randomization logic — drum patterns, chord progressions, melodic lines.
 * Extracted from state.svelte.ts for modularity.
 */
import {
  SCALE_DEGREES_SET,
  PIANO_ROLL_MIN, PIANO_ROLL_MAX,
} from './constants.ts'
import { DRUM_VOICES } from './factory.ts'
import { song, ui, prefs, pushUndo } from './state.svelte.ts'

// ── Constants ────────────────────────────────────────────────────────

const SCALES = [
  [0, 3, 5, 7, 10],        // minor pentatonic
  [0, 2, 4, 7, 9],         // major pentatonic
  [0, 2, 3, 5, 7, 9, 10],  // dorian
]

const PROGRESSIONS = [
  [0, 4, 5, 3],  // I  - V  - vi - IV  (pop)
  [0, 3, 4, 4],  // I  - IV - V  - V   (rock)
  [5, 3, 0, 4],  // vi - IV - I  - V   (emo/pop)
  [0, 5, 3, 4],  // I  - vi - IV - V   (50s)
  [1, 4, 0, 0],  // ii - V  - I  - I   (jazz turnaround)
  [0, 3, 5, 3],  // I  - IV - vi - IV  (chill)
]

// Diatonic scale intervals (C major)
const DIATONIC = [0, 2, 4, 5, 7, 9, 11]

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a diatonic chord (triad or 7th) from a scale degree root in a given octave */
function buildChord(degree: number, octave: number, seventh: boolean): number[] {
  const notes: number[] = []
  const offsets = seventh ? [0, 2, 4, 6] : [0, 2, 4]
  for (const off of offsets) {
    const deg = (degree + off) % 7
    const octShift = Math.floor((degree + off) / 7)
    const midi = octave * 12 + DIATONIC[deg]
    const n = midi + octShift * 12
    if (n >= PIANO_ROLL_MIN && n <= PIANO_ROLL_MAX) notes.push(n)
  }
  return notes
}

/** Pick a random element from an array */
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// ── Main ─────────────────────────────────────────────────────────────

export function randomizePattern(): void {
  pushUndo('Randomize')
  const roots = [48, 50, 51, 53, 55, 56, 58, 60]
  const root  = pick(roots)
  const scale = pick(SCALES)

  let allNotes: number[] = []
  for (let oct = 0; oct < 3; oct++) {
    for (const interval of scale) {
      const n = root + oct * 12 + interval
      if (n >= PIANO_ROLL_MIN && n <= PIANO_ROLL_MAX) allNotes.push(n)
    }
  }

  if (prefs.scaleMode) {
    allNotes = allNotes
      .map(n => {
        if (SCALE_DEGREES_SET.has(n % 12)) return n
        const up = n + 1 <= PIANO_ROLL_MAX && SCALE_DEGREES_SET.has((n + 1) % 12) ? n + 1 : n + 2
        const down = n - 1 >= PIANO_ROLL_MIN && SCALE_DEGREES_SET.has((n - 1) % 12) ? n - 1 : n - 2
        return (n - down <= up - n) ? down : up
      })
      .filter((n, i, arr) => n >= PIANO_ROLL_MIN && n <= PIANO_ROLL_MAX && arr.indexOf(n) === i)
  }
  const lowNotes  = allNotes.filter(n => n < 60)
  const highNotes = allNotes.filter(n => n >= 60)

  const prog = pick(PROGRESSIONS)
  const useSeventh = Math.random() < 0.3
  const chordOctave = 4

  const currentPat = song.patterns[ui.currentPattern]
  for (const c of currentPat.cells) {
    const steps = c.steps
    const isPoly = (c.voiceId === 'WT' || c.voiceId === 'FM') && (c.voiceParams?.polyMode ?? 0) >= 0.5

    if (c.voiceId && DRUM_VOICES.has(c.voiceId)) {
      for (let s = 0; s < steps; s++) {
        let prob = 0
        const beat = s % 8

        if (c.voiceId === 'Kick') {
          prob = beat === 0 ? 0.92 : beat === 4 ? 0.40 : 0.08
        } else if (c.voiceId === 'Snare') {
          prob = beat === 4 ? 0.88 : beat === 6 ? 0.25 : 0.05
        } else if (c.voiceId === 'Clap') {
          prob = beat === 4 ? 0.70 : 0.03
        } else if (c.voiceId === 'OpenHat') {
          prob = (beat === 2 || beat === 6) ? 0.50 : 0.05
        } else if (c.voiceId === 'Cymbal') {
          prob = beat === 0 ? 0.25 : 0.02
        } else {
          const on8th = s % 2 === 0
          prob = on8th ? 0.82 : (Math.random() > 0.5 ? 0.55 : 0.20)
        }

        const active = Math.random() < prob
        c.trigs[s].active   = active
        c.trigs[s].velocity = 0.55 + Math.random() * 0.45
        c.trigs[s].chance = active && prob < 0.5 ? 0.5 + Math.random() * 0.4 : undefined
      }
    } else if (isPoly) {
      const CHORD_RHYTHMS: [number, number, number][][] = [
        [[0, 0, 0.80]],
        [[0, 2, 0.75], [3, 1, 0.60], [5, 2, 0.70]],
        [[0, 1, 0.85], [2, 1, 0.55], [4, 1, 0.70], [6, 1, 0.50]],
        [[1, 1, 0.70], [3, 1, 0.65], [5, 1, 0.72], [7, 1, 0.60]],
        [[0, 3, 0.80], [3, 2, 0.65], [6, 2, 0.70]],
      ]
      const rhythm = pick(CHORD_RHYTHMS)
      const beatsPerChord = Math.max(1, Math.floor(steps / prog.length))
      for (let s = 0; s < steps; s++) c.trigs[s].active = false
      for (let ci = 0; ci < prog.length; ci++) {
        const base = ci * beatsPerChord
        const degree = prog[ci]
        const chord = buildChord(degree, chordOctave, useSeventh)
        if (chord.length === 0) continue
        for (const [off, dur, vel] of rhythm) {
          const s = base + off
          if (s >= steps) break
          c.trigs[s].active   = true
          c.trigs[s].note     = chord[0]
          c.trigs[s].notes    = chord
          c.trigs[s].velocity = vel + Math.random() * 0.15
          c.trigs[s].duration = dur === 0
            ? Math.min(beatsPerChord, steps - s)
            : Math.min(dur, steps - s)
        }
      }
    } else {
      const isBass = c.voiceId === 'Bass303' || c.voiceId === 'Analog'
      const pool   = isBass
        ? (lowNotes.length  > 0 ? lowNotes  : allNotes)
        : (highNotes.length > 0 ? highNotes : allNotes)

      if (isBass) {
        const beatsPerChord = Math.max(1, Math.floor(steps / prog.length))
        for (let s = 0; s < steps; s++) {
          const chordIdx = Math.min(Math.floor(s / beatsPerChord), prog.length - 1)
          const rootNote = PIANO_ROLL_MIN + DIATONIC[prog[chordIdx]]
          const isDownbeat = s % beatsPerChord === 0
          const active = isDownbeat ? true : Math.random() < 0.25
          c.trigs[s].active   = active
          c.trigs[s].note     = active
            ? (isDownbeat ? rootNote : pick(pool))
            : c.trigs[s].note
          c.trigs[s].velocity = active ? 0.6 + Math.random() * 0.4 : c.trigs[s].velocity
        }
      } else {
        let prevNote = pick(pool)
        const density = 0.27
        for (let s = 0; s < steps; s++) {
          const active = Math.random() < density
          c.trigs[s].active = active
          if (active) {
            if (Math.random() < 0.7 && pool.length > 1) {
              const idx = pool.indexOf(prevNote)
              const nearIdx = idx >= 0
                ? Math.max(0, Math.min(pool.length - 1, idx + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2))))
                : Math.floor(Math.random() * pool.length)
              prevNote = pool[nearIdx]
            } else {
              prevNote = pick(pool)
            }
            c.trigs[s].note     = prevNote
            c.trigs[s].velocity = 0.55 + Math.random() * 0.45
          }
        }
      }
    }
  }
}
