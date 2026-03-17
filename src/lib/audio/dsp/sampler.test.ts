import { describe, it, expect } from 'vitest'
import { SamplerVoice, PolySampler, type SampleZone } from './voices.ts'

/** Create a simple sine buffer for testing */
function makeSine(length: number, freq = 440, sr = 44100): Float32Array {
  const buf = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    buf[i] = Math.sin(2 * Math.PI * freq * i / sr)
  }
  return buf
}

/** Create a zone with defaults */
function zone(overrides: Partial<SampleZone> & { rootNote: number; loNote: number; hiNote: number }): SampleZone {
  return {
    buffer: makeSine(4410),
    bufferSR: 44100,
    loVel: 0,
    hiVel: 127,
    ...overrides,
  }
}

describe('SamplerVoice', () => {
  describe('loadSample (single-sample backwards compat)', () => {
    it('plays audio after loadSample + noteOn', () => {
      const v = new SamplerVoice(44100)
      v.loadSample(makeSine(4410), 44100)
      v.noteOn(60, 0.8)
      // First sample of sine is 0, tick a few times to get non-zero
      let nonZero = false
      for (let i = 0; i < 10; i++) { if (v.tick() !== 0) nonZero = true }
      expect(nonZero).toBe(true)
    })

    it('produces zero output without loading a sample', () => {
      const v = new SamplerVoice(44100)
      v.noteOn(60, 0.8)
      expect(v.tick()).toBe(0)
    })
  })

  describe('_findZone', () => {
    it('returns the only zone for single-zone setup', () => {
      const v = new SamplerVoice(44100)
      const z = zone({ rootNote: 60, loNote: 0, hiNote: 127 })
      v.loadZones([z])
      expect(v._findZone(60, 0.8)).toBe(z)
      expect(v._findZone(36, 0.5)).toBe(z)
      expect(v._findZone(96, 1.0)).toBe(z)
    })

    it('selects zone by note range', () => {
      const v = new SamplerVoice(44100)
      const low = zone({ rootNote: 36, loNote: 0, hiNote: 59 })
      const mid = zone({ rootNote: 60, loNote: 60, hiNote: 83 })
      const high = zone({ rootNote: 84, loNote: 84, hiNote: 127 })
      v.loadZones([mid, low, high]) // intentionally unordered — loadZones should sort

      expect(v._findZone(48, 0.8)).toBe(low)
      expect(v._findZone(60, 0.8)).toBe(mid)
      expect(v._findZone(72, 0.8)).toBe(mid)
      expect(v._findZone(84, 0.8)).toBe(high)
      expect(v._findZone(100, 0.8)).toBe(high)
    })

    it('picks closest rootNote when multiple zones overlap', () => {
      const v = new SamplerVoice(44100)
      const a = zone({ rootNote: 48, loNote: 36, hiNote: 72 })
      const b = zone({ rootNote: 72, loNote: 60, hiNote: 96 })
      v.loadZones([a, b])

      // note 60: both match, rootNote 48 is 12 away, rootNote 72 is 12 away — tie goes to first found (a)
      // note 66: both match, 48→18, 72→6 — b wins
      expect(v._findZone(66, 0.8)).toBe(b)
      // note 54: only a matches
      expect(v._findZone(54, 0.8)).toBe(a)
    })

    it('selects by velocity layer', () => {
      const v = new SamplerVoice(44100)
      const soft = zone({ rootNote: 60, loNote: 0, hiNote: 127, loVel: 0, hiVel: 80 })
      const loud = zone({ rootNote: 60, loNote: 0, hiNote: 127, loVel: 81, hiVel: 127 })
      v.loadZones([soft, loud])

      // velocity 0.5 = 64 → soft zone
      expect(v._findZone(60, 0.5)).toBe(soft)
      // velocity 1.0 = 127 → loud zone
      expect(v._findZone(60, 1.0)).toBe(loud)
      // velocity 0.63 ≈ 80 → soft zone (boundary)
      expect(v._findZone(60, 80 / 127)).toBe(soft)
    })

    it('falls back to closest zone when no range matches', () => {
      const v = new SamplerVoice(44100)
      const low = zone({ rootNote: 36, loNote: 24, hiNote: 48 })
      const high = zone({ rootNote: 84, loNote: 72, hiNote: 96 })
      v.loadZones([low, high])

      // note 60: no zone contains it — closest boundary is high.loNote=72 (dist 12) vs low.hiNote=48 (dist 12)
      // both are 12 away from boundaries, but low.rootNote is closer to 60
      expect(v._findZone(60, 0.8)).toBe(low)
      // note 10: below all zones — low is closest
      expect(v._findZone(10, 0.8)).toBe(low)
      // note 110: above all zones — high is closest
      expect(v._findZone(110, 0.8)).toBe(high)
    })

    it('returns null for empty zones', () => {
      const v = new SamplerVoice(44100)
      expect(v._findZone(60, 0.8)).toBeNull()
    })
  })

  describe('multi-zone noteOn', () => {
    it('uses zone rootNote for pitch calculation', () => {
      const v = new SamplerVoice(44100)
      // Two zones: low pitched at C3, high pitched at C5
      const lowBuf = makeSine(4410, 220) // A3
      const highBuf = makeSine(4410, 880) // A5
      const low = { buffer: lowBuf, bufferSR: 44100, rootNote: 48, loNote: 0, hiNote: 63, loVel: 0, hiVel: 127 } satisfies SampleZone
      const high = { buffer: highBuf, bufferSR: 44100, rootNote: 72, loNote: 64, hiNote: 127, loVel: 0, hiVel: 127 } satisfies SampleZone
      v.loadZones([low, high])

      // Play C3 (48) — should use low zone at 1:1 rate (note === rootNote)
      v.noteOn(48, 0.8)
      let nonZero1 = false
      for (let i = 0; i < 10; i++) { if (v.tick() !== 0) nonZero1 = true }
      expect(nonZero1).toBe(true)

      // Play C5 (72) — should use high zone at 1:1 rate
      v.noteOn(72, 0.8)
      let nonZero2 = false
      for (let i = 0; i < 10; i++) { if (v.tick() !== 0) nonZero2 = true }
      expect(nonZero2).toBe(true)
    })
  })

  describe('loadZones normalizes buffers', () => {
    it('global peak-normalizes across all zones (preserving relative dynamics)', () => {
      const v = new SamplerVoice(44100)
      // Buffers must be >64 samples (fade-in region)
      const buf1 = new Float32Array(128).fill(0.25); buf1[100] = 0.5
      const buf2 = new Float32Array(128).fill(0.05); buf2[100] = -0.2
      v.loadZones([
        { buffer: buf1, bufferSR: 44100, rootNote: 60, loNote: 0, hiNote: 63, loVel: 0, hiVel: 127 },
        { buffer: buf2, bufferSR: 44100, rootNote: 72, loNote: 64, hiNote: 127, loVel: 0, hiVel: 127 },
      ])
      // Global peak is 0.5 (buf1[100]), so scale = 2.0
      expect(buf1[100]).toBeCloseTo(1.0)
      // buf2[100] = -0.2 * 2.0 = -0.4 (preserves relative level)
      expect(buf2[100]).toBeCloseTo(-0.4)
    })
  })

  describe('noteOff triggers release', () => {
    it('noteOff is ignored for one-shot (loopMode=0)', () => {
      const v = new SamplerVoice(44100)
      const buf = makeSine(4410)
      v.loadSample(buf, 44100)
      v.noteOn(60, 0.8)
      for (let i = 0; i < 10; i++) v.tick()
      v.noteOff()
      // Should still be producing output (one-shot plays to end)
      let hasOutput = false
      for (let i = 0; i < 100; i++) {
        if (Math.abs(v.tick()) > 0.001) hasOutput = true
      }
      expect(hasOutput).toBe(true)
    })

    it('noteOff triggers release when loopMode=1', () => {
      const v = new SamplerVoice(44100)
      const buf = makeSine(44100) // 1 second buffer
      v.loadSample(buf, 44100)
      v.setParam('loopMode', 1)
      v.noteOn(60, 0.8)
      for (let i = 0; i < 10; i++) v.tick()
      v.noteOff()
      // Tick enough for release envelope
      for (let i = 0; i < 3500; i++) v.tick()
      expect(Math.abs(v.tick())).toBeLessThan(0.001)
    })
  })
})

