# ADR 021: Note Duration, Slide & Lead ADSR

## Status: DECIDED (Implemented)

## Context

現状のステップシーケンサーにはいくつかの制限がある:

1. **ノート長が固定** — すべてのトリガーは1ステップ分の長さで発音される。レガートフレーズやサステインが表現できない。
2. **スライド/グライドなし** — Bass (TB303Voice) にアシッド的なポルタメントがない。Lead (MoogVoice) にもピッチベンド的な表現がない。
3. **Lead の ADSR が固定** — MoogVoice のアンプ/フィルターエンベロープはコード内にハードコードされており、ユーザーが調整できない。

また、現在の `ADSR` クラスには `noteOff()` メソッドがなく、Release ステージは voice の `reset()` 時にしか発動しない。ノート長の導入には noteOff の仕組みが必須。

### 関連 ADR

- **ADR 011** (Synth Engines): 将来のシンセアーキテクチャ (amp ADSR + filter ADSR 分離)
- **ADR 014** (Parameter Locks): per-step パラメータオーバーライドの仕組み

### 将来の方向性 (本 ADR のスコープ外)

- シンセ分離 (Bass 専用シンセ / Lead モノシンセ / ポリシンセ)
- ゲート長 % (ステップ内のサブステップ分解能)
- 他シンセへの ADSR 拡張

## Design

### A. ノート長 (Note Duration)

#### データモデル

`Trig` にステップ数ベースの `duration` フィールドを追加する:

```typescript
// state.svelte.ts
export interface Trig {
  active: boolean
  note: number        // MIDI note
  velocity: number    // 0.0–1.0
  duration: number    // ステップ数 (1–16, デフォルト 1)
  slide: boolean      // スライドフラグ (後述)
}
```

デフォルト値は `1` (現状と同じ挙動)。最大値はトラックのステップ数。

**ステップ単位を採用する理由:**
- UI がステップグリッドと自然に一致する
- ピアノロールでセルをドラッグして伸ばす操作が直感的
- ハードウェアシーケンサー (Elektron, Roland) と同じパラダイム
- サブステップ分解能はステップシーケンサーの良さを薄める

#### ワークレット側

`WorkletTrig` を拡張:

```typescript
// types.ts
export interface WorkletTrig {
  active: boolean; note: number; velocity: number
  duration: number   // ステップ数
  slide: boolean
}
```

ワークレットのステップ処理で、ノート長に基づいて `noteOff()` をスケジュールする:

```typescript
// worklet-processor.ts — _advanceStep() 内
// ノートオンと同時にオフのカウンタをセット
if (trig?.active && !track.muted) {
  voice.noteOn(note, trig.velocity)
  this.gateCounters[t] = trig.duration  // 残りステップ数
}

// 毎ステップ: ゲートカウンタをデクリメント
for (let t = 0; t < this.tracks.length; t++) {
  if (this.gateCounters[t] > 0) {
    this.gateCounters[t]--
    if (this.gateCounters[t] === 0) {
      this.voices[t]?.noteOff()  // Release ステージへ
    }
  }
}
```

`gateCounters` は `number[]` (`new Array(8).fill(0)`) でプロセッサに追加。

#### ADSR.noteOff()

```typescript
// filters.ts — ADSR クラスに追加
noteOff() {
  if (this.stage !== Stage.Idle) {
    this.stage = Stage.Release
  }
}
```

Voice インターフェースにも `noteOff()` を追加:

```typescript
export interface Voice {
  noteOn(note: number, velocity: number): void
  noteOff(): void    // 追加: Release ステージへ遷移
  tick(): number
  reset(): void
  setParam(key: string, value: number): void
}
```

各 Voice 実装で `noteOff()` を追加 — 内部の ADSR (amp/filter 両方) の `noteOff()` を呼ぶ。ドラムボイスでは no-op (自然減衰のため)。

#### ピアノロール UI (DAW 風ノートバー描画)

ノート長をピアノロールで視覚化・編集する。一般的な DAW と同じ操作モデル:

```
  C4 │ ■ ■ ─ ─ │ . . . . │ ■ . . . │ . . . . │
  B3 │ . . . . │ ■ ─ ─ . │ . . . . │ . . ■ . │
  A3 │ . . . . │ . . . . │ . ■ ─ ─ │ ─ . . . │
      ■ = ノートヘッド   ─ = duration の延長部分 (continuation)
```

