/**
 * Sampler voices: SamplerVoice (ADR 012) and PolySampler (ADR 106 Phase 4).
 */
import type { Voice } from './voice-common.ts'

// ── Sample Zone ─────────────────────────────────────────────────────

/** Multi-sample zone: defines which sample plays for a note/velocity range (ADR 106) */
export interface SampleZone {
  buffer: Float32Array
  bufferSR: number
  rootNote: number    // MIDI note this sample was recorded at
  loNote: number      // lowest MIDI note (inclusive)
  hiNote: number      // highest MIDI note (inclusive)
  loVel: number       // velocity lower bound 0–127
  hiVel: number       // velocity upper bound 0–127
}

// ── SamplerVoice ────────────────────────────────────────────────────

export class SamplerVoice implements Voice {
  // Multi-sample zones (ADR 106) — single-sample loadSample wraps into one zone
  private zones: SampleZone[] = []
  private activeZone: SampleZone | null = null

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
  private chopSlices = 0 // 0=OFF, 8, 16, 32
  private chopMode = 0   // 0=NOTE-MAP, 1=SEQ
  private seqIndex = 0   // current slice for SEQ mode
  private activeStart = 0 // resolved start for current note (after chop)
  private activeEnd = 1   // resolved end for current note (after chop)
  private sampleBPM = 0   // 0=OFF, else original BPM of sample
  private loopMode = 0    // 0=ONE-SHOT, 1=LOOP
  private stretchMode = 0 // 0=REPITCH, 1=WSOLA
  private currentBPM = 120 // current song BPM (set from worklet)

  // WSOLA state
  private static readonly WIN = 2048    // window size in samples (~46ms @44.1kHz)
  private static readonly HOP_RATIO = 0.5
  private wsolaOut = new Float32Array(SamplerVoice.WIN) // overlap-add output ring
  private wsolaReadPos = 0   // read position in output ring
  private wsolaWritePos = 0  // write position in output ring
  private wsolaAvail = 0     // samples available in output ring
  private wsolaInputPos = 0  // fractional position in source buffer
  private wsolaActive = false

  // Loop crossfade (2ms Hann window to eliminate clicks at loop boundary)
  private static readonly XFADE = 96  // ~2ms @ 48kHz
  private xfadePos = 0       // countdown within crossfade region (0 = not active)
  private xfadeFrom = 0      // cursor position in the "old" region for crossfade blend

  private readonly sr: number

  constructor(sr: number) {
    this.sr = sr
    this._updateEnvCoeffs()
  }

