/**
 * Melodic voices: Moog lead, 4-operator FM synth (ADR 068), Wavetable synth (ADR 011, 063).
 */
import { ResonantLP, ADSR, SVFilter, SVFMode, HalfBandDown, CombFilter, FormantFilter } from './filters.ts'
import { midiToHz } from './voice-common.ts'
import type { Voice } from './voice-common.ts'

// ── Moog Lead ────────────────────────────────────────────────────────

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

// ── 4-Operator FM Synth (ADR 068) ────────────────────────────────────

/** Single FM operator with phase, envelope, feedback, and detune. */
class FMOp {
  phase = 0; prevOut = 0
  ratio = 1.0; detune = 0; level = 1.0; feedback = 0.0
  env = new ADSR()
  constructor(sr: number) { this.env.setSampleRate(sr) }
  reset() { this.phase = 0; this.prevOut = 0; this.env.reset() }
  noteOn() {
    // Only reset phase when idle — avoids click on retrigger
    if (this.env.isIdle()) { this.phase = 0; this.prevOut = 0 }
    this.env.noteOn()
  }
  noteOff() { this.env.noteOff() }
  /** Tick operator with external modulation input. Returns output signal. */
  tick(freq: number, sr: number, modIn: number): number {
    const e = this.env.tick()
    if (e < 0.00001) return 0
    const centsFactor = this.detune !== 0 ? Math.pow(2, this.detune / 1200) : 1
    const hz = freq * this.ratio * centsFactor
    this.phase += hz / sr
    if (this.phase >= 1) this.phase -= 1
    const fb = this.feedback > 0 ? this.prevOut * this.feedback * 3.2 : 0
    const out = Math.sin(this.phase * TAU + modIn + fb) * e * this.level
    this.prevOut = out
    return out
  }
}

const TAU = 2 * Math.PI

/** LFO shape enum for FM voice (mirrors WT LFOShape) */
const enum FMLFOShape { Sine, Triangle, Saw, Square, SampleHold }

/** Simple LFO for FM voice — supports free and tempo-sync modes. */
class FMLFO {
  private phase = 0
  private holdValue = 0
  private seed = 55555
  shape: FMLFOShape = FMLFOShape.Sine
  rate = 2.0; sync = false; divIndex = 2; bpm = 120; depth = 0
  dest = 0  // 0=off, 1-4=op1-4 level, 5-8=op1-4 ratio
  private sr: number
  constructor(sr: number) { this.sr = sr }
  reset() { this.phase = 0; this.holdValue = 0 }
  /** Returns bipolar value -1..+1, scaled by depth */
  tick(): number {
    if (this.depth < 0.001) return 0
    const LFO_DIVS = [4, 2, 1, 0.5, 0.25, 0.125]
    const effectiveRate = this.sync
      ? 1 / ((LFO_DIVS[this.divIndex] ?? 1) * 60 / this.bpm)
      : this.rate
    this.phase += effectiveRate / this.sr
    const wrapped = this.phase >= 1
    if (wrapped) this.phase -= 1
    let v = 0
    switch (this.shape) {
      case FMLFOShape.Sine:     v = Math.sin(this.phase * TAU); break
      case FMLFOShape.Triangle: v = this.phase < 0.5 ? this.phase * 4 - 1 : 3 - this.phase * 4; break
      case FMLFOShape.Saw:      v = this.phase * 2 - 1; break
      case FMLFOShape.Square:   v = this.phase < 0.5 ? 1 : -1; break
      case FMLFOShape.SampleHold:
        if (wrapped) { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; this.holdValue = (this.seed >>> 16) / 32768 - 1 }
        v = this.holdValue; break
    }
    return v * this.depth
  }
}

/** 4-op FM core — single voice instance used by FMVoice poly wrapper (12 cores max).
 *  Internally runs at 2× sample rate to suppress FM aliasing, decimated by a half-band FIR. */
class FMCore {
  freq = 440; vel = 1
  ops: FMOp[]
  algorithm = 0
  lfo: FMLFO
  private halfBand = new HalfBandDown()

  constructor(private sr: number) {
    const sr2 = sr * 2
    this.ops = [new FMOp(sr2), new FMOp(sr2), new FMOp(sr2), new FMOp(sr2)]
    this.lfo = new FMLFO(sr2)
    const [o1, o2, o3, o4] = this.ops
    o1.ratio = 1.0; o1.level = 1.0; o1.env.attack = 0.003; o1.env.decay = 0.30; o1.env.sustain = 0.20; o1.env.release = 0.4
    o2.ratio = 2.0; o2.level = 0.7; o2.env.attack = 0.001; o2.env.decay = 0.20; o2.env.sustain = 0.10; o2.env.release = 0.15
    o3.ratio = 3.0; o3.level = 0.5; o3.env.attack = 0.001; o3.env.decay = 0.10; o3.env.sustain = 0.0;  o3.env.release = 0.05
    o4.ratio = 4.0; o4.level = 0.3; o4.env.attack = 0.001; o4.env.decay = 0.08; o4.env.sustain = 0.0;  o4.env.release = 0.05
    o1.feedback = 0.15
  }

  noteOn(note: number, v: number) {
    this.freq = midiToHz(note); this.vel = v
    for (const op of this.ops) op.noteOn()
    this.lfo.reset()
  }
  noteOff() { for (const op of this.ops) op.noteOff() }
  reset() { for (const op of this.ops) op.reset(); this.lfo.reset(); this.halfBand.reset() }

