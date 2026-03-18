/**
 * DSP filter building blocks: biquad LP/HP, ADSR envelope, half-band decimator.
 * Shared by voices and effects.
 */

// Tiny DC offset added to filter inputs to prevent denormal floats.
// Subnormals (~1e-38) cause 10–100× CPU slowdown in feedback paths on some
// platforms (notably Safari/WebKit). 1e-18 is inaudible (~-360 dBFS).
const DENORMAL_DC = 1e-18

/**
 * 2-pole resonant low-pass filter (biquad).
 * Q controls resonance — high Q (6–10) gives TB-303 "squelch".
 * Must call setParams() before each tick() when sweeping the filter.
 */
export class ResonantLP {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0

  setParams(cutoff: number, Q: number, sr: number) {
    const fc   = Math.max(1, Math.min(cutoff, sr * 0.49))
    const w0   = 2 * Math.PI * fc / sr
    const sinw = Math.sin(w0)
    const cosw = Math.cos(w0)
    const alpha = sinw / (2 * Math.max(0.1, Q))
    const a0inv = 1 / (1 + alpha)
    this.b0 = ((1 - cosw) / 2) * a0inv
    this.b1 = (1 - cosw) * a0inv
    this.b2 = this.b0
    this.a1 = -2 * cosw * a0inv
    this.a2 = (1 - alpha) * a0inv
  }
  process(x: number): number {
    x += DENORMAL_DC
    const y = this.b0*x + this.b1*this.x1 + this.b2*this.x2
                        - this.a1*this.y1 - this.a2*this.y2
    this.x2 = this.x1; this.x1 = x
    this.y2 = this.y1; this.y1 = y
    return y
  }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0 }
}

/**
 * 2-pole high-pass filter (biquad).
 * 12 dB/oct rolloff — much sharper than OnePole HP, essential for
 * cleanly stripping oscillator fundamentals from metallic percussion.
 */
export class BiquadHP {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0

  setParams(cutoff: number, Q: number, sr: number) {
    const fc   = Math.max(1, Math.min(cutoff, sr * 0.49))
    const w0   = 2 * Math.PI * fc / sr
    const sinw = Math.sin(w0)
    const cosw = Math.cos(w0)
    const alpha = sinw / (2 * Math.max(0.1, Q))
    const a0inv = 1 / (1 + alpha)
    this.b0 = ((1 + cosw) / 2) * a0inv
    this.b1 = -(1 + cosw) * a0inv
    this.b2 = this.b0
    this.a1 = -2 * cosw * a0inv
    this.a2 = (1 - alpha) * a0inv
  }
  process(x: number): number {
    x += DENORMAL_DC
    const y = this.b0*x + this.b1*this.x1 + this.b2*this.x2
                        - this.a1*this.y1 - this.a2*this.y2
    this.x2 = this.x1; this.x1 = x
    this.y2 = this.y1; this.y1 = y
    return y
  }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0 }
}

/**
 * DJ-style sweep filter (Trapezoidal Integrated SVF).
 * X axis: LP ← 0.5 → HP sweep.  Y axis: resonance (Q).
 * Coefficients precomputed via set() at message rate; process() is per-sample.
 */
export class DJFilter {
  private ic1eqL = 0; private ic2eqL = 0
  private ic1eqR = 0; private ic2eqR = 0
  private _a1 = 0; private _a2 = 0; private _a3 = 0; private _k = 0
  private _gain = 1
  private _useLP = true
  private _active = false
  private _wet = 0           // smooth crossfade 0=bypass, 1=active
  private _fadeRate: number   // ~30ms exponential fade
  private out = new Float64Array(2)

  constructor(private sr: number) {
    this._fadeRate = 1 - Math.exp(-1 / (0.03 * sr))
  }

  set(x: number, y: number, on: boolean) {
    this._active = on
    if (!on) return
    let cutoff: number
    if (x <= 0.5) {
      cutoff = 80 * Math.pow(250, x / 0.5)
      this._useLP = true
    } else {
      cutoff = 20 * Math.pow(400, (x - 0.5) / 0.5)
      this._useLP = false
    }
    // HP resonance is perceptually much harsher — cap Q lower
    const maxQ = this._useLP ? 15 : 8
    const Q = 0.5 + y * (maxQ - 0.5)
    this._k = 1 / Q
    // Auto-gain: LP needs light touch, HP needs strong compensation
    const agFactor = this._useLP ? 0.07 : 0.18
    this._gain = 1 / (1 + (Q - 0.5) * agFactor)
    const g = Math.tan(Math.PI * Math.min(cutoff, this.sr * 0.49) / this.sr)
    this._a1 = 1 / (1 + g * (g + this._k))
    this._a2 = g * this._a1
    this._a3 = g * this._a2
  }

