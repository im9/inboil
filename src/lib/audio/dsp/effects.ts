/**
 * Send/bus effects: reverb, delay, sidechain ducker, bus compressor,
 * peak limiter, granular processor, tape delay, stutter, shimmer pitch shift.
 */

// Tiny DC offset to prevent denormal floats in feedback paths (see filters.ts)
const DENORMAL_DC = 1e-18

// ── Reverb internals ────────────────────────────────────────────────

class CombFilter {
  private buf: Float32Array; private ptr = 0; private filt = 0
  constructor(length: number, private fb: number, private damp: number) {
    this.buf = new Float32Array(length)
  }
  setFeedback(fb: number) { this.fb = fb }
  setDamp(d: number)      { this.damp = d }
  process(x: number): number {
    const y = this.buf[this.ptr]
    this.filt = y * (1 - this.damp) + this.filt * this.damp
    this.buf[this.ptr] = x + this.filt * this.fb + DENORMAL_DC
    if (++this.ptr >= this.buf.length) this.ptr = 0
    return y
  }
}

class AllpassFilter {
  private buf: Float32Array; private ptr = 0
  constructor(length: number, private fb = 0.5) { this.buf = new Float32Array(length) }
  process(x: number): number {
    const b = this.buf[this.ptr]
    const y = b - x
    this.buf[this.ptr] = x + b * this.fb + DENORMAL_DC
    if (++this.ptr >= this.buf.length) this.ptr = 0
    return y
  }
}

// ── Exported effects ────────────────────────────────────────────────

export class SimpleReverb {
  private combsL: CombFilter[]; private combsR: CombFilter[]
  private apL: AllpassFilter[];  private apR: AllpassFilter[]
  constructor(sr: number) {
    const k = sr / 44100, sp = Math.round(23 * k)
    const cL = [1116, 1188, 1277, 1356].map(n => Math.round(n * k))
    const aL = [556, 441].map(n => Math.round(n * k))
    this.combsL = cL.map(n => new CombFilter(n,      0.84, 0.2))
    this.combsR = cL.map(n => new CombFilter(n + sp, 0.84, 0.2))
    this.apL    = aL.map(n => new AllpassFilter(n))
    this.apR    = aL.map(n => new AllpassFilter(n + sp))
  }
  setSize(s: number) { const fb = 0.60 + s * 0.36; [...this.combsL, ...this.combsR].forEach(c => c.setFeedback(fb)) }
  setDamp(d: number) { const v = d * 0.4;  [...this.combsL, ...this.combsR].forEach(c => c.setDamp(v)) }
  // Reusable output to avoid per-sample tuple allocation
  private out = new Float64Array(2)
  process(x: number): Float64Array {
    const g = 0.015; let L = 0, R = 0
    for (const c of this.combsL) L += c.process(x * g)
    for (const c of this.combsR) R += c.process(x * g)
    for (const a of this.apL) L = a.process(L)
    for (const a of this.apR) R = a.process(R)
    this.out[0] = L; this.out[1] = R
    return this.out
  }
}

/**
 * Lightweight reverb for per-track insert FX (ADR 077 Phase 3).
 * comb×2 + allpass×1 per channel — roughly half the CPU of SimpleReverb.
 * Trades density for efficiency; lo-fi character is acceptable for inserts.
 */
export class LiteReverb {
  private combsL: CombFilter[]; private combsR: CombFilter[]
  private apL: AllpassFilter;   private apR: AllpassFilter
  constructor(sr: number) {
    const k = sr / 44100, sp = Math.round(23 * k)
    const cL = [1116, 1356].map(n => Math.round(n * k))
    this.combsL = cL.map(n => new CombFilter(n,      0.84, 0.2))
    this.combsR = cL.map(n => new CombFilter(n + sp, 0.84, 0.2))
    this.apL = new AllpassFilter(Math.round(556 * k))
    this.apR = new AllpassFilter(Math.round(556 * k) + sp)
  }
  setSize(s: number) { const fb = 0.60 + s * 0.36; [...this.combsL, ...this.combsR].forEach(c => c.setFeedback(fb)) }
  setDamp(d: number) { const v = d * 0.4;  [...this.combsL, ...this.combsR].forEach(c => c.setDamp(v)) }
  private out = new Float64Array(2)
  process(x: number): Float64Array {
    const g = 0.015; let L = 0, R = 0
    for (const c of this.combsL) L += c.process(x * g)
    for (const c of this.combsR) R += c.process(x * g)
    L = this.apL.process(L)
    R = this.apR.process(R)
    this.out[0] = L; this.out[1] = R
    return this.out
  }
}

