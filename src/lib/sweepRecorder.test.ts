/**
 * Tests for sweep recording utilities (ADR 123 Phase 2).
 * targetKey must produce unique, stable keys for every SweepTarget/SweepToggleTarget variant.
 */
import { describe, it, expect } from 'vitest'
import { targetKey } from './sweepEval'
import { quantizeTogglePoints } from './sweepRecorder.svelte'

describe('targetKey', () => {
  // ── Continuous targets (SweepTarget) ──

  it('master params produce unique keys', () => {
    const a = targetKey({ kind: 'master', param: 'masterVolume' })
    const b = targetKey({ kind: 'master', param: 'filterCutoff' })
    expect(a).toBe('master:masterVolume')
    expect(b).toBe('master:filterCutoff')
    expect(a).not.toBe(b)
  })

  it('track params include trackId', () => {
    const a = targetKey({ kind: 'track', trackId: 0, param: 'volume' })
    const b = targetKey({ kind: 'track', trackId: 1, param: 'volume' })
    const c = targetKey({ kind: 'track', trackId: 0, param: 'pan' })
    expect(a).toBe('track:0:volume')
    expect(b).toBe('track:1:volume')
    expect(c).toBe('track:0:pan')
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('send params include trackId', () => {
    const a = targetKey({ kind: 'send', trackId: 0, param: 'reverbSend' })
    const b = targetKey({ kind: 'send', trackId: 0, param: 'delaySend' })
    const c = targetKey({ kind: 'send', trackId: 1, param: 'reverbSend' })
    expect(a).toBe('send:0:reverbSend')
    expect(b).toBe('send:0:delaySend')
    expect(c).toBe('send:1:reverbSend')
  })

  it('fx params produce unique keys', () => {
    const a = targetKey({ kind: 'fx', param: 'reverbWet' })
    const b = targetKey({ kind: 'fx', param: 'delayFeedback' })
    expect(a).toBe('fx:reverbWet')
    expect(b).toBe('fx:delayFeedback')
  })

  it('eq params include band and param', () => {
    const a = targetKey({ kind: 'eq', band: 'eqLow', param: 'freq' })
    const b = targetKey({ kind: 'eq', band: 'eqLow', param: 'gain' })
    const c = targetKey({ kind: 'eq', band: 'eqMid', param: 'freq' })
    expect(a).toBe('eq:eqLow:freq')
    expect(b).toBe('eq:eqLow:gain')
    expect(c).toBe('eq:eqMid:freq')
  })

  // ── Toggle targets (SweepToggleTarget) ──

  it('hold toggles include fx name', () => {
    const a = targetKey({ kind: 'hold', fx: 'verb' })
    const b = targetKey({ kind: 'hold', fx: 'delay' })
    expect(a).toBe('hold:verb')
    expect(b).toBe('hold:delay')
  })

  it('fxOn toggles include fx name', () => {
    const a = targetKey({ kind: 'fxOn', fx: 'verb' })
    const b = targetKey({ kind: 'fxOn', fx: 'glitch' })
    expect(a).toBe('fxOn:verb')
    expect(b).toBe('fxOn:glitch')
  })

  it('mute toggles include trackId', () => {
    const a = targetKey({ kind: 'mute', trackId: 0 })
    const b = targetKey({ kind: 'mute', trackId: 3 })
    expect(a).toBe('mute:0')
    expect(b).toBe('mute:3')
  })

  it('different kinds never collide', () => {
    const keys = [
      targetKey({ kind: 'master', param: 'masterVolume' }),
      targetKey({ kind: 'track', trackId: 0, param: 'volume' }),
      targetKey({ kind: 'send', trackId: 0, param: 'reverbSend' }),
      targetKey({ kind: 'fx', param: 'reverbWet' }),
      targetKey({ kind: 'eq', band: 'eqLow', param: 'freq' }),
      targetKey({ kind: 'hold', fx: 'verb' }),
      targetKey({ kind: 'fxOn', fx: 'verb' }),
      targetKey({ kind: 'mute', trackId: 0 }),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

// ── Tests: quantizeTogglePoints (ADR 128 Phase 2) ──

describe('quantizeTogglePoints', () => {
  it('snaps points to bar boundaries at 120 BPM', () => {
    // 120 BPM → 1 bar = 2000ms. totalMs = 8000ms (4 bars)
    // barT = 2000/8000 = 0.25
    const points = [
      { t: 0.12, on: true },   // near bar 0.5 → snaps to 0.0 or 0.25
      { t: 0.27, on: false },  // near 0.25 → snaps to 0.25
      { t: 0.60, on: true },   // near 0.5 → snaps to 0.5
      { t: 0.88, on: false },  // near 1.0 → snaps to 1.0
    ]
    quantizeTogglePoints(points, 8000, 120)
    expect(points[0].t).toBeCloseTo(0.0)
    expect(points[1].t).toBeCloseTo(0.25)
    expect(points[2].t).toBeCloseTo(0.5)
    expect(points[3].t).toBeCloseTo(1.0)
  })

  it('clamps to [0, 1] range', () => {
    const points = [
      { t: 0.01, on: true },
      { t: 0.99, on: false },
    ]
    quantizeTogglePoints(points, 4000, 120)
    expect(points[0].t).toBeGreaterThanOrEqual(0)
    expect(points[1].t).toBeLessThanOrEqual(1)
  })

  it('handles different BPMs', () => {
    // 140 BPM → 1 bar = 60000/140*4 ≈ 1714ms. 4 bars total.
    const msPerBar = (60000 / 140) * 4
    const totalMs = msPerBar * 4
    const points = [{ t: 0.13, on: true }]
    quantizeTogglePoints(points, totalMs, 140)
    // barT = 0.25, so 0.13 snaps to 0.25 (closer than 0.0)
    expect(points[0].t).toBeCloseTo(0.25)
  })

  it('preserves on/off state', () => {
    const points = [
      { t: 0.1, on: true },
      { t: 0.6, on: false },
    ]
    quantizeTogglePoints(points, 8000, 120)
    expect(points[0].on).toBe(true)
    expect(points[1].on).toBe(false)
  })
})
