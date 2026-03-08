# ADR 062: Scene Node Decorators — Function Node Snap-Attach Model

## Status: Proposed

## Context

現在 function ノード（Transpose, Tempo, Repeat, FX）はエッジチェーンの中間に挟む設計:

```
[Pattern A] ──→ [T+5] ──→ [Pattern B]
```

この設計には以下の問題がある:

1. **root ノードに初期設定を付けられない** — function ノードは必ず from→to のエッジの途中に存在する必要があり、再生開始パターンに Transpose や FX を適用する手段がない
2. **グラフが煩雑になる** — 単にパターンの設定を変えたいだけなのに、ノードとエッジが増えて視覚的ノイズになる
3. **直感的でない** — function ノードは「パターンの属性」なのに、独立したノードとして存在している

### 現状のコード

- `SceneNode` 型: `state.svelte.ts:92-100`
- 走査ロジック `walkToNode()`: `state.svelte.ts:1595-1649` — エッジチェーンを辿りながら function ノードの効果を適用
- レンダリング: `SceneView.svelte:646-700` — function ノードは 48×24px の pill 形状
- function ノード作成: `sceneAddFunctionNode()`: `state.svelte.ts:1294-1306`

## Decision

### 概要

function ノードをパターンノードに **デコレーター** として直接結合する。
UI 上は function ノードをパターンノードに近づけると **スナップして吸着** する。

```
現状:  [Pat A] ──→ [T+5] ──→ [Pat B]

提案:  [Pat A]        [Pat B]
        ├ T+5    ──→    ├ FX verb
        └ ×140          └ RPT2
```

### データモデル

`SceneNode` に `decorators` フィールドを追加:

```typescript
export interface SceneNode {
  id: string
  type: 'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx'
  x: number
  y: number
  root: boolean
  patternId?: string
  params?: Record<string, number>
  // ── New ──
  decorators?: SceneDecorator[]   // function nodes attached to this pattern
}

export interface SceneDecorator {
  type: 'transpose' | 'tempo' | 'repeat' | 'fx'
  params: Record<string, number>
}
```

- `decorators` は pattern ノードのみに付与（function ノード自体は decorator を持たない）
- `probability` は decorator にしない（分岐の意味を持つためエッジベースのまま残す）
- 古いデータに `decorators` がなくても `??= []` で互換性を保つ

### 走査ロジックの変更

`walkToNode()` / `startSceneNode()` でパターンノードに到達したとき、
**パターン再生の前に `decorators` を順番に適用する**:

```typescript
function applyDecorators(node: SceneNode) {
  for (const dec of node.decorators ?? []) {
    switch (dec.type) {
      case 'transpose':
        if (dec.params.mode === 0) playback.sceneTranspose += dec.params.semitones ?? 0
        else playback.sceneAbsoluteKey = dec.params.key ?? 0
        break
      case 'tempo':
        song.bpm = dec.params.bpm ?? 120
        break
      case 'repeat':
        playback.sceneRepeatLeft = (dec.params.count ?? 2) - 1
        break
      case 'fx':
        fxPad.verb.on     = !!(dec.params.verb ?? 0)
        fxPad.delay.on    = !!(dec.params.delay ?? 0)
        fxPad.glitch.on   = !!(dec.params.glitch ?? 0)
        fxPad.granular.on = !!(dec.params.granular ?? 0)
        break
    }
  }
}
```

既存のエッジチェーン内 function ノードも引き続き動作する（後方互換）。

### UI: スナップ結合

```
                  ┌──────────┐
  ドラッグ中:     │ Pattern A│
                  └──────────┘
                       ↑ 近づけると
                  ┌────┐
                  │T+5 │  ← function ノード
                  └────┘

                  ┌──────────┐
  スナップ後:     │ Pattern A│
                  │  ├ T+5   │  ← decorator として結合
                  └──────────┘
```

**スナップ判定:**
- function ノードの中心がパターンノードの境界から **20px 以内** に入ったとき候補表示
- ドロップで確定 → function ノードを削除し、パターンの `decorators[]` に追加
- decorator をパターンノードから外にドラッグ → 独立 function ノードに戻す（detach）

