/**
 * Demo project builder for welcome overlay.
 * Builds a 4-pattern lo-fi project with scene graph — same data as the
 * docs tutorial (site/src/components/tutorialSetup.ts) but standalone.
 */
import { makeTrig, TRACK_DEFAULTS, makeEmptyPattern, makeTrack, PATTERN_POOL_SIZE } from './factory.ts'
import { DRUM_VOICES } from './audio/dsp/voices.ts'
import { defaultVoiceParams } from './paramDefs.ts'
import { DEFAULT_EFFECTS } from './constants.ts'
import type { Cell, Song, VoiceId, SceneNode, SceneDecorator } from './types.ts'

type FDef = {
  name: string; bpm: number; key: number
  kick: number[]; snare: number[]; clap: number[]; chh: number[]
  ohh: number[]; cym: number[]; bass: [number[], number]; lead: [number[], number]
  vp?: Record<number, Record<string, number>>
  ts?: Record<number, number>
  mel?: Record<number, number[]>
  dur?: Record<number, number[]>
}

function makeTrigs(steps: number, active: number[], note: number) {
  return Array.from({ length: steps }, (_, i) => makeTrig(active.includes(i + 1), note))
}

function buildCell(trackIdx: number, f: FDef, td: typeof TRACK_DEFAULTS[0]): Cell {
  const steps = f.ts?.[trackIdx] ?? 16
  const activeSteps = [f.kick, f.snare, f.clap, f.chh, f.ohh, f.cym, f.bass[0], f.lead[0]][trackIdx]
  const voiceId = td.voiceId as VoiceId
  const drum = DRUM_VOICES.has(voiceId)
  const baseNote = drum ? td.note
    : voiceId === 'Bass303' || voiceId === 'Analog' ? f.bass[1] : f.lead[1]

  const trigs = makeTrigs(steps, activeSteps, baseNote)
  let vp = defaultVoiceParams(voiceId)
  if (f.vp?.[trackIdx]) vp = { ...vp, ...f.vp[trackIdx] }

  const notes = f.mel?.[trackIdx]
  const durs = f.dur?.[trackIdx]
  if (notes) {
    let ni = 0
    for (let si = 0; si < trigs.length; si++) {
      if (trigs[si].active && ni < notes.length) {
        trigs[si].note = notes[ni]
        if (durs && ni < durs.length) {
          const dur = durs[ni]
          trigs[si].duration = dur
          for (let d = 1; d < dur && si + d < trigs.length; d++) trigs[si + d].active = false
        }
        ni++
      }
    }
  }
  return {
    trackId: trackIdx, name: td.name, voiceId, steps, trigs, voiceParams: vp,
    reverbSend: drum ? 0.18 : 0.40, delaySend: drum ? 0.00 : 0.12, glitchSend: drum ? 0.04 : 0.08, granularSend: 0,
  }
}

// ── Pattern definitions (lo-fi set, key=G) ──────────────────────────

const VERSE: FDef = {
  name: 'Verse', bpm: 85, key: 7,
  kick: [1,6,9,14], snare: [5,13], clap: [], chh: [1,3,5,7,9,11,13,15],
  ohh: [7,15], cym: [],
  bass: [[1,4,7,10], 36], lead: [[1,4,7,10,13,16,19,22], 55],
  ts: { 6: 12, 7: 24 },
  mel: { 6: [45,43,41,36], 7: [57,60,59,55,52,55,57,52] },
  dur: { 6: [2,2,2,3], 7: [2,2,3,2,2,3,2,4] },
  vp: {
    0: { pitchStart: 250, ampDecay: 0.40, drive: 0.8 },
    1: { noiseFc: 2000, noiseAmt: 0.60 },
    3: { volume: 0.40, hpCutoff: 4000 },
    6: { cutoffBase: 120, envMod: 2500, resonance: 3.0 },
    7: { cutoffBase: 250, envMod: 3000, resonance: 1.2 },
  },
}

const CHORUS: FDef = {
  name: 'Chorus', bpm: 85, key: 7,
  kick: [1,5,9,13], snare: [5,13], clap: [5,13], chh: [1,3,5,7,9,11,13,15],
  ohh: [3,11,15], cym: [1],
  bass: [[1,4,7,10], 36], lead: [[1,3,5,7,9,11,13,15,17,19,21,23], 55],
  ts: { 6: 12, 7: 24 },
  mel: { 6: [36,40,43,45], 7: [55,57,59,60,62,60,59,57,55,52,55,57] },
  dur: { 6: [2,3,2,3], 7: [2,2,2,2,2,2,2,2,2,2,2,4] },
  vp: {
    0: { pitchStart: 220, ampDecay: 0.35, drive: 0.9 },
    1: { noiseFc: 2200, noiseAmt: 0.55 },
    3: { volume: 0.45, hpCutoff: 4200 },
    6: { cutoffBase: 140, envMod: 3000, resonance: 3.5 },
    7: { cutoffBase: 300, envMod: 3500, resonance: 1.5 },
  },
}

