// Factory pattern definitions + track builder helpers
import { defaultVoiceParams } from './paramDefs.ts'
import type { Trig, Track, Cell, Pattern, Section, Song, Scene, SceneNode, SceneEdge, VoiceId } from './state.svelte.ts'
import { DRUM_VOICES } from './audio/dsp/voices.ts'
import { DEFAULT_EFFECTS } from './constants.ts'

export { DRUM_VOICES }

export const SECTION_COUNT = 100

// ── helpers ─────────────────────────────────────────────────────────

export function makeTrig(active: boolean, note = 60): Trig {
  return { active, note, velocity: 0.8, duration: 1, slide: false }
}

function makeTrigs(steps: number, activeSteps: number[], note = 60): Trig[] {
  return Array.from({ length: steps }, (_, i) => makeTrig(activeSteps.includes(i + 1), note))
}

export function makeTrack(
  id: number,
  name: string,
  voiceId: VoiceId | null,
  pan = 0,
): Track {
  return { id, name, voiceId, muted: false, volume: 0.8, pan }
}

// ── Pattern templates (ADR 015 §C) ──────────────────────────────────

export interface PatternTemplate {
  id: string
  name: string
  tracks: { name: string; voiceId: VoiceId; note: number; pan: number }[]
}

export const PATTERN_TEMPLATES: PatternTemplate[] = [
  {
    id: 'standard', name: 'Standard',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
      { name: 'CLAP',  voiceId: 'Clap',     note: 60, pan:  0.15 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'CYM',   voiceId: 'Cymbal',   note: 60, pan:  0.25 },
      { name: 'BASS',  voiceId: 'Bass303',  note: 48, pan:  0.00 },
      { name: 'LEAD',  voiceId: 'MoogLead', note: 64, pan:  0.10 },
    ],
  },
  {
    id: 'techno', name: 'Techno',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'CLAP',  voiceId: 'Clap',     note: 60, pan:  0.15 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'BASS',  voiceId: 'Bass303',  note: 48, pan:  0.00 },
      { name: 'PAD',   voiceId: 'WT',   note: 60, pan: -0.15 },
      { name: 'ARP',   voiceId: 'FM',       note: 60, pan:  0.20 },
      { name: 'FX',    voiceId: 'WT',   note: 60, pan:  0.00 },
    ],
  },
  {
    id: 'house', name: 'House',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
      { name: 'CLAP',  voiceId: 'Clap',     note: 60, pan:  0.15 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'CYM',   voiceId: 'Cymbal',   note: 60, pan:  0.25 },
      { name: 'BASS',  voiceId: 'Bass303',  note: 48, pan:  0.00 },
      { name: 'LEAD',  voiceId: 'WT',   note: 64, pan:  0.10 },
    ],
  },
  {
    id: 'ambient', name: 'Ambient',
    tracks: [
      { name: 'PAD1',  voiceId: 'WT',  note: 60, pan: -0.20 },
      { name: 'PAD2',  voiceId: 'WT',  note: 60, pan:  0.20 },
      { name: 'LEAD',  voiceId: 'WT',  note: 64, pan:  0.00 },
      { name: 'BELL',  voiceId: 'FM',       note: 72, pan: -0.35 },
      { name: 'TONE',  voiceId: 'FM',       note: 60, pan:  0.35 },
      { name: 'WARM',  voiceId: 'Analog',   note: 60, pan:  0.00 },
      { name: 'SMP1',  voiceId: 'Sampler',  note: 60, pan: -0.40 },
      { name: 'SMP2',  voiceId: 'Sampler',  note: 60, pan:  0.40 },
    ],
  },
  {
    id: 'hiphop', name: 'HipHop',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'SMP1',  voiceId: 'Sampler',  note: 60, pan: -0.20 },
      { name: 'SMP2',  voiceId: 'Sampler',  note: 60, pan:  0.20 },
      { name: 'BASS',  voiceId: 'Bass303',  note: 48, pan:  0.00 },
      { name: 'LEAD',  voiceId: 'MoogLead', note: 64, pan:  0.10 },
    ],
  },
]

/** Default template — backward compat alias for PATTERN_TEMPLATES[0].tracks */
export const TRACK_DEFAULTS = PATTERN_TEMPLATES[0].tracks

