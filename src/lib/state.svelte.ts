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
  steps = 16,
): Track {
  const drum = DRUM_SYNTHS.includes(synthType)
  return {
    id, name, synthType,
    steps,
    trigs: makeTrigs(steps, activeSteps, note),
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
    name: 'INIT',
    bpm: 120,
    tracks: TRACK_DEFAULTS.map((d, i) => ({
      ...makeTrack(i, d.name, d.synthType, [], d.note),
      pan: d.pan,
    })),
  }
}

// ── Factory pattern definitions ──────────────────────────────────────
// Display 00–09 (internal ID 1–10)

type FactoryDef = {
  name: string; bpm: number; steps?: number  // default 16 (global)
  kick: number[]; snare: number[]; clap: number[]; chh: number[]
  ohh: number[]; cym: number[]; bass: [number[], number]; lead: [number[], number]
  vp?: Record<number, Record<string, number>>  // track index → voice param overrides
  ts?: Record<number, number>                  // track index → per-track step count override
  mel?: Record<number, number[]>               // track index → per-active-step MIDI notes
}

// Track indices: 0=KICK 1=SNARE 2=CLAP 3=C.HH 4=O.HH 5=CYM 6=BASS 7=LEAD
const FACTORY: FactoryDef[] = [
  // 00 — 4 on the floor, classic house/techno starter
  { name: '4FLOOR', bpm: 120,
    kick: [1,5,9,13], snare: [5,13], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
    ohh: [3,11], cym: [1], bass: [[1,3,7,11], 48], lead: [[2,6,10], 64],
    mel: { 6: [48, 48, 46, 43], 7: [63, 67, 70] } },
  // 01 — Deep 808 trap (32 steps = 2 bars)
  { name: 'TRAP', bpm: 140, steps: 32,
    kick: [1,4,8,11,17,20,24,27], snare: [5,13,21,29], clap: [5,13,21,29],
    chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32],
    ohh: [4,8,12,16,20,28], cym: [1,17], bass: [[1,5,9,13,17,21,25,29], 36], lead: [[3,7,19,23,27], 60],
    mel: { 6: [36, 39, 36, 41, 36, 39, 43, 39], 7: [60, 63, 67, 65, 63] },
    vp: {
      0: { pitchStart: 200, pitchEnd: 38, pitchDecay: 0.06, ampDecay: 0.8, drive: 1.8 },
      1: { toneDecay: 0.05, noiseDecay: 0.05, noiseFc: 4500 },
      3: { decay: 0.02, hpCutoff: 7000, volume: 0.50 },
      6: { cutoffBase: 80, envMod: 2000, resonance: 4.0, decay: 0.30 },
    } },
  // 02 — Breakbeat, punchy drums
  { name: 'BREAK', bpm: 130,
    kick: [1,4,7,11], snare: [5,10,13], clap: [], chh: [1,3,5,7,9,11,13,15],
    ohh: [2,8,14], cym: [1], bass: [[1,5,9,13], 48], lead: [[1,6,11], 62],
    mel: { 6: [48, 51, 53, 51], 7: [62, 67, 65] },
    vp: {
      0: { pitchStart: 400, pitchEnd: 60, pitchDecay: 0.03, ampDecay: 0.25 },
      1: { toneDecay: 0.06, noiseAmt: 1.0, noiseFc: 4000 },
      4: { decay: 0.25 },
    } },
  // 03 — UK Garage 2-step, tight kick
  { name: '2STEP', bpm: 132,
    kick: [1,6,11], snare: [5,13], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
    ohh: [4,12], cym: [], bass: [[1,4,9,12], 48], lead: [[3,7,11,15], 65],
    mel: { 6: [48, 51, 55, 53], 7: [65, 67, 70, 67] },
    vp: {
      0: { ampDecay: 0.20, drive: 1.0 },
      6: { cutoffBase: 150, envMod: 5000, resonance: 8.0, decay: 0.15 },
    } },
  // 04 — Lo-fi hip hop, mellow everything (bass=12 for triplet feel, lead=24 for detail)
  { name: 'LOFI', bpm: 85,
    kick: [1,6,9,14], snare: [5,13], clap: [], chh: [1,3,5,7,9,11,13,15],
    ohh: [7,15], cym: [], bass: [[1,4,7,10], 48], lead: [[2,5,8,11,14,17,20,23], 67],
    ts: { 6: 12, 7: 24 },
    mel: { 6: [48, 53, 51, 48], 7: [67, 65, 63, 67, 65, 63, 60, 63] },
    vp: {
      0: { pitchStart: 250, ampDecay: 0.40, drive: 0.8 },
      1: { noiseFc: 2000, noiseAmt: 0.60 },
      3: { volume: 0.40, hpCutoff: 4000 },
      6: { cutoffBase: 120, envMod: 2500, resonance: 3.0 },
      7: { cutoffBase: 250, envMod: 3000, resonance: 1.2 },
    } },
  // 05 — Straight techno, 909 punchy + acid bass
  { name: 'TECHNO', bpm: 135,
    kick: [1,5,9,13], snare: [], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
    ohh: [3,7,11,15], cym: [1,9], bass: [[1,3,5,7,9,11,13,15], 36], lead: [[1,9], 60],
    mel: { 6: [36, 36, 39, 41, 36, 39, 36, 43], 7: [60, 63] },
    vp: {
      0: { pitchStart: 380, pitchEnd: 48, ampDecay: 0.30, drive: 1.6 },
      2: { decay: 0.12 },
      3: { baseFreq: 1000, hpCutoff: 7000 },
      6: { cutoffBase: 100, envMod: 6000, resonance: 10.0, decay: 0.12, drive: 2.2 },
    } },
  // 06 — Deep house, warm bass (bass=24 for shuffle, lead=12 for triplet phrase)
  { name: 'HOUSE', bpm: 124,
    kick: [1,5,9,13], snare: [], clap: [5,13], chh: [3,7,11,15],
    ohh: [7,15], cym: [1], bass: [[1,4,7,10,13,16,19,22], 48], lead: [[1,4,7,10], 64],
    ts: { 6: 24, 7: 12 },
    mel: { 6: [48, 51, 55, 53, 48, 46, 48, 51], 7: [63, 67, 70, 67] },
    vp: {
      0: { pitchStart: 320, pitchEnd: 50, ampDecay: 0.35 },
      6: { cutoffBase: 150, envMod: 3500, resonance: 5.0, decay: 0.20 },
    } },
  // 07 — Drum & bass, fast + sharp (HH=32 for detail, bass=12 for triplet bounce)
  { name: 'DNB', bpm: 174,
    kick: [1,11], snare: [5,13], clap: [], chh: [1,3,5,7,9,11,13,15],
    ohh: [4,12], cym: [1], bass: [[1,3,5,7,9,11], 36], lead: [[5,13], 67],
    ts: { 3: 32, 6: 12 },
    mel: { 6: [36, 39, 36, 43, 41, 39], 7: [67, 70] },
    vp: {
      0: { ampDecay: 0.20, pitchDecay: 0.025 },
      1: { toneDecay: 0.04, noiseDecay: 0.04, noiseFc: 5000 },
      3: { decay: 0.02, hpCutoff: 7500 },
      6: { cutoffBase: 100, envMod: 3000, resonance: 6.0, decay: 0.25, drive: 2.0 },
    } },
  // 08 — Hyperpop, distorted + bright
  { name: 'HYPER', bpm: 150,
    kick: [1,3,5,9,11,13], snare: [5,7,13,15], clap: [3,7,11,15], chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    ohh: [2,6,10,14], cym: [1,9], bass: [[1,2,5,6,9,10,13,14], 48], lead: [[1,3,5,9,11,13], 72],
    mel: { 6: [48, 51, 48, 55, 51, 48, 55, 53], 7: [72, 70, 67, 72, 70, 67] },
    vp: {
      0: { pitchStart: 500, ampDecay: 0.20, drive: 2.5 },
      1: { noiseFc: 5500, noiseAmt: 1.1 },
      6: { cutoffBase: 250, envMod: 7000, resonance: 9.0, drive: 2.8 },
      7: { cutoffBase: 800, envMod: 8000 },
    } },
  // 09 — Minimal ambient, soft + sparse (8 steps = half bar)
  { name: 'MINIMAL', bpm: 100, steps: 8,
    kick: [1,5], snare: [3], clap: [], chh: [1,3,5,7],
    ohh: [], cym: [1], bass: [[1,5], 48], lead: [[3,7], 60],
    mel: { 6: [48, 43], 7: [60, 63] },
    vp: {
      0: { pitchStart: 200, pitchEnd: 45, ampDecay: 0.50, drive: 0.8 },
      3: { volume: 0.35 },
      6: { cutoffBase: 100, envMod: 2000, resonance: 3.0, decay: 0.30 },
      7: { cutoffBase: 200, envMod: 2500, resonance: 1.0 },
    } },
  // 10 — Reggaeton, dembow rhythm
  { name: 'REGGAETN', bpm: 95,
    kick: [1,4,8,11], snare: [5,13], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
    ohh: [3,7,11,15], cym: [], bass: [[1,4,8,11], 48], lead: [[3,7,11,15], 60],
    mel: { 6: [48, 51, 48, 46], 7: [60, 63, 65, 67] },
    vp: {
      0: { ampDecay: 0.30, drive: 1.5 },
      1: { toneDecay: 0.06 },
      2: { decay: 0.15, filterFc: 1800 },
      6: { cutoffBase: 130, envMod: 3000, resonance: 5.0 },
    } },
  // 11 — Disco, funky bass + open hats
  { name: 'DISCO', bpm: 118,
    kick: [1,5,9,13], snare: [5,13], clap: [], chh: [3,7,11,15],
    ohh: [1,5,9,13], cym: [1], bass: [[1,3,5,8,11,13], 48], lead: [[2,6,10,14], 67],
    mel: { 6: [48, 51, 55, 53, 48, 51], 7: [67, 72, 70, 67] },
    vp: {
      0: { ampDecay: 0.30 },
      4: { volume: 0.75, decay: 0.20 },
      6: { cutoffBase: 180, envMod: 5000, resonance: 6.0, decay: 0.15 },
      7: { cutoffBase: 600, envMod: 7000 },
    } },
  // 12 — Electro, hard kick + acid
  { name: 'ELECTRO', bpm: 128,
    kick: [1,5,9,14], snare: [5,13], clap: [3,11], chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    ohh: [4,12], cym: [1], bass: [[1,3,7,9,13,15], 36], lead: [[1,5,9,13], 62],
    mel: { 6: [36, 39, 41, 36, 39, 43], 7: [62, 65, 67, 63] },
    vp: {
      0: { pitchStart: 450, drive: 2.0, ampDecay: 0.25 },
      1: { noiseFc: 4500 },
      6: { cutoffBase: 80, envMod: 7000, resonance: 11.0, drive: 2.5 },
      7: { cutoffBase: 500, envMod: 6500 },
    } },
  // 13 — Dubstep, heavy half-time
  { name: 'DUBSTEP', bpm: 140,
    kick: [1,9], snare: [7,15], clap: [7,15], chh: [1,3,5,7,9,11,13,15],
    ohh: [4,12], cym: [1], bass: [[1,3,5,9,11,13], 36], lead: [[1,9], 55],
    mel: { 6: [36, 36, 39, 36, 41, 39], 7: [55, 58] },
    vp: {
      0: { pitchEnd: 38, ampDecay: 0.60, drive: 1.8 },
      1: { noiseAmt: 1.1, noiseFc: 3500 },
      6: { cutoffBase: 80, envMod: 6000, resonance: 8.0, decay: 0.40, drive: 2.5 },
    } },
  // 14 — Drill, sliding 808
  { name: 'DRILL', bpm: 142,
    kick: [1,4,11], snare: [5,13], clap: [5,13], chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    ohh: [3,7,11,15], cym: [], bass: [[1,5,9,13], 36], lead: [[3,7,11,15], 60],
    mel: { 6: [36, 39, 41, 36], 7: [60, 63, 65, 60] },
    vp: {
      0: { pitchStart: 220, pitchEnd: 38, ampDecay: 0.70, drive: 1.6 },
      3: { decay: 0.02, hpCutoff: 7000, volume: 0.50 },
      6: { cutoffBase: 70, envMod: 2500, resonance: 5.0, decay: 0.30 },
    } },
  // 15 — Synthwave, lush pads
  { name: 'SYNTHWV', bpm: 110,
    kick: [1,5,9,13], snare: [5,13], clap: [], chh: [1,3,5,7,9,11,13,15],
    ohh: [7,15], cym: [1], bass: [[1,5,9,13], 48], lead: [[1,2,3,5,6,7,9,10,11,13,14,15], 64],
    mel: { 6: [48, 55, 53, 48], 7: [63, 67, 72, 63, 67, 72, 60, 63, 67, 60, 63, 67] },
    vp: {
      0: { pitchStart: 280, ampDecay: 0.35, drive: 1.0 },
      6: { cutoffBase: 150, envMod: 3000, resonance: 4.0, decay: 0.35 },
      7: { cutoffBase: 350, envMod: 5000, resonance: 2.0, decay: 0.60 },
    } },
  // 16 — Afrobeat, bouncy polyrhythm (12/8 drums, 8-step bass = 3:2 polyrhythm)
  { name: 'AFROBT', bpm: 105, steps: 12,
    kick: [1,4,7,10], snare: [4,10], clap: [3,9], chh: [1,3,5,7,9,11],
    ohh: [2,6,8,12], cym: [1], bass: [[1,3,5,7], 48], lead: [[2,5,8,11], 64],
    ts: { 6: 8, 7: 24 },  // bass=8 steps (3:2 vs drums), lead=24 (doubled density)
    mel: { 6: [48, 53, 51, 48], 7: [64, 67, 69, 67] },
    vp: {
      0: { ampDecay: 0.30, drive: 1.2 },
      6: { cutoffBase: 160, envMod: 4000, resonance: 5.0, decay: 0.18 },
      7: { cutoffBase: 500, envMod: 6000 },
    } },
  // 17 — Jersey club, rapid kicks
  { name: 'JERSEY', bpm: 150,
    kick: [1,4,7,10,13], snare: [5,13], clap: [3,7,11,15], chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    ohh: [4,8,12,16], cym: [], bass: [[1,5,9,13], 48], lead: [[2,6,10,14], 67],
    mel: { 6: [48, 51, 48, 46], 7: [67, 70, 67, 65] },
    vp: {
      0: { ampDecay: 0.20, drive: 1.5 },
      2: { decay: 0.10, filterFc: 2000 },
      3: { decay: 0.02, volume: 0.50 },
      6: { cutoffBase: 140, envMod: 4500, resonance: 6.0 },
    } },
  // 18 — UK Garage, bumpy bass
  { name: 'GARAGE', bpm: 130,
    kick: [1,6,9,14], snare: [5,13], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
    ohh: [3,7,11,15], cym: [1], bass: [[1,3,6,9,11,14], 48], lead: [[2,6,10,14], 65],
    mel: { 6: [48, 51, 55, 48, 51, 55], 7: [65, 67, 70, 67] },
    vp: {
      0: { pitchStart: 300, ampDecay: 0.30 },
      6: { cutoffBase: 130, envMod: 4000, resonance: 7.0, decay: 0.20 },
      7: { cutoffBase: 350, envMod: 4500, resonance: 1.5 },
    } },
  // 19 — Ambient, ethereal + slow (32 steps = 2 bars)
  { name: 'AMBIENT', bpm: 70, steps: 32,
    kick: [1,17], snare: [], clap: [], chh: [1,9,17,25],
    ohh: [5,13,21,29], cym: [1], bass: [[1,9,17,25], 48], lead: [[1,5,13,17,21,29], 60],
    mel: { 6: [48, 55, 51, 46], 7: [60, 63, 67, 60, 58, 55] },
    vp: {
      0: { pitchStart: 180, pitchEnd: 42, ampDecay: 0.60, drive: 0.7 },
      3: { volume: 0.30, hpCutoff: 6000 },
      5: { decay: 0.80 },
      6: { cutoffBase: 100, envMod: 1500, resonance: 2.0, decay: 0.45 },
      7: { cutoffBase: 200, envMod: 2000, resonance: 1.0, decay: 0.80 },
    } },
]

