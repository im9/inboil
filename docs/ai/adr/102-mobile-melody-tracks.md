# ADR 102: Mobile Melodic Input & Track Management

## Status: Proposed

## Context

Two gaps exist in the mobile experience.

### 1. Piano roll is impractical on mobile
The current PianoRoll renders a 24-row (2-octave chromatic) grid.
On desktop this works fine, but on mobile the cells are too small for reliable
touch input. MobileTrackView shows the PianoRoll under a STEPS / NOTES tab
switcher, yet cannot meet the recommended 44px touch-target size.

### 2. No way to add or remove tracks
Desktop uses DockPanel for track management. `addTrack()` / `removeTrack()`
exist in `stepActions.ts`, but mobile has no UI to invoke them.

## Decision

### A. Scale-filtered PianoRoll (minimal cost)

Add a **scale-filter mode** to the existing PianoRoll component.
Out-of-scale rows are collapsed, cutting the visible row count roughly in half.

```
Chromatic (24 rows)       Scale-filtered (7 rows/oct = 14 rows)
┌─────────────────┐       ┌─────────────────┐
│ B  ░░░░░░░░░░░░ │       │ B  ░░░░░░░░░░░░ │
│ A# ░░░░░░░░░░░░ │       │ A  ░░░░░░░░░░░░ │  ← taller rows
│ A  ░░░░░░░░░░░░ │       │ G  ░░░█░░░░░░░░ │
│ G# ░░░░░░░░░░░░ │       │ F  ░░░░░░░░░░░░ │
│ G  ░░░█░░░░░░░░ │       │ E  ░█░░░░░░░░░░ │
│ F# ░░░░░░░░░░░░ │       │ D  ░░░░░░░░░░░░ │
│ F  ░░░░░░░░░░░░ │       │ C  █░░░░░░░░░░░ │
│ E  ░█░░░░░░░░░░ │       └─────────────────┘
│ D# ░░░░░░░░░░░░ │        Cell height: 9px → ~15px
│ D  ░░░░░░░░░░░░ │        Much easier to tap
│ C# ░░░░░░░░░░░░ │
│ C  █░░░░░░░░░░░ │
└─────────────────┘
```

**Implementation approach:**

1. Change the `NOTES` array derivation — in filter mode, include only notes
   whose pitch class is in `SCALE_DEGREES_SET` (`PianoRoll.svelte:55-56`)
2. Compute cell height dynamically based on row count (replace fixed 9px with
   `gridHeight / filteredNotes.length`)
3. `snapToScale()` works as-is — every visible row is already in-scale
4. `getCellState()` / `noteStartDrag()` are MIDI-note-number-based, no change needed

**Toggle UI:**

```
┌──────────────────────────────────────────┐
│ ✏️ 🧹 ≡ ⋮  [SCALE]   ▲  C4  ▼          │  ← SCALE toggle in brush bar
└──────────────────────────────────────────┘
```

- When `prefs.scaleMode` is ON, mobile defaults to filter mode
- Also available on desktop (grey disabled rows → hidden)
- New state: `ui.scaleFilter: boolean` (persisted in prefs)

### B. Track add / remove

Add a `+` button to MobileTrackView's track-nav area.
Remove via long-press menu or left-swipe with confirmation dialog.

```
┌───────────────────────────────────────┐
│  ◀   O.HH                    ▶   +   │  ← + button added
├───────────────────────────────────────┤
│  ⌗⌗⌗ OPEN HH ▲   16   S   M   RND   │
└───────────────────────────────────────┘
```

**Add flow:**
1. Tap `+` → voice picker (reuse existing MobileParamOverlay voice selection)
2. Select voice → `addTrack(voiceId)` → auto-navigate to new track

**Remove flow:**
1. Long-press track name label → confirmation dialog "Remove {name}?"
2. Confirm → `removeTrack(trackId)`

## Considerations

### Scale filter vs dedicated Grid component

| | Scale filter | Dedicated Grid |
|---|---|---|
| Implementation cost | Low (NOTES array change + CSS) | High (new component) |
| Maintenance | Single PianoRoll component | Dual maintenance |
| Features | Slide / duration / velocity work as-is | Must re-implement |
| Limitation | Cannot input out-of-scale notes while filtered | Same |

Scale filter wins — dramatically lower cost.

### Dynamic cell height

In filter mode the row count drops by more than half, so cell height must change
from the fixed 9px to a dynamic value. Inject via CSS variable on each row:
`style="height: {cellHeight}px"`

### Scale changes

`SCALE_DEGREES` is currently fixed to C major. When `song.rootNote` and scale
type are combined in the future, the filtered note set will change.
PianoRoll's `SCALE_TEMPLATES` table (line 57-68) already supports this, so
it can replace `SCALE_DEGREES_SET` as the filter source.

## Future Extensions

- Scale type selection UI (Dorian, Pentatonic, etc.)
- Mobile landscape support (coordinate with ADR 098)
- Touch gestures: horizontal swipe to scroll step range
- Pinch-to-zoom for octave range
