/**
 * Tests for sweep automation evaluation — evaluateCurve interpolation
 * and boolean toggle evaluation (ADR 118, ADR 123).
 */
import { describe, it, expect } from 'vitest'
import { evaluateCurve, evaluateToggle, buildSweepData, rdpSimplify, mergeOverdub, mergeOverdubToggles, targetsEqual, isGlobalTarget } from './sweepEval'
import type { SweepCurve, SweepToggleCurve } from './types'

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

// ── Tests: rdpSimplify (ADR 123) ──

describe('rdpSimplify', () => {
  it('returns input unchanged for 0-2 points', () => {
    expect(rdpSimplify([], 0.1)).toEqual([])
    const one = [{ t: 0.5, v: 0.5 }]
    expect(rdpSimplify(one, 0.1)).toEqual(one)
    const two = [{ t: 0, v: 0 }, { t: 1, v: 1 }]
    expect(rdpSimplify(two, 0.1)).toEqual(two)
  })

  it('removes collinear points', () => {
    // Three points on a straight line: middle should be removed
    const pts = [{ t: 0, v: 0 }, { t: 0.5, v: 0.5 }, { t: 1, v: 1 }]
    const result = rdpSimplify(pts, 0.01)
    expect(result).toEqual([{ t: 0, v: 0 }, { t: 1, v: 1 }])
  })

  it('preserves significant deviations', () => {
    // Sharp peak: middle point deviates significantly
    const pts = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }]
    const result = rdpSimplify(pts, 0.01)
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual({ t: 0.5, v: 1 })
  })

  it('reduces dense linear segments', () => {
    // 100 points on a straight line
    const pts = Array.from({ length: 100 }, (_, i) => ({ t: i / 99, v: i / 99 }))
    const result = rdpSimplify(pts, 0.02)
    expect(result).toHaveLength(2) // only endpoints
    expect(result[0]).toEqual(pts[0])
    expect(result[1]).toEqual(pts[99])
  })

  it('preserves endpoints of complex curves', () => {
    const pts = [
      { t: 0, v: 0 },
      { t: 0.25, v: 0.8 },
      { t: 0.5, v: 0.2 },
      { t: 0.75, v: 0.9 },
      { t: 1, v: 0 },
    ]
    const result = rdpSimplify(pts, 0.02)
    expect(result[0]).toEqual(pts[0])
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1])
    // Should keep most points since they deviate significantly
    expect(result.length).toBeGreaterThanOrEqual(4)
  })
})

// ── Tests: mergeOverdub (ADR 123) ──

describe('mergeOverdub', () => {
  const mkCurve = (param: string, v: number): SweepCurve => ({
    target: { kind: 'master', param: param as 'masterVolume' },
    points: [{ t: 0, v }, { t: 1, v }],
    color: '#fff',
  })

  it('appends new curves to empty existing', () => {
    const incoming = [mkCurve('masterVolume', 0.5)]
    const result = mergeOverdub([], incoming)
    expect(result).toHaveLength(1)
    expect(result[0].points[0].v).toBe(0.5)
  })

  it('replaces curves with matching targets', () => {
    const existing = [mkCurve('masterVolume', 0.3)]
    const incoming = [mkCurve('masterVolume', 0.8)]
    const result = mergeOverdub(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result[0].points[0].v).toBe(0.8)
  })

  it('preserves untouched curves', () => {
    const existing = [mkCurve('masterVolume', 0.3), mkCurve('swing', 0.5)]
    const incoming = [mkCurve('masterVolume', 0.8)]
    const result = mergeOverdub(existing, incoming)
    expect(result).toHaveLength(2)
    expect(result[0].points[0].v).toBe(0.8) // replaced
    expect(result[1].points[0].v).toBe(0.5) // preserved
  })

  it('does not mutate existing array', () => {
    const existing = [mkCurve('masterVolume', 0.3)]
    const incoming = [mkCurve('masterVolume', 0.8)]
    mergeOverdub(existing, incoming)
    expect(existing[0].points[0].v).toBe(0.3) // unchanged
  })
})

// ── Tests: mergeOverdubToggles (ADR 123) ──

