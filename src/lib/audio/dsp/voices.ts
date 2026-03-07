/**
 * Synth voices: TR-909 drums, TB-303 acid bass, Moog lead, FM.
 */
import { ResonantLP, BiquadHP, ADSR, SVFilter, SVFMode } from './filters.ts'

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

export interface Voice {
  noteOn(note: number, velocity: number): void
  noteOff(): void
  slideNote(note: number, velocity: number): void
  tick(): number
  tickStereo?(out: Float32Array): void  // writes [L, R] into out[0], out[1]
  reset(): void
  setParam(key: string, value: number): void
}

// ── Drum voices ─────────────────────────────────────────────────────

/** Kick: TR-909 style — bridged-T oscillator circuit. */
export class KickVoice implements Voice {
  private phase = 0; private t = 0; private vel = 1; private playing = false
  private seed = 12345
  private pitchStart = 340; private pitchEnd = 55; private pitchDecay = 0.035
  private ampDecay = 0.35; private drive = 1.4
  constructor(private sr: number) {}
  noteOn(_n: number, v: number) { this.vel = v; this.phase = 0; this.t = 0; this.playing = true }
  noteOff() {}
  slideNote(n: number, v: number) { this.noteOn(n, v) }
  reset() { this.phase = 0; this.t = 0; this.playing = false }
  tick(): number {
    if (!this.playing) return 0
    const ts = this.t / this.sr
    const amp = Math.exp(-ts / this.ampDecay)
    if (amp < 0.001) { this.playing = false; return 0 }
    const freq = this.pitchEnd + (this.pitchStart - this.pitchEnd) * Math.exp(-ts / this.pitchDecay)
    this.phase += freq / this.sr
    if (this.phase >= 1) this.phase -= 1
    const sine = Math.sin(this.phase * 2 * Math.PI)
    let click = 0
    if (ts < 0.003) {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0
      click = ((this.seed >>> 16) / 32768 - 1) * Math.exp(-ts / 0.0006) * 0.6
    }
    this.t++
    return Math.tanh((sine + click) * this.drive) * amp * this.vel * 1.35
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'pitchStart': this.pitchStart = value; break
      case 'pitchEnd':   this.pitchEnd   = value; break
      case 'pitchDecay': this.pitchDecay = value; break
      case 'ampDecay':   this.ampDecay   = value; break
      case 'drive':      this.drive      = value; break
    }
  }
}

/** Snare: TR-909 style — separate tone/noise VCAs. */
export class SnareVoice implements Voice {
  private phase = 0; private t = 0; private vel = 1; private playing = false
  private seed = 99991
  private noiseLp = new ResonantLP()
  private toneDecay = 0.08; private noiseDecay = 0.07
  private toneAmt = 0.20; private noiseAmt = 0.85; private noiseFc = 3000
  constructor(private sr: number) {
    this.noiseLp.setParams(this.noiseFc, 3.5, sr)
  }
  noteOn(_n: number, v: number) {
    this.vel = v; this.phase = 0; this.t = 0; this.playing = true; this.noiseLp.reset()
  }
  noteOff() {}
  slideNote(n: number, v: number) { this.noteOn(n, v) }
  reset() { this.phase = 0; this.t = 0; this.playing = false; this.noiseLp.reset() }
  tick(): number {
    if (!this.playing) return 0
    const ts = this.t / this.sr
    const toneAmp  = Math.exp(-ts / this.toneDecay)
    const noiseAmp = Math.exp(-ts / this.noiseDecay)
    if (toneAmp < 0.001 && noiseAmp < 0.001) { this.playing = false; return 0 }
    const freq = 185 + 40 * Math.exp(-ts / 0.008)
    this.phase += freq / this.sr
    if (this.phase >= 1) this.phase -= 1
    const tone = Math.sin(this.phase * 2 * Math.PI) * toneAmp * this.toneAmt
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    const raw = (this.seed >>> 16) / 32768 - 1
    const noise = this.noiseLp.process(raw) * noiseAmp * this.noiseAmt
    this.t++
    return (tone + noise) * this.vel
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'toneDecay':  this.toneDecay  = value; break
      case 'noiseDecay': this.noiseDecay = value; break
      case 'toneAmt':    this.toneAmt    = value; break
      case 'noiseAmt':   this.noiseAmt   = value; break
      case 'noiseFc':
        this.noiseFc = value
        this.noiseLp.setParams(value, 3.5, this.sr)
        break
    }
  }
}

/** Hand clap: TR-909 style — 4 rapid noise bursts + decay tail. */
export class ClapVoice implements Voice {
  private t = 0; private vel = 1; private playing = false
  private seed = 54321
  private filter = new ResonantLP()
  private decay = 0.18; private filterFc = 1200; private burstGap = 0.015
  constructor(private sr: number) {
    this.filter.setParams(this.filterFc, 2.0, sr)
  }
  noteOn(_n: number, v: number) {
    this.vel = v; this.t = 0; this.playing = true; this.filter.reset()
  }
  noteOff() {}
  slideNote(n: number, v: number) { this.noteOn(n, v) }
  reset() { this.t = 0; this.playing = false; this.filter.reset() }
  tick(): number {
    if (!this.playing) return 0
    const ts = this.t / this.sr
    let amp = 0
    const burstEnd = this.burstGap * 4
    if (ts < burstEnd) {
      const local = ts % this.burstGap
      if (local < 0.002) {
        const attack = Math.min(local / 0.0003, 1.0)
        amp = (1.0 - local / 0.002) * attack
      }
    }
    const tailStart = burstEnd * 0.7
    if (ts > tailStart) {
      const tail = Math.exp(-(ts - tailStart) / this.decay)
      amp = Math.max(amp, tail * 0.8)
    }
    if (amp < 0.001 && ts > burstEnd) { this.playing = false; return 0 }
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    const raw = (this.seed >>> 16) / 32768 - 1
    const sig = this.filter.process(raw)
    this.t++
    return sig * amp * this.vel * 0.9
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'decay':    this.decay    = value; break
      case 'filterFc':
        this.filterFc = value
        this.filter.setParams(value, 2.0, this.sr)
        break
      case 'burstGap': this.burstGap = value; break
    }
  }
}

