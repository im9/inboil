# ADR 065: Sampler Chop & Timestretch

## Status: Proposed

## Context

ADR 012 で実装された `SamplerVoice` は基本的なサンプル再生（start/end, reverse, pitch shift）をサポートしているが、ブレイクビーツやループ素材を活用するための chop（スライス再生）と timestretch（テンポ同期）機能がない。

現状の `SamplerVoice`（`voices.ts:1034`）:
- `start` / `end` パラメータで再生範囲を手動指定
- `rate` はピッチシフト + サンプルレート補正のみ（速度とピッチが連動）
- ループ再生なし（カーソルが end に到達したら停止）

ブレイクビーツの chop や、BPM に同期したループ再生は groovebox の基本機能であり、段階的に実装する。

## Decision

### Phase 1: Chop（スライス再生）

ノート番号でスライス位置を自動マッピングし、ブレイクビーツを鍵盤で叩けるようにする。

**DSP 変更（`SamplerVoice`）:**

```
新パラメータ:
  chopSlices: 0 (= OFF), 8, 16, 32   // step: 8
  chopMode:   0 = NOTE-MAP, 1 = SEQ   // step: 1
```

- `chopSlices > 0` のとき、バッファを等分割しスライス境界を計算
- **NOTE-MAP モード**: `noteOn(note)` → `sliceIndex = (note - rootNote) % chopSlices` → 対応スライスの start/end を自動設定して再生
- **SEQ モード**: `noteOn` のたびに次のスライスへ順送り（リトリガー型）。パターンの各ステップが順番にスライスを再生
- 手動 `start` / `end` パラメータはスライス範囲のオフセットとして機能（微調整用）

**UI 変更（`DockPanel`）:**

```
┌─────────────────────────────┐
│ [LOAD]  breakbeat.wav       │
│ ┌─────────────────────────┐ │
│ │▁▂▅█▇▃▁▂▄█▆▃▁▃▆█▅▂▁▂▅█▇│ │  ← waveform + slice lines
│ └─────────────────────────┘ │
│ CHOP [8] [16] [32] [OFF]   │  ← slice count selector
│ MODE [MAP] [SEQ]            │  ← chop mode toggle
└─────────────────────────────┘
```

- 波形キャンバスにスライス分割線を描画（`drawWaveform` を拡張）
- スライス数ボタンは既存の `btn-toggle` スタイルを流用

**paramDefs 追加:**

```typescript
{ key: 'chopSlices', label: 'CHOP', group: 'sample', tip: 'Slice count: OFF/8/16/32', min: 0, max: 32, step: 8, default: 0 },
{ key: 'chopMode',   label: 'MODE', group: 'sample', tip: 'Chop: NOTE-MAP / SEQ',     min: 0, max: 1,  step: 1, default: 0 },
```

### Phase 2: Repitch BPM Sync

ピッチを変えて（Ableton の Repitch モード相当）サンプルをテンポに合わせる。最もシンプルな timestretch。

**DSP 変更:**

```
新パラメータ:
  sampleBPM:  0 (= OFF), 60–200    // サンプル元BPM
  loopMode:   0 = ONE-SHOT, 1 = LOOP
```

- `sampleBPM > 0` のとき、`rate = (currentBPM / sampleBPM) * srRatio` で再生速度を自動計算
- ピッチも変わる（速くすれば高くなる）— ドラムループでは自然に聞こえる
- `loopMode = LOOP` でカーソルが end に到達したら start に戻る
- worklet から `SamplerVoice` に現在の BPM を伝える仕組みが必要（`setBPM(bpm)` メソッド追加）

**BPM 検出（stretch goal）:**

- サンプル読み込み時にオンセット検出 → テンポ推定（main thread で計算、worklet に送信）
- 精度が低い場合は手動 BPM 入力にフォールバック

### Phase 3: WSOLA Timestretch

ピッチを維持したままテンポ同期する本格的な timestretch。

**アルゴリズム: WSOLA (Waveform Similarity Overlap-Add)**

```
Input buffer → Analysis frames (hop = N samples)
                ↓
          Cross-correlation で最適オーバーラップ位置を探索
                ↓
          Overlap-add で出力合成
                ↓
Output buffer (different length, same pitch)
```

- Phase Vocoder（FFT ベース）より計算コストが低く、ドラム素材でのアーティファクト（フェージング）が少ない
- 既存の `GranularProcessor`（`effects.ts:167`）とは目的が異なる（エフェクト vs 正確なテンポ同期）ため別実装
- パラメータ: window size (~50ms), overlap ratio (0.5–0.75)
- リアルタイム処理: `tick()` 内で WSOLA フレームをインクリメンタルに生成

**新パラメータ:**

```
stretchMode: 0 = REPITCH, 1 = WSOLA   // Phase 2 の repitch と切り替え
```

## Considerations

- **Phase 1 の chop は P-Lock と組み合わせると強力**: ステップごとに `chopSlices` や `start` を P-Lock すれば、1トラックで複雑なブレイクビーツ・パターンが作れる
- **等分割 vs transient 検出**: Phase 1 は等分割のみ。Transient 検出はアルゴリズムの複雑さと精度のバランスが難しく、後回しにする
- **WSOLA の計算コスト**: AudioWorklet 内でクロスコリレーションを毎フレーム実行する必要がある。window size を固定（2048 samples）にすれば十分軽量
- **メモリ**: WSOLA は出力バッファが必要だが、1フレーム分（~4KB）なので問題なし
- **Phase 2 の repitch は Phase 3 完成後も残す**: ドラムループでは repitch の方が自然な場合が多い

## Future Extensions

- Transient 検出によるスマートスライス（等分割ではなくアタック位置で分割）
- スライス位置の手動ドラッグ編集（波形 UI 上で分割線を移動）
- サンプルプール（ADR 012 Option B）との統合 — 複数トラックでサンプル共有
- Slice-to-MIDI: chop したスライスからパターンを自動生成
- Formant preservation（ボーカル素材向け — WSOLA + ピッチシフトの組み合わせ）