/** Look up a template by id (falls back to 'standard') */
export function getTemplate(id?: string): PatternTemplate {
  return PATTERN_TEMPLATES.find(t => t.id === id) ?? PATTERN_TEMPLATES[0]
}

export function makeEmptyCell(trackId: number, name: string, voiceId: VoiceId | null, note: number, steps = 16): Cell {
  const drum = voiceId ? DRUM_VOICES.has(voiceId) : false
  return {
    trackId,
    name,
    voiceId,
    steps,
    trigs: Array.from({ length: steps }, () => makeTrig(false, note)),
    voiceParams: voiceId ? defaultVoiceParams(voiceId) : {},
    reverbSend:  drum ? 0.08 : 0.25,
    delaySend:   drum ? 0.00 : 0.12,
    glitchSend:  0,
    granularSend: 0,
  }
}

export function makePatternId(index: number): string {
  return `pat_${String(index).padStart(2, '0')}`
}

export function makeEmptyPattern(index: number, name = '', templateId?: string): Pattern {
  const tmpl = getTemplate(templateId)
  return {
    id: makePatternId(index),
    name,
    color: 0,
    cells: tmpl.tracks.map((d, i) => makeEmptyCell(i, d.name, d.voiceId, d.note)),
  }
}

export function makeEmptySection(patternIndex: number): Section {
  return {
    patternIndex,
    repeats: 1,
  }
}

// ── Factory pattern definitions ──────────────────────────────────────

type FactoryDef = {
  name: string; bpm: number; steps?: number; key?: number
  kick: number[]; snare: number[]; clap: number[]; chh: number[]
  ohh: number[]; cym: number[]; bass: [number[], number]; lead: [number[], number]
  vp?: Record<number, Record<string, number>>
  ts?: Record<number, number>
  mel?: Record<number, number[]>
  dur?: Record<number, number[]>
}