  isIdle(): boolean {
    for (const op of this.ops) { if (!op.env.isIdle()) return false }
    return true
  }

  /** Internal tick at 2× sample rate. */
  private _tickInner(): number {
    const [o1, o2, o3, o4] = this.ops
    const f = this.freq, sr2 = this.sr * 2

    // Apply LFO modulation
    const lfoVal = this.lfo.tick()
    if (lfoVal !== 0 && this.lfo.dest > 0) {
      const dest = this.lfo.dest
      if (dest >= 1 && dest <= 4) {
        const op = this.ops[dest - 1]
        op.level = Math.max(0, op.level + lfoVal * 0.5)
      }
    }

    if (this.isIdle()) return 0

    let out = 0
    switch (this.algorithm) {
      case 0: { const s4 = o4.tick(f, sr2, 0); const s3 = o3.tick(f, sr2, s4 * TAU); const s2 = o2.tick(f, sr2, s3 * TAU); out = o1.tick(f, sr2, s2 * TAU); break }
      case 1: { const s4 = o4.tick(f, sr2, 0); const s3 = o3.tick(f, sr2, s4 * TAU); out = o2.tick(f, sr2, s3 * TAU) + o1.tick(f, sr2, 0); break }
      case 2: { const s4 = o4.tick(f, sr2, 0); const s2 = o2.tick(f, sr2, s4 * TAU); out = o3.tick(f, sr2, s4 * TAU) + o1.tick(f, sr2, s2 * TAU); break }
      case 3: { const s4 = o4.tick(f, sr2, 0); const s2 = o2.tick(f, sr2, 0); out = o3.tick(f, sr2, s4 * TAU) + o1.tick(f, sr2, s2 * TAU); break }
      case 4: { const s3 = o3.tick(f, sr2, 0); const s4 = o4.tick(f, sr2, 0); out = o2.tick(f, sr2, s3 * TAU) + o1.tick(f, sr2, s4 * TAU); break }
      case 5: { const s4 = o4.tick(f, sr2, 0); out = o3.tick(f, sr2, s4 * TAU) + o2.tick(f, sr2, 0) + o1.tick(f, sr2, 0); break }
      case 6: { const s4 = o4.tick(f, sr2, 0); out = o3.tick(f, sr2, s4 * TAU) + o2.tick(f, sr2, 0) + o1.tick(f, sr2, 0); break }
      case 7: { out = o4.tick(f, sr2, 0) + o3.tick(f, sr2, 0) + o2.tick(f, sr2, 0) + o1.tick(f, sr2, 0); break }
    }
    // Carrier count per algorithm: 0=1, 1-4=2, 5-6=3, 7=4
    const carrierCount = this.algorithm === 0 ? 1 : this.algorithm >= 7 ? 4 : this.algorithm >= 5 ? 3 : 2
    return out / carrierCount * this.vel * 0.85
  }

  /** Tick at native sample rate — internally renders 2 samples at 2×SR and decimates. */
  tick(): number {
    const s0 = this._tickInner()
    const s1 = this._tickInner()
    return this.halfBand.process(s0, s1)
  }
}

/**
 * 4-operator FM synth with MEGAfm-style poly modes (ADR 068).
 * polyMode: 0=MONO, 1=POLY12, 2=WIDE6, 3=UNISON
 */
export class FMVoice implements Voice {
  private cores: FMCore[]
  private polyMode = 0  // 0=mono, 1=poly12, 2=wide6, 3=unison
  private nextVoice = 0
  private activeNotes = new Int8Array(12).fill(-1)
  private unisonDetune = 0.008  // detune spread for unison/wide modes

  constructor(sr: number) {
    this.cores = Array.from({ length: 12 }, () => new FMCore(sr))
  }

  noteOn(note: number, v: number) {
    switch (this.polyMode) {
      case 0: // MONO
        this.cores[0].noteOn(note, v)
        return
      case 1: { // POLY12
        // Retrigger if same note is already playing
        for (let i = 0; i < 12; i++) {
          if (this.activeNotes[i] === note) {
            this.cores[i].noteOn(note, v)
            return
          }
        }
        const idx = this.nextVoice
        this.nextVoice = (this.nextVoice + 1) % 12
        this.activeNotes[idx] = note
        this.cores[idx].noteOn(note, v)
        return
      }
      case 2: { // WIDE6 — 6 pairs, each pair detuned L/R
        for (let i = 0; i < 6; i++) {
          if (this.activeNotes[i] === note) {
            this._wideNoteOn(i, note, v)
            return
          }
        }
        const idx = this.nextVoice % 6
        this.nextVoice = (this.nextVoice + 1) % 6
        this.activeNotes[idx] = note
        this._wideNoteOn(idx, note, v)
        return
      }
      case 3: // UNISON — all 12 cores on one note, detuned
        for (let i = 0; i < 12; i++) {
          const detune = (i - 5.5) / 5.5 * this.unisonDetune
          this.cores[i].noteOn(note, v)
          this.cores[i].freq *= (1 + detune)
        }
        this.activeNotes[0] = note
        return
    }
  }

  private _wideNoteOn(pair: number, note: number, v: number) {
    const coreL = this.cores[pair * 2]
    const coreR = this.cores[pair * 2 + 1]
    coreL.noteOn(note, v)
    coreR.noteOn(note, v)
    coreL.freq *= (1 - this.unisonDetune * 0.5)
    coreR.freq *= (1 + this.unisonDetune * 0.5)
  }

