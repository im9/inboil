/**
 * worklet-processor.ts — AudioWorklet entry point (dedicated audio thread).
 *
 * Signal chain:
 *   voices ──┬──────────────────────── dry (kick separated for sidechain bypass)
 *            ├─ reverbSend   ──► Reverb ──┐
 *            ├─ delaySend    ──► Delay  ──┤
 *            ├─ glitchSend   ──► Glitch ──┤
 *            └─ granularSend ──► Gran   ──┴─► sum ──► SidechainDucker
 *                                                         │
 *                                                   BusCompressor
 *                                                         │
 *                                                     3-band EQ
 *                                                         │
 *                                                     Break gate
 *                                                         │
 *                                                    Master gain
 *                                                         │
 *                                                    PeakLimiter
 *                                                         │
 *                                                       output
 */

// ── AudioWorklet globals ──────────────────────────────────────────────────────
declare class AudioWorkletProcessor {
  constructor(opts?: AudioWorkletNodeOptions)
  readonly port: MessagePort
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean
}
declare function registerProcessor(name: string, ctor: new (opts?: AudioWorkletNodeOptions) => AudioWorkletProcessor): void
declare const sampleRate: number

// ── Imports ───────────────────────────────────────────────────────────────────
import { ResonantLP, BiquadHP } from './dsp/filters.ts'
import { SimpleReverb, PingPongDelay, SidechainDucker, BusCompressor, PeakLimiter, GranularProcessor } from './dsp/effects.ts'
import { makeVoice } from './dsp/voices.ts'
import type { Voice } from './dsp/voices.ts'
import type { WorkletCommand, WorkletTrack, WorkletEvent } from './dsp/types.ts'

// Re-export types for engine.ts
export type { WorkletCommand, WorkletPattern, WorkletTrack, WorkletEvent } from './dsp/types.ts'
export type { WorkletTrig } from './dsp/types.ts'

// ── Diatonic transposition — OP-XY Brain style ───────────────────────────────

const BASE_SCALE = [0, 2, 4, 5, 7, 9, 11]

const SCALE_TEMPLATES: number[][] = [
  [0, 2, 4, 5, 7, 9, 11],  //  0 C  Ionian (major)
  [0, 2, 4, 5, 7, 9, 11],  //  1 C# major (chromatic)
  [0, 2, 3, 5, 7, 9, 10],  //  2 D  Dorian
  [0, 2, 4, 5, 7, 9, 11],  //  3 Eb major (chromatic)
  [0, 1, 3, 5, 7, 8, 10],  //  4 E  Phrygian
  [0, 2, 4, 6, 7, 9, 11],  //  5 F  Lydian
  [0, 2, 4, 5, 7, 9, 11],  //  6 F# major (chromatic)
  [0, 2, 4, 5, 7, 9, 10],  //  7 G  Mixolydian
  [0, 2, 4, 5, 7, 9, 11],  //  8 Ab major (chromatic)
  [0, 2, 3, 5, 7, 8, 10],  //  9 A  Aeolian (natural minor)
  [0, 2, 4, 5, 7, 9, 11],  // 10 Bb major (chromatic)
  [0, 1, 3, 5, 6, 8, 10],  // 11 B  Locrian
]

const PC_TO_DEG = new Int8Array(12)
for (let pc = 0; pc < 12; pc++) {
  let best = 0, bestDist = 12
  for (let d = 0; d < 7; d++) {
    const dist = Math.min(Math.abs(pc - BASE_SCALE[d]), 12 - Math.abs(pc - BASE_SCALE[d]))
    if (dist < bestDist) { bestDist = dist; best = d }
  }
  PC_TO_DEG[pc] = best
}

function transposeNote(storedMidi: number, root: number, octShift: number): number {
  const shifted = storedMidi + octShift * 12
  if (root === 0) return shifted
  const pc = shifted % 12
  const oct = Math.floor(shifted / 12)
  const degree = PC_TO_DEG[pc]
  const chromaOffset = pc - BASE_SCALE[degree]
  const scale = SCALE_TEMPLATES[root]
  return root + scale[degree] + chromaOffset + oct * 12
}

// ── Processor ─────────────────────────────────────────────────────────────────

class GrooveboxProcessor extends AudioWorkletProcessor {
  private voices: Voice[] = []
  private tracks: WorkletTrack[] = []
  private playheads: number[] = new Array(8).fill(0)
  private playing = false
  private bpm = 120
  private samplesPerStep = 0
  private accumulator = 0

