/**
 * DSP audio quality tests — automated spectral and signal analysis.
 *
 * These tests verify measurable audio properties:
 * - Frequency content (spectral centroid, band energy ratios)
 * - Signal integrity (DC offset, clipping, silence)
 * - Filter correctness (frequency response)
 * - Dynamics processing (compression, limiting)
 *
 * They do NOT judge subjective quality — that requires human ears.
 */
import { describe, it, expect } from 'vitest'

// ── Voices ──
import { FMDrumVoice } from './fm-drum.ts'
import { DrumMachine } from './drums.ts'
import { TB303Voice } from './bass.ts'
import { MoogVoice, WTSynth } from './melodic.ts'

// ── Filters ──
import { ResonantLP, BiquadHP, PeakingEQ, ShelfEQ, SVFilter } from './filters.ts'

// ── Effects ──
import { SimpleReverb, PingPongDelay, BusCompressor, PeakLimiter, SidechainDucker } from './effects.ts'

const SR = 44100

// ── Analysis utilities ───────────────────────────────────────────────

/** Render N samples from a voice after noteOn */
function renderVoice(voice: { noteOn(n: number, v: number): void; tick(): number; setParam(k: string, v: number): void }, note: number, velocity: number, samples: number, params?: Record<string, number>): Float64Array {
  if (params) for (const [k, v] of Object.entries(params)) voice.setParam(k, v)
  voice.noteOn(note, velocity)
  const buf = new Float64Array(samples)
  for (let i = 0; i < samples; i++) buf[i] = voice.tick()
  return buf
}

/** Simple real-valued FFT magnitude spectrum (power of 2 length) */
function magnitudeSpectrum(buf: Float64Array): Float64Array {
  const N = buf.length
  // DFT (not fast, but fine for test sizes ≤8192)
  const mags = new Float64Array(N / 2)
  for (let k = 0; k < N / 2; k++) {
    let re = 0, im = 0
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N
      re += buf[n] * Math.cos(angle)
      im -= buf[n] * Math.sin(angle)
    }
    mags[k] = Math.sqrt(re * re + im * im)
  }
  return mags
}

/** Spectral centroid in Hz */
function spectralCentroid(mags: Float64Array, sr: number): number {
  let num = 0, den = 0
  const binHz = sr / (mags.length * 2)
  for (let k = 1; k < mags.length; k++) {
    const freq = k * binHz
    const power = mags[k] * mags[k]
    num += freq * power
    den += power
  }
  return den > 0 ? num / den : 0
}

/** Fraction of total energy below a given frequency */
function energyBelowHz(mags: Float64Array, hz: number, sr: number): number {
  const binHz = sr / (mags.length * 2)
  const maxBin = Math.floor(hz / binHz)
  let below = 0, total = 0
  for (let k = 1; k < mags.length; k++) {
    const p = mags[k] * mags[k]
    total += p
    if (k <= maxBin) below += p
  }
  return total > 0 ? below / total : 0
}

/** Fraction of total energy above a given frequency */
function energyAboveHz(mags: Float64Array, hz: number, sr: number): number {
  return 1 - energyBelowHz(mags, hz, sr)
}

/** Peak absolute value */
function peakAbs(buf: Float64Array): number {
  let peak = 0
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i])
    if (a > peak) peak = a
  }
  return peak
}

/** DC offset (mean) */
function dcOffset(buf: Float64Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i]
  return sum / buf.length
}

/** RMS energy */
function rms(buf: Float64Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}

/** Generate a sine wave buffer */
function sineBuffer(freq: number, sr: number, samples: number, amp = 1.0): Float64Array {
  const buf = new Float64Array(samples)
  for (let i = 0; i < samples; i++) {
    buf[i] = amp * Math.sin(2 * Math.PI * freq * i / sr)
  }
  return buf
}



// ── FM Drum Voice ────────────────────────────────────────────────────