const BREAK: FDef = {
  name: 'Break', bpm: 85, key: 7,
  kick: [1, 11], snare: [9], clap: [], chh: [1, 5, 9, 13],
  ohh: [7, 15], cym: [1],
  bass: [[1, 9], 36], lead: [[], 55],
  mel: { 6: [36, 36] },
  dur: { 6: [4, 4] },
  vp: {
    0: { pitchStart: 250, ampDecay: 0.50, drive: 0.7 },
    3: { volume: 0.35, hpCutoff: 4000 },
    6: { cutoffBase: 100, envMod: 2000, resonance: 2.5 },
  },
}

const BREAK2: FDef = {
  name: 'Break2', bpm: 85, key: 7,
  kick: [1, 7, 13], snare: [5, 11], clap: [5], chh: [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15],
  ohh: [4, 8, 12, 16], cym: [],
  bass: [[1, 5, 9, 13], 36], lead: [[], 55],
  mel: { 6: [36, 40, 43, 36] },
  dur: { 6: [2, 2, 2, 2] },
  vp: {
    0: { pitchStart: 220, ampDecay: 0.35, drive: 0.8 },
    3: { volume: 0.50, hpCutoff: 3500 },
    6: { cutoffBase: 110, envMod: 2200, resonance: 3.0 },
  },
}

const DEMO_PATTERNS: [FDef, string, number][] = [
  [VERSE, 'Verse', 0], [CHORUS, 'Chorus', 1], [BREAK, 'Break', 2], [BREAK2, 'Break2', 3],
]

/** Build a demo Song with 4 lo-fi patterns + forking scene graph */
export function makeDemoSong(): Song {
  const tracks = TRACK_DEFAULTS.map((d, i) => makeTrack(i, d.pan))
  const patterns = DEMO_PATTERNS.map(([f, name, color], i) => ({
    id: `pat_${String(i).padStart(2, '0')}`,
    name,
    color,
    cells: TRACK_DEFAULTS.map((td, ti) => buildCell(ti, f, td)),
  }))
  // Fill remaining slots with empty patterns
  for (let i = patterns.length; i < PATTERN_POOL_SIZE; i++) {
    patterns.push(makeEmptyPattern(i))
  }

  // Scene graph: Verse → Chorus → (Break | Break2) → Verse
  const fxDec: SceneDecorator = { type: 'fx', params: { verb: 1, glitch: 1 } }
  const nodes: SceneNode[] = [
    { id: 'n1', type: 'pattern', patternId: patterns[0].id, x: 0.48, y: 0.37, root: true,
      decorators: [{ type: 'repeat', params: { count: 2 } }, fxDec] },
    { id: 'n2', type: 'pattern', patternId: patterns[1].id, x: 0.52, y: 0.48, root: false,
      decorators: [{ type: 'repeat', params: { count: 2 } }, fxDec] },
    { id: 'n3', type: 'pattern', patternId: patterns[2].id, x: 0.36, y: 0.63, root: false,
      decorators: [fxDec] },
    { id: 'n4', type: 'pattern', patternId: patterns[3].id, x: 0.62, y: 0.66, root: false,
      decorators: [fxDec] },
  ]
  const edges = [
    { id: 'e1', from: 'n1', to: 'n2', order: 0 },
    { id: 'e2', from: 'n2', to: 'n3', order: 0 },
    { id: 'e3', from: 'n2', to: 'n4', order: 1 },
    { id: 'e4', from: 'n3', to: 'n1', order: 0 },
    { id: 'e5', from: 'n4', to: 'n1', order: 0 },
  ]

  return {
    name: 'Demo',
    bpm: 85,
    rootNote: 7,
    tracks,
    patterns,
    sections: [],
    scene: { name: 'Main', nodes, edges, labels: [] },
    effects: {
      reverb: { ...DEFAULT_EFFECTS.reverb },
      delay:  { ...DEFAULT_EFFECTS.delay },
      ducker: { ...DEFAULT_EFFECTS.ducker },
      comp:   { ...DEFAULT_EFFECTS.comp },
    },
  }
}