/** Closed hi-hat: TR-909 style — 6 square-wave metallic oscillators. */
export class HatVoice implements Voice {
  private vel = 1; private t = 0; private playing = false
  private seed = 77777
  private hp = new BiquadHP()
  private phases = [0, 0, 0, 0, 0, 0]
  private readonly ratios = [1.0, 1.283, 1.800, 2.104, 2.587, 2.870]
  private baseFreq = 800; private hpCutoff = 5000
  private volume = 0.65; private decay = 0.04
  constructor(private sr: number) {
    this.hp.setParams(this.hpCutoff, 0.7, sr)
  }
  noteOn(_n: number, v: number) {
    this.vel = v; this.t = 0; this.playing = true; this.hp.reset()
  }
  noteOff() {}
  slideNote(n: number, v: number) { this.noteOn(n, v) }
  reset() { this.t = 0; this.playing = false; this.hp.reset(); this.phases.fill(0) }
  tick(): number {
    if (!this.playing) return 0
    const ts = this.t / this.sr
    const amp = Math.exp(-ts / this.decay)
    if (amp < 0.001) { this.playing = false; return 0 }
    let sig = 0
    for (let i = 0; i < 6; i++) {
      this.phases[i] += (this.baseFreq * this.ratios[i]) / this.sr
      if (this.phases[i] >= 1) this.phases[i] -= 1
      sig += this.phases[i] < 0.5 ? 1 : -1
    }
    sig /= 6
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    sig += ((this.seed >>> 16) / 32768 - 1) * 0.25
    const out = this.hp.process(sig)
    this.t++
    return out * amp * this.vel * this.volume
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'decay':    this.decay    = value; break
      case 'baseFreq': this.baseFreq = value; break
      case 'hpCutoff':
        this.hpCutoff = value
        this.hp.setParams(value, 0.7, this.sr)
        break
      case 'volume':   this.volume   = value; break
    }
  }
}

/** Open hi-hat: TR-909 style — same oscillator bank, longer decay. */
export class OpenHatVoice implements Voice {
  private vel = 1; private t = 0; private playing = false
  private seed = 88888
  private hp = new BiquadHP()
  private phases = [0, 0, 0, 0, 0, 0]
  private readonly ratios = [1.0, 1.283, 1.800, 2.104, 2.587, 2.870]
  private baseFreq = 800; private hpCutoff = 4500
  private volume = 0.60; private decay = 0.18
  constructor(private sr: number) {
    this.hp.setParams(this.hpCutoff, 0.7, sr)
  }
  noteOn(_n: number, v: number) {
    this.vel = v; this.t = 0; this.playing = true; this.hp.reset()
  }
  noteOff() {}
  slideNote(n: number, v: number) { this.noteOn(n, v) }
  reset() { this.t = 0; this.playing = false; this.hp.reset(); this.phases.fill(0) }
  tick(): number {
    if (!this.playing) return 0
    const ts = this.t / this.sr
    const amp = Math.exp(-ts / this.decay)
    if (amp < 0.001) { this.playing = false; return 0 }
    let sig = 0
    for (let i = 0; i < 6; i++) {
      this.phases[i] += (this.baseFreq * this.ratios[i]) / this.sr
      if (this.phases[i] >= 1) this.phases[i] -= 1
      sig += this.phases[i] < 0.5 ? 1 : -1
    }
    sig /= 6
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    sig += ((this.seed >>> 16) / 32768 - 1) * 0.25
    const out = this.hp.process(sig)
    this.t++
    return out * amp * this.vel * this.volume
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'decay':    this.decay    = value; break
      case 'baseFreq': this.baseFreq = value; break
      case 'hpCutoff':
        this.hpCutoff = value
        this.hp.setParams(value, 0.7, this.sr)
        break
      case 'volume':   this.volume   = value; break
    }
  }
}

/** Crash cymbal: TR-606 style — noise + metallic sine through resonant BP filter.
 *  Noise provides the wash, a high sine adds metallic ping/shimmer. */
export class CymbalVoice implements Voice {
  private vel = 1; private t = 0; private playing = false
  private seed = 66666
  private bp: SVFilter
  private hp = new BiquadHP()
  private tonePhase = 0
  private baseFreq = 7500; private hpCutoff = 2500
  private volume = 0.55; private decay = 0.35
  constructor(private sr: number) {
    this.bp = new SVFilter(sr)
    this.bp.mode = SVFMode.BP
    this.bp.setParams(this.baseFreq, 2.0)
    this.hp.setParams(this.hpCutoff, 0.5, sr)
  }
  noteOn(_n: number, v: number) {
    this.vel = v; this.t = 0; this.playing = true
    this.tonePhase = 0; this.bp.reset(); this.hp.reset()
  }
  noteOff() {}
  slideNote(n: number, v: number) { this.noteOn(n, v) }
  reset() {
    this.t = 0; this.playing = false; this.tonePhase = 0
    this.bp.reset(); this.hp.reset()
  }
  tick(): number {
    if (!this.playing) return 0
    const ts = this.t / this.sr
    // Two-stage envelope: sharp attack transient + longer tail
    const attack = Math.exp(-ts / 0.012)
    const tail = Math.exp(-ts / this.decay)
    const amp = attack * 0.35 + tail * 0.65
    if (amp < 0.001) { this.playing = false; return 0 }
    // White noise — the wash
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    const noise = (this.seed >>> 16) / 32768 - 1
    // Metallic sine tone — adds shimmer/ping that noise alone lacks
    this.tonePhase += this.baseFreq / this.sr
    if (this.tonePhase >= 1) this.tonePhase -= 1
    const tone = Math.sin(this.tonePhase * 2 * Math.PI) * 0.3
    // Mix noise + tone, then through resonant BP
    const bpFreq = this.baseFreq + 3000 * attack
    this.bp.setParams(bpFreq, 2.0)
    let sig = this.bp.process(noise + tone)
    // HP to remove low-end rumble
    sig = this.hp.process(sig)
    this.t++
    return sig * amp * this.vel * this.volume * 2.0
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'decay':    this.decay    = value; break
      case 'baseFreq':
        this.baseFreq = value
        this.bp.setParams(value, 2.0)
        break
      case 'hpCutoff':
        this.hpCutoff = value
        this.hp.setParams(value, 0.5, this.sr)
        break
      case 'volume':   this.volume   = value; break
    }
  }
}

