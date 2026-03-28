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

  it('drive param changes signal level', () => {
    const render = (drive: number) => {
      const v = new AnalogVoice(SR)
      v.setParam('drive', drive)
      v.noteOn(36, 1.0)
      let peak = 0
      for (let i = 0; i < 500; i++) peak = Math.max(peak, Math.abs(v.tick()))
      return peak
    }
    const soft = render(0.5)
    const hard = render(3.0)
    expect(hard).toBeGreaterThan(soft)
  })

  it('sub oscillator adds low-end energy', () => {
    const render = (subLevel: number) => {
      const v = new AnalogVoice(SR)
      v.setParam('sub', subLevel)
      v.setParam('drive', 0.8)    // low drive to avoid tanh compression masking sub
      v.setParam('sustain', 0.8)  // hold level steady
      v.noteOn(36, 1.0)  // C2 — low note
      // Tick past attack+decay into sustain
      for (let i = 0; i < SR * 0.3; i++) v.tick()
      let rms = 0
      const N = 4410  // 100ms in sustain phase
      for (let i = 0; i < N; i++) { const s = v.tick(); rms += s * s }
      return Math.sqrt(rms / N)
    }
    const noSub = render(0.0)
    const withSub = render(0.8)
    expect(withSub).toBeGreaterThan(noSub * 1.2)  // at least 20% more energy
  })

  it('attack param affects onset slope', () => {
    const render = (attack: number) => {
      const v = new AnalogVoice(SR)
      v.setParam('attack', attack)
      v.noteOn(48, 1.0)
      // Measure level after 5ms
      const samples5ms = Math.round(SR * 0.005)
      let last = 0
      for (let i = 0; i < samples5ms; i++) last = Math.abs(v.tick())
      return last
    }
    const fast = render(0.002)
    const slow = render(0.2)
    expect(fast).toBeGreaterThan(slow * 2)
  })

  it('sustain param affects held note level', () => {
    const render = (sustain: number) => {
      const v = new AnalogVoice(SR)
      v.setParam('sustain', sustain)
      v.setParam('decay', 0.1)
      v.noteOn(48, 1.0)
      // Tick past decay into sustain phase
      for (let i = 0; i < SR * 0.5; i++) v.tick()
      let sum = 0
      for (let i = 0; i < 1000; i++) sum += Math.abs(v.tick())
      return sum
    }
    const low = render(0.1)
    const high = render(0.9)
    expect(high).toBeGreaterThan(low * 2)
  })

  it('release param affects tail length', () => {
    const render = (release: number) => {
      const v = new AnalogVoice(SR)
      v.setParam('release', release)
      v.noteOn(48, 1.0)
      for (let i = 0; i < 500; i++) v.tick()
      v.noteOff()
      // Measure energy 100ms after noteOff
      for (let i = 0; i < SR * 0.1; i++) v.tick()
      let sum = 0
      for (let i = 0; i < 500; i++) sum += Math.abs(v.tick())
      return sum
    }
    const short = render(0.02)
    const long = render(0.5)
    expect(long).toBeGreaterThan(short)
  })
})
