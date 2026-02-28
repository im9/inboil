/**
 * Send/bus effects: reverb, delay, sidechain ducker, bus compressor,
 * peak limiter, granular processor.
 */

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
    this.buf[this.ptr] = x + this.filt * this.fb
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
    this.buf[this.ptr] = x + b * this.fb
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
  private aCoeff: number
  private rCoeff: number
  constructor(sr: number) {
    this.aCoeff = Math.exp(-1 / (0.0008 * sr))   // 0.8 ms attack
    this.rCoeff = Math.exp(-1 / (0.060  * sr))   // 60 ms release
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
  private grainPos:       number[]
  private grainRemaining: number[]
  private grainLength:    number[]

  private grainSizeSamples = 4410
  private spawnInterval = 4410
  private spawnCounter = 0
  private seed = 77777

  private active = false
  private ringingOut = false

  constructor(private sr: number) {
    this.bufLen = Math.ceil(sr * 0.75)
    this.bufL = new Float32Array(this.bufLen)
    this.bufR = new Float32Array(this.bufLen)
    const N = GranularProcessor.MAX_GRAINS
    this.grainActive    = new Array(N).fill(false)
    this.grainPos       = new Array(N).fill(0)
    this.grainRemaining = new Array(N).fill(0)
    this.grainLength    = new Array(N).fill(0)
  }

  setParams(x: number, y: number) {
    const sizeMs = 10 + x * 190
    this.grainSizeSamples = Math.floor(sizeMs * this.sr / 1000)
    const intervalMs = 200 - y * 185
    this.spawnInterval = Math.max(1, Math.floor(intervalMs * this.sr / 1000))
  }

  setActive(on: boolean) {
    if (on && !this.active) {
      this.active = true
      this.ringingOut = false
      this.spawnCounter = 0
    } else if (!on && this.active) {
      this.active = false
      this.ringingOut = true
    }
  }

  private out = new Float64Array(2)
  process(inL: number, inR: number): Float64Array {
    this.bufL[this.writePos] = inL
    this.bufR[this.writePos] = inR
    if (++this.writePos >= this.bufLen) this.writePos = 0

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
      const pos = this.grainPos[i]
      wetL += this.bufL[pos] * env
      wetR += this.bufR[pos] * env
      this.grainPos[i] = pos + 1 >= this.bufLen ? 0 : pos + 1
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
      const maxOffset = Math.floor(this.sr * 0.5)
      const randOffset = (this.seed >>> 16) % maxOffset
      this.grainPos[i] = (this.writePos - randOffset + this.bufLen) % this.bufLen
      this.grainLength[i] = this.grainSizeSamples
      this.grainRemaining[i] = this.grainSizeSamples
      this.grainActive[i] = true
      return
    }
  }
}
