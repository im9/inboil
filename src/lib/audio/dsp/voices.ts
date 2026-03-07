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

// ── Unified Drum Machine (ADR 010) ──────────────────────────────────

interface DrumPreset {
  toneLevel: number; pitchStart: number; pitchEnd: number; pitchDecay: number
  noiseLevel: number; noiseFilterFreq: number; noiseFilterQ: number; noiseFilterMode: number // 0=LP 1=HP 2=BP
  metalLevel: number; metalFreq: number
  decay: number; drive: number; hpFreq: number; click: number
  burstCount: number; burstGap: number
}

export const DRUM_PRESETS: Record<string, DrumPreset> = {
  Kick:    { toneLevel: 1.0, pitchStart: 340, pitchEnd: 55,  pitchDecay: 0.035, noiseLevel: 0,    noiseFilterFreq: 3000, noiseFilterQ: 1.0, noiseFilterMode: 0, metalLevel: 0,   metalFreq: 800, decay: 0.35, drive: 1.4,  hpFreq: 20,   click: 0.6,  burstCount: 1, burstGap: 0.015 },
  Kick808: { toneLevel: 1.0, pitchStart: 120, pitchEnd: 45,  pitchDecay: 0.06,  noiseLevel: 0,    noiseFilterFreq: 3000, noiseFilterQ: 1.0, noiseFilterMode: 0, metalLevel: 0,   metalFreq: 800, decay: 0.8,  drive: 0.6,  hpFreq: 20,   click: 0.3,  burstCount: 1, burstGap: 0.015 },
  Snare:   { toneLevel: 0.2, pitchStart: 185, pitchEnd: 185, pitchDecay: 0.008, noiseLevel: 0.85, noiseFilterFreq: 3000, noiseFilterQ: 3.5, noiseFilterMode: 0, metalLevel: 0,   metalFreq: 800, decay: 0.08, drive: 0,    hpFreq: 20,   click: 0,    burstCount: 1, burstGap: 0.015 },
  Clap:    { toneLevel: 0,   pitchStart: 200, pitchEnd: 200, pitchDecay: 0.01,  noiseLevel: 1.0,  noiseFilterFreq: 1200, noiseFilterQ: 2.0, noiseFilterMode: 0, metalLevel: 0,   metalFreq: 800, decay: 0.18, drive: 0,    hpFreq: 20,   click: 0,    burstCount: 4, burstGap: 0.015 },
  Hat:     { toneLevel: 0,   pitchStart: 200, pitchEnd: 200, pitchDecay: 0.01,  noiseLevel: 0.25, noiseFilterFreq: 8000, noiseFilterQ: 1.0, noiseFilterMode: 1, metalLevel: 0.8, metalFreq: 800, decay: 0.04, drive: 0,    hpFreq: 5000, click: 0,    burstCount: 1, burstGap: 0.015 },
  OpenHat: { toneLevel: 0,   pitchStart: 200, pitchEnd: 200, pitchDecay: 0.01,  noiseLevel: 0.25, noiseFilterFreq: 8000, noiseFilterQ: 1.0, noiseFilterMode: 1, metalLevel: 0.8, metalFreq: 800, decay: 0.18, drive: 0,    hpFreq: 4500, click: 0,    burstCount: 1, burstGap: 0.015 },
  Cymbal:  { toneLevel: 0,   pitchStart: 200, pitchEnd: 200, pitchDecay: 0.01,  noiseLevel: 0.7,  noiseFilterFreq: 7500, noiseFilterQ: 2.0, noiseFilterMode: 2, metalLevel: 0.3, metalFreq: 800, decay: 0.35, drive: 0,    hpFreq: 2500, click: 0,    burstCount: 1, burstGap: 0.015 },
  Cowbell: { toneLevel: 0,   pitchStart: 200, pitchEnd: 200, pitchDecay: 0.01,  noiseLevel: 0,    noiseFilterFreq: 3000, noiseFilterQ: 1.0, noiseFilterMode: 0, metalLevel: 1.0, metalFreq: 587, decay: 0.08, drive: 0.3,  hpFreq: 500,  click: 0,    burstCount: 1, burstGap: 0.015 },
  Tom:     { toneLevel: 1.0, pitchStart: 300, pitchEnd: 120, pitchDecay: 0.04,  noiseLevel: 0,    noiseFilterFreq: 3000, noiseFilterQ: 1.0, noiseFilterMode: 0, metalLevel: 0,   metalFreq: 800, decay: 0.15, drive: 0.5,  hpFreq: 20,   click: 0.2,  burstCount: 1, burstGap: 0.015 },
  Rimshot: { toneLevel: 0.7, pitchStart: 800, pitchEnd: 800, pitchDecay: 0.003, noiseLevel: 0.5,  noiseFilterFreq: 4000, noiseFilterQ: 1.5, noiseFilterMode: 0, metalLevel: 0,   metalFreq: 800, decay: 0.03, drive: 0.8,  hpFreq: 200,  click: 0.8,  burstCount: 1, burstGap: 0.015 },
  Shaker:  { toneLevel: 0,   pitchStart: 200, pitchEnd: 200, pitchDecay: 0.01,  noiseLevel: 1.0,  noiseFilterFreq: 5000, noiseFilterQ: 2.5, noiseFilterMode: 2, metalLevel: 0,   metalFreq: 800, decay: 0.06, drive: 0,    hpFreq: 2000, click: 0,    burstCount: 1, burstGap: 0.015 },
}

