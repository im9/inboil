// Factory presets for all voices (ADR 015)
import type { VoiceId } from './state.svelte.ts'

export interface SynthPreset {
  name: string
  voiceId: VoiceId
  category?: string
  params: Record<string, number>
}

// ── iDEATH presets ────────────────────────────────────────────────────
// Param reference (defaults):
//   oscAPos=0.0  oscBPos=0.25  oscBSemi=0  oscMix=0.5  combine=0(MIX) fmIndex=3.0
//   cutoffBase=1200  envMod=4000  resonance=2.0  filterMode=0(LP)
//   attack=0.005  decay=0.3  sustain=0.5  release=0.3  modDecay=0.25
//   lfo1Rate=2.0  lfo1Shape=0(SIN)  lfo1Sync=0  lfo1Div=2(1/4)
//   lfo2Rate=0.5  lfo2Shape=0(SIN)  drive=0.0
//   Mod matrix: mod{0-7}{Src,Dst,Amt}  Src: 0=LFO1 1=LFO2 2=Env2 3=Vel 4=Note
//   Dst: 0=Pitch 1=WTPos 2=Cutoff 3=Reso 4=FMIndex 5=Volume

const IDEATH_PRESETS: SynthPreset[] = [
  // ── Lead ───────────────────────────────────────────
  { name: 'Saw Lead', voiceId: 'iDEATH', category: 'lead', params: {
    oscAPos: 0.5, oscBPos: 0.5, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 2000, envMod: 3000, resonance: 1.5, filterMode: 0,
    attack: 0.005, decay: 0.4, sustain: 0.7, release: 0.25, modDecay: 0.2,
    lfo1Rate: 5.0, lfo1Shape: 0, lfo2Rate: 0.3, lfo2Shape: 0,
  }},
  { name: 'Square Lead', voiceId: 'iDEATH', category: 'lead', params: {
    oscAPos: 0.75, oscBPos: 0.75, oscBSemi: 12, oscMix: 0.3, combine: 0,
    cutoffBase: 1800, envMod: 2500, resonance: 1.8, filterMode: 0,
    attack: 0.005, decay: 0.35, sustain: 0.65, release: 0.3, modDecay: 0.18,
    lfo1Rate: 6.0, lfo1Shape: 0, lfo2Rate: 0.2, lfo2Shape: 1,
  }},
  { name: 'Detune Lead', voiceId: 'iDEATH', category: 'lead', params: {
    oscAPos: 0.5, oscBPos: 0.55, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 3000, envMod: 2000, resonance: 1.2, filterMode: 0,
    attack: 0.01, decay: 0.5, sustain: 0.6, release: 0.35, modDecay: 0.3,
    lfo1Rate: 4.0, lfo1Shape: 0, lfo2Rate: 0.15, lfo2Shape: 2,
  }},
  { name: 'Acid Lead', voiceId: 'iDEATH', category: 'lead', params: {
    oscAPos: 0.5, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 200, envMod: 7000, resonance: 8.0, filterMode: 0,
    attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1, modDecay: 0.12,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  // ── Bass ───────────────────────────────────────────
  { name: 'Sub Bass', voiceId: 'iDEATH', category: 'bass', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 120, envMod: 800, resonance: 1.0, filterMode: 0,
    attack: 0.005, decay: 0.4, sustain: 0.8, release: 0.1, modDecay: 0.15,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Reese Bass', voiceId: 'iDEATH', category: 'bass', params: {
    oscAPos: 0.5, oscBPos: 0.52, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 300, envMod: 2000, resonance: 3.0, filterMode: 0,
    attack: 0.005, decay: 0.5, sustain: 0.7, release: 0.15, modDecay: 0.25,
    lfo1Rate: 0.3, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Acid Bass', voiceId: 'iDEATH', category: 'bass', params: {
    oscAPos: 0.5, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 100, envMod: 6000, resonance: 10.0, filterMode: 0,
    attack: 0.001, decay: 0.18, sustain: 0.0, release: 0.08, modDecay: 0.1,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'FM Bass', voiceId: 'iDEATH', category: 'bass', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.5, combine: 1, fmIndex: 5.0,
    cutoffBase: 400, envMod: 3000, resonance: 1.5, filterMode: 0,
    attack: 0.001, decay: 0.25, sustain: 0.3, release: 0.1, modDecay: 0.15,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Wobble Bass', voiceId: 'iDEATH', category: 'bass', params: {
    oscAPos: 0.5, oscBPos: 0.5, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 300, envMod: 2000, resonance: 3.0, filterMode: 0, drive: 0.4,
    attack: 0.005, decay: 0.5, sustain: 0.8, release: 0.15, modDecay: 0.3,
    lfo1Rate: 2.0, lfo1Shape: 0, lfo1Sync: 1, lfo1Div: 2,
    lfo2Rate: 0.1, lfo2Shape: 0,
    mod0Src: 0, mod0Dst: 2, mod0Amt: 0.7,
  }},
  { name: 'Filthy Bass', voiceId: 'iDEATH', category: 'bass', params: {
    oscAPos: 0.5, oscBPos: 0.52, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 250, envMod: 3000, resonance: 4.0, filterMode: 0, drive: 0.8,
    attack: 0.005, decay: 0.6, sustain: 0.7, release: 0.15, modDecay: 0.3,
    lfo1Rate: 3.0, lfo1Shape: 0, lfo1Sync: 0, lfo1Div: 2,
    lfo2Rate: 0.2, lfo2Shape: 0,
    mod0Src: 0, mod0Dst: 2, mod0Amt: 0.5,
  }},
  { name: 'Sub Wobble', voiceId: 'iDEATH', category: 'bass', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 150, envMod: 600, resonance: 1.5, filterMode: 0, drive: 0.0,
    attack: 0.005, decay: 0.5, sustain: 0.9, release: 0.15, modDecay: 0.2,
    lfo1Rate: 1.0, lfo1Shape: 0, lfo1Sync: 1, lfo1Div: 0,
    lfo2Rate: 0.1, lfo2Shape: 0,
    mod0Src: 0, mod0Dst: 2, mod0Amt: 0.4,
  }},
  { name: 'Growl Bass', voiceId: 'iDEATH', category: 'bass', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.5, combine: 1, fmIndex: 4.0,
    cutoffBase: 400, envMod: 3000, resonance: 2.5, filterMode: 0, drive: 0.6,
    attack: 0.005, decay: 0.4, sustain: 0.6, release: 0.12, modDecay: 0.2,
    lfo1Rate: 2.0, lfo1Shape: 0, lfo1Sync: 1, lfo1Div: 3,
    lfo2Rate: 0.1, lfo2Shape: 0,
    mod0Src: 0, mod0Dst: 4, mod0Amt: 0.6,
  }},
  // ── Pad ────────────────────────────────────────────
  { name: 'Warm Pad', voiceId: 'iDEATH', category: 'pad', params: {
    oscAPos: 0.3, oscBPos: 0.4, oscBSemi: 7, oscMix: 0.5, combine: 0,
    cutoffBase: 800, envMod: 1500, resonance: 1.0, filterMode: 0,
    attack: 0.3, decay: 1.0, sustain: 0.8, release: 1.0, modDecay: 0.8,
    lfo1Rate: 0.8, lfo1Shape: 0, lfo2Rate: 0.15, lfo2Shape: 1, polyMode: 1.0,
  }},
  { name: 'Strings', voiceId: 'iDEATH', category: 'pad', params: {
    oscAPos: 0.5, oscBPos: 0.55, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 1500, envMod: 1000, resonance: 0.8, filterMode: 0,
    attack: 0.25, decay: 0.8, sustain: 0.85, release: 0.8, modDecay: 0.5,
    lfo1Rate: 5.5, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0, polyMode: 1.0,
  }},
  { name: 'Dark Pad', voiceId: 'iDEATH', category: 'pad', params: {
    oscAPos: 0.5, oscBPos: 0.7, oscBSemi: -12, oscMix: 0.4, combine: 0,
    cutoffBase: 400, envMod: 800, resonance: 2.0, filterMode: 0,
    attack: 0.5, decay: 1.5, sustain: 0.7, release: 1.5, modDecay: 1.0,
    lfo1Rate: 0.3, lfo1Shape: 1, lfo2Rate: 0.08, lfo2Shape: 0, polyMode: 1.0,
  }},
  { name: 'Shimmer', voiceId: 'iDEATH', category: 'pad', params: {
    oscAPos: 0.2, oscBPos: 0.8, oscBSemi: 12, oscMix: 0.4, combine: 0,
    cutoffBase: 2500, envMod: 2000, resonance: 1.5, filterMode: 0,
    attack: 0.4, decay: 1.0, sustain: 0.6, release: 1.2, modDecay: 0.6,
    lfo1Rate: 3.0, lfo1Shape: 0, lfo2Rate: 0.2, lfo2Shape: 2, polyMode: 1.0,
  }},
  // ── Pluck ──────────────────────────────────────────
  { name: 'Pluck', voiceId: 'iDEATH', category: 'pluck', params: {
    oscAPos: 0.5, oscBPos: 0.3, oscBSemi: 0, oscMix: 0.3, combine: 0,
    cutoffBase: 3000, envMod: 5000, resonance: 1.5, filterMode: 0,
    attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.15, modDecay: 0.08,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0, polyMode: 1.0,
  }},
  { name: 'Bell', voiceId: 'iDEATH', category: 'pluck', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 7, oscMix: 0.5, combine: 1, fmIndex: 4.0,
    cutoffBase: 4000, envMod: 2000, resonance: 0.8, filterMode: 0,
    attack: 0.001, decay: 0.8, sustain: 0.0, release: 0.5, modDecay: 0.4,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0, polyMode: 1.0,
  }},
  { name: 'Marimba', voiceId: 'iDEATH', category: 'pluck', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.5, combine: 1, fmIndex: 2.5,
    cutoffBase: 2000, envMod: 3000, resonance: 1.0, filterMode: 0,
    attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.2, modDecay: 0.1,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0, polyMode: 1.0,
  }},
  // ── Keys ───────────────────────────────────────────
  { name: 'EP Piano', voiceId: 'iDEATH', category: 'keys', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.5, combine: 1, fmIndex: 3.5,
    cutoffBase: 3000, envMod: 1500, resonance: 0.8, filterMode: 0,
    attack: 0.001, decay: 0.6, sustain: 0.3, release: 0.4, modDecay: 0.3,
    lfo1Rate: 4.0, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0, polyMode: 1.0,
  }},
  { name: 'Organ', voiceId: 'iDEATH', category: 'keys', params: {
    oscAPos: 0.75, oscBPos: 0.75, oscBSemi: 12, oscMix: 0.4, combine: 0,
    cutoffBase: 2500, envMod: 500, resonance: 0.8, filterMode: 0,
    attack: 0.005, decay: 0.5, sustain: 0.9, release: 0.1, modDecay: 0.2,
    lfo1Rate: 6.0, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0, polyMode: 1.0,
  }},
  { name: 'Clav', voiceId: 'iDEATH', category: 'keys', params: {
    oscAPos: 0.75, oscBPos: 0.5, oscBSemi: 0, oscMix: 0.3, combine: 0,
    cutoffBase: 1500, envMod: 4000, resonance: 3.0, filterMode: 0,
    attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1, modDecay: 0.08,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0, polyMode: 1.0,
  }},
  // ── FX ─────────────────────────────────────────────
  { name: 'Sweep', voiceId: 'iDEATH', category: 'fx', params: {
    oscAPos: 0.5, oscBPos: 0.9, oscBSemi: 7, oscMix: 0.5, combine: 2,
    cutoffBase: 200, envMod: 6000, resonance: 6.0, filterMode: 0,
    attack: 0.1, decay: 1.5, sustain: 0.0, release: 0.5, modDecay: 1.2,
    lfo1Rate: 0.5, lfo1Shape: 2, lfo2Rate: 3.0, lfo2Shape: 4,
  }},
  { name: 'Noise Hit', voiceId: 'iDEATH', category: 'fx', params: {
    oscAPos: 1.0, oscBPos: 1.0, oscBSemi: 5, oscMix: 0.5, combine: 2,
    cutoffBase: 5000, envMod: 3000, resonance: 4.0, filterMode: 1,
    attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.1, modDecay: 0.06,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Riser', voiceId: 'iDEATH', category: 'fx', params: {
    oscAPos: 0.5, oscBPos: 0.5, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 100, envMod: 7000, resonance: 5.0, filterMode: 0,
    attack: 1.0, decay: 0.5, sustain: 0.9, release: 0.3, modDecay: 2.0,
    lfo1Rate: 8.0, lfo1Shape: 2, lfo2Rate: 0.5, lfo2Shape: 0,
  }},
]

