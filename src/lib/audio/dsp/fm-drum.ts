/**
 * FM Drum Voice (ADR 111) — 6-machine FM percussion engine.
 *
 * Machines: KICK(0), SNARE(1), METAL(2), PERC(3), TONE(4), CHORD(5)
 * 8 macro params: machine, color, shape, sweep, contour, punch, decay, tone
 */
import { HalfBandDown } from './filters.ts'
import { midiToHz } from './voice-common.ts'
import type { Voice } from './voice-common.ts'

const TAU = Math.PI * 2

// ── Exponential decay envelope ──────────────────────────────────────

class ExpDecay {
  private t = 0
  private rate = 0  // samples to 1/e
  private level = 1.0
  private _active = false

  trigger(decaySec: number, sr: number) {
    this.t = 0
    this.rate = Math.max(1, decaySec * sr)
    this.level = 1.0
    this._active = true
  }

  tick(): number {
    if (!this._active) return 0
    this.level = Math.exp(-this.t / this.rate)
    this.t++
    if (this.level < 0.0005) { this._active = false; return 0 }
    return this.level
  }

  get active() { return this._active }

  reset() {
    this.t = 0; this.level = 0; this._active = false
  }
}

// ── FM Operator ─────────────────────────────────────────────────────

class FMOp {
  phase = 0
  prevOut = 0

  tick(freq: number, srInv: number, modIn: number, feedback: number): number {
    const fb = feedback > 0 ? this.prevOut * feedback : 0
    const out = Math.sin(this.phase * TAU + modIn + fb)
    this.phase += freq * srInv
    // Keep phase bounded to avoid precision loss
    if (this.phase > 1e6) this.phase -= Math.floor(this.phase)
    this.prevOut = out
    return out
  }

  reset() { this.phase = 0; this.prevOut = 0 }
}

// ── Noise generator (LCG) ──────────────────────────────────────────

class NoiseGen {
  private seed = 31337

  tick(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return (this.seed >>> 16) / 32768 - 1
  }

  reset() { this.seed = 31337 }
}

// ── Simple one-pole LP for tone control ─────────────────────────────

class OnePoleLP {
  private y = 0

  process(x: number, coeff: number): number {
    this.y += coeff * (x - this.y)
    return this.y
  }

  reset() { this.y = 0 }
}

// ── FMDrumVoice ─────────────────────────────────────────────────────

export class FMDrumVoice implements Voice {
  private sr2: number       // 2× oversampled rate
  private sr2Inv: number
  private hbd = new HalfBandDown()

  // Operators (up to 3 for METAL, CHORD uses 3 pairs)
  private ops: FMOp[] = [new FMOp(), new FMOp(), new FMOp(), new FMOp(), new FMOp(), new FMOp()]
  private noise = new NoiseGen()
  private toneLp = new OnePoleLP()

  // Envelopes
  private ampEnv = new ExpDecay()
  private modEnv = new ExpDecay()
  private pitchEnv = new ExpDecay()

  // State
  private playing = false
  private vel = 1
  private baseFreq = 110  // note frequency
  private t = 0           // sample counter at sr2
  private _metalLpState = 0  // HP filter state for METAL machine

  // Params (physical units — set via setParam from denormalized values)
  private machine = 0     // 0–5
  private color = 0.5     // mod ratio / timbral brightness
  private shape = 0.5     // FM depth / mod index
  private sweep = 0.5     // pitch envelope depth
  private contour = 0.3   // pitch envelope time
  private punch = 0.5     // attack transient
  private decay = 0.3     // amp decay time (seconds)
  private tone = 0.5      // output filter cutoff (0=dark, 1=bright)

  constructor(sr: number) {
    this.sr2 = sr * 2
    this.sr2Inv = 1 / this.sr2
  }

  noteOn(note: number, velocity: number) {
    this.vel = velocity
    this.baseFreq = this._baseFreqForMachine(note)
    this.playing = true
    this.t = 0

    // Reset operators
    for (const op of this.ops) op.reset()
    this.noise.reset()
    this.toneLp.reset()
    this.hbd.reset()

    // Trigger envelopes based on machine
    const decaySec = this.decay
    this.ampEnv.trigger(decaySec, this.sr2)

    // Mod envelope: faster for transient character
    const modDecay = decaySec * 0.4
    this.modEnv.trigger(Math.max(0.01, modDecay), this.sr2)

    // Pitch envelope
    const pitchTime = 0.003 + this.contour * 0.15  // 3ms to 153ms
    this.pitchEnv.trigger(pitchTime, this.sr2)
  }

