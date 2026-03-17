import { describe, it, expect } from 'vitest'
import { TB303Voice, AnalogVoice } from './bass.ts'

const SR = 44100

describe('TB303Voice', () => {
  it('produces output after noteOn', () => {
    const v = new TB303Voice(SR)
    v.noteOn(48, 0.8)
    let nonZero = false
    for (let i = 0; i < 100; i++) { if (v.tick() !== 0) nonZero = true }
    expect(nonZero).toBe(true)
  })

  it('silences after noteOff + release', () => {
    const v = new TB303Voice(SR)
    v.noteOn(48, 0.8)
    for (let i = 0; i < 100; i++) v.tick()
    v.noteOff()
    // Release is 20ms — tick past it
    for (let i = 0; i < 2000; i++) v.tick()
    expect(Math.abs(v.tick())).toBeLessThan(0.001)
  })

  it('slideNote keeps amp open (legato)', () => {
    const v = new TB303Voice(SR)
    v.noteOn(48, 0.8)
    for (let i = 0; i < 100; i++) v.tick()
    v.slideNote(60, 0.8)
    // Should still be producing output (amp envelope not retriggered)
    let hasOutput = false
    for (let i = 0; i < 100; i++) { if (Math.abs(v.tick()) > 0.001) hasOutput = true }
    expect(hasOutput).toBe(true)
  })
})

describe('AnalogVoice', () => {
  it('produces output after noteOn', () => {
    const v = new AnalogVoice(SR)
    v.noteOn(60, 0.8)
    let nonZero = false
    for (let i = 0; i < 100; i++) { if (v.tick() !== 0) nonZero = true }
    expect(nonZero).toBe(true)
  })

  it('setParam updates cutoff without throwing', () => {
    const v = new AnalogVoice(SR)
    v.setParam('cutoffBase', 1200)
    v.setParam('envMod', 3000)
    v.noteOn(60, 0.8)
    let sum = 0
    for (let i = 0; i < 100; i++) sum += Math.abs(v.tick())
    expect(sum).toBeGreaterThan(0)
  })
})
