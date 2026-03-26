/**
 * Pure sweep evaluation functions (ADR 123).
 * Extracted from scenePlayback.ts for testability and reuse.
 */
import type { SweepCurve, SweepToggleCurve, SweepData, SweepTarget, SweepToggleTarget } from './types'

/** Evaluate a sweep curve at a given progress (0–1) using Catmull-Rom interpolation */
export function evaluateCurve(points: { t: number; v: number }[], progress: number): number {
  if (points.length === 0) return 0
  if (progress <= points[0].t) return points[0].v
  if (progress >= points[points.length - 1].t) return points[points.length - 1].v
  for (let i = 0; i < points.length - 1; i++) {
    if (progress >= points[i].t && progress <= points[i + 1].t) {
      const seg = (progress - points[i].t) / (points[i + 1].t - points[i].t)
      if (points.length <= 2) {
        // Linear for 2 points
        return points[i].v + (points[i + 1].v - points[i].v) * seg
      }
      // Catmull-Rom spline for smooth interpolation
      const p0 = points[Math.max(0, i - 1)]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[Math.min(points.length - 1, i + 2)]
      const t2 = seg * seg, t3 = t2 * seg
      return 0.5 * (
        (2 * p1.v) +
        (-p0.v + p2.v) * seg +
        (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * t2 +
        (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * t3
      )
    }
  }
  return 0
}

/** Evaluate a boolean toggle curve at a given progress (0–1).
 *  Returns the state of the last point whose t ≤ progress, or false if none. */
export function evaluateToggle(points: { t: number; on: boolean }[], progress: number): boolean {
  let on = false
  for (const pt of points) {
    if (pt.t <= progress) on = pt.on
    else break
  }
  return on
}

/** User-controlled check — set by sweepRecorder, read by applySweepStep.
 *  Avoids .svelte.ts → .ts import issues. */
let _isUserControlled: ((key: string) => boolean) | null = null
export function setUserControlledChecker(fn: (key: string) => boolean): void { _isUserControlled = fn }
export function isUserControlled(key: string): boolean { return _isUserControlled?.(key) ?? false }

/** Serialize a sweep target to a unique key string */
export function targetKey(target: SweepTarget | SweepToggleTarget): string {
  if ('param' in target) {
    if (target.kind === 'track' || target.kind === 'send') return `${target.kind}:${target.trackId}:${target.param}`
    if (target.kind === 'eq') return `eq:${target.band}:${target.param}`
    return `${target.kind}:${target.param}`
  }
  if (target.kind === 'mute') return `mute:${target.trackId}`
  return `${target.kind}:${target.fx}`
}

/** Build a SweepData object from curves and optional toggles (prevents field-drop bugs) */
export function buildSweepData(
  curves: SweepCurve[],
  toggles?: SweepToggleCurve[],
): SweepData {
  const data: SweepData = { curves }
  if (toggles && toggles.length > 0) data.toggles = toggles
  return data
}

// ── Global vs chain scope routing (ADR 123 Phase 5) ──

/** Returns true if a target should route to global sweep (master/fx/eq/fxOn/hold).
 *  Track-scoped targets (track/send/mute) route to chain sweep. */
export function isGlobalTarget(target: SweepTarget | SweepToggleTarget): boolean {
  if ('param' in target) {
    return target.kind === 'master' || target.kind === 'fx' || target.kind === 'eq'
  }
  // Toggle targets: fxOn and hold are global, mute is chain-scoped
  return target.kind === 'fxOn' || target.kind === 'hold'
}

// ── Overdub merge (pure) ──

/** Merge incoming curves into existing, replacing curves with matching targets */
export function mergeOverdub(existing: SweepCurve[], incoming: SweepCurve[]): SweepCurve[] {
  const result = [...existing]
  for (const curve of incoming) {
    const key = targetKey(curve.target)
    const idx = result.findIndex(c => targetKey(c.target) === key)
    if (idx >= 0) {
      result[idx] = curve
    } else {
      result.push(curve)
    }
  }
  return result
}

/** Merge incoming toggles into existing, replacing toggles with matching targets */
export function mergeOverdubToggles(existing: SweepToggleCurve[], incoming: SweepToggleCurve[]): SweepToggleCurve[] {
  const result = [...existing]
  for (const toggle of incoming) {
    const key = targetKey(toggle.target)
    const idx = result.findIndex(t => targetKey(t.target) === key)
    if (idx >= 0) {
      result[idx] = toggle
    } else {
      result.push(toggle)
    }
  }
  return result
}

// ── RDP simplification (pure) ──

/** Ramer-Douglas-Peucker curve simplification — reduces point count while preserving shape */
export function rdpSimplify(pts: { t: number; v: number }[], epsilon: number): { t: number; v: number }[] {
  if (pts.length <= 2) return pts
  let maxDist = 0, maxIdx = 0
  const first = pts[0], last = pts[pts.length - 1]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointLineDistance(pts[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(pts.slice(0, maxIdx + 1), epsilon)
    const right = rdpSimplify(pts.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

function pointLineDistance(p: { t: number; v: number }, a: { t: number; v: number }, b: { t: number; v: number }): number {
  const dx = b.t - a.t, dy = b.v - a.v
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return Math.sqrt((p.t - a.t) ** 2 + (p.v - a.v) ** 2)
  return Math.abs(dx * (a.v - p.v) - (a.t - p.t) * dy) / len
}

/** Check if two SweepTargets refer to the same parameter */
export function targetsEqual(a: SweepTarget, b: SweepTarget): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'master' && b.kind === 'master') return a.param === b.param
  if (a.kind === 'fx' && b.kind === 'fx') return a.param === b.param
  if (a.kind === 'track' && b.kind === 'track') return a.trackId === b.trackId && a.param === b.param
  if (a.kind === 'send' && b.kind === 'send') return a.trackId === b.trackId && a.param === b.param
  if (a.kind === 'eq' && b.kind === 'eq') return a.band === b.band && a.param === b.param
  return false
}
