/**
 * Voice registry and barrel re-exports (ADR 009).
 *
 * All voice implementations live in separate modules:
 *   - voice-common.ts — Voice interface, midiToHz
 *   - drums.ts        — DrumMachine, DRUM_PRESETS
 *   - bass.ts         — TB303Voice, AnalogVoice
 *   - melodic.ts      — MoogVoice, FMVoice, WTSynth
 *   - sampler.ts      — SamplerVoice, PolySampler, SampleZone
 *
 * This file re-exports everything so existing imports remain valid.
 */

// ── Re-exports (barrel) ─────────────────────────────────────────────

export { midiToHz } from './voice-common.ts'
export type { Voice } from './voice-common.ts'
export { DRUM_PRESETS, DrumMachine } from './drums.ts'
export { TB303Voice, AnalogVoice } from './bass.ts'
export { MoogVoice, FMVoice, WTSynth } from './melodic.ts'
export { FMDrumVoice } from './fm-drum.ts'
export { SamplerVoice, PolySampler } from './sampler.ts'
export type { SampleZone } from './sampler.ts'

// ── Voice registry (ADR 009) ────────────────────────────────────────

import type { Voice } from './voice-common.ts'
import { DrumMachine } from './drums.ts'
import { FMDrumVoice } from './fm-drum.ts'
import { TB303Voice, AnalogVoice } from './bass.ts'
import { MoogVoice, FMVoice, WTSynth } from './melodic.ts'
import { SamplerVoice, PolySampler } from './sampler.ts'

export type VoiceId =
  | 'Kick' | 'Kick808' | 'Snare' | 'Clap' | 'Hat' | 'OpenHat' | 'Cymbal'
  | 'Tom' | 'Rimshot' | 'Cowbell' | 'Shaker'
  | 'FMDrum'
  | 'Bass303' | 'MoogLead' | 'Analog' | 'FM'
  | 'WT'
  | 'Crash' | 'Ride'
  | 'Sampler'

const VOICE_REGISTRY: Record<string, (sr: number) => Voice> = {
  Kick:     sr => new DrumMachine(sr, 'Kick'),
  Kick808:  sr => new DrumMachine(sr, 'Kick808'),
  Snare:    sr => new DrumMachine(sr, 'Snare'),
  Clap:     sr => new DrumMachine(sr, 'Clap'),
  Tom:      sr => new DrumMachine(sr, 'Tom'),
  Rimshot:  sr => new DrumMachine(sr, 'Rimshot'),
  Shaker:   sr => new DrumMachine(sr, 'Shaker'),
  Hat:      sr => new DrumMachine(sr, 'Hat'),
  OpenHat:  sr => new DrumMachine(sr, 'OpenHat'),
  Cymbal:   sr => new DrumMachine(sr, 'Cymbal'),
  Cowbell:  sr => new DrumMachine(sr, 'Cowbell'),
  FMDrum:   sr => new FMDrumVoice(sr),
  Bass303:  sr => new TB303Voice(sr),
  MoogLead: sr => new MoogVoice(sr),
  Analog:   sr => new AnalogVoice(sr),
  FM:       sr => new FMVoice(sr),
  WT:          sr => new WTSynth(sr),
  Crash: sr => new SamplerVoice(sr),
  Ride:  sr => new SamplerVoice(sr),
  Sampler:     sr => new PolySampler(sr),
}

export const DRUM_VOICES: ReadonlySet<string> = new Set([
  'Kick', 'Kick808', 'Snare', 'Clap', 'Hat', 'OpenHat', 'Cymbal',
  'Tom', 'Rimshot', 'Cowbell', 'Shaker',
  'FMDrum',
  'Crash', 'Ride',
])

export type VoiceCategory = 'drum' | 'synth' | 'sampler'

export interface VoiceMeta {
  id: VoiceId
  label: string
  fullName: string
  category: VoiceCategory
  sidechainSource?: boolean  // true = triggers sidechain ducker & bypasses ducking (ADR 064)
}

export const VOICE_LIST: VoiceMeta[] = [
  { id: 'Kick',     label: '909K',  fullName: '909 Kick',   category: 'drum', sidechainSource: true },
  { id: 'Kick808',  label: '808K',  fullName: '808 Kick',   category: 'drum', sidechainSource: true },
  { id: 'Snare',    label: 'SNARE', fullName: 'Snare',      category: 'drum' },
  { id: 'Clap',     label: 'CLAP',  fullName: 'Clap',       category: 'drum' },
  { id: 'Hat',      label: 'C.HH',  fullName: 'Closed HH',  category: 'drum' },
  { id: 'OpenHat',  label: 'O.HH',  fullName: 'Open HH',    category: 'drum' },
  { id: 'Cymbal',   label: 'CYM',   fullName: 'Cymbal',     category: 'drum' },
  { id: 'Tom',      label: 'TOM',   fullName: 'Tom',        category: 'drum' },
  { id: 'Rimshot',  label: 'RIM',   fullName: 'Rimshot',    category: 'drum' },
  { id: 'Cowbell',  label: 'BELL',  fullName: 'Cowbell',    category: 'drum' },
  { id: 'Shaker',   label: 'SHKR',  fullName: 'Shaker',     category: 'drum' },
  { id: 'Crash',    label: 'CRSH',  fullName: 'Crash',      category: 'drum' },
  { id: 'Ride',     label: 'RIDE',  fullName: 'Ride',       category: 'drum' },
  { id: 'FMDrum',   label: 'FMD',   fullName: 'FM Drum',    category: 'drum' },
  { id: 'Bass303',  label: 'BASS',  fullName: 'Bass 303',    category: 'synth' },
  { id: 'Analog',   label: 'BASS',  fullName: 'Analog Bass', category: 'synth' },
  { id: 'MoogLead', label: 'LEAD',  fullName: 'Analog Synth', category: 'synth' },
  { id: 'FM',       label: 'FM',    fullName: 'FM Synth',    category: 'synth' },
  { id: 'WT',       label: 'WAVE',  fullName: 'Wavetable',   category: 'synth' },
  { id: 'Sampler',  label: 'SMPL',  fullName: 'Sampler',    category: 'sampler' },
]

/** Lookup sidechainSource flag by voiceId (ADR 064) */
const _scSourceMap = new Map(VOICE_LIST.map(v => [v.id as string, v.sidechainSource === true]))
export function isSidechainSource(voiceId: string): boolean {
  return _scSourceMap.get(voiceId) ?? false
}

export function makeVoice(_trackIdx: number, voiceId: string, sr: number): Voice | null {
  if (!voiceId) return null
  const factory = VOICE_REGISTRY[voiceId]
  return factory ? factory(sr) : new AnalogVoice(sr)
}
