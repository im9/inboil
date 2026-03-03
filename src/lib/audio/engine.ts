/**
 * engine.ts — main thread audio engine API.
 */
import type { WorkletCommand, WorkletEvent, WorkletPattern } from './worklet-processor.ts'
import type { Pattern, Effects } from '../state.svelte.ts'
import workletUrl from './worklet-processor.ts?worker&url'

type PerfState = {
  rootNote: number; octave: number
  breaking: boolean; masterGain: number
  filling: boolean; reversing: boolean
  swing: number
  granularPitch?: number; granularScatter?: number
  granularFreeze?: boolean
}

type FxNode = { on: boolean; x: number; y: number }
type FxPadState = {
  verb: FxNode; delay: FxNode; glitch: FxNode; granular: FxNode; filter: FxNode
  eqLow: FxNode; eqMid: FxNode; eqHigh: FxNode
}

export class GrooveboxEngine {
  private ctx:  AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private analyser: AnalyserNode | null = null
  private _onStep: ((playheads: number[]) => void) | null = null
  private suspendTimer: ReturnType<typeof setTimeout> | null = null

  set onStep(cb: (playheads: number[]) => void) { this._onStep = cb }

  getAnalyser(): AnalyserNode | null { return this.analyser }

  async init(): Promise<void> {
    if (this.ctx) return
    this.ctx = new AudioContext()
    await this.ctx.audioWorklet.addModule(workletUrl)
    this.node = new AudioWorkletNode(this.ctx, 'groovebox-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
    })
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.8
    this.node.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
    this.node.port.onmessage = (e: MessageEvent<WorkletEvent>) => {
      if (e.data.type === 'step' && this._onStep) this._onStep(e.data.playheads)
    }
  }

  sendPattern(pattern: Pattern, fx: Effects, perf?: PerfState, fxPad?: FxPadState, reset = false): void {
    if (!this.node) return
    this._post({ type: 'setPattern', pattern: patternToWorklet(pattern, fx, perf, fxPad), reset })
  }

  play(): void {
    if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = null }
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
    this._post({ type: 'play' })
  }

  triggerNote(trackId: number, note: number, velocity: number): void {
    if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = null }
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
    this._post({ type: 'triggerNote', trackId, note, velocity })
  }

  releaseNote(trackId: number): void {
    this._post({ type: 'releaseNote', trackId })
  }

  stop(): void {
    this._post({ type: 'stop' })
    // Suspend context after FX tails have fully decayed
    // (delay feedback up to 0.85 needs ~6s to fall below -60dB)
    if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = null }
    if (this.ctx && this.ctx.state === 'running') {
      this.suspendTimer = setTimeout(() => { this.suspendTimer = null; if (this.ctx?.state === 'running') void this.ctx.suspend() }, 8000)
    }
  }

  private _post(cmd: WorkletCommand) { this.node?.port.postMessage(cmd) }
}

function patternToWorklet(
  pattern: Pattern,
  fx: Effects,
  perf?: PerfState,
  fxPad?: FxPadState,
): WorkletPattern {
  // Reverb params: use XY when verb is on, otherwise pattern defaults
  const reverbSize = fxPad?.verb.on ? 0.4 + fxPad.verb.x * 0.59 : fx.reverb.size
  const reverbDamp = fxPad?.verb.on ? 1.0 - fxPad.verb.y : fx.reverb.damp
  // Delay params: use XY when delay is on
  const delayTimeFrac = fxPad?.delay.on ? 0.125 + fxPad.delay.x * 0.875 : fx.delay.time
  const delayFb = fxPad?.delay.on ? fxPad.delay.y * 0.85 : fx.delay.feedback

  return {
    bpm: pattern.bpm,
    fx:  {
      reverb: { size: reverbSize, damp: reverbDamp },
      delay:  { time: (60000 / pattern.bpm) * delayTimeFrac, feedback: delayFb },
      ducker: { ...fx.ducker },
      comp:   { ...fx.comp },
      filter: {
        on: fxPad?.filter.on ?? false,
        x:  fxPad?.filter.x  ?? 0.5,
        y:  fxPad?.filter.y  ?? 0.3,
      },
      eq: {
        bands: [
          { on: fxPad?.eqLow.on  ?? true, freq: 20 * Math.pow(1000, fxPad?.eqLow.x  ?? 0.33), gain: ((fxPad?.eqLow.y  ?? 0.5) - 0.5) * 24 },
          { on: fxPad?.eqMid.on  ?? true, freq: 20 * Math.pow(1000, fxPad?.eqMid.x  ?? 0.57), gain: ((fxPad?.eqMid.y  ?? 0.5) - 0.5) * 24 },
          { on: fxPad?.eqHigh.on ?? true, freq: 20 * Math.pow(1000, fxPad?.eqHigh.x ?? 0.87), gain: ((fxPad?.eqHigh.y ?? 0.5) - 0.5) * 24 },
        ],
      },
    },
    perf: {
      rootNote:   perf?.rootNote   ?? 0,
      octave:     perf?.octave    ?? 0,
      breaking:   perf?.breaking   ?? false,
      masterGain: perf?.masterGain ?? 0.8,
      filling:    perf?.filling    ?? false,
      reversing:  perf?.reversing  ?? false,
      glitchX:    fxPad?.glitch.on ? fxPad.glitch.x : 0.5,
      glitchY:    fxPad?.glitch.on ? fxPad.glitch.y : 0.5,
      granularOn:      fxPad?.granular.on ?? false,
      granularX:       fxPad?.granular.x  ?? 0.5,
      granularY:       fxPad?.granular.y  ?? 0.3,
      granularPitch:   perf?.granularPitch   ?? 0.5,
      granularScatter: perf?.granularScatter ?? 0.67,
      granularFreeze:  perf?.granularFreeze  ?? false,
      swing:           perf?.swing       ?? 0,
    },
    tracks: pattern.tracks.map(t => ({
      steps:       t.steps,
      muted:       t.muted,
      synthType:   t.synthType,
      volume:      t.volume,
      pan:         t.pan,
      reverbSend:    Math.min(1, t.reverbSend   + (fxPad?.verb.on    ? 0.3 : 0)),
      delaySend:     Math.min(1, t.delaySend    + (fxPad?.delay.on   ? 0.3 : 0)),
      glitchSend:    Math.min(1, t.glitchSend   + (fxPad?.glitch.on  ? 0.3 : 0)),
      granularSend:  Math.min(1, t.granularSend + (fxPad?.granular.on ? 0.3 : 0)),
      voiceParams: { ...t.voiceParams },
      trigs: t.trigs.map(trig => ({
        active:   trig.active,
        note:     trig.note,
        velocity: trig.velocity,
        duration: trig.duration ?? 1,
        slide:    trig.slide ?? false,
        ...(trig.chance != null ? { chance: trig.chance } : {}),
        ...(trig.paramLocks && Object.keys(trig.paramLocks).length > 0
          ? { paramLocks: { ...trig.paramLocks } } : {}),
      })),
    })),
  }
}

export const engine = new GrooveboxEngine()