  process(inL: number, inR: number): Float64Array {
    // Smooth crossfade toward target
    const target = this._active ? 1 : 0
    this._wet += (target - this._wet) * this._fadeRate
    // Fully bypassed — skip filter math
    if (this._wet < 0.0005) {
      this._wet = 0
      this.out[0] = inL; this.out[1] = inR
      return this.out
    }
    const a1 = this._a1, a2 = this._a2, a3 = this._a3, k = this._k
    inL += DENORMAL_DC; inR += DENORMAL_DC
    // Left channel
    let v3 = inL - this.ic2eqL
    let v1 = a1 * this.ic1eqL + a2 * v3
    let v2 = this.ic2eqL + a2 * this.ic1eqL + a3 * v3
    this.ic1eqL = 2 * v1 - this.ic1eqL
    this.ic2eqL = 2 * v2 - this.ic2eqL
    let wetL = (this._useLP ? v2 : (inL - k * v1 - v2)) * this._gain
    // Right channel
    v3 = inR - this.ic2eqR
    v1 = a1 * this.ic1eqR + a2 * v3
    v2 = this.ic2eqR + a2 * this.ic1eqR + a3 * v3
    this.ic1eqR = 2 * v1 - this.ic1eqR
    this.ic2eqR = 2 * v2 - this.ic2eqR
    let wetR = (this._useLP ? v2 : (inR - k * v1 - v2)) * this._gain
    // Soft-clip HP output to tame harsh resonant peaks
    if (!this._useLP) { wetL = Math.tanh(wetL); wetR = Math.tanh(wetR) }
    // Crossfade dry ↔ wet
    const w = this._wet
    this.out[0] = inL + (wetL - inL) * w
    this.out[1] = inR + (wetR - inR) * w
    return this.out
  }
}

/**
 * Stereo biquad peaking EQ — parametric bell filter.
 * Coefficients precomputed via set() at message rate.
 */
export class PeakingEQ {
  private x1L = 0; private x2L = 0; private y1L = 0; private y2L = 0
  private x1R = 0; private x2R = 0; private y1R = 0; private y2R = 0
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0
  private _active = true
  private _wet = 1           // smooth crossfade 0=bypass, 1=active
  private _fadeRate: number   // ~30ms exponential fade
  private out = new Float64Array(2)

  constructor(sr: number) {
    this._fadeRate = 1 - Math.exp(-1 / (0.03 * sr))
  }

  set(freq: number, dBgain: number, Q: number, sr: number) {
    if (dBgain === 0) { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; return }
    const fc = Math.max(1, Math.min(freq, sr * 0.49))
    const A = Math.pow(10, dBgain / 40)
    const w0 = 2 * Math.PI * fc / sr
    const sinw = Math.sin(w0)
    const cosw = Math.cos(w0)
    const alpha = sinw / (2 * Math.max(0.1, Q))
    const a0inv = 1 / (1 + alpha / A)
    this.b0 = (1 + alpha * A) * a0inv
    this.b1 = -2 * cosw * a0inv
    this.b2 = (1 - alpha * A) * a0inv
    this.a1 = this.b1  // -2*cos(w0) / a0 — same for num and den
    this.a2 = (1 - alpha / A) * a0inv
  }

  setActive(on: boolean) { this._active = on }

  /** Returns normalized coefficients [b0, b1, b2, a1, a2] for UI curve drawing. */
  getCoeffs(): [number, number, number, number, number] {
    return [this.b0, this.b1, this.b2, this.a1, this.a2]
  }

  process(inL: number, inR: number): Float64Array {
    // Smooth crossfade toward target
    const target = this._active ? 1 : 0
    this._wet += (target - this._wet) * this._fadeRate
    // Fully bypassed — skip filter math
    if (this._wet < 0.0005) {
      this._wet = 0
      this.out[0] = inL; this.out[1] = inR
      return this.out
    }
    // Left
    inL += DENORMAL_DC; inR += DENORMAL_DC
    const yL = this.b0*inL + this.b1*this.x1L + this.b2*this.x2L
                            - this.a1*this.y1L - this.a2*this.y2L
    this.x2L = this.x1L; this.x1L = inL
    this.y2L = this.y1L; this.y1L = yL
    // Right
    const yR = this.b0*inR + this.b1*this.x1R + this.b2*this.x2R
                            - this.a1*this.y1R - this.a2*this.y2R
    this.x2R = this.x1R; this.x1R = inR
    this.y2R = this.y1R; this.y1R = yR
    // Crossfade dry ↔ wet
    const w = this._wet
    this.out[0] = inL + (yL - inL) * w
    this.out[1] = inR + (yR - inR) * w
    return this.out
  }
}

