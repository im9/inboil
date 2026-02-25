// Mock state — no WASM, JS clock only
import { defaultVoiceParams } from './paramDefs.ts'

export type SynthType = 'DrumSynth' | 'NoiseSynth' | 'AnalogSynth' | 'FMSynth' | 'Sampler' | 'ChordSynth'

const DRUM_SYNTHS: SynthType[] = ['DrumSynth', 'NoiseSynth']

export interface Trig {
  active: boolean
  note: number      // MIDI note (60 = C4) — used by melodic tracks
  velocity: number  // 0.0–1.0
}

export interface Track {
  id: number
  name: string
  synthType: SynthType
  steps: number        // 1–64
  trigs: Trig[]        // length === steps; index 0 = step 1
  muted: boolean
  volume: number
  pan: number
  bottomPanel: 'params' | 'piano'  // melodic tracks only
  reverbSend: number   // 0.0–1.0
  delaySend: number    // 0.0–1.0
  glitchSend: number   // 0.0–1.0
  granularSend: number // 0.0–1.0
  voiceParams: Record<string, number>  // per-voice tunable parameters
}

export interface Effects {
  reverb: { size: number; damp: number }
  delay:  { time: number; feedback: number }  // time = beat fraction (0.75 = dotted 8th)
  ducker: { depth: number; release: number }  // depth 0-1, release ms
  comp:   { threshold: number; ratio: number; makeup: number }
}

export interface Pattern {
  id: number
  name: string
  bpm: number
  tracks: Track[]
}

// ── helpers ─────────────────────────────────────────────────────────

function makeTrig(active: boolean, note = 60): Trig {
  return { active, note, velocity: 0.8 }
}

function makeTrigs(steps: number, activeSteps: number[], note = 60): Trig[] {
  return Array.from({ length: steps }, (_, i) => makeTrig(activeSteps.includes(i + 1), note))
}

function makeTrack(
  id: number,
  name: string,
  synthType: SynthType,
  activeSteps: number[],
  note = 60,
): Track {
  const drum = DRUM_SYNTHS.includes(synthType)
  return {
    id, name, synthType,
    steps: 16,
    trigs: makeTrigs(16, activeSteps, note),
    muted: false,
    volume: 0.8,
    pan: 0,
    bottomPanel: drum ? 'params' : 'piano' as 'params' | 'piano',
    reverbSend:  drum ? 0.08 : 0.25,
    delaySend:   drum ? 0.00 : 0.12,
    glitchSend:  0,
    granularSend: 0,
    voiceParams: defaultVoiceParams(id, synthType),
  }
}

// ── Track layout defaults ────────────────────────────────────────────

const TRACK_DEFAULTS: { name: string; synthType: SynthType; note: number; pan: number }[] = [
  { name: 'KICK',  synthType: 'DrumSynth',  note: 60, pan:  0.00 },
  { name: 'SNARE', synthType: 'DrumSynth',  note: 60, pan: -0.10 },
  { name: 'CLAP',  synthType: 'DrumSynth',  note: 60, pan:  0.15 },
  { name: 'C.HH',  synthType: 'NoiseSynth', note: 60, pan: -0.30 },
  { name: 'O.HH',  synthType: 'NoiseSynth', note: 60, pan:  0.35 },
  { name: 'CYM',   synthType: 'NoiseSynth', note: 60, pan:  0.25 },
  { name: 'BASS',  synthType: 'AnalogSynth', note: 48, pan:  0.00 },
  { name: 'LEAD',  synthType: 'AnalogSynth', note: 64, pan:  0.10 },
]

function makeEmptyPattern(id: number): Pattern {
  return {
    id,
    name: `PAT ${String(id).padStart(2, '0')}`,
    bpm: 120,
    tracks: TRACK_DEFAULTS.map((d, i) => ({
      ...makeTrack(i, d.name, d.synthType, [], d.note),
      pan: d.pan,
    })),
  }
}

function makeDemoPattern(): Pattern {
  return {
    id: 1,
    name: 'PAT 01',
    bpm: 120,
    tracks: [
      { ...makeTrack(0, 'KICK',  'DrumSynth',   [1, 5, 9, 13]),                 pan:  0.00 },
      { ...makeTrack(1, 'SNARE', 'DrumSynth',   [5, 13]),                       pan: -0.10 },
      { ...makeTrack(2, 'CLAP',  'DrumSynth',   [5, 13]),                       pan:  0.15 },
      { ...makeTrack(3, 'C.HH',  'NoiseSynth',  [1, 3, 5, 7, 9, 11, 13, 15]),  pan: -0.30 },
      { ...makeTrack(4, 'O.HH',  'NoiseSynth',  [3, 11]),                       pan:  0.35 },
      { ...makeTrack(5, 'CYM',   'NoiseSynth',  [1]),                           pan:  0.25 },
      { ...makeTrack(6, 'BASS',  'AnalogSynth', [1, 3, 7, 11], 48),            pan:  0.00 },
      { ...makeTrack(7, 'LEAD',  'AnalogSynth', [2, 6, 10],    64),            pan:  0.10 },
    ],
  }
}