// Track indices: 0=KICK 1=SNARE 2=CLAP 3=C.HH 4=O.HH 5=CYM 6=BASS 7=LEAD
const FACTORY: FactoryDef[] = [
  // 00 — Acid house: squelchy 303 bass + acid stab lead, key=E
  { name: '4FLOOR', bpm: 126, key: 4,
    kick: [1,5,9,13], snare: [5,13], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
    ohh: [3,7,11,15], cym: [1],
    bass: [[1,2,3,5,7,9,10,11,13,15], 40], lead: [[1,3,5,7,9,11,13,15], 64],
    mel: { 6: [40,43,40,43,52,40,43,40,52,52], 7: [64,76,64,67,71,64,76,67] },
    dur: { 6: [1,1,2,2,1,1,1,2,1,2], 7: [1,1,1,1,1,1,1,1] },
    vp: {
      6: { cutoffBase: 120, envMod: 2225, resonance: 13.6, decay: 0.15, drive: 2.5 },
      7: { cutoffBase: 350, envMod: 3340, resonance: 1.91, filterDecay: 0.12, ampDecay: 0.10 },
    } },
  // 01 — "Mask Off" trap flute: pentatonic hook over deep 808 (32 steps)
  { name: 'TRAP', bpm: 140, steps: 32, key: 9,
    kick: [1,4,8,11,17,20,24,27], snare: [5,13,21,29], clap: [5,13,21,29],
    chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32],
    ohh: [4,8,12,16,20,28], cym: [1,17],
    bass: [[1,5,13,17,21,29], 36],
    lead: [[3,5,7,9,11,19,21,23,25,27], 60],
    mel: { 6: [36,36,36,36,36,36], 7: [67,69,71,69,67,67,69,71,69,64] },
    dur: { 6: [3,6,3,3,6,3], 7: [1,1,2,1,1,1,1,2,1,1] },
    vp: {
      0: { pitchStart: 200, pitchEnd: 38, pitchDecay: 0.06, ampDecay: 0.8, drive: 1.8 },
      1: { toneDecay: 0.05, noiseDecay: 0.05, noiseFc: 4500 },
      3: { decay: 0.02, hpCutoff: 7000, volume: 0.50 },
      6: { cutoffBase: 80, envMod: 2000, resonance: 4.0, decay: 0.30 },
    } },
  // 02 — "Firestarter" breakbeat: aggressive octave-jumping stabs
  { name: 'BREAK', bpm: 130, key: 4,
    kick: [1,4,7,11], snare: [5,10,13], clap: [], chh: [1,3,5,7,9,11,13,15],
    ohh: [2,8,14], cym: [1],
    bass: [[1,3,5,9,11,13], 36], lead: [[1,3,5,9,11,14], 60],
    mel: { 6: [36,36,43,36,36,43], 7: [72,60,72,60,67,60] },
    dur: { 6: [1,1,2,1,1,2], 7: [1,1,2,1,1,2] },
    vp: {
      0: { pitchStart: 400, pitchEnd: 60, pitchDecay: 0.03, ampDecay: 0.25 },
      1: { toneDecay: 0.06, noiseAmt: 1.0, noiseFc: 4000 },
      4: { decay: 0.25 },
    } },
  // 03 — "Sweet Like Chocolate" 2-step: soulful wide-interval melody
  { name: '2STEP', bpm: 132, key: 2,
    kick: [1,6,11], snare: [5,13], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
    ohh: [4,12], cym: [],
    bass: [[1,4,9,12], 48], lead: [[1,3,6,9,11,14], 65],
    mel: { 6: [48,52,55,52], 7: [67,72,69,67,64,67] },
    dur: { 6: [2,3,2,3], 7: [2,2,2,2,2,2] },
    vp: {
      0: { ampDecay: 0.20, drive: 1.0 },
      6: { cutoffBase: 150, envMod: 5000, resonance: 8.0, decay: 0.15 },
    } },
  // 04 — Nujabes-style lo-fi: jazzy floating melody (bass=12, lead=24)
  { name: 'LOFI', bpm: 85, key: 7,
    kick: [1,6,9,14], snare: [5,13], clap: [], chh: [1,3,5,7,9,11,13,15],
    ohh: [7,15], cym: [],
    bass: [[1,4,7,10], 48], lead: [[1,4,7,10,13,16,19,22], 67],
    ts: { 6: 12, 7: 24 },
    mel: { 6: [57,55,53,48], 7: [69,72,71,67,64,67,69,64] },
    dur: { 6: [2,2,2,3], 7: [2,2,3,2,2,3,2,4] },
    vp: {
      0: { pitchStart: 250, ampDecay: 0.40, drive: 0.8 },
      1: { noiseFc: 2000, noiseAmt: 0.60 },
      3: { volume: 0.40, hpCutoff: 4000 },
      6: { cutoffBase: 120, envMod: 2500, resonance: 3.0 },
      7: { cutoffBase: 250, envMod: 3000, resonance: 1.2 },
    } },
  // 05 — "Strings of Life" techno: dramatic octave tension + acid (32 steps)
  { name: 'TECHNO', bpm: 135, steps: 32, key: 4,
    kick: [1,5,9,13,17,21,25,29], snare: [], clap: [5,13,21,29],
    chh: [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31],
    ohh: [3,7,11,15,19,23,27,31], cym: [1,17],
    bass: [[1,2,3,5,7,9,11,13,14,15,17,18,19,21,23,25,27,29,30,31], 36],
    lead: [[1,5,9,13,17,21,25,29], 60],
    mel: { 6: [36,36,40,43,36,40,36,43,43,40,36,36,40,43,36,40,36,43,40,38],
           7: [60,60,67,60,72,72,67,60] },
    dur: { 7: [2,2,4,2,2,2,4,2] },
    vp: {
      0: { pitchStart: 380, pitchEnd: 48, ampDecay: 0.30, drive: 1.6 },
      2: { decay: 0.12 },
      3: { baseFreq: 1000, hpCutoff: 7000 },
      6: { cutoffBase: 100, envMod: 6000, resonance: 10.0, decay: 0.12, drive: 2.2 },
    } },
  // 06 — "Show Me Love" house: piano arpeggio + warm bass (bass=24, lead=12)
  { name: 'HOUSE', bpm: 124, key: 5,
    kick: [1,5,9,13], snare: [], clap: [5,13], chh: [3,7,11,15],
    ohh: [7,15], cym: [1],
    bass: [[1,4,10,13,19,22], 48],
    lead: [[1,2,3,4,5,6,7,8,9,10,11,12], 64],
    ts: { 6: 24, 7: 12 },
    mel: { 6: [48,55,53,48,55,53], 7: [60,64,67,72,67,64,60,64,69,72,69,64] },
    dur: { 6: [2,4,2,4,2,2] },
    vp: {
      0: { pitchStart: 320, pitchEnd: 50, ampDecay: 0.35 },
      6: { cutoffBase: 150, envMod: 3500, resonance: 5.0, decay: 0.20 },
    } },
  // 07 — "Inner City Life" DnB: haunting wide leaps + rolling bass (HH=32, bass=12)
  { name: 'DNB', bpm: 174, key: 9,
    kick: [1,11], snare: [5,13], clap: [], chh: [1,3,5,7,9,11,13,15],
    ohh: [4,12], cym: [1],
    bass: [[1,3,5,7,9,11], 36], lead: [[1,3,7,9,13,15], 67],
    ts: { 3: 32, 6: 12 },
    mel: { 6: [36,43,36,40,36,43], 7: [72,69,60,64,67,60] },
    dur: { 6: [2,1,1,2,1,1], 7: [2,3,2,3,1,2] },
    vp: {
      0: { ampDecay: 0.20, pitchDecay: 0.025 },
      1: { toneDecay: 0.04, noiseDecay: 0.04, noiseFc: 5000 },
      3: { decay: 0.02, hpCutoff: 7500 },
      6: { cutoffBase: 100, envMod: 3000, resonance: 6.0, decay: 0.25, drive: 2.0 },
    } },
  // 08 — 100 gecs hyperpop: chaotic octave jumps + distorted bass
  { name: 'HYPER', bpm: 150, key: 11,
    kick: [1,3,5,9,11,13], snare: [5,7,13,15], clap: [3,7,11,15],
    chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    ohh: [2,6,10,14], cym: [1,9],
    bass: [[1,5,9,13], 48], lead: [[1,2,3,5,7,9,11,13,14,15], 72],
    mel: { 6: [48,60,48,55], 7: [72,60,79,64,72,55,67,76,60,72] },
    dur: { 6: [3,3,3,3], 7: [1,1,1,2,1,1,1,2,1,2] },
    vp: {
      0: { pitchStart: 500, ampDecay: 0.20, drive: 2.5 },
      1: { noiseFc: 5500, noiseAmt: 1.1 },
      6: { cutoffBase: 250, envMod: 7000, resonance: 9.0, drive: 2.8 },
      7: { cutoffBase: 800, envMod: 8000 },
    } },
  // 09 — Richie Hawtin minimal: hypnotic single-note repeat with subtle drop
  { name: 'MINIMAL', bpm: 100, key: 2,
    kick: [1,9], snare: [5], clap: [], chh: [1,5,9,13],
    ohh: [], cym: [1],
    bass: [[1,5,9,13], 48], lead: [[3,7,11,15], 60],
    mel: { 6: [48,48,48,43], 7: [67,67,67,64] },
    dur: { 6: [3,3,3,3], 7: [3,3,3,3] },
    vp: {
      0: { pitchStart: 200, pitchEnd: 45, ampDecay: 0.50, drive: 0.8 },
      3: { volume: 0.35 },
      6: { cutoffBase: 100, envMod: 2000, resonance: 3.0, decay: 0.30 },
      7: { cutoffBase: 200, envMod: 2500, resonance: 1.0, filterDecay: 0.60 },
    } },
  // 10 — "Gasolina" reggaeton: dembow + descending hook repeat
  { name: 'REGGAETN', bpm: 95, key: 4,
    kick: [1,4,8,11], snare: [5,13], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
    ohh: [3,7,11,15], cym: [],
    bass: [[1,4,8,11], 48], lead: [[1,3,5,7,9,11,13,15], 60],
    mel: { 6: [48,48,53,48], 7: [67,67,65,64,67,67,65,64] },
    dur: { 6: [2,3,2,3], 7: [1,1,1,2,1,1,1,2] },
    vp: {
      0: { ampDecay: 0.30, drive: 1.5 },
      1: { toneDecay: 0.06 },
      2: { decay: 0.15, filterFc: 1800 },
      6: { cutoffBase: 130, envMod: 3000, resonance: 5.0 },
    } },
  // 11 — "I Feel Love" disco: Moroder pulsating bass + vocal lead (32 steps)
  { name: 'DISCO', bpm: 118, steps: 32,
    kick: [1,5,9,13,17,21,25,29], snare: [5,13,21,29], clap: [],
    chh: [3,7,11,15,19,23,27,31],
    ohh: [1,5,9,13,17,21,25,29], cym: [1,17],
    bass: [[1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31], 36],
    lead: [[1,5,9,13,17,21,25,29], 64],
    mel: { 6: [36,43,36,43,36,43,36,43,41,48,41,48,41,48,41,48],
           7: [72,72,69,67,72,72,69,67] },
    dur: { 7: [2,2,2,2,2,2,2,2] },
    vp: {
      0: { ampDecay: 0.30 },
      4: { volume: 0.75, decay: 0.20 },
      6: { cutoffBase: 180, envMod: 5000, resonance: 6.0, decay: 0.15 },
      7: { cutoffBase: 600, envMod: 7000 },
    } },
  // 12 — "Planet Rock" electro: Kraftwerk-esque robotic repeat
  { name: 'ELECTRO', bpm: 128, key: 4,
    kick: [1,5,9,14], snare: [5,13], clap: [3,11],
    chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    ohh: [4,12], cym: [1],
    bass: [[1,3,5,7,9,11,13,15], 36], lead: [[1,3,5,7,9,11,13,15], 62],
    mel: { 6: [36,36,40,36,43,43,40,36], 7: [64,64,64,62,64,67,67,64] },
    dur: { 6: [2,1,1,2,2,1,1,2], 7: [1,1,1,2,1,1,1,2] },
    vp: {
      0: { pitchStart: 450, drive: 2.0, ampDecay: 0.25 },
      1: { noiseFc: 4500 },
      6: { cutoffBase: 80, envMod: 7000, resonance: 11.0, drive: 2.5 },
      7: { cutoffBase: 500, envMod: 6500 },
    } },
  // 13 — Dubstep halftime: heavy octave-diving lead (32 steps)
  { name: 'DUBSTEP', bpm: 140, steps: 32, key: 9,
    kick: [1,9,17,25], snare: [7,15,23,31], clap: [7,15,23,31],
    chh: [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31],
    ohh: [4,12,20,28], cym: [1,17],
    bass: [[1,5,9,13,17,21,25,29], 36],
    lead: [[1,5,9,17,21,25], 55],
    mel: { 6: [36,43,41,36,36,43,41,38], 7: [60,55,48,60,55,48] },
    dur: { 6: [3,3,3,3,3,3,3,3], 7: [3,3,4,3,3,6] },
    vp: {
      0: { pitchEnd: 38, ampDecay: 0.60, drive: 1.8 },
      1: { noiseAmt: 1.1, noiseFc: 3500 },
      6: { cutoffBase: 80, envMod: 6000, resonance: 8.0, decay: 0.40, drive: 2.5 },
    } },
  // 14 — Pop Smoke drill: eerie Am pentatonic descent + dark 808
  { name: 'DRILL', bpm: 142, key: 9,
    kick: [1,4,11], snare: [5,13], clap: [5,13],
    chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    ohh: [3,7,11,15], cym: [],
    bass: [[1,5,9,13], 36], lead: [[1,3,5,7,9,11,13,15], 60],
    mel: { 6: [36,43,40,36], 7: [69,67,64,60,57,60,64,57] },
    dur: { 6: [3,3,3,4], 7: [1,1,2,1,1,2,1,2] },
    vp: {
      0: { pitchStart: 220, pitchEnd: 38, ampDecay: 0.70, drive: 1.6 },
      3: { decay: 0.02, hpCutoff: 7000, volume: 0.50 },
      6: { cutoffBase: 70, envMod: 2500, resonance: 5.0, decay: 0.30 },
    } },
  // 15 — "Nightcall" synthwave: retro arpeggio + driving octave bass (32 steps)
  { name: 'SYNTHWV', bpm: 110, steps: 32, key: 9,
    kick: [1,5,9,13,17,21,25,29], snare: [5,13,21,29], clap: [],
    chh: [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31],
    ohh: [7,15,23,31], cym: [1,17],
    bass: [[1,5,9,13,17,21,25,29], 48],
    lead: [[1,3,5,9,13,17,19,21,25,29], 64],
    mel: { 6: [48,48,55,55,53,53,48,48],
           7: [60,64,67,72,67,60,64,67,72,67] },
    dur: { 6: [3,3,3,3,3,3,3,3],
           7: [2,2,4,2,4,2,2,4,2,4] },
    vp: {
      0: { pitchStart: 280, ampDecay: 0.35, drive: 1.0 },
      6: { cutoffBase: 150, envMod: 3000, resonance: 4.0, decay: 0.35 },
      7: { cutoffBase: 350, envMod: 5000, resonance: 2.0, filterDecay: 0.60 },
    } },
  // 16 — Fela Kuti afrobeat: horn-like call & response riff (12/8, lead=24)
  { name: 'AFROBT', bpm: 105, steps: 12, key: 7,
    kick: [1,4,7,10], snare: [4,10], clap: [3,9], chh: [1,3,5,7,9,11],
    ohh: [2,6,8,12], cym: [1],
    bass: [[1,3,5,7], 48],
    lead: [[1,3,5,7,9,11,13,15,17,19,21,23], 64],
    ts: { 6: 8, 7: 24 },
    mel: { 6: [48,55,53,48],
           7: [67,67,69,67,64,60,67,67,69,67,64,62] },
    dur: { 6: [2,1,1,2] },
    vp: {
      0: { ampDecay: 0.30, drive: 1.2 },
      6: { cutoffBase: 160, envMod: 4000, resonance: 5.0, decay: 0.18 },
      7: { cutoffBase: 500, envMod: 6000 },
    } },
  // 17 — Jersey club: bouncy bed-squeak octave alternation
  { name: 'JERSEY', bpm: 150, key: 2,
    kick: [1,4,7,10,13], snare: [5,13], clap: [3,7,11,15],
    chh: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    ohh: [4,8,12,16], cym: [],
    bass: [[1,5,9,13], 48], lead: [[1,2,5,6,9,10,13,14], 67],
    mel: { 6: [48,55,48,48], 7: [72,67,72,67,72,67,72,67] },
    dur: { 6: [3,3,3,3] },
    vp: {
      0: { ampDecay: 0.20, drive: 1.5 },
      2: { decay: 0.10, filterFc: 2000 },
      3: { decay: 0.02, volume: 0.50 },
      6: { cutoffBase: 140, envMod: 4500, resonance: 6.0 },
    } },
  // 18 — "Re-Rewind" UK Garage: soulful ascending arc (32 steps A/B)
  { name: 'GARAGE', bpm: 130, steps: 32, key: 2,
    kick: [1,6,9,14,17,22,25,30], snare: [5,13,21,29], clap: [5,13,21,29],
    chh: [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31],
    ohh: [3,7,11,15,19,23,27,31], cym: [1,17],
    bass: [[1,3,6,9,11,14,17,19,22,25,27,30], 48],
    lead: [[2,4,6,10,14,18,20,22,26,30], 65],
    mel: { 6: [48,52,55,48,52,55,53,55,57,53,55,53],
           7: [67,69,72,69,64,67,69,72,69,64] },
    dur: { 6: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
           7: [1, 1, 2, 2, 3, 1, 1, 2, 2, 3] },
    vp: {
      0: { pitchStart: 300, ampDecay: 0.30 },
      6: { cutoffBase: 130, envMod: 4000, resonance: 7.0, decay: 0.20 },
      7: { cutoffBase: 350, envMod: 4500, resonance: 1.5 },
    } },
  // 19 — Brian Eno ambient: wide ethereal arcs (64 steps, evolving pads)
  { name: 'AMBIENT', bpm: 70, steps: 64, key: 5,
    kick: [1,17,33,49], snare: [], clap: [], chh: [1,9,17,25,33,41,49,57],
    ohh: [5,13,21,29,37,45,53,61], cym: [1,33],
    bass: [[1,9,17,25,33,41,49,57], 48],
    lead: [[1,9,17,25,33,41,49,57], 60],
    mel: { 6: [48,55,53,48,55,57,53,48],
           7: [72,67,64,60,64,69,72,67] },
    dur: { 6: [7,7,7,7,7,7,7,7], 7: [7,7,7,7,7,7,7,7] },
    vp: {
      0: { pitchStart: 180, pitchEnd: 42, ampDecay: 0.60, drive: 0.7 },
      3: { volume: 0.30, hpCutoff: 6000 },
      5: { decay: 0.80 },
      6: { cutoffBase: 100, envMod: 1500, resonance: 2.0, decay: 0.45 },
      7: { cutoffBase: 200, envMod: 2000, resonance: 1.0, filterDecay: 0.80 },
    } },
  // 20 — Lo-fi B section: upbeat chorus counterpart to LOFI (bass=12, lead=24)
  { name: 'LF.B', bpm: 85, key: 7,
    kick: [1,5,9,13], snare: [5,13], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
    ohh: [3,11,15], cym: [1],
    bass: [[1,4,7,10], 48], lead: [[1,3,5,7,9,11,13,15,17,19,21,23], 67],
    ts: { 6: 12, 7: 24 },
    mel: { 6: [48,52,55,57], 7: [67,69,71,72,74,72,71,69,67,64,67,69] },
    dur: { 6: [2,3,2,3], 7: [2,2,2,2,2,2,2,2,2,2,2,4] },
    vp: {
      0: { pitchStart: 220, ampDecay: 0.35, drive: 0.9 },
      1: { noiseFc: 2200, noiseAmt: 0.55 },
      3: { volume: 0.45, hpCutoff: 4200 },
      6: { cutoffBase: 140, envMod: 3000, resonance: 3.5 },
      7: { cutoffBase: 300, envMod: 3500, resonance: 1.5 },
    } },
]

