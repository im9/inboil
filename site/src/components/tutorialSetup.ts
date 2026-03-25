/**
 * Shared tutorial pattern initialization for docs playground components.
 * Both PlaygroundMatrixView and PlaygroundSceneView call initTutorialPatterns().
 * The first call builds factory-quality patterns; subsequent calls are no-ops.
 */
import { song, fxPad } from '$app/lib/state.svelte.ts'
import { makeTrig, TRACK_DEFAULTS } from '$app/lib/factory.ts'
import { DRUM_VOICES } from '$app/lib/audio/dsp/voices.ts'
import { defaultVoiceParams } from '$app/lib/paramDefs.ts'
import type { Cell, VoiceId } from '$app/lib/types.ts'

type FDef = {
  name: string; bpm: number; key: number
  kick: number[]; snare: number[]; clap: number[]; chh: number[]
  ohh: number[]; cym: number[]; bass: [number[], number]; lead: [number[], number]
  vp?: Record<number, Record<string, number>>
  ts?: Record<number, number>
  mel?: Record<number, number[]>
  dur?: Record<number, number[]>
}

function makeTrigs(steps: number, activeSteps: number[], note: number) {
  return Array.from({ length: steps }, (_, i) => makeTrig(activeSteps.includes(i + 1), note))
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

// Key: G (7), 1 octave down — all melody/bass notes -12 from original
const LOFI: FDef = {
  name: 'LOFI', bpm: 85, key: 7,
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

const LFB: FDef = {
  name: 'LF.B', bpm: 85, key: 7,
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
  name: 'BRK', bpm: 85, key: 7,
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

// Break2: hi-hat driven variation with syncopated kick
const BREAK2: FDef = {
  name: 'BRK2', bpm: 85, key: 7,
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

let initialized = false

/** Build tutorial patterns from factory data. Safe to call multiple times. */
export function initTutorialPatterns() {
  if (initialized) return
  initialized = true

  song.bpm = 85
  song.rootNote = 7  // G

  // EQ: boost low +4dB, mid +3dB
  fxPad.eqLow = { ...fxPad.eqLow, y: 0.50 + 4 / 24 }
  fxPad.eqMid = { ...fxPad.eqMid, y: 0.50 + 3 / 24 }

  const defs: [FDef, string, number][] = [
    [LOFI, 'Verse', 0], [LFB, 'Chorus', 1], [BREAK, 'Break', 2], [BREAK2, 'Break2', 3],
  ]
  for (let p = 0; p < defs.length; p++) {
    const [f, name, color] = defs[p]
    const pat = song.patterns[p]
    pat.name = name
    pat.color = color
    pat.cells = TRACK_DEFAULTS.map((td, i) => buildCell(i, f, td))
  }
}

/** Set up scene with nodes, edges, and decorators. */
export function initTutorialScene() {
  initTutorialPatterns()

  // Layout: slightly irregular hand-placed feel
  // Flow: Verse → Chorus → (Break | Break2) → Verse (fork at Chorus)
  song.scene.nodes = [
    { id: 'n1', type: 'pattern', patternId: song.patterns[0]?.id ?? 'pat_00', x: 0.48, y: 0.37, root: true,
      decorators: [{ type: 'repeat', params: { count: 2 } }, { type: 'fx', params: { verb: true, glitch: true } }] },
    { id: 'n2', type: 'pattern', patternId: song.patterns[1]?.id ?? 'pat_01', x: 0.52, y: 0.48,
      decorators: [{ type: 'repeat', params: { count: 2 } }, { type: 'fx', params: { verb: true, glitch: true } }] },
    { id: 'n3', type: 'pattern', patternId: song.patterns[2]?.id ?? 'pat_02', x: 0.36, y: 0.63,
      decorators: [{ type: 'fx', params: { verb: true, glitch: true } }] },
    { id: 'n4', type: 'pattern', patternId: song.patterns[3]?.id ?? 'pat_03', x: 0.62, y: 0.66,
      decorators: [{ type: 'fx', params: { verb: true, glitch: true } }] },
  ]
  song.scene.edges = [
    { id: 'e1', from: 'n1', to: 'n2', order: 0 },
    { id: 'e2', from: 'n2', to: 'n3', order: 0 },  // Chorus → Break
    { id: 'e3', from: 'n2', to: 'n4', order: 1 },  // Chorus → Break2 (fork!)
    { id: 'e4', from: 'n3', to: 'n1', order: 0 },  // Break → Verse
    { id: 'e5', from: 'n4', to: 'n1', order: 0 },  // Break2 → Verse
  ]
  song.scene.labels = []
  song.scene.stamps = []
}