// ── Kick presets ──────────────────────────────────────────────────────
const KICK_PRESETS: SynthPreset[] = [
  { name: '808 Sub', voiceId: 'Kick', params: {
    toneLevel: 1.0, pitchStart: 200, pitchEnd: 40, pitchDecay: 0.06,
    decay: 0.6, drive: 0.8, click: 0.3, hpFreq: 20,
  }},
  { name: 'Punchy', voiceId: 'Kick', params: {
    toneLevel: 1.0, pitchStart: 400, pitchEnd: 60, pitchDecay: 0.025,
    decay: 0.25, drive: 1.8, click: 0.8, hpFreq: 30,
  }},
  { name: 'Lo-fi Thud', voiceId: 'Kick', params: {
    toneLevel: 1.0, pitchStart: 180, pitchEnd: 50, pitchDecay: 0.05,
    decay: 0.30, drive: 0.6, click: 0.2, hpFreq: 20,
  }},
  { name: 'Clicky', voiceId: 'Kick', params: {
    toneLevel: 1.0, pitchStart: 500, pitchEnd: 70, pitchDecay: 0.015,
    decay: 0.18, drive: 2.0, click: 1.0, hpFreq: 40,
  }},
]

// ── Snare presets ────────────────────────────────────────────────────
const SNARE_PRESETS: SynthPreset[] = [
  { name: 'Tight', voiceId: 'Snare', params: {
    toneLevel: 0.6, pitchStart: 280, pitchEnd: 160, pitchDecay: 0.02,
    noiseLevel: 0.9, noiseFilterFreq: 4000, noiseFilterQ: 1.2,
    decay: 0.12, drive: 1.2, click: 0.5,
  }},
  { name: 'Trap', voiceId: 'Snare', params: {
    toneLevel: 0.4, pitchStart: 240, pitchEnd: 140, pitchDecay: 0.03,
    noiseLevel: 1.1, noiseFilterFreq: 6000, noiseFilterQ: 0.8,
    decay: 0.20, drive: 1.5, click: 0.4,
  }},
  { name: 'Lo-fi', voiceId: 'Snare', params: {
    toneLevel: 0.5, pitchStart: 220, pitchEnd: 150, pitchDecay: 0.035,
    noiseLevel: 0.7, noiseFilterFreq: 2500, noiseFilterQ: 1.5,
    decay: 0.15, drive: 0.8, click: 0.3,
  }},
  { name: 'Blast', voiceId: 'Snare', params: {
    toneLevel: 0.3, pitchStart: 300, pitchEnd: 180, pitchDecay: 0.015,
    noiseLevel: 1.2, noiseFilterFreq: 8000, noiseFilterQ: 0.6,
    decay: 0.10, drive: 2.0, click: 0.7,
  }},
]

