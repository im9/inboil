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
 *                                                  PeakingEQ ×3
 *                                                         │
 *                                                     DJ Filter
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
import { DJFilter, PeakingEQ, ShelfEQ } from './dsp/filters.ts'
import { SimpleReverb, PingPongDelay, TapeDelay, SidechainDucker, BusCompressor, PeakLimiter, GranularProcessor, StutterBuffer, OctaveShifter } from './dsp/effects.ts'
import { makeVoice, DRUM_VOICES, SamplerVoice } from './dsp/voices.ts'
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

// Scale-degree chord templates (offsets in diatonic degrees from root)
const ARP_CHORD_DEGS: number[][] = [
  [0],           // 0 = OCT  (octave unison, expanded by arpOct)
  [0, 4],        // 1 = 5TH  (root + diatonic 5th)
  [0, 2, 4],     // 2 = TRD  (diatonic triad — auto major/minor)
  [0, 3, 4],     // 3 = SUS  (root + 4th + 5th)
  [0, 2, 4, 6],  // 4 = 7TH  (diatonic 7th — auto quality)
]

/** Generate arp note list using scale-degree intervals resolved via SCALE_TEMPLATES */
function generateArpNotes(base: number, mode: number, chord: number, oct: number, root: number): number[] {
  const scale = SCALE_TEMPLATES[root] ?? SCALE_TEMPLATES[0]
  const degOffsets = ARP_CHORD_DEGS[chord] ?? ARP_CHORD_DEGS[0]

  // Find the scale degree of the base note
  const pc = ((base % 12) - root + 12) % 12
  let baseDeg = 0
  for (let d = 0; d < 7; d++) {
    if (scale[d] <= pc) baseDeg = d
  }

  const baseOctave = Math.floor(base / 12)
  const notes: number[] = []

  for (let o = 0; o < oct; o++) {
    for (const dOff of degOffsets) {
      const deg = baseDeg + dOff + o * 7
      const octShift = Math.floor(deg / 7)
      const scaleDeg = ((deg % 7) + 7) % 7
      notes.push(root + scale[scaleDeg] + (baseOctave + octShift) * 12)
    }
  }

  switch (mode) {
    case 2: notes.reverse(); break  // DOWN
    case 3: {                        // UP-DOWN
      if (notes.length > 1) notes.push(...notes.slice(1, -1).reverse())
      break
    }
    // case 1 (UP) & case 4 (RANDOM): UP order, RANDOM picks at tick time
  }
  return notes
}

// ── Processor ─────────────────────────────────────────────────────────────────

class GrooveboxProcessor extends AudioWorkletProcessor {
  private voices: (Voice | null)[] = []
  private tracks: WorkletTrack[] = []
  private playheads: number[] = new Array(8).fill(0)
  private gateCounters = new Int32Array(8)
  private playing = false
  private bpm = 120
  private samplesPerStep = 0
  private accumulator = 0
  private patternLen = 16   // max step count across all tracks
  private patternPos = 0    // global position within pattern cycle

  // FX
  private reverb = new SimpleReverb(sampleRate)
  private delay  = new PingPongDelay(1000, sampleRate)
  private ducker = new SidechainDucker(sampleRate)
  private comp   = new BusCompressor(sampleRate)
  // 3-band parametric EQ (peaking filters in series, with shelf alternatives for low/high)
  private peakEq = [new PeakingEQ(sampleRate), new PeakingEQ(sampleRate), new PeakingEQ(sampleRate)]
  private shelfEq = [new ShelfEQ(sampleRate, true), new ShelfEQ(sampleRate, false)]  // [0]=low-shelf, [1]=high-shelf
  private eqShelfMode = [false, false]  // [0]=low uses shelf, [1]=high uses shelf

  // Param cache
  private delayFeedback  = 0.42
  private duckDepth      = 0.85
  private compThreshold  = 0.30
  private compRatio      = 6
  private compMakeup     = 2.2
  private verbReturn     = 1.0
  private dlyReturn      = 1.0
  private _stereoTmp     = new Float32Array(2)

