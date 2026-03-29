// Shared type definitions for inboil — extracted from state.svelte.ts
// All domain interfaces live here; reactive state stays in state.svelte.ts.

import type { VoiceId as _VoiceId } from './audio/dsp/voices.ts'
import type { FxFlavours as _FxFlavours } from './constants.ts'
export type VoiceId = _VoiceId
export type FxFlavours = _FxFlavours

export type BrushMode = 'draw' | 'eraser' | 'chord' | 'strum' | 'select'
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
  type: 'verb' | 'delay' | 'glitch' | 'dist' | null  // null = bypass
  flavour: string       // 'room', 'hall', 'dotted', 'tape', 'bitcrush', 'redux', etc.
  mix: number           // 0.0–1.0 dry/wet
  x: number             // 0.0–1.0 param1 (type-dependent)
  y: number             // 0.0–1.0 param2 (type-dependent)
}

/** Per-cell sample reference (ADR 110) — which sample to load for this pattern×track */
export interface CellSampleRef {
  name: string         // display name (filename or pack name)
  packId?: string      // factory pack id — zones re-hydrated from pool on load
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
  insertFx?: [CellInsertFx | null, CellInsertFx | null]  // dual insert FX chain (ADR 077, 114)
  sampleRef?: CellSampleRef // per-cell sample reference (ADR 110)
  scale?: number            // ADR 112: step divisor (default 2 = 1/16)
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
  rootNote?: number       // 0–11, per-pattern key override (undefined → song.rootNote)
}

/** @deprecated Linear arrangement slot (ADR 042). Superseded by Scene (ADR 044).
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

/** @deprecated Use ModifierType nodes instead (ADR 093). Kept for save migration only. */
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
                            | 'filterCutoff' | 'filterResonance'
                            | 'glitchX' | 'glitchY' | 'granularSize' | 'granularDensity' }
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
  perf?: { reverbHold: boolean; delayHold: boolean; glitchHold: boolean; granularHold: boolean }  // ADR 123
}

/** Generative engine type (ADR 078) */
export type GenerativeEngine = 'turing' | 'quantizer' | 'tonnetz'

/** Generative node configuration (ADR 078, auto-mode ADR 089) */
export interface GenerativeConfig {
  engine: GenerativeEngine
  mergeMode: 'replace' | 'merge' | 'layer'
  targetTrack?: number           // target cell trackId (undefined = not yet selected)
  seed?: number
  params: TuringParams | QuantizerParams | TonnetzParams
}

/** Turing Machine / shift-register random (ADR 078) */
export interface TuringParams {
  engine: 'turing'
  length: number           // register length (2–target steps)
  lock: number             // 0.0 = fully random, 1.0 = fully locked loop
  range: [number, number]  // output note range (MIDI note numbers)
  mode: 'note' | 'gate' | 'velocity'
  density: number          // 0.0–1.0 — probability of a step being active (gate mode)
}

/** Chord definition for Quantizer chord mode (ADR 127) */
export interface QuantizerChord {
  step: number             // step position where this chord starts
  notes: number[]          // chord tones (pitch classes 0–11)
}

/** Harmony voice definition for Quantizer harmony mode (ADR 127) */
export interface HarmonyVoice {
  interval: number         // diatonic interval: 3 = 3rd, 5 = 5th, etc.
  direction: 'above' | 'below'
}

/** Quantizer — scale-constrained note mapping (ADR 078 Phase 2, ADR 127 chord/harmony) */
export interface QuantizerParams {
  engine: 'quantizer'
  scale: string            // e.g. 'major', 'minor', 'dorian', 'pentatonic'
  root: number             // 0–11 (C=0)
  octaveRange: [number, number]
  mode?: 'scale' | 'chord' | 'harmony'  // default: 'scale' (backward compat)

  // Chord mode: snap to chord tones with scale fallback
  chords?: QuantizerChord[]
  chordSource?: { nodeId: string }       // reference a Tonnetz node's walk