  /** Normalize a buffer for consistent loudness: RMS-based gain with peak cap */
  private _normalizeBuffer(buffer: Float32Array): void {
    // Single-pass: compute peak and RMS on original buffer
    let peak = 0
    let sumSq = 0
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i]
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
      sumSq += v * v
    }
    if (peak === 0) return  // silence
    const rms = Math.sqrt(sumSq / buffer.length)

    // Choose gain: boost to target RMS (-12 dBFS ≈ 0.25), but cap so peak stays ≤ 0.95
    const TARGET_RMS = 0.25
    let gain: number
    if (rms > 0 && rms < TARGET_RMS) {
      gain = Math.min(TARGET_RMS / rms, 0.95 / peak)
    } else {
      // RMS already at/above target — just peak-normalize
      gain = 1 / peak
    }
    if (gain !== 1) {
      for (let i = 0; i < buffer.length; i++) buffer[i] *= gain
    }
  }

  /** Load a single sample — wraps into one full-range zone (backwards compatible) */
  loadSample(buffer: Float32Array, bufferSR: number): void {
    this._normalizeBuffer(buffer)
    this.zones = [{
      buffer, bufferSR, rootNote: this.rootNote,
      loNote: 0, hiNote: 127, loVel: 0, hiVel: 127
    }]
    this.activeZone = this.zones[0]
  }

  /** Load a pre-normalized sample (skip normalization — used by PolySampler for cores 1–7) */
  loadSampleNormalized(buffer: Float32Array, bufferSR: number): void {
    this.zones = [{
      buffer, bufferSR, rootNote: this.rootNote,
      loNote: 0, hiNote: 127, loVel: 0, hiVel: 127
    }]
    this.activeZone = this.zones[0]
  }

  /** Load multiple zones for multi-sample instruments (ADR 106) */
  loadZones(zones: SampleZone[]): void {
    // Global peak normalization — preserves relative dynamics across zones
    let globalPeak = 0
    for (const z of zones) {
      for (let i = 0; i < z.buffer.length; i++) {
        const a = Math.abs(z.buffer[i])
        if (a > globalPeak) globalPeak = a
      }
    }
    if (globalPeak > 0 && globalPeak !== 1) {
      const scale = 1 / globalPeak
      for (const z of zones) {
        for (let i = 0; i < z.buffer.length; i++) z.buffer[i] *= scale
      }
    }
    // Short fade-in (64 samples ≈1.3ms @48kHz) to remove Opus pre-skip artifacts
    const FADE_IN = 64
    for (const z of zones) {
      const n = Math.min(FADE_IN, z.buffer.length)
      for (let i = 0; i < n; i++) z.buffer[i] *= i / n
    }
    this.zones = zones.sort((a, b) => a.loNote - b.loNote)
    this.activeZone = this.zones[0] ?? null
  }

  /** Find the best zone for a given note and velocity */
  _findZone(note: number, velocity: number): SampleZone | null {
    if (this.zones.length === 0) return null
    if (this.zones.length === 1) return this.zones[0]

    const vel127 = Math.round(velocity * 127)
    let best: SampleZone | null = null
    let bestDist = Infinity

    for (const z of this.zones) {
      if (note < z.loNote || note > z.hiNote) continue
      if (vel127 < z.loVel || vel127 > z.hiVel) continue
      const dist = Math.abs(note - z.rootNote)
      if (dist < bestDist) { best = z; bestDist = dist }
    }

    // Fallback: if no zone matched, pick the closest zone by note distance
    if (!best) {
      for (const z of this.zones) {
        const dist = note < z.loNote ? z.loNote - note
                   : note > z.hiNote ? note - z.hiNote
                   : Math.abs(note - z.rootNote)
        if (dist < bestDist) { best = z; bestDist = dist }
      }
    }

    return best
  }

  noteOn(note: number, velocity: number): void {
    // Zone selection (ADR 106)
    const zone = this._findZone(note, velocity)
    if (!zone) return
    this.activeZone = zone

    const buf = zone.buffer
    const srRatio = zone.bufferSR / this.sr
    const semis = (note - zone.rootNote) + this.pitchShift
    // BPM sync: repitch to match tempo, then apply pitch shift on top
    if (this.sampleBPM > 0) {
      this.rate = (this.currentBPM / this.sampleBPM) * srRatio * Math.pow(2, this.pitchShift / 12)
    } else {
      this.rate = Math.pow(2, semis / 12) * srRatio
    }

    let s = this.start
    let e = this.end

    if (this.chopSlices > 0) {
      const sliceSize = 1 / this.chopSlices
      let idx: number
      if (this.chopMode === 0) {
        // NOTE-MAP: note offset selects slice (relative to zone rootNote)
        idx = ((note - zone.rootNote) % this.chopSlices + this.chopSlices) % this.chopSlices
      } else {
        // SEQ: advance to next slice each noteOn
        idx = this.seqIndex
        this.seqIndex = (this.seqIndex + 1) % this.chopSlices
      }
      s = idx * sliceSize
      e = s + sliceSize
    }

    this.activeStart = s
    this.activeEnd = e
    const startSample = Math.floor(s * buf.length)
    const endSample = Math.floor(e * buf.length)
    this.cursor = this.reverse ? endSample - 1 : startSample
    this.amp = velocity
    this.ampTarget = velocity
    this.playing = true

    // WSOLA init
    this.wsolaActive = this.stretchMode === 1 && this.sampleBPM > 0
    if (this.wsolaActive) {
      this.wsolaInputPos = startSample
      this.wsolaReadPos = 0
      this.wsolaWritePos = 0
      this.wsolaAvail = 0
      this.wsolaOut.fill(0)
      // Pre-fill first hop
      this._wsolaHop()
    }
  }

  noteOff(): void {
    // One-shot samples play to natural end; only looped samples respond to noteOff
    if (this.loopMode) this.ampTarget = 0
  }

  slideNote(note: number, _velocity: number): void {
    if (!this.activeZone) return
    const semis = (note - this.activeZone.rootNote) + this.pitchShift
    this.rate = Math.pow(2, semis / 12) * (this.activeZone.bufferSR / this.sr)
  }

  tick(): number {
    if (!this.playing || !this.activeZone) return 0
    const buf = this.activeZone.buffer

    let sample: number

    if (this.wsolaActive) {
      // WSOLA mode: read from output ring at playback rate
      const WIN = SamplerVoice.WIN
      const hop = Math.floor(WIN * SamplerVoice.HOP_RATIO)

      if (this.wsolaAvail <= 0) {
        if (!this.loopMode) { this.playing = false; return 0 }
        this._wsolaHop()
        if (!this.wsolaActive) { this.playing = false; return 0 }
      }

      sample = this.wsolaOut[this.wsolaReadPos]
      this.wsolaReadPos = (this.wsolaReadPos + 1) % WIN
      this.wsolaAvail--

      // Refill when running low
      if (this.wsolaAvail < hop) {
        this._wsolaHop()
      }
    } else {
      // Normal / repitch mode
      const startSample = Math.floor(this.activeStart * buf.length)
      const endSample = Math.floor(this.activeEnd * buf.length)

      // Interpolated read helper
      const lerp = (pos: number): number => {
        const i = Math.floor(pos)
        if (i < 0 || i >= buf.length) return 0
        const f = pos - i
        const a = buf[i]
        const b = i + 1 < buf.length ? buf[i + 1] : a
        return a + (b - a) * f
      }

      const idx = Math.floor(this.cursor)
      if (idx < 0 || idx >= buf.length) { this.playing = false; return 0 }
      sample = lerp(this.cursor)

      // Crossfade blend: mix outgoing region with incoming region
      if (this.xfadePos > 0) {
        const XFADE = SamplerVoice.XFADE
        const t = (XFADE - this.xfadePos) / XFADE  // 0→1 over crossfade
        // Hann fade-in: 0.5 * (1 - cos(πt))
        const fadeIn = 0.5 * (1 - Math.cos(Math.PI * t))
        const fadeOut = 1 - fadeIn
        const old = lerp(this.xfadeFrom)
        sample = sample * fadeIn + old * fadeOut
        // Advance the "from" cursor in the same direction
        if (this.reverse) this.xfadeFrom -= this.rate
        else this.xfadeFrom += this.rate
        this.xfadePos--
      }

      // Advance cursor
      if (this.reverse) {
        this.cursor -= this.rate
        if (this.cursor < startSample) {
          if (this.loopMode) {
            this.xfadeFrom = this.cursor  // continue reading from old position
            this.xfadePos = SamplerVoice.XFADE
            this.cursor = endSample - 1
          }
          else { this.playing = false; return 0 }
        }
      } else {
        this.cursor += this.rate
        if (this.cursor >= endSample) {
          if (this.loopMode) {
            this.xfadeFrom = this.cursor  // continue reading from old position
            this.xfadePos = SamplerVoice.XFADE
            this.cursor = startSample
          }
          else { this.playing = false; return 0 }
        }
      }
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

    return sample * this.amp * 0.85
  }

  /** Whether this voice is currently producing output */
  isActive(): boolean { return this.playing }

  reset(): void {
    this.playing = false
    this.amp = 0
    this.cursor = 0
    this.xfadePos = 0
  }

  setParam(key: string, value: number): void {
    switch (key) {
      case 'rootNote':   this.rootNote = Math.round(value); break
      case 'start':      this.start = Math.max(0, Math.min(1, value)); break
      case 'end':        this.end = Math.max(0, Math.min(1, value)); break
      case 'decay':      this.decay = value; this._updateEnvCoeffs(); break
      case 'reverse':    this.reverse = value >= 0.5 ? 1 : 0; break
      case 'pitchShift': this.pitchShift = value; break
      case 'chopSlices': this.chopSlices = Math.round(value); this.seqIndex = 0; break
      case 'chopMode':   this.chopMode = value >= 0.5 ? 1 : 0; this.seqIndex = 0; break
      case 'sampleBPM':   this.sampleBPM = Math.round(value); break
      case 'loopMode':    this.loopMode = value >= 0.5 ? 1 : 0; break
      case 'stretchMode': this.stretchMode = value >= 0.5 ? 1 : 0; break
      case 'bpm':         this.currentBPM = value; break
    }
  }

  /** WSOLA: find best overlap offset within ±tolerance using cross-correlation */
  private _wsolaFindBest(ideal: number, startSamp: number, endSamp: number): number {
    const buf = this.activeZone!.buffer
    const WIN = SamplerVoice.WIN
    const tolerance = WIN >> 2  // search ±quarter window
    const prevEnd = this.wsolaWritePos  // tail of previous window in ring
    let bestOff = 0
    let bestCorr = -Infinity
    for (let d = -tolerance; d <= tolerance; d++) {
      const cand = ideal + d
      if (cand < startSamp || cand + WIN > endSamp) continue
      let corr = 0
      // correlate overlap region (first half of new window vs tail of ring)
      const overlap = WIN >> 1
      for (let j = 0; j < overlap; j++) {
        const ringIdx = (prevEnd - overlap + j + WIN) % WIN
        corr += buf[cand + j] * this.wsolaOut[ringIdx]
      }
      if (corr > bestCorr) { bestCorr = corr; bestOff = d }
    }
    return ideal + bestOff
  }

  /** WSOLA: synthesize one hop of output into the ring buffer */
  private _wsolaHop(): void {
    const buf = this.activeZone!.buffer
    const WIN = SamplerVoice.WIN
    const hop = Math.floor(WIN * SamplerVoice.HOP_RATIO)
    const startSamp = Math.floor(this.activeStart * buf.length)
    const endSamp = Math.floor(this.activeEnd * buf.length)
    const regionLen = endSamp - startSamp

    if (regionLen < WIN) { this.wsolaActive = false; return }

    // Ideal input position (original speed through source)
    let idealPos = Math.floor(this.wsolaInputPos)
    if (idealPos + WIN > endSamp) {
      if (this.loopMode) {
        this.wsolaInputPos = startSamp
        idealPos = startSamp
      } else {
        this.wsolaActive = false
        return
      }
    }
    if (idealPos < startSamp) idealPos = startSamp

    // Find best alignment via cross-correlation
    const bestPos = this.wsolaAvail > 0
      ? this._wsolaFindBest(idealPos, startSamp, endSamp)
      : idealPos

    // Overlap-add: crossfade old tail with new window
    const overlap = WIN >> 1
    for (let j = 0; j < WIN; j++) {
      const srcVal = bestPos + j < endSamp ? buf[bestPos + j] : 0
      if (j < overlap && this.wsolaAvail > 0) {
        // Crossfade region: blend old ring content with new
        const fadeIn = j / overlap
        const ringIdx = (this.wsolaWritePos + j) % WIN
        this.wsolaOut[ringIdx] = this.wsolaOut[ringIdx] * (1 - fadeIn) + srcVal * fadeIn
      } else {
        const ringIdx = (this.wsolaWritePos + j) % WIN
        this.wsolaOut[ringIdx] = srcVal
      }
    }

    this.wsolaWritePos = (this.wsolaWritePos + hop) % WIN
    this.wsolaAvail = Math.min(this.wsolaAvail + hop, WIN)
    // Advance input position at original playback speed (SR-compensated)
    const srRatio = this.activeZone!.bufferSR / this.sr
    this.wsolaInputPos += hop * srRatio
  }

  private _updateEnvCoeffs(): void {
    // One-pole smoothing: coeff ≈ 1 - e^(-1/(time*sr))
    this.ampCoeff = 1 - Math.exp(-1 / (0.005 * this.sr))  // 5ms attack
    this.releaseCoeff = 1 - Math.exp(-1 / (0.01 * this.sr)) // 10ms release
  }
}

