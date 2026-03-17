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
import { SimpleReverb, LiteReverb, PingPongDelay, TapeDelay, SidechainDucker, BusCompressor, PeakLimiter, GranularProcessor, StutterBuffer, OctaveShifter } from './dsp/effects.ts'
import { makeVoice, DRUM_VOICES } from './dsp/voices.ts'
import type { Voice } from './dsp/voices.ts'
import type { WorkletCommand, WorkletTrack, WorkletInsertFx, WorkletEvent } from './dsp/types.ts'
import { SCALE_TEMPLATES } from '../constants.ts'

// Re-export types for engine.ts
export type { WorkletCommand, WorkletPattern, WorkletTrack, WorkletEvent } from './dsp/types.ts'
export type { WorkletTrig } from './dsp/types.ts'

// Max voice slots — pre-allocated to avoid audio-thread allocation on resize
const MAX_VOICES = 16

// ── Diatonic transposition — OP-XY Brain style ───────────────────────────────

const BASE_SCALE = [0, 2, 4, 5, 7, 9, 11]

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

// ── Insert FX slot (ADR 077) ──────────────────────────────────────────────────

interface InsertFxSlot {
  type: 'verb' | 'delay' | 'glitch'
  reverb?: LiteReverb
  delay?: PingPongDelay
  tapeDelay?: TapeDelay
  // Glitch S&H state (per-slot, no shared instance needed)
  glitchHoldL: number
  glitchHoldR: number
  glitchCounter: number
  glitchSeed: number
  // Params
  mix: number
  x: number
  y: number
  // Flavour flags
  hall: boolean
  dotted: boolean
  tape: boolean
  redux: boolean
}

// ── Processor ─────────────────────────────────────────────────────────────────

