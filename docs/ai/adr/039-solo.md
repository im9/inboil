# ADR 039: Solo Button

## Status: Implemented

## Context

The step sequencer has a Mute button (M) but no Solo function. Solo is a fundamental mixer feature for auditioning specific tracks in isolation, directly improving sound design and mixing workflow.

### Current State

- `Track.muted: boolean` is saved in the pattern and propagated to the worklet ([state.svelte.ts:33](src/lib/state.svelte.ts#L33))
- `toggleMute()` toggles with undo support ([state.svelte.ts:410-413](src/lib/state.svelte.ts#L410-L413))
- Worklet implements click-free fade via `muteGains[]` ([worklet-processor.ts:484-488](src/lib/audio/worklet-processor.ts#L484-L488))
- UI: M button with flip-card animation ([StepGrid.svelte:157-167](src/lib/components/StepGrid.svelte#L157-L167))

## Decision

### 1. State Design

Solo is a **temporary performance state** and is not saved to the pattern. Add `soloTracks` to the `ui` object.

```typescript
// state.svelte.ts
export const ui = $state({
  selectedTrack: 0,
  view: 'grid' as 'grid' | 'fx' | 'eq' | 'chain',
  sidebar: null as 'help' | 'system' | null,
  lockMode: false,
  selectedStep: null as number | null,
  soloTracks: new Set<number>(),           // ← added
})
```

### 2. Solo Logic

```typescript
export function toggleSolo(trackId: number) {
  if (ui.soloTracks.has(trackId)) {
    ui.soloTracks.delete(trackId)
  } else {
    ui.soloTracks.add(trackId)
  }
  // Reassign Set to trigger Svelte reactivity
  ui.soloTracks = new Set(ui.soloTracks)
}
```

- Solo is excluded from undo (temporary monitoring operation)
- Multiple tracks can be soloed simultaneously (only soloed tracks produce sound)

### 3. Effective Mute Calculation

Compute effective mute in `patternToWorklet()` in engine.ts, factoring in solo state.

```typescript
// engine.ts  patternToWorklet()
tracks: pattern.tracks.map((t, i) => ({
  // ...
  muted: ui.soloTracks.size > 0
    ? !ui.soloTracks.has(i)    // solo active → mute non-soloed tracks
    : t.muted,                 // solo inactive → use normal mute state
  // ...
}))
```

- No worklet changes needed (existing `muteGains[]` fade works as-is)
- When solo is released, original mute states naturally restore

### 4. UI Layout

Add an S button to the left of the M button.

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

### 5. Styling

Same size and structure as the existing M button. Accent color when solo is active for visibility.

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

When solo is active, apply dimmed display to non-soloed tracks' step areas (same as muted):

```css
.track-row.solo-muted .steps {
  opacity: 0.35;
}
```

### 6. Mobile Support

In [MobileTrackView.svelte](src/lib/components/MobileTrackView.svelte), tracks are switched via TrackSelector. Solo can be added as a long-press toggle on each track button in the TrackSelector, or as an S button in the header area.

### 7. Implementation Steps

1. Add `ui.soloTracks` and `toggleSolo()` to state.svelte.ts
2. Compute effective mute in `patternToWorklet()` in engine.ts
3. Add S button to StepGrid.svelte (left of M button)
4. CSS styling (solo-on/off, solo-muted dimming)
5. Add solo support to MobileTrackView
6. Add `ui.soloTracks` as a dependency in `sendPattern()` effect (resend to worklet on solo change)

## Considerations

- **Solo is not saved to pattern**: Mute is part of the composition (intentional silencing), but solo is a temporary monitoring operation. Whether to reset solo state on pattern switch is worth considering
- **Excluded from undo**: Solo is a temporary operation and should not pollute the undo history
- **Reactivity**: `Set` is not natively tracked by Svelte 5's `$state`, so reassignment (`new Set(...)`) is needed to trigger updates
- **Exclusive solo**: Currently allows multiple solos; Shift+click exclusive solo (unsolo all others, solo only one) can be added later

## Future Extensions

- **Exclusive solo**: Shift+S for exclusive solo (solo only that track, unsolo all others)
- **Solo in chain view**: Solo support during pattern chain playback
- **Solo indicator in mixer**: Display solo state in a future mixer view