function makeFactoryPattern(id: number): Pattern {
  const f = FACTORY[id - 1]
  const s = f.steps ?? 16
  const ts = (i: number) => f.ts?.[i] ?? s  // per-track override or global
  const base: [Track & { pan: number }][] = [
    [{ ...makeTrack(0, 'KICK',  'DrumSynth',  f.kick, 60, ts(0)),            pan:  0.00 }],
    [{ ...makeTrack(1, 'SNARE', 'DrumSynth',  f.snare, 60, ts(1)),           pan: -0.10 }],
    [{ ...makeTrack(2, 'CLAP',  'DrumSynth',  f.clap, 60, ts(2)),            pan:  0.15 }],
    [{ ...makeTrack(3, 'C.HH',  'NoiseSynth', f.chh, 60, ts(3)),             pan: -0.30 }],
    [{ ...makeTrack(4, 'O.HH',  'NoiseSynth', f.ohh, 60, ts(4)),             pan:  0.35 }],
    [{ ...makeTrack(5, 'CYM',   'NoiseSynth', f.cym, 60, ts(5)),             pan:  0.25 }],
    [{ ...makeTrack(6, 'BASS',  'AnalogSynth', f.bass[0], f.bass[1], ts(6)), pan:  0.00 }],
    [{ ...makeTrack(7, 'LEAD',  'AnalogSynth', f.lead[0], f.lead[1], ts(7)), pan:  0.10 }],
  ]
  const tracks = base.map(([t], i) => {
    if (f.vp?.[i]) t.voiceParams = { ...t.voiceParams, ...f.vp[i] }
    return t
  })
  // Apply per-step melodies: mel[trackIdx] = array of MIDI notes aligned to active steps
  if (f.mel) {
    for (const [k, notes] of Object.entries(f.mel)) {
      const tIdx = parseInt(k)
      let ni = 0
      for (const trig of tracks[tIdx].trigs) {
        if (trig.active && ni < notes.length) trig.note = notes[ni++]
      }
    }
  }
  return { id, name: f.name, bpm: f.bpm, tracks }
}