// ── Clap presets ─────────────────────────────────────────────────────
const CLAP_PRESETS: SynthPreset[] = [
  { name: 'Tight Clap', voiceId: 'Clap', params: {
    noiseLevel: 1.0, noiseFilterFreq: 3000, noiseFilterQ: 1.0,
    decay: 0.12, burstCount: 3, burstGap: 0.012,
  }},
  { name: 'Big Clap', voiceId: 'Clap', params: {
    noiseLevel: 1.0, noiseFilterFreq: 2000, noiseFilterQ: 0.8,
    decay: 0.25, burstCount: 4, burstGap: 0.018,
  }},
  { name: 'Snap', voiceId: 'Clap', params: {
    noiseLevel: 0.8, noiseFilterFreq: 5000, noiseFilterQ: 1.5,
    decay: 0.06, burstCount: 1, burstGap: 0.010,
  }},
]

// ── Hat presets ──────────────────────────────────────────────────────
const HAT_PRESETS: SynthPreset[] = [
  { name: 'Sharp', voiceId: 'Hat', params: {
    metalLevel: 0.8, metalFreq: 900, noiseLevel: 0.4,
    noiseFilterFreq: 8000, decay: 0.04, hpFreq: 5000,
  }},
  { name: 'Soft', voiceId: 'Hat', params: {
    metalLevel: 0.5, metalFreq: 700, noiseLevel: 0.6,
    noiseFilterFreq: 4000, decay: 0.06, hpFreq: 3000,
  }},
  { name: 'Fizzy', voiceId: 'Hat', params: {
    metalLevel: 0.3, metalFreq: 1100, noiseLevel: 0.9,
    noiseFilterFreq: 10000, decay: 0.03, hpFreq: 6000,
  }},
]

