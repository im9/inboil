/**
 * Message types for UI ↔ AudioWorklet communication.
 */

export interface WorkletCommand {
  type: 'play' | 'stop' | 'setBpm' | 'setPattern' | 'triggerNote' | 'releaseNote' | 'releaseNoteByPitch' | 'loadSample' | 'loadZones'
  bpm?: number
  pattern?: WorkletPattern
  reset?: boolean
  trackId?: number
  note?: number
  velocity?: number
  buffer?: Float32Array    // loadSample: mono sample data
  sampleRate?: number      // loadSample: original sample rate
  zones?: import('./voices.ts').SampleZone[]  // loadZones: multi-sample zones (ADR 106)
}

export interface WorkletPattern {
  bpm: number
  tracks: WorkletTrack[]
  fx: {
    reverb:  { size: number; damp: number }
    delay:   { time: number; feedback: number }
    ducker:  { depth: number; release: number }
    comp:    { threshold: number; ratio: number; makeup: number; attack: number; release: number }
    verbReturn: number
    dlyReturn:  number
    filter:  { on: boolean; x: number; y: number }
    eq:      { bands: Array<{ on: boolean; freq: number; gain: number; q: number; shelf?: boolean }> }
    shimmerAmount: number   // 0 = off, >0 = shimmer reverb pitch-shift feedback level
    reverbFlavour?: 'room' | 'hall' | 'shimmer'  // ADR 120: per-flavour engine routing (undefined = verb pad OFF)
    earlyReflections?: { size: number; damp: number }  // ADR 120: Room front-end
    preDelay?: { ms: number }    // ADR 120: Hall pre-delay
    modDepth?: number            // ADR 120: Hall comb modulation depth (0–4 samples)
    sat: { drive: number; tone: number } | null  // tape saturator — null = off
  }
  perf: {
    rootNote: number
    octave: number
    breaking: boolean
    masterGain: number
    filling: boolean
    reversing: boolean
    glitchX: number
    glitchY: number
    granularOn: boolean
    granularX: number
    granularY: number
    granularPitch: number
    granularScatter: number
    granularFreeze: boolean
    swing: number
    glitchRedux: boolean    // ADR 075: Redux flavour skips bit quantize
    delayTape: boolean      // ADR 075: Tape delay flavour (LP + wow/flutter)
    glitchStutter: boolean  // ADR 075: Stutter glitch flavour (buffer repeat)
    // Kaoss Pad (ADR 097)
    perfX: number
    perfY: number
    perfTouching: boolean
    tiltX: number
    tiltY: number
    // Glitch effects (ADR 097 Phase 2)
    stuttering: boolean
    halfSpeed: boolean
    tapeStop: boolean
  }
}

/** Per-track insert FX slot (ADR 077) */
export interface WorkletInsertFx {
  type: 'verb' | 'delay' | 'glitch' | null
  mix: number
  x: number
  y: number
  // flavour-specific flags
  hall?: boolean      // reverb: hall flavour
  dotted?: boolean    // delay: dotted flavour
  tape?: boolean      // delay: tape flavour
  redux?: boolean     // glitch: redux flavour
}

export interface WorkletTrack {
  steps: number; trigs: WorkletTrig[]
  muted: boolean; voiceId: string
  sidechainSource: boolean  // ADR 064: triggers ducker & bypasses ducking
  volume: number
  pan: number
  reverbSend: number; delaySend: number
  glitchSend: number; granularSend: number
  voiceParams: Record<string, number>
  insertFx?: [WorkletInsertFx | null, WorkletInsertFx | null]  // ADR 077/114: dual insert FX chain
  scale?: number              // ADR 112: step divisor (default 2 = 1/16)
}

export interface WorkletTrig {
  active: boolean; note: number; velocity: number
  duration: number  // step count 1-16, default 1
  slide: boolean    // default false
  chance?: number   // 0.0–1.0, undefined = always fire
  notes?: number[]  // poly: all chord notes (includes primary `note`); absent = mono [note]
  paramLocks?: Record<string, number>  // per-step voice param overrides (P-Lock)
}

export type WorkletEvent =
  | { type: 'step'; playheads: number[]; cycle: boolean }
  | { type: 'levels'; peakL: number; peakR: number; gr: number; cpu?: number }