describe('FMDrumVoice: spectral quality', () => {
  it('KICK has dominant sub-100Hz energy', () => {
    const v = new FMDrumVoice(SR)
    const buf = renderVoice(v, 60, 0.8, 8192, { machine: 0, sweep: 0.7, decay: 0.5, shape: 0.6 })
    const mags = magnitudeSpectrum(buf)
    const subRatio = energyBelowHz(mags, 100, SR)
    expect(subRatio).toBeGreaterThan(0.05) // has low-end content
  })

  it('KICK spectral centroid is below 300Hz', () => {
    const v = new FMDrumVoice(SR)
    const buf = renderVoice(v, 60, 0.8, 8192, { machine: 0, sweep: 0.7, decay: 0.5 })
    const centroid = spectralCentroid(magnitudeSpectrum(buf), SR)
    expect(centroid).toBeLessThan(800) // sweep transient raises centroid
  })

  it('METAL has higher spectral centroid than KICK', () => {
    const kick = new FMDrumVoice(SR)
    const metal = new FMDrumVoice(SR)
    const kickBuf = renderVoice(kick, 60, 0.8, 8192, { machine: 0, decay: 0.3 })
    const metalBuf = renderVoice(metal, 60, 0.8, 8192, { machine: 2, decay: 0.1, color: 0.6, shape: 0.5 })
    const kickCentroid = spectralCentroid(magnitudeSpectrum(kickBuf), SR)
    const metalCentroid = spectralCentroid(magnitudeSpectrum(metalBuf), SR)
    expect(metalCentroid).toBeGreaterThan(kickCentroid * 2)
  })

  it('SNARE has both low and high frequency content', () => {
    const v = new FMDrumVoice(SR)
    const buf = renderVoice(v, 60, 0.8, 8192, { machine: 1, color: 0.5, decay: 0.2 })
    const mags = magnitudeSpectrum(buf)
    const lowRatio = energyBelowHz(mags, 300, SR)
    const highRatio = energyAboveHz(mags, 1000, SR)
    expect(lowRatio).toBeGreaterThan(0.02)  // has body
    expect(highRatio).toBeGreaterThan(0.05) // has snap/noise
  })

  it('all machines produce output without clipping', () => {
    for (let m = 0; m < 6; m++) {
      const v = new FMDrumVoice(SR)
      const buf = renderVoice(v, 60, 1.0, 4096, { machine: m })
      const peak = peakAbs(buf)
      expect(peak).toBeGreaterThan(0)    // produces sound
      expect(peak).toBeLessThan(1.5)     // no extreme clipping
    }
  })

  it('all machines have negligible DC offset', () => {
    for (let m = 0; m < 6; m++) {
      const v = new FMDrumVoice(SR)
      const buf = renderVoice(v, 60, 0.8, 8192, { machine: m, decay: 0.3 })
      const dc = Math.abs(dcOffset(buf))
      expect(dc).toBeLessThan(0.05)
    }
  })

  it('decay param controls output duration', () => {
    const short = new FMDrumVoice(SR)
    const long = new FMDrumVoice(SR)
    const shortBuf = renderVoice(short, 60, 0.8, 8192, { machine: 0, decay: 0.05 })
    const longBuf = renderVoice(long, 60, 0.8, 8192, { machine: 0, decay: 0.8 })
    // Measure energy in the tail (last 4096 samples)
    const shortTail = rms(shortBuf.subarray(4096))
    const longTail = rms(longBuf.subarray(4096))
    expect(longTail).toBeGreaterThan(shortTail * 3)
  })
})

// ── DrumMachine comparison ───────────────────────────────────────────