export const PATTERN_COUNT = 100
export const FACTORY_COUNT = 20

// ── Reactive state ───────────────────────────────────────────────────

export const pattern = $state<Pattern>(makeFactoryPattern(1))

// Pattern bank: slots 0–9 = factory presets, slots 10–99 = user (empty)
const patternBank: Pattern[] = [
  ...Array.from({ length: FACTORY_COUNT }, (_, i) => makeFactoryPattern(i + 1)),
  ...Array.from({ length: PATTERN_COUNT - FACTORY_COUNT }, (_, i) => makeEmptyPattern(i + FACTORY_COUNT + 1)),
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

/** Apply any pending pattern switch (called at beat boundary or on stop) */
export function applyPendingSwitch(): void {
  if (patternNav.pendingId > 0) {
    const id = patternNav.pendingId
    patternNav.pendingId = 0
    saveToBank()
    loadFromBank(id - 1)
  }
}

/** Alias for applyPendingSwitch — called on stop to apply immediately */
export const clearPendingSwitch = applyPendingSwitch

export const playback = $state({
  playing: false,
  playheads: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
})

export const ui = $state({
  selectedTrack: 0,
  view: 'grid' as 'grid' | 'fx' | 'eq',
})

export const perf = $state({
  rootNote: 0,           // 0-11 chromatic key (0=C, 2=D, …) — OP-XY Brain style
  octave: 0,             // -2 to +2 octave shift for melodic tracks
  breaking: false,       // true = rhythmic gate at 8th-note rate
  masterGain: 0.8,       // 0.0–1.0 master volume (×0.8 headroom in worklet)
  filling: false,        // drum fill mode (random snare rolls)
  reversing: false,      // reverse step playback
  swing: 0,              // 0.0–1.0 → maps to 50%–75% swing in worklet
})

export const fxPad = $state({
  verb:   { on: false, x: 0.25, y: 0.65 },  // x=size, y=damp — left-upper: short bright room
  delay:  { on: false, x: 0.70, y: 0.40 },  // x=time, y=feedback — right-mid: longer delay
  glitch:   { on: false, x: 0.45, y: 0.15 },  // x=rate, y=crush — center-low: subtle
  granular: { on: false, x: 0.50, y: 0.30 },  // x=grain size, y=density
  filter:   { on: false, x: 0.50, y: 0.30 },  // x=LP←0.5→HP sweep, y=resonance
  eqLow:    { on: true,  x: 0.33, y: 0.50 },  // x=freq (200Hz), y=gain (0dB)
  eqMid:    { on: true,  x: 0.57, y: 0.50 },  // x=freq (1kHz),  y=gain (0dB)
  eqHigh:   { on: true,  x: 0.87, y: 0.50 },  // x=freq (8kHz),  y=gain (0dB)
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

export function setTrigVelocity(trackId: number, stepIdx: number, v: number) {
  pattern.tracks[trackId].trigs[stepIdx].velocity = Math.max(0.05, Math.min(1, v))
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

export const STEP_OPTIONS = [2, 4, 8, 12, 16, 24, 32, 48, 64] as const

export function setTrackSteps(trackId: number, newSteps: number) {
  const clamped = Math.max(2, Math.min(64, newSteps))
  const track = pattern.tracks[trackId]
  const old = track.steps
  if (clamped === old) return
  if (clamped > old) {
    const lastNote = track.trigs[old - 1]?.note ?? 60
    for (let i = old; i < clamped; i++) {
      track.trigs.push(makeTrig(false, lastNote))
    }
  } else {
    track.trigs.length = clamped
  }
  track.steps = clamped
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