export class DrumMachine implements Voice {
  private t = 0; private vel = 1; private playing = false
  private seed = 31337
  private tonePhase = 0
  private noiseLp = new ResonantLP()
  private noiseHp = new BiquadHP()
  private noiseBp: SVFilter
  private outHp = new BiquadHP()

  // Metal section: 6 detuned square-wave oscillators (TR-909 hat topology)
  private metalPhases = [0, 0, 0, 0, 0, 0]
  private readonly metalRatios = [1.0, 1.283, 1.800, 2.104, 2.587, 2.870]

  // Params (set from preset, tweakable via setParam)
  private toneLevel: number
  private pitchStart: number; private pitchEnd: number; private pitchDecay: number
  private noiseLevel: number; private noiseFilterFreq: number
  private noiseFilterQ: number; private noiseFilterMode: number
  private metalLevel: number; private metalFreq: number
  private decay: number; private drive: number; private hpFreq: number
  private click: number; private burstCount: number; private burstGap: number

  constructor(private sr: number, preset: string) {
    this.noiseBp = new SVFilter(sr)
    this.noiseBp.mode = SVFMode.BP
    const p = DRUM_PRESETS[preset] ?? DRUM_PRESETS.Kick!
    this.toneLevel = p.toneLevel; this.pitchStart = p.pitchStart
    this.pitchEnd = p.pitchEnd; this.pitchDecay = p.pitchDecay
    this.noiseLevel = p.noiseLevel; this.noiseFilterFreq = p.noiseFilterFreq
    this.noiseFilterQ = p.noiseFilterQ; this.noiseFilterMode = p.noiseFilterMode
    this.metalLevel = p.metalLevel; this.metalFreq = p.metalFreq
    this.decay = p.decay; this.drive = p.drive; this.hpFreq = p.hpFreq
    this.click = p.click; this.burstCount = p.burstCount; this.burstGap = p.burstGap
    this._updateFilters()
  }

  private _updateFilters() {
    this.noiseLp.setParams(this.noiseFilterFreq, this.noiseFilterQ, this.sr)
    this.noiseHp.setParams(this.noiseFilterFreq, Math.min(this.noiseFilterQ, 2.0), this.sr)
    this.noiseBp.setParams(this.noiseFilterFreq, this.noiseFilterQ)
    this.outHp.setParams(this.hpFreq, 0.7, this.sr)
  }

  noteOn(_n: number, v: number) {
    this.vel = v; this.t = 0; this.tonePhase = 0; this.playing = true
    this.metalPhases.fill(0)
    this.noiseLp.reset(); this.noiseHp.reset(); this.noiseBp.reset(); this.outHp.reset()
  }
  noteOff() {}
  slideNote(n: number, v: number) { this.noteOn(n, v) }
  reset() {
    this.t = 0; this.tonePhase = 0; this.playing = false
    this.metalPhases.fill(0)
    this.noiseLp.reset(); this.noiseHp.reset(); this.noiseBp.reset(); this.outHp.reset()
  }

