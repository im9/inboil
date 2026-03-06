# ADR 037: ChainView Redesign

## Status: Superseded

## Context

### Current ChainView UX Issues

The current ChainView (`ChainView.svelte`) presents a vertical list of chain entries, each as a single dense row:

```
[01] ◀ 00 | TECHNO1 ▶  C#  +1  ◀×2▶ ●●  VRB DLY GLT GRN  FILL BAR  ×
```

**Problems:**

1. **Information overload per row**: Pattern nav (◀▶), pattern name, KEY, OCT, repeats (◀×N▶ + dots), 4 FX toggles + knobs, perf type, perf length, delete — all in a single 40px row. On mobile this wraps into multiple lines and becomes unusable (`ChainView.svelte:545-576`)
2. **Tedious pattern selection**: ◀▶ buttons cycle through 100 patterns one at a time — finding a specific pattern requires many taps
3. **No reordering**: Entries can only be added (append) or deleted — no drag-to-reorder, no insert-between
4. **No visual timeline**: The list gives no sense of duration or arrangement structure — a ×1 entry looks the same size as a ×8 entry
5. **Context switching**: Editing a pattern requires leaving ChainView and navigating to the pattern in the grid. No way to preview or edit pattern content from within ChainView
6. **Sidebar integration** (from ADR 036): ChainView currently has no sidebar/panel needs beyond HELP and SYS, but might benefit from contextual info

### Structural Issues (Pattern ↔ Chain relationship)

The current data model has fundamental limitations documented in ADR 032:

- **Pattern = all 8 tracks bundled**: Changing one track's sequence requires copying the entire pattern, leading to duplication and wasted slots
- **Chain is a single global list**: All 8 tracks advance in lockstep — no per-track independence or polyrhythmic arrangements
- **Chain state not persisted**: Chain entries are lost on reload (only presets survive)
- **No hierarchy**: Flat pattern bank (100 slots) with no grouping — managing patterns for a complex song is cumbersome

ADR 032 proposes the full M8-style Phrase/Chain/Song restructure. This ADR focuses on **ChainView UI improvements** that can work incrementally — first within the current data model, then adapting naturally when ADR 032's structural changes land.

## Decision

### Phase 1: UX Improvements (Current Data Model)

#### 1.1 Row Simplification — Primary/Secondary Split

Split each row into primary info (always visible) and secondary info (expandable):

```
Primary row (always visible):
┌──────────────────────────────────────────────────┐
│ 01 ▸  00 | TECHNO1   C#  ×2 ●●   [FILL]     ×  │
└──────────────────────────────────────────────────┘

Expanded (tap row to reveal):
┌──────────────────────────────────────────────────┐
│ 01 ▸  00 | TECHNO1   C#  ×2 ●●   [FILL]     ×  │
│   KEY [C ][C#][D ]..  OCT [-2][-1][+0][+1][+2]  │
│   FX  ○VRB ○DLY ○GLT ○GRN   PERF [----▸FILL▸…] │
│   RPT [◀ ×2 ▶]   LEN [BAR|½|¼|1S]              │
└──────────────────────────────────────────────────┘
```

- Primary: row number, pattern ID + name, key (if set), repeats + dots, active perf label, delete
- Secondary: KEY selector grid, OCT selector, FX toggles + knobs, perf cycle, repeat adjust, perf length
- Mobile: secondary section stacks vertically, full-width

#### 1.2 Pattern Picker

Replace ◀▶ buttons with a tap-to-open pattern picker overlay:

```
┌─ SELECT PATTERN ─────────────────┐
│ 00 TECHNO1  01 HOUSE1  02 DNBAS  │
│ 03 BREAKS   04 AMBNT1  05 LOFI   │
│ 06 GARAGE   07 DRILL   08 -----  │
│ ...                               │
│ [Cancel]                          │
└───────────────────────────────────┘
```

- Grid of pattern slots with ID + name
- Empty patterns grayed out
- Current pattern highlighted
- Quick access vs cycling through 100 patterns

#### 1.3 Drag-to-Reorder

- Long-press a row to enter drag mode
- Visual feedback: row lifts with shadow, gap opens at drop target
- Reuse pointer capture pattern from StepGrid drag-to-paint (`StepGrid.svelte:88-122`)

#### 1.4 Timeline Visualization

Add a compact timeline bar above or below the list showing relative durations:

```
Timeline:
█████ ██████████ ███ █████████████████ ██████
 P00    P00       P05   P00             P05
 ×1     ×2        ×1    ×4              ×2
```

- Width proportional to repeats × steps
- Color-coded by pattern ID
- Current playback position indicated
- Tap a segment to scroll to that entry

#### 1.5 Chain Persistence

- Save chain entries to `localStorage` alongside pattern data
- Restore on reload

### Phase 2: Sidebar / Panel Integration (Post-ADR 036)

Once the dockable panel (ADR 036) is implemented, ChainView gets its own panel usage:

- **Pattern preview**: Show a mini step-grid of the selected entry's pattern in the panel — read-only overview of all 8 tracks
- **Quick edit**: Tap a track in the preview to jump to that pattern's grid view with the track selected
- **Chain stats**: Total duration, BPM, number of unique patterns used

### Phase 3: Structural Upgrade (Post-ADR 032)

When ADR 032's Phrase/Chain/Song model is implemented, ChainView evolves into Song View:

- Row entries reference per-track chains instead of monolithic patterns
- 8-column grid (one per track) replaces single-column list
- Per-track chain independence enables polyrhythmic arrangements
- The Phase 1 UX improvements (expandable rows, picker, drag-reorder, timeline) carry over directly to the Song View UI

## Considerations

- **Phase 1 as throwaway?**: Phase 1 improvements to the current ChainView may be partially replaced by Phase 3's Song View. However, the UX patterns (expandable rows, picker, drag-reorder, timeline) will transfer to the new view. The investment is not wasted.
- **Mobile priority**: The current mobile ChainView is the most painful — rows wrapping to 2-3 lines with tiny buttons. Phase 1 should prioritize mobile improvements.
- **Pattern picker scope**: The pattern picker overlay could be reused in PerfBar's pattern nav (◀▶) as well — worth making it a shared component.
- **Chain persistence format**: When saving to localStorage, need to handle version migration when the data model changes (Phase 3). Use a versioned schema.

## Future Extensions

- Inline pattern editing within ChainView (edit steps without leaving the view)
- Chain templates / presets with user-defined presets (not just factory)
- A/B section markers for visual arrangement structure
- Export chain as audio (offline render)
