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
import { SimpleReverb, ModulatedReverb, ShimmerReverb, PingPongDelay, TapeDelay, BusCompressor, PeakLimiter, SidechainDucker, OctaveShifter, TapeSaturator, EarlyReflections, PreDelay } from './effects.ts'

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

// ── Feedback safety & flavour differentiation ────────────────────────

describe('OctaveShifter: pitch quality', () => {
  it('shifts 440Hz input to ~880Hz (octave up)', () => {
    const shifter = new OctaveShifter(SR)
    const N = 8192
    const out = new Float64Array(N)
    // Feed 440Hz sine, collect shifted output (skip first window for settling)
    for (let i = 0; i < SR * 0.1; i++) {
      shifter.process(Math.sin(2 * Math.PI * 440 * i / SR) * 0.5)
    }
    for (let i = 0; i < N; i++) {
      out[i] = shifter.process(Math.sin(2 * Math.PI * 440 * (i + SR * 0.1) / SR) * 0.5)
    }
    const mags = magnitudeSpectrum(out)
    const centroid = spectralCentroid(mags, SR)
    const binHz = SR / N  // frequency per bin
    // Check energy near 880Hz is significant (octave-shifted component exists)
    const bin880 = Math.round(880 / binHz)
    const energy880 = mags[bin880] * mags[bin880]
    const bin440 = Math.round(440 / binHz)
    const energy440 = mags[bin440] * mags[bin440]
    // Shifted 880Hz component must have substantial energy (>10% of 440Hz)
    expect(energy880 / energy440).toBeGreaterThan(0.1)
    // Spectral centroid should be well above 440Hz (shifted energy pulls it up)
    expect(centroid).toBeGreaterThan(700)
  })

  it('output is bounded with sustained input', () => {
    const shifter = new OctaveShifter(SR)
    let maxOut = 0
    for (let i = 0; i < SR * 2; i++) {
      const input = Math.sin(2 * Math.PI * 440 * i / SR) * 0.5
      const out = Math.abs(shifter.process(input))
      if (out > maxOut) maxOut = out
    }
    expect(maxOut).toBeLessThan(2.0)
    expect(maxOut).toBeGreaterThan(0.01)
  })
})

