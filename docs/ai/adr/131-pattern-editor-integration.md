# ADR 131: Pattern Editor Integration

## Status: Proposed

## Context

ADR 130 introduced the Pads view as a third tab alongside Grid and Tracker.
While the Pads view works, the current layout has structural problems:

1. **Dead space** — When a non-sampler track is selected, the right side of
   Pads view (step row + params area) is mostly empty. The sampler params
   don't render, leaving a large blank region.
2. **Redundant views** — Grid and Pads share the same underlying data
   (`stepActions.ts`, `ui.selectedTrack`, pattern cells) but offer no
   integration. Users must tab-switch between the pattern overview (Grid)
   and the single-track deep editor (Pads).
3. **Piano Roll is cramped** — The current PianoRoll lives in a side panel
   within StepGrid. Its narrow width makes note placement difficult,
   especially for longer patterns or chords.
4. **Three tabs feel heavy** — Grid / Pads / Tracker is one mode too many
   for what is fundamentally two perspectives: multi-track overview and
   single-track detail.

### Key Insight

The Pads view's bottom-right dead space is exactly where StepGrid belongs.
The 4×4 pads (TRACK mode) serve as a visual track selector, and the Grid
shows all tracks' steps simultaneously. Together they form a single,
MPC-inspired workflow: **pads select, grid edits, canvas visualizes**.

The waveform/viz area at the top becomes a universal **track canvas** that
adapts to the selected track's voice type — including a full-width Piano
Roll for melodic tracks, solving the cramped side-panel problem.

### Inspiration

- **AKAI MPC / Force**: pads + step grid in a single view, pad press selects
  track while grid shows the full pattern
- **Ableton Push 3**: pad matrix with contextual display, single-screen
  editing without mode switches
- **OP-1 Field**: compact layout where every pixel serves double duty

## Decision

### Merge Grid and Pads into a single view

Reduce the tab bar from three to two:

```
┌──────────┐╭──────────╮
│   Grid   ││ Tracker  │
└──────────┘╰──────────╯
```

The unified Grid tab combines the current Pads view (pads + waveform) with
the current StepGrid (multi-track step sequencer) in a single layout.

### Layout

```
┌── Grid ──┐┌─ Tracker ─┐
└──────────┘└───────────┘
┌───────────────────────────────────────────────────────┐
│  PatternToolbar (RAND, KEY, VKBD, loop, paging)       │
├───────────────────────────────────────────────────────┤
│  Track Canvas (selected track — adapts by voice type) │
│                                                       │
│  Sampler  → waveform + chop markers + start/end drag  │
│  Melodic  → Piano Roll (full-width, DAW-style)        │
│  Drum     → tone shape / decay envelope               │
│  (future) → ADSR, FM algorithm, WT morph              │
│                                                       │
├───────────┬───────────────────────────────────────────┤
│           │                                           │
│  4×4 Pads │  StepGrid (all tracks × steps)            │
│  ───────  │  ┌─────┬──────────────┬──────┐            │
│  [TRACK]  │  │KICK │[■][□][■][□]… │VOL   │            │
│  [SLICE]  │  │SNR  │[□][■][□][□]… │PAN   │            │
│  [NOTE]   │  │HAT  │[■][■][□][□]… │      │            │
│           │  │…    │              │      │            │
│  mode sw  │  ├─────┴──────────────┴──────┤            │
│  oct ▲▼   │  │ velocity / chance bars    │            │
│           │  └───────────────────────────┘            │
│           │                                           │
└───────────┴───────────────────────────────────────────┘
```

### Track Canvas

The top area is a full-width, variable-height canvas that changes its
content based on the selected track's `voiceId`:

| Voice type       | Canvas content                                     |
|------------------|----------------------------------------------------|
| Sampler          | Waveform + chop markers + start/end handles (existing SamplerWaveform) |
| Melodic (WT/FM/Analog with polyphony) | Placeholder (future: Piano Roll — separate ADR) |
| Drum (DrumMachine, mono synths) | Tone/decay visualization (placeholder initially) |
| (future)         | ADSR curve, FM algorithm graph, WT morph position  |

**Piano Roll:** The canvas is the natural future home for a redesigned
Piano Roll, but that is a separate ADR. For now, the existing PianoRoll
side panel in StepGrid remains unchanged. The canvas shows a placeholder
for melodic tracks.

