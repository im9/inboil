/**
 * Pure helper functions for scene playback (ADR 128).
 * Extracted for testability — no reactive state dependencies.
 */

const PERF_MAP: Record<string, string> = {
  fill: 'filling', rev: 'reversing', brk: 'breaking',
}

/** Calculate global sweep progress from elapsed time.
 *  Returns 0–1 (clamped). Returns 0 if duration is 0 or elapsed is before offset. */
export function calcGlobalSweepProgress(elapsedMs: number, offsetMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  const t = elapsedMs - offsetMs
  if (t <= 0) return 0
  return Math.min(1, t / durationMs)
}

/** Map a perf toggle param to its perf state key and value.
 *  Returns null for unknown params. */
export function applyPerfToggle(param: string, on: boolean): { key: string; value: boolean } | null {
  const key = PERF_MAP[param]
  if (!key) return null
  return { key, value: on }
}

/** Canonical ordering of pattern transition steps.
 *  No snapshot restore — previous sweep values carry over as baseline.
 *  Satellite modifiers handle their own resets (fx on/off, transpose). */
export type TransitionKind = 'start' | 'walk'
export type TransitionStep = 'satellite' | 'snapshot' | 'globalSweep'

export function buildTransitionSteps(_kind: TransitionKind): TransitionStep[] {
  return ['satellite', 'snapshot', 'globalSweep']
}

/** Compute sweep application value with carry-over delta.
 *  Curve stores absolute normalized values (0–1).
 *  On playback, the result is offset so the curve starts from the carry-over value.
 *  `snapValue`: carry-over in native range (from snapshot at pattern transition)
 *  `curveValue`: current curve evaluation (0–1 normalized)
 *  `firstValue`: curve's first point value (0–1 normalized)
 *  `min/max`: native range of the parameter
 *  Returns the value in native range, clamped. */
export function applySweepValue(
  snapValue: number, curveValue: number, firstValue: number,
  min = 0, max = 1,
): number {
  const range = max - min
  const result = snapValue + (curveValue - firstValue) * range
  return Math.max(min, Math.min(max, result))
}
