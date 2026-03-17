/**
 * Unified Drum Machine (ADR 010) — configurable presets for all drum voices.
 */
import { ResonantLP, BiquadHP, SVFilter, SVFMode } from './filters.ts'
import type { Voice } from './voice-common.ts'

// ── Drum Presets ─────────────────────────────────────────────────────

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

// ── DrumMachine ──────────────────────────────────────────────────────

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
