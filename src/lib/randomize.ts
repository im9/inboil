/**
 * Genre-aware pattern randomizer (ADR 129).
 * Uses Tonnetz + Turing Machine + Quantizer pipeline for musically coherent patterns.
 * Legacy "acid" genre preserves original behavior as fallback.
 */
import {
  SCALE_DEGREES_SET,
  PIANO_ROLL_MIN, PIANO_ROLL_MAX,
} from './constants.ts'
import { DRUM_VOICES } from './factory.ts'
import { song, ui, prefs, pushUndo } from './state.svelte.ts'
import {
  turingGenerate, tonnetzGenerate, quantizeTrigs, computeWalkPath,
} from './generative.ts'

// ── Genre Preset Type ───────────────────────────────────────────────

export interface GenrePreset {
  id: string
  label: string
  bpmRange: [number, number]
  tonnetz: {
    startChord: [number, number, number]
    sequence: string[]
    stepsPerTransform: number
    voicing: 'close' | 'spread' | 'drop2'
    chordQuality: 'triad' | '7th'
    rhythms: ('all' | 'legato' | 'offbeat' | 'onbeat' | 'syncopated')[]
  }
  bass: {
    lock: number
    density: number
    octaveRange: [number, number]
    mode: 'root' | 'scale'
  } | null
  melody: {
    lock: number
    density: number
    octaveRange: [number, number]
    quantizeMode: 'chord' | 'scale'
  }
  drums: Record<string, number[]>
  swing?: number
}

// ── Genre Presets ───────────────────────────────────────────────────