// ── Melodic voices ──────────────────────────────────────────────────

/** TB-303 acid bass — saw → drive → resonant LP (Q=7) → split filter/amp envelopes + slide.
 *  Real 303 has separate VCA (gate-style, sustain=1) and VCF (acid sweep, sustain=0).
 *  This split is essential for slide: amp stays open while pitch glides. */
export class TB303Voice implements Voice {
  private phase = 0; private freq = 110; private targetFreq = 110; private vel = 1
  private filterEnv = new ADSR(); private ampEnv = new ADSR()
  private filter = new ResonantLP()
  private cutoffBase = 200; private envMod = 4000; private resonance = 7.0; private drive = 1.6
  private slideRate: number
  constructor(private sr: number) {
    this.filterEnv.setSampleRate(sr)
    this.filterEnv.attack = 0.002; this.filterEnv.decay = 0.18
    this.filterEnv.sustain = 0.0; this.filterEnv.release = 0.10
    // VCA: gate-style — stays open while gate is high, fast release
    this.ampEnv.setSampleRate(sr)
    this.ampEnv.attack = 0.002; this.ampEnv.decay = 0.01
    this.ampEnv.sustain = 1.0; this.ampEnv.release = 0.02
    this.slideRate = 1 - Math.exp(-1 / (0.060 * sr))  // ~60ms glide
  }
  noteOn(note: number, v: number) {
    this.freq = midiToHz(note); this.targetFreq = this.freq
    this.vel = v; this.filterEnv.noteOn(); this.ampEnv.noteOn()
  }
  noteOff() { this.filterEnv.noteOff(); this.ampEnv.noteOff() }
  slideNote(note: number, v: number) {
    this.targetFreq = midiToHz(note)
    this.vel = v
    // Retrigger filter envelope (acid squelch on each step) but NOT amp (legato)
    this.filterEnv.noteOn()
  }
  reset() {
    this.filterEnv.reset(); this.ampEnv.reset()
    this.filter.reset(); this.phase = 0; this.freq = this.targetFreq = 110
  }
  tick(): number {
    if (this.ampEnv.isIdle()) return 0
    this.freq += (this.targetFreq - this.freq) * this.slideRate
    const fenv = this.filterEnv.tick()
    const aenv = this.ampEnv.tick()
    this.phase += this.freq / this.sr
    if (this.phase >= 1) this.phase -= 1
    const driven = Math.tanh((this.phase * 2 - 1) * this.drive)
    this.filter.setParams(this.cutoffBase + this.envMod * fenv * fenv, this.resonance, this.sr)
    return this.filter.process(driven) * aenv * this.vel * 0.75
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'cutoffBase': this.cutoffBase   = value; break
      case 'envMod':     this.envMod       = value; break
      case 'resonance':  this.resonance    = value; break
      case 'decay':      this.filterEnv.decay = value; break
      case 'drive':      this.drive        = value; break
    }
  }
}

/** Analog subtractive: saw → saturation → resonant LP → ADSR. */
export class AnalogVoice implements Voice {
  private phase = 0; private freq = 220; private vel = 1
  private env = new ADSR(); private filter = new ResonantLP()
  private cutoffBase = 800; private envMod = 4500; private resonance = 3.5
  constructor(private sr: number) {
    this.env.setSampleRate(sr)
    this.env.attack = 0.008; this.env.decay = 0.25; this.env.sustain = 0.3; this.env.release = 0.3
  }
  noteOn(note: number, v: number) { this.freq = midiToHz(note); this.vel = v; this.env.noteOn() }
  noteOff() { this.env.noteOff() }
  slideNote(note: number, v: number) { this.noteOn(note, v) }
  reset() { this.env.reset(); this.filter.reset(); this.phase = 0 }
  tick(): number {
    if (this.env.isIdle()) return 0
    const env = this.env.tick()
    this.phase += this.freq / this.sr
    if (this.phase >= 1) this.phase -= 1
    const sat = Math.tanh((this.phase * 2 - 1) * 1.8)
    this.filter.setParams(Math.min(this.cutoffBase + this.envMod * env, this.sr * 0.45), this.resonance, this.sr)
    return this.filter.process(sat) * env * this.vel * 0.60
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'cutoffBase': this.cutoffBase = value; break
      case 'envMod':     this.envMod     = value; break
      case 'resonance':  this.resonance  = value; break
      case 'decay':      this.env.decay  = value; break
    }
  }
}

/** Moog-style 4-pole analog lead — two detuned saws → cascaded biquads + slide. */
export class MoogVoice implements Voice {
  private phase1 = 0; private phase2 = 0
  private freq = 220; private targetFreq = 220; private vel = 1
  private filterEnv = new ADSR()
  private ampEnv = new ADSR()
  private f1 = new ResonantLP(); private f2 = new ResonantLP()
  private cutoffBase = 400; private envMod = 5500; private resonance = 1.8; private detune = 1.0029
  private slideRate: number
  constructor(private sr: number) {
    this.filterEnv.setSampleRate(sr)
    this.filterEnv.attack = 0.002; this.filterEnv.decay = 0.35
    this.filterEnv.sustain = 0.0; this.filterEnv.release = 0.1
    this.ampEnv.setSampleRate(sr)
    this.ampEnv.attack = 0.005; this.ampEnv.decay = 0.3
    this.ampEnv.sustain = 0.8; this.ampEnv.release = 0.25
    this.slideRate = 1 - Math.exp(-1 / (0.080 * sr))  // ~80ms glide
  }
  noteOn(note: number, v: number) {
    this.freq = midiToHz(note); this.targetFreq = this.freq
    this.vel = v; this.filterEnv.noteOn(); this.ampEnv.noteOn()
  }
  noteOff() { this.filterEnv.noteOff(); this.ampEnv.noteOff() }
  slideNote(note: number, v: number) {
    // Clean legato: instant pitch change, no glide (unlike TB303)
    const f = midiToHz(note)
    this.freq = f; this.targetFreq = f
    this.vel = v
  }
  reset() {
    this.filterEnv.reset(); this.ampEnv.reset()
    this.f1.reset(); this.f2.reset()
    this.phase1 = this.phase2 = 0
    this.freq = this.targetFreq = 220
  }
  tick(): number {
    if (this.ampEnv.isIdle()) return 0
    this.freq += (this.targetFreq - this.freq) * this.slideRate
    const fenv = this.filterEnv.tick()
    const aenv = this.ampEnv.tick()
    this.phase1 += this.freq / this.sr
    this.phase2 += (this.freq * this.detune) / this.sr
    if (this.phase1 >= 1) this.phase1 -= 1
    if (this.phase2 >= 1) this.phase2 -= 1
    const saw = ((this.phase1 * 2 - 1) + (this.phase2 * 2 - 1)) * 0.5
    const driven = Math.tanh(saw * 1.5)
    const fc = Math.min(this.cutoffBase + this.envMod * fenv, this.sr * 0.4)
    this.f1.setParams(fc, this.resonance, this.sr)
    this.f2.setParams(fc, this.resonance, this.sr)
    return this.f2.process(Math.tanh(this.f1.process(driven) * 1.2)) * aenv * this.vel * 0.65
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'cutoffBase':  this.cutoffBase = value; break
      case 'envMod':      this.envMod     = value; break
      case 'resonance':   this.resonance  = value; break
      case 'decay':       // backward compat alias
      case 'filterDecay': this.filterEnv.decay = value; break
      case 'detune':      this.detune     = value; break
      case 'ampAttack':   this.ampEnv.attack  = value; break
      case 'ampDecay':    this.ampEnv.decay   = value; break
      case 'ampSustain':  this.ampEnv.sustain = value; break
      case 'ampRelease':  this.ampEnv.release = value; break
    }
  }
}

