# ADR 117: Generative UX Simplification

## Status: Proposed

## Context

Generative ノード（Turing / Quantizer / Tonnetz）は強力だが、現状の UX では「繋いだら何が起きるか分からない」状態になっている。

**問題点:**

1. **繋いだだけでは何も起きない**: エッジ接続は topology のみ。GEN ボタンを押すまで結果が見えない → 「何のために繋いだの？」
2. **target track が不明瞭**: 1 ノードにつき 1 track しか対象にできないが、どの track に効いてるか faceplate から読み取れない
3. **merge mode が直感的でない**: replace / merge / layer の違いが初見で理解できない。特に「layer = 和音追加」は予測困難
4. **複数ノード接続時の混乱**: 同じパターンに Turing × 2 を繋ぐと、同じ track を上書きし合って結果が予測不能
5. **armed generation フロー**: PatternToolbar のスパークルボタンでループ頭に自動生成できるが、この機能の発見性が低い

**現状のフロー:**
```
1. Generative ノード作成
2. パターンノードにエッジ接続
3. DockPanel で target track / merge mode / パラメータ設定
4. GEN ボタン押下 → 初めて結果が見える
5. Scene playback 時は自動で live generation
```

ステップ 3–4 が初心者にとって壁になっている。

## Decision

### 原則: 繋いだら即・効果発動

Generative ノードは**接続した瞬間に結果が見える**べき。設定は後から調整。

### Phase 1: Auto-generate on Connect

#### エッジ接続時の自動生成

`sceneAddEdge()` でエッジを作成した際、source が generative ノードで target が pattern ノードなら、自動で `sceneGenerateWrite()` を実行する。

```
現状:
  connect → (nothing) → manual GEN → see result

改善:
  connect → auto generate → see result immediately
```

- `sceneAddGenerativeNode()` でノード作成 + エッジ接続時にも自動生成
- 既存の GEN ボタンは「再生成」として残す（パラメータ変更後に使う）
- undo は接続 + 生成をまとめて 1 アクション

#### パラメータ変更時の自動再生成

DockPanel で generative パラメータを変更したら、自動で再生成する:

- デバウンス 300ms（knob ドラッグ中に毎回生成しない）
- `seed` 固定時のみ即再生成（結果が決定的だから）
- `seed` なしの場合はパラメータ変更で再生成するとランダム結果が変わるため、任意（ユーザー設定可能）

### Phase 2: Target Track の可視化と簡略化

#### Faceplate に target track 表示

Generative ノードの faceplate に対象 track 名を表示する:

```
┌─ Turing Node ──────────┐
│ ■ □ ■ ■ □              │
│ TM 8×0.5    → KICK     │  ← target track name
│ [GEN]                   │
└─────────────────────────┘
```

#### 1 パターン 1 generative（推奨）

- 同じ pattern に複数の generative ノードを繋ぐことは許可するが、target track が重複する場合は警告表示
- 初回接続時の target track はパターンの最初の空き track を自動選択（現状は `ui.selectedTrack`）

### Phase 3: Merge Mode の簡略化

現状の 3 モードを 2 モードに削減:

| 現状 | 改善 | 理由 |
|------|------|------|
| replace | **書き換え** | そのまま。デフォルト |
| merge | **追記** | 空きステップのみ埋める |
| layer | 削除 | 和音追加は P-Lock で十分。使用頻度が極めて低い |

- デフォルトは「書き換え」（一番予測しやすい）
- DockPanel のトグルは 2 ボタンに簡略化

## Implementation

### Changed Files

| File | Changes |
|------|---------|
| `sceneActions.ts` | `sceneAddEdge()` に auto-generate、パラメータ変更時の再生成 |
| `SceneView.svelte` | エッジ接続後の自動生成フロー |
| `DockGenerativeEditor.svelte` | パラメータ変更のデバウンス再生成、target track 表示、merge mode 2択 |
| `scenePlayback.ts` | 変更なし（live mode は現状のまま） |

### Phasing

- **Phase 1**: auto-generate on connect + パラメータ変更再生成 — 即効性のある改善
- **Phase 2**: target track 可視化 — 理解しやすさの向上
- **Phase 3**: merge mode 簡略化 — 認知負荷の削減

## Considerations

- **Auto-generate のパフォーマンス**: 生成自体は軽量（数ms）。UI 更新のコストが支配的だが、1 回の生成なら問題ない
- **Undo の粒度**: 接続 + 生成を 1 undo にまとめることで「繋いだのを外す」だけで元に戻る
- **layer モード削除の影響**: 既存の song データで `mergeMode: 'layer'` を持つノードは `'replace'` にフォールバック
- **Quantizer の特殊性**: Quantizer は入力 trigs を変換するノードであり、単体では生成しない。Turing → Quantizer → Pattern のチェーンでは、接続完了時（最後のエッジ接続時）に自動生成すべき

## Future Extensions

- Generative ノードのプレビュー音再生（接続前に「こんな音が出る」を試聴）
- Drag-and-drop で generative ノードをパターンに直接ドロップ（エッジ不要）
- Generative ノードのパラメータをシーン再生中にリアルタイム変更（ADR 090 worklet 連携）