export class PingPongDelay {
  private bL: Float32Array; private bR: Float32Array
  private pL = 0; private pR = 0; private ds = 0
  constructor(maxMs: number, private sr: number) {
    const max = Math.ceil(maxMs * sr / 1000)
    this.bL = new Float32Array(max); this.bR = new Float32Array(max)
  }
  setTime(ms: number) { this.ds = Math.min(Math.ceil(ms * this.sr / 1000), this.bL.length) }
  private out = new Float64Array(2)
  process(iL: number, iR: number, fb: number): Float64Array {
    if (this.ds === 0) { this.out[0] = 0; this.out[1] = 0; return this.out }
    const len = this.bL.length
    const rL = (this.pL - this.ds + len) % len, rR = (this.pR - this.ds + len) % len
    const oL = this.bL[rL], oR = this.bR[rR]
    this.bL[this.pL] = iL + oR * fb;  this.bR[this.pR] = iR + oL * fb
    if (++this.pL >= len) this.pL = 0;  if (++this.pR >= len) this.pR = 0
    this.out[0] = oL; this.out[1] = oR
    return this.out
  }
}

/**
 * Kick-triggered sidechain ducker.
 * On trigger(), gain instantly drops to (1 - depth), then recovers exponentially.
 */
export class SidechainDucker {
  private env = 1.0
  private coeff: number
  constructor(private sr: number, releaseMs = 130) {
    this.coeff = Math.exp(-1 / (releaseMs * sr / 1000))
  }
  setRelease(ms: number) { this.coeff = Math.exp(-1 / (Math.max(10, ms) * this.sr / 1000)) }
  trigger(depth: number) { this.env = 1.0 - depth }
  tick(): number {
    this.env = 1.0 - (1.0 - this.env) * this.coeff
    return this.env
  }
}

/**
 * Peak bus compressor with attack/release envelope follower.
 */
export class BusCompressor {
  private env = 0
  private sr: number
  private aCoeff: number
  private rCoeff: number
  /** Linear gain reduction (1.0 = no reduction, <1.0 = compressing) */
  gr = 1.0
  constructor(sr: number) {
    this.sr = sr
    this.aCoeff = Math.exp(-1 / (0.0008 * sr))   // 0.8 ms attack
    this.rCoeff = Math.exp(-1 / (0.060  * sr))   // 60 ms release
  }
  setAttackRelease(attackMs: number, releaseMs: number) {
    this.aCoeff = Math.exp(-1 / (attackMs * 0.001 * this.sr))
    this.rCoeff = Math.exp(-1 / (releaseMs * 0.001 * this.sr))
  }
  private out = new Float64Array(2)
  process(L: number, R: number, threshold: number, ratio: number, makeup: number): Float64Array {
    const level = Math.max(Math.abs(L), Math.abs(R))
    const c = level > this.env ? this.aCoeff : this.rCoeff
    this.env = level + (this.env - level) * c
    let gain = 1.0
    if (this.env > threshold) {
      const desired = threshold + (this.env - threshold) / ratio
      gain = desired / this.env
    }
    this.gr = gain
    this.out[0] = L * gain * makeup; this.out[1] = R * gain * makeup
    return this.out
  }
}

/**
 * Lookahead peak limiter — transparent brickwall at ceiling.
 */
export class PeakLimiter {
  private ceiling = 0.92
  private bufL: Float64Array
  private bufR: Float64Array
  private len: number
  private pos = 0
  private gainReduction = 1.0

