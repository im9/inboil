/**
 * engine.ts — main thread audio engine API.
 */
import type { WorkletCommand, WorkletEvent, WorkletPattern } from './worklet-processor.ts'
import type { Song } from '../state.svelte.ts'
import { ui, masterPad, masterLevels, fxFlavours, cellForTrack } from '../state.svelte.ts'
import { isSidechainSource } from './dsp/voices.ts'
import workletUrl from './worklet-processor.ts?worker&url'
import crashUrl from './samples/tr909_crash.webm'
import rideUrl from './samples/tr909_ride.webm'

/** Drum voices with built-in PCM samples (auto-loaded, hidden from user) */
const DRUM_SAMPLES: Record<string, string> = {
  Crash: crashUrl,
  Ride:  rideUrl,
}

/** Sampler category presets (user-selectable via preset browser) */
export const SAMPLER_PRESETS: Record<string, string> = {
  // Future: add preset samples here (e.g. breaks, one-shots, foley)
}

type PerfState = {
  rootNote: number; octave: number
  breaking: boolean; masterGain: number
  filling: boolean; reversing: boolean
  swing: number
  granularPitch?: number; granularScatter?: number
  granularFreeze?: boolean
}

type FxNode = { on: boolean; x: number; y: number }
type EqNode = FxNode & { q: number; shelf?: boolean }
type FxPadState = {
  verb: FxNode; delay: FxNode; glitch: FxNode; granular: FxNode; filter: FxNode
  eqLow: EqNode; eqMid: EqNode; eqHigh: EqNode
}

export class GrooveboxEngine {
  private ctx:  AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private analyser: AnalyserNode | null = null
  private _onStep: ((playheads: number[], cycle: boolean) => void) | null = null
  private suspendTimer: ReturnType<typeof setTimeout> | null = null
  /** Tracks current voiceId per track to detect changes and reload samples */
  private trackVoiceIds: string[] = []
  /** Cached decoded user samples per track — re-sent after voice re-init (ADR 020 §I) */
  private userSamples: Map<number, { mono: Float32Array; sampleRate: number }> = new Map()

  set onStep(cb: (playheads: number[], cycle: boolean) => void) { this._onStep = cb }

