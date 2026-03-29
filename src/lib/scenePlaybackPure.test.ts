/**
 * Tests for pure scene playback helpers (ADR 128 Phase 2).
 * Covers global sweep progress, toggle application, and pattern transition ordering.
 */
import { describe, it, expect } from 'vitest'
import {
  calcGlobalSweepProgress,
  applyPerfToggle,
  buildTransitionSteps,
} from './scenePlaybackPure.ts'

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
  it('produces steps in correct order for walkToNode', () => {
    const steps = buildTransitionSteps('walk')
    expect(steps).toEqual(['restore', 'satellite', 'snapshot', 'globalSweep'])
  })

  it('produces steps in correct order for startSceneNode', () => {
    const steps = buildTransitionSteps('start')
    expect(steps).toEqual(['restore', 'satellite', 'snapshot', 'globalSweep'])
  })

  it('restore always comes before satellite', () => {
    const steps = buildTransitionSteps('walk')
    expect(steps.indexOf('restore')).toBeLessThan(steps.indexOf('satellite'))
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