  noteOff() {
    if (this.polyMode === 0) {
      this.cores[0].noteOff()
      return
    }
    const count = this.polyMode === 2 ? 12 : this.polyMode === 1 ? 12 : 12
    for (let i = 0; i < count; i++) {
      this.cores[i].noteOff()
      this.activeNotes[i] = -1
    }
  }

  slideNote(note: number, v: number) {
    if (this.polyMode === 0) {
      this.cores[0].noteOn(note, v)
      return
    }
    if (this.polyMode === 3) {
      // Unison slide: retrigger all
      this.noteOn(note, v)
      return
    }
    if (this.polyMode === 2) {
      const prev = ((this.nextVoice - 1 + 6) % 6)
      this.activeNotes[prev] = note
      this._wideNoteOn(prev, note, v)
      return
    }
    // Poly12
    const prev = (this.nextVoice - 1 + 12) % 12
    this.cores[prev].noteOn(note, v)
    this.activeNotes[prev] = note
  }

  reset() {
    for (let i = 0; i < 12; i++) { this.cores[i].reset(); this.activeNotes[i] = -1 }
    this.nextVoice = 0
  }

  // √N scaling so chords don't lose too much volume
  private static readonly POLY_SCALE  = 1 / Math.sqrt(12)  // ≈0.29
  private static readonly WIDE_SCALE  = 1 / Math.sqrt(6)   // ≈0.41
  private static readonly UNI_SCALE   = 1 / Math.sqrt(12)  // ≈0.29

  tick(): number {
    if (this.polyMode === 0) return this.cores[0].tick()
    let sum = 0
    for (let i = 0; i < 12; i++) sum += this.cores[i].tick()
    return sum * (this.polyMode === 2 ? FMVoice.WIDE_SCALE
      : this.polyMode === 3 ? FMVoice.UNI_SCALE : FMVoice.POLY_SCALE)
  }

  tickStereo(out: Float32Array) {
    if (this.polyMode !== 2) {
      const m = this.tick()
      out[0] = m; out[1] = m
      return
    }
    // WIDE6: L cores are even indices, R cores are odd
    let sumL = 0, sumR = 0
    for (let p = 0; p < 6; p++) {
      sumL += this.cores[p * 2].tick()
      sumR += this.cores[p * 2 + 1].tick()
    }
    const s = FMVoice.WIDE_SCALE
    out[0] = sumL * s; out[1] = sumR * s
  }

  setParam(key: string, value: number) {
    if (key === 'polyMode') {
      const newMode = Math.round(value)
      if (newMode !== this.polyMode) {
        // Silence non-primary cores when switching modes
        for (let i = (newMode === 0 ? 1 : 0); i < 12; i++) {
          if (newMode === 0 && i > 0) { this.cores[i].noteOff(); this.activeNotes[i] = -1 }
        }
        this.polyMode = newMode
        this.nextVoice = 0
      }
      return
    }
    if (key === 'unisonDetune') {
      this.unisonDetune = value
      return
    }
    // Apply param to all 12 cores
    for (let i = 0; i < 12; i++) {
      const core = this.cores[i]
      if (key === 'algorithm') { core.algorithm = Math.round(value); continue }

      const opMatch = key.match(/^op([1-4])(\w+)$/)
      if (opMatch) {
        const op = core.ops[parseInt(opMatch[1]) - 1]
        const param = opMatch[2]
        switch (param) {
          case 'Ratio':   op.ratio    = value; break
          case 'Detune':  op.detune   = value; break
          case 'Level':   op.level    = value; break
          case 'Fb':      op.feedback = value; break
          case 'Attack':  op.env.attack  = value; break
          case 'Decay':   op.env.decay   = value; break
          case 'Sustain': op.env.sustain = value; break
          case 'Release': op.env.release = value; break
        }
        continue
      }

      switch (key) {
        case 'lfoRate':     core.lfo.rate     = value; break
        case 'lfoSync':     core.lfo.sync     = value >= 0.5; break
        case 'lfoDiv':      core.lfo.divIndex = Math.round(value); break
        case 'lfoWave':     core.lfo.shape    = Math.round(value) as FMLFOShape; break
        case 'lfoDest':     core.lfo.dest     = Math.round(value); break
        case 'lfoDepth':    core.lfo.depth    = value; break
        case 'bpm':         core.lfo.bpm      = value; break
      }

      // Backward compat: old 2-op param names
      switch (key) {
        case 'op2Ratio':     core.ops[1].ratio    = value; break
        case 'fbAmt':        core.ops[0].feedback = value; break
        case 'op2Index':     core.ops[1].level    = value / 8; break
        case 'carrierIndex': core.ops[0].level    = value / 8; break
        case 'decay':        core.ops[0].env.decay = value; core.ops[1].env.decay = value * 0.5; break
      }
    }
  }
}

// ── Wavetable Oscillator (ADR 011) ──────────────────────────────────

/** Wavetable shapes — generated mathematically at init, zero bundle cost. */
const enum WTShape {
  // Classic (0–4)
  Saw, Square, Triangle, Sine, Pulse,
  // Digital / Spectral (5–9)
  SuperSaw, PWM50, Formant1, Formant2, Spectral,
  // Harsh / Aggressive (10–14)
  Bitcrush, Metallic, Distorted, Noise, Feedback,
}

const WT_SIZE = 2048

