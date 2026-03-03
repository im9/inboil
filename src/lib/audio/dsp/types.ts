/**
 * Message types for UI ↔ AudioWorklet communication.
 */

export interface WorkletCommand {
  type: 'play' | 'stop' | 'setBpm' | 'setPattern'
  bpm?: number
  pattern?: WorkletPattern
  reset?: boolean
}

export interface WorkletPattern {
  bpm: number
  tracks: WorkletTrack[]
  fx: {
    reverb:  { size: number; damp: number }
    delay:   { time: number; feedback: number }
    ducker:  { depth: number; release: number }
    comp:    { threshold: number; ratio: number; makeup: number }
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
  }
}

export interface WorkletTrack {
  steps: number; trigs: WorkletTrig[]
  muted: boolean; synthType: string
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
  paramLocks?: Record<string, number>  // per-step voice param overrides (P-Lock)
}

export interface WorkletEvent {
  type: 'step'; playheads: number[]
}
