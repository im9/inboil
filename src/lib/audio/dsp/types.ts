/**
 * Message types for UI ↔ AudioWorklet communication.
 */

export interface WorkletCommand {
  type: 'play' | 'stop' | 'setBpm' | 'setPattern' | 'triggerNote' | 'releaseNote' | 'loadSample'
  bpm?: number
  pattern?: WorkletPattern
  reset?: boolean
  trackId?: number
  note?: number
  velocity?: number
  buffer?: Float32Array    // loadSample: mono sample data
  sampleRate?: number      // loadSample: original sample rate
}

export interface WorkletPattern {
  bpm: number
  tracks: WorkletTrack[]
  fx: {
    reverb:  { size: number; damp: number }
    delay:   { time: number; feedback: number }
    ducker:  { depth: number; release: number }
    comp:    { threshold: number; ratio: number; makeup: number }
    verbReturn: number
    dlyReturn:  number
    filter:  { on: boolean; x: number; y: number }
    eq:      { bands: Array<{ on: boolean; freq: number; gain: number }> }
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
    glitchRedux: boolean  // ADR 075: Redux flavour skips bit quantize
  }
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
  | { type: 'levels'; peakL: number; peakR: number }
