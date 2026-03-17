import { describe, it, expect } from 'vitest'
import {
  makeVoice, VOICE_LIST, DRUM_VOICES, isSidechainSource,
  // Verify barrel re-exports work
  midiToHz, DrumMachine, TB303Voice, AnalogVoice, MoogVoice, FMVoice, WTSynth,
  SamplerVoice, PolySampler,
} from './voices.ts'
import type { Voice as _Voice, SampleZone as _SampleZone, VoiceId as _VoiceId } from './voices.ts'

const SR = 44100

describe('makeVoice', () => {
  it('returns a valid Voice for every VoiceId in VOICE_LIST', () => {
    for (const meta of VOICE_LIST) {
      const voice = makeVoice(0, meta.id, SR)
      expect(voice).not.toBeNull()
      // Every voice should implement the Voice interface
      expect(typeof voice!.noteOn).toBe('function')
      expect(typeof voice!.noteOff).toBe('function')
      expect(typeof voice!.tick).toBe('function')
      expect(typeof voice!.reset).toBe('function')
      expect(typeof voice!.setParam).toBe('function')
    }
  })

  it('returns AnalogVoice fallback for unknown voiceId', () => {
    const voice = makeVoice(0, 'UnknownSynth', SR)
    expect(voice).not.toBeNull()
    // Verify it's an AnalogVoice by checking it produces output
    voice!.noteOn(60, 0.8)
    let sum = 0
    for (let i = 0; i < 100; i++) sum += Math.abs(voice!.tick())
    expect(sum).toBeGreaterThan(0)
  })

  it('returns null for empty voiceId', () => {
    expect(makeVoice(0, '', SR)).toBeNull()
  })
})

describe('DRUM_VOICES', () => {
  it('matches drum category entries in VOICE_LIST', () => {
    const drumIds = VOICE_LIST.filter(v => v.category === 'drum').map(v => v.id)
    for (const id of drumIds) {
      expect(DRUM_VOICES.has(id)).toBe(true)
    }
    // No non-drum voices in DRUM_VOICES
    const nonDrumIds = VOICE_LIST.filter(v => v.category !== 'drum').map(v => v.id)
    for (const id of nonDrumIds) {
      expect(DRUM_VOICES.has(id)).toBe(false)
    }
  })
})

describe('isSidechainSource', () => {
  it('returns true only for Kick and Kick808', () => {
    expect(isSidechainSource('Kick')).toBe(true)
    expect(isSidechainSource('Kick808')).toBe(true)
    expect(isSidechainSource('Snare')).toBe(false)
    expect(isSidechainSource('Bass303')).toBe(false)
    expect(isSidechainSource('Sampler')).toBe(false)
  })
})

describe('VOICE_LIST', () => {
  it('has unique ids', () => {
    const ids = VOICE_LIST.map(v => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('barrel re-exports', () => {
  it('all classes are accessible from voices.ts', () => {
    // These imports would fail at compile time if re-exports were broken,
    // but verify they're constructable at runtime too
    expect(typeof midiToHz).toBe('function')
    expect(midiToHz(69)).toBeCloseTo(440)
    expect(new DrumMachine(SR, 'Kick')).toBeTruthy()
    expect(new TB303Voice(SR)).toBeTruthy()
    expect(new AnalogVoice(SR)).toBeTruthy()
    expect(new MoogVoice(SR)).toBeTruthy()
    expect(new FMVoice(SR)).toBeTruthy()
    expect(new WTSynth(SR)).toBeTruthy()
    expect(new SamplerVoice(SR)).toBeTruthy()
    expect(new PolySampler(SR)).toBeTruthy()
  })
})