// ── Bass303 presets ──────────────────────────────────────────────────
const BASS303_PRESETS: SynthPreset[] = [
  { name: 'Acid', voiceId: 'Bass303', params: {
    cutoffBase: 100, envMod: 7000, resonance: 12.0, decay: 0.15, drive: 2.5,
  }},
  { name: 'Deep Sub', voiceId: 'Bass303', params: {
    cutoffBase: 80, envMod: 1500, resonance: 3.0, decay: 0.35, drive: 1.0,
  }},
  { name: 'Squelch', voiceId: 'Bass303', params: {
    cutoffBase: 150, envMod: 5000, resonance: 10.0, decay: 0.12, drive: 2.0,
  }},
  { name: 'Round', voiceId: 'Bass303', params: {
    cutoffBase: 250, envMod: 2000, resonance: 4.0, decay: 0.25, drive: 1.2,
  }},
]

// ── MoogLead presets ─────────────────────────────────────────────────
const MOOG_PRESETS: SynthPreset[] = [
  { name: 'Fat Lead', voiceId: 'MoogLead', params: {
    cutoffBase: 600, envMod: 6000, resonance: 2.0, filterDecay: 0.4,
    ampAttack: 0.005, ampDecay: 0.5, ampSustain: 0.8, ampRelease: 0.3,
  }},
  { name: 'Brass', voiceId: 'MoogLead', params: {
    cutoffBase: 300, envMod: 8000, resonance: 1.5, filterDecay: 0.25,
    ampAttack: 0.02, ampDecay: 0.4, ampSustain: 0.7, ampRelease: 0.2,
  }},
  { name: 'Soft', voiceId: 'MoogLead', params: {
    cutoffBase: 800, envMod: 3000, resonance: 1.0, filterDecay: 0.5,
    ampAttack: 0.05, ampDecay: 0.6, ampSustain: 0.9, ampRelease: 0.5,
  }},
  { name: 'Screamer', voiceId: 'MoogLead', params: {
    cutoffBase: 200, envMod: 9000, resonance: 3.0, filterDecay: 0.15,
    ampAttack: 0.001, ampDecay: 0.3, ampSustain: 0.6, ampRelease: 0.15,
  }},
]

