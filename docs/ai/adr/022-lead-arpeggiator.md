# ADR 022 — Lead Arpeggiator

## Status: Implemented

## Context

メロディックトラック（BASS / LEAD）は現在1ステップにつき1ノートしか鳴らせない。
ステップ間をアルペジオで細分化すれば、シーケンスに1音置くだけで
自動的にアルペジオパターンが走り、ライブ演奏感が大幅に向上する。

ハードウェアグルーブボックス（Elektron Digitone, Roland MC-101, Novation Circuit）
では定番機能であり、シンセウェーブ / ハウス / トランス系パターンと特に相性が良い。

## Decision

### パラメータ設計

voiceParams として4つのパラメータを追加し、既存の ParamPanel ノブで操作できるようにする。
対象トラックは **MoogLead（LEAD）のみ**。

| key      | label | min | max | default | 説明 |
|----------|-------|-----|-----|---------|------|
| arpMode  | ARP   | 0   | 4   | 0       | 0=OFF, 1=UP, 2=DOWN, 3=UP-DOWN, 4=RANDOM |
| arpRate  | RATE  | 1   | 4   | 2       | ステップあたりの分割数 (1=1/4, 2=1/8, 3=triplet, 4=1/16) |
| arpChord | CHRD  | 0   | 4   | 0       | 0=OCT, 1=5TH, 2=MAJ, 3=MIN, 4=7TH |
| arpOct   | AOCT  | 1   | 4   | 1       | アルペジオのオクターブ範囲 |

arpMode / arpRate / arpChord / arpOct は連続ノブだが、worklet 側で `Math.round()` して離散値として扱う。
UI 的にはノブを回すとカチカチとモードが切り替わるイメージ。

### コードインターバルテーブル

`arpChord` でノートリストの構成音を決定する：

| arpChord | 名前 | インターバル（半音） | C3 からの例 |
|----------|------|---------------------|-------------|
| 0        | OCT  | [0]                 | C3 (オクターブユニゾン) |
| 1        | 5TH  | [0, 7]              | C3, G3 |
| 2        | MAJ  | [0, 4, 7]           | C3, E3, G3 |
| 3        | MIN  | [0, 3, 7]           | C3, Eb3, G3 |
| 4        | 7TH  | [0, 4, 7, 10]       | C3, E3, G3, Bb3 |

### アルペジオノート生成ロジック

```
入力: baseNote, mode, chord, octaves
出力: notes[] (繰り返し再生するノートリスト)
```

1. `chord` のインターバルを `octaves` 分のオクターブで展開:
   - chord=MAJ, oct=1: `[C3, E3, G3]`
   - chord=MAJ, oct=2: `[C3, E3, G3, C4, E4, G4]`
   - chord=OCT, oct=2: `[C3, C4]` (従来の動作)

2. `mode` がリストの走査順を決定:
   - UP: そのまま
   - DOWN: 逆順
   - UP-DOWN: 折り返し（端は重複しない）
   - RANDOM: LCG 疑似乱数で決定論的にピック

### 起動条件

`arpMode > 0 && (arpChord > 0 || arpOct >= 2)`

- chord=OCT + oct=1 → ノート1つのみ → arp 無効（通常再生）
- chord=MAJ + oct=1 → トライアド3音 → arp 有効
- chord=OCT + oct=2 → オクターブ展開 → arp 有効

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
ParamPanel ノブ → voiceParams.arpMode/arpRate/arpChord/arpOct
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
| `src/lib/paramDefs.ts` | MoogLead に `arpMode`, `arpRate`, `arpChord`, `arpOct` 追加 |
| `src/lib/audio/worklet-processor.ts` | `ARP_CHORDS` テーブル、arp ステート追加、`_advanceStep` でアルペジオ開始、`process` でサブステップ tick |

- `state.svelte.ts` — 変更不要（voiceParams は Record<string, number> で動的）
- `engine.ts` — 変更不要（voiceParams をそのまま転送）
- `ParamPanel.svelte` — 変更不要（paramDefs から自動生成）

### 変更しないもの

- AnalogSynth.h / voices.ts の Voice インターフェース
  → アルペジオは worklet のステップ制御レイヤーで処理。ボイス自体は普通に noteOn/slideNote を受ける
- PianoRoll — ノート表示はそのまま（アルペジオは再生時のみの効果）
- Trig インターフェース — per-step データには含めない（トラック全体の設定）

## Verification

1. LEAD トラックで ARP=1 (UP), CHRD=MAJ, AOCT=1 → C-E-G トライアドアルペジオ
2. AOCT=2 → 2オクターブに展開 (C3-E3-G3-C4-E4-G4)
3. CHRD=7TH → ドミナント7thアルペジオ (C-E-G-Bb)
4. CHRD=OCT, AOCT=2 → オクターブユニゾン（従来動作）
5. ARP=2 (DOWN) → 下降パターン
6. ARP=3 (UP-DOWN) → 折り返しパターン
7. ARP=4 (RANDOM) → ランダムピック
8. RATE を 1→4 に変更 → 分割が細かくなる
9. ARP=0 → 通常の単音再生に戻る
10. CHRD=OCT, AOCT=1 → arp 無効（通常再生）
11. duration=4 のロングノートでアルペジオ → 4ステップ分アルペジオが継続
12. P-Lock で特定ステップだけ CHRD=MAJ → そのステップだけコードアルペジオ

## Future Extensions

- **ARP パターン**: gate length パターン（長短長短など）の追加
- **ARP hold**: ノートをホールドしてアルペジオを継続するモード
- **カスタムコード**: P-Lock で任意のコードトーンを指定するモード
