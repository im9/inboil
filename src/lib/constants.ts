// ── Shared constants ─────────────────────────────────────────────────────────
// Single source of truth for values used across multiple modules.
// NOTE: worklet-processor.ts runs in AudioWorklet scope and cannot import this
// file — it maintains its own copies of scale/transposition constants.

// ── Project ─────────────────────────────────────────────────────────────────
export const PROJECT_NAME = 'UNTITLED'

// ── Note names ──────────────────────────────────────────────────────────────
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// ── Scale ───────────────────────────────────────────────────────────────────
// White-key positions (C major / Ionian scale degrees)
export const SCALE_DEGREES = [0, 2, 4, 5, 7, 9, 11] as const
export const SCALE_DEGREES_SET: Set<number> = new Set(SCALE_DEGREES)

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

// ── Default state values ────────────────────────────────────────────────────
// Used by both initial $state declarations and factoryReset()

export const DEFAULT_EFFECTS = {
  reverb: { size: 0.72, damp: 0.5 },
  delay:  { time: 0.75, feedback: 0.42 },
  ducker: { depth: 0.85, release: 120 },
  comp:   { threshold: 0.30, ratio: 6, makeup: 2.2 },
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
  eqLow:    { on: true,  x: 0.33, y: 0.50 },
  eqMid:    { on: true,  x: 0.57, y: 0.50 },
  eqHigh:   { on: true,  x: 0.87, y: 0.50 },
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
}
