import type { SynthType } from './state.svelte.ts'

export interface ParamDef {
  key: string
  label: string   // ≤5 uppercase chars — matches hardware label aesthetic
  min: number
  max: number
  default: number // physical units: Hz, seconds, dimensionless
}

// ── Voice type key from track index + synth type ───────────────────────────
// Must mirror makeVoice() in worklet-processor.ts
export function voiceKey(trackIdx: number, synthType: SynthType): string {
  if (trackIdx === 0) return 'Kick'
  if (trackIdx === 1) return 'Snare'
  if (trackIdx === 2) return 'Clap'
  if (trackIdx === 3) return 'Hat'
  if (trackIdx === 4) return 'OpenHat'
  if (trackIdx === 5) return 'Cymbal'
  if (trackIdx === 6) return 'Bass303'
  if (trackIdx === 7) return 'MoogLead'
  if (synthType === 'NoiseSynth') return 'Hat'
  if (synthType === 'FMSynth')    return 'FM'
  return 'Analog'
}

// ── Param definitions per voice type ──────────────────────────────────────
const VOICE_PARAMS: Record<string, ParamDef[]> = {
  Kick: [
    { key: 'pitchStart', label: 'PSTRT', min: 100,   max: 600,  default: 340   },
    { key: 'pitchEnd',   label: 'PEND',  min: 30,    max: 120,  default: 55    },
    { key: 'pitchDecay', label: 'PDCY',  min: 0.01,  max: 0.10, default: 0.035 },
    { key: 'ampDecay',   label: 'DCY',   min: 0.1,   max: 1.0,  default: 0.35  },
    { key: 'drive',      label: 'DRIV',  min: 0.5,   max: 2.5,  default: 1.4   },
  ],
  Snare: [
    { key: 'toneDecay',  label: 'TDCY',  min: 0.03,  max: 0.3,  default: 0.08  },
    { key: 'noiseDecay', label: 'NDCY',  min: 0.02,  max: 0.25, default: 0.07  },
    { key: 'toneAmt',    label: 'TONE',  min: 0.0,   max: 0.6,  default: 0.20  },
    { key: 'noiseAmt',   label: 'NOIS',  min: 0.3,   max: 1.2,  default: 0.85  },
    { key: 'noiseFc',    label: 'SNAP',  min: 1000,  max: 6000, default: 3000  },
  ],
  Clap: [
    { key: 'decay',      label: 'DCY',   min: 0.05,  max: 0.5,  default: 0.18  },
    { key: 'filterFc',   label: 'TONE',  min: 600,   max: 3000, default: 1200  },
    { key: 'burstGap',   label: 'SPRD',  min: 0.008, max: 0.025,default: 0.015 },
  ],
  Hat: [
    { key: 'decay',      label: 'DCY',   min: 0.01,  max: 0.15, default: 0.04  },
    { key: 'baseFreq',   label: 'FREQ',  min: 400,   max: 1200, default: 800   },
    { key: 'hpCutoff',   label: 'HP',    min: 3000,  max: 9000, default: 5000  },
    { key: 'volume',     label: 'VOL',   min: 0.1,   max: 1.0,  default: 0.65  },
  ],
  OpenHat: [
    { key: 'decay',      label: 'DCY',   min: 0.05,  max: 0.5,  default: 0.18  },
    { key: 'baseFreq',   label: 'FREQ',  min: 400,   max: 1200, default: 800   },
    { key: 'hpCutoff',   label: 'HP',    min: 3000,  max: 9000, default: 4500  },
    { key: 'volume',     label: 'VOL',   min: 0.1,   max: 1.0,  default: 0.60  },
  ],
  Cymbal: [
    { key: 'decay',      label: 'DCY',   min: 0.15,  max: 1.5,  default: 0.35  },
    { key: 'baseFreq',   label: 'FREQ',  min: 250,   max: 800,  default: 500   },
    { key: 'hpCutoff',   label: 'HP',    min: 1500,  max: 5000, default: 2500  },
    { key: 'volume',     label: 'VOL',   min: 0.1,   max: 1.0,  default: 0.55  },
  ],
  Bass303: [
    { key: 'cutoffBase', label: 'CUT',   min: 50,    max: 500,  default: 200   },
    { key: 'envMod',     label: 'MOD',   min: 500,   max: 8000, default: 4000  },
    { key: 'resonance',  label: 'RESO',  min: 1.0,   max: 14.0, default: 7.0   },
    { key: 'decay',      label: 'DCY',   min: 0.08,  max: 0.5,  default: 0.18  },
    { key: 'drive',      label: 'DRIV',  min: 0.5,   max: 3.0,  default: 1.6   },
  ],
  MoogLead: [
    { key: 'cutoffBase',  label: 'CUT',   min: 100,   max: 2000, default: 400   },
    { key: 'envMod',      label: 'MOD',   min: 1000,  max: 10000,default: 5500  },
    { key: 'resonance',   label: 'RESO',  min: 0.5,   max: 3.5,  default: 1.8   },
    { key: 'filterDecay', label: 'FDCY',  min: 0.1,   max: 1.0,  default: 0.35  },
    { key: 'ampAttack',   label: 'ATCK',  min: 0.001, max: 0.5,  default: 0.005 },
    { key: 'ampDecay',    label: 'ADCY',  min: 0.01,  max: 1.0,  default: 0.3   },
    { key: 'ampSustain',  label: 'SUST',  min: 0.0,   max: 1.0,  default: 0.8   },
    { key: 'ampRelease',  label: 'RLS',   min: 0.01,  max: 2.0,  default: 0.25  },
  ],
  FM: [
    { key: 'op2Ratio',     label: 'RATIO', min: 0.5, max: 4.0, default: 2.1  },
    { key: 'fbAmt',        label: 'FDBK',  min: 0.0, max: 1.0, default: 0.55 },
    { key: 'op2Index',     label: 'IDX2',  min: 1.0, max: 8.0, default: 4.5  },
    { key: 'carrierIndex', label: 'CIDX',  min: 1.0, max: 8.0, default: 3.5  },
    { key: 'decay',        label: 'DCY',   min: 0.1, max: 0.8, default: 0.30 },
  ],
  Analog: [
    { key: 'cutoffBase', label: 'CUT',   min: 200,   max: 4000, default: 800  },
    { key: 'envMod',     label: 'MOD',   min: 500,   max: 8000, default: 4500 },
    { key: 'resonance',  label: 'RESO',  min: 0.5,   max: 6.0,  default: 3.5  },
    { key: 'decay',      label: 'DCY',   min: 0.1,   max: 0.5,  default: 0.25 },
  ],
}

export function getParamDefs(trackIdx: number, synthType: SynthType): ParamDef[] {
  return VOICE_PARAMS[voiceKey(trackIdx, synthType)] ?? []
}

export function defaultVoiceParams(trackIdx: number, synthType: SynthType): Record<string, number> {
  const defs = getParamDefs(trackIdx, synthType)
  return Object.fromEntries(defs.map(d => [d.key, d.default]))
}

/** Map actual value → 0–1 for Knob component */
export function normalizeParam(def: ParamDef, actual: number): number {
  return Math.min(1, Math.max(0, (actual - def.min) / (def.max - def.min)))
}

/** Map 0–1 from Knob → actual value in physical units */
export function denormalizeParam(def: ParamDef, normalized: number): number {
  return def.min + normalized * (def.max - def.min)
}
