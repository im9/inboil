import type { SynthType } from './state.svelte.ts'

export interface ParamDef {
  key: string
  label: string   // ≤5 uppercase chars — matches hardware label aesthetic
  group?: string  // logical group for visual separator (e.g. 'filter', 'amp', 'arp')
  tip?: string    // English tooltip
  tipJa?: string  // Japanese tooltip
  min: number
  max: number
  step?: number   // discrete step size (e.g. 1 for integer params) — snaps knob
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
    { key: 'pitchStart', label: 'PSTRT', group: 'pitch', tip: 'Pitch start frequency',       tipJa: 'ピッチ開始周波数',       min: 100,   max: 600,  default: 340   },
    { key: 'pitchEnd',   label: 'PEND',  group: 'pitch', tip: 'Pitch end frequency',         tipJa: 'ピッチ終了周波数',       min: 30,    max: 120,  default: 55    },
    { key: 'pitchDecay', label: 'PDCY',  group: 'pitch', tip: 'Pitch sweep speed',           tipJa: 'ピッチスイープ速度',     min: 0.01,  max: 0.10, default: 0.035 },
    { key: 'ampDecay',   label: 'DCY',   group: 'amp',   tip: 'Amplitude decay time',        tipJa: '音量ディケイ',           min: 0.1,   max: 1.0,  default: 0.35  },
    { key: 'drive',      label: 'DRIV',  group: 'amp',   tip: 'Distortion amount',           tipJa: 'ディストーション量',     min: 0.5,   max: 2.5,  default: 1.4   },
  ],
  Snare: [
    { key: 'toneDecay',  label: 'TDCY',  group: 'tone',  tip: 'Tone body decay',             tipJa: 'トーンディケイ',         min: 0.03,  max: 0.3,  default: 0.08  },
    { key: 'toneAmt',    label: 'TONE',  group: 'tone',  tip: 'Tone body level',             tipJa: 'トーンレベル',           min: 0.0,   max: 0.6,  default: 0.20  },
    { key: 'noiseDecay', label: 'NDCY',  group: 'noise', tip: 'Noise decay time',            tipJa: 'ノイズディケイ',         min: 0.02,  max: 0.25, default: 0.07  },
    { key: 'noiseAmt',   label: 'NOIS',  group: 'noise', tip: 'Noise level',                 tipJa: 'ノイズレベル',           min: 0.3,   max: 1.2,  default: 0.85  },
    { key: 'noiseFc',    label: 'SNAP',  group: 'noise', tip: 'Noise filter (snappiness)',    tipJa: 'ノイズフィルター (スナップ感)', min: 1000,  max: 6000, default: 3000  },
  ],
  Clap: [
    { key: 'decay',      label: 'DCY',   tip: 'Decay time',           tipJa: 'ディケイ',     min: 0.05,  max: 0.5,  default: 0.18  },
    { key: 'filterFc',   label: 'TONE',  tip: 'Tone brightness',      tipJa: '明るさ',       min: 600,   max: 3000, default: 1200  },
    { key: 'burstGap',   label: 'SPRD',  tip: 'Burst spread',         tipJa: 'バースト間隔', min: 0.008, max: 0.025,default: 0.015 },
  ],
  Hat: [
    { key: 'decay',      label: 'DCY',   tip: 'Decay time',           tipJa: 'ディケイ',     min: 0.01,  max: 0.15, default: 0.04  },
    { key: 'baseFreq',   label: 'FREQ',  tip: 'Base frequency',       tipJa: 'ベース周波数', min: 400,   max: 1200, default: 800   },
    { key: 'hpCutoff',   label: 'HP',    tip: 'Highpass cutoff',      tipJa: 'ハイパスカットオフ', min: 3000,  max: 9000, default: 5000  },
    { key: 'volume',     label: 'VOL',   tip: 'Volume',               tipJa: '音量',         min: 0.1,   max: 1.0,  default: 0.65  },
  ],
  OpenHat: [
    { key: 'decay',      label: 'DCY',   tip: 'Decay time',           tipJa: 'ディケイ',     min: 0.05,  max: 0.5,  default: 0.18  },
    { key: 'baseFreq',   label: 'FREQ',  tip: 'Base frequency',       tipJa: 'ベース周波数', min: 400,   max: 1200, default: 800   },
    { key: 'hpCutoff',   label: 'HP',    tip: 'Highpass cutoff',      tipJa: 'ハイパスカットオフ', min: 3000,  max: 9000, default: 4500  },
    { key: 'volume',     label: 'VOL',   tip: 'Volume',               tipJa: '音量',         min: 0.1,   max: 1.0,  default: 0.60  },
  ],
  Cymbal: [
    { key: 'decay',      label: 'DCY',   tip: 'Decay time',           tipJa: 'ディケイ',     min: 0.15,  max: 1.5,  default: 0.35  },
    { key: 'baseFreq',   label: 'FREQ',  tip: 'Base frequency',       tipJa: 'ベース周波数', min: 250,   max: 800,  default: 500   },
    { key: 'hpCutoff',   label: 'HP',    tip: 'Highpass cutoff',      tipJa: 'ハイパスカットオフ', min: 1500,  max: 5000, default: 2500  },
    { key: 'volume',     label: 'VOL',   tip: 'Volume',               tipJa: '音量',         min: 0.1,   max: 1.0,  default: 0.55  },
  ],
  Bass303: [
    { key: 'cutoffBase', label: 'CUT',   group: 'filter', tip: 'Filter cutoff',              tipJa: 'フィルターカットオフ',   min: 50,    max: 500,  default: 200   },
    { key: 'envMod',     label: 'MOD',   group: 'filter', tip: 'Filter envelope depth',      tipJa: 'フィルターエンベロープ深さ', min: 500,   max: 8000, default: 4000  },
    { key: 'resonance',  label: 'RESO',  group: 'filter', tip: 'Filter resonance',           tipJa: 'レゾナンス',             min: 1.0,   max: 14.0, default: 7.0   },
    { key: 'decay',      label: 'DCY',   group: 'amp',    tip: 'Amplitude decay',            tipJa: '音量ディケイ',           min: 0.08,  max: 0.5,  default: 0.18  },
    { key: 'drive',      label: 'DRIV',  group: 'amp',    tip: 'Distortion amount',          tipJa: 'ディストーション量',     min: 0.5,   max: 3.0,  default: 1.6   },
  ],
  MoogLead: [
    { key: 'cutoffBase',  label: 'CUT',   group: 'filter', tip: 'Filter cutoff',             tipJa: 'フィルターカットオフ',   min: 100,   max: 2000, default: 400   },
    { key: 'envMod',      label: 'MOD',   group: 'filter', tip: 'Filter envelope depth',     tipJa: 'フィルターエンベロープ深さ', min: 1000,  max: 10000,default: 5500  },
    { key: 'resonance',   label: 'RESO',  group: 'filter', tip: 'Filter resonance',          tipJa: 'レゾナンス',             min: 0.5,   max: 3.5,  default: 1.8   },
    { key: 'filterDecay', label: 'FDCY',  group: 'filter', tip: 'Filter envelope decay',     tipJa: 'フィルターディケイ',     min: 0.1,   max: 1.0,  default: 0.35  },
    { key: 'ampAttack',   label: 'ATCK',  group: 'env',    tip: 'Amp attack time',           tipJa: 'アタック時間',           min: 0.001, max: 0.5,  default: 0.005 },
    { key: 'ampDecay',    label: 'ADCY',  group: 'env',    tip: 'Amp decay time',            tipJa: 'ディケイ時間',           min: 0.01,  max: 1.0,  default: 0.3   },
    { key: 'ampSustain',  label: 'SUST',  group: 'env',    tip: 'Amp sustain level',         tipJa: 'サスティンレベル',       min: 0.0,   max: 1.0,  default: 0.8   },
    { key: 'ampRelease',  label: 'RLS',   group: 'env',    tip: 'Amp release time',          tipJa: 'リリース時間',           min: 0.01,  max: 2.0,  default: 0.25  },
    { key: 'arpMode',    label: 'ARP',   group: 'arp',    tip: 'Arpeggio: OFF → UP → DOWN → U/D → RND', tipJa: 'アルペジオ: OFF → UP → DOWN → U/D → RND', min: 0,     max: 4,    step: 1, default: 0     },
    { key: 'arpRate',    label: 'RATE',  group: 'arp',    tip: 'Arp subdivisions per step (1–4)',  tipJa: 'アルペジオ分割数 (1–4)',   min: 1,     max: 4,    step: 1, default: 2     },
    { key: 'arpChord',   label: 'CHRD',  group: 'arp',    tip: 'Chord: OCT → 5TH → TRD → SUS → 7TH', tipJa: 'コード: OCT → 5TH → TRD → SUS → 7TH', min: 0,     max: 4,    step: 1, default: 0     },
    { key: 'arpOct',     label: 'AOCT',  group: 'arp',    tip: 'Arp octave range (1=off, 2–4)',    tipJa: 'アルペジオ範囲 (1=オフ, 2–4)',   min: 1,     max: 4,    step: 1, default: 1     },
  ],
  FM: [
    { key: 'op2Ratio',     label: 'RATIO', group: 'osc',  tip: 'Modulator frequency ratio',  tipJa: 'モジュレーター周波数比', min: 0.5, max: 4.0, default: 2.1  },
    { key: 'fbAmt',        label: 'FDBK',  group: 'osc',  tip: 'Operator feedback',           tipJa: 'フィードバック量',       min: 0.0, max: 1.0, default: 0.55 },
    { key: 'op2Index',     label: 'IDX2',  group: 'osc',  tip: 'Modulator mod index',         tipJa: 'モジュレーターインデックス', min: 1.0, max: 8.0, default: 4.5  },
    { key: 'carrierIndex', label: 'CIDX',  group: 'osc',  tip: 'Carrier mod index',           tipJa: 'キャリアインデックス',   min: 1.0, max: 8.0, default: 3.5  },
    { key: 'decay',        label: 'DCY',   group: 'amp',  tip: 'Amplitude decay',             tipJa: '音量ディケイ',           min: 0.1, max: 0.8, default: 0.30 },
  ],
  Analog: [
    { key: 'cutoffBase', label: 'CUT',   group: 'filter', tip: 'Filter cutoff',              tipJa: 'フィルターカットオフ',   min: 200,   max: 4000, default: 800  },
    { key: 'envMod',     label: 'MOD',   group: 'filter', tip: 'Filter envelope depth',      tipJa: 'フィルターエンベロープ深さ', min: 500,   max: 8000, default: 4500 },
    { key: 'resonance',  label: 'RESO',  group: 'filter', tip: 'Filter resonance',           tipJa: 'レゾナンス',             min: 0.5,   max: 6.0,  default: 3.5  },
    { key: 'decay',      label: 'DCY',   group: 'amp',    tip: 'Amplitude decay',            tipJa: '音量ディケイ',           min: 0.1,   max: 0.5,  default: 0.25 },
  ],
}

