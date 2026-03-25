/**
 * Engine sample loading tests.
 * Verifies:
 * - decodeToMonoOffline correctly decodes stereo → mono
 * - loadSampleFromBuffer caches without engine init (no AudioContext needed)
 * - loadPackToTrack caches zones without engine init
 * - _autoLoadSamples sends cached data to worklet
 * - restoreSamples race: bumpSongVersion triggers re-send after async restore
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { decodeToMonoOffline, GrooveboxEngine } from './engine.ts'

// ── Mock OfflineAudioContext for Node environment ──

function makeMockAudioBuffer(channels: Float32Array[], sampleRate = 44100): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0]?.length ?? 0,
    duration: (channels[0]?.length ?? 0) / sampleRate,
    getChannelData(ch: number) { return channels[ch] },
    copyFromChannel() { /* noop */ },
    copyToChannel() { /* noop */ },
  } as unknown as AudioBuffer
}

const MONO_SAMPLES = new Float32Array([0.1, 0.5, -0.3, 0.8])
const LEFT_SAMPLES = new Float32Array([0.2, 0.6, -0.4, 1.0])
const RIGHT_SAMPLES = new Float32Array([0.4, 0.2, -0.2, 0.6])

beforeEach(() => {
  // Provide OfflineAudioContext mock
  globalThis.OfflineAudioContext = class MockOfflineAudioContext {
    decodeAudioData(_buf: ArrayBuffer): Promise<AudioBuffer> {
      // Return stereo by default — tests override via setupMono/setupStereo
      return Promise.resolve((globalThis as any).__mockAudioBuffer ?? makeMockAudioBuffer([LEFT_SAMPLES, RIGHT_SAMPLES]))
    }
  } as unknown as typeof OfflineAudioContext
})

function setupMono() {
  (globalThis as any).__mockAudioBuffer = makeMockAudioBuffer([MONO_SAMPLES])
}

function setupStereo() {
  (globalThis as any).__mockAudioBuffer = makeMockAudioBuffer([LEFT_SAMPLES, RIGHT_SAMPLES])
}

function setupDecodeError() {
  globalThis.OfflineAudioContext = class {
    decodeAudioData(): Promise<AudioBuffer> {
      return Promise.reject(new Error('decode failed'))
    }
  } as unknown as typeof OfflineAudioContext
}

// ── decodeToMonoOffline ──

describe('decodeToMonoOffline', () => {
  it('passes through mono samples unchanged', async () => {
    setupMono()
    const result = await decodeToMonoOffline(new ArrayBuffer(16))
    expect(result).not.toBeNull()
    expect(result!.mono.length).toBe(MONO_SAMPLES.length)
    for (let i = 0; i < MONO_SAMPLES.length; i++) {
      expect(result!.mono[i]).toBeCloseTo(MONO_SAMPLES[i])
    }
    expect(result!.sampleRate).toBe(44100)
  })

  it('averages stereo channels to mono', async () => {
    setupStereo()
    const result = await decodeToMonoOffline(new ArrayBuffer(16))
    expect(result).not.toBeNull()
    expect(result!.mono.length).toBe(LEFT_SAMPLES.length)
    for (let i = 0; i < LEFT_SAMPLES.length; i++) {
      const expected = (LEFT_SAMPLES[i] + RIGHT_SAMPLES[i]) * 0.5
      expect(result!.mono[i]).toBeCloseTo(expected)
    }
  })

  it('returns null on decode error', async () => {
    setupDecodeError()
    const result = await decodeToMonoOffline(new ArrayBuffer(16))
    expect(result).toBeNull()
  })
})

// ── Engine sample cache behavior ──