**Collapsible:** The canvas can be collapsed (toggle or drag) to give more
vertical space to the grid when visualization is not needed. Collapsed state
persisted in prefs.

### Pads Column

The 4×4 pad grid from PadsView moves to the left column, beside StepGrid.
All existing pad functionality is preserved:

- **TRACK mode**: tap pad → select track (highlights row in StepGrid)
- **SLICE mode**: sampler chop slice auditioning
- **NOTE mode**: chromatic note input with octave shift
- **Auto-switch**: sampler → SLICE, non-sampler → NOTE
- **Step input**: tap pad while step selected → write note

The pads column has a fixed width based on available height (square aspect
ratio for pads). On narrow screens, pads can stack above the grid.

#### Pad Layout (MPC-style, bottom-left origin)

Pads are numbered from the bottom-left, matching MPC convention. The most
frequently used tracks (kick, snare) land at the bottom where fingers
naturally rest. NOTE mode benefits too — low notes at bottom, high at top.

```
┌────┬────┬────┬────┐
│ 13 │ 14 │ 15 │ 16 │
├────┼────┼────┼────┤
│  9 │ 10 │ 11 │ 12 │
├────┼────┼────┼────┤
│  5 │  6 │  7 │  8 │
├────┼────┼────┼────┤
│  1 │  2 │  3 │  4 │
└────┴────┴────┴────┘
```

#### Pad-to-Track Mapping

Simple fixed mapping: pad N = track N. No custom assignment needed —
inboil's track model already handles instrument assignment via DockPanel.

- Pads 1–N show tracks 1–N in order
- Pads beyond track count are dimmed/inactive
- To change pad order, reorder tracks (existing track management)
- No `padMap` data structure needed — derive directly from `song.tracks`

### StepGrid Adaptation

The existing StepGrid component is embedded in the right column with
minimal changes:

- **Track labels kept** — although TRACK mode pads show the same labels,
  when pads are in SLICE or NOTE mode the track names are only visible in
  the grid. Labels remain as-is for orientation
- **Vertical scroll** — the StepGrid area scrolls vertically when track
  count exceeds available height (existing behavior). The pads column
  remains fixed and does not scroll with the grid
- **Selected track sync** — `ui.selectedTrack` is the single source of
  truth, shared between pads and grid
- **Velocity/chance bars** — render below the selected track's step row
  (existing behavior)
- **Mix knobs** — remain at the right edge of each track row
- **Piano Roll removed from StepGrid** — moved to Track Canvas above

### PatternToolbar

Stays below the tab bar (existing position). Contains existing controls:
RAND, KEY, VKBD, loop toggle, step paging. Placing it at the bottom would
overlap with the Guide tooltip area.

### DockPanel Behavior

Unchanged from ADR 130:
- Sampler voice selected + Grid tab → DockPanel shows Pool Browser
- Non-sampler voice → DockPanel shows normal track params
- Track Canvas provides the visualization; DockPanel provides the controls

### State Changes

```typescript
// Before (ADR 130)
prefs.patternEditor: 'grid' | 'pads' | 'tracker'

// After
prefs.patternEditor: 'grid' | 'tracker'
// 'pads' value migrated to 'grid' on load

// New
prefs.canvasCollapsed: boolean  // Track Canvas visibility (persisted)
```

`ui.padMode` (`'track' | 'slice' | 'note'`) remains unchanged.

### Mobile Layout

On narrow screens (< 640px), the layout stacks vertically:

```
┌───────────────────────┐
│  Track Canvas          │  (reduced height or collapsed)
├───────────────────────┤
│  4×4 Pads (full width) │
├───────────────────────┤
│  StepGrid (scrollable) │
├───────────────────────┤
│  PatternToolbar        │
└───────────────────────┘
```

Pads shift from side column to full-width row. StepGrid scrolls
horizontally for steps. This replaces the deferred mobile task from
ADR 130 Step 7.

## Implementation Checklist

### Phase 1: Grid + Pads Merge