  constructor(sr: number, lookaheadMs = 2.5) {
    this.len = Math.max(1, Math.round(sr * lookaheadMs / 1000))
    this.bufL = new Float64Array(this.len)
    this.bufR = new Float64Array(this.len)
  }

  private out = new Float64Array(2)
  process(inL: number, inR: number): Float64Array {
    const peak = Math.max(Math.abs(inL), Math.abs(inR))
    const targetGR = peak > this.ceiling ? this.ceiling / peak : 1.0
    const coeff = targetGR < this.gainReduction ? 0.6 : 0.0002
    this.gainReduction += (targetGR - this.gainReduction) * coeff
    this.bufL[this.pos] = inL
    this.bufR[this.pos] = inR
    if (++this.pos >= this.len) this.pos = 0
    this.out[0] = this.bufL[this.pos] * this.gainReduction
    this.out[1] = this.bufR[this.pos] * this.gainReduction
    return this.out
  }
}

/**
 * Granular processor — ring-buffer grain cloud.
 * Captures audio into stereo ring buffer (~0.75s), replays as overlapping
 * Hann-windowed grains. X = grain size, Y = density.
 */
export class GranularProcessor {
  private static MAX_GRAINS = 10

  private bufL: Float32Array
  private bufR: Float32Array
  private bufLen: number
  private writePos = 0

  private grainActive:    boolean[]
  private grainFracPos:   number[]
  private grainRemaining: number[]
  private grainLength:    number[]
  private grainRate:      number[]
  private grainReverse:   boolean[]

  private grainSizeSamples = 4410
  private spawnInterval = 4410
  private spawnCounter = 0
  private seed = 77777

  private pitchRate = 1.0
  private scatterSamples: number
  private reverseProb = 0.0
  private frozen = false

  private active = false
  private ringingOut = false

  constructor(private sr: number) {
    this.bufLen = Math.ceil(sr * 0.75)
    this.bufL = new Float32Array(this.bufLen)
    this.bufR = new Float32Array(this.bufLen)
    this.scatterSamples = Math.floor(sr * 0.5)
    const N = GranularProcessor.MAX_GRAINS
    this.grainActive    = new Array(N).fill(false)
    this.grainFracPos   = new Array(N).fill(0)
    this.grainRemaining = new Array(N).fill(0)
    this.grainLength    = new Array(N).fill(0)
    this.grainRate      = new Array(N).fill(1)
    this.grainReverse   = new Array(N).fill(false)
  }

  setParams(x: number, y: number) {
    const sizeMs = 10 + x * 190
    this.grainSizeSamples = Math.floor(sizeMs * this.sr / 1000)
    const intervalMs = 200 - y * 185
    this.spawnInterval = Math.max(1, Math.floor(intervalMs * this.sr / 1000))
  }

  setParams2(pitch: number, scatter: number) {
    const semitones = (pitch - 0.5) * 24
    this.pitchRate = Math.pow(2, semitones / 12)
    this.scatterSamples = Math.max(1, Math.floor(scatter * this.bufLen))
    this.reverseProb = scatter > 0.5 ? (scatter - 0.5) * 0.8 : 0
  }

  setFreeze(on: boolean) { this.frozen = on }

  setActive(on: boolean) {
    if (on && !this.active) {
      this.active = true
      this.ringingOut = false
      this.spawnCounter = 0
    } else if (!on && this.active) {
      this.active = false
      this.frozen = false
      this.ringingOut = true
    }
  }

  private _readInterp(buf: Float32Array, pos: number): number {
    const i0 = pos | 0
    const frac = pos - i0
    const i1 = i0 + 1 >= this.bufLen ? 0 : i0 + 1
    return buf[i0] + (buf[i1] - buf[i0]) * frac
  }