/** Harmonic amplitude function for additive shapes */
function harmonicAmp(shape: WTShape, h: number): number {
  switch (shape) {
    case WTShape.Saw:      return (h % 2 === 0 ? -1 : 1) * (1 / h)
    case WTShape.Square:   return h % 2 === 1 ? (1 / h) : 0
    case WTShape.Triangle: return h % 2 === 1 ? ((h % 4 === 1 ? 1 : -1) / (h * h)) : 0
    case WTShape.Sine:     return h === 1 ? 1 : 0
    case WTShape.Pulse:    return 1 / h  // all harmonics equal = narrow pulse
    // SuperSaw: 7 detuned saws summed (detune spread via phase offsets)
    case WTShape.SuperSaw: return (h % 2 === 0 ? -1 : 1) * (1 / h) * 1.4
    // PWM50: 50% pulse width — odd harmonics only like square but different phase
    case WTShape.PWM50:    return h % 2 === 1 ? (1 / h) : 0
    // Spectral: odd harmonics with steep spectral tilt (darker, hollow)
    case WTShape.Spectral: return h % 2 === 1 ? (1 / (h * h * 0.5)) : 0
    default: return 0
  }
}

/** Generate a single-cycle wavetable (band-limited). */
function generateTable(shape: WTShape, sr: number, baseFreq: number): Float32Array {
  const table = new Float32Array(WT_SIZE)
  const nyquist = sr / 2
  const maxHarmonics = Math.floor(nyquist / Math.max(1, baseFreq))

  // Shapes that need direct waveform construction (not pure additive)
  switch (shape) {
    case WTShape.SuperSaw: {
      // 7 detuned saws — sum additive saws with phase offsets
      const detunes = [-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12]
      for (const dt of detunes) {
        for (let h = 1; h <= maxHarmonics; h++) {
          const amp = (h % 2 === 0 ? -1 : 1) * (1 / h) / 7
          const phaseOff = dt * h * 2.5
          for (let i = 0; i < WT_SIZE; i++) {
            table[i] += amp * Math.sin(2 * Math.PI * h * i / WT_SIZE + phaseOff)
          }
        }
      }
      break
    }
    case WTShape.Formant1: {
      // Vocal "A" formant — 3 resonant peaks at ~730, 1090, 2440 Hz
      // Approximated as harmonic clusters relative to fundamental
      for (let h = 1; h <= maxHarmonics; h++) {
        const f = h * baseFreq
        // Gaussian peaks centered at formant frequencies
        const a1 = Math.exp(-0.5 * ((f - 730) / 80) ** 2)
        const a2 = Math.exp(-0.5 * ((f - 1090) / 100) ** 2) * 0.7
        const a3 = Math.exp(-0.5 * ((f - 2440) / 120) ** 2) * 0.4
        const amp = (a1 + a2 + a3) / h
        if (amp < 0.001) continue
        for (let i = 0; i < WT_SIZE; i++) {
          table[i] += amp * Math.sin(2 * Math.PI * h * i / WT_SIZE)
        }
      }
      break
    }
    case WTShape.Formant2: {
      // Vocal "O" formant — peaks at ~570, 840, 2410 Hz
      for (let h = 1; h <= maxHarmonics; h++) {
        const f = h * baseFreq
        const a1 = Math.exp(-0.5 * ((f - 570) / 70) ** 2)
        const a2 = Math.exp(-0.5 * ((f - 840) / 90) ** 2) * 0.6
        const a3 = Math.exp(-0.5 * ((f - 2410) / 120) ** 2) * 0.3
        const amp = (a1 + a2 + a3) / h
        if (amp < 0.001) continue
        for (let i = 0; i < WT_SIZE; i++) {
          table[i] += amp * Math.sin(2 * Math.PI * h * i / WT_SIZE)
        }
      }
      break
    }
    case WTShape.Bitcrush: {
      // Quantized sine — step function with N levels
      const levels = 8
      for (let i = 0; i < WT_SIZE; i++) {
        const s = Math.sin(2 * Math.PI * i / WT_SIZE)
        table[i] = Math.round(s * levels) / levels
      }
      // Band-limit by zeroing harmonics above nyquist
      _bandLimit(table, maxHarmonics)
      break
    }
    case WTShape.Metallic: {
      // Inharmonic partials — bell-like, using non-integer ratios
      const ratios = [1, 1.47, 2.09, 2.56, 3.14, 4.2]
      const amps  = [1, 0.7, 0.5, 0.35, 0.25, 0.15]
      for (let r = 0; r < ratios.length; r++) {
        const h = Math.round(ratios[r])  // snap to nearest harmonic for band-limiting
        if (h > maxHarmonics || h < 1) continue
        for (let i = 0; i < WT_SIZE; i++) {
          // Use exact ratio for waveform but integer harmonic for phase coherence
          table[i] += amps[r] * Math.sin(2 * Math.PI * ratios[r] * i / WT_SIZE)
        }
      }
      break
    }
    case WTShape.Distorted: {
      // Saturated sine — tanh waveshaping
      const gain = 4.0
      for (let i = 0; i < WT_SIZE; i++) {
        table[i] = Math.tanh(gain * Math.sin(2 * Math.PI * i / WT_SIZE))
      }
      _bandLimit(table, maxHarmonics)
      break
    }
    case WTShape.Noise: {
      // Band-limited noise — random harmonics with controlled amplitudes
      // Use deterministic seed for consistency across instances
      let seed = 42
      const rand = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff }
      for (let h = 1; h <= maxHarmonics; h++) {
        const amp = (0.3 + 0.7 * rand()) / Math.sqrt(h)  // pink-ish rolloff
        const phase = rand() * 2 * Math.PI
        for (let i = 0; i < WT_SIZE; i++) {
          table[i] += amp * Math.sin(2 * Math.PI * h * i / WT_SIZE + phase)
        }
      }
      break
    }
    case WTShape.Feedback: {
      // Simulated FM feedback — sine modulating itself
      const fbAmount = 0.7
      for (let i = 0; i < WT_SIZE; i++) {
        const phase = 2 * Math.PI * i / WT_SIZE
        // Iterate feedback 4 times for convergence
        let out = 0
        for (let iter = 0; iter < 4; iter++) {
          out = Math.sin(phase + fbAmount * out)
        }
        table[i] = out
      }
      _bandLimit(table, maxHarmonics)
      break
    }
    default: {
      // Additive synthesis shapes (Saw, Square, Triangle, Sine, Pulse, PWM50, Spectral)
      for (let h = 1; h <= maxHarmonics; h++) {
        const amp = harmonicAmp(shape, h)
        if (amp === 0) continue
        for (let i = 0; i < WT_SIZE; i++) {
          table[i] += amp * Math.sin(2 * Math.PI * h * i / WT_SIZE)
        }
      }
    }
  }

  // PWM50: shift phase by 90° compared to Square for a different character
  if (shape === WTShape.PWM50) {
    const shifted = new Float32Array(WT_SIZE)
    const offset = WT_SIZE / 4  // 90° phase shift
    for (let i = 0; i < WT_SIZE; i++) {
      shifted[i] = table[(i + offset) & (WT_SIZE - 1)]
    }
    for (let i = 0; i < WT_SIZE; i++) table[i] = shifted[i]
  }

  // Normalize
  let peak = 0
  for (let i = 0; i < WT_SIZE; i++) { const a = Math.abs(table[i]); if (a > peak) peak = a }
  if (peak > 0) for (let i = 0; i < WT_SIZE; i++) table[i] /= peak

  return table
}