  noteOff() {
    // Drums ignore noteOff (decay-based)
  }

  slideNote(note: number, velocity: number) {
    this.noteOn(note, velocity)
  }

  reset() {
    this.playing = false
    this.t = 0
    this.ampEnv.reset()
    this.modEnv.reset()
    this.pitchEnv.reset()
    for (const op of this.ops) op.reset()
    this.noise.reset()
    this.toneLp.reset()
    this.hbd.reset()
    this._metalLpState = 0
  }

  tick(): number {
    if (!this.playing) return 0

    // 2× oversampling
    const s0 = this._tickInner()
    const s1 = this._tickInner()
    const out = this.hbd.process(s0, s1)

    if (!this.ampEnv.active) this.playing = false
    return out
  }

  private _tickInner(): number {
    const amp = this.ampEnv.tick()
    if (amp === 0) return 0

    const mod = this.modEnv.tick()
    const pitchMod = this.pitchEnv.tick()

    let sig: number
    switch (this.machine) {
      case 0: sig = this._tickKick(amp, mod, pitchMod); break
      case 1: sig = this._tickSnare(amp, mod, pitchMod); break
      case 2: sig = this._tickMetal(amp, mod, pitchMod); break
      case 3: sig = this._tickPerc(amp, mod, pitchMod); break
      case 4: sig = this._tickTone(amp, mod, pitchMod); break
      case 5: sig = this._tickChord(amp, mod, pitchMod); break
      default: sig = 0
    }

    // Punch: attack transient — sine burst (not noise) for tighter click
    if (this.punch > 0 && this.t < this.sr2 * 0.004) {
      const clickEnv = Math.exp(-this.t / (this.sr2 * 0.0008)) * this.punch
      // High-frequency sine burst + noise for attack definition
      const clickPhase = this.t * 1200 * this.sr2Inv  // ~1200 Hz click
      sig += (Math.sin(clickPhase * TAU) * 0.7 + this.noise.tick() * 0.3) * clickEnv
    }

    // Soft clipping — adds harmonics and weight, especially on kicks
    sig = Math.tanh(sig * 1.5) * 0.85

    // Tone filter (one-pole LP) — higher minimum to preserve low-end body
    const lpCoeff = 0.05 + this.tone * 0.95  // 0.05 (dark but keeps body) to 1.0 (bright)
    sig = this.toneLp.process(sig, lpCoeff)

    this.t++
    return sig * this.vel * 1.3
  }

  // Map note to appropriate base frequency per machine type.
  // Drum machines use fixed frequency ranges — the MIDI note is mapped
  // to a musically useful range for each machine, not raw midiToHz.
  private _baseFreqForMachine(note: number): number {
    switch (this.machine) {
      case 0: // KICK — 30–80 Hz range (note controls pitch within kick range)
        return 30 + (note - 36) * 1.5  // C2=30Hz, C3=48Hz, C4=66Hz
      case 1: // SNARE — 100–250 Hz range
        return 100 + (note - 48) * 6
      case 2: // METAL — 200–800 Hz base (808-style: harmonics extracted by HP)
        return 200 + (note - 36) * 15  // C2=200Hz, C4=560Hz, C5=740Hz
      case 3: // PERC — 80–400 Hz (toms, congas)
        return 80 + (note - 36) * 8
      case 4: // TONE — full pitched range (bass to lead)
        return midiToHz(note)
      case 5: // CHORD — full pitched range
        return midiToHz(note)
      default:
        return midiToHz(note)
    }
  }