/**
 * Stereo biquad shelf EQ — low-shelf or high-shelf.
 * RBJ cookbook formulas. Smooth crossfade like PeakingEQ.
 */
export class ShelfEQ {
  private x1L = 0; private x2L = 0; private y1L = 0; private y2L = 0
  private x1R = 0; private x2R = 0; private y1R = 0; private y2R = 0
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0
  private _active = true
  private _wet = 1
  private _fadeRate: number
  private out = new Float64Array(2)

  constructor(sr: number, private _low = true) {
    this._fadeRate = 1 - Math.exp(-1 / (0.03 * sr))
  }

  set(freq: number, dBgain: number, Q: number, sr: number) {
    if (dBgain === 0) { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; return }
    const fc = Math.max(1, Math.min(freq, sr * 0.49))
    const A = Math.pow(10, dBgain / 40)
    const w0 = 2 * Math.PI * fc / sr
    const sinw = Math.sin(w0)
    const cosw = Math.cos(w0)
    const alpha = sinw / (2 * Math.max(0.1, Q))
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha

    if (this._low) {
      const a0inv = 1 / ((A + 1) + (A - 1) * cosw + twoSqrtAAlpha)
      this.b0 = A * ((A + 1) - (A - 1) * cosw + twoSqrtAAlpha) * a0inv
      this.b1 = 2 * A * ((A - 1) - (A + 1) * cosw) * a0inv
      this.b2 = A * ((A + 1) - (A - 1) * cosw - twoSqrtAAlpha) * a0inv
      this.a1 = -2 * ((A - 1) + (A + 1) * cosw) * a0inv
      this.a2 = ((A + 1) + (A - 1) * cosw - twoSqrtAAlpha) * a0inv
    } else {
      const a0inv = 1 / ((A + 1) - (A - 1) * cosw + twoSqrtAAlpha)
      this.b0 = A * ((A + 1) + (A - 1) * cosw + twoSqrtAAlpha) * a0inv
      this.b1 = -2 * A * ((A - 1) + (A + 1) * cosw) * a0inv
      this.b2 = A * ((A + 1) + (A - 1) * cosw - twoSqrtAAlpha) * a0inv
      this.a1 = 2 * ((A - 1) - (A + 1) * cosw) * a0inv
      this.a2 = ((A + 1) - (A - 1) * cosw - twoSqrtAAlpha) * a0inv
    }
  }

  setActive(on: boolean) { this._active = on }

  process(inL: number, inR: number): Float64Array {
    const target = this._active ? 1 : 0
    this._wet += (target - this._wet) * this._fadeRate
    if (this._wet < 0.0005) {
      this._wet = 0
      this.out[0] = inL; this.out[1] = inR
      return this.out
    }
    inL += DENORMAL_DC; inR += DENORMAL_DC
    const yL = this.b0*inL + this.b1*this.x1L + this.b2*this.x2L
                            - this.a1*this.y1L - this.a2*this.y2L
    this.x2L = this.x1L; this.x1L = inL
    this.y2L = this.y1L; this.y1L = yL
    const yR = this.b0*inR + this.b1*this.x1R + this.b2*this.x2R
                            - this.a1*this.y1R - this.a2*this.y2R
    this.x2R = this.x1R; this.x1R = inR
    this.y2R = this.y1R; this.y1R = yR
    const w = this._wet
    this.out[0] = inL + (yL - inL) * w
    this.out[1] = inR + (yR - inR) * w
    return this.out
  }
}

/**
 * State Variable Filter (Trapezoidal Integrated SVF) — mono, multi-mode.
 * Supports LP, HP, BP, Notch modes at 12dB/oct.
 * Cascade two for 24dB/oct (call process twice in series).
 */
export const enum SVFMode { LP, HP, BP, Notch }

export class SVFilter {
  private ic1eq = 0
  private ic2eq = 0
  private _a1 = 0
  private _a2 = 0
  private _a3 = 0
  private _k = 1  // 1/Q — damping
  private _mode: SVFMode = SVFMode.LP

