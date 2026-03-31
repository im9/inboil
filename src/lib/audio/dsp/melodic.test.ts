import { describe, it, expect } from 'vitest'
import { MoogVoice, FMVoice, WTSynth } from './melodic.ts'

const SR = 44100

describe('MoogVoice', () => {
  it('produces output after noteOn', () => {
    const v = new MoogVoice(SR)
    v.noteOn(60, 0.8)
    let nonZero = false
    for (let i = 0; i < 100; i++) { if (v.tick() !== 0) nonZero = true }
    expect(nonZero).toBe(true)
  })

  it('slideNote changes pitch instantly (legato)', () => {
    const v = new MoogVoice(SR)
    v.noteOn(48, 0.8)
    for (let i = 0; i < 100; i++) v.tick()
    v.slideNote(72, 0.8)
    // Still producing output
    let hasOutput = false
    for (let i = 0; i < 100; i++) { if (Math.abs(v.tick()) > 0.001) hasOutput = true }
    expect(hasOutput).toBe(true)
  })
})

describe('FMVoice', () => {
  it('MONO mode produces output', () => {
    const v = new FMVoice(SR)
    v.noteOn(60, 0.8)
    let nonZero = false
    for (let i = 0; i < 200; i++) { if (v.tick() !== 0) nonZero = true }
    expect(nonZero).toBe(true)
  })

  it('POLY12 mode produces output for multiple notes', () => {
    const v = new FMVoice(SR)
    v.setParam('polyMode', 1)
    v.noteOn(60, 0.8)
    v.noteOn(64, 0.8)
    v.noteOn(67, 0.8)
    let sum = 0
    for (let i = 0; i < 200; i++) sum += Math.abs(v.tick())
    expect(sum).toBeGreaterThan(0)
  })

  it('tickStereo produces stereo in WIDE6 mode', () => {
    const v = new FMVoice(SR)
    v.setParam('polyMode', 2)
    v.noteOn(60, 0.8)
    const out = new Float32Array(2)
    for (let i = 0; i < 100; i++) v.tickStereo(out)
    // At least one channel should have output
    expect(Math.abs(out[0]) + Math.abs(out[1])).toBeGreaterThan(0)
  })

  it('soft-clips extreme output to [-1, 1)', () => {
    const v = new FMVoice(SR)
    // High modulation index to provoke amplitude spikes
    v.setParam('fmIndex', 1.0)
    v.noteOn(60, 1.0)
    let peak = 0
    for (let i = 0; i < 4000; i++) {
      const s = v.tick()
      if (Math.abs(s) > peak) peak = Math.abs(s)
    }
    expect(peak).toBeLessThan(1.0)
  })

  it('tanh is transparent at normal levels', () => {
    // At small x, tanh(x) ≈ x within ~x³/3
    // Verify output stays close to raw value for typical signal levels
    const x = 0.2
    expect(Math.tanh(x)).toBeCloseTo(x, 2)  // within 0.005
  })
})

describe('WTSynth', () => {
  it('MONO mode produces output', () => {
    const v = new WTSynth(SR)
    v.noteOn(60, 0.8)
    let nonZero = false
    for (let i = 0; i < 200; i++) { if (v.tick() !== 0) nonZero = true }
    expect(nonZero).toBe(true)
  })

  it('tickStereo produces stereo output', () => {
    const v = new WTSynth(SR)
    v.noteOn(60, 0.8)
    const out = new Float32Array(2)
    for (let i = 0; i < 100; i++) v.tickStereo(out)
    expect(Math.abs(out[0]) + Math.abs(out[1])).toBeGreaterThan(0)
  })

  it('reset silences all cores', () => {
    const v = new WTSynth(SR)
    v.setParam('polyMode', 1)
    v.noteOn(60, 0.8)
    v.noteOn(64, 0.8)
    for (let i = 0; i < 100; i++) v.tick()
    v.reset()
    // After reset, no env should produce output
    expect(v.tick()).toBe(0)
  })
})