  // ── Machine: KICK (0) ──────────────────────────────────────────────
  // 2-op FM. Carrier pitch sweeps down. Modulator adds body/harmonics.
  private _tickKick(amp: number, mod: number, pitchMod: number): number {
    // Pitch sweep: baseFreq is the resting pitch, sweep goes UP from there
    const sweepSemitones = this.sweep * 48  // up to 4 octaves of sweep
    const freqMult = Math.pow(2, sweepSemitones * pitchMod / 12)
    const carrierFreq = Math.max(20, this.baseFreq * freqMult)

    // Modulator: ratio from color (sub-harmonics 0.5 to harmonics 4.0)
    const modRatio = 0.5 + this.color * 3.5
    const modFreq = carrierFreq * modRatio

    // FM depth from shape — mod envelope provides transient harmonics
    const fmDepth = this.shape * 8.0 * mod

    // Carrier feedback adds body and warmth to the fundamental
    const feedback = 0.15 + this.shape * 0.4

    const modOut = this.ops[1].tick(modFreq, this.sr2Inv, 0, 0) * fmDepth
    const carrierOut = this.ops[0].tick(carrierFreq, this.sr2Inv, modOut, feedback)

    return carrierOut * amp * 1.2  // boost kick output
  }

  // ── Machine: SNARE (1) ─────────────────────────────────────────────
  // 2-op FM body + noise. Color controls noise/tone balance.
  private _tickSnare(amp: number, mod: number, pitchMod: number): number {
    const sweepSemi = this.sweep * 24
    const freqMult = Math.pow(2, sweepSemi * pitchMod / 12)
    const carrierFreq = this.baseFreq * freqMult

    const modRatio = 1.0 + this.color * 5.0
    const modFreq = carrierFreq * modRatio
    const fmDepth = this.shape * 4.0 * mod

    const modOut = this.ops[1].tick(modFreq, this.sr2Inv, 0, 0) * fmDepth
    const toneOut = this.ops[0].tick(carrierFreq, this.sr2Inv, modOut, 0)

    // Noise component — color shifts balance: 0=all tone, 1=all noise
    const noiseAmt = 0.3 + this.color * 0.7
    const noiseOut = this.noise.tick()

    // Mix with fast tone decay, longer noise tail
    const toneMix = toneOut * (1 - noiseAmt) * Math.exp(-this.t / (this.sr2 * 0.03))
    const noiseMix = noiseOut * noiseAmt

    return (toneMix + noiseMix) * amp
  }

  // ── Machine: METAL (2) ─────────────────────────────────────────────
  // 808-inspired: 6 harmonics-rich oscillators at inharmonic frequencies,
  // mixed and highpass-filtered to extract metallic shimmer.
  // color: inharmonic spread (tight/bell → wide/cymbal)
  // shape: harmonic richness via self-feedback (sine → quasi-square)
  private _tickMetal(amp: number, mod: number, pitchMod: number): number {
    const sweepSemi = this.sweep * 12
    const freqMult = Math.pow(2, sweepSemi * pitchMod / 12)
    const freq = this.baseFreq * freqMult

    // 6 inharmonic ratios — 808 uses ~200–800 Hz square waves
    // color spreads them: 0 = clustered (cowbell), 1 = wide (cymbal)
    const spread = 0.3 + this.color * 1.7
    const ratios = [
      1.0,
      1.34 + 0.2 * spread,    // ~540/400
      0.76 + 0.15 * spread,   // ~304/400
      0.92 + 0.4 * spread,    // ~369/400
      1.30 + 0.5 * spread,    // ~522/400
      2.0  + 0.3 * spread,    // ~800/400
    ]

    // Self-feedback on each op: 0 = pure sine, high = rich harmonics (quasi-square)
    // This is the key to 808-like character — square waves have natural odd harmonics
    const fb = 0.3 + this.shape * 0.7  // 0.3–1.0

    // Mod envelope fades the feedback for transient brightness
    const fbNow = fb * (0.4 + 0.6 * mod)

    // 6 self-modulating oscillators mixed additively (like 808)
    let sum = 0
    for (let i = 0; i < 6; i++) {
      sum += this.ops[i].tick(freq * ratios[i], this.sr2Inv, 0, fbNow)
    }
    sum /= 6

    // Highpass: remove low fundamentals, keep metallic upper harmonics
    // Simple one-pole HP: y[n] = x[n] - LP(x[n])
    const hpCoeff = 0.02 + this.shape * 0.03  // subtle LP to subtract
    this._metalLpState = this._metalLpState + hpCoeff * (sum - this._metalLpState)
    const hp = sum - this._metalLpState

    return hp * amp * 0.8
  }

