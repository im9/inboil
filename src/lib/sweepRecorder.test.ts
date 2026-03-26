/**
 * Tests for sweep recording utilities (ADR 123 Phase 2).
 * targetKey must produce unique, stable keys for every SweepTarget/SweepToggleTarget variant.
 */
import { describe, it, expect } from 'vitest'
import { targetKey } from './sweepEval'

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