**パターンノードの描画拡張:**
- decorator 付きパターンは下方向に拡張して decorator を表示
- 各 decorator は 8px 高のコンパクト行で、アイコン + パラメータラベル

```
┌──────────────────┐
│  ♪ Intro         │  ← パターン名 (72×32)
├──────────────────┤
│ ♫ T+5  ◴ ×140   │  ← decorators (72×16)
└──────────────────┘
```

### パターンノードポップアップとの統合

既存の `SceneNodePopup` でパラメータ編集を行っているが、
decorator のパラメータも同じポップアップで編集できるようにする。

### IndexedDB 互換性

- `decorators` は optional フィールド → 古いデータは `undefined`
- 読み込み時に `node.decorators ??= []` で補完
- DB_VERSION のインクリメント不要（スキーマ変更なし、フィールド追加のみ）

## Implementation Phases

### Phase 1: データモデル + 走査ロジック
- `SceneDecorator` 型追加
- `SceneNode.decorators` フィールド追加
- `applyDecorators()` を `startSceneNode()` / `walkToNode()` に組み込み
- 読み込み時のデフォルト値補完

### Phase 2: スナップ UI + マイクロインタラクション
- function ノードドラッグ時のスナップ候補ハイライト
- ドロップで attach / detach アクション
- パターンノードの描画拡張（decorator 行表示）
- **Attach アニメーション**: バウンスしてスナップ (`cubic-bezier(0.2, 0, 0, 1.3)`, 120ms) — key-fan と同じイージング
- **Detach アニメーション**: ぽんっと飛び出す (`scale(0.8→1)` + `opacity 0→1`, 100ms)
- **再生中パルス**: decorator 適用の瞬間に行が一瞬光る (既存 `.playing` パルスの小型版、80ms flash)
- **Hover プレビュー**: decorator 行が 1px 浮き上がる (`translateY(-1px)`, 60ms ease-out) — ドラッグ開始の予兆

### Phase 3: ポップアップ統合
- `SceneNodePopup` に decorator パラメータ編集 UI
- decorator の追加 / 削除 / 並べ替え

### Phase 4: 既存 function ノードのマイグレーション（任意）
- エッジチェーン内の `[Pat] → [Fn] → [Pat]` パターンを検出
- ワンクリックで decorator に変換するユーティリティ

## エッジ分岐の意味変更

デコレーター導入により、エッジの役割が明確に分離される:

```
Before:  エッジ = ルーティング + 機能適用（兼用、曖昧）
After:   デコレーター = 機能適用（パターンに直結）
         エッジ = 純粋なルーティング（流れの制御のみ）
```

### 分岐 = 確率遷移

複数エッジが出るノードは **確率分岐** として機能する:

```
              ┌──→ [Pat B ├ T+5]     ← 50%
[Pat A] ──┤
              └──→ [Pat C ├ FX verb]  ← 50%
```

- **1本のエッジ** → 確定遷移（100%）
- **複数エッジ** → 均等確率 or 重み付き確率で選択
- エッジに `weight` プロパティを追加して重み付けを可能にする（将来）

### probability ノードの位置づけ

`probability` ノードはエッジ分岐の確率版と機能が重複する。段階的に移行:

1. **当面**: 両方共存。`probability` ノードは既存データの後方互換のため残す
2. **将来**: エッジの重み付き分岐が安定したら `probability` ノードを deprecated にする

## Considerations

- **エッジベース function ノードは段階的に廃止** — decorator で代替。既存データは Phase 4 のマイグレーションで変換
- **decorator の適用順序** — 配列順で上から適用。UI 上で並べ替え可能にする
- **repeat decorator + エッジベース repeat の重複** — 両方あった場合は decorator が先に適用される（乗算ではなく上書き）
- **undo 対応** — attach/detach は `pushUndo()` で元に戻せるようにする
- **モバイル** — スナップはドラッグ距離で判定。タッチでも同じ閾値

## Future Extensions

- decorator のプリセット（「ブレイクダウン」= Tempo -20 + FX verb on）
- パターンノードの右クリックメニューから直接 decorator 追加
- decorator の色分け（type ごとに既存カラーパレットを活用: transpose=olive, tempo=blue, fx=salmon）
- スナップ中のプレビュー影（function ノードがパターンに近づくと半透明のゴースト decorator が表示される）