class GrooveboxProcessor extends AudioWorkletProcessor {
  private voices: (Voice | null)[] = new Array(MAX_VOICES).fill(null)
  private tracks: WorkletTrack[] = []
  private activeCount = 0          // number of active tracks (≤ MAX_VOICES)
  private playheads: number[] = new Array(MAX_VOICES).fill(0)
  private gateCounters = new Int32Array(MAX_VOICES)
  private playing = false
  private bpm = 120
  private samplesPerStep = 0
  private accumulator = 0
  private patternLen = 16   // max step count across all tracks
  private patternPos = 0    // global position within pattern cycle
  private auditionNote: Record<number, number> = {}  // trackId → last triggered MIDI note

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
  // Kaoss Pad (ADR 097)
  private perfX          = 0.5
  private perfY          = 0.5
  private perfTouching   = false
  // Glitch effects (ADR 097 Phase 2)
  private stuttering     = false
  private halfSpeed      = false
  private tapeStop       = false
  private tapeSpeed      = 1.0          // current tape speed multiplier (1.0 = normal)
  private stutterAccum   = 0            // sub-step accumulator for stutter retrigger
  private stutterThreshold = 0          // samples per stutter subdivision
  private halfAccumFrac  = 0            // fractional accumulator for half-speed
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
  // Per-track mute fade and precomputed pan gains (pre-allocated to MAX_VOICES)
  private muteGains      = new Float64Array(MAX_VOICES).fill(1.0)
  private panGainsL      = new Float64Array(MAX_VOICES).fill(Math.SQRT1_2)
  private panGainsR      = new Float64Array(MAX_VOICES).fill(Math.SQRT1_2)
  // Sidechain source flags (ADR 064) — true = triggers ducker & bypasses ducking
  private scSource       = new Uint8Array(MAX_VOICES)  // 0 or 1
  // Arpeggiator — per-track state (melodic tracks only)
  private arpNotes:    number[][] = Array.from({length: MAX_VOICES}, () => [])
  private arpIdx       = new Int32Array(MAX_VOICES)
  private arpCounter   = new Int32Array(MAX_VOICES)
  private arpTickSize  = new Int32Array(MAX_VOICES)
  private arpVel       = new Float64Array(MAX_VOICES)
  private arpSeed      = new Uint32Array(MAX_VOICES).fill(77777)
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
  // Insert FX slots (ADR 077) — pre-allocated to MAX_VOICES, null = bypass
  private insertSlots: (InsertFxSlot | null)[] = new Array(MAX_VOICES).fill(null)
  private insertOut      = new Float64Array(2)  // reusable output buffer
  // Granular DSP
  private granular       = new GranularProcessor(sampleRate)
  // DJ Filter (XY pad sweep)
  private djFilter       = new DJFilter(sampleRate)
  // Anti-click crossfade on pattern reset (128 samples ≈ 2.7ms @ 48kHz)
  private xfadeLen       = 128
  private xfadeRemain    = 0
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
          for (let t = 0; t < this.activeCount; t++) {
            const steps = this.tracks[t]?.steps ?? 16
            this.playheads[t] = steps - 1
          }
          this.gateCounters.fill(0)
          this.patternPos = 0  // cycle fires after patternLen advances
          this.accumulator = this.currentThreshold  // trigger step 0 immediately
          break
        case 'stop':
          this.playing = false
          for (let i = 0; i < this.activeCount; i++) { this.playheads[i] = 0; this.gateCounters[i] = 0 }
          for (let i = 0; i < this.activeCount; i++) this.voices[i]?.reset()
          break
        case 'setBpm':
          if (cmd.bpm !== undefined) {
            this.bpm = cmd.bpm; this.samplesPerStep = this._calcSps()
            this.currentThreshold = this.swingPhase === 0
              ? (1 - this.swing) * 2 * this.samplesPerStep
              : this.swing * 2 * this.samplesPerStep
            for (let i = 0; i < this.activeCount; i++) this.voices[i]?.setParam('bpm', this.bpm)
          }
          break
        case 'triggerNote': {
          const t = cmd.trackId ?? 0
          const v = this.voices[t]
          if (v) v.noteOn(cmd.note ?? 60, cmd.velocity ?? 0.8)
          this.auditionNote[t] = cmd.note ?? 60
          break
        }
        case 'releaseNote': {
          const t = cmd.trackId ?? 0
          const v = this.voices[t]
          if (v) v.noteOff()
          delete this.auditionNote[t]
          break
        }
        case 'releaseNoteByPitch': {
          const t = cmd.trackId ?? 0
          if (this.auditionNote[t] === cmd.note) {
            const v = this.voices[t]
            if (v) v.noteOff()
            delete this.auditionNote[t]
          }
          break
        }
        case 'loadSample': {
          const t = cmd.trackId ?? 0
          if (!cmd.buffer || !cmd.sampleRate) break
          const sv = this.voices[t]
          if (sv && 'loadSample' in sv) {
            (sv as any).loadSample(cmd.buffer, cmd.sampleRate)
          }
          break
        }
        case 'loadZones': {
          const t = cmd.trackId ?? 0
          if (!cmd.zones || !cmd.zones.length) break
          const zv = this.voices[t]
          if (zv && 'loadZones' in zv) {
            (zv as any).loadZones(cmd.zones)
          }
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
          const n = Math.min(p.tracks.length, MAX_VOICES)
          const prev = this.activeCount
          // Grow: instantiate new voices, align playhead to current position
          for (let i = prev; i < n; i++) {
            this.voices[i] = makeVoice(i, p.tracks[i].voiceId, sampleRate)
            this.playheads[i] = this.patternPos % (p.tracks[i].steps || 16)
            this.gateCounters[i] = 0
            this.muteGains[i] = 1.0
            this.arpNotes[i] = []
            this.arpIdx[i] = 0
            this.arpCounter[i] = 0
            this.arpSeed[i] = 77777
            this.insertSlots[i] = null
          }
          // Shrink: silence removed voices, clear slots
          for (let i = n; i < prev; i++) {
            this.voices[i]?.noteOff()
            this.voices[i] = null
            this.gateCounters[i] = 0
            this.arpNotes[i] = []
            this.insertSlots[i] = null
          }
          this.activeCount = n
          // Re-instantiate voices whose voiceId changed (ADR 009 Phase 2)
          for (let i = 0; i < n; i++) {
            const pt = this.tracks[i]
            if (pt && pt.voiceId !== p.tracks[i].voiceId) {
              this.voices[i] = makeVoice(i, p.tracks[i].voiceId, sampleRate)
            }
          }
          for (let i = 0; i < n; i++) {
            const vp = p.tracks[i].voiceParams
            if (vp && this.voices[i]) {
              for (const k in vp) this.voices[i]!.setParam(k, vp[k])
            }
            this.voices[i]?.setParam('bpm', this.bpm)
          }
          this.tracks = p.tracks
          for (let i = 0; i < n; i++) {
            this.scSource[i] = p.tracks[i].sidechainSource ? 1 : 0
          }
          const newLen = Math.max(1, ...p.tracks.map(t => t.steps))
          this.patternLen = newLen
          // Clamp patternPos if patternLen shrank (valid range: 0..patternLen)
          if (this.patternPos > newLen) this.patternPos = 0
          for (let i = 0; i < n; i++) {
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
          this.perfX         = p.perf.perfX
          this.perfY         = p.perf.perfY
          this.perfTouching  = p.perf.perfTouching
          // tiltX/tiltY received but not yet used in DSP (ADR 097 Phase 3)
          this.stuttering    = p.perf.stuttering
          this.halfSpeed     = p.perf.halfSpeed
          if (p.perf.tapeStop && !this.tapeStop) this.tapeSpeed = 1.0  // reset on engage
          this.tapeStop      = p.perf.tapeStop
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
          // Insert FX slots (ADR 077) — lazy instantiation
          if (this.insertSlots.length !== n) {
            this.insertSlots = new Array(n).fill(null)
          }
          for (let i = 0; i < n; i++) {
            const ins = p.tracks[i].insertFx
            if (!ins || !ins.type) {
              this.insertSlots[i] = null
              continue
            }
            const prev = this.insertSlots[i]
            if (!prev || prev.type !== ins.type) {
              this.insertSlots[i] = this._createInsertSlot(ins)
            } else {
              this._updateInsertParams(prev, ins)
            }
          }
          this.masterGain = p.perf.masterGain
          // Pattern switch: reset notes and rewind playheads so step 0 replays
          // with new data. Only when reset flag is set (not on normal param tweaks).
          if (cmd.reset) {
            for (let t = 0; t < this.activeCount; t++) {
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
            this.xfadeRemain = this.xfadeLen          // fade-in to suppress click
          }
          break
        }
      }
    }
  }

  private _calcSps() { return (60 / this.bpm / 4) * sampleRate }

  // ── Insert FX helpers (ADR 077) ────────────────────────────────────────────

  private _createInsertSlot(ins: WorkletInsertFx): InsertFxSlot {
    const slot: InsertFxSlot = {
      type: ins.type!,
      mix: ins.mix, x: ins.x, y: ins.y,
      hall: !!ins.hall, dotted: !!ins.dotted, tape: !!ins.tape, redux: !!ins.redux,
      glitchHoldL: 0, glitchHoldR: 0, glitchCounter: 0, glitchSeed: 55555,
    }
    if (ins.type === 'verb') {
      slot.reverb = new LiteReverb(sampleRate)
      const size = ins.hall ? 0.82 + ins.x * 0.17 : 0.4 + ins.x * 0.59
      const damp = ins.hall ? (1 - ins.y) * 0.3 : 1 - ins.y
      slot.reverb!.setSize(size)
      slot.reverb!.setDamp(damp)
    } else if (ins.type === 'delay') {
      if (ins.tape) {
        slot.tapeDelay = new TapeDelay(1000, sampleRate)
        const ms = ins.dotted ? 60000 / this.bpm * 0.75 : 50 + ins.x * 450
        slot.tapeDelay.setTime(ms)
      } else {
        slot.delay = new PingPongDelay(1000, sampleRate)
        const ms = ins.dotted ? 60000 / this.bpm * 0.75 : 50 + ins.x * 450
        slot.delay.setTime(ms)
      }
    }
    // glitch needs no pre-allocation
    return slot
  }

  private _updateInsertParams(slot: InsertFxSlot, ins: WorkletInsertFx): void {
    slot.mix = ins.mix; slot.x = ins.x; slot.y = ins.y
    slot.hall = !!ins.hall; slot.dotted = !!ins.dotted
    slot.tape = !!ins.tape; slot.redux = !!ins.redux
    if (slot.type === 'verb' && slot.reverb) {
      const size = ins.hall ? 0.82 + ins.x * 0.17 : 0.4 + ins.x * 0.59
      const damp = ins.hall ? (1 - ins.y) * 0.3 : 1 - ins.y
      slot.reverb.setSize(size)
      slot.reverb.setDamp(damp)
    } else if (slot.type === 'delay') {
      const ms = ins.dotted ? 60000 / this.bpm * 0.75 : 50 + ins.x * 450
      if (slot.tapeDelay) slot.tapeDelay.setTime(ms)
      if (slot.delay) slot.delay.setTime(ms)
    }
    // glitch params applied inline in process()
  }

  /** Process insert FX for a single sample. Returns [L, R] via this.insertOut. */
  private _processInsert(slot: InsertFxSlot, inL: number, inR: number): Float64Array {
    let wetL = 0, wetR = 0
    if (slot.type === 'verb' && slot.reverb) {
      const mono = (inL + inR) * 0.5
      const rv = slot.reverb.process(mono)
      wetL = rv[0]; wetR = rv[1]
    } else if (slot.type === 'delay') {
      const fb = slot.y * 0.85
      if (slot.tape && slot.tapeDelay) {
        const d = slot.tapeDelay.process(inL, inR, fb)
        wetL = d[0]; wetR = d[1]
      } else if (slot.delay) {
        const d = slot.delay.process(inL, inR, fb)
        wetL = d[0]; wetR = d[1]
      }
    } else if (slot.type === 'glitch') {
      // S&H downsampler (per-track state)
      const holdMax = Math.floor(2 + slot.x * 30)
      if (slot.glitchCounter <= 0) {
        slot.glitchHoldL = inL
        slot.glitchHoldR = inR
        slot.glitchSeed = (slot.glitchSeed * 1664525 + 1013904223) >>> 0
        slot.glitchCounter = Math.max(1, holdMax - ((slot.glitchSeed >>> 16) % Math.max(1, holdMax >> 1)))
      }
      slot.glitchCounter--
      if (slot.redux) {
        wetL = slot.glitchHoldL; wetR = slot.glitchHoldR
      } else {
        const levels = Math.floor(4 + (1 - slot.y) * 252)
        wetL = Math.round(slot.glitchHoldL * levels) / levels
        wetR = Math.round(slot.glitchHoldR * levels) / levels
      }
    }
    const dry = 1 - slot.mix
    this.insertOut[0] = inL * dry + wetL * slot.mix
    this.insertOut[1] = inR * dry + wetR * slot.mix
    return this.insertOut
  }

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

    for (let t = 0; t < this.activeCount; t++) {
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
        // Fill mode: random hits, density controlled by perfY when touching
        this.fillSeed = (this.fillSeed * 1664525 + 1013904223) >>> 0
        const rand = (this.fillSeed >>> 16) / 65536
        const baseProb = t === 0 ? 0.25 : t === 1 ? 0.75 : t === 2 ? 0.35 : t === 3 ? 0.85 : t === 4 ? 0.20 : 0.10
        // perfY scales density: 0=sparse (0.1x), 1=dense (2x)
        const density = this.perfTouching ? 0.1 + this.perfY * 1.9 : 1.0
        const prob = Math.min(1.0, baseProb * density)
        // perfX modulates velocity range when touching
        const velBase = this.perfTouching ? 0.3 + this.perfX * 0.5 : 0.6
        if (rand < prob) {
          if (this.scSource[t] && !track.muted) this.ducker.trigger(this.duckDepth)
          if (!track.muted) this.voices[t]?.noteOn(trig?.note ?? 60, velBase + rand * 0.4)
          this.gateCounters[t] = 1
        }
      } else if (trig?.active) {
        // Step probability: skip note if chance check fails
        if (Math.random() >= (trig.chance ?? 1.0)) {
          this.gateCounters[t] = trig.duration ?? 1
          continue
        }
        const note = isMelodic ? transposeNote(trig.note, this.rootNote, this.octave) : trig.note
        if (this.scSource[t] && !track.muted) this.ducker.trigger(this.duckDepth)
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
    this.port.postMessage({ type: 'step', playheads: this.playheads.slice(0, this.activeCount), cycle: isCycle } satisfies WorkletEvent)
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
        // ── Glitch: tape stop (exponential slowdown) ──
        if (this.tapeStop) {
          // Ramp down: multiply by 0.9998 per sample ≈ stops in ~0.5s at 44.1kHz
          this.tapeSpeed = Math.max(0.01, this.tapeSpeed * 0.9998)
        } else if (this.tapeSpeed < 1.0) {
          // Ramp back up on release
          this.tapeSpeed = Math.min(1.0, this.tapeSpeed * 1.0004)
        }

        // ── Glitch: half speed ──
        const speedMul = this.halfSpeed ? 0.5 : 1.0
        const increment = speedMul * this.tapeSpeed

        this.halfAccumFrac += increment
        const steps = Math.floor(this.halfAccumFrac)
        this.halfAccumFrac -= steps
        this.accumulator += steps

        if (this.accumulator >= this.currentThreshold) {
          this.accumulator -= this.currentThreshold
          this._advanceStep()
          this.swingPhase ^= 1
          this.currentThreshold = this.swingPhase === 1
            ? this.swing * 2 * this.samplesPerStep
            : (1 - this.swing) * 2 * this.samplesPerStep
          // Reset stutter on new step
          this.stutterAccum = 0
          const stutterDiv = this.perfTouching ? 2 + Math.floor(this.perfY * 6) : 4  // 2-8 subdivisions
          this.stutterThreshold = Math.floor(this.currentThreshold / stutterDiv)
        }

        // ── Glitch: stutter (retrigger within step) ──
        if (this.stuttering && this.stutterThreshold > 0) {
          this.stutterAccum += steps
          if (this.stutterAccum >= this.stutterThreshold) {
            this.stutterAccum -= this.stutterThreshold
            // Retrigger all active voices at current step
            for (let t = 0; t < this.activeCount; t++) {
              const track = this.tracks[t]
              if (!track || track.muted) continue
              const ph = this.playheads[t]
              const trig = track.trigs[ph]
              if (trig?.active) {
                const vel = (trig.velocity ?? 1.0) * (0.6 + Math.random() * 0.3)
                this.voices[t]?.noteOn(trig.note, vel)
                this.gateCounters[t] = 1
              }
            }
          }
        }
        // Arp sub-step tick (rate>=2 only; rate=1 is step-synced in _advanceStep)
        for (let t = 0; t < this.activeCount; t++) {
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
        for (let t = 0; t < this.activeCount; t++) {
          const track = this.tracks[t]
          const muteTarget = track?.muted ? 0.0 : 1.0
          const mc = muteTarget > this.muteGains[t] ? 0.02 : 0.002
          this.muteGains[t] += (muteTarget - this.muteGains[t]) * mc
          if (this.muteGains[t] < 0.0001 && track?.muted) continue
          const voice = this.voices[t]
          if (!voice) continue
          const gain = this.muteGains[t] * (track?.volume ?? 0.8)
          let sL: number, sR: number
          if (voice.tickStereo) {
            voice.tickStereo(this._stereoTmp)
            sL = this._stereoTmp[0] * gain
            sR = this._stereoTmp[1] * gain
          } else {
            const sig = voice.tick() * gain
            sL = sig; sR = sig
          }
          // Insert FX (ADR 077): process after voice output, before pan/send
          const ins = this.insertSlots[t]
          if (ins) {
            const io = this._processInsert(ins, sL, sR)
            sL = io[0]; sR = io[1]
          }
          if (this.scSource[t]) { sourceDry += (sL + sR) * 0.5 }
          else { restL += sL * this.panGainsL[t]; restR += sR * this.panGainsR[t] }
          const sendMono = (sL + sR) * 0.5
          reverbIn   += sendMono * (track?.reverbSend   ?? 0)
          delayIn    += sendMono * (track?.delaySend    ?? 0)
          glitchIn   += sendMono * (track?.glitchSend   ?? 0)
          granularIn += sendMono * (track?.granularSend ?? 0)
        }
      } else {
        // Not playing — still tick voices for triggerNote audition
        for (let t = 0; t < this.activeCount; t++) {
          const track = this.tracks[t]
          const voice = this.voices[t]
          if (!voice) continue
          const vol = track?.volume ?? 0.8
          let sL: number, sR: number
          if (voice.tickStereo) {
            voice.tickStereo(this._stereoTmp)
            sL = this._stereoTmp[0] * vol
            sR = this._stereoTmp[1] * vol
          } else {
            const sig = voice.tick()
            if (!sig) continue
            sL = sig * vol; sR = sig * vol
          }
          // Insert FX (ADR 077)
          const ins = this.insertSlots[t]
          if (ins) {
            const io = this._processInsert(ins, sL, sR)
            sL = io[0]; sR = io[1]
          }
          if (this.scSource[t]) { sourceDry += (sL + sR) * 0.5 }
          else { restL += sL * this.panGainsL[t]; restR += sR * this.panGainsR[t] }
          reverbIn   += (sL + sR) * 0.5 * (track?.reverbSend   ?? 0)
          delayIn    += (sL + sR) * 0.5 * (track?.delaySend    ?? 0)
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

      // ── Rhythmic break gate (pre-FX: dry signal only, FX tails ring through) ──
      // perfY = duty cycle (0=choppy 10%, 1=wide 90%), perfX = subdivision (gate repeats within step)
      const brkDuty = this.perfTouching ? 0.1 + this.perfY * 0.8 : 0.5
      const brkSubDiv = this.perfTouching ? 1 + Math.floor(this.perfX * 3) : 1  // 1-4 sub-gates per step
      const subPhase = (this.accumulator % (this.currentThreshold / brkSubDiv)) / (this.currentThreshold / brkSubDiv)
      const gateTarget = this.breaking
        ? (subPhase < brkDuty ? 1.0 : 0.0)
        : 1.0
      this.gateEnv += (gateTarget - this.gateEnv) * (gateTarget > this.gateEnv ? 0.02 : 0.002)

      // Sidechain: duck rest + FX returns; source tracks punch through untouched (ADR 064)
      const duck = this.ducker.tick()
      const mixL = sourceDry * this.gateEnv + (restL * this.gateEnv + rev[0] * this.verbReturn + del[0] * this.dlyReturn + grn[0] + gltL) * duck
      const mixR = sourceDry * this.gateEnv + (restR * this.gateEnv + rev[1] * this.verbReturn + del[1] * this.dlyReturn + grn[1] + gltR) * duck

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

      // (BRK gate applied pre-FX above)

      // Anti-click fade-in after pattern reset
      if (this.xfadeRemain > 0) {
        const g = 1 - this.xfadeRemain / this.xfadeLen
        fL *= g; fR *= g
        this.xfadeRemain--
      }

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
