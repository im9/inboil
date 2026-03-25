/**
 * Tests for sweep automation playback logic — evaluateCurve interpolation
 * and boolean toggle evaluation (ADR 118, ADR 123).
 *
 * Pure reimplementations of private functions from scenePlayback.ts.
 */
import { describe, it, expect } from 'vitest'

// ── Pure reimplementation of evaluateCurve from scenePlayback.ts ──

type Point = { t: number; v: number }

function evaluateCurve(points: Point[], progress: number): number {
  if (points.length === 0) return 0
  if (progress <= points[0].t) return points[0].v
  if (progress >= points[points.length - 1].t) return points[points.length - 1].v
  for (let i = 0; i < points.length - 1; i++) {
    if (progress >= points[i].t && progress <= points[i + 1].t) {
      const seg = (progress - points[i].t) / (points[i + 1].t - points[i].t)
      if (points.length <= 2) {
        return points[i].v + (points[i + 1].v - points[i].v) * seg
      }
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

// ── Pure reimplementation of toggle evaluation from applySweepStep ──

type TogglePoint = { t: number; on: boolean }

function evaluateToggle(points: TogglePoint[], progress: number): boolean {
  let on = false
  for (const pt of points) {
    if (pt.t <= progress) on = pt.on
    else break
  }
  return on
}

// ── Tests: evaluateCurve ──

describe('evaluateCurve', () => {
  it('returns 0 for empty points', () => {
    expect(evaluateCurve([], 0.5)).toBe(0)
  })

  it('clamps to first value before first point', () => {
    const pts: Point[] = [{ t: 0.2, v: 0.5 }, { t: 0.8, v: 1.0 }]
    expect(evaluateCurve(pts, 0)).toBe(0.5)
    expect(evaluateCurve(pts, 0.1)).toBe(0.5)
  })

  it('clamps to last value after last point', () => {
    const pts: Point[] = [{ t: 0.2, v: 0.5 }, { t: 0.8, v: 1.0 }]
    expect(evaluateCurve(pts, 0.9)).toBe(1.0)
    expect(evaluateCurve(pts, 1.0)).toBe(1.0)
  })

  it('interpolates linearly for 2 points', () => {
    const pts: Point[] = [{ t: 0, v: 0 }, { t: 1, v: 1 }]
    expect(evaluateCurve(pts, 0.5)).toBeCloseTo(0.5)
    expect(evaluateCurve(pts, 0.25)).toBeCloseTo(0.25)
  })

  it('returns exact values at control points', () => {
    const pts: Point[] = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }]
    expect(evaluateCurve(pts, 0)).toBe(0)
    expect(evaluateCurve(pts, 0.5)).toBeCloseTo(1.0)
    expect(evaluateCurve(pts, 1)).toBe(0)
  })

  it('uses Catmull-Rom spline for 3+ points', () => {
    const pts: Point[] = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }]
    // Midpoints between control points should be smooth (not exactly 0.5 due to spline)
    const v025 = evaluateCurve(pts, 0.25)
    const v075 = evaluateCurve(pts, 0.75)
    // Symmetric triangle shape: v at 0.25 and 0.75 should be equal
    expect(v025).toBeCloseTo(v075, 5)
    // Value should be positive (between 0 and peak)
    expect(v025).toBeGreaterThan(0)
    expect(v025).toBeLessThan(1)
  })

  it('handles ramp-up preset', () => {
    const pts: Point[] = [{ t: 0, v: 0 }, { t: 1, v: 1 }]
    // Linear for 2 points
    for (let i = 0; i <= 10; i++) {
      const p = i / 10
      expect(evaluateCurve(pts, p)).toBeCloseTo(p)
    }
  })

  it('handles negative values', () => {
    const pts: Point[] = [{ t: 0, v: 0 }, { t: 1, v: -1 }]
    expect(evaluateCurve(pts, 0.5)).toBeCloseTo(-0.5)
  })
})

// ── Tests: evaluateToggle (ADR 123) ──

describe('evaluateToggle', () => {
  it('defaults to OFF when no points', () => {
    expect(evaluateToggle([], 0.5)).toBe(false)
  })

  it('uses explicit on/off state from points', () => {
    const pts: TogglePoint[] = [{ t: 0, on: true }]
    expect(evaluateToggle(pts, 0)).toBe(true)
    expect(evaluateToggle(pts, 0.5)).toBe(true)
    expect(evaluateToggle(pts, 1)).toBe(true)
  })

  it('toggles at point boundaries', () => {
    const pts: TogglePoint[] = [
      { t: 0, on: false },
      { t: 0.25, on: true },
      { t: 0.75, on: false },
    ]
    expect(evaluateToggle(pts, 0)).toBe(false)
    expect(evaluateToggle(pts, 0.1)).toBe(false)
    expect(evaluateToggle(pts, 0.25)).toBe(true)
    expect(evaluateToggle(pts, 0.5)).toBe(true)
    expect(evaluateToggle(pts, 0.75)).toBe(false)
    expect(evaluateToggle(pts, 1.0)).toBe(false)
  })

  it('defaults to OFF before first point', () => {
    const pts: TogglePoint[] = [{ t: 0.5, on: true }]
    expect(evaluateToggle(pts, 0)).toBe(false)
    expect(evaluateToggle(pts, 0.49)).toBe(false)
    expect(evaluateToggle(pts, 0.5)).toBe(true)
  })

  it('handles multiple on/off transitions', () => {
    const pts: TogglePoint[] = [
      { t: 0, on: true },
      { t: 0.2, on: false },
      { t: 0.4, on: true },
      { t: 0.6, on: false },
      { t: 0.8, on: true },
    ]
    expect(evaluateToggle(pts, 0.1)).toBe(true)
    expect(evaluateToggle(pts, 0.3)).toBe(false)
    expect(evaluateToggle(pts, 0.5)).toBe(true)
    expect(evaluateToggle(pts, 0.7)).toBe(false)
    expect(evaluateToggle(pts, 0.9)).toBe(true)
  })

  it('handles consecutive same-state points', () => {
    const pts: TogglePoint[] = [
      { t: 0, on: true },
      { t: 0.5, on: true },
    ]
    expect(evaluateToggle(pts, 0.25)).toBe(true)
    expect(evaluateToggle(pts, 0.75)).toBe(true)
  })
})
