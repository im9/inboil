// Factory pattern definitions + track builder helpers
import { defaultVoiceParams } from './paramDefs.ts'
import { getPresets } from './presets.ts'
import type { Trig, Track, Cell, Pattern, Song, Scene, SceneNode, SceneEdge, ModifierParams, VoiceId } from './types.ts'
import { DRUM_VOICES } from './audio/dsp/voices.ts'
import { DEFAULT_EFFECTS } from './constants.ts'

export { DRUM_VOICES }

export const PATTERN_POOL_SIZE = 100

// ── Random pattern names (≤12 chars, auto-generated ones ≤8) ────────

const PATTERN_WORDS = [
  'DRIFT',  'PULSE',  'HAZE',   'BLOOM',  'GHOST',
  'SWIRL',  'VAPOR',  'EMBER',  'ORBIT',  'GLINT',
  'SPARK',  'SHADE',  'FLUX',   'GRAIN',  'MOSS',
  'DUSK',   'FOAM',   'VOID',   'RIDGE',  'LOOP',
  'GLOW',   'SILK',   'RUST',   'TIDE',   'FERN',
  'SWAY',   'PLUCK',  'RUMBLE',  'FLARE',  'CRISP',
  'MURMUR', 'STONE',  'WIRE',   'FROST',  'BLISS',
  'SURGE',  'PRISM',  'ECHO',   'DAWN',   'SPORE',
  'COIL',   'STRATA', 'RIPPLE', 'CRUSH',  'LOOM',
  'CRUX',   'WARP',   'VELVET', 'PETAL',  'SMOG',
] as const