/** Band-limit a directly-generated waveform by resynthesizing from its harmonics */
function _bandLimit(table: Float32Array, maxHarmonics: number): void {
  // Analyze: extract harmonic amplitudes and phases via DFT
  const N = table.length
  const resynth = new Float32Array(N)
  for (let h = 1; h <= Math.min(maxHarmonics, N / 2 - 1); h++) {
    let re = 0, im = 0
    for (let i = 0; i < N; i++) {
      const angle = 2 * Math.PI * h * i / N
      re += table[i] * Math.cos(angle)
      im -= table[i] * Math.sin(angle)
    }
    re *= 2 / N
    im *= 2 / N
    for (let i = 0; i < N; i++) {
      const angle = 2 * Math.PI * h * i / N
      resynth[i] += re * Math.cos(angle) - im * Math.sin(angle)
    }
  }
  for (let i = 0; i < N; i++) table[i] = resynth[i]
}

const SHAPE_COUNT = 15

// ── Mipmap wavetable generation ─────────────────────────────────────
// One table per octave band. Higher frequencies use tables with fewer
// harmonics, preventing aliasing without runtime oversampling.
const MIPMAP_FREQS = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]
const MIPMAP_LEVELS = MIPMAP_FREQS.length

/** Select mipmap level for a given playback frequency (branchless-ish). */
function mipmapLevel(freq: number): number {
  if (freq < 128) return freq < 64 ? 0 : 1
  if (freq < 512) return freq < 256 ? 2 : 3
  if (freq < 2048) return freq < 1024 ? 4 : 5
  if (freq < 8192) return freq < 4096 ? 6 : 7
  return 8
}

/** Cached mipmap tables per sample rate: tables[shape][mipmapLevel] */
const tableCache = new Map<number, Float32Array[][]>()

function getCachedTables(sr: number): Float32Array[][] {
  let tables = tableCache.get(sr)
  if (!tables) {
    tables = []
    for (let s = 0; s < SHAPE_COUNT; s++) {
      const levels: Float32Array[] = []
      for (let m = 0; m < MIPMAP_LEVELS; m++) {
        levels.push(generateTable(s as WTShape, sr, MIPMAP_FREQS[m]))
      }
      tables.push(levels)
    }
    tableCache.set(sr, tables)
  }
  return tables
}

class WavetableOsc {
  private tables: Float32Array[][]  // [shape][mipmapLevel]
  private phase = 0

  /** Position 0.0–1.0 morphs between wavetable shapes */
  position = 0

  constructor(private sr: number) {
    this.tables = getCachedTables(sr)
  }

  reset() { this.phase = 0 }