- [ ] Create unified `GridView.svelte` combining pads + StepGrid + canvas
- [ ] Move pad column (mode switch, SamplerPads) into GridView left column
- [ ] Embed StepGrid content into GridView right column
- [ ] Mount Track Canvas (SamplerWaveform) at top of GridView
- [ ] Wire `ui.selectedTrack` sync between pads ↔ grid
- [ ] Remove `'pads'` from `patternEditor` type, migrate saved prefs
- [ ] Update `PatternModeTabs.svelte` to 2 tabs (Grid / Tracker)
- [ ] Remove standalone `PadsView.svelte`
- [ ] PatternToolbar stays below tabs (existing position)
- [ ] Verify all existing StepGrid features work (drag-select, step-set,
      context menus, velocity bars, P-Lock indicators, playhead)
- [ ] Verify all existing Pads features work (tri-mode, auto-switch,
      step input, audition)
- [ ] Pad layout: MPC-style bottom-left origin (pad 1 = bottom-left)
- [ ] Pad N = Track N (fixed mapping, no padMap needed)
- [ ] Pads beyond track count dimmed/inactive
- [ ] Canvas collapse toggle + prefs persistence
- [ ] Update LP (site/) — Grid/Pads/Tracker → Grid/Tracker, screenshots
- [ ] Update tutorial/docs — pattern editor references, screenshots

### Phase 2: Voice Visualizations

- [ ] Drum voice: tone shape + decay envelope canvas
- [ ] WT synth: wavetable shape + morph position
- [ ] FM synth: algorithm routing diagram
- [ ] ADSR envelope curve (shared across voice types)

### Phase 3: Mobile Layout

- [ ] Stacked vertical layout for < 640px
- [ ] Pads full-width row mode
- [ ] StepGrid horizontal scroll
- [ ] Canvas reduced height / auto-collapse
- [ ] Touch interactions verified

## Considerations

### Why merge instead of keeping separate tabs?

Three tabs (Grid / Pads / Tracker) create a choice paralysis problem.
Grid and Pads operate on the same data with complementary perspectives
— one shows all tracks, the other focuses on one track. Merging them
means users never need to choose; they get both simultaneously.

The MPC/Push paradigm proves this works: pads and steps coexist naturally.
The pads are always visible for quick track switching and auditioning,
while the grid provides the editing surface.

### Piano Roll

The existing PianoRoll side panel is part of StepGrid and comes along
unchanged in the unified view. No migration or layout changes in this ADR.
A full Piano Roll redesign (moving to the Track Canvas with step-column
alignment) is a separate future ADR — the current side panel works and
avoids risk in Phase 1.

### StepGrid complexity

StepGrid is 1228 lines with tightly coupled drag-selection, piano roll
coordination, and context menu logic. Rather than refactoring StepGrid
into a reusable sub-component (high risk), the approach is to embed the
grid rendering directly in the unified view and extract shared logic into
`stepActions.ts` as needed.

### Vertical space budget

On a 900px-tall viewport (common laptop):
- Tab bar: 32px
- Canvas: 180–220px (collapsible)
- Pads + Grid: ~400px (8 tracks × 50px)
- Toolbar: 36px
- Total: ~690px — fits with margin

If the canvas is collapsed, the grid gets ~580px — room for 10+ tracks.

### What this ADR does NOT change

- Tracker view: completely unchanged, remains its own tab
- DockPanel: role and behavior unchanged
- StepGrid interaction model: drag-select, velocity bars, P-Locks, all preserved
- Pad modes and behavior: identical to ADR 130
- Audio/DSP: no changes
- Data model: no changes to Song/Pattern/Cell/Track types

### Relationship to ADR 130

ADR 130 remains the authority for:
- Sampler-specific features (chop, waveform editing, slice modes)
- Factory sample expansion
- Phase 2 (auto-chop, sweep mangling) and Phase 3 (granular playback)

This ADR handles the pattern editor layout integration. The sampler
features from ADR 130 slot into this layout's Track Canvas and pad
SLICE mode without modification.

## Future Extensions

- **Piano Roll redesign** — Dedicated ADR for full-width Piano Roll in
  canvas area with step-aligned columns (separate from this ADR)
- **Resizable canvas** — Drag handle between canvas and grid for user-
  controlled height ratio
- **Grid density options** — Compact mode (smaller cells) for high track
  counts, expanded mode for detailed editing
- **Canvas plugins** — Third-party or user-created visualizations in the
  canvas area (e.g., spectrum analyzer, Tonnetz overlay)