  getAnalyser(): AnalyserNode | null { return this.analyser }
  getContext(): AudioContext | null { return this.ctx }
  /** The analyser node is the last node before ctx.destination — use as capture tap */
  getCaptureSource(): AudioNode | null { return this.analyser }

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
      if (e.data.type === 'step' && this._onStep) this._onStep(e.data.playheads, e.data.cycle)
      else if (e.data.type === 'levels') { masterLevels.peakL = e.data.peakL; masterLevels.peakR = e.data.peakR; masterLevels.gr = e.data.gr; masterLevels.cpu = e.data.cpu ?? 0 }
    }
  }

  sendPattern(song: Song, perf?: PerfState, fxPad?: FxPadState, reset = false, sectionIndex = 0): void {
    if (!this.node) return
    const wp = patternToWorklet(song, perf, fxPad, sectionIndex)
    this._post({ type: 'setPattern', pattern: wp, reset })
    this._autoLoadSamples(wp)
  }

  sendPatternByIndex(song: Song, perf?: PerfState, fxPad?: FxPadState, reset = false, patternIndex = 0): void {
    if (!this.node) return
    const pat = song.patterns[patternIndex]
    if (!pat) return
    const wp = buildWorkletPattern(song, pat, perf, fxPad)
    this._post({ type: 'setPattern', pattern: wp, reset })
    this._autoLoadSamples(wp)
  }

  /** Auto-load built-in and user samples for sampler voices (ADR 012, 020) */
  private _autoLoadSamples(wp: WorkletPattern): void {
    for (let i = 0; i < wp.tracks.length; i++) {
      const vid = wp.tracks[i].voiceId
      if (!vid) continue
      const prev = this.trackVoiceIds[i]
      this.trackVoiceIds[i] = vid
      // Built-in drum samples (Crash, Ride)
      if (vid in DRUM_SAMPLES) {
        if (prev !== vid) void this.loadBuiltinSample(i, vid)
        continue
      }
      // User samples — re-send cached buffer when voice was re-initialized
      if (vid === 'Sampler' && prev !== vid) {
        const cached = this.userSamples.get(i)
        if (cached) this._sendSample(i, new Float32Array(cached.mono), cached.sampleRate)
      }
    }
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

  releaseNoteByPitch(trackId: number, note: number): void {
    this._post({ type: 'releaseNoteByPitch', trackId, note })
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

  /** Decode audio to mono Float32Array */
  private async _decodeToMono(arrayBuf: ArrayBuffer): Promise<{ mono: Float32Array; sampleRate: number } | null> {
    if (!this.ctx) return null
    const audioBuf = await this.ctx.decodeAudioData(arrayBuf)
    let mono: Float32Array
    if (audioBuf.numberOfChannels === 1) {
      mono = audioBuf.getChannelData(0)
    } else {
      const L = audioBuf.getChannelData(0)
      const R = audioBuf.getChannelData(1)
      mono = new Float32Array(L.length)
      for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5
    }
    return { mono, sampleRate: audioBuf.sampleRate }
  }

  /** Send mono sample to worklet (zero-copy transfer) */
  private _sendSample(trackId: number, mono: Float32Array, sampleRate: number): void {
    if (!this.node) return
    const buffer = mono.buffer.byteLength === mono.length * 4 ? mono : new Float32Array(mono)
    this.node.port.postMessage(
      { type: 'loadSample', trackId, buffer, sampleRate },
      [buffer.buffer],
    )
  }

  /** Decode a built-in sample and send Float32Array to worklet (ADR 012) */
  async loadBuiltinSample(trackId: number, voiceId: string): Promise<void> {
    const url = DRUM_SAMPLES[voiceId]
    if (!url || !this.ctx) return
    const resp = await fetch(url)
    const result = await this._decodeToMono(await resp.arrayBuffer())
    if (!result) return
    this._sendSample(trackId, result.mono, result.sampleRate)
  }

  /** Decode a user-provided File and send to worklet. Returns waveform + raw buffer for persistence. (ADR 012 Phase 2) */
  async loadUserSample(trackId: number, file: File): Promise<{ waveform: Float32Array; rawBuffer: ArrayBuffer } | null> {
    await this.init()
    const rawBuffer = await file.arrayBuffer()
    // Clone before decodeAudioData (which detaches the buffer)
    const rawCopy = rawBuffer.slice(0)
    const result = await this._decodeToMono(rawBuffer)
    if (!result) return null
    const waveform = new Float32Array(result.mono)
    // Cache decoded mono for re-send after voice re-init
    this.userSamples.set(trackId, { mono: new Float32Array(waveform), sampleRate: result.sampleRate })
    this._sendSample(trackId, result.mono, result.sampleRate)
    return { waveform, rawBuffer: rawCopy }
  }

  /** Decode a stored ArrayBuffer and cache for worklet. Returns waveform for display. (ADR 020 Section I) */
  async loadSampleFromBuffer(trackId: number, rawBuffer: ArrayBuffer): Promise<Float32Array | null> {
    await this.init()
    // Clone before decodeAudioData (which detaches the buffer)
    const result = await this._decodeToMono(rawBuffer.slice(0))
    if (!result) return null
    const waveform = new Float32Array(result.mono)
    // Cache decoded mono — will be sent to worklet by _autoLoadSamples on next sendPattern
    this.userSamples.set(trackId, { mono: new Float32Array(waveform), sampleRate: result.sampleRate })
    return waveform
  }

  private _post(cmd: WorkletCommand) { this.node?.port.postMessage(cmd) }
}

function mapTrig(trig: { active: boolean; note: number; velocity: number; duration?: number; slide?: boolean; chance?: number; notes?: number[]; paramLocks?: Record<string, number> }, transpose = 0) {
  return {
    active:   trig.active,
    note:     trig.note + transpose,
    velocity: trig.velocity,
    duration: trig.duration ?? 1,
    slide:    trig.slide ?? false,
    ...(trig.chance != null ? { chance: trig.chance } : {}),
    ...(trig.notes ? { notes: trig.notes.map(n => n + transpose) } : {}),
    ...(trig.paramLocks && Object.keys(trig.paramLocks).length > 0
      ? { paramLocks: { ...trig.paramLocks } } : {}),
  }
}

function patternToWorklet(
  s: Song, perf?: PerfState, fxPad?: FxPadState, sectionIndex = 0,
): WorkletPattern {
  const sec = s.sections[sectionIndex]
  return buildWorkletPattern(s, s.patterns[sec.patternIndex], perf, fxPad)
}

import type { Pattern } from '../state.svelte.ts'

/** Compute granular params adjusted by flavour (ADR 075) */
function granularFlavourParams(
  fxPad?: FxPadState, perf?: PerfState,
): { granularX: number; granularY: number; granularPitch: number; granularScatter: number; granularFreeze: boolean } {
  const gx = fxPad?.granular.x ?? 0.5
  const gy = fxPad?.granular.y ?? 0.3
  const pitch   = perf?.granularPitch   ?? 0.5
  const scatter = perf?.granularScatter ?? 0.67
  const freeze  = perf?.granularFreeze  ?? false

  switch (fxFlavours.granular) {
    case 'freeze':
      // Auto-engage freeze when granular is ON
      return { granularX: gx, granularY: gy, granularPitch: pitch, granularScatter: scatter,
               granularFreeze: fxPad?.granular.on ?? false }
    case 'stretch':
      // Large grains, low density, no scatter, no pitch shift
      return { granularX: 0.5 + gx * 0.5, granularY: 0.05 + gy * 0.25,
               granularPitch: 0.5, granularScatter: 0.0, granularFreeze: freeze }
    default: // 'cloud'
      return { granularX: gx, granularY: gy, granularPitch: pitch, granularScatter: scatter, granularFreeze: freeze }
  }
}

function buildWorkletPattern(
  s: Song, pat: Pattern, perf?: PerfState, fxPad?: FxPadState,
): WorkletPattern {
  const fx = s.effects

  // ── Reverb flavour (ADR 075) ──
  let reverbSize: number, reverbDamp: number, shimmerAmount = 0
  if (fxPad?.verb.on) {
    if (fxFlavours.verb === 'shimmer') {
      // Shimmer: large reverb + octave-up pitch shift feedback
      // X = size (0.7–0.99), Y = shimmer amount (0–0.6), damp low for bright reflections
      reverbSize = 0.7 + fxPad.verb.x * 0.29
      reverbDamp = 0.15
      shimmerAmount = fxPad.verb.y * 0.6
    } else if (fxFlavours.verb === 'hall') {
      // Hall: large diffuse — size 0.82–0.99, damp 0–0.3
      reverbSize = 0.82 + fxPad.verb.x * 0.17
      reverbDamp = (1.0 - fxPad.verb.y) * 0.3
    } else {
      // Room (default): size 0.4–0.99, damp 0–1.0
      reverbSize = 0.4 + fxPad.verb.x * 0.59
      reverbDamp = 1.0 - fxPad.verb.y
    }
  } else {
    reverbSize = fx.reverb.size
    reverbDamp = fx.reverb.damp
  }

  // ── Delay flavour (ADR 075) ──
  let delayTimeMs: number
  const delayFb = fxPad?.delay.on ? fxPad.delay.y * 0.85 : fx.delay.feedback
  const quarterMs = 60000 / s.bpm
  if (fxPad?.delay.on && fxFlavours.delay === 'dotted') {
    // Dotted 8th = 3/4 of a quarter note — time locked to tempo
    delayTimeMs = quarterMs * 0.75
  } else {
    const delayTimeFrac = fxPad?.delay.on ? 0.125 + fxPad.delay.x * 0.875 : fx.delay.time
    delayTimeMs = quarterMs * delayTimeFrac
  }

  // Master pad → comp/ducker/return (denormalize from 0–1)
  const mc = masterPad.comp
  const md = masterPad.duck
  const mr = masterPad.ret

  return {
    bpm: s.bpm,
    fx:  {
      reverb: { size: reverbSize, damp: reverbDamp },
      delay:  { time: delayTimeMs, feedback: delayFb },
      ducker: md.on ? { depth: md.x, release: 20 + md.y * 480 } : { ...fx.ducker },
      comp:   mc.on ? { threshold: 0.1 + mc.x * 0.9, ratio: 1 + mc.y * 19, makeup: fx.comp.makeup, attack: fx.comp.attack, release: fx.comp.release } : { ...fx.comp },
      verbReturn: mr.on ? mr.x * 2.0 : 1.0,
      dlyReturn:  mr.on ? mr.y * 2.0 : 1.0,
      filter: {
        on: fxPad?.filter.on ?? false,
        x:  fxPad?.filter.x  ?? 0.5,
        y:  fxPad?.filter.y  ?? 0.3,
      },
      eq: {
        bands: [
          { on: fxPad?.eqLow.on  ?? true, freq: 20 * Math.pow(1000, fxPad?.eqLow.x  ?? 0.33), gain: ((fxPad?.eqLow.y  ?? 0.5) - 0.5) * 24, q: fxPad?.eqLow.q  ?? 1.5, shelf: fxPad?.eqLow.shelf },
          { on: fxPad?.eqMid.on  ?? true, freq: 20 * Math.pow(1000, fxPad?.eqMid.x  ?? 0.57), gain: ((fxPad?.eqMid.y  ?? 0.5) - 0.5) * 24, q: fxPad?.eqMid.q  ?? 1.5 },
          { on: fxPad?.eqHigh.on ?? true, freq: 20 * Math.pow(1000, fxPad?.eqHigh.x ?? 0.87), gain: ((fxPad?.eqHigh.y ?? 0.5) - 0.5) * 24, q: fxPad?.eqHigh.q ?? 1.5, shelf: fxPad?.eqHigh.shelf },
        ],
      },
      shimmerAmount,
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
      glitchRedux:  fxFlavours.glitch === 'redux',
      delayTape:    fxFlavours.delay  === 'tape',
      glitchStutter: fxFlavours.glitch === 'stutter',
      granularOn:      fxPad?.granular.on ?? false,
      ...granularFlavourParams(fxPad, perf),
      swing:           perf?.swing       ?? 0,
    },
    tracks: s.tracks.map((t) => {
      const cell = cellForTrack(pat, t.id)
      if (!cell) return {
        steps: 16, muted: true, voiceId: '', sidechainSource: false,
        volume: 0, pan: 0, reverbSend: 0, delaySend: 0, glitchSend: 0, granularSend: 0,
        voiceParams: {}, trigs: [],
      }
      return {
        steps:       cell.steps,
        muted:       ui.soloTracks.size > 0 ? !ui.soloTracks.has(t.id) : t.muted,
        voiceId:     cell.voiceId ?? '',
        sidechainSource: cell.voiceId ? isSidechainSource(cell.voiceId) : false,
        volume:      t.volume,
        pan:         t.pan,
        reverbSend:    Math.min(1, cell.reverbSend   + (fxPad?.verb.on    ? 0.3 : 0)),
        delaySend:     Math.min(1, cell.delaySend    + (fxPad?.delay.on   ? 0.3 : 0)),
        glitchSend:    Math.min(1, cell.glitchSend   + (fxPad?.glitch.on  ? 0.3 : 0)),
        granularSend:  Math.min(1, cell.granularSend + (fxPad?.granular.on ? 0.3 : 0)),
        voiceParams: { ...cell.voiceParams },
        insertFx: cell.insertFx?.type ? {
          type: cell.insertFx.type,
          mix: cell.insertFx.mix,
          x: cell.insertFx.x,
          y: cell.insertFx.y,
          hall:   cell.insertFx.flavour === 'hall',
          dotted: cell.insertFx.flavour === 'dotted',
          tape:   cell.insertFx.flavour === 'tape',
          redux:  cell.insertFx.flavour === 'redux',
        } : undefined,
        trigs:       cell.trigs.map(trig => mapTrig(trig)),
      }
    }),
  }
}

export const engine = new GrooveboxEngine()
