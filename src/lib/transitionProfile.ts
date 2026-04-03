/**
 * Profiler for pattern transition and onStep hot path.
 * Dev-only — guarded by import.meta.env.DEV, tree-shaken in production.
 * Logs accumulate in memory, auto-flushed to tmp/log.txt via flushLog().
 */

const lines: string[] = []

export function log(tag: string, msg: string): void {
  if (!import.meta.env.DEV) return
  lines.push(`[${tag}] ${msg}`)
}

export interface TransitionTiming {
  resetPerfToggles: number
  clearCarryOver: number
  satelliteModifiers: number
  refreshCaches: number
  snapshot: number
  reapplyGlobalSweep: number
  liveGenerative: number
  patternLookup: number
  total: number
}

export function recordTiming(timing: TransitionTiming): void {
  if (!import.meta.env.DEV) return
  const parts = Object.entries(timing)
    .filter(([k]) => k !== 'total')
    .map(([k, v]) => `${k}=${(v as number).toFixed(2)}`)
    .join(' ')
  log('transition', `total=${timing.total.toFixed(2)}ms ${parts}`)
}

/** Flush accumulated logs to tmp/log.txt. Call on stop(). */
export function flushLog(): void {
  if (!import.meta.env.DEV || lines.length === 0) return
  const count = lines.length
  fetch('/api/log', { method: 'POST', body: lines.join('\n') })
    .then(() => console.log(`[profiler] ${count} lines → tmp/log.txt`))
  lines.length = 0
}