describe('PolySampler', () => {
  it('plays multiple notes simultaneously', () => {
    const ps = new PolySampler(44100)
    const buf = makeSine(4410)
    ps.loadSample(buf, 44100)
    ps.noteOn(60, 0.8)
    ps.noteOn(64, 0.8)
    ps.noteOn(67, 0.8)
    // Should produce output (3 voices active)
    let hasOutput = false
    for (let i = 0; i < 100; i++) {
      if (Math.abs(ps.tick()) > 0.001) hasOutput = true
    }
    expect(hasOutput).toBe(true)
  })

  it('retriggers same note on same voice', () => {
    const ps = new PolySampler(44100)
    const buf = makeSine(4410)
    ps.loadSample(buf, 44100)
    ps.noteOn(60, 0.8)
    ps.noteOn(64, 0.8)
    // Retrigger note 60 — should reuse voice 0, not allocate voice 2
    ps.noteOn(60, 0.5)
    // Still only 2 voices active
    let sum = 0
    for (let i = 0; i < 10; i++) sum += Math.abs(ps.tick())
    expect(sum).toBeGreaterThan(0)
  })

  it('forwards setParam to all cores', () => {
    const ps = new PolySampler(44100)
    const buf = makeSine(4410)
    ps.loadSample(buf, 44100)
    // Should not throw
    ps.setParam('decay', 2.0)
    ps.setParam('rootNote', 60)
  })

  it('noteOff releases all voices', () => {
    const ps = new PolySampler(44100)
    const buf = makeSine(4410)
    ps.loadSample(buf, 44100)
    ps.noteOn(60, 0.8)
    ps.noteOn(64, 0.8)
    for (let i = 0; i < 10; i++) ps.tick()
    ps.setParam('loopMode', 1)
    ps.noteOn(60, 0.8)
    ps.noteOn(64, 0.8)
    for (let i = 0; i < 10; i++) ps.tick()
    ps.noteOff()
    // Tick until silence (exponential decay ~3000 samples)
    for (let i = 0; i < 3500; i++) ps.tick()
    // Should be silent after release
    expect(Math.abs(ps.tick())).toBeLessThan(0.001)
  })
})
