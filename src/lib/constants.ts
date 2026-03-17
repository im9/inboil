// ── Shared constants ─────────────────────────────────────────────────────────
// Single source of truth for values used across multiple modules.
// This file has zero imports and can be safely imported from AudioWorklet scope.

// ── Project ─────────────────────────────────────────────────────────────────
export const PROJECT_NAME = 'UNTITLED'

// ── Note names ──────────────────────────────────────────────────────────────
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// ── Scale ───────────────────────────────────────────────────────────────────
// White-key positions (C major / Ionian scale degrees)
export const SCALE_DEGREES = [0, 2, 4, 5, 7, 9, 11] as const
export const SCALE_DEGREES_SET: Set<number> = new Set(SCALE_DEGREES)

// Mode-specific scale templates — one per chromatic root (0=C … 11=B).
// Used by PianoRoll (UI) and worklet-processor (DSP) for transposition.
export const SCALE_TEMPLATES: readonly number[][] = [
  [0, 2, 4, 5, 7, 9, 11],  //  0 C  Ionian (major)
  [0, 2, 4, 5, 7, 9, 11],  //  1 C# major
  [0, 2, 3, 5, 7, 9, 10],  //  2 D  Dorian
  [0, 2, 4, 5, 7, 9, 11],  //  3 Eb major
  [0, 1, 3, 5, 7, 8, 10],  //  4 E  Phrygian
  [0, 2, 4, 6, 7, 9, 11],  //  5 F  Lydian
  [0, 2, 4, 5, 7, 9, 11],  //  6 F# major
  [0, 2, 4, 5, 7, 9, 10],  //  7 G  Mixolydian
  [0, 2, 4, 5, 7, 9, 11],  //  8 Ab major
  [0, 2, 3, 5, 7, 8, 10],  //  9 A  Aeolian (natural minor)
  [0, 2, 4, 5, 7, 9, 11],  // 10 Bb major
  [0, 1, 3, 5, 6, 8, 10],  // 11 B  Locrian
]

// ── BPM range ────────────────────────────────────────────────────────────────
export const BPM_MIN = 40
export const BPM_MAX = 240

// ── Piano roll range ────────────────────────────────────────────────────────
export const PIANO_ROLL_MIN = 48  // C3
export const PIANO_ROLL_MAX = 71  // B4

// ── XY pad constants (FxPad / FilterView) ───────────────────────────────────
export const TAP_THRESHOLD = 5   // px — drag distance before a pointerdown counts as drag vs. tap
export const PAD_INSET = 32      // px — inset so nodes don't clip pad edges

// ── Pattern colors (8-color palette, index 0 = default) ─────────────────────
export const PATTERN_COLORS = [
  '#787845',  // 0: olive (default)
  '#4472B4',  // 1: blue
  '#E8A090',  // 2: salmon
  '#9B6BA0',  // 3: purple
  '#4A9B9B',  // 4: teal
  '#B8860B',  // 5: gold
  '#6B8E6B',  // 6: sage
  '#CD5C5C',  // 7: brick
] as const

// ── RGB colors for canvas rendering ─────────────────────────────────────────
export const COLORS_RGB = {
  olive:  { r: 120, g: 120, b:  69 },
  blue:   { r:  68, g: 114, b: 180 },
  salmon: { r: 232, g: 160, b: 144 },
  purple: { r: 155, g: 107, b: 160 },
  cream:  { r: 237, g: 232, b: 220 },
} as const

// ── FX Flavours (ADR 075) ─────────────────────────────────────────────────
export type ReverbFlavour   = 'room' | 'hall' | 'shimmer'
export type DelayFlavour    = 'digital' | 'dotted' | 'tape'
export type GlitchFlavour   = 'bitcrush' | 'redux' | 'stutter'
export type GranularFlavour = 'cloud' | 'freeze' | 'stretch'

export type FxFlavourKey = 'verb' | 'delay' | 'glitch' | 'granular'