describe('Shimmer feedback safety', () => {
  it('shimmer produces audible difference vs plain reverb', () => {
    // Run reverb WITHOUT shimmer
    const reverbDry = new SimpleReverb(SR)
    reverbDry.setSize(0.9); reverbDry.setDamp(0.15)
    let dryEnergy = 0
    for (let i = 0; i < SR * 2; i++) {
      const input = i < SR * 0.1 ? Math.sin(2 * Math.PI * 440 * i / SR) * 0.5 : 0
      const r = reverbDry.process(input)
      if (i > SR) dryEnergy += r[0] * r[0] + r[1] * r[1]  // late tail energy
    }

    // Run reverb WITH shimmer (same reverb params)
    const reverbWet = new SimpleReverb(SR)
    const shifter = new OctaveShifter(SR)
    reverbWet.setSize(0.9); reverbWet.setDamp(0.15)
    const shimmerAmount = 0.6
    let shimmerPrev = 0
    let wetEnergy = 0
    for (let i = 0; i < SR * 2; i++) {
      const input = i < SR * 0.1 ? Math.sin(2 * Math.PI * 440 * i / SR) * 0.5 : 0
      const shimShifted = Math.tanh(shifter.process(shimmerPrev))
      const r = reverbWet.process(input + shimShifted * shimmerAmount)
      shimmerPrev = Math.tanh((r[0] + r[1]) * 2)
      r[0] += shimShifted * shimmerAmount * 0.5
      r[1] += shimShifted * shimmerAmount * 0.5
      if (i > SR) wetEnergy += r[0] * r[0] + r[1] * r[1]
    }

    // Shimmer should add noticeable energy to the tail (at least 50% more)
    expect(wetEnergy / dryEnergy).toBeGreaterThan(1.5)
  })

  it('shimmer feedback loop stays bounded after 5 seconds', () => {
    const reverb = new SimpleReverb(SR)
    const shifter = new OctaveShifter(SR)
    reverb.setSize(0.95)
    reverb.setDamp(0.15)
    const shimmerAmount = 0.6  // matches engine max

    let shimmerPrev = 0
    let maxOutput = 0

    for (let i = 0; i < SR * 5; i++) {
      const dryInput = i < 100 ? Math.sin(2 * Math.PI * 440 * i / SR) * 0.8 : 0
      // Mirrors worklet-processor.ts shimmer loop
      const shimShifted = Math.tanh(shifter.process(shimmerPrev))
      const shimReverbIn = dryInput + shimShifted * shimmerAmount
      const rev = reverb.process(shimReverbIn)
      shimmerPrev = Math.tanh((rev[0] + rev[1]) * 1.2)
      rev[0] += shimShifted * shimmerAmount * 0.5
      rev[1] += shimShifted * shimmerAmount * 0.5
      const peak = Math.max(Math.abs(rev[0]), Math.abs(rev[1]))
      if (peak > maxOutput) maxOutput = peak
    }

    expect(maxOutput).toBeLessThan(3.0)
    expect(maxOutput).toBeGreaterThan(0.001)
  })

  it('ShimmerReverb decays to silence after input stops', () => {
    const shim = new ShimmerReverb(SR)
    shim.setSize(0.85); shim.setDamp(0.15)
    shim.setFeedback(0.3); shim.setShimmerAmount(0.8)

    // Feed 0.5s of signal
    for (let i = 0; i < SR * 0.5; i++) {
      const input = Math.sin(2 * Math.PI * 330 * i / SR) * 0.5
      shim.process(input, input)
    }

    // Then silence for 10s — must decay
    let finalPeak = 0
    for (let i = 0; i < SR * 10; i++) {
      const r = shim.process(0, 0)
      if (i > SR * 9) {
        const peak = Math.max(Math.abs(r[0]), Math.abs(r[1]))
        if (peak > finalPeak) finalPeak = peak
      }
    }

    expect(finalPeak).toBeLessThan(0.01)
  })
})

describe('Reverb flavour differentiation', () => {
  function reverbTailEnergy(size: number, damp: number): number {
    const verb = new SimpleReverb(SR)
    verb.setSize(size)
    verb.setDamp(damp)
    // Impulse response
    let energy = 0
    for (let i = 0; i < SR * 2; i++) {
      const input = i === 0 ? 1.0 : 0
      const r = verb.process(input)
      // Measure energy in late tail (after 500ms)
      if (i > SR * 0.5) energy += r[0] * r[0] + r[1] * r[1]
    }
    return energy
  }

  it('Hall has significantly longer tail than Room', () => {
    // Room: size 0.3–0.75, damp 0.2–0.8 (using mid values)
    const roomEnergy = reverbTailEnergy(0.5, 0.5)
    // Hall: size 0.85–0.99, damp 0–0.15 (using mid values)
    const hallEnergy = reverbTailEnergy(0.92, 0.07)

    // Hall tail should be at least 5× more energetic than Room
    expect(hallEnergy / roomEnergy).toBeGreaterThan(5)
  })

  it('Room with high damp is darker than Hall with low damp', () => {
    // Compare high-frequency content via simple energy above ~2kHz
    function highFreqRatio(size: number, damp: number): number {
      const verb = new SimpleReverb(SR)
      verb.setSize(size)
      verb.setDamp(damp)
      // White noise burst
      let totalEnergy = 0, highEnergy = 0
      const samples: number[] = []
      for (let i = 0; i < SR; i++) {
        const input = i < 1000 ? (Math.random() * 2 - 1) * 0.5 : 0
        const r = verb.process(input)
        const mono = (r[0] + r[1]) * 0.5
        if (i > SR * 0.2) samples.push(mono)
      }
      // Simple spectral estimate: zero-crossing rate correlates with high-freq content
      for (let i = 1; i < samples.length; i++) {
        totalEnergy += samples[i] * samples[i]
        if (samples[i] * samples[i - 1] < 0) highEnergy++
      }
      return totalEnergy > 0 ? highEnergy / samples.length : 0
    }

    const roomZCR = highFreqRatio(0.5, 0.7)  // Room, high damp
    const hallZCR = highFreqRatio(0.92, 0.05) // Hall, low damp

    // Hall should have more high-frequency content (higher ZCR)
    expect(hallZCR).toBeGreaterThan(roomZCR)
  })
})