export const PATTERN_COUNT = 8

// ── Reactive state ───────────────────────────────────────────────────

export const pattern = $state<Pattern>(makeDemoPattern())

// Pattern bank: slot 0 = demo, slots 1–7 = empty
const patternBank: Pattern[] = [
  makeDemoPattern(),
  ...Array.from({ length: 7 }, (_, i) => makeEmptyPattern(i + 2)),
]

function saveToBank(): void {
  patternBank[pattern.id - 1] = {
    id: pattern.id,
    name: pattern.name,
    bpm: pattern.bpm,
    tracks: pattern.tracks.map(t => ({
      id: t.id, name: t.name, synthType: t.synthType,
      steps: t.steps, muted: t.muted, volume: t.volume,
      pan: t.pan, bottomPanel: t.bottomPanel,
      reverbSend: t.reverbSend, delaySend: t.delaySend,
      glitchSend: t.glitchSend, granularSend: t.granularSend,
      voiceParams: { ...t.voiceParams },
      trigs: t.trigs.map(tr => ({ active: tr.active, note: tr.note, velocity: tr.velocity })),
    })),
  }
}

function loadFromBank(idx: number): void {
  const src = patternBank[idx]
  pattern.id = src.id
  pattern.name = src.name
  pattern.bpm = src.bpm
  pattern.tracks = src.tracks.map(t => ({
    ...t,
    trigs: t.trigs.map(tr => ({ ...tr })),
    voiceParams: { ...t.voiceParams },
  }))
}

export const patternNav = $state({ pendingId: 0 })

export function switchPattern(id: number): void {
  if (id < 1 || id > PATTERN_COUNT) return
  if (id === pattern.id) { patternNav.pendingId = 0; return }
  if (playback.playing) {
    patternNav.pendingId = id
  } else {
    saveToBank()
    loadFromBank(id - 1)
  }
}

/** Called from onStep when track 0 wraps to step 0 */
export function applyPendingSwitch(): void {
  if (patternNav.pendingId > 0) {
    const id = patternNav.pendingId
    patternNav.pendingId = 0
    saveToBank()
    loadFromBank(id - 1)
  }
}

/** Called on stop — apply any pending switch immediately */
export function clearPendingSwitch(): void {
  if (patternNav.pendingId > 0) {
    const id = patternNav.pendingId
    patternNav.pendingId = 0
    saveToBank()
    loadFromBank(id - 1)
  }
}

export const playback = $state({
  playing: false,
  playheads: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
})

export const ui = $state({
  selectedTrack: 0,
  view: 'grid' as 'grid' | 'fx',
})

export const perf = $state({
  rootNote: 0,           // 0-11 chromatic key (0=C, 2=D, …) — OP-XY Brain style
  octave: 0,             // -2 to +2 octave shift for melodic tracks
  eqLow:  0.5,           // 0.0 = kill, 0.5 = unity, 1.0 = boost (×2)
  eqMid:  0.5,
  eqHigh: 0.5,
  breaking: false,       // true = rhythmic gate at 8th-note rate
  masterGain: 0.8,       // 0.0–1.0 master volume (×0.8 headroom in worklet)
  filling: false,        // drum fill mode (random snare rolls)
  reversing: false,      // reverse step playback
})

export const fxPad = $state({
  verb:   { on: false, x: 0.25, y: 0.65 },  // x=size, y=damp — left-upper: short bright room
  delay:  { on: false, x: 0.70, y: 0.40 },  // x=time, y=feedback — right-mid: longer delay
  glitch:   { on: false, x: 0.45, y: 0.15 },  // x=rate, y=crush — center-low: subtle
  granular: { on: false, x: 0.50, y: 0.30 },  // x=grain size, y=density
})

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const effects = $state<Effects>({
  reverb: { size: 0.72, damp: 0.5 },
  delay:  { time: 0.75, feedback: 0.42 },  // 0.75 = dotted 8th (beat fraction)
  ducker: { depth: 0.85, release: 120 },  // hyperpop-style aggressive duck
  comp:   { threshold: 0.30, ratio: 6, makeup: 2.2 },
})

