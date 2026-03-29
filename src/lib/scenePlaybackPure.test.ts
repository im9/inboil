/**
 * Tests for pure scene playback helpers (ADR 128 Phase 2).
 * Covers global sweep progress, toggle application, and pattern transition ordering.
 */
import { describe, it, expect } from 'vitest'
import {
  calcGlobalSweepProgress,
  applyPerfToggle,
  buildTransitionSteps,
  applySweepValue,
} from './scenePlaybackPure.ts'
import { evaluateCurve } from './sweepEval.ts'

// ── calcGlobalSweepProgress ──

describe('calcGlobalSweepProgress', () => {
  it('returns 0 before sweep starts (before offset)', () => {
    // Sweep starts at 2000ms into scene, we are at 1000ms
    expect(calcGlobalSweepProgress(1000, 2000, 5000)).toBe(0)
  })

  it('returns 0 at exactly the offset', () => {
    expect(calcGlobalSweepProgress(2000, 2000, 5000)).toBe(0)
  })

  it('returns correct mid-progress', () => {
    // 4500ms elapsed, offset 2000ms, duration 5000ms → (4500-2000)/5000 = 0.5
    expect(calcGlobalSweepProgress(4500, 2000, 5000)).toBeCloseTo(0.5)
  })

  it('returns 1 at sweep end', () => {
    // 7000ms elapsed, offset 2000ms, duration 5000ms → (7000-2000)/5000 = 1.0
    expect(calcGlobalSweepProgress(7000, 2000, 5000)).toBe(1)
  })

  it('clamps to 1 after sweep ends', () => {
    expect(calcGlobalSweepProgress(10000, 2000, 5000)).toBe(1)
  })

  it('handles zero offset (sweep starts at scene start)', () => {
    expect(calcGlobalSweepProgress(2500, 0, 5000)).toBeCloseTo(0.5)
  })

  it('handles zero duration gracefully', () => {
    expect(calcGlobalSweepProgress(1000, 0, 0)).toBe(0)
  })
})

// ── applyPerfToggle ──

describe('applyPerfToggle', () => {
  it('returns correct perf key for fill', () => {
    const result = applyPerfToggle('fill', true)
    expect(result).toEqual({ key: 'filling', value: true })
  })

  it('returns correct perf key for rev', () => {
    const result = applyPerfToggle('rev', false)
    expect(result).toEqual({ key: 'reversing', value: false })
  })

  it('returns correct perf key for brk', () => {
    const result = applyPerfToggle('brk', true)
    expect(result).toEqual({ key: 'breaking', value: true })
  })

  it('returns null for unknown param', () => {
    const result = applyPerfToggle('unknown' as any, true)
    expect(result).toBeNull()
  })
})

// ── buildTransitionSteps ──
// Pattern transition must follow correct order:
// 1. restore old snapshot → 2. apply satellite modifiers → 3. take new snapshot → 4. reapply global sweep

describe('buildTransitionSteps', () => {
  it('does not include restore (sweep values carry over)', () => {
    const steps = buildTransitionSteps('walk')
    expect(steps).not.toContain('restore')
  })

  it('produces steps in correct order', () => {
    const steps = buildTransitionSteps('walk')
    expect(steps).toEqual(['satellite', 'snapshot', 'globalSweep'])
  })

  it('start and walk use same order', () => {
    expect(buildTransitionSteps('start')).toEqual(buildTransitionSteps('walk'))
  })

  it('satellite always comes before snapshot', () => {
    const steps = buildTransitionSteps('walk')
    expect(steps.indexOf('satellite')).toBeLessThan(steps.indexOf('snapshot'))
  })

  it('globalSweep always comes last', () => {
    const steps = buildTransitionSteps('walk')
    expect(steps[steps.length - 1]).toBe('globalSweep')
  })
})

// ── Sweep carry-over delta (lazy, from live value) ──

describe('applySweepValue', () => {
  it('preserves carry-over when curveValue matches firstValue', () => {
    // Live fxPad value = 0.8 (carry-over from pattern1)
    // Pattern2 curve starts at firstValue = 0.8 (continuous recording)
    // At progress=0: curveValue = firstValue = 0.8
    // result = 0.8 + (0.8 - 0.8) = 0.8 → no jump
    expect(applySweepValue(0.8, 0.8, 0.8)).toBeCloseTo(0.8)
  })

  it('applies delta from live carry-over (separately recorded)', () => {
    // Live fxPad value = 0.8 (carry-over), curve recorded starting at 0.5
    // At start: result = 0.8 + (0.5 - 0.5) = 0.8 → carry-over preserved
    expect(applySweepValue(0.8, 0.5, 0.5)).toBeCloseTo(0.8)
    // Curve moves to 0.7: result = 0.8 + (0.7 - 0.5) = 1.0
    expect(applySweepValue(0.8, 0.7, 0.5)).toBeCloseTo(1.0)
  })

  it('rep2: progress spans both reps correctly', () => {
    // evaluateCurve is range-agnostic — verify rep math
    const curve = [{ t: 0, v: 0.3 }, { t: 0.5, v: 0.6 }, { t: 1, v: 0.8 }]
    expect(evaluateCurve(curve, 0)).toBeCloseTo(0.3)          // rep0 start
    expect(evaluateCurve(curve, 0.5)).toBeCloseTo(0.6)         // rep1 start
    expect(evaluateCurve(curve, 1.0)).toBeCloseTo(0.8)         // rep1 end
  })
})
