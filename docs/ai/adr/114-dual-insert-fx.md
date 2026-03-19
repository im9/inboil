# ADR 114: Dual Insert FX Chain

## Status: Proposed

## Context

現在 1 トラックにつき Insert FX は 1 スロットのみ（ADR 077）。FX タイプは verb / delay / glitch の 3 種で、`CellInsertFx` として `Cell` に格納される。

1 スロットだと組み合わせの面白さが出ない — Delay → Bitcrush、Reverb → Delay 等のチェーンは音作りの基本。ハードウェアの先例：

- **Elektron Digitakt/Syntakt**: 2 insert per track（固定スロット）
- **Roland SP-404**: 1 insert + master
- **Ableton Push**: 無制限チェーン（PC パワー前提）

CPU バジェットを考慮すると、Elektron 方式の **2 スロット固定** が最適。上限が決まるため DSP のリソース予測が立つ。

### 現在のコード構造

- `CellInsertFx` — `src/lib/types.ts:24` — 単一 FX スロット型
- `Cell.insertFx?: CellInsertFx` — `src/lib/types.ts:51` — 単一オプショナル
- `InsertFxSlot` — `worklet-processor.ts:121` — DSP 側の単一スロット
- `insertSlots: (InsertFxSlot | null)[]` — トラックごとに 1 スロット
- `_processInsert(slot, inL, inR)` — 単一スロット処理
- `engine.ts:502` — `patternToWorklet` で `cell.insertFx` → `WorkletInsertFx` に変換

## Decision

### 1. データモデル

`Cell.insertFx` を単一オブジェクトから **2 要素固定配列** に変更：

```typescript
// types.ts
export interface Cell {
  // ...
  insertFx?: [CellInsertFx | null, CellInsertFx | null]  // slot 0 → slot 1 (serial chain)
}
```

`CellInsertFx` 型自体は変更なし。スロットが `null` ならバイパス。

### 2. WorkletTrack

```typescript
// dsp/types.ts
export interface WorkletTrack {
  // ...
  insertFx?: [WorkletInsertFx | null, WorkletInsertFx | null]
}
```

### 3. DSP（worklet-processor.ts）

`insertSlots` を 2 次元化：

```typescript
private insertSlots: [InsertFxSlot | null, InsertFxSlot | null][] = []
```

処理はシリアルチェーン：

```typescript
// slot 0 の出力が slot 1 の入力
for (const slot of this.insertSlots[t]) {
  if (slot) { const io = this._processInsert(slot, sL, sR); sL = io[0]; sR = io[1] }
}
```

### 4. engine.ts（patternToWorklet）

```typescript
insertFx: cell.insertFx ? [
  cell.insertFx[0]?.type ? serializeInsertFx(cell.insertFx[0]) : null,
  cell.insertFx[1]?.type ? serializeInsertFx(cell.insertFx[1]) : null,
] : undefined,
```

共通の `serializeInsertFx()` ヘルパーを抽出。

### 5. stepActions.ts

スロットインデックスを引数に追加：

```typescript
export function setInsertFxType(trackId: number, slot: 0 | 1, type: ...)
export function setInsertFxFlavour(trackId: number, slot: 0 | 1, flavour: string)
export function setInsertFxParam(trackId: number, slot: 0 | 1, param: 'mix' | 'x' | 'y', v: number)
```

### 6. UI（DockTrackEditor.svelte）

2 スロットを縦に並べる：

```
┌─────────────────────────────────┐
│ INSERT FX                       │
├─────────────────────────────────┤
│ [1] [REVERB ▾] [Room ▾]        │
│     MIX ○  SIZE ○  DAMP ○      │
├─────────────────────────────────┤
│ [2] [DELAY ▾]  [Tape ▾]        │
│     MIX ○  TIME ○  FB ○        │
└─────────────────────────────────┘
```

- スロット番号 `[1]` `[2]` をラベル表示
- 各スロット独立で type / flavour / params を設定
- 両方 OFF なら折りたたんで 1 行のみ表示（Dock スクロール対策）
- 信号フロー: Voice → Slot 1 → Slot 2 → Send/Mix

### 7. マイグレーション

既存の `cell.insertFx` (単一オブジェクト) を `[existingFx, null]` に変換：

```typescript
// restoreSong or validate
if (cell.insertFx && !Array.isArray(cell.insertFx)) {
  cell.insertFx = [cell.insertFx as CellInsertFx, null]
}
```

`validateSongData()` にも配列チェックを追加。

### 8. 実装フェーズ

**Phase 1: データ + DSP**
- `CellInsertFx` 配列化、`WorkletTrack` 更新
- `worklet-processor.ts` のシリアルチェーン処理
- `engine.ts` の serialize 更新
- マイグレーション + validation
- 既存テスト修正

**Phase 2: UI**
- DockTrackEditor の 2 スロット表示
- スロット折りたたみ（OFF 時）
- StepGrid の insert-dot 表示更新（2 つのドットにする？）

## Considerations

- **CPU**: 最悪ケースは全トラック × 2 スロット = 16 FX インスタンス。現在の verb/delay/glitch はいずれも軽量なので問題ないが、将来重い FX を追加する場合は注意
- **3 スロット以上**: 2 で十分。3 つ以上は diminishing returns で UI 複雑度だけ上がる
- **P-Lock**: Insert FX パラメータの P-Lock は現在未対応。将来的にスロットごとの P-Lock を検討可能だが、この ADR のスコープ外
- **並列 vs 直列**: 直列（シリアル）チェーンのみ。並列ルーティングは複雑度が跳ね上がるため見送り

## Future Extensions

- Insert FX パラメータの P-Lock 対応
- FX タイプ追加（chorus、phaser、EQ 等）
- ドラッグでスロット順序入れ替え
- Dock panel phase 2 との統合（折りたたみセクション）
