/**
 * DSP filter building blocks: biquad LP/HP + ADSR envelope.
 * Shared by voices and effects.
 */

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
    const y = this.b0*x + this.b1*this.x1 + this.b2*this.x2
                        - this.a1*this.y1 - this.a2*this.y2
    this.x2 = this.x1; this.x1 = x
    this.y2 = this.y1; this.y1 = y
    return y
  }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0 }
}

const enum Stage { Idle, Attack, Decay, Sustain, Release }
export class ADSR {
  attack = 0.01; decay = 0.1; sustain = 0.7; release = 0.3
  private level = 0; private stage = Stage.Idle; private sr = 44100
  setSampleRate(sr: number) { this.sr = sr }
  noteOn()  { this.stage = Stage.Attack }
  isIdle()  { return this.stage === Stage.Idle }
  reset()   { this.level = 0; this.stage = Stage.Idle }
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
      case Stage.Release:
        this.level -= this.sustain / (Math.max(0.001, this.release) * this.sr)
        if (this.level <= 0) { this.level = 0; this.stage = Stage.Idle }
        break
    }
    return this.level
  }
}