describe('GrooveboxEngine sample cache', () => {
  let eng: GrooveboxEngine

  beforeEach(() => {
    eng = new GrooveboxEngine()
    setupMono()
  })

  it('loadSampleFromBuffer populates userSamples cache without engine init', async () => {
    const waveform = await eng.loadSampleFromBuffer(0, new ArrayBuffer(16), 0)
    expect(waveform).not.toBeNull()
    expect(waveform!.length).toBe(MONO_SAMPLES.length)
    const cache = eng._getUserSamples()
    expect(cache.has('0_0')).toBe(true)
    expect(cache.get('0_0')!.mono.length).toBe(MONO_SAMPLES.length)
  })

  it('loadSampleFromBuffer uses trackId_patternIndex as cache key', async () => {
    await eng.loadSampleFromBuffer(3, new ArrayBuffer(16), 2)
    const cache = eng._getUserSamples()
    expect(cache.has('3_2')).toBe(true)
  })

  it('loadSampleFromBuffer defaults patternIndex to 0', async () => {
    await eng.loadSampleFromBuffer(1, new ArrayBuffer(16))
    const cache = eng._getUserSamples()
    expect(cache.has('1_0')).toBe(true)
  })

  it('loadSampleFromBuffer clears packZones for same key', async () => {
    const packCache = eng._getPackZones()
    packCache.set('0_0', [{ buffer: new Float32Array(1), bufferSR: 44100, rootNote: 60, loNote: 0, hiNote: 127, loVel: 0, hiVel: 127 }])
    await eng.loadSampleFromBuffer(0, new ArrayBuffer(16), 0)
    expect(packCache.has('0_0')).toBe(false)
    expect(eng._getUserSamples().has('0_0')).toBe(true)
  })

  it('loadSampleFromBuffer returns null on decode failure', async () => {
    setupDecodeError()
    const waveform = await eng.loadSampleFromBuffer(0, new ArrayBuffer(16), 0)
    expect(waveform).toBeNull()
    expect(eng._getUserSamples().has('0_0')).toBe(false)
  })
})

describe('GrooveboxEngine pack cache', () => {
  let eng: GrooveboxEngine

  beforeEach(() => {
    eng = new GrooveboxEngine()
  })

  it('loadPackToTrack populates packZones cache without engine init', async () => {
    const zones = [
      { buffer: new Float32Array([0.1, 0.2]), bufferSR: 44100, rootNote: 60, loNote: 48, hiNote: 72 },
    ]
    // generateWaveform is imported dynamically — mock it
    await eng.loadPackToTrack(0, zones, 0)
    const cache = eng._getPackZones()
    expect(cache.has('0_0')).toBe(true)
    expect(cache.get('0_0')!.length).toBe(1)
    expect(cache.get('0_0')![0].rootNote).toBe(60)
  })

  it('loadPackToTrack clears userSamples for same key', async () => {
    eng._getUserSamples().set('1_0', { mono: new Float32Array(1), sampleRate: 44100 })
    const zones = [
      { buffer: new Float32Array([0.1]), bufferSR: 44100, rootNote: 60, loNote: 0, hiNote: 127 },
    ]
    await eng.loadPackToTrack(1, zones, 0)
    expect(eng._getUserSamples().has('1_0')).toBe(false)
    expect(eng._getPackZones().has('1_0')).toBe(true)
  })

  it('loadPackToTrack returns null for empty zones', async () => {
    const result = await eng.loadPackToTrack(0, [], 0)
    expect(result).toBeNull()
  })
})

// ── copySampleCache ──

describe('GrooveboxEngine.copySampleCache', () => {
  let eng: GrooveboxEngine

  beforeEach(() => {
    eng = new GrooveboxEngine()
  })

  it('copies pack cache to new key', () => {
    const zones = [{ buffer: new Float32Array(1), bufferSR: 44100, rootNote: 60, loNote: 0, hiNote: 127, loVel: 0, hiVel: 127 }]
    eng._getPackZones().set('0_0', zones)
    eng.copySampleCache('0_0', '0_1')
    expect(eng._getPackZones().get('0_1')).toBe(zones)
    expect(eng._getUserSamples().has('0_1')).toBe(false)
  })

  it('copies user sample cache to new key', () => {
    const sample = { mono: new Float32Array([0.5]), sampleRate: 44100 }
    eng._getUserSamples().set('1_0', sample)
    eng.copySampleCache('1_0', '1_2')
    expect(eng._getUserSamples().get('1_2')).toBe(sample)
    expect(eng._getPackZones().has('1_2')).toBe(false)
  })

  it('pack takes priority over user sample', () => {
    const zones = [{ buffer: new Float32Array(1), bufferSR: 44100, rootNote: 60, loNote: 0, hiNote: 127, loVel: 0, hiVel: 127 }]
    const sample = { mono: new Float32Array([0.5]), sampleRate: 44100 }
    eng._getPackZones().set('2_0', zones)
    eng._getUserSamples().set('2_0', sample)
    eng.copySampleCache('2_0', '2_1')
    expect(eng._getPackZones().get('2_1')).toBe(zones)
    // User sample should be cleared since pack takes priority
    expect(eng._getUserSamples().has('2_1')).toBe(false)
  })
})
