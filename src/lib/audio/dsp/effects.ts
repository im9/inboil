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
    // Full Freeverb: 8 parallel combs + 4 series allpass (classic Schroeder topology)
    const cL = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(n => Math.round(n * k))
    const aL = [556, 441, 341, 225].map(n => Math.round(n * k))
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
  private pL = 0; private pR = 0
  private ds = 0; private targetDs = 0
  // Smoothing: ~10ms slew to avoid clicks on delay time changes
  private slewCoeff: number
  constructor(maxMs: number, private sr: number) {
    const max = Math.ceil(maxMs * sr / 1000)
    this.bL = new Float32Array(max); this.bR = new Float32Array(max)
    this.slewCoeff = Math.exp(-1 / (0.010 * sr))
  }
  setTime(ms: number) { this.targetDs = Math.min(Math.ceil(ms * this.sr / 1000), this.bL.length - 2) }
  private _readInterp(buf: Float32Array, pos: number): number {
    const len = buf.length
    const p = ((pos % len) + len) % len
    const i0 = p | 0
    const frac = p - i0
    return buf[i0] + (buf[(i0 + 1) % len] - buf[i0]) * frac
  }
  private out = new Float64Array(2)
  process(iL: number, iR: number, fb: number): Float64Array {
    if (this.targetDs === 0 && this.ds < 1) { this.out[0] = 0; this.out[1] = 0; return this.out }
    // Smooth delay time changes to avoid clicks
    this.ds = this.targetDs + (this.ds - this.targetDs) * this.slewCoeff
    const oL = this._readInterp(this.bL, this.pL - this.ds)
    const oR = this._readInterp(this.bR, this.pR - this.ds)
    this.bL[this.pL] = iL + oR * fb;  this.bR[this.pR] = iR + oL * fb
    if (++this.pL >= this.bL.length) this.pL = 0
    if (++this.pR >= this.bR.length) this.pR = 0
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
  private pL = 0; private pR = 0
  private ds = 0; private targetDs = 0
  // Two-pole feedback filters: LP at 800Hz + HP at 100Hz for tape head character
  private lpL = 0; private lpR = 0
  private hpL = 0; private hpR = 0
  private lpCoeff: number
  private hpCoeff: number
  // Dual LFO for realistic wow (slow) + flutter (fast)
  private wowPhase = 0; private flutterPhase = 0
  private wowInc: number; private flutterInc: number
  // Smoothing: ~10ms slew to avoid clicks on delay time changes
  private slewCoeff: number

  constructor(maxMs: number, private sr: number) {
    const max = Math.ceil(maxMs * sr / 1000)
    this.bL = new Float32Array(max); this.bR = new Float32Array(max)
    // LP at ~800Hz — each repeat loses more top end (Space Echo character)
    this.lpCoeff = Math.exp(-2 * Math.PI * 800 / sr)
    // HP at ~100Hz — tape head can't reproduce deep bass, repeats thin out
    this.hpCoeff = Math.exp(-2 * Math.PI * 100 / sr)
    // Wow: slow drift ~0.6Hz, Flutter: fast wobble ~6Hz
    this.wowInc = 0.6 / sr
    this.flutterInc = 6.0 / sr
    this.slewCoeff = Math.exp(-1 / (0.010 * sr))
  }

  setTime(ms: number) {
    this.targetDs = Math.min(Math.ceil(ms * this.sr / 1000), this.bL.length - 12)
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
    if (this.targetDs <= 0 && this.ds < 1) { this.out[0] = 0; this.out[1] = 0; return this.out }

    // Smooth delay time changes to avoid clicks
    this.ds = this.targetDs + (this.ds - this.targetDs) * this.slewCoeff

    // Wow (slow pitch drift) + flutter (fast wobble) — ±6 samples total
    this.wowPhase += this.wowInc
    if (this.wowPhase >= 1) this.wowPhase -= 1
    this.flutterPhase += this.flutterInc
    if (this.flutterPhase >= 1) this.flutterPhase -= 1
    const mod = Math.sin(6.283185 * this.wowPhase) * 4
              + Math.sin(6.283185 * this.flutterPhase) * 2

    const oL = this._readInterp(this.bL, this.pL - this.ds + mod)
    const oR = this._readInterp(this.bR, this.pR - this.ds - mod)

    // LP filter on feedback — each repeat loses more highs
    this.lpL = oR + (this.lpL - oR) * this.lpCoeff + DENORMAL_DC
    this.lpR = oL + (this.lpR - oL) * this.lpCoeff + DENORMAL_DC
    // HP filter on feedback — each repeat loses more lows (tape head rolloff)
    const fbL = this.lpL - this.hpL; this.hpL = this.lpL - fbL * this.hpCoeff
    const fbR = this.lpR - this.hpR; this.hpR = this.lpR - fbR * this.hpCoeff

    // Tape saturation — slightly driven for warm compression on each repeat
    this.bL[this.pL] = iL + Math.tanh(fbL * 1.6) * fb
    this.bR[this.pR] = iR + Math.tanh(fbR * 1.6) * fb
    if (++this.pL >= this.bL.length) this.pL = 0
    if (++this.pR >= this.bR.length) this.pR = 0

    this.out[0] = oL; this.out[1] = oR
    return this.out
  }
}