  tick(): number {
    if (!this.playing) return 0
    const ts = this.t / this.sr

    // ── Amplitude envelope ──
    const amp = Math.exp(-ts / this.decay)
    if (amp < 0.001) { this.playing = false; return 0 }

    // ── Burst gate (for clap-style sounds) ──
    let burstGate = 1.0
    if (this.burstCount > 1) {
      const burstEnd = this.burstGap * this.burstCount
      if (ts < burstEnd) {
        const local = ts % this.burstGap
        if (local < 0.002) {
          const attack = Math.min(local / 0.0003, 1.0)
          burstGate = (1.0 - local / 0.002) * attack
        } else {
          burstGate = 0
        }
      } else {
        // After bursts: tail only
        const tailStart = burstEnd * 0.7
        burstGate = ts > tailStart ? Math.exp(-(ts - tailStart) / this.decay) * 0.8 : 0
      }
    }

    // ── Tone section (sine osc + pitch sweep) ──
    let tone = 0
    if (this.toneLevel > 0) {
      const freq = this.pitchEnd + (this.pitchStart - this.pitchEnd) * Math.exp(-ts / this.pitchDecay)
      this.tonePhase += freq / this.sr
      if (this.tonePhase >= 1) this.tonePhase -= 1
      tone = Math.sin(this.tonePhase * 2 * Math.PI) * this.toneLevel
    }

    // ── Click transient ──
    let clickSig = 0
    if (this.click > 0 && ts < 0.003) {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0
      clickSig = ((this.seed >>> 16) / 32768 - 1) * Math.exp(-ts / 0.0006) * this.click
    }

    // ── Noise section ──
    let noise = 0
    if (this.noiseLevel > 0 || this.click > 0) {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0
      const raw = (this.seed >>> 16) / 32768 - 1
      let filtered: number
      if (this.noiseFilterMode === 1) {
        filtered = this.noiseHp.process(raw)
      } else if (this.noiseFilterMode === 2) {
        filtered = this.noiseBp.process(raw)
      } else {
        filtered = this.noiseLp.process(raw)
      }
      noise = filtered * this.noiseLevel
    }

    // ── Metal section (6 detuned square-wave oscillators) ──
    let metal = 0
    if (this.metalLevel > 0) {
      for (let i = 0; i < 6; i++) {
        this.metalPhases[i] += (this.metalFreq * this.metalRatios[i]) / this.sr
        if (this.metalPhases[i] >= 1) this.metalPhases[i] -= 1
        metal += this.metalPhases[i] < 0.5 ? 1 : -1
      }
      metal = metal / 6 * this.metalLevel
    }

    // ── Mix + output processing ──
    let sig = (tone + clickSig + noise + metal) * (this.burstCount > 1 ? burstGate : amp)

    // Snare-style dual VCA: tone has separate faster decay for body punch
    if (this.toneLevel > 0 && this.noiseLevel > 0 && this.burstCount <= 1) {
      const toneAmp = Math.exp(-ts / Math.min(this.decay, 0.08))
      const noiseAmp = amp
      sig = tone * toneAmp + clickSig * amp + (noise + metal) * noiseAmp
    }

    // Output HP (removes low-end for hats/cymbals)
    if (this.hpFreq > 30) sig = this.outHp.process(sig)

    // Drive
    if (this.drive > 0) sig = Math.tanh(sig * (1 + this.drive * 2))

    this.t++
    return sig * this.vel * 1.2
  }