  // Harmony mode: add parallel diatonic voices
  harmonyVoices?: HarmonyVoice[]
}

/** Rhythm pattern for Tonnetz generation (ADR 126 v2) */
export type TonnetzRhythm =
  | boolean[]                                  // explicit pattern
  | 'all'                                      // every step active (default)
  | 'legato'                                   // first step of each chord active, rest held
  | 'offbeat'                                  // . x . x . x . x
  | 'onbeat'                                   // x . . . x . . .
  | 'syncopated'                               // x . x . . x . x
  | { preset: 'euclidean'; hits: number }      // Bjorklund distribution
  | { preset: 'turing'; length: number; lock: number; seed?: number }  // shift-register stochastic rhythm

/** Anchor: force a specific chord at a specific step (ADR 126 v2) */
export interface TonnetzAnchor {
  step: number
  chord: [number, number, number]
}

/** Arpeggio mode for Tonnetz chords */
export interface TonnetzArp {
  mode: 'up' | 'down' | 'updown' | 'random'
  seed?: number              // seed for 'random' mode determinism
}

/** Tonnetz / neo-Riemannian per-step transforms (ADR 078, rewritten ADR 126 v2) */
export interface TonnetzParams {
  engine: 'tonnetz'
  startChord: [number, number, number]
  voicing: 'close' | 'spread' | 'drop2'
  sequence: string[]         // transform ops: 'P'|'L'|'R'|'PL'|'PR'|'LR'|'PLR'|'' (hold)
  stepsPerTransform?: number // how many steps each chord is held (default: 1, range 1–64)
  rhythm?: TonnetzRhythm     // which steps are active (default: 'all'; 'legato' = first of each chord)
  anchors?: TonnetzAnchor[]  // explicit chord resets at specific steps
  arp?: TonnetzArp           // arpeggio: cycle chord notes across steps instead of full chords
  chordQuality?: 'triad' | '7th' // 7th adds a 4th note: maj7 for major, min7 for minor (default: triad)

  // Legacy fields (migration only — stripped after restore)
  stepsPerChord?: number
  slots?: TonnetzSlot[]
}

/** @deprecated v1 slot type — kept for migration only */
export type TonnetzSlot =
  | { op: string; steps?: number; rhythm?: TonnetzRhythm }
  | { chord: [number, number, number]; steps?: number; rhythm?: TonnetzRhythm }

/** Modifier + sweep node types (ADR 093, sweep ADR 118, terminology ADR 125) */
export type ModifierType = 'transpose' | 'tempo' | 'repeat' | 'fx' | 'sweep'