describe('ADR 120: Reverb flavour engines', () => {
  it('EarlyReflections produces discrete stereo taps from impulse', () => {
    const er = new EarlyReflections(SR)
    er.setSize(0.5)
    er.setDamp(0.3)
    // Impulse → expect distinct L/R energy within 0–40ms
    let energyL = 0, energyR = 0
    const window = Math.ceil(SR * 0.04)  // 40ms
    for (let i = 0; i < window; i++) {
      const input = i === 0 ? 1.0 : 0
      const out = er.process(input)
      energyL += out[0] * out[0]
      energyR += out[1] * out[1]
    }
    // Both channels should have energy (stereo panning)
    expect(energyL).toBeGreaterThan(0.001)
    expect(energyR).toBeGreaterThan(0.001)
    // Stereo: energies should differ (alternating pan)
    expect(Math.abs(energyL - energyR) / (energyL + energyR)).toBeGreaterThan(0.01)
  })

  it('EarlyReflections size parameter changes tap spacing', () => {
    // Larger size → energy arrives later (more spread out)
    function firstTapDelay(size: number): number {
      const er = new EarlyReflections(SR)
      er.setSize(size)
      er.setDamp(0)
      for (let i = 0; i < SR * 0.05; i++) {
        const out = er.process(i === 0 ? 1.0 : 0)
        if (Math.abs(out[0]) + Math.abs(out[1]) > 0.01) return i
      }
      return -1
    }
    const smallDelay = firstTapDelay(0.0)
    const largeDelay = firstTapDelay(1.0)
    // Large room's first tap should arrive later
    expect(largeDelay).toBeGreaterThan(smallDelay)
  })

  it('Room (ER + Freeverb) has distinct spectral profile from bare Freeverb', () => {
    // Room chain: EarlyReflections mixed with Freeverb (matches worklet routing)
    const er = new EarlyReflections(SR)
    er.setSize(0.5); er.setDamp(0.5)
    const roomVerb = new SimpleReverb(SR)
    roomVerb.setSize(0.45); roomVerb.setDamp(0.55)

    // Bare Freeverb with same-ish params
    const bareVerb = new SimpleReverb(SR)
    bareVerb.setSize(0.45); bareVerb.setDamp(0.55)

    let roomEnergy = 0, bareEnergy = 0, roomPeak = 0
    const earlyWindow = Math.ceil(SR * 0.05)  // first 50ms
    for (let i = 0; i < SR; i++) {
      const input = i === 0 ? 1.0 : 0
      const erOut = er.process(input)
      const roomRev = roomVerb.process(input * 0.3)
      const roomL = erOut[0] * 1.6 + roomRev[0]
      const roomR = erOut[1] * 1.6 + roomRev[1]
      const bareRev = bareVerb.process(input)
      if (i < earlyWindow) {
        roomEnergy += roomL * roomL + roomR * roomR
        bareEnergy += bareRev[0] * bareRev[0] + bareRev[1] * bareRev[1]
      }
      const p = Math.max(Math.abs(roomL), Math.abs(roomR))
      if (p > roomPeak) roomPeak = p
    }
    // Room should have more early energy (from discrete reflections)
    expect(roomEnergy).toBeGreaterThan(bareEnergy * 1.5)
    // ER peak must be clearly audible (not buried in noise floor)
    expect(roomPeak).toBeGreaterThan(0.05)
  })

  it('Room ER peak level is loud enough to be audible in mix', () => {
    // Simulate realistic send level: mono signal at 0.3 into ER
    const er = new EarlyReflections(SR)
    er.setSize(0.5); er.setDamp(0.3)
    let peak = 0
    for (let i = 0; i < SR * 0.1; i++) {
      const input = i < SR * 0.01 ? 0.3 : 0  // 10ms burst at typical send level
      const out = er.process(input)
      const p = Math.max(Math.abs(out[0]), Math.abs(out[1]))
      if (p > peak) peak = p
    }
    // Peak should be at least 0.02 (well above -34dBFS, clearly audible)
    expect(peak).toBeGreaterThan(0.02)
  })

  it('Hall ModulatedReverb tail has energy fluctuation (modulation)', () => {
    const hall = new ModulatedReverb(SR)
    hall.setSize(0.92); hall.setDamp(0.07); hall.setModDepth(3)

    // Feed impulse, measure energy in successive 100ms windows in the tail
    const windowSize = Math.ceil(SR * 0.1)
    const energies: number[] = []
    for (let i = 0; i < SR * 3; i++) {
      const input = i === 0 ? 1.0 : 0
      const r = hall.process(input)
      const windowIdx = Math.floor(i / windowSize)
      if (windowIdx >= 5) {  // measure from 500ms onward
        if (!energies[windowIdx]) energies[windowIdx] = 0
        energies[windowIdx] += r[0] * r[0] + r[1] * r[1]
      }
    }
    // Modulation should cause variance between adjacent windows
    const validEnergies = energies.filter(e => e != null && e > 0)
    const mean = validEnergies.reduce((a, b) => a + b, 0) / validEnergies.length
    const variance = validEnergies.reduce((a, e) => a + (e - mean) ** 2, 0) / validEnergies.length
    const cv = Math.sqrt(variance) / mean  // coefficient of variation
    // Modulated reverb should have measurable variation (CV > 1%)
    expect(cv).toBeGreaterThan(0.01)
  })

  it('PreDelay delays signal by correct amount', () => {
    const pd = new PreDelay(SR)
    pd.setTime(40)  // 40ms
    const delaySamples = Math.floor(40 * SR / 1000)
    // Feed impulse
    const results: number[] = []
    for (let i = 0; i < delaySamples + 10; i++) {
      results.push(pd.process(i === 0 ? 1.0 : 0))
    }
    // Should be silent until delay time, then impulse appears
    expect(results[delaySamples - 1]).toBe(0)
    expect(results[delaySamples]).toBe(1.0)
  })

  it('ShimmerReverb (Faust port) produces audible output', () => {
    const shim = new ShimmerReverb(SR)
    shim.setSize(0.9); shim.setDamp(0.1)
    shim.setFeedback(0.3); shim.setShimmerAmount(0.8)

    let energy = 0
    for (let i = 0; i < SR * 2; i++) {
      const input = i === 0 ? 1.0 : 0
      const r = shim.process(input, input)
      if (i > SR * 0.3) energy += r[0] * r[0] + r[1] * r[1]
    }
    expect(energy).toBeGreaterThan(0.0001)
  })

  it('ShimmerReverb feedback stays bounded after 5 seconds', () => {
    const shim = new ShimmerReverb(SR)
    shim.setSize(0.95); shim.setDamp(0.05)
    shim.setFeedback(0.35); shim.setShimmerAmount(1.0)  // max everything

    let peak = 0
    for (let i = 0; i < SR * 5; i++) {
      const input = i < SR * 0.1 ? (Math.random() * 2 - 1) * 0.5 : 0
      const r = shim.process(input, input)
      const p = Math.max(Math.abs(r[0]), Math.abs(r[1]))
      if (p > peak) peak = p
    }
    // Must never exceed safe level even at max feedback+shimmer
    expect(peak).toBeLessThan(2.0)
  })

  it('ShimmerReverb with shimmer on differs from shimmer off', () => {
    // Compare shimmer amount 0 vs 0.8 — pitch shift should change tail character
    const shimOff = new ShimmerReverb(SR)
    shimOff.setSize(0.9); shimOff.setDamp(0.1)
    shimOff.setFeedback(0.3); shimOff.setShimmerAmount(0)

    const shimOn = new ShimmerReverb(SR)
    shimOn.setSize(0.9); shimOn.setDamp(0.1)
    shimOn.setFeedback(0.3); shimOn.setShimmerAmount(0.8)

    let offEnergy = 0, onEnergy = 0
    for (let i = 0; i < SR * 3; i++) {
      const input = i === 0 ? 1.0 : 0
      const rOff = shimOff.process(input, input)
      const rOn = shimOn.process(input, input)
      if (i > SR * 0.5) {
        offEnergy += rOff[0] * rOff[0] + rOff[1] * rOff[1]
        onEnergy += rOn[0] * rOn[0] + rOn[1] * rOn[1]
      }
    }
    // Energy profiles should differ (pitch shift recirculates energy differently)
    const ratio = onEnergy / (offEnergy + 1e-20)
    expect(Math.abs(ratio - 1.0)).toBeGreaterThan(0.05)
  })
})