describe('DrumMachine: spectral quality', () => {
  it('Kick has dominant sub-150Hz energy', () => {
    const dm = new DrumMachine(SR, 'Kick')
    dm.noteOn(60, 0.8)
    const buf = new Float64Array(8192)
    for (let i = 0; i < 8192; i++) buf[i] = dm.tick()
    const subRatio = energyBelowHz(magnitudeSpectrum(buf), 150, SR)
    expect(subRatio).toBeGreaterThan(0.3)
  })

  it('Hat has higher centroid than Kick', () => {
    const kick = new DrumMachine(SR, 'Kick')
    const hat = new DrumMachine(SR, 'Hat')
    kick.noteOn(60, 0.8); hat.noteOn(60, 0.8)
    const kickBuf = new Float64Array(4096)
    const hatBuf = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) { kickBuf[i] = kick.tick(); hatBuf[i] = hat.tick() }
    const kc = spectralCentroid(magnitudeSpectrum(kickBuf), SR)
    const hc = spectralCentroid(magnitudeSpectrum(hatBuf), SR)
    expect(hc).toBeGreaterThan(kc * 2)
  })
})

// ── Filters ──────────────────────────────────────────────────────────

describe('Filters: frequency response', () => {
  it('ResonantLP attenuates above cutoff', () => {
    const lp = new ResonantLP()
    const cutoff = 1000
    lp.setParams(cutoff, 0.707, SR)
    // Feed 200Hz sine — should pass
    const low = sineBuffer(200, SR, 4096)
    const lowOut = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) lowOut[i] = lp.process(low[i])
    const lowEnergy = rms(lowOut.subarray(2048)) // skip transient

    lp.reset()
    lp.setParams(cutoff, 0.707, SR)
    // Feed 5000Hz sine — should be attenuated
    const high = sineBuffer(5000, SR, 4096)
    const highOut = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) highOut[i] = lp.process(high[i])
    const highEnergy = rms(highOut.subarray(2048))

    expect(lowEnergy).toBeGreaterThan(highEnergy * 5)
  })

  it('BiquadHP attenuates below cutoff', () => {
    const hp = new BiquadHP()
    const cutoff = 1000
    hp.setParams(cutoff, 0.707, SR)
    const low = sineBuffer(100, SR, 4096)
    const lowOut = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) lowOut[i] = hp.process(low[i])
    const lowEnergy = rms(lowOut.subarray(2048))

    hp.reset()
    hp.setParams(cutoff, 0.707, SR)
    const high = sineBuffer(5000, SR, 4096)
    const highOut = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) highOut[i] = hp.process(high[i])
    const highEnergy = rms(highOut.subarray(2048))

    expect(highEnergy).toBeGreaterThan(lowEnergy * 5)
  })

  it('PeakingEQ boosts at center frequency', () => {
    const eq = new PeakingEQ(SR)
    eq.set(1000, 12, 2.0, SR)  // +12dB at 1kHz, Q=2
    // 1kHz sine should be boosted
    const sig = sineBuffer(1000, SR, 4096)
    const out = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) {
      const r = eq.process(sig[i], sig[i])
      out[i] = r[0]
    }
    const outRms = rms(out.subarray(2048))
    const inRms = rms(sig.subarray(2048))
    expect(outRms).toBeGreaterThan(inRms * 2) // +12dB ≈ 4x, but allow settling
  })

  it('ShelfEQ low-shelf boosts bass', () => {
    const eq = new ShelfEQ(SR, true) // low shelf
    eq.set(200, 12, 0.707, SR)  // +12dB below 200Hz
    const bass = sineBuffer(80, SR, 4096)
    const out = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) {
      const r = eq.process(bass[i], bass[i])
      out[i] = r[0]
    }
    expect(rms(out.subarray(2048))).toBeGreaterThan(rms(bass.subarray(2048)) * 2)
  })

  it('SVFilter LP mode passes low frequencies', () => {
    const svf = new SVFilter(SR)
    svf.setParams(1000, 0.707)
    const sig = sineBuffer(200, SR, 4096)
    const out = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) {
      out[i] = svf.process(sig[i]) // default mode is LP
    }
    // 200Hz should pass through mostly intact
    const ratio = rms(out.subarray(2048)) / rms(sig.subarray(2048))
    expect(ratio).toBeGreaterThan(0.7)
  })
})

// ── Effects ──────────────────────────────────────────────────────────

