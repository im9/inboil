# ADR 052 — Scene Free-Floating Labels

| field   | value                              |
| ------- | ---------------------------------- |
| status  | done                               |
| date    | 2026-03-06                         |
| parent  | ADR 044 (Scene Graph)              |

## Context

シーングラフが複雑になると、ノードの集合が何を意味するのかが分かりづらくなる。例えば「intro / verse / chorus」のようなセクション構造のメモや、設計意図をキャンバスに書き残したい。

### 検討した代替案

- **A: ノード紐付きラベル** — `SceneNode.label` フィールドを追加し、各ノードの下にテキスト表示
  - デメリット: パターンノードのダブルタップ（パターン遷移）と編集 UI が競合
- **B: フリーラベル（採用）** — ノードとは独立したテキスト要素をキャンバス上の任意の位置に配置
  - メリット: ノードに依存せず自由に配置・リサイズ可能、付箋感覚で使える

## Decision

### 1. `SceneLabel` インターフェース

```typescript
export interface SceneLabel {
  id: string
  text: string
  x: number       // normalized 0-1
  y: number       // normalized 0-1
  size?: number   // font scale (default 1.0 = 10px, range 0.5-4.0)
}

export interface Scene {
  nodes: SceneNode[]
  edges: SceneEdge[]
  labels: SceneLabel[]   // NEW
}
```

### 2. State functions

- `sceneAddLabel(x, y, text?)` — ラベル追加（spread 代入で Svelte 5 反応性を確保）
- `sceneUpdateLabel(id, text)` — テキスト更新
- `sceneDeleteLabel(id)` — 削除
- `sceneMoveLabel(id, x, y)` — ドラッグ移動
- `sceneResizeLabel(id, delta)` — サイズ変更

### 3. UI

- **作成**: バブルメニューの「T」アイコンから。作成直後に入力モード（`requestAnimationFrame` で遅延セット）
- **表示**: DOM `<span>` 要素、`position: absolute` + `transform: translate(-50%, -50%)`
- **編集**: ダブルタップでインライン `<input>` に切替。Enter/blur で確定、Escape でキャンセル
- **移動**: ドラッグ（pointer capture）
- **リサイズ**: 選択時に右上のハンドルを上下ドラッグ
- **削除**: 選択して Delete キー、または空テキストで blur 時に自動削除しない（明示削除のみ）

### 4. 表示スタイル

```
  ┌──────────┐
  │  LOFI    │  pattern node
  └──────────┘
           intro section    ← free label (independent position)
```

- Font: `var(--font-data)`, `10px * size`
- Color: `rgba(30, 32, 40, 0.35)`, hover で 0.6、selected で 0.7 + outline
- 空テキストは `…` を表示

## Considerations

- **Svelte 5 反応性**: `labels` 配列は `.push()` ではなくスプレッド代入 `[...arr, item]` で更新。ロード時に `labels` が存在しない場合に備えて `?? []` でガード
- **バブルメニュー閉じとフォーカス競合**: `editingLabelId` を `requestAnimationFrame` で遅延セットすることで、バブルメニュー閉じ時の blur → 即削除を回避

## Extends

| ADR | Impact |
|-----|--------|
| 044 (Scene Graph) | `Scene` に `labels` 配列追加。グラフ走査・再生には影響なし |
| 050 (Scene Function Nodes) | バブルメニューに label 項目追加 |
