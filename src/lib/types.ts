// Shared type definitions for inboil — extracted from state.svelte.ts
// All domain interfaces live here; reactive state stays in state.svelte.ts.

import type { VoiceId as _VoiceId } from './audio/dsp/voices.ts'
import type { FxFlavours as _FxFlavours } from './constants.ts'
export type VoiceId = _VoiceId
export type FxFlavours = _FxFlavours

export type BrushMode = 'draw' | 'eraser' | 'chord' | 'strum'
export type ChordShape = 'triad' | '7th' | 'sus2' | 'sus4'

export interface Trig {
  active: boolean
  note: number      // MIDI note (60 = C4) — primary / mono note
  velocity: number  // 0.0–1.0
  duration: number  // step count 1-16 (default 1)
  slide: boolean    // slide/glide to next note (default false)
  chance?: number   // 0.0–1.0, undefined = always fire (100%)
  notes?: number[]  // poly: all chord notes (includes primary `note`); absent = mono [note]
  paramLocks?: Record<string, number>  // per-step voice param overrides (P-Lock)
}

/** Per-track insert FX slot (ADR 077) */
export interface CellInsertFx {
  type: 'verb' | 'delay' | 'glitch' | null  // null = bypass
  flavour: string       // 'room', 'hall', 'dotted', 'tape', 'bitcrush', 'redux', etc.
  mix: number           // 0.0–1.0 dry/wet
  x: number             // 0.0–1.0 param1 (type-dependent)
  y: number             // 0.0–1.0 param2 (type-dependent)
}

/** Inline step data for one track in one section (ADR 042, replaces Phrase) */
export interface Cell {
  trackId: number          // stable reference to Track.id (ADR 079)
  name: string            // per-pattern track name (ADR 062)
  voiceId: VoiceId | null  // per-pattern instrument (null = unassigned)
  steps: number           // 1–64
  trigs: Trig[]           // length === steps
  voiceParams: Record<string, number>
  presetName?: string     // last applied preset name (for UI recall)
  reverbSend: number      // 0.0–1.0
  delaySend: number
  glitchSend: number
  granularSend: number
  insertFx?: CellInsertFx  // per-track insert FX (ADR 077)
}

export interface ChainFx {
  on: boolean
  x: number
  y: number
}

/** Reusable pattern — name + color + N tracks of step data (ADR 044, 049, 056) */
export interface Pattern {
  id: string              // e.g. 'pat_00'
  name: string            // max 8 chars
  color: number           // index into PATTERN_COLORS (0–7)
  cells: Cell[]           // one per track (up to 16)
}

/** @deprecated Linear arrangement slot (ADR 042). Superseded by Scene graph (ADR 044).
 *  Retained for backwards compatibility with saved data; no new features should target Section. */
export interface Section {
  patternIndex: number    // index into Song.patterns
  repeats: number         // 1–16
  key?: number            // root note override (0–11)
  oct?: number            // octave override
  perf?: number           // 0=NONE, 1=FILL, 2=BRK, 3=REV
  perfLen?: number        // steps (1/4/8/16)
  verb?: ChainFx
  delay?: ChainFx
  glitch?: ChainFx
  granular?: ChainFx
  flavours?: Partial<import('./constants.ts').FxFlavours>  // per-section flavour override (ADR 076)
}

/** Track = mixer channel (ADR 080: name/voiceId moved to Cell per ADR 062) */
export interface Track {
  id: number
  muted: boolean
  volume: number
  pan: number
}

export interface Effects {
  reverb: { size: number; damp: number }
  delay:  { time: number; feedback: number }
  ducker: { depth: number; release: number }
  comp:   { threshold: number; ratio: number; makeup: number; attack: number; release: number }
}

/** Function decorator attached to a pattern node (ADR 062) */
export interface SceneDecorator {
  type: 'transpose' | 'tempo' | 'repeat' | 'fx' | 'automation'
  params: Record<string, number>
  automationParams?: AutomationParams  // for type === 'automation'
  flavourOverrides?: Partial<import('./constants.ts').FxFlavours>  // for type === 'fx' (ADR 076)
}

/** Automation curve point (ADR 053) */
export interface AutomationPoint {
  t: number  // 0.0–1.0 — position within pattern duration
  v: number  // 0.0–1.0 — normalized parameter value
}