/** 3-operator FM — YM2612 (Sega Genesis) inspired. */
export class FMVoice implements Voice {
  private freq = 440; private vel = 1
  private op1P = 0; private op2P = 0; private cP = 0
  private fb = 0
  private cEnv   = new ADSR()
  private op2Env = new ADSR()
  private op2Ratio = 2.1; private fbAmt = 0.55; private op2Index = 4.5; private carrierIndex = 3.5
  constructor(private sr: number) {
    this.cEnv.setSampleRate(sr)
    this.cEnv.attack  = 0.003; this.cEnv.decay  = 0.30; this.cEnv.sustain = 0.20; this.cEnv.release = 0.4
    this.op2Env.setSampleRate(sr)
    this.op2Env.attack = 0.001; this.op2Env.decay = 0.10; this.op2Env.sustain = 0.0; this.op2Env.release = 0.05
  }
  noteOn(note: number, v: number) {
    this.freq = midiToHz(note); this.vel = v
    this.op1P = this.op2P = this.cP = this.fb = 0
    this.cEnv.noteOn(); this.op2Env.noteOn()
  }
  noteOff() { this.cEnv.noteOff(); this.op2Env.noteOff() }
  slideNote(note: number, v: number) { this.noteOn(note, v) }
  reset() {
    this.cEnv.reset(); this.op2Env.reset()
    this.op1P = this.op2P = this.cP = this.fb = 0
  }
  tick(): number {
    if (this.cEnv.isIdle()) return 0
    const ce  = this.cEnv.tick()
    const m2e = this.op2Env.tick()
    const tau = 2 * Math.PI
    this.op1P += this.freq / this.sr
    if (this.op1P >= 1) this.op1P -= 1
    const op1 = Math.sin(this.op1P * tau + this.fb * 3.2)
    this.fb = op1 * this.fbAmt
    this.op2P += (this.freq * this.op2Ratio) / this.sr
    if (this.op2P >= 1) this.op2P -= 1
    const op2 = Math.sin(this.op2P * tau + op1 * this.op2Index * m2e)
    this.cP += this.freq / this.sr
    if (this.cP >= 1) this.cP -= 1
    return Math.sin((this.cP + op2 * this.carrierIndex * ce / tau) * tau) * ce * this.vel * 0.55
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'op2Ratio':     this.op2Ratio     = value; break
      case 'fbAmt':        this.fbAmt        = value; break
      case 'op2Index':     this.op2Index     = value; break
      case 'carrierIndex': this.carrierIndex = value; break
      case 'decay':        this.cEnv.decay   = value; break
    }
  }
}

// ── Wavetable Oscillator (ADR 011) ──────────────────────────────────

/** Wavetable shapes — generated mathematically at init, zero bundle cost. */
const enum WTShape { Saw, Square, Triangle, Sine, Pulse }

const WT_SIZE = 2048

/** Generate a single-cycle wavetable via additive synthesis (band-limited). */
function generateTable(shape: WTShape, sr: number, baseFreq: number): Float32Array {
  const table = new Float32Array(WT_SIZE)
  const nyquist = sr / 2
  const maxHarmonics = Math.floor(nyquist / Math.max(1, baseFreq))

  for (let h = 1; h <= maxHarmonics; h++) {
    let amp = 0
    switch (shape) {
      case WTShape.Saw:      amp = (h % 2 === 0 ? -1 : 1) * (1 / h); break
      case WTShape.Square:   amp = h % 2 === 1 ? (1 / h) : 0; break
      case WTShape.Triangle: amp = h % 2 === 1 ? ((h % 4 === 1 ? 1 : -1) / (h * h)) : 0; break
      case WTShape.Sine:     amp = h === 1 ? 1 : 0; break
      case WTShape.Pulse:    amp = 1 / h; break  // all harmonics equal = narrow pulse
    }
    if (amp === 0) continue
    for (let i = 0; i < WT_SIZE; i++) {
      table[i] += amp * Math.sin(2 * Math.PI * h * i / WT_SIZE)
    }
  }

  // Normalize
  let peak = 0
  for (let i = 0; i < WT_SIZE; i++) { const a = Math.abs(table[i]); if (a > peak) peak = a }
  if (peak > 0) for (let i = 0; i < WT_SIZE; i++) table[i] /= peak

  return table
}

const SHAPE_COUNT = 5

class WavetableOsc {
  private tables: Float32Array[] = []
  private phase = 0

  /** Position 0.0–1.0 morphs between wavetable shapes */
  position = 0

  constructor(private sr: number) {
    // Generate band-limited tables for a middle-range base frequency
    for (let s = 0; s < SHAPE_COUNT; s++) {
      this.tables.push(generateTable(s as WTShape, sr, 100))
    }
  }

  reset() { this.phase = 0 }

