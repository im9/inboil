/**
 * Synth voices: TR-909 drums, TB-303 acid bass, Moog lead, FM.
 */
import { ResonantLP, BiquadHP, ADSR } from './filters.ts'

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

export interface Voice {
  noteOn(note: number, velocity: number): void
  tick(): number
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

/** Crash cymbal: TR-909 style — wider ratios, onset body burst. */
export class CymbalVoice implements Voice {
  private vel = 1; private t = 0; private playing = false
  private seed = 66666
  private hp = new BiquadHP()
  private bodyPhase = 0
  private phases = [0, 0, 0, 0, 0, 0]
  private readonly ratios = [1.0, 1.347, 1.732, 2.069, 2.414, 3.137]
  private baseFreq = 500; private hpCutoff = 2500
  private volume = 0.55; private decay = 0.35
  constructor(private sr: number) {
    this.hp.setParams(this.hpCutoff, 0.5, sr)
  }
  noteOn(_n: number, v: number) {
    this.vel = v; this.t = 0; this.playing = true
    this.bodyPhase = 0; this.hp.reset()
  }
  reset() {
    this.t = 0; this.playing = false; this.bodyPhase = 0
    this.hp.reset(); this.phases.fill(0)
  }
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
    sig += ((this.seed >>> 16) / 32768 - 1) * 0.35
    const hp = this.hp.process(sig)
    let body = 0
    if (ts < 0.030) {
      this.bodyPhase += 500 / this.sr
      if (this.bodyPhase >= 1) this.bodyPhase -= 1
      body = Math.sin(this.bodyPhase * 2 * Math.PI) * Math.exp(-ts / 0.008) * 0.4
    }
    this.t++
    return (hp * amp + body) * this.vel * this.volume
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'decay':    this.decay    = value; break
      case 'baseFreq': this.baseFreq = value; break
      case 'hpCutoff':
        this.hpCutoff = value
        this.hp.setParams(value, 0.5, this.sr)
        break
      case 'volume':   this.volume   = value; break
    }
  }
}

// ── Melodic voices ──────────────────────────────────────────────────

/** TB-303 acid bass — saw → drive → resonant LP (Q=7) → ADSR. */
export class TB303Voice implements Voice {
  private phase = 0; private freq = 110; private vel = 1
  private env = new ADSR(); private filter = new ResonantLP()
  private cutoffBase = 200; private envMod = 4000; private resonance = 7.0; private drive = 1.6
  constructor(private sr: number) {
    this.env.setSampleRate(sr)
    this.env.attack = 0.002; this.env.decay = 0.18; this.env.sustain = 0.0; this.env.release = 0.10
  }
  noteOn(note: number, v: number) { this.freq = midiToHz(note); this.vel = v; this.env.noteOn() }
  reset() { this.env.reset(); this.filter.reset(); this.phase = 0 }
  tick(): number {
    if (this.env.isIdle()) return 0
    const env = this.env.tick()
    this.phase += this.freq / this.sr
    if (this.phase >= 1) this.phase -= 1
    const driven = Math.tanh((this.phase * 2 - 1) * this.drive)
    this.filter.setParams(this.cutoffBase + this.envMod * env * env, this.resonance, this.sr)
    return this.filter.process(driven) * env * this.vel * 0.75
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'cutoffBase': this.cutoffBase = value; break
      case 'envMod':     this.envMod     = value; break
      case 'resonance':  this.resonance  = value; break
      case 'decay':      this.env.decay  = value; break
      case 'drive':      this.drive      = value; break
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

/** Moog-style 4-pole analog lead — two detuned saws → cascaded biquads. */
export class MoogVoice implements Voice {
  private phase1 = 0; private phase2 = 0; private freq = 220; private vel = 1
  private env = new ADSR()
  private f1 = new ResonantLP(); private f2 = new ResonantLP()
  private cutoffBase = 400; private envMod = 5500; private resonance = 1.8; private detune = 1.0029
  constructor(private sr: number) {
    this.env.setSampleRate(sr)
    this.env.attack = 0.012; this.env.decay = 0.35; this.env.sustain = 0.45; this.env.release = 0.4
  }
  noteOn(note: number, v: number) { this.freq = midiToHz(note); this.vel = v; this.env.noteOn() }
  reset() { this.env.reset(); this.f1.reset(); this.f2.reset(); this.phase1 = this.phase2 = 0 }
  tick(): number {
    if (this.env.isIdle()) return 0
    const env = this.env.tick()
    this.phase1 += this.freq / this.sr
    this.phase2 += (this.freq * this.detune) / this.sr
    if (this.phase1 >= 1) this.phase1 -= 1
    if (this.phase2 >= 1) this.phase2 -= 1
    const saw = ((this.phase1 * 2 - 1) + (this.phase2 * 2 - 1)) * 0.5
    const driven = Math.tanh(saw * 1.5)
    const fc = Math.min(this.cutoffBase + this.envMod * env, this.sr * 0.4)
    this.f1.setParams(fc, this.resonance, this.sr)
    this.f2.setParams(fc, this.resonance, this.sr)
    return this.f2.process(Math.tanh(this.f1.process(driven) * 1.2)) * env * this.vel * 0.65
  }
  setParam(key: string, value: number) {
    switch (key) {
      case 'cutoffBase': this.cutoffBase = value; break
      case 'envMod':     this.envMod     = value; break
      case 'resonance':  this.resonance  = value; break
      case 'decay':      this.env.decay  = value; break
      case 'detune':     this.detune     = value; break
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

// ── Voice factory ───────────────────────────────────────────────────

export function makeVoice(trackIdx: number, synthType: string, sr: number): Voice {
  if (trackIdx === 0) return new KickVoice(sr)
  if (trackIdx === 1) return new SnareVoice(sr)
  if (trackIdx === 2) return new ClapVoice(sr)
  if (trackIdx === 3) return new HatVoice(sr)
  if (trackIdx === 4) return new OpenHatVoice(sr)
  if (trackIdx === 5) return new CymbalVoice(sr)
  if (trackIdx === 6) return new TB303Voice(sr)
  if (trackIdx === 7) return new MoogVoice(sr)
  switch (synthType) {
    case 'NoiseSynth':  return new HatVoice(sr)
    case 'AnalogSynth': return new AnalogVoice(sr)
    case 'FMSynth':     return new FMVoice(sr)
    default:            return new AnalogVoice(sr)
  }
}