describe('mergeOverdubToggles', () => {
  const mkToggle = (fx: string, on: boolean): SweepToggleCurve => ({
    target: { kind: 'hold', fx: fx as 'verb' },
    points: [{ t: 0, on }],
    color: '#f00',
  })

  it('replaces toggles with matching targets', () => {
    const existing = [mkToggle('verb', true)]
    const incoming = [mkToggle('verb', false)]
    const result = mergeOverdubToggles(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result[0].points[0].on).toBe(false)
  })

  it('preserves untouched toggles', () => {
    const existing = [mkToggle('verb', true), mkToggle('delay', false)]
    const incoming = [mkToggle('verb', false)]
    const result = mergeOverdubToggles(existing, incoming)
    expect(result).toHaveLength(2)
    expect(result[0].points[0].on).toBe(false) // replaced
    expect(result[1].points[0].on).toBe(false) // preserved
  })

  it('appends new toggles', () => {
    const result = mergeOverdubToggles([], [mkToggle('glitch', true)])
    expect(result).toHaveLength(1)
  })
})

// ── Tests: targetsEqual (ADR 123) ──

describe('targetsEqual', () => {
  it('matches identical master targets', () => {
    expect(targetsEqual(
      { kind: 'master', param: 'masterVolume' },
      { kind: 'master', param: 'masterVolume' },
    )).toBe(true)
  })

  it('rejects different master params', () => {
    expect(targetsEqual(
      { kind: 'master', param: 'masterVolume' },
      { kind: 'master', param: 'swing' },
    )).toBe(false)
  })

  it('rejects different kinds', () => {
    expect(targetsEqual(
      { kind: 'master', param: 'masterVolume' } as any,
      { kind: 'fx', param: 'reverbWet' } as any,
    )).toBe(false)
  })

  it('matches track targets with same trackId and param', () => {
    expect(targetsEqual(
      { kind: 'track', trackId: 2, param: 'volume' },
      { kind: 'track', trackId: 2, param: 'volume' },
    )).toBe(true)
  })

  it('rejects track targets with different trackId', () => {
    expect(targetsEqual(
      { kind: 'track', trackId: 2, param: 'volume' },
      { kind: 'track', trackId: 3, param: 'volume' },
    )).toBe(false)
  })

  it('matches eq targets with same band and param', () => {
    expect(targetsEqual(
      { kind: 'eq', band: 'eqLow', param: 'freq' },
      { kind: 'eq', band: 'eqLow', param: 'freq' },
    )).toBe(true)
  })

  it('rejects eq targets with different band', () => {
    expect(targetsEqual(
      { kind: 'eq', band: 'eqLow', param: 'freq' },
      { kind: 'eq', band: 'eqMid', param: 'freq' },
    )).toBe(false)
  })
})

// ── Tests: isGlobalTarget (ADR 123 Phase 5) ──

describe('isGlobalTarget', () => {
  it('master targets are global', () => {
    expect(isGlobalTarget({ kind: 'master', param: 'masterVolume' })).toBe(true)
    expect(isGlobalTarget({ kind: 'master', param: 'filterCutoff' })).toBe(true)
  })

  it('fx targets are global', () => {
    expect(isGlobalTarget({ kind: 'fx', param: 'reverbWet' })).toBe(true)
    expect(isGlobalTarget({ kind: 'fx', param: 'delayFeedback' })).toBe(true)
  })

  it('eq targets are global', () => {
    expect(isGlobalTarget({ kind: 'eq', band: 'eqLow', param: 'freq' })).toBe(true)
  })

  it('fxOn toggles are global', () => {
    expect(isGlobalTarget({ kind: 'fxOn', fx: 'verb' })).toBe(true)
  })

  it('hold toggles are global', () => {
    expect(isGlobalTarget({ kind: 'hold', fx: 'delay' })).toBe(true)
  })

  it('track targets are chain-scoped', () => {
    expect(isGlobalTarget({ kind: 'track', trackId: 0, param: 'volume' })).toBe(false)
    expect(isGlobalTarget({ kind: 'track', trackId: 1, param: 'pan' })).toBe(false)
  })

  it('send targets are chain-scoped', () => {
    expect(isGlobalTarget({ kind: 'send', trackId: 0, param: 'reverbSend' })).toBe(false)
  })

  it('mute toggles are chain-scoped', () => {
    expect(isGlobalTarget({ kind: 'mute', trackId: 0 })).toBe(false)
  })
})