// ── FM presets (ADR 068: 4-op) ────────────────────────────────────────
const FM_PRESETS: SynthPreset[] = [
  // ── Keys ──
  { name: 'EP Piano', voiceId: 'FM', params: {
    algorithm: 4, op1Fb: 0.1,
    op1Ratio: 1.0, op2Ratio: 1.0, op3Ratio: 1.0, op4Ratio: 14.0,
    op1Level: 1.0, op2Level: 0.9, op3Level: 0.6, op4Level: 0.25,
    op1Decay: 0.8, op2Decay: 0.7, op3Decay: 0.08, op4Decay: 0.06,
    op1Attack: 0.003, op1Release: 0.5, polyMode: 1.0,
  }},
  { name: 'Clav', voiceId: 'FM', params: {
    algorithm: 0, op1Fb: 0.2,
    op1Ratio: 1.0, op2Ratio: 3.0, op3Ratio: 1.0, op4Ratio: 5.0,
    op1Level: 1.0, op2Level: 0.8, op3Level: 0.7, op4Level: 0.5,
    op1Decay: 0.12, op2Decay: 0.06, op3Decay: 0.04, op4Decay: 0.03,
    op1Attack: 0.001, op1Release: 0.1, polyMode: 1.0,
  }},
  { name: 'Harpsichord', voiceId: 'FM', params: {
    algorithm: 0, op1Fb: 0.3,
    op1Ratio: 1.0, op2Ratio: 4.0, op3Ratio: 6.0, op4Ratio: 2.0,
    op1Level: 1.0, op2Level: 0.6, op3Level: 0.5, op4Level: 0.4,
    op1Decay: 0.25, op2Decay: 0.08, op3Decay: 0.05, op4Decay: 0.10,
    op1Attack: 0.001, op1Release: 0.15, polyMode: 1.0,
  }},
  { name: 'Vibraphone', voiceId: 'FM', params: {
    algorithm: 4, op1Fb: 0.0,
    op1Ratio: 1.0, op2Ratio: 1.0, op3Ratio: 3.5, op4Ratio: 3.5,
    op1Level: 1.0, op2Level: 0.85, op3Level: 0.45, op4Level: 0.45,
    op1Decay: 1.2, op2Decay: 1.0, op3Decay: 0.3, op4Decay: 0.3,
    op1Attack: 0.001, op1Release: 0.6, polyMode: 1.0,
  }},
  // ── Bass ──
  { name: 'FM Bass', voiceId: 'FM', params: {
    algorithm: 0, op1Fb: 0.25,
    op1Ratio: 1.0, op2Ratio: 1.0, op3Ratio: 2.0, op4Ratio: 3.0,
    op1Level: 1.0, op2Level: 0.9, op3Level: 0.7, op4Level: 0.5,
    op1Decay: 0.20, op2Decay: 0.08, op3Decay: 0.05, op4Decay: 0.03,
    op1Attack: 0.001, op1Release: 0.1,
  }},
  { name: 'Slap Bass', voiceId: 'FM', params: {
    algorithm: 0, op1Fb: 0.3,
    op1Ratio: 1.0, op2Ratio: 3.0, op3Ratio: 5.0, op4Ratio: 7.0,
    op1Level: 1.0, op2Level: 0.8, op3Level: 0.6, op4Level: 0.4,
    op1Decay: 0.15, op2Decay: 0.04, op3Decay: 0.03, op4Decay: 0.02,
    op1Attack: 0.001, op1Release: 0.08,
  }},
  { name: 'Sub Bass', voiceId: 'FM', params: {
    algorithm: 7, op1Fb: 0.1,
    op1Ratio: 1.0, op2Ratio: 2.0, op3Ratio: 0.5, op4Ratio: 1.0,
    op1Level: 1.0, op2Level: 0.3, op3Level: 0.6, op4Level: 0.2,
    op1Decay: 0.5, op2Decay: 0.15, op3Decay: 0.5, op4Decay: 0.1,
    op1Attack: 0.005, op1Release: 0.15,
  }},
  { name: 'Acid FM', voiceId: 'FM', params: {
    algorithm: 0, op1Fb: 0.4,
    op1Ratio: 1.0, op2Ratio: 1.0, op3Ratio: 2.0, op4Ratio: 4.0,
    op1Level: 1.0, op2Level: 0.9, op3Level: 0.8, op4Level: 0.7,
    op1Decay: 0.18, op2Decay: 0.06, op3Decay: 0.04, op4Decay: 0.03,
    op1Attack: 0.001, op1Release: 0.08,
  }},
  // ── Lead ──
  { name: 'Brass', voiceId: 'FM', params: {
    algorithm: 3, op1Fb: 0.2,
    op1Ratio: 1.0, op2Ratio: 1.0, op3Ratio: 1.0, op4Ratio: 1.0,
    op1Level: 1.0, op2Level: 0.8, op3Level: 0.9, op4Level: 0.7,
    op1Decay: 0.6, op2Decay: 0.3, op3Decay: 0.5, op4Decay: 0.25,
    op1Attack: 0.04, op1Release: 0.2,
  }},
  { name: 'Flute', voiceId: 'FM', params: {
    algorithm: 1, op1Fb: 0.05,
    op1Ratio: 1.0, op2Ratio: 2.0, op3Ratio: 4.0, op4Ratio: 1.0,
    op1Level: 0.9, op2Level: 0.6, op3Level: 0.15, op4Level: 0.15,
    op1Decay: 2.0, op2Decay: 0.4, op3Decay: 0.2, op4Decay: 1.5,
    op1Attack: 0.05, op1Release: 0.3,
  }},
  { name: 'Whistle', voiceId: 'FM', params: {
    algorithm: 1, op1Fb: 0.0,
    op1Ratio: 1.0, op2Ratio: 2.0, op3Ratio: 3.0, op4Ratio: 4.0,
    op1Level: 0.8, op2Level: 0.4, op3Level: 0.1, op4Level: 0.05,
    op1Decay: 1.5, op2Decay: 0.3, op3Decay: 0.15, op4Decay: 0.1,
    op1Attack: 0.03, op1Release: 0.25,
  }},
  { name: 'Sync Lead', voiceId: 'FM', params: {
    algorithm: 0, op1Fb: 0.5,
    op1Ratio: 1.0, op2Ratio: 2.01, op3Ratio: 3.0, op4Ratio: 4.01,
    op1Level: 1.0, op2Level: 0.7, op3Level: 0.6, op4Level: 0.5,
    op1Decay: 0.4, op2Decay: 0.2, op3Decay: 0.15, op4Decay: 0.1,
    op1Attack: 0.003, op1Release: 0.2,
  }},
  // ── Bell ──
  { name: 'Bell', voiceId: 'FM', params: {
    algorithm: 4, op1Fb: 0.0,
    op1Ratio: 1.0, op2Ratio: 1.0, op3Ratio: 3.5, op4Ratio: 7.0,
    op1Level: 1.0, op2Level: 0.8, op3Level: 0.5, op4Level: 0.3,
    op1Decay: 1.5, op2Decay: 1.2, op3Decay: 0.4, op4Decay: 0.2,
    op1Attack: 0.001, op1Release: 0.8, polyMode: 1.0,
  }},
  { name: 'Tubular Bell', voiceId: 'FM', params: {
    algorithm: 0, op1Fb: 0.15,
    op1Ratio: 1.0, op2Ratio: 3.5, op3Ratio: 7.07, op4Ratio: 1.0,
    op1Level: 1.0, op2Level: 0.6, op3Level: 0.35, op4Level: 0.25,
    op1Decay: 2.0, op2Decay: 0.8, op3Decay: 0.3, op4Decay: 1.5,
    op1Attack: 0.001, op1Release: 1.0, polyMode: 1.0,
  }},
  { name: 'Glocken', voiceId: 'FM', params: {
    algorithm: 4, op1Fb: 0.0,
    op1Ratio: 1.0, op2Ratio: 1.0, op3Ratio: 5.0, op4Ratio: 9.0,
    op1Level: 1.0, op2Level: 0.7, op3Level: 0.4, op4Level: 0.2,
    op1Decay: 0.8, op2Decay: 0.6, op3Decay: 0.15, op4Decay: 0.1,
    op1Attack: 0.001, op1Release: 0.5, polyMode: 1.0,
  }},
  { name: 'Celesta', voiceId: 'FM', params: {
    algorithm: 4, op1Fb: 0.0,
    op1Ratio: 1.0, op2Ratio: 1.0, op3Ratio: 4.0, op4Ratio: 8.0,
    op1Level: 1.0, op2Level: 0.75, op3Level: 0.35, op4Level: 0.15,
    op1Decay: 0.5, op2Decay: 0.4, op3Decay: 0.12, op4Decay: 0.08,
    op1Attack: 0.001, op1Release: 0.3, polyMode: 1.0,
  }},
  // ── Pad ──
  { name: 'FM Pad', voiceId: 'FM', params: {
    algorithm: 5, op1Fb: 0.1,
    op1Ratio: 1.0, op2Ratio: 2.0, op3Ratio: 1.0, op4Ratio: 3.0,
    op1Level: 0.8, op2Level: 0.6, op3Level: 0.7, op4Level: 0.3,
    op1Decay: 3.0, op2Decay: 2.0, op3Decay: 2.5, op4Decay: 1.0,
    op1Attack: 0.3, op1Release: 1.0, polyMode: 1.0,
  }},
  { name: 'Glass Pad', voiceId: 'FM', params: {
    algorithm: 7, op1Fb: 0.05,
    op1Ratio: 1.0, op2Ratio: 2.0, op3Ratio: 4.0, op4Ratio: 6.0,
    op1Level: 0.8, op2Level: 0.5, op3Level: 0.3, op4Level: 0.15,
    op1Decay: 3.5, op2Decay: 2.5, op3Decay: 1.5, op4Decay: 1.0,
    op1Attack: 0.4, op1Release: 1.2, polyMode: 1.0,
  }},
  // ── SFX ──
  { name: 'Laser', voiceId: 'FM', params: {
    algorithm: 0, op1Fb: 0.6,
    op1Ratio: 1.0, op2Ratio: 5.0, op3Ratio: 8.0, op4Ratio: 13.0,
    op1Level: 1.0, op2Level: 0.9, op3Level: 0.8, op4Level: 0.7,
    op1Decay: 0.08, op2Decay: 0.04, op3Decay: 0.03, op4Decay: 0.02,
    op1Attack: 0.001, op1Release: 0.05,
  }},
  { name: 'Noise Hit', voiceId: 'FM', params: {
    algorithm: 0, op1Fb: 0.8,
    op1Ratio: 1.41, op2Ratio: 3.14, op3Ratio: 7.07, op4Ratio: 11.0,
    op1Level: 1.0, op2Level: 0.9, op3Level: 0.85, op4Level: 0.8,
    op1Decay: 0.06, op2Decay: 0.04, op3Decay: 0.03, op4Decay: 0.02,
    op1Attack: 0.001, op1Release: 0.04,
  }},
]