  constructor(private sr: number) {}

  set mode(m: SVFMode) { this._mode = m }
  get mode() { return this._mode }

  setParams(cutoff: number, resonance: number) {
    const fc = Math.max(20, Math.min(cutoff, this.sr * 0.49))
    this._k = 1 / Math.max(0.5, resonance)
    const g = Math.tan(Math.PI * fc / this.sr)
    this._a1 = 1 / (1 + g * (g + this._k))
    this._a2 = g * this._a1
    this._a3 = g * this._a2
  }

  process(input: number): number {
    const v3 = input - this.ic2eq
    const v1 = this._a1 * this.ic1eq + this._a2 * v3
    const v2 = this.ic2eq + this._a2 * this.ic1eq + this._a3 * v3
    this.ic1eq = 2 * v1 - this.ic1eq
    this.ic2eq = 2 * v2 - this.ic2eq

    // Guard against NaN/Infinity from coefficient discontinuities
    if (!(this.ic1eq === this.ic1eq) || !(this.ic2eq === this.ic2eq) ||
        this.ic1eq > 1e15 || this.ic1eq < -1e15 ||
        this.ic2eq > 1e15 || this.ic2eq < -1e15) {
      this.ic1eq = 0; this.ic2eq = 0
      return 0
    }

    switch (this._mode) {
      case SVFMode.LP:    return v2
      case SVFMode.HP:    return input - this._k * v1 - v2
      case SVFMode.BP:    return v1
      case SVFMode.Notch: return input - this._k * v1
    }
  }

  reset() { this.ic1eq = 0; this.ic2eq = 0 }
}

const enum Stage { Idle, Attack, Decay, Sustain, Release }
export class ADSR {
  attack = 0.01; decay = 0.1; sustain = 0.7; release = 0.3
  private level = 0; private stage = Stage.Idle; private sr = 44100
  private releaseLevel = 0
  setSampleRate(sr: number) { this.sr = sr }
  noteOn()  { this.stage = Stage.Attack }
  noteOff() {
    if (this.stage !== Stage.Idle) {
      this.releaseLevel = this.level
      this.stage = Stage.Release
    }
  }
  isIdle()  { return this.stage === Stage.Idle }
  reset()   { this.level = 0; this.releaseLevel = 0; this.stage = Stage.Idle }
  tick(): number {
    switch (this.stage) {
      case Stage.Idle: return 0
      case Stage.Attack:
        this.level += 1 / (Math.max(0.001, this.attack) * this.sr)
        if (this.level >= 1) { this.level = 1; this.stage = Stage.Decay }
        break
      case Stage.Decay:
        this.level -= (1 - this.sustain) / (Math.max(0.001, this.decay) * this.sr)
        if (this.level <= this.sustain) { this.level = this.sustain; this.stage = Stage.Sustain }
        break
      case Stage.Sustain: break
      case Stage.Release: {
        const rate = this.releaseLevel / (Math.max(0.001, this.release) * this.sr)
        this.level -= rate > 0.00001 ? rate : 0.00001
        if (this.level <= 0) { this.level = 0; this.stage = Stage.Idle }
        break
      }
    }
    return this.level
  }
}

// ── Half-band decimation filter for 2× oversampling ─────────────────
// 6-tap symmetric FIR: [-0.0625, 0, 0.5625, 0.5625, 0, -0.0625]
// ~40 dB attenuation at Nyquist. Only 3 multiplies per output sample
// thanks to the half-band zero structure.

export class HalfBandDown {
  private d0 = 0; private d1 = 0; private d2 = 0
  private d3 = 0; private d4 = 0

  /** Feed two consecutive samples (even, odd at 2×SR), return one decimated output. */
  process(even: number, odd: number): number {
    // Shift delay line and insert new samples
    this.d0 = this.d1
    this.d1 = this.d2
    this.d2 = this.d3
    this.d3 = this.d4
    this.d4 = even
    // Apply FIR: coeffs = [-0.0625, 0, 0.5625, 0.5625, 0, -0.0625]
    // d0 is oldest (coeff -0.0625), d4 is newest (maps to 'even')
    // 'odd' is the most recent sample (coeff -0.0625 at position 5)
    return -0.0625 * this.d0 + 0.5625 * this.d2 + 0.5625 * this.d3 - 0.0625 * odd
  }

  reset(): void {
    this.d0 = this.d1 = this.d2 = this.d3 = this.d4 = 0
  }
}