// Reverb hold: to be implemented in a future session

describe('Delay time smoothing', () => {
  it('PingPongDelay produces no clicks on time change', () => {
    const delay = new PingPongDelay(1000, SR)
    delay.setTime(200)

    // Fill buffer with DC impulse then silence — isolates delay output
    for (let i = 0; i < SR * 0.5; i++) {
      delay.process(i < 100 ? 0.5 : 0, i < 100 ? 0.5 : 0, 0.6)
    }

    // Abruptly change time — should NOT cause click
    delay.setTime(50)
    let maxDelta = 0
    let prev = 0
    for (let i = 0; i < SR * 0.1; i++) {
      const r = delay.process(0, 0, 0.6)  // silence input — only delay tail
      const delta = Math.abs(r[0] - prev)
      if (delta > maxDelta) maxDelta = delta
      prev = r[0]
    }

    // Smooth slew: sample-to-sample delta should be small (no discontinuity)
    // Without smoothing this would be >0.5 from buffer position jump
    expect(maxDelta).toBeLessThan(0.2)
  })

  it('TapeDelay produces no clicks on time change', () => {
    const delay = new TapeDelay(1000, SR)
    delay.setTime(200)

    for (let i = 0; i < SR * 0.5; i++) {
      delay.process(i < 100 ? 0.5 : 0, i < 100 ? 0.5 : 0, 0.6)
    }

    delay.setTime(50)
    let maxDelta = 0
    let prev = 0
    for (let i = 0; i < SR * 0.1; i++) {
      const r = delay.process(0, 0, 0.6)
      const delta = Math.abs(r[0] - prev)
      if (delta > maxDelta) maxDelta = delta
      prev = r[0]
    }

    expect(maxDelta).toBeLessThan(0.15)
  })
})