// ── Polyphonic Sampler (ADR 106 Phase 4) ─────────────────────────────

const POLY_SAMPLER_VOICES = 8

export class PolySampler implements Voice {
  private cores: SamplerVoice[]
  private nextVoice = 0
  private activeNotes = new Int8Array(POLY_SAMPLER_VOICES).fill(-1)

  constructor(sr: number) {
    this.cores = Array.from({ length: POLY_SAMPLER_VOICES }, () => new SamplerVoice(sr))
  }

  /** Load a single sample to all cores (normalize once, then distribute) */
  loadSample(buffer: Float32Array, bufferSR: number): void {
    // Normalize once on the first core, then share the already-normalized buffer
    this.cores[0].loadSample(buffer, bufferSR)
    // Remaining cores: assign directly (buffer already normalized by core 0)
    for (let i = 1; i < POLY_SAMPLER_VOICES; i++) {
      this.cores[i].loadSampleNormalized(buffer, bufferSR)
    }
  }

  /** Load multi-sample zones to all cores (ADR 106) */
  loadZones(zones: SampleZone[]): void {
    for (const c of this.cores) c.loadZones(zones)
  }

  noteOn(note: number, velocity: number): void {
    // Retrigger if same note already active
    for (let i = 0; i < POLY_SAMPLER_VOICES; i++) {
      if (this.activeNotes[i] === note) {
        this.cores[i].noteOn(note, velocity)
        return
      }
    }
    // Allocate next voice (round-robin)
    const idx = this.nextVoice
    this.nextVoice = (this.nextVoice + 1) % POLY_SAMPLER_VOICES
    this.activeNotes[idx] = note
    this.cores[idx].noteOn(note, velocity)
  }

  noteOff(): void {
    for (let i = 0; i < POLY_SAMPLER_VOICES; i++) {
      this.cores[i].noteOff()
      this.activeNotes[i] = -1
    }
  }

  slideNote(note: number, velocity: number): void {
    // Sampler: retrigger with new note (zone selection needs noteOn, not pitch bend)
    this.noteOn(note, velocity)
  }

  tick(): number {
    let sum = 0
    let active = 0
    for (let i = 0; i < POLY_SAMPLER_VOICES; i++) {
      sum += this.cores[i].tick()
      if (this.cores[i].isActive()) active++
    }
    // Dynamic gain: scale by active voice count instead of fixed 8-voice headroom.
    // Sampler voices decay naturally, so single notes play at full level
    // while chords get appropriate scaling to avoid clipping.
    return active <= 1 ? sum : sum / Math.sqrt(active)
  }

  reset(): void {
    for (let i = 0; i < POLY_SAMPLER_VOICES; i++) {
      this.cores[i].reset()
      this.activeNotes[i] = -1
    }
    this.nextVoice = 0
  }

  setParam(key: string, value: number): void {
    for (const c of this.cores) c.setParam(key, value)
  }
}