// ── Analog presets ──────────────────────────────────────────────────
const ANALOG_PRESETS: SynthPreset[] = [
  { name: 'Warm Sub', voiceId: 'Analog', params: {
    cutoffBase: 400, envMod: 2000, resonance: 2.0, decay: 0.35,
  }},
  { name: 'Biting', voiceId: 'Analog', params: {
    cutoffBase: 600, envMod: 6000, resonance: 5.0, decay: 0.20,
  }},
  { name: 'Smooth', voiceId: 'Analog', params: {
    cutoffBase: 1200, envMod: 3000, resonance: 1.5, decay: 0.40,
  }},
]

// ── All presets, indexed by voiceId ──────────────────────────────────

const ALL_PRESETS: SynthPreset[] = [
  ...IDEATH_PRESETS,
  ...KICK_PRESETS,
  ...SNARE_PRESETS,
  ...CLAP_PRESETS,
  ...HAT_PRESETS,
  ...BASS303_PRESETS,
  ...MOOG_PRESETS,
  ...FM_PRESETS,
  ...ANALOG_PRESETS,
]

const PRESETS_BY_VOICE = new Map<string, SynthPreset[]>()
for (const p of ALL_PRESETS) {
  const list = PRESETS_BY_VOICE.get(p.voiceId) ?? []
  list.push(p)
  PRESETS_BY_VOICE.set(p.voiceId, list)
}