/** Build a cell from a factory definition for a given track */
function buildFactoryCell(
  trackIdx: number, f: FactoryDef,
  name: string, voiceId: VoiceId, defaultNote: number,
): Cell {
  const s = f.steps ?? 16
  const steps = f.ts?.[trackIdx] ?? s
  const activeSteps = [f.kick, f.snare, f.clap, f.chh, f.ohh, f.cym, f.bass[0], f.lead[0]][trackIdx]
  const baseNote = DRUM_VOICES.has(voiceId) ? defaultNote
    : voiceId === 'Bass303' || voiceId === 'Analog' ? f.bass[1] : f.lead[1]
  const drum = DRUM_VOICES.has(voiceId)

  const trigs = makeTrigs(steps, activeSteps, baseNote)
  let vp = defaultVoiceParams(voiceId)
  if (f.vp?.[trackIdx]) vp = { ...vp, ...f.vp[trackIdx] }

  // Apply per-step melodies and durations
  const notes = f.mel?.[trackIdx]
  const durs = f.dur?.[trackIdx]
  if (notes) {
    let ni = 0
    for (let si = 0; si < trigs.length; si++) {
      const trig = trigs[si]
      if (trig.active && ni < notes.length) {
        trig.note = notes[ni]
        if (durs && ni < durs.length) {
          const dur = durs[ni]
          trig.duration = dur
          for (let d = 1; d < dur && si + d < trigs.length; d++) {
            trigs[si + d].active = false
          }
        }
        ni++
      }
    }
  }

  return {
    trackId: trackIdx,
    name,
    voiceId,
    steps,
    trigs,
    voiceParams: vp,
    reverbSend:  drum ? 0.08 : 0.25,
    delaySend:   drum ? 0.00 : 0.12,
    glitchSend:  0,
    granularSend: 0,
  }
}