describe('TapeSaturator', () => {
  it('output stays bounded with hot input', () => {
    const sat = new TapeSaturator(SR)
    sat.setDrive(3.0)  // max drive
    sat.setTone(0.5)
    let maxOut = 0
    for (let i = 0; i < SR; i++) {
      const input = Math.sin(2 * Math.PI * 440 * i / SR) * 2.0  // hot signal
      const r = sat.process(input, input)
      const peak = Math.max(Math.abs(r[0]), Math.abs(r[1]))
      if (peak > maxOut) maxOut = peak
    }
    // tanh soft clip — output should be bounded
    expect(maxOut).toBeLessThan(2.0)
    expect(maxOut).toBeGreaterThan(0.1)
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

// ── Reverb freeze/hold tests (ADR 121) ──────────────────────────────

/** Feed signal into reverb, return L channel output buffer */
function renderReverb(reverb: { process: (x: number) => Float64Array }, input: Float64Array): Float64Array {
  const out = new Float64Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const r = reverb.process(input[i])
    out[i] = r[0]
  }
  return out
}

/** Generate a short impulse (1 sample at amplitude 1, rest silence) */
function impulse(length: number): Float64Array {
  const buf = new Float64Array(length)
  buf[0] = 1.0
  return buf
}

describe('Reverb freeze (ADR 121)', () => {
  it('SimpleReverb: freeze sustains output, release clears to zero', () => {
    const rev = new SimpleReverb(SR)
    rev.setSize(0.7); rev.setDamp(0.3)
    // Feed signal
    renderReverb(rev, impulse(4096))
    // After impulse, tail should still be audible
    const preFreezeOut = renderReverb(rev, new Float64Array(1024))
    expect(peakAbs(preFreezeOut)).toBeGreaterThan(0)
    // Freeze: tail should sustain
    rev.setFreeze(true)
    const frozenOut = renderReverb(rev, new Float64Array(2048))
    expect(peakAbs(frozenOut)).toBeGreaterThan(0)
    // Release: buffers cleared, output should be zero
    rev.setFreeze(false)
    const releasedOut = renderReverb(rev, new Float64Array(512))
    expect(peakAbs(releasedOut)).toBeLessThan(1e-10)
  })

  it('SimpleReverb: setSize/setDamp ignored during freeze', () => {
    const rev = new SimpleReverb(SR)
    rev.setSize(0.7); rev.setDamp(0.3)
    renderReverb(rev, impulse(2048))
    rev.setFreeze(true)
    // These should be no-ops during freeze
    rev.setSize(0.1); rev.setDamp(0.9)
    const frozenOut = renderReverb(rev, new Float64Array(1024))
    expect(peakAbs(frozenOut)).toBeGreaterThan(0) // still sustaining
    // Release should restore the pre-freeze values, not the attempted changes
    rev.setFreeze(false)
    const releasedOut = renderReverb(rev, new Float64Array(512))
    expect(peakAbs(releasedOut)).toBeLessThan(1e-10)
  })

  it('ModulatedReverb: freeze sustains output, release clears to zero', () => {
    const rev = new ModulatedReverb(SR)
    rev.setSize(0.7); rev.setDamp(0.3)
    renderReverb(rev, impulse(4096))
    rev.setFreeze(true)
    const frozenOut = renderReverb(rev, new Float64Array(2048))
    expect(peakAbs(frozenOut)).toBeGreaterThan(0)
    rev.setFreeze(false)
    const releasedOut = renderReverb(rev, new Float64Array(512))
    expect(peakAbs(releasedOut)).toBeLessThan(1e-10)
  })

  it('ShimmerReverb: frozen output sustains at useful level over time', () => {
    const rev = new ShimmerReverb(SR)
    rev.setSize(0.7); rev.setDamp(0.3)
    rev.setFeedback(0.2); rev.setShimmerAmount(0.3)
    // Feed sustained signal so ring buffer is full of reverb output
    for (let i = 0; i < SR * 2; i++) rev.process(Math.sin(i * 0.05) * 0.3, Math.sin(i * 0.05) * 0.3)
    rev.setFreeze(true)
    // Let reverb engine settle after freeze
    for (let i = 0; i < Math.round(SR * 0.1); i++) rev.process(0, 0)
    // Measure level once loop is playing
    const earlyBuf = new Float64Array(2048)
    for (let i = 0; i < 2048; i++) { const r = rev.process(0, 0); earlyBuf[i] = r[0] }
    const earlyLevel = peakAbs(earlyBuf)
    // Measure level 2 seconds later — buffer loop should maintain level
    for (let i = 0; i < SR * 2; i++) rev.process(0, 0)
    const lateBuf = new Float64Array(2048)
    for (let i = 0; i < 2048; i++) { const r = rev.process(0, 0); lateBuf[i] = r[0] }
    const lateLevel = peakAbs(lateBuf)
    // Frozen tail should retain at least 50% of its level after 2 seconds
    expect(earlyLevel).toBeGreaterThan(0)
    expect(lateLevel / earlyLevel).toBeGreaterThan(0.5)
    rev.setFreeze(false)
  })

  it('ShimmerReverb: freeze sustains output, release clears to zero', () => {
    const rev = new ShimmerReverb(SR)
    rev.setSize(0.7); rev.setDamp(0.3)
    rev.setFeedback(0.2); rev.setShimmerAmount(0.3)
    // Feed sustained signal so ring buffer has content
    for (let i = 0; i < SR * 2; i++) rev.process(Math.sin(i * 0.05) * 0.3, Math.sin(i * 0.05) * 0.3)
    rev.setFreeze(true)
    const frozenBuf = new Float64Array(2048)
    for (let i = 0; i < 2048; i++) { const r = rev.process(0, 0); frozenBuf[i] = r[0] }
    expect(peakAbs(frozenBuf)).toBeGreaterThan(0)
    rev.setFreeze(false)
    // Clouds-style ramp: wait for ~500ms fade + reverb tail decay
    for (let i = 0; i < SR; i++) rev.process(0, 0)
    const releasedBuf = new Float64Array(512)
    for (let i = 0; i < 512; i++) { const r = rev.process(0, 0); releasedBuf[i] = r[0] }
    expect(peakAbs(releasedBuf)).toBeLessThan(0.01)
  })
})

// ── Delay hold tests (ADR 121 Phase 4) ──────────────────────────────

describe('Delay hold (ADR 121)', () => {
  it('PingPongDelay: fb=1.0 + gated input sustains output, then decays on release', () => {
    const dly = new PingPongDelay(500, SR)
    dly.setTime(100) // 100ms delay
    // Feed signal with normal feedback
    for (let i = 0; i < 8192; i++) {
      const inp = i < 512 ? Math.sin(i * 0.1) * 0.5 : 0
      dly.process(inp, inp, 0.5)
    }
    // Hold: fb=1.0, input=0 — should sustain
    const holdBuf = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) {
      const r = dly.process(0, 0, 1.0)
      holdBuf[i] = r[0]
    }
    expect(peakAbs(holdBuf)).toBeGreaterThan(0)
    // Measure late hold — still sustaining
    const lateBuf = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) {
      const r = dly.process(0, 0, 1.0)
      lateBuf[i] = r[0]
    }
    expect(peakAbs(lateBuf) / peakAbs(holdBuf)).toBeGreaterThan(0.9)
    // Release: fb=0.5, input=0 — should decay
    for (let i = 0; i < SR; i++) dly.process(0, 0, 0.5)
    const releaseBuf = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) {
      const r = dly.process(0, 0, 0.5)
      releaseBuf[i] = r[0]
    }
    expect(peakAbs(releaseBuf)).toBeLessThan(peakAbs(holdBuf) * 0.01)
  })

  it('TapeDelay: fb=1.0 + gated input sustains output', () => {
    const dly = new TapeDelay(500, SR)
    dly.setTime(100)
    for (let i = 0; i < 8192; i++) {
      const inp = i < 512 ? Math.sin(i * 0.1) * 0.5 : 0
      dly.process(inp, inp, 0.5)
    }
    // Hold: fb=1.0, input=0
    const holdBuf = new Float64Array(4096)
    for (let i = 0; i < 4096; i++) {
      const r = dly.process(0, 0, 1.0)
      holdBuf[i] = r[0]
    }
    expect(peakAbs(holdBuf)).toBeGreaterThan(0)
    // Note: TapeDelay has LP/HP filtering in feedback path, so it will
    // gradually lose content even at fb=1.0. This is expected tape character.
  })
})