  // ── Machine: PERC (3) ──────────────────────────────────────────────
  // 2-op, fast pitch env — toms, rimshots, wood blocks.
  private _tickPerc(amp: number, mod: number, pitchMod: number): number {
    // Wide pitch sweep for percussive character
    const sweepSemi = this.sweep * 36
    const freqMult = Math.pow(2, sweepSemi * pitchMod / 12)
    const carrierFreq = this.baseFreq * freqMult

    // Color controls harmonic content via ratio
    const modRatio = 1.0 + this.color * 7.0  // wide ratio range
    const modFreq = carrierFreq * modRatio
    const fmDepth = this.shape * 5.0 * mod

    const modOut = this.ops[1].tick(modFreq, this.sr2Inv, 0, 0) * fmDepth
    const carrierOut = this.ops[0].tick(carrierFreq, this.sr2Inv, modOut, 0)

    return carrierOut * amp
  }

  // ── Machine: TONE (4) ──────────────────────────────────────────────
  // 2-op sustained FM tone — pitched bass to lead.
  // Uses longer amp envelope and vibrato from pitch env.
  private _tickTone(amp: number, mod: number, pitchMod: number): number {
    // Slight pitch sweep (vibrato-like) — sweep controls depth
    const vibrato = pitchMod * this.sweep * 2  // subtle pitch wobble in semitones
    const freqMult = Math.pow(2, vibrato / 12)
    const carrierFreq = this.baseFreq * freqMult

    const modRatio = 1.0 + this.color * 7.0
    const modFreq = carrierFreq * modRatio

    // Shape controls FM depth, mod envelope provides body
    const fmDepth = this.shape * 6.0 * (0.3 + 0.7 * mod)
    const feedback = this.shape * 0.5

    const modOut = this.ops[1].tick(modFreq, this.sr2Inv, 0, 0) * fmDepth
    const carrierOut = this.ops[0].tick(carrierFreq, this.sr2Inv, modOut, feedback)

    return carrierOut * amp
  }

  // ── Machine: CHORD (5) ─────────────────────────────────────────────
  // 3 stacked 2-op FM voices — chord stabs.
  // Color selects chord type, shape controls FM depth.
  private _tickChord(amp: number, mod: number, pitchMod: number): number {
    const sweepSemi = this.sweep * 12
    const freqMult = Math.pow(2, sweepSemi * pitchMod / 12)
    const root = this.baseFreq * freqMult

    // Chord intervals (semitones from root) based on color
    // 0.0=major, 0.25=minor, 0.5=7th, 0.75=dim, 1.0=sus4
    const colorIdx = this.color * 4
    const intervals = chordIntervals(colorIdx)

    const modRatio = 2.0
    const fmDepth = this.shape * 4.0 * (0.3 + 0.7 * mod)

    let sum = 0
    for (let i = 0; i < 3; i++) {
      const freq = root * Math.pow(2, intervals[i] / 12)
      const modFreq = freq * modRatio
      const modOut = this.ops[i * 2 + 1].tick(modFreq, this.sr2Inv, 0, 0) * fmDepth
      sum += this.ops[i * 2].tick(freq, this.sr2Inv, modOut, 0)
    }

    return (sum / 3) * amp
  }

  setParam(key: string, value: number) {
    switch (key) {
      case 'machine':  this.machine  = Math.round(value); break
      case 'color':    this.color    = value; break
      case 'shape':    this.shape    = value; break
      case 'sweep':    this.sweep    = value; break
      case 'contour':  this.contour  = value; break
      case 'punch':    this.punch    = value; break
      case 'decay':    this.decay    = value; break
      case 'tone':     this.tone     = value; break
    }
  }
}

// ── Chord interval lookup ───────────────────────────────────────────

function chordIntervals(colorIdx: number): [number, number, number] {
  // Interpolate between chord types
  const chords: [number, number, number][] = [
    [0, 4, 7],    // Major
    [0, 3, 7],    // Minor
    [0, 4, 10],   // Dom 7th (root, 3rd, b7)
    [0, 3, 6],    // Diminished
    [0, 5, 7],    // Sus4
  ]
  const idx = Math.min(colorIdx, 3.999)
  const lo = Math.floor(idx)
  const hi = lo + 1
  const frac = idx - lo
  const a = chords[lo]
  const b = chords[hi]
  return [
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac,
  ]
}
