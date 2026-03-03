# ADR 039: Solo Button

## Status: Proposed

## Context

step sequencer に Mute ボタン (M) は実装済みだが、Solo 機能がない。Solo は特定トラックだけを試聴・確認するための基本的なミキサー機能であり、サウンドデザインやミックスの作業効率に直結する。

### 現状

- `Track.muted: boolean` が pattern に保存され、worklet まで伝播 ([state.svelte.ts:33](src/lib/state.svelte.ts#L33))
- `toggleMute()` で切り替え、undo 対応 ([state.svelte.ts:410-413](src/lib/state.svelte.ts#L410-L413))
- worklet 側で `muteGains[]` による click-free fade を実装 ([worklet-processor.ts:484-488](src/lib/audio/worklet-processor.ts#L484-L488))
- UI: M ボタンが flip-card アニメーションで表示 ([StepGrid.svelte:157-167](src/lib/components/StepGrid.svelte#L157-L167))

## Decision

### 1. State 設計

Solo は**パフォーマンス用の一時状態**であり、pattern に保存しない。`ui` オブジェクトに `soloTracks` を追加する。

```typescript
// state.svelte.ts
export const ui = $state({
  selectedTrack: 0,
  view: 'grid' as 'grid' | 'fx' | 'eq' | 'chain',
  sidebar: null as 'help' | 'system' | null,
  lockMode: false,
  selectedStep: null as number | null,
  soloTracks: new Set<number>(),           // ← 追加
})
```

### 2. Solo ロジック

```typescript
export function toggleSolo(trackId: number) {
  if (ui.soloTracks.has(trackId)) {
    ui.soloTracks.delete(trackId)
  } else {
    ui.soloTracks.add(trackId)
  }
  // Set を差し替えてリアクティビティを発火
  ui.soloTracks = new Set(ui.soloTracks)
}
```

- Solo は undo 対象外（一時的なモニタリング操作のため）
- 複数トラック同時 solo 可能（soloed トラックだけ鳴る）

### 3. Effective Mute 計算

engine.ts の `patternToWorklet()` で solo を考慮した effective mute を計算する。

```typescript
// engine.ts  patternToWorklet()
tracks: pattern.tracks.map((t, i) => ({
  // ...
  muted: ui.soloTracks.size > 0
    ? !ui.soloTracks.has(i)    // solo active → soloed 以外をミュート
    : t.muted,                 // solo inactive → 通常の mute
  // ...
}))
```

- worklet 側の変更は不要（既存の `muteGains[]` fade がそのまま機能する）
- solo 解除時は元の mute 状態に自然に戻る

### 4. UI レイアウト

M ボタンの左に S ボタンを追加する。

```
Desktop (StepGrid):
┌──────────┬────┬──┬──┬─────────────────────────────────────┐
│ KICK     │ 16 │S │M │ □ □ ■ □  □ □ ■ □  □ □ ■ □  □ □ ■ □│
│ DrumSynth│    │  │  │                                     │
├──────────┼────┼──┼──┼─────────────────────────────────────┤
│ SNARE    │ 16 │S̲ │M │ □ ■ □ □  □ ■ □ □  □ ■ □ □  □ ■ □ □│  ← S̲ = soloed (active)
│ DrumSynth│    │  │  │                                     │
└──────────┴────┴──┴──┴─────────────────────────────────────┘
```

```svelte
<!-- Solo button (StepGrid.svelte, before Mute button) -->
<button
  class="btn-solo flip-host"
  onpointerdown={() => toggleSolo(trackId)}
  data-tip="Solo/unsolo track" data-tip-ja="トラックをソロ"
>
  <span class="flip-card" class:flipped={ui.soloTracks.has(trackId)}>
    <span class="flip-face solo-off">S</span>
    <span class="flip-face back solo-on">S</span>
  </span>
</button>
```

### 5. スタイリング

既存の M ボタンと同サイズ・同構造。Solo active 時はアクセントカラーで視認性を高める。

```css
.btn-solo {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 0;
  perspective: 60px;
}
.solo-off {
  border: 1px solid var(--color-fg);
  background: transparent;
  color: var(--color-fg);
  font-size: 9px;
}
.solo-on {
  border: 1px solid var(--color-olive);
  background: var(--color-olive);
  color: var(--color-bg);
  font-size: 9px;
}
```

Solo active 時、他トラックの steps 領域にも muted と同様の dimmed 表示を適用する：

```css
.track-row.solo-muted .steps {
  opacity: 0.35;
}
```

### 6. Mobile 対応

[MobileTrackView.svelte](src/lib/components/MobileTrackView.svelte) では TrackSelector でトラック切り替えを行うため、solo ボタンの配置は TrackSelector の各トラックボタンに long-press で solo トグルを追加する、あるいはヘッダー部分に S ボタンを配置する。

### 7. 実装ステップ

1. `ui.soloTracks` と `toggleSolo()` を state.svelte.ts に追加
2. engine.ts の `patternToWorklet()` で effective mute を計算
3. StepGrid.svelte に S ボタンを追加（M ボタンの左）
4. CSS スタイリング（solo-on/off, solo-muted dimming）
5. MobileTrackView に solo 対応を追加
6. `sendPattern()` の effect 依存に `ui.soloTracks` を追加（solo 変更時に worklet へ再送）

## Considerations

- **Solo は pattern に保存しない**: mute は楽曲の一部（意図的な消音）だが、solo はモニタリング用の一時操作。pattern 切り替え時に solo 状態をリセットするかどうかは要検討
- **Undo 対象外**: solo は一時的な操作であり、undo 履歴を汚さない
- **リアクティビティ**: `Set` は Svelte 5 の `$state` でそのまま追跡されないため、差し替え (`new Set(...)`) でトリガーする
- **Exclusive solo**: 現状は複数 solo 可能だが、将来的に Shift+click で exclusive solo（他の solo を解除して 1 つだけ solo）を追加可能

## Future Extensions

- **Exclusive solo**: Shift+S で排他ソロ（そのトラックだけを solo、他を解除）
- **Solo in chain view**: pattern chain 再生中の solo 対応
- **Solo indicator in mixer**: 将来の mixer view で solo 状態を表示