// ── Actions ─────────────────────────────────────────────────────────

export function toggleTrig(trackId: number, stepIndex: number) {
  pattern.tracks[trackId].trigs[stepIndex].active =
    !pattern.tracks[trackId].trigs[stepIndex].active
}

/** For piano roll: click cell sets note + activates; click same note deactivates */
export function setTrigNote(trackId: number, stepIndex: number, note: number) {
  const trig = pattern.tracks[trackId].trigs[stepIndex]
  if (trig.active && trig.note === note) {
    trig.active = false
  } else {
    trig.active = true
    trig.note = note
  }
}

export function toggleMute(trackId: number) {
  pattern.tracks[trackId].muted = !pattern.tracks[trackId].muted
}

export function isDrum(track: Track): boolean {
  return DRUM_SYNTHS.includes(track.synthType)
}

export function setTrackSend(trackId: number, send: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend', v: number) {
  pattern.tracks[trackId][send] = Math.min(1, Math.max(0, v))
}

export function setVoiceParam(trackId: number, key: string, value: number) {
  pattern.tracks[trackId].voiceParams[key] = value
}

export function toggleBottomPanel(trackId: number) {
  const track = pattern.tracks[trackId]
  if (!isDrum(track)) {
    track.bottomPanel = track.bottomPanel === 'params' ? 'piano' : 'params'
  }
}

// ── Randomize ────────────────────────────────────────────────────────

// Scale intervals (semitones from root)
const SCALES = [
  [0, 3, 5, 7, 10],        // minor pentatonic
  [0, 2, 4, 7, 9],         // major pentatonic
  [0, 2, 3, 5, 7, 9, 10],  // dorian
]

export function randomizePattern(): void {
  // Pick a random root in the piano-roll range (C3=48 .. C4=60)
  const roots = [48, 50, 51, 53, 55, 56, 58, 60]
  const root  = roots[Math.floor(Math.random() * roots.length)]
  const scale = SCALES[Math.floor(Math.random() * SCALES.length)]

  // Build note pool spanning the full piano-roll range (48–71)
  const allNotes: number[] = []
  for (let oct = 0; oct < 3; oct++) {
    for (const interval of scale) {
      const n = root + oct * 12 + interval
      if (n >= 48 && n <= 71) allNotes.push(n)
    }
  }
  const lowNotes  = allNotes.filter(n => n < 60)
  const highNotes = allNotes.filter(n => n >= 60)

  for (let t = 0; t < pattern.tracks.length; t++) {
    const track = pattern.tracks[t]
    const steps = track.steps

    if (isDrum(track)) {
      // Probability profile per drum track name
      for (let s = 0; s < steps; s++) {
        let prob = 0
        const beat = s % 8  // position within 8-step group

        if (track.name === 'KICK') {
          prob = beat === 0 ? 0.92 : beat === 4 ? 0.40 : 0.08
        } else if (track.name === 'SNARE') {
          prob = beat === 4 ? 0.88 : beat === 6 ? 0.25 : 0.05
        } else if (track.name === 'CLAP') {
          prob = beat === 4 ? 0.70 : 0.03
        } else if (track.name === 'O.HH') {
          // Open hat on offbeats, sparse
          prob = (beat === 2 || beat === 6) ? 0.50 : 0.05
        } else if (track.name === 'CYM') {
          // Cymbal crash: very sparse
          prob = beat === 0 ? 0.25 : 0.02
        } else {
          // C.HH or other: 8th-note grid with swing variation
          const on8th = s % 2 === 0
          prob = on8th ? 0.82 : (Math.random() > 0.5 ? 0.55 : 0.20)
        }

        track.trigs[s].active   = Math.random() < prob
        track.trigs[s].velocity = 0.55 + Math.random() * 0.45
      }
    } else {
      // Melodic: scale-quantized notes, ~30% density
      const pool    = track.name === 'BASS'
        ? (lowNotes.length  > 0 ? lowNotes  : allNotes)
        : (highNotes.length > 0 ? highNotes : allNotes)
      const density = track.name === 'BASS' ? 0.30 : 0.27

      for (let s = 0; s < steps; s++) {
        const active = Math.random() < density
        track.trigs[s].active   = active
        track.trigs[s].note     = active
          ? pool[Math.floor(Math.random() * pool.length)]
          : track.trigs[s].note
        track.trigs[s].velocity = active ? 0.55 + Math.random() * 0.45 : track.trigs[s].velocity
      }
    }
  }
}