export function randomPatternName(existing: string[] = []): string {
  const pool = PATTERN_WORDS.filter(w => !existing.includes(w))
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]
  // All words used — append number
  const base = PATTERN_WORDS[Math.floor(Math.random() * PATTERN_WORDS.length)]
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}${n}`
    if (candidate.length <= 8 && !existing.includes(candidate)) return candidate
  }
  return base
}

// ── helpers ─────────────────────────────────────────────────────────

export function makeTrig(active: boolean, note = 60): Trig {
  return { active, note, velocity: 0.8, duration: 1, slide: false }
}

function makeTrigs(steps: number, activeSteps: number[], note = 60): Trig[] {
  return Array.from({ length: steps }, (_, i) => makeTrig(activeSteps.includes(i + 1), note))
}

export function makeTrack(id: number, pan = 0): Track {
  return { id, muted: false, volume: 0.8, pan }
}

// ── Pattern templates (ADR 015 §C) ──────────────────────────────────

export interface PatternTemplate {
  id: string
  name: string
  tracks: { name: string; voiceId: VoiceId; note: number; pan: number; voiceParams?: Record<string, number>; presetName?: string; sampleRef?: { name: string; packId?: string; poolFile?: string } }[]
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
      { name: 'PIANO', voiceId: 'Sampler',  note: 60, pan:  0.25, sampleRef: { name: 'Grand Piano', packId: 'grand-piano' } },
      { name: 'BASS',  voiceId: 'Analog',   note: 48, pan:  0.00, presetName: 'Warm Sub' },
      { name: 'LEAD',  voiceId: 'MoogLead', note: 64, pan:  0.10, presetName: 'Fat Lead' },
    ],
  },
  {
    // Techno: 303 is iconic — acid/squelch bass, dark minimal pads, cold arps
    id: 'techno', name: 'Techno',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'CLAP',  voiceId: 'Clap',     note: 60, pan:  0.15 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'RIM',   voiceId: 'Rimshot',  note: 60, pan:  0.10 },
      { name: 'PAD',   voiceId: 'WT',       note: 60, pan: -0.15, presetName: 'Dark Pad' },
      { name: 'BASS',  voiceId: 'Bass303',  note: 48, pan:  0.00, presetName: 'Squelch' },
      { name: 'ARP',   voiceId: 'FM',       note: 60, pan:  0.20 },
    ],
  },
  {
    // House: piano chords (iconic house piano), deep sub bass, smooth leads
    id: 'house', name: 'House',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'CLAP',  voiceId: 'Clap',     note: 60, pan:  0.15 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'SHAK',  voiceId: 'Shaker',   note: 60, pan:  0.20 },
      { name: 'PAD',   voiceId: 'WT',       note: 60, pan: -0.15, presetName: 'Warm Pad' },
      { name: 'BASS',  voiceId: 'Analog',   note: 48, pan:  0.00, presetName: 'Warm Sub' },
      { name: 'LEAD',  voiceId: 'MoogLead', note: 64, pan:  0.10, presetName: 'Soft' },
    ],
  },
  {
    // Ambient: lush layered pads, ethereal bells, no drums
    id: 'ambient', name: 'Ambient',
    tracks: [
      { name: 'PAD1',  voiceId: 'WT',       note: 60, pan: -0.20, presetName: 'Shimmer' },
      { name: 'PAD2',  voiceId: 'WT',       note: 60, pan:  0.20, presetName: 'Dark Pad' },
      { name: 'LEAD',  voiceId: 'FM',       note: 64, pan:  0.00, presetName: 'Flute' },
      { name: 'BELL',  voiceId: 'FM',       note: 72, pan: -0.35, presetName: 'Vibraphone' },
      { name: 'WARM',  voiceId: 'Analog',   note: 60, pan:  0.00, presetName: 'Dark' },
      { name: 'SMP',   voiceId: 'Sampler',  note: 60, pan:  0.35 },
    ],
  },
  {
    // HipHop: 808 kick, EP/Rhodes chords, fat Moog bass, sampler chops
    id: 'hiphop', name: 'HipHop',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick808',  note: 60, pan:  0.00, presetName: '808 Sub' },
      { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'KEYS',  voiceId: 'FM',       note: 60, pan: -0.15, presetName: 'EP Piano' },
      { name: 'CONGA', voiceId: 'Sampler',  note: 60, pan:  0.20, sampleRef: { name: 'conga', poolFile: 'factory/percussion/perc_conga.webm' } },
      { name: 'BASS',  voiceId: 'MoogLead', note: 36, pan:  0.00, presetName: 'Mono Bass' },
      { name: 'LEAD',  voiceId: 'FM',       note: 64, pan:  0.10, presetName: 'Brass' },
    ],
  },
  {
    id: 'drumkit', name: 'Drum Kit',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'K808',  voiceId: 'Kick808',  note: 60, pan:  0.00 },
      { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
      { name: 'CLAP',  voiceId: 'Clap',     note: 60, pan:  0.15 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'TOM',   voiceId: 'Tom',      note: 60, pan: -0.20 },
      { name: 'RIM',   voiceId: 'Rimshot',  note: 60, pan:  0.10 },
      { name: 'COWB',  voiceId: 'Cowbell',   note: 60, pan:  0.25 },
      { name: 'SHAK',  voiceId: 'Shaker',   note: 60, pan: -0.25 },
      { name: 'CYM',   voiceId: 'Cymbal',   note: 60, pan:  0.40 },
      { name: 'CRASH', voiceId: 'Crash',    note: 60, pan: -0.40 },
    ],
  },
  {
    id: 'synth', name: 'Synth',
    tracks: [
      { name: 'FM 1',  voiceId: 'FM',       note: 60, pan: -0.15, presetName: 'EP Piano' },
      { name: 'FM 2',  voiceId: 'FM',       note: 60, pan:  0.15, presetName: 'Sync Lead' },
      { name: 'WT 1',  voiceId: 'WT',       note: 60, pan: -0.25, presetName: 'Warm Pad' },
      { name: 'WT 2',  voiceId: 'WT',       note: 60, pan:  0.25, presetName: 'Saw Lead' },
      { name: 'MOOG',  voiceId: 'MoogLead', note: 64, pan:  0.00, presetName: 'Fat Lead' },
      { name: 'BASS',  voiceId: 'Analog',   note: 48, pan:  0.00, presetName: 'Warm Sub' },
      { name: 'ANLG',  voiceId: 'Analog',   note: 60, pan: -0.10, presetName: 'Smooth' },
      { name: 'SMP',   voiceId: 'Sampler',  note: 60, pan:  0.10 },
    ],
  },
  {
    id: 'breaks', name: 'Breaks',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00, presetName: 'Punchy' },
      { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
      { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
      { name: 'RIDE',  voiceId: 'Ride',     note: 60, pan:  0.30 },
      { name: 'SMP',   voiceId: 'Sampler',  note: 60, pan:  0.00 },
      { name: 'BASS',  voiceId: 'MoogLead', note: 48, pan:  0.00, presetName: 'Punch Bass' },
      { name: 'LEAD',  voiceId: 'Analog',   note: 64, pan:  0.15, presetName: 'Biting' },
    ],
  },
  {
    id: 'minimal', name: 'Minimal',
    tracks: [
      { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
      { name: 'PERC',  voiceId: 'Rimshot',  note: 60, pan:  0.15 },
      { name: 'HAT',   voiceId: 'Hat',      note: 60, pan: -0.30 },
      { name: 'BASS',  voiceId: 'Analog',   note: 48, pan:  0.00, presetName: 'Tight' },
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

/** Apply template track overrides (voiceParams + preset) to a cell */
export function applyTemplateTrack(cell: Cell, d: PatternTemplate['tracks'][number]): void {
  if (d.presetName) {
    const preset = getPresets(d.voiceId).find(p => p.name === d.presetName)
    if (preset) {
      Object.assign(cell.voiceParams, preset.params)
      cell.presetName = d.presetName
    }
  }
  // Explicit voiceParams override on top of preset (e.g. polyMode)
  if (d.voiceParams) Object.assign(cell.voiceParams, d.voiceParams)
  if (d.sampleRef) cell.sampleRef = { ...d.sampleRef }
}

export function makeEmptyPattern(index: number, name = '', templateId?: string): Pattern {
  const tmpl = getTemplate(templateId)
  return {
    id: makePatternId(index),
    name,
    color: 0,
    cells: tmpl.tracks.map((d, i) => {
      const cell = makeEmptyCell(i, d.name, d.voiceId, d.note)
      applyTemplateTrack(cell, d)
      return cell
    }),
  }
}

// ── Test fixture: hardcoded song data ────────────────────────────────
// Used by makeDefaultSong() in persistence/storage tests as a rich Song fixture.
// Production demo is loaded from public/demo-song.json — this is NOT the demo.
// "VELVET" — jazzy neo-soul song (120 BPM, Am)
// 9-track layout: Kick, Snare, Clap, C.HH, O.HH, Ride, Bass303, FM, MoogLead

const FACTORY_TRACKS: { name: string; voiceId: VoiceId; note: number; pan: number }[] = [
  { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
  { name: 'SNARE', voiceId: 'Snare',    note: 60, pan: -0.10 },
  { name: 'CLAP',  voiceId: 'Clap',     note: 60, pan:  0.15 },
  { name: 'C.HH',  voiceId: 'Hat',      note: 60, pan: -0.30 },
  { name: 'O.HH',  voiceId: 'OpenHat',  note: 60, pan:  0.35 },
  { name: 'RIDE',  voiceId: 'Ride',     note: 60, pan:  0.25 },
  { name: 'BASS',  voiceId: 'Bass303',  note: 48, pan:  0.00 },
  { name: 'FM',    voiceId: 'FM',       note: 57, pan:  0.00 },
  { name: 'LEAD',  voiceId: 'MoogLead', note: 60, pan:  0.00 },
]

type FactoryDef = {
  name: string; bpm?: number; key?: number
  // Track step arrays: indices 0–8 map to FACTORY_TRACKS order
  kick: number[]; snare: number[]; clap: number[]; chh: number[]
  ohh: number[]; ride: number[]; bass: [number[], number]; fm: [number[], number]; lead: [number[], number]
  vp?: Record<number, Record<string, number>>
  ts?: Record<number, number>
  mel?: Record<number, number[]>
  dur?: Record<number, number[]>
  vel?: Record<number, number[]>
  sends?: Record<number, { reverbSend?: number; delaySend?: number }>
}

// Shared voice params across all patterns (user-tuned VELVET sound)
const VP_KICK = { toneLevel: 1, pitchStart: 340, pitchEnd: 55, pitchDecay: 0.035, decay: 0.35, drive: 1.4, click: 0.6 }
const VP_SNARE = { toneLevel: 0.2, pitchStart: 185, pitchEnd: 185, noiseLevel: 0.85, noiseFilterFreq: 3000, noiseFilterQ: 3.5 }
const VP_CLAP = { noiseLevel: 1, noiseFilterFreq: 1200, noiseFilterQ: 2, decay: 0.18, burstCount: 4 }
const VP_CHH = { noiseLevel: 0.25, noiseFilterFreq: 8000, noiseFilterMode: 1, metalLevel: 0.8, hpFreq: 5000 }
const VP_OHH = { noiseLevel: 0.25, noiseFilterFreq: 8000, noiseFilterMode: 1, metalLevel: 0.8, decay: 0.18, hpFreq: 4500 }
const VP_RIDE = { decay: 1, end: 1 }
const VP_BASS = { cutoffBase: 50, envMod: 500, resonance: 7.5, decay: 0.15, drive: 2.5 }
const VP_FM = { polyMode: 1, algorithm: 4, op1Fb: 0.08, op1Ratio: 1, op2Ratio: 1, op3Ratio: 1, op4Ratio: 14,
  op1Level: 1, op2Level: 0.7, op3Level: 0.4, op4Level: 0.15, op1Decay: 0.8, op2Decay: 0.7, op3Decay: 0.08, op4Decay: 0.06, op1Release: 0.5, lfoRate: 2 }
const VP_LEAD = { cutoffBase: 623, envMod: 1000, resonance: 1, filterDecay: 0.5, ampDecay: 0.427, ampSustain: 0.9, ampRelease: 0.5,
  arpMode: 2, arpRate: 1, arpChord: 1, arpOct: 1 }

const FACTORY: FactoryDef[] = [
  // 00 — HAZE: atmospheric intro, drums out, FX-heavy pads
  { name: 'HAZE',
    kick: [], snare: [], clap: [], chh: [], ohh: [], ride: [],
    bass: [[1, 9], 48],
    fm:   [[1, 5, 9, 13], 57],
    lead: [[1, 9], 60],
    mel: { 6: [48, 48], 7: [57, 53, 48, 55], 8: [60, 64] },
    dur: { 6: [7, 7], 7: [4, 4, 4, 4], 8: [8, 8] },
    vel: { 6: [0.50, 0.40], 7: [0.60, 0.55, 0.65, 0.50], 8: [0.50, 0.45] },
    vp: { 0: VP_KICK, 1: VP_SNARE, 2: VP_CLAP, 3: VP_CHH, 4: VP_OHH, 5: VP_RIDE,
      6: { ...VP_BASS, cutoffBase: 35, envMod: 300 },
      7: VP_FM, 8: VP_LEAD },
    sends: { 6: { reverbSend: 0.40, delaySend: 0.30 },
             7: { reverbSend: 0.40, delaySend: 0.25 },
             8: { reverbSend: 0.50, delaySend: 0.30 } },
  },
  // 01 — VELVET: main neo-soul groove (Am → F → C → G)
  { name: 'VELVET',
    kick: [1, 5, 9], snare: [5, 11, 13], clap: [5, 7, 13],
    chh: [1, 3, 4, 9, 11, 12, 13, 15], ohh: [7, 11],
    ride: [1, 3, 5, 6, 7, 9, 10, 11, 13, 15, 16],
    bass: [[1, 2, 4, 5, 6, 9, 10, 11, 13], 57],
    fm:   [[1, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16], 57],
    lead: [[1, 3, 11], 60],
    mel: { 6: [57, 60, 67, 53, 60, 48, 65, 69, 55],
           7: [57, 57, 53, 57, 53, 48, 53, 48, 55, 48, 55],
           8: [60, 60, 60] },
    dur: { 7: [3, 2, 3, 2, 2, 3, 2, 2, 3, 2, 1], 8: [1, 8, 6] },
    vel: { 0: [0.92, 0.99, 0.79],
           1: [0.99, 0.88, 0.80],
           2: [0.85, 0.74, 0.99],
           3: [0.55, 0.98, 0.69, 0.64, 0.75, 0.64, 0.67, 0.76],
           4: [0.64, 0.63],
           5: [0.59, 0.58, 0.85, 0.62, 0.99, 0.82, 0.87, 0.74, 0.60, 0.78, 0.77],
           6: [0.95, 0.96, 0.99, 0.62, 0.88, 0.75, 0.66, 0.80, 0.60],
           7: [0.86, 0.68, 0.91, 0.73, 0.75, 0.84, 0.84, 0.66, 0.91, 0.74, 0.78],
           8: [0.68, 0.63, 0.64] },
    vp: { 0: VP_KICK, 1: VP_SNARE, 2: VP_CLAP, 3: VP_CHH, 4: VP_OHH, 5: VP_RIDE,
      6: VP_BASS, 7: VP_FM, 8: VP_LEAD },
  },
  // 02 — DRIFT: breakdown — minimal kick+ride, root bass, rhythmic comping
  { name: 'DRIFT',
    kick: [1, 9], snare: [], clap: [5, 13],
    chh: [1, 5, 9, 13], ohh: [],
    ride: [1, 3, 5, 7, 9, 11, 13, 15],
    bass: [[1, 5, 9, 13], 57],
    fm:   [[1, 3, 5, 7, 9, 11, 13, 15], 57],
    lead: [[1, 3, 5, 9, 13], 60],
    mel: { 6: [57, 53, 48, 55],
           7: [57, 57, 53, 53, 48, 48, 55, 55],
           8: [60, 64, 67, 64, 60] },
    dur: { 6: [3, 3, 3, 4], 7: [2, 2, 2, 2, 2, 2, 2, 2], 8: [2, 2, 4, 4, 4] },
    vel: { 0: [0.70, 0.60],
           2: [0.50, 0.55],
           3: [0.45, 0.50, 0.45, 0.50],
           5: [0.55, 0.50, 0.60, 0.50, 0.55, 0.50, 0.58, 0.50],
           6: [0.70, 0.65, 0.75, 0.60],
           7: [0.70, 0.55, 0.75, 0.55, 0.70, 0.55, 0.75, 0.55],
           8: [0.60, 0.55, 0.65, 0.60, 0.55] },
    vp: { 0: VP_KICK, 1: VP_SNARE, 2: VP_CLAP, 3: VP_CHH, 4: VP_OHH, 5: VP_RIDE,
      6: VP_BASS, 7: VP_FM, 8: VP_LEAD },
    sends: { 8: { reverbSend: 0.35, delaySend: 0.20 } },
  },
  // 03 — BLOOM: buildup — full drums, walking bass, melodic lead
  { name: 'BLOOM',
    kick: [1, 5, 7, 9, 13], snare: [5, 11, 13, 15], clap: [5, 13],
    chh: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    ohh: [4, 8, 12],
    ride: [1, 3, 5, 7, 9, 11, 13, 15],
    bass: [[1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], 57],
    fm:   [[1, 5, 9, 13], 57],
    lead: [[1, 3, 5, 7, 9, 11, 13], 60],
    mel: { 6: [57, 55, 53, 53, 55, 57, 48, 50, 52, 55, 57, 60],
           7: [57, 53, 48, 55],
           8: [60, 64, 67, 72, 69, 67, 64] },
    dur: { 7: [4, 4, 4, 4], 8: [2, 2, 2, 2, 2, 2, 4] },
    vel: { 0: [0.95, 0.99, 0.75, 0.85, 0.90],
           1: [0.99, 0.85, 0.80, 0.70],
           2: [0.90, 0.99],
           3: [0.60, 0.55, 0.65, 0.60, 0.65, 0.55, 0.70, 0.65, 0.60, 0.55, 0.65, 0.60, 0.70, 0.55, 0.65, 0.60],
           4: [0.70, 0.65, 0.72],
           5: [0.65, 0.55, 0.70, 0.55, 0.65, 0.55, 0.68, 0.55],
           6: [0.90, 0.75, 0.85, 0.80, 0.70, 0.90, 0.95, 0.75, 0.85, 0.80, 0.70, 0.88],
           7: [0.80, 0.75, 0.85, 0.78],
           8: [0.65, 0.60, 0.70, 0.75, 0.70, 0.65, 0.60] },
    vp: { 0: VP_KICK, 1: VP_SNARE, 2: VP_CLAP, 3: VP_CHH, 4: VP_OHH, 5: VP_RIDE,
      6: VP_BASS, 7: VP_FM, 8: VP_LEAD },
  },
]

/** Build a cell from a factory definition for a given track */
function buildFactoryCell(
  trackIdx: number, f: FactoryDef,
  name: string, voiceId: VoiceId, defaultNote: number,
): Cell {
  const steps = f.ts?.[trackIdx] ?? 16
  const activeSteps = [f.kick, f.snare, f.clap, f.chh, f.ohh, f.ride, f.bass[0], f.fm[0], f.lead[0]][trackIdx]
  const baseNote = DRUM_VOICES.has(voiceId) ? defaultNote
    : voiceId === 'Bass303' || voiceId === 'Analog' ? f.bass[1]
    : voiceId === 'FM' ? f.fm[1] : f.lead[1]
  const drum = DRUM_VOICES.has(voiceId)

  const trigs = makeTrigs(steps, activeSteps, baseNote)
  let vp = defaultVoiceParams(voiceId)
  if (f.vp?.[trackIdx]) vp = { ...vp, ...f.vp[trackIdx] }

  // Apply per-step melodies, durations, and velocities
  const notes = f.mel?.[trackIdx]
  const durs = f.dur?.[trackIdx]
  const vels = f.vel?.[trackIdx]
  if (notes || vels) {
    let ni = 0
    for (let si = 0; si < trigs.length; si++) {
      const trig = trigs[si]
      if (trig.active && ni < (notes?.length ?? Infinity)) {
        if (notes && ni < notes.length) trig.note = notes[ni]
        if (durs && ni < durs.length) {
          const dur = durs[ni]
          trig.duration = dur
          for (let d = 1; d < dur && si + d < trigs.length; d++) {
            trigs[si + d].active = false
          }
        }
        if (vels && ni < vels.length) trig.velocity = vels[ni]
        ni++
      }
    }
  }

  const cellSends = f.sends?.[trackIdx]
  return {
    trackId: trackIdx,
    name,
    voiceId,
    steps,
    trigs,
    voiceParams: vp,
    reverbSend:  cellSends?.reverbSend ?? (drum ? 0.08 : 0.25),
    delaySend:   cellSends?.delaySend ?? (drum ? 0.00 : 0.12),
    glitchSend:  0,
    granularSend: 0,
  }
}

export const FACTORY_COUNT = FACTORY.length

/**
 * Build the VELVET song scene (~56s at 120 BPM).
 * Showcases: repeats, FX flavours, EQ automation, master fade-out.
 *
 * HAZE ×3 → VELVET ×2 → DRIFT ×3 → VELVET ×2 → BLOOM ×2 → VELVET ×2
 * shimmer    normal      tape dly    EQ sweep     stutter      fade out
 */
export function makeDefaultScene(patterns: Pattern[]): Scene {
  // ADR 093: modifier nodes for repeat/FX, pattern nodes are pure
  type Seq = { patIdx: number; x: number; y: number; fnBefore?: ModifierParams[] }

  const seq: Seq[] = [
    // 0 — HAZE ×3: shimmer reverb + tape delay (atmospheric intro)
    { patIdx: 0, x: 0.16, y: 0.42, fnBefore: [
      { repeat: { count: 3 } },
      { fx: { verb: true, delay: true, glitch: false, granular: false, flavourOverrides: { verb: 'shimmer', delay: 'tape' } } },
    ] },
    // 1 — VELVET ×2: main groove
    { patIdx: 1, x: 0.32, y: 0.35, fnBefore: [{ repeat: { count: 2 } }] },
    // 2 — DRIFT ×3: tape delay for spacious breakdown
    { patIdx: 2, x: 0.48, y: 0.45, fnBefore: [
      { repeat: { count: 3 } },
      { fx: { verb: true, delay: true, glitch: false, granular: false, flavourOverrides: { delay: 'tape' } } },
    ] },
    // 3 — VELVET ×2
    { patIdx: 1, x: 0.64, y: 0.35, fnBefore: [{ repeat: { count: 2 } }] },
    // 4 — BLOOM ×2: stutter glitch for climax energy
    { patIdx: 3, x: 0.80, y: 0.45, fnBefore: [
      { repeat: { count: 2 } },
      { fx: { verb: true, delay: false, glitch: true, granular: false, flavourOverrides: { glitch: 'stutter' } } },
    ] },
    // 5 — VELVET ×2: ending
    { patIdx: 1, x: 0.94, y: 0.35, fnBefore: [{ repeat: { count: 2 } }] },
  ]

  const nodes: SceneNode[] = []
  const edges: SceneEdge[] = []
  let fnIdx = 0
  let prevPatId: string | null = null

  for (let i = 0; i < seq.length; i++) {
    const s = seq[i]
    const patId = `sn_${String(i).padStart(2, '0')}`
    // Create modifier nodes before the pattern node
    const fnIds: string[] = []
    for (const fp of s.fnBefore ?? []) {
      const fnId = `fn_${String(fnIdx++).padStart(2, '0')}`
      const fnType = fp.repeat ? 'repeat' : fp.tempo ? 'tempo' : fp.transpose ? 'transpose' : 'fx'
      nodes.push({ id: fnId, type: fnType, x: s.x - 0.04 * (s.fnBefore!.length - fnIds.length), y: s.y, root: false, modifierParams: fp })
      fnIds.push(fnId)
    }
    // Chain modifier nodes together
    for (let j = 0; j < fnIds.length - 1; j++) {
      edges.push({ id: `fe_${fnIdx++}`, from: fnIds[j], to: fnIds[j + 1], order: 0 })
    }
    // Last modifier node → pattern node
    if (fnIds.length > 0) {
      edges.push({ id: `fe_${fnIdx++}`, from: fnIds[fnIds.length - 1], to: patId, order: 0 })
    }
    // Pattern node
    const isFirst = i === 0
    nodes.push({ id: patId, type: 'pattern', x: s.x, y: s.y, root: isFirst && fnIds.length === 0, patternId: patterns[s.patIdx].id })
    // If first node and has modifier nodes, root is the first modifier node
    if (isFirst && fnIds.length > 0) nodes.find(n => n.id === fnIds[0])!.root = true
    // Edge from previous pattern to this chain head
    if (prevPatId) {
      const chainHead = fnIds.length > 0 ? fnIds[0] : patId
      edges.push({ id: `se_${String(i).padStart(2, '0')}`, from: prevPatId, to: chainHead, order: 0 })
    }
    prevPatId = patId
  }

  return { name: 'Main', nodes, edges, labels: [], stamps: [] }
}

/**
 * Build a completely empty Song (for new projects).
 */
export function makeEmptySong(templateId?: string): Song {
  const tmpl = getTemplate(templateId)
  const tracks: Track[] = tmpl.tracks.map((d, trackIdx) =>
    makeTrack(trackIdx, d.pan)
  )
  const patterns: Pattern[] = []
  for (let i = 0; i < PATTERN_POOL_SIZE; i++) {
    patterns.push(makeEmptyPattern(i, '', templateId))
  }
  return {
    name: 'Untitled',
    bpm: 120,
    rootNote: 0,
    tracks,
    patterns,
    sections: [],
    scene: { name: 'Main', nodes: [], edges: [], labels: [], stamps: [] },
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
  const tracks: Track[] = FACTORY_TRACKS.map((d, trackIdx) =>
    makeTrack(trackIdx, d.pan)
  )

  const patterns: Pattern[] = []

  for (let i = 0; i < FACTORY.length; i++) {
    const f = FACTORY[i]
    patterns.push({
      id: makePatternId(i),
      name: f.name.slice(0, 8),
      color: 0,
      cells: FACTORY_TRACKS.map((d, trackIdx) =>
        buildFactoryCell(trackIdx, f, d.name, d.voiceId as VoiceId, d.note)
      ),
    })
  }
  for (let i = FACTORY.length; i < PATTERN_POOL_SIZE; i++) {
    patterns.push({
      id: makePatternId(i),
      name: '',
      color: 0,
      cells: FACTORY_TRACKS.map((d, trackIdx) =>
        makeEmptyCell(trackIdx, d.name, d.voiceId, d.note)
      ),
    })
  }

  return {
    name: FACTORY[0].name,
    bpm: 120,
    rootNote: 0,
    tracks,
    patterns,
    sections: [],
    scene: makeDefaultScene(patterns),
    effects: {
      reverb: { ...DEFAULT_EFFECTS.reverb },
      delay:  { ...DEFAULT_EFFECTS.delay },
      ducker: { ...DEFAULT_EFFECTS.ducker },
      comp:   { ...DEFAULT_EFFECTS.comp },
    },
  }
}