  // Performance
  private rootNote       = 0
  private octave         = 0
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
  // Sidechain source flags (ADR 064) — true = triggers ducker & bypasses ducking
  private scSource       = new Uint8Array(8)  // 0 or 1
  // Arpeggiator — per-track state (melodic tracks only)
  private arpNotes:    number[][] = Array.from({length: 8}, () => [])
  private arpIdx       = new Int32Array(8)
  private arpCounter   = new Int32Array(8)
  private arpTickSize  = new Int32Array(8)
  private arpVel       = new Float64Array(8)
  private arpSeed      = new Uint32Array(8).fill(77777)
  // Fill PRNG
  private fillSeed       = 12321
  // Tape delay (ADR 075 Phase 2)
  private tapeDelay      = new TapeDelay(1000, sampleRate)
  private delayTape      = false
  // Shimmer reverb (ADR 075 Phase 2)
  private octShifter     = new OctaveShifter(sampleRate)
  private shimmerAmount  = 0
  private shimmerPrev    = 0       // one-sample feedback from reverb output
  // Stutter glitch (ADR 075 Phase 2)
  private stutter        = new StutterBuffer(sampleRate)
  private glitchStutter  = false
  // Glitch DSP state
  private glitchRedux    = false   // ADR 075: Redux flavour (S&H only, no bit quantize)
  private glitchHoldL    = 0
  private glitchHoldR    = 0
  private glitchCounter  = 0
  private glitchSeed     = 55555
  // Granular DSP
  private granular       = new GranularProcessor(sampleRate)
  // DJ Filter (XY pad sweep)
  private djFilter       = new DJFilter(sampleRate)
  // Peak metering (~60fps)
  private meterPeakL     = 0
  private meterPeakR     = 0
  private meterGrMin     = 1.0  // min gain reduction (most compressed) in meter window
  private meterCount     = 0
  private meterInterval  = Math.round(sampleRate / 60)
  // CPU metering (EMA-smoothed)
  private cpuEma         = 0
  private readonly budgetMs: number