export const FACTORY_COUNT = FACTORY.length

/** Build a default linear scene from sections that have factory data (ADR 044 Phase 1a) */
export function makeDefaultScene(patterns: Pattern[]): Scene {
  const nodes: SceneNode[] = []
  const edges: SceneEdge[] = []

  // Collect active pattern indices (with factory bpm/key)
  const active: { pi: number; bpm: number; key: number }[] = []
  for (let i = 0; i < patterns.length; i++) {
    if (!patterns[i].cells.some(c => c.trigs.some(t => t.active))) continue
    const f = i < FACTORY.length ? FACTORY[i] : null
    active.push({ pi: i, bpm: f?.bpm ?? FACTORY[0].bpm, key: f?.key ?? 0 })
  }

  let nid = 0
  const mkId = () => `sn_${String(nid++).padStart(2, '0')}`
  const pos = () => ({
    x: 0.1 + (nodes.length % 6) * 0.14,
    y: 0.1 + Math.floor(nodes.length / 6) * 0.2,
  })

  let curBpm = FACTORY[0].bpm
  let curKey = FACTORY[0].key ?? 0

  for (let ai = 0; ai < active.length; ai++) {
    const { pi, bpm, key } = active[ai]

    // Insert tempo node when bpm changes
    if (bpm !== curBpm) {
      nodes.push({ id: mkId(), type: 'tempo', ...pos(), root: false, params: { bpm } })
      curBpm = bpm
    }
    // Insert transpose node when key changes (delta semitones)
    if (key !== curKey) {
      nodes.push({ id: mkId(), type: 'transpose', ...pos(), root: false, params: { semitones: key - curKey } })
      curKey = key
    }
    // Pattern node
    nodes.push({ id: mkId(), type: 'pattern', ...pos(), root: nodes.length === 0, patternId: patterns[pi].id })
  }

  // Connect linearly
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `se_${String(i).padStart(2, '0')}`,
      from: nodes[i].id,
      to: nodes[i + 1].id,
      order: 0,
    })
  }
  return { name: 'Main', nodes, edges, labels: [] }
}

