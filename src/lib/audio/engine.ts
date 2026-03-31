/**
 * engine.ts — main thread audio engine API.
 */
import type { WorkletCommand, WorkletEvent, WorkletPattern } from './worklet-processor.ts'
import type { Song, Pattern, Cell, CellInsertFx } from '../types.ts'
import type { WorkletInsertFx } from './dsp/types.ts'
import type { FxFlavours } from '../constants.ts'
import { isSidechainSource } from './dsp/voices.ts'
import { showToast } from '../toast.svelte.ts'
import { showFatalError } from '../fatalError.svelte.ts'

/** Decode audio to mono using OfflineAudioContext — works without user gesture */
export async function decodeToMonoOffline(arrayBuf: ArrayBuffer): Promise<{ mono: Float32Array; sampleRate: number } | null> {
  // OfflineAudioContext doesn't require user gesture (unlike AudioContext.resume())
  const offCtx = new OfflineAudioContext(1, 1, 44100)
  let audioBuf: AudioBuffer
  try {
    audioBuf = await offCtx.decodeAudioData(arrayBuf)
  } catch {
    return null
  }
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

/** External state passed by callers — engine never imports reactive state (ADR 086) */
export interface EngineContext {
  fxFlavours: FxFlavours
  masterPad: { comp: { on: boolean; x: number; y: number }; duck: { on: boolean; x: number; y: number }; ret: { on: boolean; x: number; y: number }; sat: { on: boolean; x: number; y: number } }
  soloTracks: Set<number>
}

/** Callbacks injected at init time (ADR 086) */
export interface EngineCallbacks {
  onLevels(peakL: number, peakR: number, gr: number, cpu: number): void
}
import workletUrl from './worklet-processor.ts?worker&url'

/** Map built-in drum voice → pool entry name (ADR 104) */
const DRUM_POOL_NAMES: Record<string, string> = {
  Crash: '909-crash',
  Ride:  '909-ride',
}

type PerfState = {
  rootNote: number; octave: number
  breaking: boolean; masterGain: number
  filling: boolean; reversing: boolean
  swing: number
  granularPitch?: number; granularScatter?: number
  granularHold?: boolean
  reverbHold?: boolean; delayHold?: boolean; glitchHold?: boolean
  perfX?: number; perfY?: number; perfTouching?: boolean
  tiltX?: number; tiltY?: number
  stuttering?: boolean; halfSpeed?: boolean; tapeStop?: boolean
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
  private _onLevels: EngineCallbacks['onLevels'] | null = null
  private suspendTimer: ReturnType<typeof setTimeout> | null = null
  /** Tracks current voiceId per track to detect changes and reload samples */
  private trackVoiceIds: string[] = []
  /** Cached decoded user samples per cell — key: "trackId_patternIndex" (ADR 110) */
  private userSamples: Map<string, { mono: Float32Array; sampleRate: number }> = new Map()
  /** Cached pack zones per cell — key: "trackId_patternIndex" (ADR 110) */
  private packZones: Map<string, import('./dsp/voices.ts').SampleZone[]> = new Map()
  /** Tracks which sample name is currently loaded in each worklet track slot — for dedup */
  private loadedSampleKey: Map<number, string> = new Map()

  set onStep(cb: (playheads: number[], cycle: boolean) => void) { this._onStep = cb }

  getAnalyser(): AnalyserNode | null { return this.analyser }
  getContext(): AudioContext | null { return this.ctx }
  /** The analyser node is the last node before ctx.destination — use as capture tap */
  getCaptureSource(): AudioNode | null { return this.analyser }

  async init(callbacks?: EngineCallbacks): Promise<void> {
    if (callbacks) this._onLevels = callbacks.onLevels
    if (this.ctx) return
    try {
      const ctx = new AudioContext({ latencyHint: 'playback' })
      await ctx.audioWorklet.addModule(workletUrl)
      const node = new AudioWorkletNode(ctx, 'groovebox-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      })
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.8
      node.connect(analyser)
      analyser.connect(ctx.destination)
      node.port.onmessage = (e: MessageEvent<WorkletEvent>) => {
        if (e.data.type === 'step' && this._onStep) this._onStep(e.data.playheads, e.data.cycle)
        else if (e.data.type === 'levels' && this._onLevels) this._onLevels(e.data.peakL, e.data.peakR, e.data.gr, e.data.cpu ?? 0)
        else if (e.data.type === 'error') showToast(`Audio error [${e.data.code}]: ${e.data.message}`, 'error')
      }
      // Resume and warm up audio pipeline so first play() doesn't lose step 0
      if (ctx.state === 'suspended') await ctx.resume()
      // Play a silent buffer to prime the output hardware
      const warmup = ctx.createBufferSource()
      warmup.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      warmup.connect(ctx.destination)
      warmup.start()
      // Commit to instance only after all steps succeed — avoids partial init state
      this.ctx = ctx
      this.node = node
      this.analyser = analyser
    } catch (e) {
      showFatalError('AUD-001', e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  sendPatternByIndex(song: Song, perf: PerfState | undefined, fxPad: FxPadState | undefined, ctx: EngineContext, reset = false, patternIndex = 0): void {
    if (!this.node) return
    const pat = song.patterns[patternIndex]
    if (!pat) return
    const wp = buildWorkletPattern(song, pat, perf, fxPad, ctx)
    this._post({ type: 'setPattern', pattern: wp, reset })
    this._autoLoadSamples(song, wp, patternIndex)
  }

  /** Auto-load built-in and user samples for sampler voices (ADR 012, 020, 110) */
  private _autoLoadSamples(song: Song, wp: WorkletPattern, patternIndex: number): void {
    const voicesResized = wp.tracks.length !== this.trackVoiceIds.length
    for (let i = 0; i < wp.tracks.length; i++) {
      const vid = wp.tracks[i].voiceId
      const prev = this.trackVoiceIds[i]
      this.trackVoiceIds[i] = vid || ''
      if (!vid) continue
      // Built-in drum samples (Crash, Ride) — loaded from pool OPFS
      if (vid in DRUM_POOL_NAMES) {
        if (prev !== vid) void this.loadBuiltinSample(i, vid)
        continue
      }
      // User/pack samples — re-send when voice changed, resized, or pattern switched (ADR 110)
      if (vid === 'Sampler') {
        // Use actual trackId (not array index) — trackId may differ from index after track deletion
        const trackId = song.tracks[i]?.id ?? i
        const cellKey = `${trackId}_${patternIndex}`
        const sampleId = cellKey  // unique id for what should be loaded
        const alreadyLoaded = this.loadedSampleKey.get(i)
        if (alreadyLoaded === sampleId && prev === vid && !voicesResized) {
          // already loaded — skip
          continue
        }
        const cachedPack = this.packZones.get(cellKey)
        if (cachedPack) {
          this._sendZones(i, cachedPack)
          this.loadedSampleKey.set(i, sampleId)
        } else {
          const cached = this.userSamples.get(cellKey)
          if (cached) {
            this._sendSample(i, new Float32Array(cached.mono), cached.sampleRate)
            this.loadedSampleKey.set(i, sampleId)
          } else {
            // No exact cache for this cell key — fallback: find any cached sample for the same track
            // This handles pattern duplication, paste, or cells sharing the same sample across patterns
            const prefix = `${trackId}_`
            const cell = song.patterns[patternIndex]?.cells.find(c => c.trackId === trackId)
            const ref = cell?.sampleRef
            let found = false
            if (ref?.packId) {
              // Look for a matching pack in any pattern
              for (const [k, zones] of this.packZones) {
                if (k.startsWith(prefix)) {
                  this.packZones.set(cellKey, zones)
                  this._sendZones(i, zones)
                  this.loadedSampleKey.set(i, sampleId)
                  found = true
                  break
                }
              }
            }
            if (!found) {
              for (const [k, s] of this.userSamples) {
                if (k.startsWith(prefix)) {
                  this.userSamples.set(cellKey, s)
                  this._sendSample(i, new Float32Array(s.mono), s.sampleRate)
                  this.loadedSampleKey.set(i, sampleId)
                  found = true
                  break
                }
              }
            }
          }
        }
      }
    }
  }

  async play(): Promise<void> {
    if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = null }
    if (this.ctx?.state === 'suspended') await this.ctx.resume()
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
    let audioBuf: AudioBuffer
    try {
      audioBuf = await this.ctx.decodeAudioData(arrayBuf)
    } catch {
      showToast('Could not decode audio sample', 'error')
      return null
    }
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

  /** Send multi-sample zones to worklet (ADR 106) */
  private _sendZones(trackId: number, zones: import('./dsp/voices.ts').SampleZone[]): void {
    if (!this.node) return
    // Clone buffers for transfer (originals stay in cache)
    const transferZones = zones.map(z => ({
      ...z,
      buffer: new Float32Array(z.buffer),
    }))
    const transferables = transferZones.map(z => z.buffer.buffer)
    this.node.port.postMessage(
      { type: 'loadZones', trackId, zones: transferZones },
      transferables,
    )
  }

  /** Load a factory pack's zones to a track+pattern (ADR 106, 110). Returns waveform of first zone for display. */
  async loadPackToTrack(trackId: number, zones: import('../../lib/audioPool.ts').PackZoneData[], patternIndex?: number): Promise<Float32Array | null> {
    // No engine init needed — zones are already decoded Float32Arrays.
    // Cache now, send to worklet later via _autoLoadSamples when engine is ready.
    if (!zones.length) return null
    const cellKey = patternIndex != null ? `${trackId}_${patternIndex}` : `${trackId}_0`
    // Build SampleZone array and cache for re-send
    const sampleZones = zones.map(z => ({
      buffer: z.buffer,
      bufferSR: z.bufferSR,
      rootNote: z.rootNote,
      loNote: z.loNote,
      hiNote: z.hiNote,
      loVel: 0,
      hiVel: 127,
    }))
    this.packZones.set(cellKey, sampleZones)
    this.userSamples.delete(cellKey)  // clear single-sample cache
    this._sendZones(trackId, sampleZones)
    // Return waveform overview of first zone for UI display
    const { generateWaveform } = await import('../../lib/audioPool.ts')
    return generateWaveform(zones[0].buffer)
  }

  /** Load a built-in drum sample from audio pool OPFS (ADR 104) */
  async loadBuiltinSample(trackId: number, voiceId: string): Promise<void> {
    if (!this.ctx) return
    const poolName = DRUM_POOL_NAMES[voiceId]
    if (!poolName) return
    try {
      const { loadAllMeta, readSample } = await import('../../lib/audioPool.ts')
      const entries = await loadAllMeta()
      const entry = entries.find(e => e.name === poolName && e.folder.startsWith('factory/'))
      if (!entry) { showToast(`Sample not in pool: ${voiceId} — open Pool Browser to install`, 'warn'); return }
      const raw = await readSample(entry)
      if (!raw) { showToast(`Failed to read sample: ${voiceId}`, 'warn'); return }
      const result = await this._decodeToMono(raw)
      if (result) this._sendSample(trackId, result.mono, result.sampleRate)
    } catch {
      showToast(`Failed to load sample: ${voiceId}`, 'warn')
    }
  }

  /** Decode a user-provided File and send to worklet. Returns waveform + raw buffer for persistence. (ADR 012, 110) */
  async loadUserSample(trackId: number, file: File, patternIndex?: number): Promise<{ waveform: Float32Array; rawBuffer: ArrayBuffer } | null> {
    await this.init()
    const rawBuffer = await file.arrayBuffer()
    // Clone before decodeAudioData (which detaches the buffer)
    const rawCopy = rawBuffer.slice(0)
    const result = await this._decodeToMono(rawBuffer)
    if (!result) return null
    const waveform = new Float32Array(result.mono)
    const cellKey = patternIndex != null ? `${trackId}_${patternIndex}` : `${trackId}_0`
    // Cache decoded mono for re-send after voice re-init
    this.userSamples.set(cellKey, { mono: new Float32Array(waveform), sampleRate: result.sampleRate })
    this.packZones.delete(cellKey)  // clear pack cache so single sample takes priority
    this._sendSample(trackId, result.mono, result.sampleRate)
    return { waveform, rawBuffer: rawCopy }
  }

  /** Decode a stored ArrayBuffer and cache for worklet. Returns waveform for display. (ADR 020 Section I, 110) */
  async loadSampleFromBuffer(trackId: number, rawBuffer: ArrayBuffer, patternIndex?: number): Promise<Float32Array | null> {
    // Use OfflineAudioContext — avoids creating a real AudioContext before user gesture,
    // which would block on ctx.resume() and cause a race with play().
    const result = await decodeToMonoOffline(rawBuffer.slice(0))
    if (!result) return null
    const waveform = new Float32Array(result.mono)
    const cellKey = patternIndex != null ? `${trackId}_${patternIndex}` : `${trackId}_0`
    // Cache decoded mono — will be sent to worklet by _autoLoadSamples on next sendPattern
    this.userSamples.set(cellKey, { mono: new Float32Array(waveform), sampleRate: result.sampleRate })
    this.packZones.delete(cellKey)  // clear pack cache so single sample takes priority
    return waveform
  }

  /** Copy cached sample data from one cell key to another (for pattern duplicate/paste) */
  copySampleCache(srcKey: string, dstKey: string): void {
    const pack = this.packZones.get(srcKey)
    if (pack) {
      this.packZones.set(dstKey, pack)
      this.userSamples.delete(dstKey)
      return
    }
    const sample = this.userSamples.get(srcKey)
    if (sample) {
      this.userSamples.set(dstKey, sample)
      this.packZones.delete(dstKey)
    }
  }

  private _post(cmd: WorkletCommand) { this.node?.port.postMessage(cmd) }

  // ── Test helpers (not for production use) ──

  /** Expose internal caches for test assertions */
  _getUserSamples(): Map<string, { mono: Float32Array; sampleRate: number }> { return this.userSamples }
  _getPackZones(): Map<string, import('./dsp/voices.ts').SampleZone[]> { return this.packZones }
  _getLoadedSampleKey(): Map<number, string> { return this.loadedSampleKey }
  _getTrackVoiceIds(): string[] { return this.trackVoiceIds }
  /** Reset internal state for test isolation */
  _resetForTest(): void {
    this.ctx = null
    this.node = null
    this.analyser = null
    this.userSamples.clear()
    this.packZones.clear()
    this.loadedSampleKey.clear()
    this.trackVoiceIds = []
  }
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

/** Compute granular params adjusted by flavour (ADR 075) */
function granularFlavourParams(
  fxPad?: FxPadState, perf?: PerfState, flavours?: FxFlavours,
): { granularX: number; granularY: number; granularPitch: number; granularScatter: number; granularHold: boolean } {
  const gx = fxPad?.granular.x ?? 0.5
  const gy = fxPad?.granular.y ?? 0.3
  const pitch   = perf?.granularPitch   ?? 0.5
  const scatter = perf?.granularScatter ?? 0.67
  const hold    = perf?.granularHold    ?? false

  switch (flavours?.granular ?? 'cloud') {
    case 'stretch':
      // Large grains, low density, no scatter, no pitch shift
      return { granularX: 0.5 + gx * 0.5, granularY: 0.05 + gy * 0.25,
               granularPitch: 0.5, granularScatter: 0.0, granularHold: hold }
    case 'reverse':
      // Reversed grain playback — same XY mapping as cloud
      return { granularX: gx, granularY: gy, granularPitch: pitch, granularScatter: scatter, granularHold: hold }
    default: // 'cloud'
      return { granularX: gx, granularY: gy, granularPitch: pitch, granularScatter: scatter, granularHold: hold }
  }
}

function serializeInsertFx(fx: CellInsertFx | null): WorkletInsertFx | null {
  if (!fx?.type) return null
  return {
    type: fx.type,
    mix: fx.mix,
    x: fx.x,
    y: fx.y,
    hall:   fx.flavour === 'hall',
    dotted: fx.flavour === 'dotted',
    tape:   fx.flavour === 'tape',
    redux:  fx.flavour === 'redux',
    fuzz:   fx.flavour === 'fuzz',
  }
}

function buildWorkletPattern(
  s: Song, pat: Pattern, perf?: PerfState, fxPad?: FxPadState, ctx?: EngineContext,
): WorkletPattern {
  const fx = s.effects

  // ── Reverb flavour (ADR 075 / ADR 120) ──
  const verbFlavour: 'room' | 'hall' | 'shimmer' = ctx?.fxFlavours.verb as 'room' | 'hall' | 'shimmer' ?? 'room'
  let reverbSize: number, reverbDamp: number, shimmerAmount = 0
  let earlyReflections: { size: number; damp: number } | undefined
  let preDelayMs: number | undefined
  let modDepth: number | undefined
  if (fxPad?.verb.on) {
    if (verbFlavour === 'shimmer') {
      // Shimmer: large reverb + octave-up pitch shift feedback
      // X = size (0.8–0.99), Y = shimmer amount (0–1.0 mapped to internal range)
      reverbSize = 0.8 + fxPad.verb.x * 0.19
      reverbDamp = 0.1
      shimmerAmount = fxPad.verb.y
    } else if (verbFlavour === 'hall') {
      // Hall: pre-delay + modulated combs — long tail, low damping (bright, open)
      // X = size (0.85–0.99) + pre-delay (10–80ms), Y = mod depth (0–8 samples) + brightness
      reverbSize = 0.85 + fxPad.verb.x * 0.14
      reverbDamp = (1.0 - fxPad.verb.y) * 0.12
      preDelayMs = 10 + fxPad.verb.x * 70
      modDepth = 1 + fxPad.verb.y * 7
    } else {
      // Room (default): early reflections dominate, short diffuse tail
      // X = room size (scales ER delays + Freeverb), Y = brightness (wall absorption)
      reverbSize = 0.2 + fxPad.verb.x * 0.25
      reverbDamp = 0.4 + (1.0 - fxPad.verb.y) * 0.5
      earlyReflections = { size: fxPad.verb.x, damp: 1 - fxPad.verb.y }
    }
  } else {
    reverbSize = fx.reverb.size
    reverbDamp = fx.reverb.damp
  }

  // ── Delay flavour (ADR 075) ──
  let delayTimeMs: number
  const delayFb = fxPad?.delay.on ? fxPad.delay.y * 0.85 : fx.delay.feedback
  const quarterMs = 60000 / s.bpm
  if (fxPad?.delay.on && ctx?.fxFlavours.delay === 'dotted') {
    // Dotted 8th = 3/4 of a quarter note — time locked to tempo
    delayTimeMs = quarterMs * 0.75
  } else {
    const delayTimeFrac = fxPad?.delay.on ? 0.125 + fxPad.delay.x * 0.875 : fx.delay.time
    delayTimeMs = quarterMs * delayTimeFrac
  }

  // Master pad → comp/ducker/return (denormalize from 0–1)
  const mp = ctx?.masterPad
  const mc = mp?.comp ?? { on: false, x: 0, y: 0 }
  const md = mp?.duck ?? { on: false, x: 0, y: 0 }
  const mr = mp?.ret ?? { on: false, x: 0, y: 0 }
  const ms = mp?.sat ?? { on: false, x: 0.3, y: 0.7 }

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
      reverbFlavour: fxPad?.verb.on ? verbFlavour : undefined,
      earlyReflections,
      preDelay: preDelayMs != null ? { ms: preDelayMs } : undefined,
      modDepth,
      sat: ms.on ? { drive: 0.1 + ms.x * 2.9, tone: ms.y } : null,
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
      glitchRedux:  ctx?.fxFlavours.glitch === 'redux',
      delayTape:    ctx?.fxFlavours.delay  === 'tape',
      glitchStutter: ctx?.fxFlavours.glitch === 'stutter',
      granularOn:      fxPad?.granular.on ?? false,
      ...granularFlavourParams(fxPad, perf, ctx?.fxFlavours),
      swing:           perf?.swing       ?? 0,
      perfX:           perf?.perfX       ?? 0.5,
      perfY:           perf?.perfY       ?? 0.5,
      perfTouching:    perf?.perfTouching ?? false,
      tiltX:           perf?.tiltX       ?? 0,
      tiltY:           perf?.tiltY       ?? 0,
      reverbHold:      perf?.reverbHold  ?? false,
      delayHold:       perf?.delayHold   ?? false,
      glitchHold:      perf?.glitchHold  ?? false,
      stuttering:      perf?.stuttering  ?? false,
      halfSpeed:       perf?.halfSpeed   ?? false,
      tapeStop:        perf?.tapeStop    ?? false,
    },
    tracks: s.tracks.map((t) => {
      const cell = pat.cells.find((c: Cell) => c.trackId === t.id)
      if (!cell) return {
        steps: 16, muted: true, voiceId: '', sidechainSource: false,
        volume: 0, pan: 0, reverbSend: 0, delaySend: 0, glitchSend: 0, granularSend: 0,
        voiceParams: {}, trigs: [],
      }
      const soloTracks = ctx?.soloTracks
      return {
        steps:       cell.steps,
        muted:       soloTracks && soloTracks.size > 0 ? !soloTracks.has(t.id) : t.muted,
        voiceId:     cell.voiceId ?? '',
        sidechainSource: cell.voiceId ? isSidechainSource(cell.voiceId) : false,
        volume:      t.volume,
        pan:         t.pan,
        reverbSend:    Math.min(1, cell.reverbSend   + (fxPad?.verb.on    ? 0.3 : 0)),
        delaySend:     Math.min(1, cell.delaySend    + (fxPad?.delay.on   ? 0.3 : 0)),
        glitchSend:    Math.min(1, cell.glitchSend   + (fxPad?.glitch.on  ? 0.3 : 0)),
        granularSend:  Math.min(1, cell.granularSend + (fxPad?.granular.on ? 0.3 : 0)),
        voiceParams: { ...cell.voiceParams },
        insertFx: cell.insertFx ? [
          serializeInsertFx(cell.insertFx[0]),
          serializeInsertFx(cell.insertFx[1]),
        ] : undefined,
        scale:       cell.scale,
        trigs:       cell.trigs.map(trig => mapTrig(trig)),
      }
    }),
  }
}

export const engine = new GrooveboxEngine()