  tick(freq: number): number {
    this.phase += freq / this.sr
    // Robust phase wrapping — handles large freq jumps from FM modulation
    this.phase -= Math.floor(this.phase)
    if (this.phase < 0) this.phase = 0

    // Morph position selects between tables
    const pos = this.position * (SHAPE_COUNT - 1)
    const idx = Math.floor(pos)
    const frac = pos - idx
    const idxNext = Math.min(idx + 1, SHAPE_COUNT - 1)

    // Linear interpolation within table
    const phaseSample = this.phase * WT_SIZE
    const s0 = Math.floor(phaseSample) & (WT_SIZE - 1)
    const s1 = (s0 + 1) & (WT_SIZE - 1)
    const sf = phaseSample - Math.floor(phaseSample)

    const a = this.tables[idx][s0] + (this.tables[idx][s1] - this.tables[idx][s0]) * sf
    const b = this.tables[idxNext][s0] + (this.tables[idxNext][s1] - this.tables[idxNext][s0]) * sf

    return a + (b - a) * frac
  }
}

// ── LFO (ADR 011) ───────────────────────────────────────────────────

const enum LFOShape { Sine, Triangle, Saw, Square, SampleHold }

/** Tempo-sync division table: index → beats multiplier */
const LFO_SYNC_DIVS = [
  4,          // 0: 1/1   (4 beats)
  2,          // 1: 1/2   (2 beats)
  1,          // 2: 1/4   (1 beat)
  0.5,        // 3: 1/8
  0.25,       // 4: 1/16
  0.125,      // 5: 1/32
  1 / 1.5,    // 6: 1/4T  (triplet)
  0.5 / 1.5,  // 7: 1/8T
  0.25 / 1.5, // 8: 1/16T
  1.5,        // 9: 1/4D  (dotted)
  0.75,       // 10: 1/8D
  0.375,      // 11: 1/16D
]

class LFO {
  private phase = 0
  private holdValue = 0
  private seed = 44444
  shape: LFOShape = LFOShape.Sine
  rate = 2.0       // Hz (free-running mode)
  sync = false     // true = tempo-synced
  divIndex = 2     // index into LFO_SYNC_DIVS (default: 1/4)
  bpm = 120        // set externally from worklet
  private sr: number

  constructor(sr: number) { this.sr = sr }

  reset() { this.phase = 0; this.holdValue = 0 }

  /** Returns bipolar value -1..+1 */
  tick(): number {
    const effectiveRate = this.sync
      ? 1 / (LFO_SYNC_DIVS[this.divIndex] * 60 / this.bpm)
      : this.rate
    this.phase += effectiveRate / this.sr
    const wrapped = this.phase >= 1
    if (wrapped) this.phase -= 1

    switch (this.shape) {
      case LFOShape.Sine:     return Math.sin(this.phase * 2 * Math.PI)
      case LFOShape.Triangle: return this.phase < 0.5 ? this.phase * 4 - 1 : 3 - this.phase * 4
      case LFOShape.Saw:      return this.phase * 2 - 1
      case LFOShape.Square:   return this.phase < 0.5 ? 1 : -1
      case LFOShape.SampleHold: {
        if (wrapped) {
          this.seed = (this.seed * 1664525 + 1013904223) >>> 0
          this.holdValue = (this.seed >>> 16) / 32768 - 1
        }
        return this.holdValue
      }
    }
  }
}

// ── Modulation Matrix (ADR 011) ─────────────────────────────────────

const enum ModSrc { LFO1, LFO2, Env2, Velocity, Note }
const enum ModDst { Pitch, WTPos, Cutoff, Resonance, FMIndex, Volume }

interface ModSlot {
  src: ModSrc
  dst: ModDst
  amount: number  // -1..+1 bipolar
}

class ModMatrix {
  slots: ModSlot[] = []

  /** Set or update a mod slot by index (0–7). amt=0 removes the slot. */
  setSlot(idx: number, src: number, dst: number, amt: number) {
    // Remove existing slot at this index
    while (this.slots.length <= idx) this.slots.push({ src: 0 as ModSrc, dst: 0 as ModDst, amount: 0 })
    if (amt === 0) {
      this.slots[idx] = { src: 0 as ModSrc, dst: 0 as ModDst, amount: 0 }
    } else {
      this.slots[idx] = { src: src as ModSrc, dst: dst as ModDst, amount: amt }
    }
  }

  /** Compute modulated param offsets. Returns per-destination sum of modulations. */
  process(
    lfo1: number, lfo2: number, env2: number, velocity: number, note: number
  ): Float64Array {
    // 6 destinations: Pitch, WTPos, Cutoff, Reso, FMIndex, Volume
    const out = new Float64Array(6)
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      let srcVal = 0
      switch (s.src) {
        case ModSrc.LFO1:     srcVal = lfo1; break
        case ModSrc.LFO2:     srcVal = lfo2; break
        case ModSrc.Env2:     srcVal = env2; break
        case ModSrc.Velocity: srcVal = velocity * 2 - 1; break  // map 0-1 to bipolar
        case ModSrc.Note:     srcVal = (note - 60) / 48; break  // center at C4
      }
      out[s.dst] += srcVal * s.amount
    }
    return out
  }
}

// ── iDEATH — unified wavetable synth engine (ADR 011, 063) ─────────

/**
 * 2-osc wavetable synth with SVF filter, dual ADSR, 2× LFO, mod matrix.
 * Osc combine modes: mix, FM, ringmod
 * Filter modes: LP, HP, BP, Notch (via SVFilter)
 */
const enum OscCombine { Mix, FM, Ring }

const MAX_UNISON = 7

class IdeathCore {
  // Center voice (always active)
  oscA: WavetableOsc
  oscB: WavetableOsc
  // Unison voices (pairs of oscs, indices 0..MAX_UNISON-2 for side voices)
  private uniOscA: WavetableOsc[]
  private uniOscB: WavetableOsc[]

  ampEnv = new ADSR()
  modEnv = new ADSR()
  lfo1 = new LFO(44100)
  lfo2 = new LFO(44100)
  modMatrix = new ModMatrix()
  filter: SVFilter
  freq = 220
  targetFreq = 220
  vel = 1
  note = 60
  slideRate: number