export type PresetCategory = string

/** A user-saved preset (from IndexedDB) */
export interface UserPreset extends SynthPreset {
  id: number           // IndexedDB auto-increment id
  isUser: true
}

/** In-memory cache of user presets, keyed by voiceId */
const USER_PRESETS_BY_VOICE = new Map<string, UserPreset[]>()
let userPresetsLoaded = false

/** Load all user presets from IndexedDB into memory cache */
export async function loadUserPresetsIntoCache(): Promise<void> {
  const { loadAllUserPresets } = await import('./storage.ts')
  const stored = await loadAllUserPresets()
  USER_PRESETS_BY_VOICE.clear()
  for (const s of stored) {
    const preset: UserPreset = {
      name: s.name,
      voiceId: s.voiceId as VoiceId,
      params: s.params,
      category: 'user',
      id: s.id!,
      isUser: true,
    }
    const list = USER_PRESETS_BY_VOICE.get(s.voiceId) ?? []
    list.push(preset)
    USER_PRESETS_BY_VOICE.set(s.voiceId, list)
  }
  userPresetsLoaded = true
}

/** Add a user preset to the cache (call after saving to IDB) */
export function addUserPresetToCache(voiceId: string, name: string, params: Record<string, number>, id: number): void {
  const preset: UserPreset = { name, voiceId: voiceId as VoiceId, params, category: 'user', id, isUser: true }
  const list = USER_PRESETS_BY_VOICE.get(voiceId) ?? []
  list.push(preset)
  USER_PRESETS_BY_VOICE.set(voiceId, list)
}