export function getParamDefs(trackIdx: number, synthType: SynthType): ParamDef[] {
  return VOICE_PARAMS[voiceKey(trackIdx, synthType)] ?? []
}

export function defaultVoiceParams(trackIdx: number, synthType: SynthType): Record<string, number> {
  const defs = getParamDefs(trackIdx, synthType)
  return Object.fromEntries(defs.map(d => [d.key, d.default]))
}

// ── Discrete-param display labels ─────────────────────────────────────────
const DISPLAY_LABELS: Record<string, string[]> = {
  arpMode:  ['OFF', 'UP', 'DWN', 'U/D', 'RND'],
  arpChord: ['OCT', '5TH', 'TRD', 'SUS', '7TH'],
}

/** Human-readable display string for a param's actual value (discrete params only) */
export function displayLabel(def: ParamDef, actual: number): string | undefined {
  const labels = DISPLAY_LABELS[def.key]
  if (!labels) return def.step ? String(Math.round(actual)) : undefined
  const idx = Math.round(actual) - def.min
  return labels[idx] ?? String(Math.round(actual))
}

/** Number of discrete positions (for Knob steps prop), 0 if continuous */
export function paramSteps(def: ParamDef): number {
  if (!def.step) return 0
  return Math.round((def.max - def.min) / def.step) + 1
}

/** Map actual value → 0–1 for Knob component */
export function normalizeParam(def: ParamDef, actual: number): number {
  return Math.min(1, Math.max(0, (actual - def.min) / (def.max - def.min)))
}

/** Map 0–1 from Knob → actual value in physical units */
export function denormalizeParam(def: ParamDef, normalized: number): number {
  const raw = def.min + normalized * (def.max - def.min)
  return def.step ? Math.round(raw / def.step) * def.step : raw
}
