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
 *  Both `start` and `walk` transitions must follow the same order:
 *  restore → satellite → snapshot → globalSweep */
export type TransitionKind = 'start' | 'walk'
export type TransitionStep = 'restore' | 'satellite' | 'snapshot' | 'globalSweep'

export function buildTransitionSteps(_kind: TransitionKind): TransitionStep[] {
  return ['restore', 'satellite', 'snapshot', 'globalSweep']
}