/** Remove a user preset from the cache */
export function removeUserPresetFromCache(voiceId: string, id: number): void {
  const list = USER_PRESETS_BY_VOICE.get(voiceId)
  if (!list) return
  const idx = list.findIndex(p => p.id === id)
  if (idx >= 0) list.splice(idx, 1)
}

/** Rename a user preset in the cache */
export function renameUserPresetInCache(voiceId: string, id: number, name: string): void {
  const list = USER_PRESETS_BY_VOICE.get(voiceId)
  if (!list) return
  const preset = list.find(p => p.id === id)
  if (preset) preset.name = name.slice(0, 16)
}

/** Check if a voice has any presets (factory or user) */
export function hasPresets(voiceId: VoiceId | null): boolean {
  if (!voiceId) return false
  return PRESETS_BY_VOICE.has(voiceId) || (USER_PRESETS_BY_VOICE.get(voiceId)?.length ?? 0) > 0
}

/** Get presets for a voice, optionally filtered by category. Includes user presets. */
export function getPresets(voiceId: VoiceId | null, category?: string | null): SynthPreset[] {
  if (!voiceId) return []
  const factory = PRESETS_BY_VOICE.get(voiceId) ?? []
  const user = USER_PRESETS_BY_VOICE.get(voiceId) ?? []
  const all = [...factory, ...user]
  if (!category) return all
  return all.filter(p => p.category === category)
}

/** Get unique categories for a voice's presets (empty if no categories) */
export function getPresetCategories(voiceId: VoiceId | null): string[] {
  if (!voiceId) return []
  const factory = PRESETS_BY_VOICE.get(voiceId) ?? []
  const user = USER_PRESETS_BY_VOICE.get(voiceId) ?? []
  const cats = new Set<string>()
  for (const p of factory) if (p.category) cats.add(p.category)
  if (user.length > 0) cats.add('user')
  return [...cats]
}

/** Check if user presets have been loaded */
export function isUserPresetsLoaded(): boolean {
  return userPresetsLoaded
}

/** Category display labels */
export const CATEGORY_LABELS: Record<string, string> = {
  lead: 'LEAD', bass: 'BASS', pad: 'PAD', pluck: 'PLCK', keys: 'KEYS', fx: 'FX', user: 'USER',
}