/**
 * Build a completely empty Song (for new projects).
 */
export function makeEmptySong(templateId?: string): Song {
  const tmpl = getTemplate(templateId)
  const tracks: Track[] = tmpl.tracks.map((d, trackIdx) =>
    makeTrack(trackIdx, d.name, d.voiceId, d.pan)
  )
  const patterns: Pattern[] = []
  const sections: Section[] = []
  for (let i = 0; i < SECTION_COUNT; i++) {
    patterns.push(makeEmptyPattern(i, '', templateId))
    sections.push(makeEmptySection(i))
  }
  return {
    name: 'Untitled',
    bpm: 120,
    rootNote: 0,
    tracks,
    patterns,
    sections,
    scene: { name: 'Main', nodes: [], edges: [], labels: [] },
    effects: {
      reverb: { ...DEFAULT_EFFECTS.reverb },
      delay:  { ...DEFAULT_EFFECTS.delay },
      ducker: { ...DEFAULT_EFFECTS.ducker },
      comp:   { ...DEFAULT_EFFECTS.comp },
    },
  }
}

/**
 * Build the default Song with pattern pool + arrangement sections + scene (ADR 044).
 * First FACTORY_COUNT patterns come from factory presets, rest are empty.
 * Sections have 1:1 mapping to patterns via patternIndex.
 */
