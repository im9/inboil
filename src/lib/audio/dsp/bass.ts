/**
 * Bass voices: TB-303 acid bass and Analog subtractive bass.
 */
import { ResonantLP, ADSR } from './filters.ts'
import { midiToHz } from './voice-common.ts'
import type { Voice } from './voice-common.ts'

// ── TB-303 ───────────────────────────────────────────────────────────

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

// ── Analog Bass ──────────────────────────────────────────────────────

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
