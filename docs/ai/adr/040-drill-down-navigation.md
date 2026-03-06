# ADR 040: Drill-Down Navigation (Song → Chain → Phrase)

## Status: Superseded

## Context

### Current Problem

ADR 032 Phases 1–4 implemented the Song/Chain/Phrase data model and their respective views, but UI navigation remains **flat tab switching**:

```
PerfBar: [GRID] [TRKR] [FX] [EQ] [CHN] [SONG]
```

This causes the following issues:

1. **Hierarchy–UI mismatch**: Data has a Song → Chain → Phrase parent-child relationship, but view switching is flat. Users must select a row in SONG → manually switch to CHN → manually switch to GRID
2. **Context loss**: No UI indication of which Chain from the selected SONG row is being edited, or which Chain position the current GRID/TRKR Phrase belongs to
3. **Button proliferation**: 6 tabs is too many, especially on mobile where PerfBar space is tight
4. **UX gap with M8**: M8 drills down Song → Chain → Phrase with arrow keys. With inboil's 64-step limit, the same hierarchical navigation feels natural

### Reference: M8 Navigation

```
Song View        → select row   → Chain View (for that track/row)
Chain View       → select entry → Phrase View (step editor)
Phrase View      ← Back         → Chain View
Chain View       ← Back         → Song View
```

Current position is always clear via breadcrumb.

## Decision

### Navigation Model

Flat tabs → **hierarchical drill-down + lateral tabs** hybrid:

```
Level 1 (top): [SONG] [PHRASE]  ← main mode toggle (only 2)
  └── SONG mode:
        Song View → (select cell) → Chain Editor → (select entry) → Phrase Editor
  └── PHRASE mode:
        StepGrid / Tracker  ← direct editing (phrase set switching)
        └── Sub-tabs: [GRID | TRKR | FX | EQ]
```

**SONG mode**: Build song structure top-down. Drill down through Song grid → Chain detail → Phrase editing.

**PHRASE mode**: Traditional free editing. Select a phrase set directly and edit steps immediately. For live performance and quick sketching.

### Breadcrumb

Display breadcrumb below PerfBar during drill-down:

```
Desktop:
┌─────────────────────────────────────────┐
│ PerfBar: ▶ STOP BPM KEY [SONG|PHRASE] … │
│ Breadcrumb: SONG > Track 1 > Chain 00 > Phrase 03  │
├─────────────────────────────────────────┤
│ (current view content)                   │
└─────────────────────────────────────────┘

Mobile:
┌───────────────────────┐
│ ◀ CHN 00 > PHR 03     │  ← compact breadcrumb (tap ◀ to go back)
├───────────────────────┤
│ (view content)         │
└───────────────────────┘
```

Each breadcrumb segment is clickable/tappable to navigate directly to that level.

### Navigation State

```typescript
// state.svelte.ts
export const ui = $state({
  // ...existing fields...
  mode: 'phrase' as 'phrase' | 'song',   // top-level mode

  // Song mode drill-down context
  songNav: {
    level: 'song' as 'song' | 'chain' | 'phrase',
    trackId: 0,         // which track column was drilled into
    rowIndex: 0,        // which song row
    chainId: 0,         // which chain (from the song row)
    entryIndex: 0,      // which chain entry (phrase position in chain)
  },

  // Phrase mode sub-view
  phraseView: 'grid' as 'grid' | 'tracker',

  // Remove: view (replaced by mode + songNav.level + phraseView)
})
```

### View Resolution

Determine which component to display from `mode` + `songNav.level` + `phraseView`:

| mode | songNav.level | phraseView | Component |
|------|---------------|------------|-----------|
| `phrase` | — | `grid` | StepGrid |
| `phrase` | — | `tracker` | TrackerView |
| `song` | `song` | — | SongView |
| `song` | `chain` | — | ChainEditor (new) |
| `song` | `phrase` | — | StepGrid or TrackerView (contextual) |

FX / EQ are accessible as DockPanel tabs in either mode (no longer standalone views).

### PerfBar Changes

```
Before (6 tabs):
[GRID] [TRKR] [FX] [EQ] [CHN] [SONG]

After (2 mode buttons + sub-tabs):
[SONG] [PHRASE]    ← mode toggle
  └── PHRASE mode shows: [GRID | TRKR] sub-toggle
  └── SONG mode shows:   breadcrumb (no sub-toggle)
```