  // FX
  private reverb = new SimpleReverb(sampleRate)
  private delay  = new PingPongDelay(1000, sampleRate)
  private ducker = new SidechainDucker(sampleRate)
  private comp   = new BusCompressor(sampleRate)
  // 3-band EQ crossover (subtractive design)
  private eqLpL = new ResonantLP()
  private eqLpR = new ResonantLP()
  private eqHpL = new BiquadHP()
  private eqHpR = new BiquadHP()

  // Param cache
  private delayFeedback  = 0.42
  private duckDepth      = 0.85
  private compThreshold  = 0.30
  private compRatio      = 6
  private compMakeup     = 2.2

  // Performance
  private rootNote       = 0
  private octave         = 0
  private eqLow          = 0.5
  private eqMid          = 0.5
  private eqHigh         = 0.5
  private breaking       = false
  private masterGain     = 0.8
  private glitchX        = 0.5
  private glitchY        = 0.5
  private filling        = false
  private reversing      = false
  private swing          = 0.5          // effective swing 0.5–0.75
  private swingPhase     = 0            // 0 or 1, toggles each step
  private currentThreshold = 0          // samples until next step (swing-adjusted)
  private gateEnv        = 1.0
  private limiter        = new PeakLimiter(sampleRate)
  // Step-quantized pending values
  private pendingRootNote: number | null = null
  private pendingOctave: number | null = null
  private pendingBreaking: boolean | null = null
  private pendingFilling: boolean | null = null
  private pendingReversing: boolean | null = null
  // Per-track mute fade and precomputed pan gains
  private muteGains      = new Float64Array(8).fill(1.0)
  private panGainsL      = new Float64Array(8).fill(Math.SQRT1_2)
  private panGainsR      = new Float64Array(8).fill(Math.SQRT1_2)
  // Fill PRNG
  private fillSeed       = 12321
  // Glitch DSP state
  private glitchHoldL    = 0
  private glitchHoldR    = 0
  private glitchCounter  = 0
  private glitchSeed     = 55555
  // Granular DSP
  private granular       = new GranularProcessor(sampleRate)

  constructor(opts?: AudioWorkletNodeOptions) {
    super(opts)
    this.samplesPerStep = this._calcSps()
    this.currentThreshold = this.samplesPerStep
    this.delay.setTime(375)
    this.reverb.setSize(0.72); this.reverb.setDamp(0.5)
    this.eqLpL.setParams(300, 0.707, sampleRate)
    this.eqLpR.setParams(300, 0.707, sampleRate)
    this.eqHpL.setParams(3000, 0.707, sampleRate)
    this.eqHpR.setParams(3000, 0.707, sampleRate)

    this.port.onmessage = (e: MessageEvent<WorkletCommand>) => {
      const cmd = e.data
      switch (cmd.type) {
        case 'play':
          if (this.pendingRootNote !== null) { this.rootNote = this.pendingRootNote; this.pendingRootNote = null }
          if (this.pendingBreaking !== null) { this.breaking = this.pendingBreaking; this.pendingBreaking = null }
          if (this.pendingFilling !== null) { this.filling = this.pendingFilling; this.pendingFilling = null }
          if (this.pendingReversing !== null) { this.reversing = this.pendingReversing; this.pendingReversing = null }
          this.playing = true; this.accumulator = 0; this.swingPhase = 0
          this.currentThreshold = (1 - this.swing) * 2 * this.samplesPerStep
          break
        case 'stop':
          this.playing = false; this.playheads.fill(0)
          for (const v of this.voices) v.reset()
          break
        case 'setBpm':
          if (cmd.bpm !== undefined) {
            this.bpm = cmd.bpm; this.samplesPerStep = this._calcSps()
            this.currentThreshold = this.swingPhase === 0
              ? (1 - this.swing) * 2 * this.samplesPerStep
              : this.swing * 2 * this.samplesPerStep
          }
          break
        case 'setPattern': {
          if (!cmd.pattern) break
          const p = cmd.pattern
          this.bpm = p.bpm; this.samplesPerStep = this._calcSps()
          this.swing = 0.5 + p.perf.swing * 0.17
          this.currentThreshold = this.swingPhase === 0
            ? (1 - this.swing) * 2 * this.samplesPerStep
            : this.swing * 2 * this.samplesPerStep
          if (this.voices.length !== p.tracks.length)
            this.voices = p.tracks.map((t, i) => makeVoice(i, t.synthType, sampleRate))
          for (let i = 0; i < p.tracks.length; i++) {
            const vp = p.tracks[i].voiceParams
            if (vp && this.voices[i]) {
              for (const k in vp) this.voices[i].setParam(k, vp[k])
            }
          }
          this.tracks = p.tracks
          for (let i = 0; i < p.tracks.length; i++) {
            const angle = ((p.tracks[i].pan ?? 0) + 1) * 0.25 * Math.PI
            this.panGainsL[i] = Math.cos(angle)
            this.panGainsR[i] = Math.sin(angle)
          }
          this.reverb.setSize(p.fx.reverb.size)
          this.reverb.setDamp(p.fx.reverb.damp)
          this.delay.setTime(p.fx.delay.time)
          this.delayFeedback = p.fx.delay.feedback
          this.duckDepth     = p.fx.ducker.depth
          this.ducker.setRelease(p.fx.ducker.release)
          this.compThreshold = p.fx.comp.threshold
          this.compRatio     = p.fx.comp.ratio
          this.compMakeup    = p.fx.comp.makeup
          this.pendingRootNote  = p.perf.rootNote
          this.pendingOctave    = p.perf.octave
          this.pendingBreaking  = p.perf.breaking
          this.pendingFilling   = p.perf.filling
          this.pendingReversing = p.perf.reversing
          this.glitchX   = p.perf.glitchX
          this.glitchY   = p.perf.glitchY
          this.granular.setParams(p.perf.granularX, p.perf.granularY)
          this.granular.setActive(p.perf.granularOn)
          this.eqLow      = p.perf.eqLow
          this.eqMid      = p.perf.eqMid
          this.eqHigh     = p.perf.eqHigh
          this.masterGain = p.perf.masterGain
          break
        }
      }
    }
  }