export function makeDefaultSong(): Song {
  const tracks: Track[] = TRACK_DEFAULTS.map((d, trackIdx) =>
    makeTrack(trackIdx, d.name, d.voiceId, d.pan)
  )

  const patterns: Pattern[] = []
  const sections: Section[] = []

  for (let i = 0; i < FACTORY.length; i++) {
    const f = FACTORY[i]
    patterns.push({
      id: makePatternId(i),
      name: f.name.slice(0, 8),
      color: 0,
      cells: TRACK_DEFAULTS.map((d, trackIdx) =>
        buildFactoryCell(trackIdx, f, d.name, d.voiceId, d.note)
      ),
    })
    sections.push(makeEmptySection(i))
  }
  for (let i = FACTORY.length; i < SECTION_COUNT; i++) {
    patterns.push(makeEmptyPattern(i))
    sections.push(makeEmptySection(i))
  }

  return {
    name: FACTORY[0].name,
    bpm: FACTORY[0].bpm,
    rootNote: FACTORY[0].key ?? 0,
    tracks,
    patterns,
    sections,
    scene: makeDefaultScene(patterns),
    effects: {
      reverb: { ...DEFAULT_EFFECTS.reverb },
      delay:  { ...DEFAULT_EFFECTS.delay },
      ducker: { ...DEFAULT_EFFECTS.ducker },
      comp:   { ...DEFAULT_EFFECTS.comp },
    },
  }
}
