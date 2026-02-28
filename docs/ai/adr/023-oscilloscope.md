# ADR 023 — Oscilloscope Display

## Status: Implemented

## Context

現在 inboil にはリアルタイムの波形表示がない。
FilterView (EQ) では周波数スペクトルをドットマトリクスで表示しているが、
時間領域の波形（オシロスコープ）は未実装。

オシロスコープはシンセの音色変化を視覚的に把握でき、
パラメータ調整のフィードバックとして非常に有効。
ハードウェアグルーブボックス（Elektron Digitakt II, Teenage Engineering OP-1）
でも定番の機能。

## Decision

### データソース

既存の `AnalyserNode`（engine.ts で作成済み）から時間領域データを取得する。

```typescript
// 既存: engine.ts
this.analyser = this.ctx.createAnalyser()
this.analyser.fftSize = 1024
this.node.connect(this.analyser)
this.analyser.connect(this.ctx.destination)
```

オシロスコープ用:
```typescript
const buf = new Uint8Array(analyser.fftSize)
analyser.getByteTimeDomainData(buf)
// buf[i] = 0–255, 128 = 0V (無音)
```

マスター出力のみ表示（per-track は将来拡張）。

### UI 配置: app-header 背景

app-header（INBOIL ロゴバー）の背景に `position: absolute` で波形を重ねる。
従来の装飾要素（geo-circle）を置き換え、機能的かつビジュアルな背景に。

```
┌─────────────────────────────────┐
│  INBOIL ～～wave～～        ⚙   │  ← app-header (40px / compact 32px)
├─────────────────────────────────┤
│  120 BPM  ▶ ■ RAND  PAT 00    │  ← sub-header
├─────────────────────────────────┤
│  (grid / fx / eq)               │
└─────────────────────────────────┘
```

- app-header 内に `<Oscilloscope />` を absolute overlay として配置
- `pointer-events: none` でロゴ・ボタン操作を妨げない
- 波形は `rgba(237,232,220,0.2)` で UI テキストの背景として馴染む
- モバイル / デスクトップ共通（AppHeader は両方で使用）

### 描画実装

Canvas 2D でシンプルな波形ラインを描画する（FxPad と同じパターン）。

```typescript
function drawScope(ctx: CanvasRenderingContext2D, data: Uint8Array, w: number, h: number) {
  ctx.clearRect(0, 0, w, h)
  ctx.beginPath()
  const sliceW = w / data.length
  for (let i = 0; i < data.length; i++) {
    const v = data[i] / 128.0   // 0–2, center = 1
    const y = (v * h) / 2
    if (i === 0) ctx.moveTo(0, y)
    else ctx.lineTo(i * sliceW, y)
  }
  ctx.strokeStyle = 'rgba(237, 232, 220, 0.6)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}
```

`requestAnimationFrame` ループで毎フレーム更新。
再生停止時はフラットライン（128 = 0V）を表示。

### 視覚スタイル

- 波形線: クリーム色 (`rgba(237, 232, 220, 0.2)`) — 背景として馴染む透明度
- ゼロクロッシング検出で波形表示を安定化
- DPR 対応 Canvas（Retina 対応）

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/components/Oscilloscope.svelte` | **新規** — Canvas ベースのスコープコンポーネント（absolute overlay） |
| `src/lib/components/AppHeader.svelte` | app-header 内にスコープ配置、geo-circle 削除、高さ 28→40px に拡大 |

- `engine.ts` — 変更不要（既存の `getAnalyser()` をそのまま利用）
- `worklet-processor.ts` — 変更不要（AnalyserNode は AudioContext 側）
- `MobileTrackView.svelte` — 変更不要
- `StepGrid.svelte` — 変更不要

### パフォーマンス考慮

- `getByteTimeDomainData` は軽量（FFT 不要、バッファコピーのみ）
- Canvas 描画は 1 パスの `lineTo` のみ — FxPad より低負荷
- rAF ループは既に FxPad / FilterView で使用しており追加コストは最小
- 停止中は描画スキップで CPU 節約

## Verification

1. 再生中 → マスター出力の波形がリアルタイム表示される
2. キック単独 → 明確なトランジェント波形
3. パラメータ変更 → 波形の変化が即座に反映
4. 再生停止 → フラットライン
5. モバイルでスムーズに 60fps 描画

## Future Extensions

- **Per-track スコープ**: 選択トラックの出力だけ表示
- **Lissajous (X-Y) モード**: ステレオ L/R を X/Y にマッピング
- **Freeze/Hold**: タップで波形を一時停止して観察
- **トリガー同期**: ゼロクロッシングでトリガーしてステーブルな表示