  private out = new Float64Array(2)
  process(inL: number, inR: number): Float64Array {
    if (!this.frozen) {
      this.bufL[this.writePos] = inL
      this.bufR[this.writePos] = inR
      if (++this.writePos >= this.bufLen) this.writePos = 0
    }

    if (!this.active && !this.ringingOut) { this.out[0] = 0; this.out[1] = 0; return this.out }

    if (this.active) {
      this.spawnCounter--
      if (this.spawnCounter <= 0) {
        this._spawnGrain()
        this.spawnCounter = this.spawnInterval
      }
    }

    let wetL = 0, wetR = 0
    let anyActive = false
    for (let i = 0; i < GranularProcessor.MAX_GRAINS; i++) {
      if (!this.grainActive[i]) continue
      anyActive = true
      const progress = 1 - this.grainRemaining[i] / this.grainLength[i]
      const env = 0.5 * (1 - Math.cos(2 * Math.PI * progress))
      const fp = this.grainFracPos[i]
      wetL += this._readInterp(this.bufL, fp) * env
      wetR += this._readInterp(this.bufR, fp) * env
      const step = this.grainRate[i] * (this.grainReverse[i] ? -1 : 1)
      let newPos = fp + step
      if (newPos >= this.bufLen) newPos -= this.bufLen
      if (newPos < 0) newPos += this.bufLen
      this.grainFracPos[i] = newPos
      this.grainRemaining[i]--
      if (this.grainRemaining[i] <= 0) this.grainActive[i] = false
    }

    if (this.ringingOut && !anyActive) this.ringingOut = false
    const gain = this.active ? 0.85 : (anyActive ? 0.6 : 0)
    this.out[0] = wetL * gain; this.out[1] = wetR * gain
    return this.out
  }

  private _spawnGrain() {
    for (let i = 0; i < GranularProcessor.MAX_GRAINS; i++) {
      if (this.grainActive[i]) continue
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0
      const randOffset = (this.seed >>> 16) % this.scatterSamples
      this.grainFracPos[i] = (this.writePos - randOffset + this.bufLen) % this.bufLen
      this.grainLength[i] = this.grainSizeSamples
      this.grainRemaining[i] = this.grainSizeSamples
      this.grainRate[i] = this.pitchRate
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0
      this.grainReverse[i] = (this.seed >>> 16) / 65536 < this.reverseProb
      this.grainActive[i] = true
      return
    }
  }
}

// ── Tape Delay (ADR 075 Phase 2) ────────────────────────────────────

/**
 * Tape-style ping-pong delay.
 * Feedback path: one-pole LP (~2kHz) → tanh saturation → cross-feed.
 * Sine LFO modulates read position for wow/flutter (±3 samples, ~1.2Hz).
 */
export class TapeDelay {
  private bL: Float32Array; private bR: Float32Array
  private pL = 0; private pR = 0; private ds = 0
  private lpL = 0; private lpR = 0
  private lpCoeff: number
  private lfoPhase = 0
  private lfoInc: number

  constructor(maxMs: number, private sr: number) {
    const max = Math.ceil(maxMs * sr / 1000)
    this.bL = new Float32Array(max); this.bR = new Float32Array(max)
    // One-pole LP at ~2kHz — 6dB/oct, gentle analog rolloff
    this.lpCoeff = Math.exp(-2 * Math.PI * 2000 / sr)
    // LFO ~1.2Hz wow/flutter
    this.lfoInc = 1.2 / sr
  }

  setTime(ms: number) {
    this.ds = Math.min(Math.ceil(ms * this.sr / 1000), this.bL.length - 8)
  }

  private _readInterp(buf: Float32Array, pos: number): number {
    const len = buf.length
    const p = ((pos % len) + len) % len
    const i0 = p | 0
    const frac = p - i0
    return buf[i0] + (buf[(i0 + 1) % len] - buf[i0]) * frac
  }

