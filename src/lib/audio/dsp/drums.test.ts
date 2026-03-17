import { describe, it, expect } from 'vitest'
import { DrumMachine, DRUM_PRESETS } from './drums.ts'

const SR = 44100

describe('DrumMachine', () => {
  it('produces non-zero output after noteOn', () => {
    const dm = new DrumMachine(SR, 'Kick')
    dm.noteOn(60, 0.8)
    let nonZero = false
    for (let i = 0; i < 100; i++) { if (dm.tick() !== 0) nonZero = true }
    expect(nonZero).toBe(true)
  })

  it('every preset instantiates without error', () => {
    for (const name of Object.keys(DRUM_PRESETS)) {
      const dm = new DrumMachine(SR, name)
      dm.noteOn(60, 1.0)
      // Should not throw and should produce output
      let sum = 0
      for (let i = 0; i < 200; i++) sum += Math.abs(dm.tick())
      expect(sum).toBeGreaterThan(0)
    }
  })

  it('reset silences output', () => {
    const dm = new DrumMachine(SR, 'Snare')
    dm.noteOn(60, 1.0)
    for (let i = 0; i < 50; i++) dm.tick()
    dm.reset()
    expect(dm.tick()).toBe(0)
  })

  it('setParam updates decay — shorter decay is quieter', () => {
    const short = new DrumMachine(SR, 'Kick')
    const long = new DrumMachine(SR, 'Kick')
    short.setParam('decay', 0.02)
    long.setParam('decay', 1.0)
    short.noteOn(60, 1.0)
    long.noteOn(60, 1.0)
    // Measure energy after 4000 samples — short should have much less
    let shortEnergy = 0, longEnergy = 0
    for (let i = 0; i < 4000; i++) {
      shortEnergy += Math.abs(short.tick())
      longEnergy += Math.abs(long.tick())
    }
    expect(shortEnergy).toBeLessThan(longEnergy * 0.5)
  })
})