  // Osc params
  oscAPos = 0
  oscBPos = 0.25
  oscBSemi = 0
  oscBDetune = 0
  oscMix = 0.5
  combineMode: OscCombine = OscCombine.Mix
  fmIndex = 3.0

  // Filter params
  cutoffBase = 1200
  envMod = 4000
  resonance = 2.0
  drive = 0            // 0.0–1.0 post-filter saturation

  // Unison params
  unisonVoices = 1     // 1, 3, 5, 7 (odd only)
  unisonSpread = 0.3   // detune spread 0.0–1.0
  unisonWidth = 0.8    // stereo pan spread 0.0–1.0

  constructor(private sr: number) {
    this.oscA = new WavetableOsc(sr)
    this.oscB = new WavetableOsc(sr)
    // Pre-allocate side voice oscs (3 pairs for up to 7 voices: 6 side voices)
    this.uniOscA = Array.from({ length: MAX_UNISON - 1 }, () => new WavetableOsc(sr))
    this.uniOscB = Array.from({ length: MAX_UNISON - 1 }, () => new WavetableOsc(sr))
    this.filter = new SVFilter(sr)
    this.lfo1 = new LFO(sr)
    this.lfo2 = new LFO(sr)
    this.ampEnv.setSampleRate(sr)
    this.ampEnv.attack = 0.005; this.ampEnv.decay = 0.3
    this.ampEnv.sustain = 0.5; this.ampEnv.release = 0.3
    this.modEnv.setSampleRate(sr)
    this.modEnv.attack = 0.001; this.modEnv.decay = 0.25
    this.modEnv.sustain = 0.0; this.modEnv.release = 0.1
    this.slideRate = 1 - Math.exp(-1 / (0.060 * sr))
  }

  noteOn(n: number, v: number) {
    this.freq = midiToHz(n); this.targetFreq = this.freq
    this.vel = v; this.note = n
    this.oscA.reset(); this.oscB.reset()
    for (let i = 0; i < this.uniOscA.length; i++) {
      this.uniOscA[i].reset(); this.uniOscB[i].reset()
    }
    this.ampEnv.noteOn(); this.modEnv.noteOn()
  }

  noteOff() { this.ampEnv.noteOff(); this.modEnv.noteOff() }

  slideNoteTo(n: number, v: number) {
    this.targetFreq = midiToHz(n)
    this.vel = v; this.note = n
    this.modEnv.noteOn()
  }

  reset() {
    this.ampEnv.reset(); this.modEnv.reset()
    this.filter.reset(); this.lfo1.reset(); this.lfo2.reset()
    this.oscA.reset(); this.oscB.reset()
    for (let i = 0; i < this.uniOscA.length; i++) {
      this.uniOscA[i].reset(); this.uniOscB[i].reset()
    }
    this.freq = this.targetFreq = 220
  }

  /** Render one osc pair at given frequency, returns mono sample */
  private _renderPair(
    oA: WavetableOsc, oB: WavetableOsc,
    freqA: number, freqB: number,
    wtPosMod: number, effectiveFmIndex: number, menv: number,
  ): number {
    oA.position = Math.max(0, Math.min(1, this.oscAPos + wtPosMod * 0.5))
    oB.position = Math.max(0, Math.min(1, this.oscBPos + wtPosMod * 0.5))
    switch (this.combineMode) {
      case OscCombine.FM: {
        const m = oB.tick(freqB) * effectiveFmIndex * menv
        return oA.tick(freqA * (1 + m))
      }
      case OscCombine.Ring:
        return oA.tick(freqA) * oB.tick(freqB)
      default: {
        const a = oA.tick(freqA)
        const b = oB.tick(freqB)
        return a * (1 - this.oscMix) + b * this.oscMix
      }
    }
  }

  tick(): number {
    if (this.ampEnv.isIdle()) return 0
    if (this.unisonVoices > 1) {
      // Stereo path — sum L+R for mono
      const L = this._stereoOut[0], R = this._stereoOut[1]
      this._tickInner(this._stereoOut)
      return (L + R) * 0.5
    }
    return this._tickMono()
  }

  private _stereoOut = new Float32Array(2)

  /** Mono path — no unison overhead */
  private _tickMono(): number {
    this.freq += (this.targetFreq - this.freq) * this.slideRate

    const aenv = this.ampEnv.tick()
    const menv = this.modEnv.tick()
    const l1 = this.lfo1.tick()
    const l2 = this.lfo2.tick()

    const mod = this.modMatrix.process(l1, l2, menv, this.vel, this.note)
    const pitchMod = mod[ModDst.Pitch]
    const wtPosMod = mod[ModDst.WTPos]
    const cutMod   = mod[ModDst.Cutoff]
    const resoMod  = mod[ModDst.Resonance]
    const fmMod    = mod[ModDst.FMIndex]
    const volMod   = mod[ModDst.Volume]

    const pitchMultiplier = Math.pow(2, pitchMod * 12 / 12)
    const freqA = this.freq * pitchMultiplier
    const detuneRatio = Math.pow(2, this.oscBSemi / 12 + this.oscBDetune / 1200)
    const freqB = this.freq * detuneRatio * pitchMultiplier
    const effectiveFmIndex = Math.max(0, this.fmIndex + fmMod * 4)

    let sig = this._renderPair(this.oscA, this.oscB, freqA, freqB, wtPosMod, effectiveFmIndex, menv)

    // Filter
    const fc = Math.min(
      Math.max(20, this.cutoffBase + this.envMod * menv + cutMod * 4000),
      this.sr * 0.45
    )
    const reso = Math.max(0.5, this.resonance + resoMod * 3)
    this.filter.setParams(fc, reso)
    sig = this.filter.process(sig)

    // Drive
    if (this.drive > 0) {
      const amt = 1 + this.drive * 4
      sig = Math.tanh(sig * amt) / Math.tanh(amt)
    }

    const vol = Math.max(0, 0.65 + volMod * 0.3)
    const out = sig * aenv * this.vel * vol
    if (out !== out) { this.filter.reset(); return 0 }
    return out
  }