//                                            beat:  0     1     2     3     4     5     6     7
export const GENRE_PRESETS: GenrePreset[] = [
  {
    id: 'house',
    label: 'HOUSE',
    bpmRange: [120, 128],
    tonnetz: {
      startChord: [60, 64, 67],   // C major
      sequence: ['P', 'L', 'R'],
      stepsPerTransform: 4,
      voicing: 'spread',
      chordQuality: '7th',
      rhythms: ['offbeat', 'syncopated', 'legato'],
    },
    bass: {
      lock: 0.7,
      density: 0.6,
      octaveRange: [2, 3],        // C1–C2 (oct*12 = MIDI 24–36)
      mode: 'root',
    },
    melody: {
      lock: 0.3,
      density: 0.35,
      octaveRange: [4, 5],
      quantizeMode: 'chord',
    },
    drums: {
      Kick:    [0.95, 0.05, 0.05, 0.05, 0.95, 0.05, 0.05, 0.05],  // 4-on-floor
      Snare:   [0.00, 0.00, 0.00, 0.00, 0.85, 0.00, 0.00, 0.00],
      Clap:    [0.00, 0.00, 0.00, 0.00, 0.75, 0.00, 0.00, 0.00],  // clap on 4
      Hat:     [0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80],  // 8th hats
      OpenHat: [0.00, 0.00, 0.50, 0.00, 0.00, 0.00, 0.50, 0.00],  // offbeat open hats
      Cymbal:  [0.20, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    },
  },
  {
    id: 'techno',
    label: 'TECHNO',
    bpmRange: [128, 140],
    tonnetz: {
      startChord: [60, 64, 67],
      sequence: ['P', ''],
      stepsPerTransform: 8,
      voicing: 'close',
      chordQuality: 'triad',
      rhythms: ['onbeat', 'legato', 'all'],
    },
    bass: {
      lock: 0.9,
      density: 0.7,
      octaveRange: [2, 3],
      mode: 'root',
    },
    melody: {
      lock: 0.5,
      density: 0.2,
      octaveRange: [4, 5],
      quantizeMode: 'scale',
    },
    drums: {
      Kick:    [0.98, 0.05, 0.05, 0.05, 0.98, 0.05, 0.05, 0.05],
      Snare:   [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
      Clap:    [0.00, 0.00, 0.00, 0.00, 0.80, 0.00, 0.00, 0.10],
      Hat:     [0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90],  // 16th hats
      OpenHat: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.20],
      Cymbal:  [0.15, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    },
  },
  {
    id: 'hiphop',
    label: 'HIPHOP',
    bpmRange: [80, 95],
    tonnetz: {
      startChord: [60, 64, 67],
      sequence: ['R', 'P', 'L'],
      stepsPerTransform: 4,
      voicing: 'drop2',
      chordQuality: '7th',
      rhythms: ['syncopated', 'offbeat', 'onbeat'],
    },
    bass: {
      lock: 0.6,
      density: 0.5,
      octaveRange: [2, 3],
      mode: 'scale',
    },
    melody: {
      lock: 0.2,
      density: 0.25,
      octaveRange: [4, 5],
      quantizeMode: 'chord',
    },
    drums: {
      Kick:    [0.92, 0.00, 0.00, 0.30, 0.00, 0.00, 0.85, 0.00],  // boom-bap
      Snare:   [0.00, 0.00, 0.00, 0.00, 0.90, 0.00, 0.00, 0.00],
      Clap:    [0.00, 0.00, 0.00, 0.00, 0.70, 0.00, 0.00, 0.15],
      Hat:     [0.70, 0.50, 0.70, 0.50, 0.70, 0.50, 0.70, 0.50],
      OpenHat: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.30, 0.00],
      Cymbal:  [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    },
    swing: 0.6,
  },
  {
    id: 'ambient',
    label: 'AMBIENT',
    bpmRange: [60, 90],
    tonnetz: {
      startChord: [60, 64, 67],
      sequence: ['L', '', 'P', ''],
      stepsPerTransform: 8,
      voicing: 'spread',
      chordQuality: '7th',
      rhythms: ['legato'],
    },
    bass: null,                    // no bass
    melody: {
      lock: 0.1,
      density: 0.15,
      octaveRange: [4, 6],
      quantizeMode: 'scale',
    },
    drums: {
      Kick:    [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
      Snare:   [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
      Clap:    [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
      Hat:     [0.10, 0.00, 0.05, 0.00, 0.10, 0.00, 0.05, 0.00],
      OpenHat: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
      Cymbal:  [0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    },
  },
  {
    id: 'acid',
    label: 'ACID',
    bpmRange: [130, 145],
    // Tonnetz/bass/melody unused — acid uses legacy path
    tonnetz: {
      startChord: [60, 64, 67],
      sequence: ['P', 'L', 'R'],
      stepsPerTransform: 4,
      voicing: 'close',
      chordQuality: 'triad',
      rhythms: ['all'],
    },
    bass: {
      lock: 0.5,
      density: 0.7,
      octaveRange: [2, 3],
      mode: 'scale',
    },
    melody: {
      lock: 0.3,
      density: 0.27,
      octaveRange: [4, 5],
      quantizeMode: 'scale',
    },
    drums: {
      Kick:    [0.92, 0.08, 0.08, 0.08, 0.40, 0.08, 0.08, 0.08],
      Snare:   [0.05, 0.05, 0.05, 0.05, 0.88, 0.05, 0.25, 0.05],
      Clap:    [0.03, 0.03, 0.03, 0.03, 0.70, 0.03, 0.03, 0.03],
      Hat:     [0.82, 0.40, 0.82, 0.40, 0.82, 0.40, 0.82, 0.40],
      OpenHat: [0.05, 0.05, 0.50, 0.05, 0.05, 0.05, 0.50, 0.05],
      Cymbal:  [0.25, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02],
    },
  },
]

/** Look up a genre preset by id */
export function getGenrePreset(id: string): GenrePreset {
  return GENRE_PRESETS.find(g => g.id === id) ?? GENRE_PRESETS[0]
}

// ── Legacy acid helpers (preserved for backward compat) ─────────────

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

const DIATONIC = [0, 2, 4, 5, 7, 9, 11]

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

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// ── Legacy acid randomizer ──────────────────────────────────────────

function randomizeAcid(): void {
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

// ── Genre-aware generation pipeline ─────────────────────────────────

/** Common starting triads (pitch classes relative to root) */
const START_CHORDS_MAJOR: [number, number, number][] = [
  [0, 4, 7],   // I  (C major)
  [5, 9, 0],   // IV (F major)
  [7, 11, 2],  // V  (G major)
]
const START_CHORDS_MINOR: [number, number, number][] = [
  [0, 3, 7],   // i   (C minor)
  [9, 0, 4],   // vi  (A minor / relative minor)
  [2, 5, 9],   // ii  (D minor)
]

/** Build a randomized startChord in MIDI range, transposed to song root */
function randomStartChord(rootNote: number): [number, number, number] {
  const pool = Math.random() < 0.6 ? START_CHORDS_MAJOR : START_CHORDS_MINOR
  const pcs = pick(pool)
  const base = 60 + (rootNote % 12)
  return [base + pcs[0], base + pcs[1], base + pcs[2]]
}

/** Shuffle an array (Fisher-Yates) and return a new copy */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Apply genre-aware generation to a single pattern */
function randomizeWithGenre(genre: GenrePreset): void {
  const rootNote = song.rootNote ?? 0
  const startChord = randomStartChord(rootNote)

  // Build Tonnetz walk path for harmonic context
  const currentPat = song.patterns[ui.currentPattern]
  // Use the longest track's step count for the walk
  const maxSteps = Math.max(...currentPat.cells.map(c => c.steps), 16)

  // Shuffle transform sequence for variety on each randomize
  const sequence = shuffle(genre.tonnetz.sequence)

  const tonnetzParams = {
    engine: 'tonnetz' as const,
    startChord,
    sequence,
    stepsPerTransform: genre.tonnetz.stepsPerTransform,
    voicing: genre.tonnetz.voicing,
    chordQuality: genre.tonnetz.chordQuality,
  }

  const walkPath = computeWalkPath(tonnetzParams, maxSteps)

  // BPM: only adjust if current BPM is outside genre range
  const [bpmLo, bpmHi] = genre.bpmRange
  if (song.bpm < bpmLo || song.bpm > bpmHi) {
    song.bpm = bpmLo + Math.floor(Math.random() * (bpmHi - bpmLo + 1))
  }

  for (const c of currentPat.cells) {
    const steps = c.steps
    const isPoly = ((c.voiceId === 'WT' || c.voiceId === 'FM') && (c.voiceParams?.polyMode ?? 0) >= 0.5)
      || (c.voiceId === 'Sampler' && !!c.sampleRef?.packId)
    const isBass = c.voiceId === 'Bass303' || c.voiceId === 'Analog'
      || (c.voiceId === 'MoogLead' && c.trigs[0]?.note <= 48)
    const isDrum = c.voiceId != null && DRUM_VOICES.has(c.voiceId)

    if (isDrum) {
      // ── Drums: genre probability table ──
      const table = genre.drums[c.voiceId!]
      for (let s = 0; s < steps; s++) {
        const beat = s % 8
        const prob = table ? table[beat] : 0.1
        const active = Math.random() < prob
        c.trigs[s].active   = active
        c.trigs[s].velocity = 0.55 + Math.random() * 0.45
        c.trigs[s].chance = active && prob < 0.5 ? 0.5 + Math.random() * 0.4 : undefined
      }
    } else if (isPoly) {
      // ── Chords/Pads: Tonnetz chord voicings ──
      const chordRhythm = pick(genre.tonnetz.rhythms)
      const chordTrigs = tonnetzGenerate({
        ...tonnetzParams,
        rhythm: chordRhythm,
      }, steps)
      for (let s = 0; s < steps; s++) {
        const ct = chordTrigs[s]
        c.trigs[s].active   = ct.active
        c.trigs[s].note     = ct.note
        c.trigs[s].notes    = ct.notes
        c.trigs[s].velocity = ct.active ? 0.7 + Math.random() * 0.2 : 0
        c.trigs[s].duration = ct.duration
      }
    } else if (isBass && genre.bass) {
      // ── Bass: Turing rhythm + Quantizer chord-root snap ──
      const bassRhythm = turingGenerate({
        engine: 'turing',
        length: 8,
        lock: genre.bass.lock,
        range: [genre.bass.octaveRange[0] * 12, genre.bass.octaveRange[1] * 12 + 11],
        mode: 'gate',
        density: genre.bass.density,
      }, steps)

      // Generate note content with Turing
      const bassNotes = turingGenerate({
        engine: 'turing',
        length: 8,
        lock: genre.bass.lock,
        range: [genre.bass.octaveRange[0] * 12, genre.bass.octaveRange[1] * 12 + 11],
        mode: 'note',
        density: 1.0,
      }, steps)

      // Merge: rhythm from gate mode, notes from note mode
      for (let s = 0; s < steps; s++) {
        bassNotes[s].active = bassRhythm[s].active
      }

      // Quantize to chord tones (root-priority via chord mode)
      const quantized = quantizeTrigs(bassNotes, {
        engine: 'quantizer',
        scale: 'major',
        root: rootNote % 12,
        octaveRange: genre.bass.octaveRange,
        mode: genre.bass.mode === 'root' ? 'chord' : 'scale',
      }, walkPath.slice(0, steps))

      for (let s = 0; s < steps; s++) {
        c.trigs[s].active   = quantized[s].active
        c.trigs[s].note     = quantized[s].note
        c.trigs[s].velocity = quantized[s].active ? 0.6 + Math.random() * 0.3 : 0
      }
    } else if (isBass && !genre.bass) {
      // Genre has no bass — clear the track
      for (let s = 0; s < steps; s++) {
        c.trigs[s].active = false
      }
    } else {
      // ── Melody: Turing notes + Quantizer scale/chord snap ──
      const melodyTrigs = turingGenerate({
        engine: 'turing',
        length: 8,
        lock: genre.melody.lock,
        range: [genre.melody.octaveRange[0] * 12, genre.melody.octaveRange[1] * 12 + 11],
        mode: 'note',
        density: genre.melody.density,
      }, steps)

      const quantized = quantizeTrigs(melodyTrigs, {
        engine: 'quantizer',
        scale: 'major',
        root: rootNote % 12,
        octaveRange: genre.melody.octaveRange,
        mode: genre.melody.quantizeMode,
      }, walkPath.slice(0, steps))

      for (let s = 0; s < steps; s++) {
        c.trigs[s].active   = quantized[s].active
        c.trigs[s].note     = quantized[s].note
        c.trigs[s].velocity = quantized[s].active ? 0.55 + Math.random() * 0.4 : 0
      }
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────

export function randomizePattern(): void {
  pushUndo('Randomize')
  const genreId = prefs.randomGenre ?? 'house'

  if (genreId === 'acid') {
    randomizeAcid()
    return
  }

  const genre = getGenrePreset(genreId)
  randomizeWithGenre(genre)
}