  tick(freq: number): number {
    this.phase += freq / this.sr
    // Robust phase wrapping — handles large freq jumps from FM modulation
    this.phase -= Math.floor(this.phase)
    if (this.phase < 0) this.phase = 0

    // Select mipmap level based on playback frequency
    const level = mipmapLevel(freq)

    // Morph position selects between shapes
    const pos = this.position * (SHAPE_COUNT - 1)
    const idx = Math.floor(pos)
    const frac = pos - idx
    const idxNext = Math.min(idx + 1, SHAPE_COUNT - 1)

    // Linear interpolation within table
    const phaseSample = this.phase * WT_SIZE
    const s0 = Math.floor(phaseSample) & (WT_SIZE - 1)
    const s1 = (s0 + 1) & (WT_SIZE - 1)
    const sf = phaseSample - Math.floor(phaseSample)

    const tA = this.tables[idx][level]
    const tB = this.tables[idxNext][level]
    const a = tA[s0] + (tA[s1] - tA[s0]) * sf
    const b = tB[s0] + (tB[s1] - tB[s0]) * sf

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

const enum ModSrc { LFO1, LFO2, Env2, Velocity, Note, Random, ModWheel, Env1 }
const enum ModDst { Pitch, WTPos, Cutoff, Resonance, FMIndex, Volume, PanSpread, UniDetune, Drive }
const MOD_DST_COUNT = 9

interface ModSlot {
  src: ModSrc
  dst: ModDst
  amount: number  // -1..+1 bipolar
}

class ModMatrix {
  slots: ModSlot[] = []
  private _out = new Float64Array(MOD_DST_COUNT)

  /** Set or update a mod slot by index (0–7). amt=0 removes the slot. */
  setSlot(idx: number, src: number, dst: number, amt: number) {
    while (this.slots.length <= idx) this.slots.push({ src: 0 as ModSrc, dst: 0 as ModDst, amount: 0 })
    if (amt === 0) {
      this.slots[idx] = { src: 0 as ModSrc, dst: 0 as ModDst, amount: 0 }
    } else {
      this.slots[idx] = { src: src as ModSrc, dst: dst as ModDst, amount: amt }
    }
  }

  /** Compute modulated param offsets. Returns per-destination sum of modulations. */
  process(
    lfo1: number, lfo2: number, env2: number, velocity: number, note: number,
    random: number, modWheel: number, env1: number,
  ): Float64Array {
    const out = this._out
    out.fill(0)
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      let srcVal = 0
      switch (s.src) {
        case ModSrc.LFO1:     srcVal = lfo1; break
        case ModSrc.LFO2:     srcVal = lfo2; break
        case ModSrc.Env2:     srcVal = env2; break
        case ModSrc.Velocity: srcVal = velocity * 2 - 1; break  // map 0-1 to bipolar
        case ModSrc.Note:     srcVal = (note - 60) / 48; break  // center at C4
        case ModSrc.Random:   srcVal = random; break             // S&H random per note
        case ModSrc.ModWheel: srcVal = modWheel * 2 - 1; break  // 0-1 to bipolar
        case ModSrc.Env1:     srcVal = env1 * 2 - 1; break      // 0-1 to bipolar
      }
      out[s.dst] += srcVal * s.amount
    }
    return out
  }
}

// ── WT — unified wavetable synth engine (ADR 011, 063) ──────────────

/**
 * 2-osc wavetable synth with SVF filter, dual ADSR, 2× LFO, mod matrix.
 * Osc combine modes: mix, FM, ringmod
 * Filter modes: LP, HP, BP, Notch (via SVFilter)
 */
const enum OscCombine { Mix, FM, Ring }
const enum WTFilterType { SVF, Comb, Formant }
const enum DriveType { Soft, Hard, Fold, Bitcrush }

const MAX_UNISON = 7

class WTCore {
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
  combFilter: CombFilter
  formantFilter: FormantFilter
  filterType: WTFilterType = WTFilterType.SVF
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
  driveType: DriveType = DriveType.Soft

  // Mod sources
  randomValue = 0      // S&H random per note (-1..+1)
  modWheel = 0         // MIDI CC1 / expression (0..1)

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
    this.combFilter = new CombFilter(sr)
    this.formantFilter = new FormantFilter(sr)
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
    this.randomValue = Math.random() * 2 - 1  // S&H random per note
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
    this.filter.reset(); this.combFilter.reset(); this.formantFilter.reset()
    this.lfo1.reset(); this.lfo2.reset()
    this.oscA.reset(); this.oscB.reset()
    for (let i = 0; i < this.uniOscA.length; i++) {
      this.uniOscA[i].reset(); this.uniOscB[i].reset()
    }
    this.freq = this.targetFreq = 220
  }

  /** Apply the active filter type to a signal */
  private _applyFilter(sig: number, fc: number, reso: number): number {
    switch (this.filterType) {
      case WTFilterType.Comb: {
        this.combFilter.setParams(fc, reso)
        // Map resonance to feedback: 0.5–10 → 0–0.93
        const fb = Math.min(0.93, Math.max(0, (reso - 0.5) / 9.5 * 0.93))
        return this.combFilter.process(sig, fb)
      }
      case WTFilterType.Formant:
        this.formantFilter.setParams(fc, reso)
        return this.formantFilter.process(sig)
      default:
        this.filter.setParams(fc, reso)
        return this.filter.process(sig)
    }
  }

