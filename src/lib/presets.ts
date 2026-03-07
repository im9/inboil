// Factory presets for iDEATH / iPOLY voices
import type { VoiceId } from './state.svelte.ts'

export interface SynthPreset {
  name: string
  category: 'lead' | 'bass' | 'pad' | 'pluck' | 'keys' | 'fx'
  params: Record<string, number>
}

// Param reference (defaults):
//   oscAPos=0.0  oscBPos=0.25  oscBSemi=0  oscMix=0.5  combine=0(MIX) fmIndex=3.0
//   cutoffBase=1200  envMod=4000  resonance=2.0  filterMode=0(LP)
//   attack=0.005  decay=0.3  sustain=0.5  release=0.3  modDecay=0.25
//   lfo1Rate=2.0  lfo1Shape=0(SIN)  lfo1Sync=0  lfo1Div=2(1/4)
//   lfo2Rate=0.5  lfo2Shape=0(SIN)  drive=0.0
//   Mod matrix: mod{0-7}{Src,Dst,Amt}  Src: 0=LFO1 1=LFO2 2=Env2 3=Vel 4=Note
//   Dst: 0=Pitch 1=WTPos 2=Cutoff 3=Reso 4=FMIndex 5=Volume

export const SYNTH_PRESETS: SynthPreset[] = [
  // ── Lead ───────────────────────────────────────────
  { name: 'Saw Lead', category: 'lead', params: {
    oscAPos: 0.5, oscBPos: 0.5, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 2000, envMod: 3000, resonance: 1.5, filterMode: 0,
    attack: 0.005, decay: 0.4, sustain: 0.7, release: 0.25, modDecay: 0.2,
    lfo1Rate: 5.0, lfo1Shape: 0, lfo2Rate: 0.3, lfo2Shape: 0,
  }},
  { name: 'Square Lead', category: 'lead', params: {
    oscAPos: 0.75, oscBPos: 0.75, oscBSemi: 12, oscMix: 0.3, combine: 0,
    cutoffBase: 1800, envMod: 2500, resonance: 1.8, filterMode: 0,
    attack: 0.005, decay: 0.35, sustain: 0.65, release: 0.3, modDecay: 0.18,
    lfo1Rate: 6.0, lfo1Shape: 0, lfo2Rate: 0.2, lfo2Shape: 1,
  }},
  { name: 'Detune Lead', category: 'lead', params: {
    oscAPos: 0.5, oscBPos: 0.55, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 3000, envMod: 2000, resonance: 1.2, filterMode: 0,
    attack: 0.01, decay: 0.5, sustain: 0.6, release: 0.35, modDecay: 0.3,
    lfo1Rate: 4.0, lfo1Shape: 0, lfo2Rate: 0.15, lfo2Shape: 2,
  }},
  { name: 'Acid Lead', category: 'lead', params: {
    oscAPos: 0.5, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 200, envMod: 7000, resonance: 8.0, filterMode: 0,
    attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1, modDecay: 0.12,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},

  // ── Bass ───────────────────────────────────────────
  { name: 'Sub Bass', category: 'bass', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 120, envMod: 800, resonance: 1.0, filterMode: 0,
    attack: 0.005, decay: 0.4, sustain: 0.8, release: 0.1, modDecay: 0.15,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Reese Bass', category: 'bass', params: {
    oscAPos: 0.5, oscBPos: 0.52, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 300, envMod: 2000, resonance: 3.0, filterMode: 0,
    attack: 0.005, decay: 0.5, sustain: 0.7, release: 0.15, modDecay: 0.25,
    lfo1Rate: 0.3, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Acid Bass', category: 'bass', params: {
    oscAPos: 0.5, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 100, envMod: 6000, resonance: 10.0, filterMode: 0,
    attack: 0.001, decay: 0.18, sustain: 0.0, release: 0.08, modDecay: 0.1,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'FM Bass', category: 'bass', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.5, combine: 1, fmIndex: 5.0,
    cutoffBase: 400, envMod: 3000, resonance: 1.5, filterMode: 0,
    attack: 0.001, decay: 0.25, sustain: 0.3, release: 0.1, modDecay: 0.15,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Wobble Bass', category: 'bass', params: {
    oscAPos: 0.5, oscBPos: 0.5, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 300, envMod: 2000, resonance: 3.0, filterMode: 0, drive: 0.4,
    attack: 0.005, decay: 0.5, sustain: 0.8, release: 0.15, modDecay: 0.3,
    lfo1Rate: 2.0, lfo1Shape: 0, lfo1Sync: 1, lfo1Div: 2,
    lfo2Rate: 0.1, lfo2Shape: 0,
    mod0Src: 0, mod0Dst: 2, mod0Amt: 0.7,  // LFO1 → Cutoff
  }},
  { name: 'Filthy Bass', category: 'bass', params: {
    oscAPos: 0.5, oscBPos: 0.52, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 250, envMod: 3000, resonance: 4.0, filterMode: 0, drive: 0.8,
    attack: 0.005, decay: 0.6, sustain: 0.7, release: 0.15, modDecay: 0.3,
    lfo1Rate: 3.0, lfo1Shape: 0, lfo1Sync: 0, lfo1Div: 2,
    lfo2Rate: 0.2, lfo2Shape: 0,
    mod0Src: 0, mod0Dst: 2, mod0Amt: 0.5,  // LFO1 → Cutoff
  }},
  { name: 'Sub Wobble', category: 'bass', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.0, combine: 0,
    cutoffBase: 150, envMod: 600, resonance: 1.5, filterMode: 0, drive: 0.0,
    attack: 0.005, decay: 0.5, sustain: 0.9, release: 0.15, modDecay: 0.2,
    lfo1Rate: 1.0, lfo1Shape: 0, lfo1Sync: 1, lfo1Div: 0,
    lfo2Rate: 0.1, lfo2Shape: 0,
    mod0Src: 0, mod0Dst: 2, mod0Amt: 0.4,  // LFO1 → Cutoff (slow)
  }},
  { name: 'Growl Bass', category: 'bass', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.5, combine: 1, fmIndex: 4.0,
    cutoffBase: 400, envMod: 3000, resonance: 2.5, filterMode: 0, drive: 0.6,
    attack: 0.005, decay: 0.4, sustain: 0.6, release: 0.12, modDecay: 0.2,
    lfo1Rate: 2.0, lfo1Shape: 0, lfo1Sync: 1, lfo1Div: 3,
    lfo2Rate: 0.1, lfo2Shape: 0,
    mod0Src: 0, mod0Dst: 4, mod0Amt: 0.6,  // LFO1 → FMIndex
  }},

  // ── Pad ────────────────────────────────────────────
  { name: 'Warm Pad', category: 'pad', params: {
    oscAPos: 0.3, oscBPos: 0.4, oscBSemi: 7, oscMix: 0.5, combine: 0,
    cutoffBase: 800, envMod: 1500, resonance: 1.0, filterMode: 0,
    attack: 0.3, decay: 1.0, sustain: 0.8, release: 1.0, modDecay: 0.8,
    lfo1Rate: 0.8, lfo1Shape: 0, lfo2Rate: 0.15, lfo2Shape: 1,
  }},
  { name: 'Strings', category: 'pad', params: {
    oscAPos: 0.5, oscBPos: 0.55, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 1500, envMod: 1000, resonance: 0.8, filterMode: 0,
    attack: 0.25, decay: 0.8, sustain: 0.85, release: 0.8, modDecay: 0.5,
    lfo1Rate: 5.5, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Dark Pad', category: 'pad', params: {
    oscAPos: 0.5, oscBPos: 0.7, oscBSemi: -12, oscMix: 0.4, combine: 0,
    cutoffBase: 400, envMod: 800, resonance: 2.0, filterMode: 0,
    attack: 0.5, decay: 1.5, sustain: 0.7, release: 1.5, modDecay: 1.0,
    lfo1Rate: 0.3, lfo1Shape: 1, lfo2Rate: 0.08, lfo2Shape: 0,
  }},
  { name: 'Shimmer', category: 'pad', params: {
    oscAPos: 0.2, oscBPos: 0.8, oscBSemi: 12, oscMix: 0.4, combine: 0,
    cutoffBase: 2500, envMod: 2000, resonance: 1.5, filterMode: 0,
    attack: 0.4, decay: 1.0, sustain: 0.6, release: 1.2, modDecay: 0.6,
    lfo1Rate: 3.0, lfo1Shape: 0, lfo2Rate: 0.2, lfo2Shape: 2,
  }},

  // ── Pluck ──────────────────────────────────────────
  { name: 'Pluck', category: 'pluck', params: {
    oscAPos: 0.5, oscBPos: 0.3, oscBSemi: 0, oscMix: 0.3, combine: 0,
    cutoffBase: 3000, envMod: 5000, resonance: 1.5, filterMode: 0,
    attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.15, modDecay: 0.08,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Bell', category: 'pluck', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 7, oscMix: 0.5, combine: 1, fmIndex: 4.0,
    cutoffBase: 4000, envMod: 2000, resonance: 0.8, filterMode: 0,
    attack: 0.001, decay: 0.8, sustain: 0.0, release: 0.5, modDecay: 0.4,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Marimba', category: 'pluck', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.5, combine: 1, fmIndex: 2.5,
    cutoffBase: 2000, envMod: 3000, resonance: 1.0, filterMode: 0,
    attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.2, modDecay: 0.1,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},

  // ── Keys ───────────────────────────────────────────
  { name: 'EP Piano', category: 'keys', params: {
    oscAPos: 0.0, oscBPos: 0.0, oscBSemi: 0, oscMix: 0.5, combine: 1, fmIndex: 3.5,
    cutoffBase: 3000, envMod: 1500, resonance: 0.8, filterMode: 0,
    attack: 0.001, decay: 0.6, sustain: 0.3, release: 0.4, modDecay: 0.3,
    lfo1Rate: 4.0, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Organ', category: 'keys', params: {
    oscAPos: 0.75, oscBPos: 0.75, oscBSemi: 12, oscMix: 0.4, combine: 0,
    cutoffBase: 2500, envMod: 500, resonance: 0.8, filterMode: 0,
    attack: 0.005, decay: 0.5, sustain: 0.9, release: 0.1, modDecay: 0.2,
    lfo1Rate: 6.0, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Clav', category: 'keys', params: {
    oscAPos: 0.75, oscBPos: 0.5, oscBSemi: 0, oscMix: 0.3, combine: 0,
    cutoffBase: 1500, envMod: 4000, resonance: 3.0, filterMode: 0,
    attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1, modDecay: 0.08,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},

  // ── FX ─────────────────────────────────────────────
  { name: 'Sweep', category: 'fx', params: {
    oscAPos: 0.5, oscBPos: 0.9, oscBSemi: 7, oscMix: 0.5, combine: 2,
    cutoffBase: 200, envMod: 6000, resonance: 6.0, filterMode: 0,
    attack: 0.1, decay: 1.5, sustain: 0.0, release: 0.5, modDecay: 1.2,
    lfo1Rate: 0.5, lfo1Shape: 2, lfo2Rate: 3.0, lfo2Shape: 4,
  }},
  { name: 'Noise Hit', category: 'fx', params: {
    oscAPos: 1.0, oscBPos: 1.0, oscBSemi: 5, oscMix: 0.5, combine: 2,
    cutoffBase: 5000, envMod: 3000, resonance: 4.0, filterMode: 1,
    attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.1, modDecay: 0.06,
    lfo1Rate: 0.1, lfo1Shape: 0, lfo2Rate: 0.1, lfo2Shape: 0,
  }},
  { name: 'Riser', category: 'fx', params: {
    oscAPos: 0.5, oscBPos: 0.5, oscBSemi: 0, oscMix: 0.5, combine: 0,
    cutoffBase: 100, envMod: 7000, resonance: 5.0, filterMode: 0,
    attack: 1.0, decay: 0.5, sustain: 0.9, release: 0.3, modDecay: 2.0,
    lfo1Rate: 8.0, lfo1Shape: 2, lfo2Rate: 0.5, lfo2Shape: 0,
  }},
]

const PRESET_CATEGORIES = ['lead', 'bass', 'pad', 'pluck', 'keys', 'fx'] as const
export type PresetCategory = typeof PRESET_CATEGORIES[number]

export const CATEGORY_LABELS: Record<PresetCategory, string> = {
  lead: 'LEAD', bass: 'BASS', pad: 'PAD', pluck: 'PLCK', keys: 'KEYS', fx: 'FX',
}

/** Check if a voice supports presets */
export function hasPresets(voiceId: VoiceId): boolean {
  return voiceId === 'iDEATH'
}

/** Get presets filtered by category (or all if null) */
export function getPresets(category?: PresetCategory | null): SynthPreset[] {
  if (!category) return SYNTH_PRESETS
  return SYNTH_PRESETS.filter(p => p.category === category)
}

/** Get unique categories in preset order */
export function getPresetCategories(): PresetCategory[] {
  return [...PRESET_CATEGORIES]
}
