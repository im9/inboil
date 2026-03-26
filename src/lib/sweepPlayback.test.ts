/**
 * Tests for sweep automation evaluation — evaluateCurve interpolation
 * and boolean toggle evaluation (ADR 118, ADR 123).
 */
import { describe, it, expect } from 'vitest'
import { evaluateCurve, evaluateToggle, buildSweepData } from './sweepEval'

// ── Tests: evaluateCurve ──

describe('evaluateCurve', () => {
  it('returns 0 for empty points', () => {
    expect(evaluateCurve([], 0.5)).toBe(0)
  })

  it('clamps to first value before first point', () => {
    const pts = [{ t: 0.2, v: 0.5 }, { t: 0.8, v: 1.0 }]
    expect(evaluateCurve(pts, 0)).toBe(0.5)
    expect(evaluateCurve(pts, 0.1)).toBe(0.5)
  })

  it('clamps to last value after last point', () => {
    const pts = [{ t: 0.2, v: 0.5 }, { t: 0.8, v: 1.0 }]
    expect(evaluateCurve(pts, 0.9)).toBe(1.0)
    expect(evaluateCurve(pts, 1.0)).toBe(1.0)
  })

  it('interpolates linearly for 2 points', () => {
    const pts = [{ t: 0, v: 0 }, { t: 1, v: 1 }]
    expect(evaluateCurve(pts, 0.5)).toBeCloseTo(0.5)
    expect(evaluateCurve(pts, 0.25)).toBeCloseTo(0.25)
  })

  it('returns exact values at control points', () => {
    const pts = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }]
    expect(evaluateCurve(pts, 0)).toBe(0)
    expect(evaluateCurve(pts, 0.5)).toBeCloseTo(1.0)
    expect(evaluateCurve(pts, 1)).toBe(0)
  })

  it('uses Catmull-Rom spline for 3+ points', () => {
    const pts = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }]
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
    const pts = [{ t: 0, v: 0 }, { t: 1, v: 1 }]
    // Linear for 2 points
    for (let i = 0; i <= 10; i++) {
      const p = i / 10
      expect(evaluateCurve(pts, p)).toBeCloseTo(p)
    }
  })

  it('handles negative values', () => {
    const pts = [{ t: 0, v: 0 }, { t: 1, v: -1 }]
    expect(evaluateCurve(pts, 0.5)).toBeCloseTo(-0.5)
  })
})

// ── Tests: evaluateToggle (ADR 123) ──

describe('evaluateToggle', () => {
  it('defaults to OFF when no points', () => {
    expect(evaluateToggle([], 0.5)).toBe(false)
  })

  it('uses explicit on/off state from points', () => {
    const pts = [{ t: 0, on: true }]
    expect(evaluateToggle(pts, 0)).toBe(true)
    expect(evaluateToggle(pts, 0.5)).toBe(true)
    expect(evaluateToggle(pts, 1)).toBe(true)
  })

  it('toggles at point boundaries', () => {
    const pts = [
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
    const pts = [{ t: 0.5, on: true }]
    expect(evaluateToggle(pts, 0)).toBe(false)
    expect(evaluateToggle(pts, 0.49)).toBe(false)
    expect(evaluateToggle(pts, 0.5)).toBe(true)
  })

  it('handles multiple on/off transitions', () => {
    const pts = [
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
    const pts = [
      { t: 0, on: true },
      { t: 0.5, on: true },
    ]
    expect(evaluateToggle(pts, 0.25)).toBe(true)
    expect(evaluateToggle(pts, 0.75)).toBe(true)
  })
})

// ── Tests: buildSweepData (ADR 123) ──

describe('buildSweepData', () => {
  it('builds with curves only', () => {
    const curves = [{ target: { kind: 'master' as const, param: 'masterVolume' as const }, points: [], color: '#fff' }]
    const data = buildSweepData(curves)
    expect(data.curves).toBe(curves)
    expect(data.toggles).toBeUndefined()
  })

  it('builds with curves and toggles', () => {
    const curves = [{ target: { kind: 'master' as const, param: 'masterVolume' as const }, points: [], color: '#fff' }]
    const toggles = [{ target: { kind: 'hold' as const, fx: 'verb' as const }, points: [], color: '#f00' }]
    const data = buildSweepData(curves, toggles)
    expect(data.curves).toBe(curves)
    expect(data.toggles).toBe(toggles)
  })

  it('omits toggles when empty array', () => {
    const data = buildSweepData([], [])
    expect(data.toggles).toBeUndefined()
  })
})
