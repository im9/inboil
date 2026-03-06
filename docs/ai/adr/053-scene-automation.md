# ADR 053 — Scene Automation Node

| field   | value                              |
| ------- | ---------------------------------- |
| status  | proposed                           |
| date    | 2026-03-06                         |
| parent  | ADR 050 (Scene Function Nodes)     |

## Context

DAW では「オートメーション」が標準機能として存在する。パラメータ（ボリューム、フィルターカットオフ、エフェクト量など）を時間経過に沿って動的に変化させることで、静的なパターンの繰り返しに表現力を与える。

現在の inboil のシーングラフでは、function ノード（transpose, tempo, repeat, probability, fx）はパターン再生の *前* にパラメータを一度だけセットする。パターン再生 *中* にパラメータを連続的に変化させる手段がない。

### ユースケース

- パターンの再生中にテンポを徐々に上げる（accelerando）
- フィルターカットオフを 4 小節かけて開く
- リバーブの wet 量をフェードイン
- パターンの音量をフェードアウト

## Decision

### 1. 新しい function node タイプ: `automation`

```typescript
type: 'automation'
params: {
  target: number    // 0=tempo, 1=volume, 2=filterCutoff, 3=reverbWet, 4=delayWet
  startVal: number  // 正規化値 0.0–1.0
  endVal: number    // 正規化値 0.0–1.0
  curve: number     // 0=linear, 1=ease-in, 2=ease-out, 3=s-curve
}
```

`SceneNode.type` union に `'automation'` を追加:

```typescript
type: 'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx' | 'automation'
```

### 2. 動作モデル

Automation ノードは function ノードと同じくエッジでグラフに接続する。**接続先のパターンノードの再生中に**パラメータを連続変化させる:

```
[INTRO] ──→ [automation: tempo 80→120] ──→ [BUILDUP]
                                             ↑ この再生中に tempo が 80→120 に変化
```

- Automation ノードから出るエッジの先がパターンノードの場合、そのパターンの再生ステップに同期して値を補間
- 複数の automation ノードが同じパターンに接続可能（異なる target）
- 同じ target の automation が複数ある場合は最後に接続されたものが優先

### 3. 補間

パターンの再生進行率 `t = currentStep / totalSteps` (0.0–1.0) を使って補間:

```typescript
function interpolate(t: number, start: number, end: number, curve: number): number {
  let ct: number
  switch (curve) {
    case 0: ct = t; break                                    // linear
    case 1: ct = t * t; break                                // ease-in
    case 2: ct = 1 - (1 - t) * (1 - t); break              // ease-out
    case 3: ct = t < 0.5 ? 2*t*t : 1 - 2*(1-t)*(1-t); break // s-curve
  }
  return start + (end - start) * ct
}
```

### 4. シーングラフ走査への統合

`walkToNode()` の走査時:
1. 次のパターンノードに到達する前に、経路上の automation ノードを収集
2. パターン再生開始時に、収集した automation 情報を `playback` state に格納
3. AudioWorklet の playhead 進行に合わせて、メインスレッドで補間値を計算し DSP パラメータを更新

```typescript
// playback state に追加
activeAutomations: Array<{
  target: number
  startVal: number
  endVal: number
  curve: number
}>
```

### 5. UI

#### ノード表示

```
┌────────┐
│ ⤯ A→B  │  ← automation icon + start→end 表記
└────────┘
 tempo 80→120  ← label (target name + denormalized values)
```

- アイコン: 右上がりの曲線（⤯ 的な SVG）
- ノード形状: 他の function ノードと同じ rounded rect
- BubbleMenu に追加

#### パラメータ編集（DockPanel）

```
┌──────────────────────────┐
│ AUTOMATION               │
│                          │
│ Target: [tempo     ▾]    │
│ Start:  ===●========  80 │
│ End:    ========●===  120│
│ Curve:  [linear  ▾]     │
│                          │
│ ┌──────────────────┐     │
│ │    ╱‾‾‾          │     │  ← curve preview
│ │   ╱              │     │
│ │  ╱               │     │
│ │ ╱                │     │
│ └──────────────────┘     │
└──────────────────────────┘
```

#### Canvas 描画（再生中）

再生中のパターンに接続された automation がある場合、ノード下部にミニカーブを描画し、現在位置をドットで示す:

```
┌──────────┐
│ BUILDUP  │
└──────────┘
 ╱‾‾● ← 現在位置
```

### 6. Target パラメータ一覧

| target | Name | Range (denormalized) | DSP parameter |
|--------|------|---------------------|---------------|
| 0 | Tempo | 60–300 BPM | `playback.bpm` |
| 1 | Volume | 0–100% | `perf.masterGain` |
| 2 | Filter Cutoff | 20–20000 Hz | `fxPad.filter.x` |
| 3 | Reverb Wet | 0–100% | `effects.reverb.size` |
| 4 | Delay Wet | 0–100% | `effects.delay.feedback` |

## Implementation Phases

### Phase 1: Data model + node type
1. `SceneNode.type` に `'automation'` 追加
2. `sceneAddFunctionNode` で automation 対応
3. BubbleMenu に automation アイコン追加
4. ノード表示（SVG アイコン + ラベル）

### Phase 2: Param editing UI
1. DockPanel に automation パラメータ編集 UI
2. Target セレクター、start/end スライダー、curve セレクター
3. カーブプレビュー描画

### Phase 3: Playback integration
1. `walkToNode()` で automation ノードを収集
2. `playback` state に `activeAutomations` 追加
3. 再生ループ内で補間値を計算・適用
4. AudioWorklet への tempo 変更通知

### Phase 4: Visual feedback
1. 再生中のミニカーブ + 現在位置ドット（Canvas 描画）
2. Automation エッジのアニメーション

## Considerations

- **スコープの大きさ**: この機能は 4 フェーズに分かれており、特に Phase 3（再生統合）は AudioWorklet との連携が必要。段階的に進めること
- **Tempo 変更のリアルタイム性**: BPM を再生中に変更する場合、AudioWorklet の `interval` を動的に更新する必要がある。現状の `setTempo()` メッセージで対応可能
- **パラメータの正規化**: すべての automation 値は 0.0–1.0 で保持し、target ごとにデノーマライズ。これは既存のパラメータ設計方針（CLAUDE.md）と一致
- **サイクル検出**: Automation ノードが自身を含むサイクルに接続された場合の挙動。既存のグラフ走査がサイクルを検出するのでそのまま利用
- **将来の拡張**: LFO（周期的変調）やステップオートメーション（離散値変化）は別の node type として追加可能

## Future Extensions

- **LFO node**: 周期的にパラメータを変調（sine, triangle, square, random）
- **Envelope node**: ADSR エンベロープでパラメータを制御
- **Custom curve editor**: ベジエカーブで任意のオートメーション形状を描く
- **Per-track automation**: トラック（instrument）ごとに個別のパラメータを自動化

## Extends

| ADR | Impact |
|-----|--------|
| 044 (Scene Graph) | `SceneNode.type` に `'automation'` 追加 |
| 050 (Scene Function Nodes) | 6番目の function node。BubbleMenu + DockPanel 拡張 |
| 048 (Scene Playback) | `walkToNode()` 拡張、`playback` state に automation 情報追加 |