  /** Stereo path — writes [L, R] into out */
  _tickInner(out: Float32Array) {
    if (this.ampEnv.isIdle()) { out[0] = 0; out[1] = 0; return }

    this.freq += (this.targetFreq - this.freq) * this.slideRate

    const aenv = this.ampEnv.tick()
    const menv = this.modEnv.tick()
    const l1 = this.lfo1.tick()
    const l2 = this.lfo2.tick()

    const mod = this.modMatrix.process(l1, l2, menv, this.vel, this.note)
    const pitchMod = mod[ModDst.Pitch]
    const wtPosMod = mod[ModDst.WTPos]
    const cutMod   = mod[ModDst.Cutoff]
    const resoMod  = mod[ModDst.Resonance]
    const fmMod    = mod[ModDst.FMIndex]
    const volMod   = mod[ModDst.Volume]

    const pitchMultiplier = Math.pow(2, pitchMod * 12 / 12)
    const baseFreqA = this.freq * pitchMultiplier
    const detuneRatio = Math.pow(2, this.oscBSemi / 12 + this.oscBDetune / 1200)
    const baseFreqB = this.freq * detuneRatio * pitchMultiplier
    const effectiveFmIndex = Math.max(0, this.fmIndex + fmMod * 4)

    const n = this.unisonVoices
    const gain = 1 / n  // normalize by voice count
    let sumL = 0, sumR = 0

    // Center voice (index 0)
    const center = this._renderPair(this.oscA, this.oscB, baseFreqA, baseFreqB, wtPosMod, effectiveFmIndex, menv)
    sumL += center; sumR += center

    // Side voices (pairs: ±detune, ±pan)
    const pairs = (n - 1) >> 1  // e.g. n=5 → 2 pairs
    for (let p = 0; p < pairs; p++) {
      const pairNum = p + 1
      const detuneCents = this.unisonSpread * 50 * pairNum / pairs  // max ~50 cents at outer pair
      const detuneMultiplier = Math.pow(2, detuneCents / 1200)
      const pan = this.unisonWidth * pairNum / pairs  // 0..width

      const idxPos = p * 2      // positive-detune side voice
      const idxNeg = p * 2 + 1  // negative-detune side voice

      // Positive detune → pan right
      const sigPos = this._renderPair(
        this.uniOscA[idxPos], this.uniOscB[idxPos],
        baseFreqA * detuneMultiplier, baseFreqB * detuneMultiplier,
        wtPosMod, effectiveFmIndex, menv,
      )
      sumL += sigPos * (1 - pan); sumR += sigPos * (1 + pan)

      // Negative detune → pan left
      const sigNeg = this._renderPair(
        this.uniOscA[idxNeg], this.uniOscB[idxNeg],
        baseFreqA / detuneMultiplier, baseFreqB / detuneMultiplier,
        wtPosMod, effectiveFmIndex, menv,
      )
      sumL += sigNeg * (1 + pan); sumR += sigNeg * (1 - pan)
    }

    let sigL = sumL * gain * 0.5
    let sigR = sumR * gain * 0.5

    // Filter (shared, applied to L and R)
    const fc = Math.min(
      Math.max(20, this.cutoffBase + this.envMod * menv + cutMod * 4000),
      this.sr * 0.45
    )
    const reso = Math.max(0.5, this.resonance + resoMod * 3)
    this.filter.setParams(fc, reso)
    // Apply filter to mono sum for consistency (stereo filter would need 2 SVFs)
    const sigM = this.filter.process((sigL + sigR) * 0.5)
    // Preserve stereo image: add back the difference
    const diff = (sigL - sigR) * 0.5
    sigL = sigM + diff; sigR = sigM - diff

    // Drive
    if (this.drive > 0) {
      const amt = 1 + this.drive * 4
      const tanhAmt = Math.tanh(amt)
      sigL = Math.tanh(sigL * amt) / tanhAmt
      sigR = Math.tanh(sigR * amt) / tanhAmt
    }

    const vol = Math.max(0, 0.65 + volMod * 0.3)
    out[0] = sigL * aenv * this.vel * vol
    out[1] = sigR * aenv * this.vel * vol
    if (out[0] !== out[0] || out[1] !== out[1]) { this.filter.reset(); out[0] = 0; out[1] = 0 }
  }

  /** Stereo tick — writes [L, R] into out */
  tickStereo(out: Float32Array) {
    if (this.unisonVoices <= 1) {
      const mono = this._tickMono()
      out[0] = mono; out[1] = mono
    } else {
      this._tickInner(out)
    }
  }
}

/** iDEATH synth — mono/poly switchable via polyMode param. */
export class IdeathSynth implements Voice {
  private cores: IdeathCore[]
  private polyMode = false
  private nextVoice = 0
  private activeNotes = new Int8Array(4).fill(-1)
  private _stereoTmp = new Float32Array(2)

  constructor(sr: number) {
    this.cores = Array.from({ length: 4 }, () => new IdeathCore(sr))
  }

  noteOn(note: number, v: number) {
    if (!this.polyMode) {
      this.cores[0].noteOn(note, v)
      return
    }
    // Poly: check retrigger
    for (let i = 0; i < 4; i++) {
      if (this.activeNotes[i] === note) {
        this.cores[i].noteOn(note, v)
        return
      }
    }
    const idx = this.nextVoice
    this.nextVoice = (this.nextVoice + 1) & 3
    this.activeNotes[idx] = note
    this.cores[idx].noteOn(note, v)
  }

  noteOff() {
    if (!this.polyMode) {
      this.cores[0].noteOff()
      return
    }
    for (let i = 0; i < 4; i++) {
      this.cores[i].noteOff()
      this.activeNotes[i] = -1
    }
  }

  slideNote(note: number, v: number) {
    if (!this.polyMode) {
      this.cores[0].slideNoteTo(note, v)
      return
    }
    const prev = (this.nextVoice - 1 + 4) & 3
    this.cores[prev].slideNoteTo(note, v)
    this.activeNotes[prev] = note
  }

  reset() {
    for (let i = 0; i < 4; i++) { this.cores[i].reset(); this.activeNotes[i] = -1 }
    this.nextVoice = 0
  }

  tick(): number {
    if (!this.polyMode) return this.cores[0].tick()
    let sum = 0
    for (let i = 0; i < 4; i++) sum += this.cores[i].tick()
    return sum * 0.5
  }