  constructor(opts?: AudioWorkletNodeOptions) {
    super(opts)
    this.samplesPerStep = this._calcSps()
    this.currentThreshold = this.samplesPerStep
    this.budgetMs = 128 / sampleRate * 1000  // render quantum budget
    this.delay.setTime(375)
    this.reverb.setSize(0.72); this.reverb.setDamp(0.5)

    this.port.onmessage = (e: MessageEvent<WorkletCommand>) => {
      const cmd = e.data
      switch (cmd.type) {
        case 'play':
          if (this.pendingRootNote !== null) { this.rootNote = this.pendingRootNote; this.pendingRootNote = null }
          if (this.pendingBreaking !== null) { this.breaking = this.pendingBreaking; this.pendingBreaking = null }
          if (this.pendingFilling !== null) { this.filling = this.pendingFilling; this.pendingFilling = null }
          if (this.pendingReversing !== null) { this.reversing = this.pendingReversing; this.pendingReversing = null }
          this.playing = true; this.swingPhase = 0
          this.currentThreshold = (1 - this.swing) * 2 * this.samplesPerStep
          // Position playheads so first _advanceStep lands on step 0
          for (let t = 0; t < this.tracks.length; t++) {
            const steps = this.tracks[t]?.steps ?? 16
            this.playheads[t] = steps - 1
          }
          this.gateCounters.fill(0)
          this.patternPos = 0  // cycle fires after patternLen advances
          this.accumulator = this.currentThreshold  // trigger step 0 immediately
          break
        case 'stop':
          this.playing = false; this.playheads.fill(0)
          this.gateCounters.fill(0)
          for (const v of this.voices) v?.reset()
          break
        case 'setBpm':
          if (cmd.bpm !== undefined) {
            this.bpm = cmd.bpm; this.samplesPerStep = this._calcSps()
            this.currentThreshold = this.swingPhase === 0
              ? (1 - this.swing) * 2 * this.samplesPerStep
              : this.swing * 2 * this.samplesPerStep
            for (const v of this.voices) v?.setParam('bpm', this.bpm)
          }
          break
        case 'triggerNote': {
          const t = cmd.trackId ?? 0
          const v = this.voices[t]
          if (v) v.noteOn(cmd.note ?? 60, cmd.velocity ?? 0.8)
          break
        }
        case 'releaseNote': {
          const t = cmd.trackId ?? 0
          const v = this.voices[t]
          if (v) v.noteOff()
          break
        }
        case 'loadSample': {
          const t = cmd.trackId ?? 0
          if (!cmd.buffer || !cmd.sampleRate) break
          // Create SamplerVoice if not yet initialized or wrong type
          if (!(this.voices[t] instanceof SamplerVoice)) {
            this.voices[t] = new SamplerVoice(sampleRate)
          }
          (this.voices[t] as SamplerVoice).loadSample(cmd.buffer, cmd.sampleRate)
          break
        }
        case 'setPattern': {
          if (!cmd.pattern) break
          const p = cmd.pattern
          this.bpm = p.bpm; this.samplesPerStep = this._calcSps()
          this.swing = 0.5 + p.perf.swing * 0.17
          this.currentThreshold = this.swingPhase === 0
            ? (1 - this.swing) * 2 * this.samplesPerStep
            : this.swing * 2 * this.samplesPerStep
          const n = p.tracks.length
          if (this.voices.length !== n) {
            this.voices = p.tracks.map((t, i) => makeVoice(i, t.voiceId, sampleRate))
            // Resize per-track arrays
            this.playheads    = new Array(n).fill(0)
            this.gateCounters = new Int32Array(n)
            this.muteGains    = new Float64Array(n).fill(1.0)
            this.panGainsL    = new Float64Array(n).fill(Math.SQRT1_2)
            this.panGainsR    = new Float64Array(n).fill(Math.SQRT1_2)
            this.scSource     = new Uint8Array(n)
            this.arpNotes     = Array.from({length: n}, () => [])
            this.arpIdx       = new Int32Array(n)
            this.arpCounter   = new Int32Array(n)
            this.arpTickSize  = new Int32Array(n)
            this.arpVel       = new Float64Array(n)
            this.arpSeed      = new Uint32Array(n).fill(77777)
          } else {
            // Re-instantiate voices whose voiceId changed (ADR 009 Phase 2)
            for (let i = 0; i < p.tracks.length; i++) {
              const prev = this.tracks[i]
              if (prev && prev.voiceId !== p.tracks[i].voiceId) {
                this.voices[i] = makeVoice(i, p.tracks[i].voiceId, sampleRate)
              }
            }
          }
          for (let i = 0; i < p.tracks.length; i++) {
            const vp = p.tracks[i].voiceParams
            if (vp && this.voices[i]) {
              for (const k in vp) this.voices[i]!.setParam(k, vp[k])
            }
            this.voices[i]?.setParam('bpm', this.bpm)
          }
          this.tracks = p.tracks
          for (let i = 0; i < p.tracks.length; i++) {
            this.scSource[i] = p.tracks[i].sidechainSource ? 1 : 0
          }
          const newLen = Math.max(1, ...p.tracks.map(t => t.steps))
          this.patternLen = newLen
          // Clamp patternPos if patternLen shrank (valid range: 0..patternLen)
          if (this.patternPos > newLen) this.patternPos = 0
          for (let i = 0; i < p.tracks.length; i++) {
            const angle = ((p.tracks[i].pan ?? 0) + 1) * 0.25 * Math.PI
            this.panGainsL[i] = Math.cos(angle)
            this.panGainsR[i] = Math.sin(angle)
          }
          this.reverb.setSize(p.fx.reverb.size)
          this.reverb.setDamp(p.fx.reverb.damp)
          this.delay.setTime(p.fx.delay.time)
          this.tapeDelay.setTime(p.fx.delay.time)
          this.delayFeedback = p.fx.delay.feedback
          this.duckDepth     = p.fx.ducker.depth
          this.ducker.setRelease(p.fx.ducker.release)
          this.compThreshold = p.fx.comp.threshold
          this.compRatio     = p.fx.comp.ratio
          this.compMakeup    = p.fx.comp.makeup
          this.comp.setAttackRelease(p.fx.comp.attack, p.fx.comp.release)
          this.verbReturn    = p.fx.verbReturn ?? 1.0
          this.dlyReturn     = p.fx.dlyReturn  ?? 1.0
          this.pendingRootNote  = p.perf.rootNote
          this.pendingOctave    = p.perf.octave
          this.pendingBreaking  = p.perf.breaking
          this.pendingFilling   = p.perf.filling
          this.pendingReversing = p.perf.reversing
          this.glitchX      = p.perf.glitchX
          this.glitchY      = p.perf.glitchY
          if (this.glitchStutter) this.stutter.setSlice(p.perf.glitchX)
          this.glitchRedux   = p.perf.glitchRedux ?? false
          this.delayTape     = p.perf.delayTape ?? false
          this.glitchStutter = p.perf.glitchStutter ?? false
          this.shimmerAmount = p.fx.shimmerAmount ?? 0
          this.granular.setParams(p.perf.granularX, p.perf.granularY)
          this.granular.setParams2(p.perf.granularPitch, p.perf.granularScatter)
          this.granular.setActive(p.perf.granularOn)
          this.granular.setFreeze(p.perf.granularFreeze)
          this.djFilter.set(p.fx.filter.x, p.fx.filter.y, p.fx.filter.on)
          for (let i = 0; i < p.fx.eq.bands.length && i < 3; i++) {
            const b = p.fx.eq.bands[i]
            const q = b.q ?? 1.5
            this.peakEq[i].set(b.freq, b.gain, q, sampleRate)
            this.peakEq[i].setActive(b.on)
            // Low (i=0) and High (i=2) can use shelf mode
            if (i === 0) {
              this.eqShelfMode[0] = !!b.shelf
              this.shelfEq[0].set(b.freq, b.gain, q, sampleRate)
              this.shelfEq[0].setActive(b.on)
            } else if (i === 2) {
              this.eqShelfMode[1] = !!b.shelf
              this.shelfEq[1].set(b.freq, b.gain, q, sampleRate)
              this.shelfEq[1].setActive(b.on)
            }
          }
          this.masterGain = p.perf.masterGain
          // Pattern switch: reset notes and rewind playheads so step 0 replays
          // with new data. Only when reset flag is set (not on normal param tweaks).
          if (cmd.reset) {
            for (let t = 0; t < this.voices.length; t++) {
              this.voices[t]?.noteOff()
              this.gateCounters[t] = 0
              this.arpNotes[t] = []
              const steps = this.tracks[t]?.steps ?? 16
              this.playheads[t] = steps - 1
            }
            // Apply pending perf immediately (don't wait for next step boundary)
            if (this.pendingRootNote !== null) { this.rootNote = this.pendingRootNote; this.pendingRootNote = null }
            if (this.pendingOctave !== null) { this.octave = this.pendingOctave; this.pendingOctave = null }
            if (this.pendingBreaking !== null) { this.breaking = this.pendingBreaking; this.pendingBreaking = null }
            if (this.pendingFilling !== null) { this.filling = this.pendingFilling; this.pendingFilling = null }
            if (this.pendingReversing !== null) { this.reversing = this.pendingReversing; this.pendingReversing = null }
            this.patternPos = 0  // cycle fires after patternLen advances
            this.swingPhase = 0
            this.currentThreshold = (1 - this.swing) * 2 * this.samplesPerStep
            this.accumulator = this.currentThreshold  // trigger step 0 on next sample
          }
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

    // Wrap patternPos when pattern cycle completes — no extra empty step.
    // cycle flag signals the main thread (scene advance, arrangement, etc.)
    let isCycle = false
    if (this.patternPos >= this.patternLen) {
      this.patternPos = 0
      isCycle = true
    }

    for (let t = 0; t < this.tracks.length; t++) {
      const track = this.tracks[t]
      if (!track || track.steps === 0) continue

      // Advance playhead first so we can peek at the incoming trig
      if (this.reversing) {
        this.playheads[t] = (this.playheads[t] - 1 + track.steps) % track.steps
      } else {
        this.playheads[t] = (this.playheads[t] + 1) % track.steps
      }
      const trig = track.trigs[this.playheads[t]]

      // P-Lock: restore base params, then overlay per-step locks
      if (this.voices[t] && track.voiceParams) {
        for (const k in track.voiceParams) this.voices[t]!.setParam(k, track.voiceParams[k])
      }
      if (this.voices[t] && trig?.active && trig.paramLocks) {
        for (const k in trig.paramLocks) this.voices[t]!.setParam(k, trig.paramLocks[k])
      }

      // Was the previous note's gate still open?
      const wasGated = this.gateCounters[t] > 0
      // Melodic tracks (Bass/Lead) auto-legato: consecutive notes connect like a 303
      const isMelodic = track.voiceId ? !DRUM_VOICES.has(track.voiceId) : false
      // Legato condition: suppress noteOff if incoming trig continues the phrase
      const isLegato = trig?.active && (isMelodic || trig.slide)

      // Decrement gate counter — noteOff when it reaches 0,
      // BUT suppress noteOff if incoming trig is legato (keeps envelope alive)
      if (this.gateCounters[t] > 0) {
        this.gateCounters[t]--
        if (this.gateCounters[t] === 0 && !isLegato) {
          this.voices[t]?.noteOff()
          this.arpNotes[t] = []
        }
      }

      // Step-synced arp: advance on step boundary for continuing notes
      if (isMelodic && this.arpNotes[t].length > 0 && this.gateCounters[t] > 0 && !trig?.active) {
        const rate = Math.round(track.voiceParams?.arpRate ?? 1)
        if (rate <= 1) {
          // Rate=1: advance arp once per step (step-synced only)
          if (Math.round(track.voiceParams?.arpMode ?? 1) === 4) {
            this.arpSeed[t] = (this.arpSeed[t] * 1664525 + 1013904223) >>> 0
            this.arpIdx[t] = (this.arpSeed[t] >>> 16) % this.arpNotes[t].length
          } else {
            this.arpIdx[t] = (this.arpIdx[t] + 1) % this.arpNotes[t].length
          }
          if (!track.muted) {
            this.voices[t]?.slideNote(this.arpNotes[t][this.arpIdx[t]], this.arpVel[t])
          }
        }
        // Reset sub-step counter on step boundary (keeps sub-ticks aligned)
        this.arpCounter[t] = 0
      }

      if (this.filling && !isMelodic) {
        // Fill mode: random hits, always duration=1, no slide
        this.fillSeed = (this.fillSeed * 1664525 + 1013904223) >>> 0
        const rand = (this.fillSeed >>> 16) / 65536
        const prob = t === 0 ? 0.25 : t === 1 ? 0.75 : t === 2 ? 0.35 : t === 3 ? 0.85 : t === 4 ? 0.20 : 0.10
        if (rand < prob) {
          if (this.scSource[t]) this.ducker.trigger(this.duckDepth)
          if (!track.muted) this.voices[t]?.noteOn(trig?.note ?? 60, 0.6 + rand * 0.4)
          this.gateCounters[t] = 1
        }
      } else if (trig?.active) {
        // Step probability: skip note if chance check fails
        if (Math.random() >= (trig.chance ?? 1.0)) {
          this.gateCounters[t] = trig.duration ?? 1
          continue
        }
        const note = isMelodic ? transposeNote(trig.note, this.rootNote, this.octave) : trig.note
        if (this.scSource[t]) this.ducker.trigger(this.duckDepth)
        if (!track.muted) {
          // Poly chord: trigger all notes in notes[] array
          if (trig.notes && trig.notes.length > 1) {
            for (let ni = 0; ni < trig.notes.length; ni++) {
              const cn = isMelodic ? transposeNote(trig.notes[ni], this.rootNote, this.octave) : trig.notes[ni]
              this.voices[t]?.noteOn(cn, trig.velocity)
            }
          } else if (wasGated && (isMelodic || trig.slide)) {
            // Auto-legato: melodic tracks glide when previous note was gated (303 behavior)
            // Explicit slide flag also enables glide on any track
            this.voices[t]?.slideNote(note, trig.velocity)
          } else {
            this.voices[t]?.noteOn(note, trig.velocity)
          }
        }
        this.gateCounters[t] = trig.duration ?? 1
        // Arpeggiator: start on melodic trigs with arp enabled
        if (isMelodic) {
          const am = Math.round(trig.paramLocks?.arpMode  ?? track.voiceParams?.arpMode  ?? 0)
          const ar = Math.round(trig.paramLocks?.arpRate  ?? track.voiceParams?.arpRate  ?? 1)
          const ac = Math.round(trig.paramLocks?.arpChord ?? track.voiceParams?.arpChord ?? 0)
          const ao = Math.round(trig.paramLocks?.arpOct   ?? track.voiceParams?.arpOct   ?? 1)
          if (am > 0 && (ac > 0 || ao >= 2)) {
            this.arpNotes[t] = generateArpNotes(note, am, ac, ao, this.rootNote)
            this.arpIdx[t] = 0
            this.arpCounter[t] = 0
            this.arpTickSize[t] = Math.round(this.samplesPerStep / Math.max(1, ar))
            this.arpVel[t] = trig.velocity
            this.arpSeed[t] = (note * 7919 + this.playheads[t] * 104729) >>> 0
          } else {
            this.arpNotes[t] = []
          }
        }
      }
    }
    if (this.playheads[0] === 0 && this.pendingOctave !== null) {
      this.octave = this.pendingOctave; this.pendingOctave = null
    }
    this.patternPos++
    this.port.postMessage({ type: 'step', playheads: [...this.playheads], cycle: isCycle } satisfies WorkletEvent)
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const t0 = Date.now()
    const outL = outputs[0]?.[0]
    const outR = outputs[0]?.[1] ?? outputs[0]?.[0]
    if (!outL) return true

    for (let s = 0; s < outL.length; s++) {
      let sourceDry = 0
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
        // Arp sub-step tick (rate>=2 only; rate=1 is step-synced in _advanceStep)
        for (let t = 0; t < this.voices.length; t++) {
          if (this.arpNotes[t].length === 0) continue
          const arpRate = Math.round(this.tracks[t]?.voiceParams?.arpRate ?? 1)
          if (arpRate <= 1) continue
          this.arpCounter[t]++
          if (this.arpCounter[t] >= this.arpTickSize[t]) {
            this.arpCounter[t] -= this.arpTickSize[t]
            if (Math.round(this.tracks[t]?.voiceParams?.arpMode ?? 1) === 4) {
              // RANDOM: LCG pick
              this.arpSeed[t] = (this.arpSeed[t] * 1664525 + 1013904223) >>> 0
              this.arpIdx[t] = (this.arpSeed[t] >>> 16) % this.arpNotes[t].length
            } else {
              this.arpIdx[t] = (this.arpIdx[t] + 1) % this.arpNotes[t].length
            }
            if (!this.tracks[t]?.muted) {
              this.voices[t]?.slideNote(this.arpNotes[t][this.arpIdx[t]], this.arpVel[t])
            }
          }
        }
        for (let t = 0; t < this.voices.length; t++) {
          const track = this.tracks[t]
          const muteTarget = track?.muted ? 0.0 : 1.0
          const mc = muteTarget > this.muteGains[t] ? 0.02 : 0.002
          this.muteGains[t] += (muteTarget - this.muteGains[t]) * mc
          if (this.muteGains[t] < 0.0001 && track?.muted) continue
          const voice = this.voices[t]
          if (!voice) continue
          const gain = this.muteGains[t] * (track?.volume ?? 0.8)
          if (voice.tickStereo) {
            voice.tickStereo(this._stereoTmp)
            const sL = this._stereoTmp[0] * gain
            const sR = this._stereoTmp[1] * gain
            if (this.scSource[t]) { sourceDry += (sL + sR) * 0.5 }
            else { restL += sL * this.panGainsL[t]; restR += sR * this.panGainsR[t] }
            const sendMono = (sL + sR) * 0.5
            reverbIn   += sendMono * (track?.reverbSend   ?? 0)
            delayIn    += sendMono * (track?.delaySend    ?? 0)
            glitchIn   += sendMono * (track?.glitchSend   ?? 0)
            granularIn += sendMono * (track?.granularSend ?? 0)
          } else {
            const sig = voice.tick() * gain
            if (this.scSource[t]) { sourceDry += sig }
            else { restL += sig * this.panGainsL[t]; restR += sig * this.panGainsR[t] }
            reverbIn   += sig * (track?.reverbSend   ?? 0)
            delayIn    += sig * (track?.delaySend    ?? 0)
            glitchIn   += sig * (track?.glitchSend   ?? 0)
            granularIn += sig * (track?.granularSend ?? 0)
          }
        }
      } else {
        // Not playing — still tick voices for triggerNote audition
        for (let t = 0; t < this.voices.length; t++) {
          const track = this.tracks[t]
          const voice = this.voices[t]
          if (!voice) continue
          const vol = track?.volume ?? 0.8
          if (voice.tickStereo) {
            voice.tickStereo(this._stereoTmp)
            const sL = this._stereoTmp[0] * vol
            const sR = this._stereoTmp[1] * vol
            if (this.scSource[t]) { sourceDry += (sL + sR) * 0.5 }
            else { restL += sL * this.panGainsL[t]; restR += sR * this.panGainsR[t] }
            reverbIn   += (sL + sR) * 0.5 * (track?.reverbSend   ?? 0)
            delayIn    += (sL + sR) * 0.5 * (track?.delaySend    ?? 0)
          } else {
            const sig = voice.tick()
            if (!sig) continue
            if (this.scSource[t]) { sourceDry += sig * vol }
            else { restL += sig * vol * this.panGainsL[t]; restR += sig * vol * this.panGainsR[t] }
            reverbIn   += sig * vol * (track?.reverbSend   ?? 0)
            delayIn    += sig * vol * (track?.delaySend    ?? 0)
          }
        }
      }

      // FX run always (tails ring out after stop)
      // Shimmer: pitch-shift reverb output and feed back into reverb input
      let shimReverbIn = reverbIn
      if (this.shimmerAmount > 0) {
        shimReverbIn += Math.tanh(this.octShifter.process(this.shimmerPrev)) * this.shimmerAmount
      }
      const rev = this.reverb.process(shimReverbIn)
      if (this.shimmerAmount > 0) {
        this.shimmerPrev = (rev[0] + rev[1]) * 0.5
      }
      // Delay: tape or digital
      const del = this.delayTape
        ? this.tapeDelay.process(delayIn, delayIn, this.delayFeedback)
        : this.delay.process(delayIn, delayIn, this.delayFeedback)
      const grn = this.granular.process(granularIn, granularIn)

      // Glitch send: stutter, downsample, or bitcrush on send bus
      let gltL = 0, gltR = 0
      if (this.glitchStutter) {
        // Stutter: buffer-repeat loop
        const st = this.stutter.process(glitchIn)
        gltL = st; gltR = st
      } else if (glitchIn !== 0 || this.glitchHoldL !== 0 || this.glitchHoldR !== 0) {
        const holdMax = Math.floor(2 + this.glitchX * 30)
        if (this.glitchCounter <= 0) {
          this.glitchHoldL = glitchIn
          this.glitchHoldR = glitchIn
          this.glitchSeed = (this.glitchSeed * 1664525 + 1013904223) >>> 0
          this.glitchCounter = Math.max(1, holdMax - ((this.glitchSeed >>> 16) % Math.max(1, holdMax >> 1)))
        }
        this.glitchCounter--
        if (this.glitchRedux) {
          // Redux: aggressive S&H only, no bit quantization
          gltL = this.glitchHoldL
          gltR = this.glitchHoldR
        } else {
          // Bitcrush: S&H + bit quantization
          const levels = Math.floor(4 + (1 - this.glitchY) * 252)
          gltL = Math.round(this.glitchHoldL * levels) / levels
          gltR = Math.round(this.glitchHoldR * levels) / levels
        }
      }

      // Sidechain: duck rest + FX returns; source tracks punch through untouched (ADR 064)
      const duck = this.ducker.tick()
      const mixL = sourceDry + (restL + rev[0] * this.verbReturn + del[0] * this.dlyReturn + grn[0] + gltL) * duck
      const mixR = sourceDry + (restR + rev[1] * this.verbReturn + del[1] * this.dlyReturn + grn[1] + gltR) * duck

      // Bus compressor
      const cmp = this.comp.process(mixL, mixR, this.compThreshold, this.compRatio, this.compMakeup)
      if (this.comp.gr < this.meterGrMin) this.meterGrMin = this.comp.gr

      // ── 3-band EQ (peaking or shelf per band) ──────────
      let fL = cmp[0], fR = cmp[1]
      // Low band: shelf or peaking
      const eqLow = this.eqShelfMode[0] ? this.shelfEq[0].process(fL, fR) : this.peakEq[0].process(fL, fR)
      fL = eqLow[0]; fR = eqLow[1]
      // Mid band: always peaking
      const eqMid = this.peakEq[1].process(fL, fR)
      fL = eqMid[0]; fR = eqMid[1]
      // High band: shelf or peaking
      const eqHigh = this.eqShelfMode[1] ? this.shelfEq[1].process(fL, fR) : this.peakEq[2].process(fL, fR)
      fL = eqHigh[0]; fR = eqHigh[1]

      // ── DJ Filter (XY pad sweep) ────────────────────────────────
      const filt = this.djFilter.process(fL, fR)
      fL = filt[0]; fR = filt[1]

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

      // Peak metering
      const absL = Math.abs(lim[0])
      const absR = Math.abs(lim[1])
      if (absL > this.meterPeakL) this.meterPeakL = absL
      if (absR > this.meterPeakR) this.meterPeakR = absR
    }

    // CPU timing (EMA smoothing — Date.now() is integer ms, so we smooth)
    const cpuMs = Date.now() - t0
    this.cpuEma += (cpuMs - this.cpuEma) * 0.15

    this.meterCount += outL.length
    if (this.meterCount >= this.meterInterval) {
      const cpu = (this.cpuEma / this.budgetMs) * 100
      this.port.postMessage({ type: 'levels', peakL: this.meterPeakL, peakR: this.meterPeakR, gr: this.meterGrMin, cpu })
      this.meterPeakL = 0
      this.meterPeakR = 0
      this.meterGrMin = 1.0
      this.meterCount -= this.meterInterval
    }

    return true
  }
}

registerProcessor('groovebox-processor', GrooveboxProcessor)