  /** Apply drive/waveshaping with selectable type */
  private _applyDrive(sig: number, amount: number): number {
    const amt = 1 + amount * 4
    switch (this.driveType) {
      case DriveType.Hard: {
        // Hard clip
        const g = sig * amt
        return Math.max(-1, Math.min(1, g))
      }
      case DriveType.Fold: {
        // Wavefold — folds signal back when it exceeds ±1
        let g = sig * amt
        // Fold up to 4 times
        for (let i = 0; i < 4 && (g > 1 || g < -1); i++) {
          if (g > 1) g = 2 - g
          else if (g < -1) g = -2 - g
        }
        return g
      }
      case DriveType.Bitcrush: {
        // Reduce bit depth — quantize to N levels
        const levels = Math.max(2, Math.round(16 - amount * 14))  // 16 → 2 levels
        return Math.round(sig * levels) / levels
      }
      default: // DriveType.Soft
        return Math.tanh(sig * amt) / Math.tanh(amt)
    }
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
        // Equal-power crossfade — avoids 50% mix dip
        const mixB = this.oscMix
        const gainA = Math.sqrt(1 - mixB)
        const gainB = Math.sqrt(mixB)
        return a * gainA + b * gainB
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

    const mod = this.modMatrix.process(l1, l2, menv, this.vel, this.note, this.randomValue, this.modWheel, aenv)
    const pitchMod = mod[ModDst.Pitch]
    const wtPosMod = mod[ModDst.WTPos]
    const cutMod   = mod[ModDst.Cutoff]
    const resoMod  = mod[ModDst.Resonance]
    const fmMod    = mod[ModDst.FMIndex]
    const volMod   = mod[ModDst.Volume]
    const driveMod = mod[ModDst.Drive]

    const pitchMultiplier = Math.pow(2, pitchMod * 12 / 12)
    const freqA = this.freq * pitchMultiplier
    const detuneRatio = Math.pow(2, this.oscBSemi / 12 + this.oscBDetune / 1200)
    const freqB = this.freq * detuneRatio * pitchMultiplier
    const effectiveFmIndex = Math.max(0, this.fmIndex + fmMod * 4)

    let sig = this._renderPair(this.oscA, this.oscB, freqA, freqB, wtPosMod, effectiveFmIndex, menv)

    // Pre-filter saturation — adds body and presence (like analog oscillators)
    sig = Math.tanh(sig * 1.8)

    // Filter
    const fc = Math.min(
      Math.max(20, this.cutoffBase + this.envMod * menv + cutMod * 4000),
      this.sr * 0.45
    )
    const reso = Math.max(0.5, this.resonance + resoMod * 3)
    sig = this._applyFilter(sig, fc, reso)

    // Drive
    const effectiveDrive = Math.max(0, Math.min(1, this.drive + driveMod))
    if (effectiveDrive > 0) {
      sig = this._applyDrive(sig, effectiveDrive)
    }

    const vol = Math.max(0, 1.5 + volMod * 0.3)
    const out = sig * aenv * this.vel * vol
    if (out !== out) { this.filter.reset(); this.combFilter.reset(); this.formantFilter.reset(); return 0 }
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

    const mod = this.modMatrix.process(l1, l2, menv, this.vel, this.note, this.randomValue, this.modWheel, aenv)
    const pitchMod = mod[ModDst.Pitch]
    const wtPosMod = mod[ModDst.WTPos]
    const cutMod   = mod[ModDst.Cutoff]
    const resoMod  = mod[ModDst.Resonance]
    const fmMod    = mod[ModDst.FMIndex]
    const volMod   = mod[ModDst.Volume]
    const panMod   = mod[ModDst.PanSpread]
    const uniDtMod = mod[ModDst.UniDetune]
    const driveMod = mod[ModDst.Drive]

    const pitchMultiplier = Math.pow(2, pitchMod * 12 / 12)
    const baseFreqA = this.freq * pitchMultiplier
    const detuneRatio = Math.pow(2, this.oscBSemi / 12 + this.oscBDetune / 1200)
    const baseFreqB = this.freq * detuneRatio * pitchMultiplier
    const effectiveFmIndex = Math.max(0, this.fmIndex + fmMod * 4)
    const effectiveSpread = Math.max(0, Math.min(1, this.unisonSpread + uniDtMod))
    const effectiveWidth = Math.max(0, Math.min(1, this.unisonWidth + panMod))

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
      const detuneCents = effectiveSpread * 50 * pairNum / pairs  // max ~50 cents at outer pair
      const detuneMultiplier = Math.pow(2, detuneCents / 1200)
      const pan = effectiveWidth * pairNum / pairs  // 0..width

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

    let sigL = Math.tanh(sumL * gain * 0.5 * 1.8)
    let sigR = Math.tanh(sumR * gain * 0.5 * 1.8)

    // Filter (shared, applied to L and R)
    const fc = Math.min(
      Math.max(20, this.cutoffBase + this.envMod * menv + cutMod * 4000),
      this.sr * 0.45
    )
    const reso = Math.max(0.5, this.resonance + resoMod * 3)
    // Apply filter to mono sum for consistency (stereo filter would need 2 instances)
    const sigM = this._applyFilter((sigL + sigR) * 0.5, fc, reso)
    // Preserve stereo image: add back the difference
    const diff = (sigL - sigR) * 0.5
    sigL = sigM + diff; sigR = sigM - diff

    // Drive
    const effectiveDrive = Math.max(0, Math.min(1, this.drive + driveMod))
    if (effectiveDrive > 0) {
      sigL = this._applyDrive(sigL, effectiveDrive)
      sigR = this._applyDrive(sigR, effectiveDrive)
    }

    const vol = Math.max(0, 1.5 + volMod * 0.3)
    out[0] = sigL * aenv * this.vel * vol
    out[1] = sigR * aenv * this.vel * vol
    if (out[0] !== out[0] || out[1] !== out[1]) { this.filter.reset(); this.combFilter.reset(); this.formantFilter.reset(); out[0] = 0; out[1] = 0 }
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

/**
 * WT synth — 16-core wavetable with MEGAfm-style poly modes.
 * polyMode: 0=MONO, 1=POLY16, 2=WIDE8, 3=UNISON
 */
export class WTSynth implements Voice {
  private cores: WTCore[]
  private polyMode = 0  // 0=mono, 1=poly16, 2=wide8, 3=unison
  private nextVoice = 0
  private activeNotes = new Int8Array(16).fill(-1)
  private _stereoTmp = new Float32Array(2)
  private wideDetune = 0.006

  constructor(sr: number) {
    this.cores = Array.from({ length: 16 }, () => new WTCore(sr))
  }

  noteOn(note: number, v: number) {
    switch (this.polyMode) {
      case 0: // MONO
        this.cores[0].noteOn(note, v)
        return
      case 1: { // POLY16
        for (let i = 0; i < 16; i++) {
          if (this.activeNotes[i] === note) {
            this.cores[i].noteOn(note, v)
            return
          }
        }
        const idx = this.nextVoice
        this.nextVoice = (this.nextVoice + 1) % 16
        this.activeNotes[idx] = note
        this.cores[idx].noteOn(note, v)
        return
      }
      case 2: { // WIDE8 — 8 stereo-detuned pairs
        for (let i = 0; i < 8; i++) {
          if (this.activeNotes[i] === note) {
            this._wideNoteOn(i, note, v)
            return
          }
        }
        const idx = this.nextVoice % 8
        this.nextVoice = (this.nextVoice + 1) % 8
        this.activeNotes[idx] = note
        this._wideNoteOn(idx, note, v)
        return
      }
      case 3: // UNISON — all 16 cores on one note
        for (let i = 0; i < 16; i++) {
          const detune = (i - 7.5) / 7.5 * this.wideDetune
          this.cores[i].noteOn(note, v)
          this.cores[i].freq *= (1 + detune)
        }
        this.activeNotes[0] = note
        return
    }
  }

  private _wideNoteOn(pair: number, note: number, v: number) {
    const cL = this.cores[pair * 2]
    const cR = this.cores[pair * 2 + 1]
    cL.noteOn(note, v)
    cR.noteOn(note, v)
    cL.freq *= (1 - this.wideDetune * 0.5)
    cR.freq *= (1 + this.wideDetune * 0.5)
  }

  noteOff() {
    if (this.polyMode === 0) {
      this.cores[0].noteOff()
      return
    }
    for (let i = 0; i < 16; i++) {
      this.cores[i].noteOff()
      this.activeNotes[i] = -1
    }
  }

  slideNote(note: number, v: number) {
    if (this.polyMode === 0) {
      this.cores[0].slideNoteTo(note, v)
      return
    }
    if (this.polyMode === 3) {
      this.noteOn(note, v)
      return
    }
    if (this.polyMode === 2) {
      const prev = ((this.nextVoice - 1 + 8) % 8)
      this.activeNotes[prev] = note
      this._wideNoteOn(prev, note, v)
      return
    }
    // Poly16
    const prev = (this.nextVoice - 1 + 16) % 16
    this.cores[prev].slideNoteTo(note, v)
    this.activeNotes[prev] = note
  }

  reset() {
    for (let i = 0; i < 16; i++) { this.cores[i].reset(); this.activeNotes[i] = -1 }
    this.nextVoice = 0
  }

  // √N scaling — based on typical simultaneous notes, not max polyphony
  private static readonly POLY_SCALE = 1 / Math.sqrt(8)   // ≈0.35
  private static readonly WIDE_SCALE = 1 / Math.sqrt(8)   // ≈0.35
  private static readonly UNI_SCALE  = 1 / Math.sqrt(16)  // 0.25

  tick(): number {
    if (this.polyMode === 0) return this.cores[0].tick()
    let sum = 0
    for (let i = 0; i < 16; i++) sum += this.cores[i].tick()
    return sum * (this.polyMode === 2 ? WTSynth.WIDE_SCALE
      : this.polyMode === 3 ? WTSynth.UNI_SCALE : WTSynth.POLY_SCALE)
  }

  tickStereo(out: Float32Array) {
    if (this.polyMode === 0) {
      this.cores[0].tickStereo(out)
      return
    }
    if (this.polyMode === 2) {
      // WIDE8: even=L, odd=R
      let sumL = 0, sumR = 0
      for (let p = 0; p < 8; p++) {
        this.cores[p * 2].tickStereo(this._stereoTmp)
        sumL += this._stereoTmp[0]
        this.cores[p * 2 + 1].tickStereo(this._stereoTmp)
        sumR += this._stereoTmp[1]
      }
      const s = WTSynth.WIDE_SCALE
      out[0] = sumL * s; out[1] = sumR * s
      return
    }
    // Poly16 / Unison: sum stereo from all cores
    let sumL = 0, sumR = 0
    for (let i = 0; i < 16; i++) {
      this.cores[i].tickStereo(this._stereoTmp)
      sumL += this._stereoTmp[0]; sumR += this._stereoTmp[1]
    }
    const s = this.polyMode === 3 ? WTSynth.UNI_SCALE : WTSynth.POLY_SCALE
    out[0] = sumL * s; out[1] = sumR * s
  }

  setParam(key: string, value: number) {
    if (key === 'polyMode') {
      const newMode = Math.round(value)
      if (newMode !== this.polyMode) {
        for (let i = (newMode === 0 ? 1 : 0); i < 16; i++) {
          if (newMode === 0 && i > 0) { this.cores[i].noteOff(); this.activeNotes[i] = -1 }
        }
        this.polyMode = newMode
        this.nextVoice = 0
      }
      return
    }
    if (key === 'wideDetune') {
      this.wideDetune = value
      return
    }
    // Cap unison in poly mode (ADR 063 mitigation)
    if (key === 'unisonVoices' && this.polyMode > 0) value = Math.min(value, 3)
    // Apply param to all 16 cores
    const n = 16
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
        case 'filterType':   c.filterType = Math.round(value) as WTFilterType; break
        case 'drive':        c.drive = value; break
        case 'driveType':    c.driveType = Math.round(value) as DriveType; break
        case 'modWheel':     c.modWheel = value; break
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
