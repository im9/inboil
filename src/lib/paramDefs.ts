import type { VoiceId } from './state.svelte.ts'
import { DRUM_PRESETS } from './audio/dsp/voices.ts'

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

// ── Param definitions per voice type ──────────────────────────────────────
const VOICE_PARAMS: Record<string, ParamDef[]> = {
  // Unified DrumMachine params (ADR 010) — shared by all drum presets
  DrumMachine: [
    { key: 'toneLevel',       label: 'TONE',  group: 'tone',  tip: 'Tone oscillator level',          tipJa: 'トーンオシレータレベル',       min: 0,     max: 1.0,   default: 1.0   },
    { key: 'pitchStart',      label: 'PSTRT', group: 'tone',  tip: 'Pitch start frequency',          tipJa: 'ピッチ開始周波数',             min: 30,    max: 800,   default: 340   },
    { key: 'pitchEnd',        label: 'PEND',  group: 'tone',  tip: 'Pitch end frequency',            tipJa: 'ピッチ終了周波数',             min: 30,    max: 800,   default: 55    },
    { key: 'pitchDecay',      label: 'PDCY',  group: 'tone',  tip: 'Pitch sweep speed',              tipJa: 'ピッチスイープ速度',           min: 0.003, max: 0.2,   default: 0.035 },
    { key: 'noiseLevel',      label: 'NOIS',  group: 'noise', tip: 'Noise level',                    tipJa: 'ノイズレベル',                 min: 0,     max: 1.2,   default: 0     },
    { key: 'noiseFilterFreq', label: 'FREQ',  group: 'noise', tip: 'Noise filter frequency',         tipJa: 'ノイズフィルター周波数',       min: 500,   max: 12000, default: 3000  },
    { key: 'noiseFilterQ',    label: 'Q',     group: 'noise', tip: 'Noise filter resonance',         tipJa: 'ノイズフィルターQ',             min: 0.5,   max: 5.0,   default: 1.0   },
    { key: 'noiseFilterMode', label: 'FTYP',  group: 'noise', tip: 'Filter: LP → HP → BP',          tipJa: 'フィルター: LP → HP → BP',     min: 0,     max: 2,     step: 1, default: 0 },
    { key: 'metalLevel',      label: 'METL',  group: 'metal', tip: 'Metallic oscillator level',      tipJa: 'メタリックオシレータレベル',   min: 0,     max: 1.0,   default: 0     },
    { key: 'metalFreq',       label: 'MFRQ',  group: 'metal', tip: 'Metal base frequency',           tipJa: 'メタルベース周波数',           min: 200,   max: 1200,  default: 800   },
    { key: 'decay',           label: 'DCY',   group: 'amp',   tip: 'Amplitude decay time',           tipJa: '音量ディケイ',                 min: 0.01,  max: 2.0,   default: 0.35  },
    { key: 'drive',           label: 'DRIV',  group: 'amp',   tip: 'Distortion amount',              tipJa: 'ディストーション量',           min: 0,     max: 2.5,   default: 1.4   },
    { key: 'hpFreq',          label: 'HP',    group: 'amp',   tip: 'Output highpass frequency',      tipJa: '出力ハイパス周波数',           min: 20,    max: 8000,  default: 20    },
    { key: 'click',           label: 'CLCK',  group: 'amp',   tip: 'Transient click amount',         tipJa: 'クリックトランジェント量',     min: 0,     max: 1.0,   default: 0.6   },
    { key: 'burstCount',      label: 'BRST',  group: 'amp',   tip: 'Burst count (1=normal, 4=clap)', tipJa: 'バースト回数 (1=通常, 4=クラップ)', min: 1, max: 6, step: 1, default: 1 },
    { key: 'burstGap',        label: 'GAP',   group: 'amp',   tip: 'Burst gap time',                 tipJa: 'バースト間隔',                 min: 0.005, max: 0.03,  default: 0.015 },
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
  iDEATH: [
    { key: 'polyMode',   label: 'POLY',  group: 'osc',    tip: 'Polyphony: MONO → POLY(4)',  tipJa: 'ポリフォニー: モノ → ポリ(4)', min: 0, max: 1, step: 1, default: 0 },
    { key: 'oscAPos',    label: 'WV-A',  group: 'osc',    tip: 'Osc A wavetable position',   tipJa: 'オシレータA波形位置',     min: 0.0,  max: 1.0,  default: 0.0   },
    { key: 'oscBPos',    label: 'WV-B',  group: 'osc',    tip: 'Osc B wavetable position',   tipJa: 'オシレータB波形位置',     min: 0.0,  max: 1.0,  default: 0.25  },
    { key: 'oscBSemi',   label: 'SEMI',  group: 'osc',    tip: 'Osc B semitone offset',      tipJa: 'オシレータB半音オフセット', min: -24, max: 24,   step: 1, default: 0    },
    { key: 'oscMix',     label: 'MIX',   group: 'osc',    tip: 'Osc A/B mix',                tipJa: 'オシレータA/Bミックス',   min: 0.0,  max: 1.0,  default: 0.5   },
    { key: 'combine',    label: 'COMB',  group: 'osc',    tip: 'Combine: MIX → FM → RING',   tipJa: '合成: MIX → FM → RING',  min: 0,    max: 2,    step: 1, default: 0    },
    { key: 'fmIndex',    label: 'FMIX',  group: 'osc',    tip: 'FM modulation depth',        tipJa: 'FM変調深さ',              min: 0.0,  max: 8.0,  default: 3.0   },
    { key: 'cutoffBase', label: 'CUT',   group: 'filter', tip: 'Filter cutoff',              tipJa: 'フィルターカットオフ',    min: 50,   max: 8000, default: 1200  },
    { key: 'envMod',     label: 'FMOD',  group: 'filter', tip: 'Filter envelope depth',      tipJa: 'フィルターエンベロープ深さ', min: 0,  max: 8000, default: 4000  },
    { key: 'resonance',  label: 'RESO',  group: 'filter', tip: 'Filter resonance',           tipJa: 'レゾナンス',              min: 0.5,  max: 10.0, default: 2.0   },
    { key: 'filterMode', label: 'FTYP',  group: 'filter', tip: 'Filter: LP → HP → BP → NTCH', tipJa: 'フィルター: LP → HP → BP → NTCH', min: 0, max: 3, step: 1, default: 0 },
    { key: 'drive',         label: 'DRIV',  group: 'filter', tip: 'Post-filter drive (saturation)', tipJa: 'ドライブ（サチュレーション）', min: 0.0, max: 1.0, default: 0.0 },
    { key: 'unisonVoices', label: 'UNI',   group: 'osc',    tip: 'Unison voices: 1 → 3 → 5 → 7', tipJa: 'ユニゾンボイス数',     min: 1, max: 7, step: 2, default: 1 },
    { key: 'unisonSpread', label: 'SPRD',  group: 'osc',    tip: 'Unison detune spread',       tipJa: 'ユニゾンデチューン幅',    min: 0.0, max: 1.0, default: 0.3 },
    { key: 'unisonWidth',  label: 'WIDE',  group: 'osc',    tip: 'Unison stereo width',        tipJa: 'ユニゾンステレオ幅',      min: 0.0, max: 1.0, default: 0.8 },
    { key: 'attack',       label: 'ATCK',  group: 'env',    tip: 'Amp attack',                 tipJa: 'アタック',                min: 0.001, max: 1.0, default: 0.005  },
    { key: 'decay',      label: 'DCY',   group: 'env',    tip: 'Amp decay',                  tipJa: 'ディケイ',                min: 0.01, max: 2.0,  default: 0.3   },
    { key: 'sustain',    label: 'SUST',  group: 'env',    tip: 'Amp sustain',                tipJa: 'サスティン',              min: 0.0,  max: 1.0,  default: 0.5   },
    { key: 'release',    label: 'RLS',   group: 'env',    tip: 'Amp release',                tipJa: 'リリース',                min: 0.01, max: 2.0,  default: 0.3   },
    { key: 'modDecay',   label: 'MDCY',  group: 'env',    tip: 'Mod envelope decay',         tipJa: 'モジュレーションディケイ', min: 0.01, max: 2.0,  default: 0.25  },
    { key: 'lfo1Rate',  label: 'LF1R',  group: 'lfo',    tip: 'LFO 1 rate (Hz)',            tipJa: 'LFO 1 速度',              min: 0.1,  max: 20.0, default: 2.0   },
    { key: 'lfo1Shape', label: 'LF1S',  group: 'lfo',    tip: 'LFO 1: SIN → TRI → SAW → SQR → S&H', tipJa: 'LFO 1: SIN → TRI → SAW → SQR → S&H', min: 0, max: 4, step: 1, default: 0 },
    { key: 'lfo1Sync',  label: 'L1SY',  group: 'lfo',    tip: 'LFO 1 tempo sync: OFF → ON', tipJa: 'LFO 1 テンポ同期',        min: 0, max: 1, step: 1, default: 0 },
    { key: 'lfo1Div',   label: 'L1DV',  group: 'lfo',    tip: 'LFO 1 sync: 1/1 → 1/2 → 1/4 → 1/8 → 1/16 → 1/32 → 1/4T → 1/8T → 1/16T → 1/4D → 1/8D → 1/16D', tipJa: 'LFO 1 同期分割', min: 0, max: 11, step: 1, default: 2 },
    { key: 'lfo2Rate',  label: 'LF2R',  group: 'lfo',    tip: 'LFO 2 rate (Hz)',            tipJa: 'LFO 2 速度',              min: 0.1,  max: 20.0, default: 0.5   },
    { key: 'lfo2Shape', label: 'LF2S',  group: 'lfo',    tip: 'LFO 2: SIN → TRI → SAW → SQR → S&H', tipJa: 'LFO 2: SIN → TRI → SAW → SQR → S&H', min: 0, max: 4, step: 1, default: 0 },
  ],
  Sampler: [
    { key: 'decay',      label: 'DCY',   group: 'amp',     tip: 'Amplitude decay time',     tipJa: '音量ディケイ',         min: 0.05, max: 5.0,  default: 1.0  },
    { key: 'start',      label: 'STRT',  group: 'sample',  tip: 'Sample start point',       tipJa: 'サンプル開始点',       min: 0.0,  max: 1.0,  default: 0.0  },
    { key: 'end',        label: 'END',   group: 'sample',  tip: 'Sample end point',         tipJa: 'サンプル終了点',       min: 0.0,  max: 1.0,  default: 1.0  },
    { key: 'pitchShift', label: 'PTCH',  group: 'sample',  tip: 'Pitch shift (semitones)',  tipJa: 'ピッチシフト（半音）', min: -24,  max: 24,   step: 1, default: 0 },
    { key: 'reverse',    label: 'REV',   group: 'sample',  tip: 'Reverse playback',         tipJa: 'リバース再生',         min: 0,    max: 1,    step: 1, default: 0 },
    { key: 'chopSlices', label: 'CHOP',  group: 'chop',    tip: 'Slice count: OFF/8/16/32', tipJa: 'スライス数',           min: 0,    max: 32,   step: 8, default: 0 },
    { key: 'chopMode',   label: 'MODE',  group: 'chop',    tip: 'Chop: NOTE-MAP / SEQ',     tipJa: 'チョップモード',       min: 0,    max: 1,    step: 1, default: 0 },
    { key: 'sampleBPM',  label: 'BPM',   group: 'sync',    tip: 'Sample BPM (0=OFF)',       tipJa: 'サンプルBPM（0=OFF）', min: 0,    max: 200,  step: 1, default: 0 },
    { key: 'loopMode',   label: 'LOOP',  group: 'sync',    tip: 'Loop: ONE-SHOT / LOOP',    tipJa: 'ループモード',         min: 0,    max: 1,    step: 1, default: 0 },
    { key: 'stretchMode', label: 'STRC', group: 'sync',    tip: 'Stretch: REPITCH / WSOLA', tipJa: 'ストレッチモード',     min: 0,    max: 1,    step: 1, default: 0 },
  ],
}


// VoiceIds that share DrumMachine params (ADR 010)
const DRUM_MACHINE_IDS = new Set(['Kick', 'Kick808', 'Snare', 'Clap', 'Hat', 'OpenHat', 'Cymbal', 'Tom', 'Rimshot', 'Cowbell', 'Shaker'])
export const SAMPLER_IDS = new Set(['Crash', 'Ride', 'Sampler'])

export function getParamDefs(voiceId: VoiceId): ParamDef[] {
  if (DRUM_MACHINE_IDS.has(voiceId)) return VOICE_PARAMS.DrumMachine ?? []
  if (SAMPLER_IDS.has(voiceId)) return VOICE_PARAMS.Sampler ?? []
  return VOICE_PARAMS[voiceId] ?? []
}

export function defaultVoiceParams(voiceId: VoiceId): Record<string, number> {
  const defs = getParamDefs(voiceId)
  const preset = DRUM_PRESETS[voiceId]
  if (preset) {
    const p = preset as unknown as Record<string, number>
    return Object.fromEntries(defs.map(d => [d.key, p[d.key] ?? d.default]))
  }
  return Object.fromEntries(defs.map(d => [d.key, d.default]))
}

// ── Discrete-param display labels ─────────────────────────────────────────
const DISPLAY_LABELS: Record<string, string[]> = {
  arpMode:    ['OFF', 'UP', 'DWN', 'U/D', 'RND'],
  arpChord:   ['OCT', '5TH', 'TRD', 'SUS', '7TH'],
  combine:    ['MIX', 'FM', 'RING'],
  filterMode: ['LP', 'HP', 'BP', 'NTCH'],
  noiseFilterMode: ['LP', 'HP', 'BP'],
  reverse: ['OFF', 'ON'],
  chopSlices: ['OFF', '8', '16', '32'],
  chopMode: ['MAP', 'SEQ'],
  loopMode: ['1SHT', 'LOOP'],
  stretchMode: ['RPTC', 'WSLA'],
  lfo1Shape:  ['SIN', 'TRI', 'SAW', 'SQR', 'S&H'],
  lfo2Shape:  ['SIN', 'TRI', 'SAW', 'SQR', 'S&H'],
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