/** Automation target parameter (ADR 053) */
export type AutomationTarget =
  | { kind: 'global'; param: 'tempo' | 'masterVolume' | 'swing'
                            | 'compThreshold' | 'compRatio' | 'compMakeup' | 'compAttack' | 'compRelease'
                            | 'duckDepth' | 'duckRelease' | 'retVerb' | 'retDelay' }
  | { kind: 'track';  trackIndex: number; param: 'volume' | 'pan' }
  | { kind: 'fx';     param: 'reverbWet' | 'reverbDamp' | 'delayTime' | 'delayFeedback'
                            | 'filterCutoff' | 'glitchX' | 'glitchY' | 'granularSize' | 'granularDensity' }
  | { kind: 'eq';     band: 'eqLow' | 'eqMid' | 'eqHigh'; param: 'freq' | 'gain' | 'q' }
  | { kind: 'send';   trackIndex: number; param: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend' }

/** Automation node parameters (ADR 053) */
export interface AutomationParams {
  target: AutomationTarget
  points: AutomationPoint[]
  interpolation: 'linear' | 'smooth'
}

/** Snapshot of values that decorators may mutate, so they can be restored after scene playback */
export interface AutomationSnapshot {
  values: Record<string, number>
  fxPad: Record<string, Record<string, number | boolean>>
  fxFlavours: import('./constants.ts').FxFlavours
  masterPad: Record<string, Record<string, number | boolean>>
  comp: { makeup: number; attack: number; release: number }
}

/** Generative engine type (ADR 078) */
export type GenerativeEngine = 'turing' | 'quantizer' | 'tonnetz'

/** Generative node configuration (ADR 078, auto-mode ADR 089) */
export interface GenerativeConfig {
  engine: GenerativeEngine
  mergeMode: 'replace' | 'merge' | 'layer'
  targetTrack: number            // target cell index in the pattern (0-based)
  seed?: number
  params: TuringParams | QuantizerParams | TonnetzParams
}

/** Turing Machine / shift-register random (ADR 078) */
export interface TuringParams {
  engine: 'turing'
  length: number           // register length (2–32 steps)
  lock: number             // 0.0 = fully random, 1.0 = fully locked loop
  range: [number, number]  // output note range (MIDI note numbers)
  mode: 'note' | 'gate' | 'velocity'
  density: number          // 0.0–1.0 — probability of a step being active (gate mode)
}

/** Quantizer — scale-constrained note mapping (ADR 078, Phase 2) */
export interface QuantizerParams {
  engine: 'quantizer'
  scale: string            // e.g. 'major', 'minor', 'dorian', 'pentatonic'
  root: number             // 0–11 (C=0)
  octaveRange: [number, number]
}

/** Tonnetz / neo-Riemannian chord transform (ADR 078, Phase 3) */
export interface TonnetzParams {
  engine: 'tonnetz'
  startChord: [number, number, number]
  sequence: string[]       // 'P' | 'L' | 'R' | 'PL' | 'PR' | 'LR' | 'PLR'
  stepsPerChord: number
  voicing: 'close' | 'spread' | 'drop2'
}

/** Legacy function node types — kept for migration only */
type LegacyFnType = 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx' | 'automation'

/** Node on the scene canvas (ADR 044, updated ADR 078) */
export interface SceneNode {
  id: string
  type: 'pattern' | 'generative' | LegacyFnType
  x: number               // canvas position (normalized 0–1)
  y: number
  root: boolean           // true = playback entry point (exactly one)
  patternId?: string      // for type === 'pattern'
  params?: Record<string, number>
  automationParams?: AutomationParams  // for type === 'automation' (legacy)
  decorators?: SceneDecorator[]  // function decorators attached to pattern nodes (ADR 062)
  generative?: GenerativeConfig  // for type === 'generative' (ADR 078)
}

/** Directed edge between nodes (ADR 044) */
export interface SceneEdge {
  id: string
  from: string            // source node id
  to: string              // target node id
  order: number           // playback order when multiple edges from same source
}

/** Free-floating text label on the scene canvas (ADR 052) */
export interface SceneLabel {
  id: string
  text: string
  x: number               // normalized 0–1
  y: number
  size?: number            // font scale factor (default 1.0 = 10px)
}

/** Scene = the arrangement graph (ADR 044) */
export interface Scene {
  name: string
  nodes: SceneNode[]
  edges: SceneEdge[]
  labels: SceneLabel[]
}

/** Song = pattern pool + arrangement sections + scene graph (ADR 044) */
export interface Song {
  name: string
  bpm: number
  rootNote: number        // 0–11
  tracks: Track[]         // max 16 (stepActions.ts MAX_TRACKS)
  patterns: Pattern[]     // pattern pool (ADR 044)
  sections: Section[]     // arrangement slots referencing patterns
  scene: Scene            // arrangement graph (ADR 044, data-only in Phase 1a)
  effects: Effects        // global send/bus effects (ADR 020)
  flavours?: FxFlavours   // FX flavour variants (ADR 075), optional for backwards compat
  fxPadState?: Record<string, Record<string, number | boolean>>     // FX/EQ pad state
  masterPadState?: Record<string, Record<string, number | boolean>> // master bus pad state
  masterGain?: number   // master output volume (0–1), persisted per project
  swing?: number        // swing amount (0–1), persisted per project
}

/** MIDI input device descriptor */
export interface MidiDevice {
  id: string
  name: string
  manufacturer: string
  connected: boolean
}

/** In-memory sample state per track (survives navigation, persisted to IndexedDB) */
export interface SampleMeta {
  name: string
  waveform: Float32Array
  rawBuffer: ArrayBuffer
}

export type Lang = 'ja' | 'en'
