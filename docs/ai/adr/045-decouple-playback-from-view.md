# ADR 045 — Decouple Playback from View Mode

| field   | value                    |
| ------- | ------------------------ |
| status  | proposed                 |
| date    | 2025-03-05               |
| parent  | ADR 044 (Scene Graph)    |

## Context

Currently `ui.phraseView` controls **both** which editor is visible and whether
scene-graph advancement runs. The guard in `App.svelte` line 51:

```ts
if (ui.phraseView !== 'scene') return
```

means switching to Grid or Tracker **silences the arrangement engine** and falls
back to looping the current pattern. This produces two problems:

1. **View switch changes audio** — users cannot watch the Grid while listening to
   a scene arrangement.
2. **Mental model mismatch** — the arrangement is "on" or "off" based on which
   tab you clicked, not an explicit transport control.

## Decision

Separate the concept of **playback mode** (what drives pattern advancement) from
**view mode** (which editor is rendered).

### New state: `playback.mode`

```ts
export const playback = $state({
  // ...existing fields...
  mode: 'loop' as 'loop' | 'scene',
})
```

| mode    | behaviour                                                           |
| ------- | ------------------------------------------------------------------- |
| `loop`  | Loop `ui.currentPattern` endlessly (current Grid/Tracker behaviour) |
| `scene` | Scene graph drives advancement; `ui.currentPattern` syncs to the currently-playing pattern |

### How mode is set

- When the user presses **Play** (or the transport is already playing):
  - If `song.scene` has a root node → `playback.mode = 'scene'`
  - Otherwise → `playback.mode = 'loop'`
- An explicit **SCENE ON/OFF** toggle in PerfBar allows overriding:
  - Toggle ON  → `playback.mode = 'scene'` (only enabled when root exists)
  - Toggle OFF → `playback.mode = 'loop'`
- Switching `ui.phraseView` between grid / tracker / scene does **not** change
  `playback.mode`.

### Changes to `onStep` callback

```ts
// Before
if (ui.phraseView !== 'scene') return

// After
if (playback.mode !== 'scene') return
```

Same guard, different source of truth.

### Changes to `sendPattern` effect

```ts
// Before
} else if (ui.phraseView === 'scene' && hasScenePlayback()) {

// After
} else if (playback.mode === 'scene' && hasScenePlayback()) {
```

### Grid / Tracker: playing-pattern indicator

When `playback.mode === 'scene'` and the user is in Grid/Tracker view, the
engine advances patterns automatically. The view must reflect which pattern is
playing:

- `ui.currentPattern` is already synced by `startSceneNode()` during
  advancement, so Grid/Tracker will naturally update.
- Add a small **"now playing" badge** (pattern name + blinking dot) to the
  PerfBar or StepGrid header so the user knows the pattern is changing
  under them.
- If the user manually selects a different pattern while scene plays, that
  becomes an **editing detour** — playback continues in the background, and the
  view shows the manually-selected pattern. On next beat boundary the
  view snaps back to the playing pattern.

### Editing detour semantics

| state | `ui.currentPattern` | displayed pattern | advancing pattern |
|-------|--------------------|--------------------|-------------------|
| normal | = playing pattern | playing pattern | playing pattern |
| detour | ≠ playing pattern | user-selected | scene-driven (hidden) |

To implement this cleanly, add `playback.playingPattern: number | null`:

```ts
export const playback = $state({
  // ...
  playingPattern: null as number | null,  // scene-driven, null when mode=loop
})
```

- Scene advancement writes to `playback.playingPattern`.
- Grid/Tracker read from `ui.currentPattern` (for editing).
- When the user has not manually overridden, `ui.currentPattern` tracks
  `playback.playingPattern` automatically.
- PerfBar shows `playback.playingPattern` when it differs from
  `ui.currentPattern` ("editing PAT 03 — playing PAT 07").

## Scope

- `state.svelte.ts`: add `playback.mode`, `playback.playingPattern`
- `App.svelte`: replace `ui.phraseView` guards with `playback.mode`
- `PerfBar.svelte`: add SCENE ON/OFF toggle + now-playing indicator
- `StepGrid.svelte` / `TrackerView.svelte`: optional playing-pattern badge
- No changes to Scene data model, SceneView, or MatrixView

## Consequences

- **Pro**: Users can arrange in Scene view, then switch to Grid to fine-tune a
  pattern — all while the arrangement keeps playing.
- **Pro**: Explicit `playback.mode` makes the mental model clearer.
- **Pro**: Small, surgical change — no data model migration needed.
- **Con**: "Editing detour" adds a new concept; needs clear visual feedback.
- **Con**: If a user edits a pattern while it is playing in scene mode, live
  edits are heard immediately (same as current behaviour, but now more
  likely to happen).

## Open questions

- Should the SCENE toggle persist across stop/play, or auto-engage when a root
  exists? Leaning toward auto-engage with manual override.
- Linear section fallback (`advanceSection`) — keep as-is for now; address in a
  future ADR that consolidates sections into the scene graph (option A).
