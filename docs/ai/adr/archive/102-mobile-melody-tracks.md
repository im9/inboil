# ADR 102: Mobile Melodic Input & Track Management

## Status: Implemented

## Context

Two gaps exist in the mobile experience.

### 1. Piano roll is impractical on mobile
The current PianoRoll renders a 24-row (2-octave chromatic) grid.
On desktop this works fine, but on mobile the cells are too small for reliable
touch input. MobileTrackView shows the PianoRoll under a STEPS / NOTES tab
switcher, yet cannot meet the recommended 44px touch-target size.

Even filtering to scale notes only (14 rows) yields ~15px cell height — still
too small. The fundamental problem is that a piano roll maps a continuous
pitch axis to rows, and mobile screens don't have enough vertical space.

### 2. No way to add or remove tracks
Desktop uses DockPanel for track management. `addTrack()` / `removeTrack()`
exist in `stepActions.ts`, but mobile has no UI to invoke them.

## Decision

### A. Pad Grid — Ableton Note / Move style

Replace the mobile NOTES tab with a **pad grid** where each pad represents
one scale note. Inspired by Ableton Note and Ableton Move.

#### Layout

```
┌─────────────────────────────────────────────────────┐
│  STEPS              PADS                            │
├─────────────────────────────────────────────────────┤
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐  ▲    │
│  │ C9 ││ D9 ││ E9 ││ F9 ││ G9 ││ A9 ││ B9 │  │    │
│  └────┘└────┘└────┘└────┘└────┘└────┘└────┘  │    │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐       │
│  │ C8 ││ D8 ││ E8 ││ F8 ││ G8 ││ A8 ││ B8 │       │
│  └────┘└────┘└────┘└────┘└────┘└────┘└────┘       │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐       │
│  │ C7 ││ D7 ││ E7 ││ F7 ││ G7 ││ A7 ││ B7 │       │
│  └────┘└────┘└────┘└────┘└────┘└────┘└────┘       │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐       │
│  │ C6 ││ D6 ││ E6 ││ F6 ││ G6 ││ A6 ││ B6 │       │
│  └────┘└────┘└────┘└────┘└────┘└────┘└────┘       │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐       │
│  │ C5 ││ D5 ││ E5 ││ F5 ││ G5 ││ A5 ││ B5 │       │
│  └────┘└────┘└────┘└────┘└────┘└────┘└────┘       │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐  │    │
│  │ C4 ││ D4 ││ E4 ││ F4 ││ G4 ││ A4 ││ B4 │  ▼    │
│  └────┘└────┘└────┘└────┘└────┘└────┘└────┘       │
├─────────────────────────────────────────────────────┤
│  1  2  3  4  5  6  7  8  9  10  11  12  ...        │
│        ▲ selected step                              │
└─────────────────────────────────────────────────────┘
```

#### Core design

- **7×6 grid** = 42 pads = 6 octaves of scale notes displayed at once
- 1 row = 1 octave (7 scale notes), bottom row = lowest octave
- Scale-locked: pads show in-scale notes from `SCALE_TEMPLATES[song.rootNote]`
- Pad size: width ÷ 7 ≈ 50px+, height = available space ÷ 6 ≈ 80px
- Octave shift via ▲▼ buttons (right edge) sharing `vkbd.octave` with desktop PianoRoll
- Full range: `vkbd.octave` 2–7, shifting the 6-octave window to cover all MIDI notes accessible on desktop

#### Input flow

1. **Select step** — tap a step in the step ribbon (or auto-advance)
2. **Tap pad** — toggles that note on the selected step
   - First tap: add note (uses current velocity)
   - Tap again: remove note
3. **Step auto-advance** — after adding a note, advance to next step (opt-in via toggle)
4. **Multi-note** — poly tracks: tap multiple pads on the same step for chords

#### Step ribbon

A horizontal row of step indicators below the pads.

```
┌─────────────────────────────────────────┐
│ ● ● ○ ○ ● ○ ● ○ ● ○ ○ ○ ● ○ ○ ○      │
│     ▲ selected                          │
└─────────────────────────────────────────┘
```

- `●` = step has note(s), `○` = empty
- Tap to select step (highlights pads that are active on that step)
- Scrollable if steps > visible count
- Playhead indicator during playback

#### Pad states

| State | Visual |
|-------|--------|
| Idle | `--lz-bg-active` background, scale note label |
| Active on selected step | `--olive-bg` fill |
| Pressed (touch down) | `--lz-bg-press` |
| Playhead hit (playing) | Brief flash (`--color-olive` border pulse) |
| Root note (C, D, etc.) | Subtle accent to orient the grid |

#### Velocity

- Default: use track's current velocity value
- Velocity edit mode: vertical swipe on a pad adjusts velocity for that note/step
- Consistent with MobileTrackView's existing velocity drag pattern

### B. Track add / remove

Add a `+` button to MobileTrackView's track-nav area.
Remove via long-press menu with confirmation dialog.

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

### Pad Grid vs Scale-filtered PianoRoll

| | Pad Grid | Scale-filtered PianoRoll |
|---|---|---|
| Touch targets | ~50px wide, ~80px tall | ~15px (still too small) |
| Mental model | One pad = one note (clear) | Miniature piano (cramped) |
| Implementation | New component (~200 LOC) | Modify existing PianoRoll |
| Slide / duration | Not applicable (step-based) | Works as-is |
| Chord input | Tap multiple pads | Hard to tap adjacent rows |
| Desktop PianoRoll | Untouched (stays as-is) | Must handle dual modes |

Pad grid wins — mobile input needs a fundamentally different interaction model,
not a slightly less cramped version of the desktop one.

### Reuse of existing infrastructure

- `SCALE_TEMPLATES` / `song.rootNote` → pad-to-MIDI mapping
- `placeNoteBar()` / `removeNoteFromStep()` from `stepActions.ts` → note toggle
- `vkbd.octave` → octave shift (shared state)
- `activeCell()` → trig/note data for selected step
- `pushUndo()` → undo integration

### What stays on desktop

Desktop PianoRoll is unaffected. It remains the primary melodic editor for
desktop with its full feature set (drag, resize, slide, brush modes, etc.).
The pad grid is mobile-only, rendered in MobileTrackView when `mobileTab === 'pads'`.

### Duration

Pad input creates notes with a fixed duration of 1 step (like Ableton Note's
default). For longer notes, the step view's existing long-press → param lock
flow can set duration per step. This is a pragmatic trade-off: 90% of mobile
melodic input is short notes; the remaining 10% can use step-level editing.

## Future Extensions

- **5-column layout** — for pentatonic scales (5 notes/oct fits naturally in 5 columns, larger pads)
- **Pad play mode** — real-time pad triggering (not step-input, like MPC pads)
- **Scale type selection UI** — Dorian, Pentatonic, etc. (benefits both pad grid and desktop PianoRoll)
- **Swipe gestures** — horizontal swipe on step ribbon for step range navigation