  tickStereo(out: Float32Array) {
    if (!this.polyMode) {
      this.cores[0].tickStereo(out)
      return
    }
    let sumL = 0, sumR = 0
    for (let i = 0; i < 4; i++) {
      this.cores[i].tickStereo(this._stereoTmp)
      sumL += this._stereoTmp[0]; sumR += this._stereoTmp[1]
    }
    out[0] = sumL * 0.5; out[1] = sumR * 0.5
  }

  setParam(key: string, value: number) {
    if (key === 'polyMode') {
      this.polyMode = value >= 0.5
      if (!this.polyMode) {
        // Switching to mono: silence poly voices
        for (let i = 1; i < 4; i++) { this.cores[i].noteOff(); this.activeNotes[i] = -1 }
      }
      return
    }
    // Cap unison in poly mode (ADR 063 mitigation)
    if (key === 'unisonVoices' && this.polyMode) value = Math.min(value, 3)
    // Apply param to all 4 cores (so poly mode works immediately when toggled)
    const n = 4
    for (let i = 0; i < n; i++) {
      const c = this.cores[i]
      switch (key) {
        case 'oscAPos':      c.oscAPos = value; break
        case 'oscBPos':      c.oscBPos = value; break
        case 'oscBSemi':     c.oscBSemi = value; break
        case 'oscBDetune':   c.oscBDetune = value; break
        case 'oscMix':       c.oscMix = value; break
        case 'combine':      c.combineMode = Math.round(value) as OscCombine; break
        case 'fmIndex':      c.fmIndex = value; break
        case 'cutoffBase':   c.cutoffBase = value; break
        case 'envMod':       c.envMod = value; break
        case 'resonance':    c.resonance = value; break
        case 'filterMode':   c.filter.mode = Math.round(value) as SVFMode; break
        case 'drive':        c.drive = value; break
        case 'unisonVoices': c.unisonVoices = Math.round(value) | 1; break
        case 'unisonSpread': c.unisonSpread = value; break
        case 'unisonWidth':  c.unisonWidth = value; break
        case 'attack':       c.ampEnv.attack = value; break
        case 'decay':        c.ampEnv.decay = value; break
        case 'sustain':      c.ampEnv.sustain = value; break
        case 'release':      c.ampEnv.release = value; break
        case 'modAttack':    c.modEnv.attack = value; break
        case 'modDecay':     c.modEnv.decay = value; break
        case 'lfo1Rate':     c.lfo1.rate = value; break
        case 'lfo1Shape':    c.lfo1.shape = Math.round(value) as LFOShape; break
        case 'lfo1Sync':     c.lfo1.sync = value >= 0.5; break
        case 'lfo1Div':      c.lfo1.divIndex = Math.round(value); break
        case 'lfo2Rate':     c.lfo2.rate = value; break
        case 'lfo2Shape':    c.lfo2.shape = Math.round(value) as LFOShape; break
        case 'bpm':          c.lfo1.bpm = value; c.lfo2.bpm = value; break
        default:
          if (key.startsWith('mod') && key.length >= 5) {
            const idx = parseInt(key[3])
            const field = key.slice(4)
            if (!isNaN(idx) && idx < 8) {
              const mm = c.modMatrix
              while (mm.slots.length <= idx) mm.slots.push({ src: 0 as ModSrc, dst: 0 as ModDst, amount: 0 })
              const s = mm.slots[idx]
              switch (field) {
                case 'Src': s.src = Math.round(value) as ModSrc; break
                case 'Dst': s.dst = Math.round(value) as ModDst; break
                case 'Amt': s.amount = value; break
              }
            }
          }
      }
    }
  }
}

// ── Voice registry (ADR 009) ────────────────────────────────────────

export type VoiceId =
  | 'Kick' | 'Snare' | 'Clap' | 'Hat' | 'OpenHat' | 'Cymbal'
  | 'Bass303' | 'MoogLead' | 'Analog' | 'FM'
  | 'iDEATH'

const VOICE_REGISTRY: Record<string, (sr: number) => Voice> = {
  Kick:     sr => new KickVoice(sr),
  Snare:    sr => new SnareVoice(sr),
  Clap:     sr => new ClapVoice(sr),
  Hat:      sr => new HatVoice(sr),
  OpenHat:  sr => new OpenHatVoice(sr),
  Cymbal:   sr => new CymbalVoice(sr),
  Bass303:  sr => new TB303Voice(sr),
  MoogLead: sr => new MoogVoice(sr),
  Analog:   sr => new AnalogVoice(sr),
  FM:       sr => new FMVoice(sr),
  iDEATH:      sr => new IdeathSynth(sr),
}

export const DRUM_VOICES: ReadonlySet<string> = new Set([
  'Kick', 'Snare', 'Clap', 'Hat', 'OpenHat', 'Cymbal',
])

export type VoiceCategory = 'drum' | 'bass' | 'lead'

export interface VoiceMeta {
  id: VoiceId
  label: string
  category: VoiceCategory
  sidechainSource?: boolean  // true = triggers sidechain ducker & bypasses ducking (ADR 064)
}

export const VOICE_LIST: VoiceMeta[] = [
  { id: 'Kick',     label: 'KICK',  category: 'drum', sidechainSource: true },
  { id: 'Snare',    label: 'SNARE', category: 'drum' },
  { id: 'Clap',     label: 'CLAP',  category: 'drum' },
  { id: 'Hat',      label: 'C.HH',  category: 'drum' },
  { id: 'OpenHat',  label: 'O.HH',  category: 'drum' },
  { id: 'Cymbal',   label: 'CYM',   category: 'drum' },
  { id: 'Bass303',  label: '303',   category: 'bass' },
  { id: 'Analog',   label: 'ANA',   category: 'bass' },
  { id: 'MoogLead', label: 'MOOG',  category: 'lead' },
  { id: 'FM',       label: 'FM',    category: 'lead' },
  { id: 'iDEATH',      label: 'SYNTH', category: 'lead' },
]

/** Lookup sidechainSource flag by voiceId (ADR 064) */
const _scSourceMap = new Map(VOICE_LIST.map(v => [v.id as string, v.sidechainSource === true]))
export function isSidechainSource(voiceId: string): boolean {
  return _scSourceMap.get(voiceId) ?? false
}

export function makeVoice(_trackIdx: number, voiceId: string, sr: number): Voice {
  const factory = VOICE_REGISTRY[voiceId]
  return factory ? factory(sr) : new AnalogVoice(sr)
}