FX / EQ integrated into DockPanel tabs:
```
DockPanel tabs: [PARAM] [FX] [EQ] [HELP] [SYS]
```

### Drill-Down Interaction

**Song View → Chain Editor**:
1. Tap/Enter on a Song grid cell
2. Set `songNav.level = 'chain'`, update `songNav.trackId/rowIndex/chainId`
3. Chain Editor displays (phrase list for the selected track's chain)

**Chain Editor → Phrase Editor**:
1. Tap/Enter on a chain entry
2. Set `songNav.level = 'phrase'`, update `songNav.entryIndex`
3. Set `ui.activePhrases[trackId]` to the corresponding `phraseId`
4. StepGrid or TrackerView displays (remembers last-used editor)

**Back**:
- Escape key or click a higher-level breadcrumb segment
- Move `songNav.level` one level up
- Mobile: ◀ button or swipe right

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Escape | Go up one level (phrase → chain → song) |
| Enter | Drill down into selected cell/entry |
| Tab | Toggle between SONG / PHRASE mode |
| `1` / `2` | PHRASE mode: switch GRID / TRKR |

### ChainEditor Component (New)

Extract SongView's chain editor sub-panel into a standalone component. Displayed full-screen during drill-down:

```
┌──────────────────────────────────────────┐
│ ◀ SONG > Track 1: KICK > Chain 00        │
├──────────────────────────────────────────┤
│  #  PHRASE  TRANSPOSE                     │
│  01  PHR 00  +0       ← selected          │
│  02  PHR 03  -12                          │
│  03  PHR 00  +7                           │
│  [+ Add Entry]                            │
├──────────────────────────────────────────┤
│ (mini preview of selected phrase)         │
└──────────────────────────────────────────┘
```

Press Enter to drill down into phrase → edit in StepGrid/TrackerView.

### Mobile

- Mode toggle placed compactly at top of screen
- Breadcrumb shows ◀ back button + current level name only
- Swipe right = back (go up one level)
- Song mode drill-down uses tap for intuitive navigation

## Implementation Phases

### Phase 1: Navigation State + Mode Toggle

1. Split `ui.view` into `ui.mode` + `ui.songNav` + `ui.phraseView`
2. Replace PerfBar tabs with 2 mode buttons
3. Update App.svelte view routing to mode-based logic
4. Adapt all existing components to new state
5. Move FX/EQ views into DockPanel tabs

### Phase 2: Breadcrumb + Drill-Down

1. Create Breadcrumb component
2. Implement drill-down from Song View (Song → Chain → Phrase)
3. Escape / ◀ back navigation
4. Auto-set activePhrases on drill-down

### Phase 3: ChainEditor Extraction

1. Extract SongView's chain editor sub-panel into standalone component
2. Full-screen Chain Editor during drill-down
3. Mini phrase preview panel

### Phase 4: Mobile Optimization

1. Compact breadcrumb (◀ + level name)
2. Swipe-back gesture
3. Mobile mode toggle layout

## Considerations

- **PHRASE mode retention**: While Song mode drill-down can reach phrase editing, PHRASE mode (direct editing) is kept for live performance and quick editing. M8 also has a Pattern Mode
- **FX/EQ view → panel migration**: Standalone FX/EQ views are removed and integrated into DockPanel tabs. If full-screen FX pad operation is needed, DockPanel's expand mode can handle it
- **State migration**: Changing `ui.view` → `ui.mode` + `ui.songNav` affects all existing components. Handled as a batch change in Phase 1
- **Relationship to ADR 032 / 037**: 032's data model remains unchanged. 037's ChainView is superseded by being integrated into Song mode's chain level

## Future Extensions

- **Pattern follow**: Auto-follow drill-down display to current row/chain/phrase during Song playback
- **Scene launch (non-linear)**: Click a Song view row to instantly launch it (Ableton Session View style) — achieved by swapping the playback controller
- **Split view**: Display Song grid + Phrase editor side by side on desktop
- **Quick preview**: Show mini preview on hover at Chain/Phrase level
