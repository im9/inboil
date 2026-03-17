# ADR 110: Per-Cell Sample References

## Status: Proposed

## Context

現在サンプルは **Track 単位でグローバル** に格納されている（`samplesByTrack[trackId]`）。Cell（パターン×トラック）は `voiceId` や `voiceParams` をパターンごとに持てるが、サンプルだけは全パターンで共有される。

### 問題

パターンごとに異なる楽器（`voiceId`）を割り当てられる仕様なのに、Sampler トラックのサンプルだけ全パターンで同一になるのは不整合。例えば Pattern 0 で Kick、Pattern 1 で Clap を同じトラックスロットに割り当てたい場合、現状では別トラックを使うしかない。

### 現状のデータフロー

```
UI (DockTrackEditor)
  → setSample(trackId, name, waveform, rawBuffer)
  → samplesByTrack[trackId] = { name, waveform, rawBuffer }   ← グローバル
  → IDB key: `${projectId}_${trackId}`

Engine (_autoLoadSamples)
  → trackId ベースで userSamples / packZones をキャッシュ
  → パターン切替時にボイス再送
```

### 関連ファイル

| ファイル | 役割 |
|---------|------|
| `src/lib/types.ts:33-46` | Cell interface（sample 情報なし） |
| `src/lib/state.svelte.ts:647-701` | samplesByTrack, setSample, restoreSamples |
| `src/lib/audio/engine.ts:62-137` | userSamples/packZones キャッシュ, _autoLoadSamples |
| `src/lib/storage.ts:18-149` | StoredSample (key: `${projectId}_${trackId}`) |
| `src/lib/components/DockTrackEditor.svelte:75-80` | サンプル読み込み UI |

## Decision

### A. Cell に sampleRef を追加

```typescript
// types.ts
export interface CellSampleRef {
  name: string         // 表示名（ファイル名 or パック名）
  packId?: string      // factory pack → pool から再生成（buffer 不要）
  // rawBuffer は IDB に保存、メモリには持たない
}

export interface Cell {
  // ... existing fields ...
  sampleRef?: CellSampleRef  // undefined = no sample assigned
}
```

サンプルの実データ（rawBuffer / waveform）は引き続きメモリ＋IDB で管理。`sampleRef` はあくまで「どのサンプルを使うか」の参照のみ。

### B. IDB キーを Cell 単位に変更

```typescript
// storage.ts
export interface StoredSample {
  key: string          // `${projectId}_${trackId}_${patternIndex}`
  projectId: string
  trackId: number
  patternIndex: number // 新規
  name: string
  buffer: ArrayBuffer
  createdAt: number
  packId?: string
}
```

同一サンプルを複数 Cell で参照する場合は IDB に重複保存（dedup は将来の最適化）。

### C. samplesByTrack → samplesByCell に移行

```typescript
// state.svelte.ts

// キー: `${trackId}_${patternIndex}`
export const samplesByCell = $state<Record<string, SampleMeta>>({})

function sampleKey(trackId: number, patternIndex: number): string {
  return `${trackId}_${patternIndex}`
}

export function setSample(
  trackId: number, patternIndex: number,
  name: string, waveform: Float32Array, rawBuffer: ArrayBuffer
): void {
  const key = sampleKey(trackId, patternIndex)
  samplesByCell[key] = { name, waveform, rawBuffer }
  // IDB persist ...
}
```

### D. Engine のサンプルキャッシュ

```typescript
// engine.ts
// キャッシュキーを trackId → `${trackId}_${patternIndex}` に変更
private userSamples: Map<string, { mono: Float32Array; sampleRate: number }> = new Map()
private packZones:   Map<string, PackZoneData[]> = new Map()
```

`_autoLoadSamples` はパターン切替時に、現パターンの Cell.sampleRef に基づいて正しいサンプルをワークレットに送信。同一サンプルが既にロード済みなら再送をスキップ（`name` + `packId` の一致で判定）。

### E. マイグレーション

既存プロジェクトの `samplesByTrack` は全パターンで同じサンプルを参照している前提なので、ロード時に自動変換:

```typescript
// restoreSamples() 内
// 旧キー (projectId_trackId) → 新キー (projectId_trackId_patternIndex)
// trackId を含む全パターンの Cell に sampleRef をコピー
for (const pat of song.patterns) {
  for (const cell of pat.cells) {
    if (cell.trackId === storedSample.trackId && cell.voiceId === 'Sampler') {
      cell.sampleRef = { name: storedSample.name, packId: storedSample.packId }
    }
  }
}
```

旧形式の IDB エントリは読み込み後に新形式で再保存し、旧キーを削除。

### F. エクスポート / インポート

v2 エクスポート（今回追加済み）の `samples` フィールドを Cell 単位に拡張:

```typescript
// 旧: samples: { [trackId]: { name, packId?, buffer? } }
// 新: samples: { [`${trackId}_${patternIndex}`]: { name, packId?, buffer? } }
```

v2 インポート時は旧形式（trackId のみ）を検出して全パターンに展開。

### G. 実装フェーズ

**Phase 1: データモデル + IDB**
- Cell に `sampleRef` 追加
- `samplesByCell` 導入、`samplesByTrack` 非推奨化
- IDB キー変更 + マイグレーション
- `validateSongData` に `sampleRef` スキーマ追加

**Phase 2: Engine + UI**
- Engine キャッシュを Cell 単位に変更
- `_autoLoadSamples` をパターン切替対応
- DockTrackEditor の setSample を `(trackId, patternIndex)` に更新
- サンプル波形表示を Cell 単位に

**Phase 3: エクスポート + 最適化**
- エクスポートフォーマット v3 (cell 単位 samples)
- 同一サンプルの重複送信回避（ハッシュベース dedup）
- パターン間サンプルコピー UI

## Considerations

- **メモリ**: 同一サンプルを N パターンで使うと N 倍の IDB 容量。ただし実際にはパターン数は 8-16 で、サンプルは 50-500KB 程度なので問題にならない。将来 content-hash による dedup で最適化可能。
- **ワークレットへの送信遅延**: パターン切替のたびにサンプル再送が必要になる可能性がある。Engine 側でキャッシュヒット判定を入れることで、同一サンプルなら再送スキップ。
- **既存プロジェクト互換性**: 旧 IDB キー (`projectId_trackId`) からの自動マイグレーションで透過的に移行。ユーザー操作不要。
- **factory pack**: `packId` 参照のみ保存するので Cell 単位になっても容量増加はほぼゼロ。

## Future Extensions

- サンプル dedup（content-hash ベースで同一バッファを一度だけ保存）
- パターン間サンプルコピー（Cell ごとドラッグ＆ドロップ）
- Cell 単位のサンプルチェーン（A/B スイッチ）
- Sampler 以外の voice でもパターン固有パラメータの拡張（FM/WT のウェーブテーブル選択など）