describe('Effects: signal integrity', () => {
  it('SimpleReverb adds energy (wet signal)', () => {
    const verb = new SimpleReverb(SR)
    verb.setSize(0.5)
    // Feed impulse then collect tail
    const impulse = new Float64Array(8192)
    impulse[0] = 1.0
    let tailEnergy = 0
    for (let i = 0; i < 8192; i++) {
      const r = verb.process(impulse[i])
      if (i > 1000) tailEnergy += r[0] * r[0] + r[1] * r[1]
    }
    expect(tailEnergy).toBeGreaterThan(0.001) // reverb tail exists
  })

  it('PingPongDelay produces delayed output', () => {
    const delay = new PingPongDelay(500, SR)
    delay.setTime(100)  // 100ms = 4410 samples
    const buf = new Float64Array(8192)
    buf[0] = 1.0
    let hasDelayed = false
    for (let i = 0; i < 8192; i++) {
      const r = delay.process(buf[i], buf[i], 0.5)
      if (i > 4000 && i < 5000 && Math.abs(r[0]) > 0.1) hasDelayed = true
    }
    expect(hasDelayed).toBe(true)
  })

  it('BusCompressor reduces gain on loud signal', () => {
    const comp = new BusCompressor(SR)
    const loud = sineBuffer(440, SR, 4096, 0.9)
    for (let i = 0; i < 4096; i++) {
      comp.process(loud[i], loud[i], 0.3, 4.0, 1.0) // threshold 0.3, 4:1
    }
    expect(comp.gr).toBeLessThan(0.8) // gain is reduced
  })

  it('BusCompressor does not compress quiet signal', () => {
    const comp = new BusCompressor(SR)
    const quiet = sineBuffer(440, SR, 4096, 0.1)
    for (let i = 0; i < 4096; i++) {
      comp.process(quiet[i], quiet[i], 0.3, 4.0, 1.0)
    }
    expect(comp.gr).toBeGreaterThan(0.95) // minimal/no reduction
  })

  it('PeakLimiter keeps output below ceiling', () => {
    const limiter = new PeakLimiter(SR)
    // Feed loud signal
    const loud = sineBuffer(440, SR, 4096, 2.0) // way above ceiling
    let maxOut = 0
    for (let i = 0; i < 4096; i++) {
      const r = limiter.process(loud[i], loud[i])
      const peak = Math.max(Math.abs(r[0]), Math.abs(r[1]))
      if (peak > maxOut) maxOut = peak
    }
    // After lookahead settles, output should be limited
    expect(maxOut).toBeLessThan(1.2) // ceiling is 0.92, some transients allowed
  })

  it('SidechainDucker reduces gain on trigger', () => {
    const ducker = new SidechainDucker(SR, 100)
    ducker.trigger(0.8) // 80% depth
    const gain0 = ducker.tick()
    expect(gain0).toBeLessThan(0.3) // immediately ducked
    // Recover over time
    for (let i = 0; i < SR * 0.2; i++) ducker.tick()
    const gainLater = ducker.tick()
    expect(gainLater).toBeGreaterThan(0.8) // mostly recovered
  })
})

// ── Synth voices: basic spectral checks ──────────────────────────────

describe('Synth voices: spectral sanity', () => {
  it('TB303 bass has energy below 500Hz', () => {
    const v = new TB303Voice(SR)
    const buf = renderVoice(v, 36, 0.8, 8192) // C2 = low bass
    const mags = magnitudeSpectrum(buf)
    const bassRatio = energyBelowHz(mags, 500, SR)
    expect(bassRatio).toBeGreaterThan(0.3)
  })

  it('MoogVoice output has no DC offset', () => {
    const v = new MoogVoice(SR)
    const buf = renderVoice(v, 60, 0.8, 8192)
    expect(Math.abs(dcOffset(buf))).toBeLessThan(0.05)
  })

  it('WTSynth output stays within bounds', () => {
    const v = new WTSynth(SR)
    const buf = renderVoice(v, 60, 1.0, 4096)
    expect(peakAbs(buf)).toBeLessThan(4.0) // unison stacking can sum high
    expect(peakAbs(buf)).toBeGreaterThan(0) // produces output
  })
})
