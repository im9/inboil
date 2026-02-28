# ADR 021: Note Duration, Slide & Lead ADSR

## Status: PROPOSED

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

#### ピアノロール UI

ノート長をピアノロールで視覚化・編集する:

```
  C4 │ ■ ■ ─ ─ │ . . . . │ ■ . . . │ . . . . │
  B3 │ . . . . │ ■ ─ ─ . │ . . . . │ . . ■ . │
  A3 │ . . . . │ . . . . │ . ■ ─ ─ │ ─ . . . │
      ■ = ノートヘッド   ─ = duration の延長部分
```

- **表示**: アクティブなノートが `duration` ステップ分の幅で描画される
- **編集**: ノートの右端をドラッグして duration を変更
- **新規配置**: タップで duration=1 のノートを配置 (現状と同じ)
- **duration > 1 のノート**: ヘッド部分と延長部分で色味を分ける (ヘッドは現状色、延長はやや薄く)

### B. スライド (Slide / Glide)

#### データモデル

`Trig.slide: boolean` — スライドフラグ。このステップのノートから次のアクティブなノートへ滑らかにピッチが遷移する。

#### シンセ別の挙動

スライドフラグの解釈はシンセ側で分ける:

| シンセ | 挙動 | 詳細 |
|--------|------|------|
| **TB303Voice** (Bass) | ポルタメントグライド | 303 的。前のノートの周波数から新しいノートへ指数的にスライド。グライドタイム ≈ 60ms |
| **MoogVoice** (Lead) | ピッチベンド | 前のノートから新しいノートへ線形にベンド。ベンドタイム ≈ 80ms |
| ドラム / その他 | 無視 | スライドフラグを無視 |

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
private targetFreq = 110
private glideRate = 0     // 1サンプルあたりの周波数変化率

slideNote(note: number, v: number) {
  this.targetFreq = midiToHz(note)
  this.vel = v
  // 指数的グライド: ~60ms で到達
  this.glideRate = Math.exp(Math.log(this.targetFreq / this.freq) / (0.06 * this.sr))
}

// tick() 内でピッチを更新
tick(): number {
  if (this.glideRate !== 0) {
    this.freq *= this.glideRate
    if (Math.abs(this.freq - this.targetFreq) < 0.1) {
      this.freq = this.targetFreq
      this.glideRate = 0
    }
  }
  // ... 既存の処理
}
```

MoogVoice も同様だが線形補間で実装。

#### ワークレット側のスライド処理

```typescript
// _advanceStep() 内
if (trig?.active && !track.muted) {
  const note = t >= 6 ? transposeNote(trig.note, this.rootNote, this.octave) : trig.note
  if (trig.slide && this.gateCounters[t] > 0) {
    // 前のノートがまだ鳴っている → スライド
    voice.slideNote(note, trig.velocity)
  } else {
    voice.noteOn(note, trig.velocity)
  }
  this.gateCounters[t] = trig.duration
}
```

**スライドが有効になる条件:** `slide === true` かつ前のノートがまだ鳴っている (`gateCounters[t] > 0`)。これにより、duration > 1 でレガートに繋がったノート間でのみスライドが発生する。

#### ピアノロール / ステップグリッド UI

- ピアノロールのノートヘッドに小さなスライドインジケーター (斜めの線や `⤴` 的なマーク) を表示
- ノートをタップ (既にアクティブなノート) で slide をトグル、または長押しメニュー
- ステップグリッドでは: スライドが有効なステップは底辺に小さなマーカーを表示

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