// ── Tape Saturator (master bus) ──────────────────────────────────────

/**
 * Stereo tape saturator for master bus.
 * X (drive): controls saturation amount — soft clipping via tanh with variable gain.
 * Y (tone): one-pole LP cutoff — rolls off highs to simulate tape head response.
 * At low drive, acts as gentle warmth; at high drive, audible harmonic saturation.
 */
export class TapeSaturator {
  private lpL = 0; private lpR = 0
  private lpCoeff = 0
  private drive = 1.0

  constructor(private sr: number) {
    this.setTone(0.5)
  }

  /** Set drive amount: 0.1 (clean) to 3.0 (heavy saturation) */
  setDrive(d: number) { this.drive = d }

  /** Set tone: 0–1 mapped to LP cutoff 1kHz–18kHz */
  setTone(t: number) {
    // Tone 0 = dark (1kHz), tone 1 = bright (18kHz, nearly transparent)
    const freq = 1000 * Math.pow(18, t)
    this.lpCoeff = Math.exp(-2 * Math.PI * freq / this.sr)
  }

  private out = new Float64Array(2)
  process(l: number, r: number): Float64Array {
    // Apply drive → tanh soft clip → compensate gain
    const dL = Math.tanh(l * this.drive) / Math.max(0.3, Math.tanh(this.drive))
    const dR = Math.tanh(r * this.drive) / Math.max(0.3, Math.tanh(this.drive))
    // One-pole LP tone filter
    this.lpL = dL + (this.lpL - dL) * this.lpCoeff + DENORMAL_DC
    this.lpR = dR + (this.lpR - dR) * this.lpCoeff + DENORMAL_DC
    this.out[0] = this.lpL; this.out[1] = this.lpR
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

// ── Shimmer Reverb (ADR 120 — ported from Faust shimmer.dsp) ────────

/**
 * Valhalla-style shimmer reverb ported from thedrgreenthumb/faust shimmer.dsp.
 *
 * Topology: cross-coupled stereo allpass network with pitch shifter in feedback.
 *   input L,R → cross-mix → 2 forward allpass chains (modulated) → HF damp
 *   → cross-swap → 2 feedback paths: DC block → fixed delay → allpass chain
 *   → fixed delay → pitch shift → back into cross-mix
 *
 * Key differences from Freeverb+OctaveShifter:
 *   - Allpass-based (not comb), inherently smoother/less metallic
 *   - Pitch shifter is integral to the feedback network, not bolted on
 *   - DC blocker prevents buildup, feedback max 0.35
 *   - Modulated fractional delays for chorus-like diffusion
 */
export class ShimmerReverb {
  // Allpass with fractional delay modulation
  private apBufs: Float32Array[] = []
  private apPtrs: Int32Array
  private apFilt: Float64Array   // allpass feedback state

  // Fixed delay lines (4 in feedback paths)
  private dlBufs: Float32Array[] = []
  private dlPtrs: Int32Array

  // HF damping (one-pole LP per channel)
  private dampL = 0; private dampR = 0
  private dampCoeff = 0.3

  // DC blockers (80Hz HPF, per channel)
  private dcPrevL = 0; private dcOutL = 0
  private dcPrevR = 0; private dcOutR = 0
  private dcCoeff: number

  // Pitch shifters (one per channel, dual-tap crossfade)
  private psBuf: Float32Array[] = []
  private psWp = [0, 0]
  private psPhase = [0, 0]
  private psPhaseInc: number
  private psWinSize: number

  // LFO for allpass modulation
  private lfoPhases: Float64Array
  private lfoIncs: Float64Array

  // Parameters
  private feedback = 0.0
  private shimmerAmount = 0.0  // dry/wet for pitch shift
  private size = 1.0
  private targetSize = 1.0

  // Allpass delay lengths (from Faust, at 44100)
  private static AP_FORWARD = [601, 613, 2043, 2087]    // 2 per channel
  private static AP_FEEDBACK = [2337, 2377, 1087, 1113]  // 2 per channel
  // Fixed delays in feedback (from Faust)
  private static DL_FEEDBACK = [4325, 4763, 2969, 3111]
  // LFO rates from Faust: 1.0, 1.5, 0.7, 1.3 Hz
  private static LFO_RATES = [1.0, 1.5, 0.7, 1.3]

  // Cross-feedback state (one sample delay)
  private fbL = 0; private fbR = 0

  constructor(private sr: number) {
    const k = sr / 44100
    // 8 allpass buffers (4 forward + 4 feedback)
    const allAp = [...ShimmerReverb.AP_FORWARD, ...ShimmerReverb.AP_FEEDBACK]
    this.apPtrs = new Int32Array(8)
    this.apFilt = new Float64Array(8)
    for (let i = 0; i < 8; i++) {
      this.apBufs.push(new Float32Array(Math.round(allAp[i] * k * 3) + 1))  // *3 for size scaling
    }
    // 4 fixed delay buffers
    this.dlPtrs = new Int32Array(4)
    for (let i = 0; i < 4; i++) {
      this.dlBufs.push(new Float32Array(Math.round(ShimmerReverb.DL_FEEDBACK[i] * k) + 1))
    }
    // DC blocker at 80Hz
    this.dcCoeff = Math.exp(-2 * Math.PI * 80 / sr)
    // Pitch shifter: 2048 samples window, 1024 crossfade (from Faust)
    this.psWinSize = Math.round(2048 * k)
    this.psPhaseInc = 1.0 / this.psWinSize
    for (let i = 0; i < 2; i++) {
      this.psBuf.push(new Float32Array(this.psWinSize * 4))
    }
    // LFO
    this.lfoPhases = new Float64Array(4)
    this.lfoIncs = new Float64Array(4)
    for (let i = 0; i < 4; i++) {
      this.lfoIncs[i] = ShimmerReverb.LFO_RATES[i] / sr
      this.lfoPhases[i] = i * 0.25  // spread initial phases
    }
  }

  setSize(s: number) { this.targetSize = 0.5 + s * 2.5 }  // maps 0–1 → 0.5–3.0 (Faust range 1–3)
  setDamp(d: number) { this.dampCoeff = 0.005 + d * 0.99 }
  setFeedback(fb: number) { this.feedback = Math.min(fb, 0.35) }
  setShimmerAmount(a: number) { this.shimmerAmount = a }

  reset() {
    for (const b of this.apBufs) b.fill(0)
    for (const b of this.dlBufs) b.fill(0)
    for (const b of this.psBuf) b.fill(0)
    this.apFilt.fill(0)
    this.fbL = 0; this.fbR = 0
    this.dampL = 0; this.dampR = 0
    this.dcPrevL = 0; this.dcOutL = 0
    this.dcPrevR = 0; this.dcOutR = 0
    this.psPhase = [0, 0]; this.psWp = [0, 0]
  }

  // Allpass with fractional delay modulation (Faust APFB)
  private _allpass(idx: number, x: number, dt: number, fb: number): number {
    const buf = this.apBufs[idx]
    const len = buf.length
    const ptr = this.apPtrs[idx]
    // Read from delay with fractional position
    const rp = ((ptr - dt + len * 2) % len + len) % len
    const i0 = rp | 0
    const frac = rp - i0
    const delayed = buf[i0] + (buf[(i0 + 1) % len] - buf[i0]) * frac
    // Schroeder allpass: out = delayed - x, write = x + delayed*fb
    const out = delayed - x
    buf[ptr] = x + delayed * fb + DENORMAL_DC
    this.apPtrs[idx] = (ptr + 1) % len
    return out
  }

  // Fixed delay line
  private _delay(idx: number, x: number): number {
    const buf = this.dlBufs[idx]
    const len = buf.length
    const ptr = this.dlPtrs[idx]
    const out = buf[ptr]
    buf[ptr] = x
    this.dlPtrs[idx] = (ptr + 1) % len
    return out
  }

  // Pitch shift (+12 semitones) — dual-tap crossfade (from Faust transpose)
  private _pitchShift(ch: number, x: number): number {
    const buf = this.psBuf[ch]
    const len = buf.length
    const wp = this.psWp[ch]
    buf[wp] = x

    this.psPhase[ch] += this.psPhaseInc
    if (this.psPhase[ch] >= 1.0) this.psPhase[ch] -= 1.0
    const p = this.psPhase[ch]
    const p2 = (p + 0.5) % 1.0

    // Decreasing delay = pitch up
    const d1 = (1 - p) * this.psWinSize
    const d2 = (1 - p2) * this.psWinSize
    const env1 = 0.5 - 0.5 * Math.cos(6.283185 * p)
    const env2 = 0.5 - 0.5 * Math.cos(6.283185 * p2)

    const rp1 = ((wp - d1 + len * 2) % len + len) % len
    const rp2 = ((wp - d2 + len * 2) % len + len) % len
    const i1 = rp1 | 0; const f1 = rp1 - i1
    const i2 = rp2 | 0; const f2 = rp2 - i2
    const s1 = buf[i1] + (buf[(i1 + 1) % len] - buf[i1]) * f1
    const s2 = buf[i2] + (buf[(i2 + 1) % len] - buf[i2]) * f2

    this.psWp[ch] = (wp + 1) % len
    return s1 * env1 + s2 * env2
  }

  // DC blocker (80Hz HPF)
  private _dcBlock(x: number, ch: number): number {
    if (ch === 0) {
      this.dcOutL = x - this.dcPrevL + this.dcCoeff * this.dcOutL
      this.dcPrevL = x
      return this.dcOutL
    } else {
      this.dcOutR = x - this.dcPrevR + this.dcCoeff * this.dcOutR
      this.dcPrevR = x
      return this.dcOutR
    }
  }

  private out = new Float64Array(2)
  process(inL: number, inR: number): Float64Array {
    const k = this.sr / 44100
    // Smooth parameter changes to avoid clicks from delay/feedback jumps
    this.size += (this.targetSize - this.size) * 0.002
    const s = this.size
    const diff = 0.5  // fixed diffusion (Faust default 0.5)
    const fb = this.feedback
    // dampCoeff is already smooth (one-pole LP state tracks naturally)

    // LFO modulation offsets (±49 samples max, from Faust)
    const mods: number[] = []
    for (let i = 0; i < 4; i++) {
      mods.push(49 * k * (Math.sin(6.283185 * this.lfoPhases[i]) + 1) / 2)
      this.lfoPhases[i] += this.lfoIncs[i]
      if (this.lfoPhases[i] >= 1) this.lfoPhases[i] -= 1
    }

    // Cross-mix input with feedback (Faust: _*feedback+_*0.3)
    const fwdL = this.fbR * fb + inL * 0.3  // cross: fbR→L
    const fwdR = this.fbL * fb + inR * 0.3  // cross: fbL→R

    // Forward path: 2 allpass chains + HF damping (one per channel)
    // L channel: AP(601*s, 0.7*diff) → AP(613*s, 0.75*diff) → LP
    let L = this._allpass(0, fwdL, Math.round(601 * k * s) + mods[0], 0.7 * diff)
    L = this._allpass(1, L, Math.round(613 * k * s), 0.75 * diff)
    this.dampL = L * (1 - this.dampCoeff) + this.dampL * this.dampCoeff
    L = this.dampL

    // R channel: AP(2043*s, 0.75*diff) → AP(2087*s, 0.75*diff) → LP
    let R = this._allpass(2, fwdR, Math.round(2043 * k * s) + mods[1], 0.75 * diff)
    R = this._allpass(3, R, Math.round(2087 * k * s), 0.75 * diff)
    this.dampR = R * (1 - this.dampCoeff) + this.dampR * this.dampCoeff
    R = this.dampR

    // Feedback path: DC block → delay → allpass chain → delay → pitch shift
    // L feedback (from R output, cross-coupled)
    let fbPathL = this._dcBlock(R * fb, 0)
    fbPathL = this._delay(0, fbPathL)  // 4325 samples
    fbPathL = this._allpass(4, fbPathL, Math.round(2337 * k * s) + mods[2], 0.7 * diff)
    fbPathL = this._allpass(5, fbPathL, Math.round(2377 * k * s), 0.4 * diff)
    fbPathL = this._delay(2, fbPathL)  // 2969 samples
    // Pitch shift with dry/wet blend
    const psL = this._pitchShift(0, fbPathL)
    fbPathL = fbPathL * (1 - this.shimmerAmount) + psL * this.shimmerAmount

    // R feedback (from L output, cross-coupled)
    let fbPathR = this._dcBlock(L * fb, 1)
    fbPathR = this._delay(1, fbPathR)  // 4763 samples
    fbPathR = this._allpass(6, fbPathR, Math.round(1087 * k * s) + mods[3], 0.7 * diff)
    fbPathR = this._allpass(7, fbPathR, Math.round(1113 * k * s), 0.4 * diff)
    fbPathR = this._delay(3, fbPathR)  // 3111 samples
    const psR = this._pitchShift(1, fbPathR)
    fbPathR = fbPathR * (1 - this.shimmerAmount) + psR * this.shimmerAmount

    this.fbL = fbPathL
    this.fbR = fbPathR

    this.out[0] = L; this.out[1] = R
    return this.out
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

  /** Clear internal buffer and reset phase — call on flavour switch to avoid artifacts */
  reset() {
    this.buf.fill(0)
    this.phase = 0
    this.wp = 0
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

// ── Early Reflections (ADR 120 — Room flavour) ──────────────────────

/**
 * 6-tap early reflections at prime-number delays.
 * Each tap has gain rolloff (inverse-square), alternating L/R pan,
 * and a one-pole LP filter (wall absorption).
 * size (0–1) scales tap delays; damp (0–1) controls LP cutoff.
 */
export class EarlyReflections {
  // Base tap delays in ms (primes to avoid resonance)
  private static TAP_MS = [3, 7, 11, 17, 23, 31]
  // Gain rolloff: gradual, first reflection not too dominant (avoids metallic ping)
  private static TAP_GAIN = [0.70, 0.65, 0.55, 0.45, 0.35, 0.25]
  // Pan: +1 = right, -1 = left (alternating)
  private static TAP_PAN = [-1, 1, -1, 1, -1, 1]

  private buf: Float32Array
  private bufLen: number
  private wp = 0
  private tapDelays: Float64Array     // current smoothed delay per tap
  private tapTargetDelays: Float64Array  // target delay per tap (set by setSize)
  private tapBaseDelays: Float64Array // delay at size=1
  private lpState: Float64Array       // one-pole LP filter state per tap
  private lpCoeff = 0.3              // LP coefficient (higher = darker)
  private slewCoeff: number          // smoothing coefficient for tap delay changes

  constructor(sr: number) {
    // Max delay: 35ms × 2 (size can double) + margin
    this.bufLen = Math.ceil(sr * 0.08)
    this.buf = new Float32Array(this.bufLen)
    const n = EarlyReflections.TAP_MS.length
    this.tapBaseDelays = new Float64Array(n)
    this.tapDelays = new Float64Array(n)
    this.tapTargetDelays = new Float64Array(n)
    this.lpState = new Float64Array(n)
    // ~5ms slew to avoid clicks on size changes
    this.slewCoeff = Math.exp(-1 / (0.005 * sr))
    for (let i = 0; i < n; i++) {
      this.tapBaseDelays[i] = EarlyReflections.TAP_MS[i] * sr / 1000
    }
    this.setSize(0.5)
    // Initialize current delays to target (no initial slew)
    for (let i = 0; i < n; i++) this.tapDelays[i] = this.tapTargetDelays[i]
    this.setDamp(0.5)
  }

  /** size 0–1: scales tap delays (small room → large room) */
  setSize(s: number) {
    // Scale: 0.3× at size=0, 1.5× at size=1
    const scale = 0.3 + s * 1.2
    for (let i = 0; i < this.tapBaseDelays.length; i++) {
      this.tapTargetDelays[i] = this.tapBaseDelays[i] * scale
    }
  }

  /** damp 0–1: LP cutoff on taps (0 = warm, 1 = very dark) */
  setDamp(d: number) {
    // Map to LP coefficient: 0 → 0.25 (warm, never harsh), 1 → 0.85 (dark)
    // Minimum 0.25 ensures taps always have some softness (avoids metallic clicks)
    this.lpCoeff = 0.25 + d * 0.6
  }

  private out = new Float64Array(2)
  process(x: number): Float64Array {
    this.buf[this.wp] = x
    let L = 0, R = 0
    for (let i = 0; i < EarlyReflections.TAP_MS.length; i++) {
      // Smooth tap delay towards target to avoid clicks on size changes
      this.tapDelays[i] = this.tapTargetDelays[i] + (this.tapDelays[i] - this.tapTargetDelays[i]) * this.slewCoeff
      const readPos = this.wp - this.tapDelays[i]
      const p = ((readPos % this.bufLen) + this.bufLen) % this.bufLen
      const i0 = p | 0
      const frac = p - i0
      const raw = this.buf[i0] + (this.buf[(i0 + 1) % this.bufLen] - this.buf[i0]) * frac
      // One-pole LP (wall absorption)
      this.lpState[i] = raw + (this.lpState[i] - raw) * this.lpCoeff
      const tap = this.lpState[i] * EarlyReflections.TAP_GAIN[i]
      // Pan alternating L/R
      if (EarlyReflections.TAP_PAN[i] < 0) { L += tap * 0.8; R += tap * 0.2 }
      else { L += tap * 0.2; R += tap * 0.8 }
    }
    if (++this.wp >= this.bufLen) this.wp = 0
    this.out[0] = L; this.out[1] = R
    return this.out
  }
}

// ── Pre-Delay (ADR 120 — Hall flavour) ──────────────────────────────

/**
 * Simple delay line for Hall pre-delay (0–80ms).
 */
export class PreDelay {
  private buf: Float32Array
  private bufLen: number
  private wp = 0
  private delaySamples = 0

  constructor(private sr: number) {
    this.bufLen = Math.ceil(sr * 0.1)  // 100ms max
    this.buf = new Float32Array(this.bufLen)
  }

  setTime(ms: number) {
    this.delaySamples = Math.min(Math.floor(ms * this.sr / 1000), this.bufLen - 1)
  }

  process(x: number): number {
    this.buf[this.wp] = x
    const rp = (this.wp - this.delaySamples + this.bufLen) % this.bufLen
    if (++this.wp >= this.bufLen) this.wp = 0
    return this.buf[rp]
  }
}

// ── Modulated Reverb (ADR 120 — Hall flavour) ───────────────────────

/**
 * Freeverb variant with LFO-modulated comb filter read positions.
 * Each comb has a slightly different LFO rate (0.8–1.6 Hz) and random phase
 * offset — creates the lush, evolving tail characteristic of large halls.
 * modDepth (0–4 samples) controls LFO excursion.
 */
class ModulatedCombFilter {
  private buf: Float32Array; private ptr = 0; private filt = 0
  private fb: number; private damp: number
  private lfoPhase: number
  private lfoInc: number
  private modDepth = 0

  constructor(length: number, fb: number, damp: number, sr: number, lfoHz: number, phaseOffset: number) {
    this.buf = new Float32Array(length)
    this.fb = fb; this.damp = damp
    this.lfoPhase = phaseOffset
    this.lfoInc = lfoHz / sr
  }

  setFeedback(fb: number) { this.fb = fb }
  setDamp(d: number) { this.damp = d }
  setModDepth(d: number) { this.modDepth = d }

  process(x: number): number {
    const len = this.buf.length
    // LFO-modulated read position
    const lfo = Math.sin(6.283185 * this.lfoPhase) * this.modDepth
    this.lfoPhase += this.lfoInc
    if (this.lfoPhase >= 1) this.lfoPhase -= 1

    const readPos = ((this.ptr - len + lfo + len * 2) % len + len) % len
    const i0 = readPos | 0
    const frac = readPos - i0
    const y = this.buf[i0] + (this.buf[(i0 + 1) % len] - this.buf[i0]) * frac

    this.filt = y * (1 - this.damp) + this.filt * this.damp
    this.buf[this.ptr] = x + this.filt * this.fb + DENORMAL_DC
    if (++this.ptr >= len) this.ptr = 0
    return y
  }
}

export class ModulatedReverb {
  private combsL: ModulatedCombFilter[]; private combsR: ModulatedCombFilter[]
  private apL: AllpassFilter[];  private apR: AllpassFilter[]

  constructor(sr: number) {
    const k = sr / 44100, sp = Math.round(23 * k)
    // Full 8 comb + 4 allpass, each comb with unique LFO rate and phase
    const cL = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(n => Math.round(n * k))
    const aL = [556, 441, 341, 225].map(n => Math.round(n * k))
    const lfoRates = [0.8, 1.0, 1.1, 1.3, 1.5, 1.6, 0.9, 1.2]
    const phaseOffsets = [0, 0.13, 0.25, 0.38, 0.5, 0.63, 0.75, 0.88]
    this.combsL = cL.map((n, i) => new ModulatedCombFilter(n,      0.84, 0.2, sr, lfoRates[i], phaseOffsets[i]))
    this.combsR = cL.map((n, i) => new ModulatedCombFilter(n + sp, 0.84, 0.2, sr, lfoRates[i], (phaseOffsets[i] + 0.07) % 1))
    this.apL = aL.map(n => new AllpassFilter(n))
    this.apR = aL.map(n => new AllpassFilter(n + sp))
  }

  setSize(s: number) {
    const fb = 0.50 + s * 0.49
    for (const c of this.combsL) c.setFeedback(fb)
    for (const c of this.combsR) c.setFeedback(fb)
  }
  setDamp(d: number) {
    for (const c of this.combsL) c.setDamp(d)
    for (const c of this.combsR) c.setDamp(d)
  }
  setModDepth(d: number) {
    for (const c of this.combsL) c.setModDepth(d)
    for (const c of this.combsR) c.setModDepth(d)
  }

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