  setParam(key: string, value: number) {
    switch (key) {
      case 'toneLevel':       this.toneLevel       = value; break
      case 'pitchStart':      this.pitchStart      = value; break
      case 'pitchEnd':        this.pitchEnd        = value; break
      case 'pitchDecay':      this.pitchDecay      = value; break
      case 'noiseLevel':      this.noiseLevel      = value; break
      case 'noiseFilterFreq':
        this.noiseFilterFreq = value; this._updateFilters(); break
      case 'noiseFilterQ':
        this.noiseFilterQ = value; this._updateFilters(); break
      case 'noiseFilterMode':
        this.noiseFilterMode = Math.round(value); this._updateFilters(); break
      case 'metalLevel':      this.metalLevel      = value; break
      case 'metalFreq':       this.metalFreq       = value; break
      case 'decay':           this.decay           = value; break
      case 'drive':           this.drive           = value; break
      case 'hpFreq':
        this.hpFreq = value; this.outHp.setParams(value, 0.7, this.sr); break
      case 'click':           this.click           = value; break
      case 'burstCount':      this.burstCount      = Math.round(value); break
      case 'burstGap':        this.burstGap        = value; break
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

// ── Sampler Voice (ADR 012) ─────────────────────────────────────────

export class SamplerVoice implements Voice {
  private buffer: Float32Array | null = null
  private bufferSR = 44100
  private cursor = 0
  private rate = 1.0
  private playing = false
  private amp = 0
  private ampTarget = 0
  private ampCoeff = 0
  private releaseCoeff = 0

  // params
  private rootNote = 60  // C4
  private start = 0      // 0.0–1.0
  private end = 1        // 0.0–1.0
  private decay = 1.0    // seconds — FWD: envelope decay, REV: swell length
  private reverse = 0    // 0 or 1
  private pitchShift = 0 // semitones

  private readonly sr: number

  constructor(sr: number) {
    this.sr = sr
    this._updateEnvCoeffs()
  }

  loadSample(buffer: Float32Array, bufferSR: number): void {
    // Peak-normalize to 1.0
    let peak = 0
    for (let i = 0; i < buffer.length; i++) {
      const a = Math.abs(buffer[i])
      if (a > peak) peak = a
    }
    if (peak > 0 && peak !== 1) {
      const scale = 1 / peak
      for (let i = 0; i < buffer.length; i++) buffer[i] *= scale
    }
    this.buffer = buffer
    this.bufferSR = bufferSR
  }

  noteOn(note: number, velocity: number): void {
    if (!this.buffer) return
    const semis = (note - this.rootNote) + this.pitchShift
    this.rate = Math.pow(2, semis / 12) * (this.bufferSR / this.sr)
    const startSample = Math.floor(this.start * this.buffer.length)
    const endSample = Math.floor(this.end * this.buffer.length)
    this.cursor = this.reverse ? endSample - 1 : startSample
    this.amp = velocity
    this.ampTarget = velocity
    this.playing = true
  }

  noteOff(): void {
    // Drum samples: ignore noteOff — let sample play to end / natural decay
    // (same as DrumMachine behavior)
  }

  slideNote(note: number, _velocity: number): void {
    const semis = (note - this.rootNote) + this.pitchShift
    this.rate = Math.pow(2, semis / 12) * (this.bufferSR / this.sr)
  }

  tick(): number {
    if (!this.playing || !this.buffer) return 0

    const startSample = Math.floor(this.start * this.buffer.length)
    const endSample = Math.floor(this.end * this.buffer.length)

    // Interpolated read
    const idx = Math.floor(this.cursor)
    if (idx < 0 || idx >= this.buffer.length) { this.playing = false; return 0 }
    const frac = this.cursor - idx
    const s0 = this.buffer[idx]
    const s1 = idx + 1 < this.buffer.length ? this.buffer[idx + 1] : s0
    const sample = s0 + (s1 - s0) * frac

    // Advance cursor
    if (this.reverse) {
      this.cursor -= this.rate
      if (this.cursor < startSample) { this.playing = false; return 0 }
    } else {
      this.cursor += this.rate
      if (this.cursor >= endSample) { this.playing = false; return 0 }
    }

    // Amplitude envelope (FWD only — REV uses natural sample crescendo)
    if (!this.reverse) {
      const coeff = this.ampTarget > 0 ? this.ampCoeff : this.releaseCoeff
      this.amp += (this.ampTarget - this.amp) * coeff
      if (this.ampTarget === 0) {
        if (this.amp < 0.001) { this.playing = false; return 0 }
      } else {
        this.ampTarget *= (1 - 1 / (this.decay * this.sr))
      }
    }

    return sample * this.amp * 0.7
  }

  reset(): void {
    this.playing = false
    this.amp = 0
    this.cursor = 0
  }

  setParam(key: string, value: number): void {
    switch (key) {
      case 'rootNote':   this.rootNote = Math.round(value); break
      case 'start':      this.start = Math.max(0, Math.min(1, value)); break
      case 'end':        this.end = Math.max(0, Math.min(1, value)); break
      case 'decay':      this.decay = value; this._updateEnvCoeffs(); break
      case 'reverse':    this.reverse = value >= 0.5 ? 1 : 0; break
      case 'pitchShift': this.pitchShift = value; break
    }
  }

  private _updateEnvCoeffs(): void {
    // One-pole smoothing: coeff ≈ 1 - e^(-1/(time*sr))
    this.ampCoeff = 1 - Math.exp(-1 / (0.005 * this.sr))  // 5ms attack
    this.releaseCoeff = 1 - Math.exp(-1 / (0.01 * this.sr)) // 10ms release
  }
}

// ── Voice registry (ADR 009) ────────────────────────────────────────

export type VoiceId =
  | 'Kick' | 'Kick808' | 'Snare' | 'Clap' | 'Hat' | 'OpenHat' | 'Cymbal'
  | 'Tom' | 'Rimshot' | 'Cowbell' | 'Shaker'
  | 'Bass303' | 'MoogLead' | 'Analog' | 'FM'
  | 'iDEATH'
  | 'Crash' | 'Ride'
  | 'Sampler'

const VOICE_REGISTRY: Record<string, (sr: number) => Voice> = {
  Kick:     sr => new DrumMachine(sr, 'Kick'),
  Kick808:  sr => new DrumMachine(sr, 'Kick808'),
  Snare:    sr => new DrumMachine(sr, 'Snare'),
  Clap:     sr => new DrumMachine(sr, 'Clap'),
  Tom:      sr => new DrumMachine(sr, 'Tom'),
  Rimshot:  sr => new DrumMachine(sr, 'Rimshot'),
  Shaker:   sr => new DrumMachine(sr, 'Shaker'),
  Hat:      sr => new DrumMachine(sr, 'Hat'),
  OpenHat:  sr => new DrumMachine(sr, 'OpenHat'),
  Cymbal:   sr => new DrumMachine(sr, 'Cymbal'),
  Cowbell:  sr => new DrumMachine(sr, 'Cowbell'),
  Bass303:  sr => new TB303Voice(sr),
  MoogLead: sr => new MoogVoice(sr),
  Analog:   sr => new AnalogVoice(sr),
  FM:       sr => new FMVoice(sr),
  iDEATH:      sr => new IdeathSynth(sr),
  Crash: sr => new SamplerVoice(sr),
  Ride:  sr => new SamplerVoice(sr),
  Sampler:     sr => new SamplerVoice(sr),
}

export const DRUM_VOICES: ReadonlySet<string> = new Set([
  'Kick', 'Kick808', 'Snare', 'Clap', 'Hat', 'OpenHat', 'Cymbal',
  'Tom', 'Rimshot', 'Cowbell', 'Shaker',
  'Crash', 'Ride', 'Sampler',
])

export type VoiceCategory = 'drum' | 'bass' | 'lead' | 'sampler'

export interface VoiceMeta {
  id: VoiceId
  label: string
  category: VoiceCategory
  sidechainSource?: boolean  // true = triggers sidechain ducker & bypasses ducking (ADR 064)
}

export const VOICE_LIST: VoiceMeta[] = [
  { id: 'Kick',     label: 'KICK',  category: 'drum', sidechainSource: true },
  { id: 'Kick808',  label: '808K',  category: 'drum', sidechainSource: true },
  { id: 'Snare',    label: 'SNARE', category: 'drum' },
  { id: 'Clap',     label: 'CLAP',  category: 'drum' },
  { id: 'Hat',      label: 'C.HH',  category: 'drum' },
  { id: 'OpenHat',  label: 'O.HH',  category: 'drum' },
  { id: 'Cymbal',   label: 'CYM',   category: 'drum' },
  { id: 'Tom',      label: 'TOM',   category: 'drum' },
  { id: 'Rimshot',  label: 'RIM',   category: 'drum' },
  { id: 'Cowbell',  label: 'BELL',  category: 'drum' },
  { id: 'Shaker',   label: 'SHKR',  category: 'drum' },
  { id: 'Bass303',  label: '303',   category: 'bass' },
  { id: 'Analog',   label: 'ANA',   category: 'bass' },
  { id: 'MoogLead', label: 'MOOG',  category: 'lead' },
  { id: 'FM',       label: 'FM',    category: 'lead' },
  { id: 'iDEATH',      label: 'SYNTH', category: 'lead' },
  { id: 'Crash', label: 'CRSH',  category: 'drum' },
  { id: 'Ride',  label: 'RIDE',  category: 'drum' },
  { id: 'Sampler',     label: 'SMPL',  category: 'sampler' },
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
