# ADR 052 — Scene Node Labels

| field   | value                              |
| ------- | ---------------------------------- |
| status  | proposed                           |
| date    | 2026-03-06                         |
| parent  | ADR 044 (Scene Graph)              |

## Context

シーングラフが複雑になると、ノードの集合が何を意味するのかが分かりづらくなる。例えば「intro → verse → chorus」のようなセクション構造や、特定の function node チェーンの意図をメモとして残したい。

現状 `SceneNode` には `id`, `type`, `x`, `y`, `root`, `patternId`, `params` のみがあり、ユーザーが自由にテキストを付与する手段がない。パターンノードはパターン名を表示するが、function ノードは型名 + パラメータ値のみ（`T+5`, `×120` など）。

### 検討した代替案

- **B: 専用メモノード** — 新しいノードタイプ `memo` を追加し、付箋のようにキャンバスに配置。エッジ接続不要。
  - メリット: 既存ノードのデータモデルを変えない
  - デメリット: ノードタイプが増える、グラフ走査時に除外が必要、ノードとの関連付けが曖昧

**A案（採用）** の方が軽量で、ノードとラベルの関係が明確。

## Decision

### 1. `SceneNode` に `label` フィールドを追加

```typescript
export interface SceneNode {
  id: string
  type: 'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx'
  x: number
  y: number
  root: boolean
  patternId?: string
  params?: Record<string, number>
  label?: string           // NEW: user-defined annotation (max ~32 chars)
}
```

- Optional フィールド。未設定時は従来通りの表示
- 全ノードタイプで使用可能（pattern / function 両方）
- 最大文字数の制限は UI 側で実施（32文字程度）

### 2. 表示

ラベルはノード本体の下に小さいテキストで表示:

```
  ┌──────────┐
  │  LOFI    │  ← pattern name (既存)
  └──────────┘
   intro        ← label (新規、薄い色で)

  ┌────────┐
  │ ♫ T+5  │  ← function node
  └────────┘
   key change   ← label
```

- Font: `var(--font-data)`, 8px, `rgba(30, 32, 40, 0.4)`
- ノード中央揃え、`text-overflow: ellipsis`
- Canvas ではなく DOM 要素として描画（ノードの子要素）

### 3. 編集 UI

ダブルタップ（またはダブルクリック）でインライン編集モードに入る:

```
  ┌──────────┐
  │  LOFI    │
  └──────────┘
  [intro_____|]  ← contenteditable or input, auto-focus
```

- 既存のダブルタップ動作（パターン選択 + step sequencer 遷移）と共存が必要
  - **パターンノード**: ダブルタップ → パターン遷移（既存）、ラベル編集は別 UI（コンテキストメニューまたは DockPanel のインプット）
  - **Function ノード**: ダブルタップ → ラベル編集（function ノードには遷移先がないため）
- Enter / blur で確定、Escape でキャンセル
- 空文字列でラベル削除

### 4. State 変更

```typescript
export function sceneUpdateNodeLabel(nodeId: string, label: string): void {
  pushUndo('Update node label')
  const node = song.scene.nodes.find(n => n.id === nodeId)
  if (!node) return
  node.label = label || undefined  // empty string removes label
}
```

### 5. シリアライズ

`clonePattern()` / `structuredClone` 相当で `label` フィールドもコピーされる。既存の save/load は `SceneNode` をそのままシリアライズしているため追加対応不要。

## Implementation Phases

### Phase 1: Data model + display
1. `SceneNode` に `label?: string` を追加
2. `sceneUpdateNodeLabel()` を `state.svelte.ts` に追加
3. SceneView のノード DOM にラベル表示要素を追加
4. CSS スタイリング

### Phase 2: Editing UX
1. Function ノードのダブルタップでインライン編集
2. Pattern ノードのラベル編集 UI（DockPanel 内 or 長押しメニュー）
3. Enter/Escape/blur ハンドリング

## Considerations

- **パターンノードのダブルタップ競合**: 既存のダブルタップはパターン遷移に使用されている。パターンノードのラベル編集は DockPanel のテキスト入力フィールドが最も安全
- **Canvas vs DOM**: ラベルは DOM 要素として実装。Canvas 描画だとテキスト入力のインライン編集が困難
- **モバイル**: ダブルタップでのラベル編集は、長押し（エッジ作成）とのタイミング競合に注意
- **Auto-layout との連携**: `sceneFormatNodes()` はラベルに影響しない（位置のみ変更）

## Extends

| ADR | Impact |
|-----|--------|
| 044 (Scene Graph) | `SceneNode` に `label` フィールド追加。グラフ走査・再生には影響なし |
| 050 (Scene Function Nodes) | Function ノードのラベルはアイコンの下に表示 |
