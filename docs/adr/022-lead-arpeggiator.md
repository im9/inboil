# ADR 022 — Lead Arpeggiator

## Status: Accepted

## Context

メロディックトラック（BASS / LEAD）は現在1ステップにつき1ノートしか鳴らせない。
ステップ間をアルペジオで細分化すれば、シーケンスに1音置くだけで
自動的にアルペジオパターンが走り、ライブ演奏感が大幅に向上する。

ハードウェアグルーブボックス（Elektron Digitone, Roland MC-101, Novation Circuit）
では定番機能であり、シンセウェーブ / ハウス / トランス系パターンと特に相性が良い。

## Decision

### パラメータ設計

voiceParams として3つのパラメータを追加し、既存の ParamPanel ノブで操作できるようにする。

| key      | label | min | max | default | 説明 |
|----------|-------|-----|-----|---------|------|
| arpMode  | ARP   | 0   | 4   | 0       | 0=OFF, 1=UP, 2=DOWN, 3=UP-DOWN, 4=RANDOM |
| arpRate  | RATE  | 1   | 4   | 2       | ステップあたりの分割数 (1=1/4, 2=1/8, 3=triplet, 4=1/16) |
| arpOct   | AOCT  | 1   | 4   | 1       | アルペジオのオクターブ範囲 |

arpMode は連続ノブだが、worklet 側で `Math.round()` して離散値として扱う。
UI 的にはノブを回すとカチカチとモードが切り替わるイメージ。

### アルペジオノート生成ロジック

```
入力: baseNote, mode, octaves
出力: notes[] (繰り返し再生するノートリスト)

UP:       [C3, E3, G3, C4, E4, G4]  (1オクターブずつ上昇)
DOWN:     [G4, E4, C4, G3, E3, C3]  (逆順)
UP-DOWN:  [C3, E3, G3, C4, E4, G4, E4, C4, G3, E3]  (折り返し、端は重複しない)
RANDOM:   シャッフル（LCG疑似乱数で決定論的）
```

ただし現在のシーケンサーは単音（コードなし）なので、
アルペジオは **baseNote のオクターブ展開** として動作する：

- `octaves = 1`: `[note]` (アルペジオなし、通常再生)
- `octaves = 2`: `[note, note+12]`
- `octaves = 3`: `[note, note+12, note+24]`
- `octaves = 4`: `[note, note+12, note+24, note+36]`

mode がこのリストの走査順を決定する。
将来的にコード入力（P-Lock で和音指定など）が追加されれば、
コードトーンのアルペジオに自然に拡張できる。

### Worklet 実装

`_advanceStep()` でトリガーが発火した時にアルペジオを開始する：

```typescript
// Per-track arp state (worklet 内)
private arpNotes:    number[][] = []   // トラックごとのノートリスト
private arpIndex:    number[]   = []   // 現在のノートリスト位置
private arpCounter:  number[]   = []   // サブステップカウンター
private arpTickSize: number[]   = []   // サンプル数 / arp tick
```

**ステップ発火時** (`_advanceStep` 内):
1. `arpMode > 0` かつ `trig.active` → ノートリストを生成
2. リストの最初のノートで `noteOn()` / `slideNote()`
3. `arpCounter = 0`, `arpTickSize = samplesPerStep / arpRate`

**毎サンプル** (`process` ループ内):
1. `arpCounter++`
2. `arpCounter >= arpTickSize` のとき:
   - `arpIndex` を進めて次のノートで `slideNote()` (滑らかに繋ぐ)
   - `arpCounter -= arpTickSize`

**ゲート終了時** (`gateCounter === 0`):
- `arpNotes[t] = []` でアルペジオ停止

### データフロー

```
ParamPanel ノブ → voiceParams.arpMode/arpRate/arpOct
    ↓
state.svelte.ts → engine.ts → worklet postMessage (既存パイプライン)
    ↓
worklet setPattern → voices[t].setParam('arpMode', val)
    ↓
worklet _advanceStep → arp ノートリスト生成 → noteOn/slideNote
worklet process loop → サブステップ tick → slideNote
```

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/paramDefs.ts` | MoogLead / Bass303 に `arpMode`, `arpRate`, `arpOct` 追加 |
| `src/lib/audio/worklet-processor.ts` | arp ステート追加、`_advanceStep` でアルペジオ開始、`process` でサブステップ tick |

- `state.svelte.ts` — 変更不要（voiceParams は Record<string, number> で動的）
- `engine.ts` — 変更不要（voiceParams をそのまま転送）
- `ParamPanel.svelte` — 変更不要（paramDefs から自動生成）

### 変更しないもの

- AnalogSynth.h / voices.ts の Voice インターフェース
  → アルペジオは worklet のステップ制御レイヤーで処理。ボイス自体は普通に noteOn/slideNote を受ける
- PianoRoll — ノート表示はそのまま（アルペジオは再生時のみの効果）
- Trig インターフェース — per-step データには含めない（トラック全体の設定）

## Verification

1. LEAD トラックで ARP=1 (UP), AOCT=2 にして1ノート配置 → オクターブ上下の交互再生
2. RATE を 1→4 に変更 → 分割が細かくなる
3. ARP=3 (UP-DOWN) → 上昇→下降の折り返しパターン
4. ARP=0 → 通常の単音再生に戻る
5. duration=4 のロングノートでアルペジオ → 4ステップ分アルペジオが継続
6. slide=true の次ノートへの接続が自然に聞こえる

## Future Extensions

- **コードアルペジオ**: P-Lock でコードトーンを指定し、オクターブ展開ではなく
  コード構成音をアルペジオする（パラメーターロック実装後）
- **ARP パターン**: gate length パターン（長短長短など）の追加
- **ARP hold**: ノートをホールドしてアルペジオを継続するモード