/** Sweep automation target (ADR 118) — continuous parameters only */
export type SweepTarget =
  | { kind: 'master'; param: 'masterVolume' | 'swing'
                           | 'compThreshold' | 'compRatio'
                           | 'duckDepth' | 'duckRelease'
                           | 'retVerb' | 'retDelay'
                           | 'satDrive' | 'satTone'
                           | 'filterCutoff' | 'filterResonance' }
  | { kind: 'track'; trackId: number; param: 'volume' | 'pan' | 'cutoff' | 'resonance' | 'decay' | 'tone' }
  | { kind: 'send';  trackId: number; param: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend' }
  | { kind: 'fx';    param: 'reverbWet' | 'reverbDamp' | 'delayTime' | 'delayFeedback'
                          | 'glitchX' | 'glitchY' | 'granularSize' | 'granularDensity' }
  | { kind: 'eq';    band: 'eqLow' | 'eqMid' | 'eqHigh'; param: 'freq' | 'gain' | 'q' }

/** A single painted sweep curve (ADR 118) */
export interface SweepCurve {
  target: SweepTarget
  points: { t: number; v: number }[]  // t: 0–1 (sweep progress), v: 0–1 (absolute normalized value)
  color: string
}

/** Boolean sweep toggle target (ADR 123, ADR 128) */
export type SweepToggleTarget =
  | { kind: 'hold';  fx: 'verb' | 'delay' | 'glitch' | 'granular' }
  | { kind: 'fxOn';  fx: 'verb' | 'delay' | 'glitch' | 'granular' }
  | { kind: 'mute';  trackId: number }
  | { kind: 'perf';  param: 'fill' | 'rev' | 'brk' }

/** A single boolean toggle curve — points with explicit ON/OFF state (ADR 123) */
export interface SweepToggleCurve {
  target: SweepToggleTarget
  points: { t: number; on: boolean }[]  // sorted by t; each point: "from here, be on/off"
  color: string
}

/** Sweep automation data stored on sweep modifier node (ADR 118) */
export interface SweepData {
  curves: SweepCurve[]
  toggles?: SweepToggleCurve[]  // boolean automation (ADR 123)
  /** Total recording duration in ms — used for global sweep playback timing (ADR 123 Phase 5) */
  durationMs?: number
  /** Offset from scene play start to recording start in ms (ADR 123 Phase 5) */
  offsetMs?: number
}

/** Modifier/sweep node parameters — type-specific (ADR 093, sweep ADR 118, terminology ADR 125) */
export interface ModifierParams {
  transpose?: { semitones: number; mode: 'rel' | 'abs'; key?: number }
  tempo?: { bpm: number }
  repeat?: { count: number }
  fx?: { verb: boolean; delay: boolean; glitch: boolean; granular: boolean; flavourOverrides?: Partial<import('./constants.ts').FxFlavours> }
  sweep?: SweepData
}

/** Legacy modifier types — kept for migration only */
type LegacyModifierType = 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx' | 'automation'

/** Node on the scene canvas (ADR 044, updated ADR 093) */
export interface SceneNode {
  id: string
  type: 'pattern' | 'generative' | 'probability' | ModifierType | LegacyModifierType
  x: number               // canvas position (normalized 0–1)
  y: number
  root: boolean           // true = playback entry point (exactly one)
  patternId?: string      // for type === 'pattern'
  params?: Record<string, number>       // legacy modifier node params (migration only)
  automationParams?: AutomationParams   // legacy automation (migration only)
  modifierParams?: ModifierParams        // modifier/sweep node params (ADR 093, ADR 125)
  fnParams?: ModifierParams             // @deprecated alias — migrated to modifierParams on load
  decorators?: SceneDecorator[]         // @deprecated (ADR 093) — migrated to modifier nodes
  generative?: GenerativeConfig         // for type === 'generative' (ADR 078)
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

/** Decorative stamp on the scene canvas (ADR 119) */
export interface SceneStamp {
  id: string
  stampId: string         // key into STAMP_LIBRARY
  x: number              // normalized 0–1
  y: number
  scale?: number         // size multiplier (default 1.0)
}

/** Scene = the arrangement graph (ADR 044) */
export interface Scene {
  name: string
  nodes: SceneNode[]
  edges: SceneEdge[]
  labels: SceneLabel[]
  stamps: SceneStamp[]
  /** Global sweep automation — applies across entire scene duration (ADR 123 Phase 5) */
  globalSweep?: SweepData
}

/** Song = pattern pool + arrangement sections + scene (ADR 044) */
export interface Song {
  name: string
  bpm: number
  rootNote: number        // 0–11
  tracks: Track[]         // max 16 (stepActions.ts MAX_TRACKS)
  patterns: Pattern[]     // pattern pool (ADR 044)
  sections: Section[]     // @deprecated — legacy arrangement slots, kept for save-data migration
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
  packId?: string              // factory pack id (ADR 106) — zones re-hydrated from pool on load
  zones?: SampleZoneMeta[]     // multi-sample zone data for worklet re-send
}

/** Metadata for a single zone in a multi-sample pack (ADR 106) */
export interface SampleZoneMeta {
  name: string
  rawBuffer: ArrayBuffer
  sampleRate: number
  rootNote: number
  loNote: number
  hiNote: number
}

export type Lang = 'ja' | 'en'