export const FX_FLAVOURS = {
  verb: [
    { id: 'room'  as const, label: 'ROOM',  tip: 'Room — short, tight reverb', tipJa: 'ルーム — 短くタイトなリバーブ' },
    { id: 'hall'    as const, label: 'HALL',  tip: 'Hall — large, diffuse reverb', tipJa: 'ホール — 広く拡散したリバーブ' },
    { id: 'shimmer' as const, label: 'SHIM',  tip: 'Shimmer — octave-up pitch shift in reverb feedback', tipJa: 'シマー — オクターブ上ピッチシフトのリバーブ' },
  ],
  delay: [
    { id: 'digital' as const, label: 'DIGI',  tip: 'Digital — clean ping-pong', tipJa: 'デジタル — クリーンなピンポン' },
    { id: 'dotted'  as const, label: 'DOT.8', tip: 'Dotted 8th — tempo-synced', tipJa: '付点8分 — テンポ同期' },
    { id: 'tape'    as const, label: 'TAPE',  tip: 'Tape — warm LP-filtered with wow/flutter', tipJa: 'テープ — ウォームなLPフィルター + ワウフラッター' },
  ],
  glitch: [
    { id: 'bitcrush' as const, label: 'CRUSH', tip: 'Bitcrush — sample & hold + quantize', tipJa: 'ビットクラッシュ — S&H + 量子化' },
    { id: 'redux'    as const, label: 'REDUX', tip: 'Redux — aggressive downsample only', tipJa: 'Redux — 強力なダウンサンプリング' },
    { id: 'stutter'  as const, label: 'STTR',  tip: 'Stutter — rhythmic buffer repeat', tipJa: 'スタッター — リズミックなバッファーリピート' },
  ],
  granular: [
    { id: 'cloud'   as const, label: 'CLOUD', tip: 'Cloud — default grain shower', tipJa: 'クラウド — 通常のグレインシャワー' },
    { id: 'freeze'  as const, label: 'FREEZE', tip: 'Freeze — auto-engage freeze', tipJa: 'フリーズ — 自動フリーズ' },
    { id: 'stretch' as const, label: 'STRCH',  tip: 'Stretch — time-stretch large grains', tipJa: 'ストレッチ — タイムストレッチ' },
  ],
} as const

export interface FxFlavours {
  verb: ReverbFlavour
  delay: DelayFlavour
  glitch: GlitchFlavour
  granular: GranularFlavour
}

export const DEFAULT_FX_FLAVOURS: FxFlavours = {
  verb: 'room',
  delay: 'digital',
  glitch: 'bitcrush',
  granular: 'cloud',
}

// ── Default state values ────────────────────────────────────────────────────
// Used by both initial $state declarations and factoryReset()

export const DEFAULT_EFFECTS = {
  reverb: { size: 0.72, damp: 0.5 },
  delay:  { time: 0.75, feedback: 0.42 },
  ducker: { depth: 0.85, release: 120 },
  comp:   { threshold: 0.30, ratio: 6, makeup: 2.2, attack: 0.8, release: 60 },
}

export const DEFAULT_MASTER_PAD = {
  comp: { on: true, x: 0.22, y: 0.26 },   // x=threshold(0.1–1.0), y=ratio(1–20)
  duck: { on: true, x: 0.85, y: 0.21 },   // x=depth(0–1), y=release(20–500ms)
  ret:  { on: true, x: 0.50, y: 0.50 },   // x=verbReturn(0–2), y=dlyReturn(0–2)
}

export const DEFAULT_FX_PAD = {
  verb:     { on: false, x: 0.25, y: 0.65 },
  delay:    { on: false, x: 0.70, y: 0.40 },
  glitch:   { on: false, x: 0.45, y: 0.15 },
  granular: { on: false, x: 0.50, y: 0.30 },
  filter:   { on: false, x: 0.50, y: 0.30 },
  eqLow:    { on: true,  x: 0.33, y: 0.50, q: 1.5, shelf: false },
  eqMid:    { on: true,  x: 0.57, y: 0.50, q: 1.5 },
  eqHigh:   { on: true,  x: 0.87, y: 0.50, q: 1.5, shelf: false },
}

export const DEFAULT_PERF = {
  rootNote: 0,
  octave: 0,
  breaking: false,
  masterGain: 0.8,
  filling: false,
  reversing: false,
  swing: 0,
  granularPitch: 0.5,
  granularScatter: 0.67,
  granularFreeze: false,
  // Kaoss Pad XY + tilt (mobile perf sheet)
  perfX: 0.5,
  perfY: 0.5,
  perfTouching: false,
  tiltX: 0,
  tiltY: 0,
  // Glitch effects (ADR 097 Phase 2)
  stuttering: false,
  halfSpeed: false,
  tapeStop: false,
}