  private _calcSps() { return (60 / this.bpm / 4) * sampleRate }

  private _advanceStep() {
    if (this.pendingRootNote !== null) { this.rootNote = this.pendingRootNote; this.pendingRootNote = null }
    if (this.pendingBreaking !== null) { this.breaking = this.pendingBreaking; this.pendingBreaking = null }
    if (this.pendingFilling !== null) { this.filling = this.pendingFilling; this.pendingFilling = null }
    if (this.pendingReversing !== null) { this.reversing = this.pendingReversing; this.pendingReversing = null }

    for (let t = 0; t < this.tracks.length; t++) {
      const track = this.tracks[t]
      if (!track || track.steps === 0) continue
      if (this.reversing) {
        this.playheads[t] = (this.playheads[t] - 1 + track.steps) % track.steps
      } else {
        this.playheads[t] = (this.playheads[t] + 1) % track.steps
      }
      const trig = track.trigs[this.playheads[t]]

      if (this.filling && t <= 5) {
        this.fillSeed = (this.fillSeed * 1664525 + 1013904223) >>> 0
        const rand = (this.fillSeed >>> 16) / 65536
        const prob = t === 0 ? 0.25 : t === 1 ? 0.75 : t === 2 ? 0.35 : t === 3 ? 0.85 : t === 4 ? 0.20 : 0.10
        if (rand < prob) {
          if (t === 0) this.ducker.trigger(this.duckDepth)
          if (!track.muted) this.voices[t]?.noteOn(trig?.note ?? 60, 0.6 + rand * 0.4)
        }
      } else if (trig?.active) {
        if (t === 0) this.ducker.trigger(this.duckDepth)
        if (!track.muted) {
          const note = t >= 6 ? transposeNote(trig.note, this.rootNote, this.octave) : trig.note
          this.voices[t]?.noteOn(note, trig.velocity)
        }
      }
    }
    if (this.playheads[0] === 0 && this.pendingOctave !== null) {
      this.octave = this.pendingOctave; this.pendingOctave = null
    }
    this.port.postMessage({ type: 'step', playheads: [...this.playheads] } satisfies WorkletEvent)
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const outL = outputs[0]?.[0]
    const outR = outputs[0]?.[1] ?? outputs[0]?.[0]
    if (!outL) return true

    for (let s = 0; s < outL.length; s++) {
      let kickDry = 0
      let restL = 0, restR = 0
      let reverbIn = 0, delayIn = 0, glitchIn = 0, granularIn = 0

      if (this.playing) {
        this.accumulator++
        if (this.accumulator >= this.currentThreshold) {
          this.accumulator -= this.currentThreshold
          this._advanceStep()
          this.swingPhase ^= 1
          this.currentThreshold = this.swingPhase === 1
            ? this.swing * 2 * this.samplesPerStep
            : (1 - this.swing) * 2 * this.samplesPerStep
        }
        for (let t = 0; t < this.voices.length; t++) {
          const track = this.tracks[t]
          const muteTarget = track?.muted ? 0.0 : 1.0
          const mc = muteTarget > this.muteGains[t] ? 0.02 : 0.002
          this.muteGains[t] += (muteTarget - this.muteGains[t]) * mc
          if (this.muteGains[t] < 0.0001 && track?.muted) continue
          const sig = this.voices[t].tick() * this.muteGains[t] * (track?.volume ?? 0.8)
          if (t === 0) {
            kickDry += sig
          } else {
            restL += sig * this.panGainsL[t]; restR += sig * this.panGainsR[t]
          }
          reverbIn   += sig * (track?.reverbSend   ?? 0)
          delayIn    += sig * (track?.delaySend    ?? 0)
          glitchIn   += sig * (track?.glitchSend   ?? 0)
          granularIn += sig * (track?.granularSend ?? 0)
        }
      }

      // FX run always (tails ring out after stop)
      const rev = this.reverb.process(reverbIn)
      const del = this.delay.process(delayIn, delayIn, this.delayFeedback)
      const grn = this.granular.process(granularIn, granularIn)

      // Glitch send: downsample + bitcrush on send bus
      let gltL = 0, gltR = 0
      if (glitchIn !== 0 || this.glitchHoldL !== 0 || this.glitchHoldR !== 0) {
        const holdMax = Math.floor(2 + this.glitchX * 30)
        if (this.glitchCounter <= 0) {
          this.glitchHoldL = glitchIn
          this.glitchHoldR = glitchIn
          this.glitchSeed = (this.glitchSeed * 1664525 + 1013904223) >>> 0
          this.glitchCounter = Math.max(1, holdMax - ((this.glitchSeed >>> 16) % Math.max(1, holdMax >> 1)))
        }
        this.glitchCounter--
        const levels = Math.floor(4 + (1 - this.glitchY) * 252)
        gltL = Math.round(this.glitchHoldL * levels) / levels
        gltR = Math.round(this.glitchHoldR * levels) / levels
      }

      // Sidechain: duck rest + FX returns; kick punches through untouched
      const duck = this.ducker.tick()
      const mixL = kickDry + (restL + rev[0] + del[0] + grn[0] + gltL) * duck
      const mixR = kickDry + (restR + rev[1] + del[1] + grn[1] + gltR) * duck

      // Bus compressor
      const cmp = this.comp.process(mixL, mixR, this.compThreshold, this.compRatio, this.compMakeup)

      // ── 3-band DJ EQ (subtractive crossover) ──────────────────────
      const lowL  = this.eqLpL.process(cmp[0])
      const lowR  = this.eqLpR.process(cmp[1])
      const highL = this.eqHpL.process(cmp[0])
      const highR = this.eqHpR.process(cmp[1])
      const midL  = cmp[0] - lowL - highL
      const midR  = cmp[1] - lowR - highR
      const gL = this.eqLow  * 2
      const gM = this.eqMid  * 2
      const gH = this.eqHigh * 2
      let fL = lowL * gL + midL * gM + highL * gH
      let fR = lowR * gL + midR * gM + highR * gH

      // ── Rhythmic break gate ───────────────────────────────────────
      const gateTarget = this.breaking
        ? (this.accumulator < this.currentThreshold * 0.5 ? 1.0 : 0.0)
        : 1.0
      this.gateEnv += (gateTarget - this.gateEnv) * 0.03
      fL *= this.gateEnv
      fR *= this.gateEnv

      // Master gain + peak limiter
      fL *= this.masterGain * 0.8
      fR *= this.masterGain * 0.8
      const lim = this.limiter.process(fL, fR)
      outL[s] = lim[0]
      if (outR) outR[s] = lim[1]
    }

    return true
  }
}

registerProcessor('groovebox-processor', GrooveboxProcessor)