  private out = new Float64Array(2)
  process(iL: number, iR: number, fb: number): Float64Array {
    if (this.ds <= 0) { this.out[0] = 0; this.out[1] = 0; return this.out }
    const len = this.bL.length

    // Wow/flutter: sine LFO modulates read offset ±3 samples
    this.lfoPhase += this.lfoInc
    if (this.lfoPhase >= 1) this.lfoPhase -= 1
    const lfo = Math.sin(6.283185 * this.lfoPhase) * 3

    const oL = this._readInterp(this.bL, this.pL - this.ds + lfo)
    const oR = this._readInterp(this.bR, this.pR - this.ds - lfo)

    // LP filter on feedback (cross-feed for ping-pong)
    this.lpL = oR + (this.lpL - oR) * this.lpCoeff + DENORMAL_DC
    this.lpR = oL + (this.lpR - oL) * this.lpCoeff + DENORMAL_DC

    // Soft saturation (tape compression)
    this.bL[this.pL] = iL + Math.tanh(this.lpL * 1.2) * fb
    this.bR[this.pR] = iR + Math.tanh(this.lpR * 1.2) * fb
    if (++this.pL >= len) this.pL = 0
    if (++this.pR >= len) this.pR = 0

    this.out[0] = oL; this.out[1] = oR
    return this.out
  }
}

// ── Stutter Buffer (ADR 075 Phase 2) ────────────────────────────────

/**
 * Buffer-repeat stutter effect for glitch send bus.
 * Captures audio into a ring buffer; loops a latched slice with crossfade.
 * X controls slice length (10–200ms).
 */
export class StutterBuffer {
  private buf: Float32Array
  private bufLen: number
  private wp = 0
  private rp = 0
  private sliceStart = 0
  private sliceLen: number
  private xfade: number
  private needsLatch = true

  constructor(private sr: number) {
    this.bufLen = Math.ceil(sr * 0.5)   // 500ms max capture
    this.buf = new Float32Array(this.bufLen)
    this.sliceLen = Math.ceil(sr * 0.05) // 50ms default
    this.xfade = Math.ceil(sr * 0.002)   // 2ms crossfade
  }

  setSlice(x: number) {
    const newLen = Math.max(this.xfade * 4, Math.floor((10 + x * 190) * this.sr / 1000))
    if (newLen !== this.sliceLen) {
      this.sliceLen = newLen
      this.needsLatch = true
    }
  }

  process(input: number): number {
    // Always capture
    this.buf[this.wp] = input
    if (++this.wp >= this.bufLen) this.wp = 0

    // Latch on first nonzero input (or after param change)
    if (this.needsLatch && input !== 0) {
      this.sliceStart = (this.wp - this.sliceLen + this.bufLen) % this.bufLen
      this.rp = 0
      this.needsLatch = false
    }

    if (this.needsLatch) return input  // passthrough until latched

    // Read from latched slice with crossfade at loop boundaries
    const idx = (this.sliceStart + this.rp) % this.bufLen
    let env = 1.0
    if (this.rp < this.xfade) env = this.rp / this.xfade
    else if (this.rp >= this.sliceLen - this.xfade) env = (this.sliceLen - 1 - this.rp) / this.xfade
    env = Math.max(0, Math.min(1, env))

    const out = this.buf[idx] * env
    if (++this.rp >= this.sliceLen) this.rp = 0
    return out
  }
}

// ── Octave Shifter (ADR 075 Phase 2) ────────────────────────────────

/**
 * Simple +12st (octave-up) pitch shifter for shimmer reverb.
 * Two overlapping Hann-windowed grains reading at 2× speed.
 * Constant-power crossfade (two offset Hann windows sum to 1.0).
 */
export class OctaveShifter {
  private buf: Float32Array
  private len: number
  private wp = 0
  private phase = 0

  constructor(sr: number) {
    this.len = Math.round(sr * 0.04)  // 40ms grain window
    this.buf = new Float32Array(this.len)
  }

  process(x: number): number {
    this.buf[this.wp] = x
    if (++this.wp >= this.len) this.wp = 0

    // Phase ramps 0→1 over len samples (one full grain cycle)
    this.phase += 1 / this.len
    if (this.phase >= 1) this.phase -= 1

    let out = 0
    for (let g = 0; g < 2; g++) {
      const ph = (this.phase + g * 0.5) % 1.0
      const rp = (this.wp + Math.round(ph * this.len)) % this.len
      const env = 0.5 - 0.5 * Math.cos(6.283185 * ph)
      out += this.buf[rp] * env
    }

    return out
  }
}