- **配置**: 空セルをクリック → duration=1 のノートを配置。そのまま右にドラッグ → バーが伸びる
- **削除**: ヘッドをクリック → ノート削除。continuation をクリック → 親ノートごと削除
- **リサイズ**: 配置後、ヘッド右端のリサイズハンドルで duration を微調整
- **描画中はピッチ固定**: ドラッグ中は横方向のみ (縦にドラッグしてもピッチは変わらない)
- **表示**: ヘッド = `--color-olive`、continuation = `rgba(108,119,68,0.3)` (半透明)
- **state ヘルパー**: `placeNoteBar()` (配置 + covered steps クリア)、`findNoteHead()` (continuation→親の逆引き)

### B. スライド (Slide / Glide)

#### データモデル

`Trig.slide: boolean` — スライドフラグ。このステップのノートから次のアクティブなノートへ滑らかにピッチが遷移する。

#### Auto-Legato (メロディックトラック)

メロディックトラック (t >= 6) は auto-legato: 連続するアクティブなノート (duration で繋がった or 隣接) が自動的にレガート接続される。明示的な slide フラグは不要。

- **連続ノート**: `wasGated && isMelodic` → `slideNote()` 呼び出し (エンベロープ継続)
- **rest あり**: ゲートカウンタ=0 → `noteOff()` → 次の `noteOn()` でリトリガー

#### シンセ別の挙動

| シンセ | slideNote() 挙動 | 詳細 |
|--------|------|------|
| **TB303Voice** (Bass) | ポルタメントグライド | 303 的。`targetFreq` のみ変更、指数的スライド ~60ms。`filterEnv.noteOn()` でアシッドスクェルチ |
| **MoogVoice** (Lead) | クリーンレガート | `freq` と `targetFreq` 両方を即時セット (グライドなし)。エンベロープ継続のみ |
| ドラム / その他 | noteOn() と同等 | リトリガー (ドラムにレガートは不要) |

#### Voice インターフェース拡張

```typescript
export interface Voice {
  noteOn(note: number, velocity: number): void
  noteOff(): void
  slideNote(note: number, velocity: number): void  // 追加
  tick(): number
  reset(): void
  setParam(key: string, value: number): void
}
```

`slideNote()` はノートオンと異なり、エンベロープをリトリガーせずにピッチだけ遷移する。

#### TB303Voice のグライド実装

```typescript
// voices.ts — TB303Voice
private slideRate = 1 - Math.exp(-1 / (0.060 * sr))  // ~60ms exponential glide

slideNote(note: number, v: number) {
  this.targetFreq = midiToHz(note)
  this.vel = v
  this.filterEnv.noteOn()  // acid squelch: retrigger filter, NOT amp (legato)
}

// tick() 内でピッチを更新
tick(): number {
  this.freq += (this.targetFreq - this.freq) * this.slideRate
  // ... oscillator → drive → filter → ampEnv
}
```

#### MoogVoice のレガート実装

```typescript
// voices.ts — MoogVoice: clean legato (no glide)
slideNote(note: number, v: number) {
  const f = midiToHz(note)
  this.freq = f; this.targetFreq = f  // instant pitch change
  this.vel = v
  // envelope continues (no noteOn/noteOff) → clean legato
}
```

#### ワークレット側のスライド処理

```typescript
// _advanceStep() 内
const wasGated = this.gateCounters[t] > 0
const isMelodic = t >= 6
const isLegato = trig?.active && (isMelodic || trig.slide)

// ゲートカウンタ: noteOff はレガート時には抑制
if (this.gateCounters[t] > 0) {
  this.gateCounters[t]--
  if (this.gateCounters[t] === 0 && !isLegato) {
    this.voices[t]?.noteOff()
  }
}

// ノートオン/スライド判定
if (trig?.active && !track.muted) {
  if (wasGated && (isMelodic || trig.slide)) {
    voice.slideNote(note, trig.velocity)  // レガート
  } else {
    voice.noteOn(note, trig.velocity)     // リトリガー
  }
  this.gateCounters[t] = trig.duration
}
```

**レガート条件:** `wasGated` (前ノートのゲートが開いていた) かつ `isMelodic || trig.slide`。メロディックトラックは自動、ドラムは明示的 slide フラグが必要。

#### ピアノロール / ステップグリッド UI

- メロディックトラックは auto-legato のため、明示的な SLD レーンは非表示
- 連続ノート = レガート、隙間 = リトリガーがピアノロール上で直接可視化される
- StepGrid の SLD レーンは `{#if false}` で非表示 (将来の再利用に備えてコード保持)

### C. Lead ADSR

#### パラメータ定義

MoogLead の paramDefs に amp ADSR パラメータを追加:

```typescript
// paramDefs.ts
MoogLead: [
  { key: 'cutoffBase', label: 'CUT',   min: 100,   max: 2000, default: 400   },
  { key: 'envMod',     label: 'MOD',   min: 1000,  max: 10000,default: 5500  },
  { key: 'resonance',  label: 'RESO',  min: 0.5,   max: 3.5,  default: 1.8   },
  { key: 'decay',      label: 'FDCY',  min: 0.1,   max: 1.0,  default: 0.35  },  // filter decay
  // ── Amp ADSR (新規) ──
  { key: 'ampAttack',  label: 'ATCK',  min: 0.001, max: 0.5,  default: 0.012 },
  { key: 'ampDecay',   label: 'ADCY',  min: 0.05,  max: 1.0,  default: 0.35  },
  { key: 'ampSustain', label: 'SUST',  min: 0.0,   max: 1.0,  default: 0.45  },
  { key: 'ampRelease', label: 'RLS',   min: 0.01,  max: 2.0,  default: 0.4   },
]
```

既存の `decay` は filter envelope decay のまま (ラベルを `FDCY` に変更して区別)。

**ノブが8つになる** — ParamPanel のレイアウトは現状の2行×4列でちょうど収まる。

#### MoogVoice の DSP 変更

```typescript
// voices.ts — MoogVoice
private filterEnv = new ADSR()   // 既存 (filter 用)
private ampEnv = new ADSR()      // 新規 (amp 用)

constructor(private sr: number) {
  this.filterEnv.setSampleRate(sr)
  this.ampEnv.setSampleRate(sr)
  // filter envelope defaults
  this.filterEnv.attack = 0.002; this.filterEnv.decay = 0.35
  this.filterEnv.sustain = 0.0;  this.filterEnv.release = 0.1
  // amp envelope defaults
  this.ampEnv.attack = 0.012; this.ampEnv.decay = 0.35
  this.ampEnv.sustain = 0.45; this.ampEnv.release = 0.4
}

noteOn(note: number, v: number) {
  this.freq = midiToHz(note); this.vel = v
  this.filterEnv.noteOn()
  this.ampEnv.noteOn()
}

noteOff() {
  this.filterEnv.noteOff()
  this.ampEnv.noteOff()
}

tick(): number {
  if (this.ampEnv.isIdle()) return 0
  const fEnv = this.filterEnv.tick()
  const aEnv = this.ampEnv.tick()
  // ... oscillator + filter processing ...
  return filtered * aEnv * this.vel * 0.55
}

setParam(key: string, value: number) {
  switch (key) {
    case 'cutoffBase': this.cutoffBase = value; break
    case 'envMod':     this.envMod     = value; break
    case 'resonance':  this.resonance  = value; break
    case 'decay':      this.filterEnv.decay = value; break
    case 'ampAttack':  this.ampEnv.attack   = value; break
    case 'ampDecay':   this.ampEnv.decay    = value; break
    case 'ampSustain': this.ampEnv.sustain  = value; break
    case 'ampRelease': this.ampEnv.release  = value; break
  }
}
```

## Implementation Order

1. **ADSR.noteOff()** — `filters.ts` に `noteOff()` メソッド追加
2. **Voice.noteOff() + Voice.slideNote()** — インターフェース拡張、全ボイスに実装 (ドラムは no-op)
3. **Trig 拡張** — `duration` + `slide` フィールド追加 (`state.svelte.ts`, `types.ts`)
4. **ワークレット gateCounter** — `_advanceStep()` にノートオフスケジューリング + スライド判定
5. **TB303Voice グライド** — `slideNote()` で指数的ポルタメント実装
6. **MoogVoice グライド** — `slideNote()` で線形ピッチベンド実装
7. **MoogVoice amp ADSR** — filter/amp エンベロープ分離、paramDefs 追加
8. **ピアノロール duration UI** — ノート幅表示 + 右端ドラッグで duration 編集
9. **スライド UI** — ピアノロール/ステップグリッドにスライドインジケーター + トグル操作

## Consequences

- **Positive:** レガートフレーズとアシッドベースラインが表現可能になる
- **Positive:** Lead のサウンドメイキングの幅が大幅に広がる (パッド〜プラック〜リード)
- **Positive:** `noteOff()` の導入で将来のポリシンセやサステインペダル対応の基盤ができる
- **Positive:** ステップ単位の duration はグリッド UI と自然に統合される
- **Positive:** スライドの解釈をシンセ側に委ねることで、将来のシンセ分離に備えられる
- **Negative:** `Trig` のデータサイズが増える (パターン保存データの肥大化)
- **Negative:** ピアノロール UI の複雑度が上がる (duration ドラッグ + スライドトグル)
- **Negative:** ドラムボイスに no-op の `noteOff()` / `slideNote()` が必要 (小さなコスト)
