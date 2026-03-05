# ADR 043: Matrix View — Pattern Pool Browser

## Status: IMPLEMENTED (Phase 1–3) — Phase 4 (polish: rename, add/delete, auto-scroll) pending

## Context

### Current State

ADR 044 (Done) introduced the Scene Graph for arrangement. Patterns are now reusable units referenced by scene nodes. The arrangement layer (ordering, branching, repeats) is fully handled by the Scene View.

However, the current MatrixView (`src/lib/components/MatrixView.svelte`) still displays patterns as a **section × track grid** — rows are section indices (00, 01, 02...) with 8 track columns showing per-cell density. This is a leftover from the chain/timeline era (ADR 042).

### Problems

1. **Timeline semantics are wrong**: Row indices imply sequential order (section 0 → 1 → 2), but arrangement is now handled by the Scene Graph. The matrix should not suggest a timeline.
2. **Track columns couple to fixed track count**: Each row shows 8 cells (one per track). This breaks if track count becomes variable — adding/removing tracks would require redesigning the matrix layout.
3. **No pattern-level preview playback**: Clicking a matrix cell selects a track within a pattern but doesn't let you audition the pattern in isolation.
4. **Scene ↔ Editor sync missing**: When the Scene Graph advances to a new pattern during playback, the Grid/Tracker view doesn't follow — `ui.currentPattern` is not synced from scene traversal.

### Insight

The Matrix View's role has fundamentally shifted:

- **Before (043 v1)**: Arrangement overview (section × track grid, timeline order)
- **After (043 v2)**: Pattern pool browser (flat collection, no order, no track breakdown)

Arrangement is the Scene View's job. The Matrix View is purely a **palette** — browse, select, preview patterns. Track-level editing belongs in the Grid/Tracker below.

## Decision

### Layout: Pattern List (No Track Columns)

```
┌──────────────────────────────────────────────────────┐
│ AppHeader                                            │
│ PerfBar: KEY  DUC CMP GAIN SWG [GRID|TRKR|SCENE]    │
├──────┬───────────────────────────────────┬───────────┤
│ PAT  │ Step Sequencer / Tracker / Scene  │ DockPanel │
│      │                                   │           │
│ 00 ▌ │ KICK  ░░█░ ░░█░ ░░█░ ░░█░        │           │
│ 01 ▍ │ SNARE ░░░░ █░░░ ░░░░ █░░░        │           │
│ 02 ▊ │ ...                               │           │
│ 03   │                                   │           │
│ 04 ▎ │                                   │           │
│ ...  │                                   │           │
│      │                                   │           │
│ [+]  │                                   │           │
└──────┴───────────────────────────────────┴───────────┘
```

Each row is a **single pattern** — no track subdivision:

```
MatrixView.svelte (revised)
├── Pattern rows (vertical scroll)
│   ├── Pattern index (00, 01, ...)
│   ├── Pattern name (max 8 chars)
│   ├── Density bar (overall pattern density, single bar)
│   └── Scene usage indicator (dot if used by any scene node)
└── Add pattern button [+]
```

### Pattern Row States

| State | Visual | Condition |
|-------|--------|-----------|
| `empty` | dim, no density bar | no active trigs in any cell |
| `has-data` | density bar visible | at least 1 active trig |
| `selected` | olive highlight | `ui.currentPattern === pi` |
| `playing` | blue pulse | currently playing (scene or direct) |
| `in-scene` | small dot indicator | referenced by at least one scene node |

### Density Visualization

Single horizontal density bar per pattern (not per-track):

```typescript
function patternDensity(pat: Pattern): number {
  let total = 0, active = 0
  for (const cell of pat.cells) {
    total += cell.steps
    for (const t of cell.trigs) { if (t.active) active++ }
  }
  return total > 0 ? active / total : 0
}
```

This decouples the display from track count entirely. Whether the pattern has 4 tracks or 16, a single density value is shown.

### Playback Behavior

**Playback source is independent of the active view** — switching between GRID/TRKR/SCENE changes what you *see*, not what *plays*:

- `hasScenePlayback()` → graph traversal (always, regardless of view)
- Otherwise → section-based fallback (existing behavior)

**Scene → Editor sync**: When Scene playback advances to a new pattern node, update `ui.currentPattern` to match. Switching to GRID/TRKR then shows the current pattern content immediately.

```typescript
// In advanceSceneNode() / walkToNode(), after resolving patternIndex:
ui.currentPattern = patternIndex
```

**Pattern Solo**: Each pattern row in the matrix has a solo button (`▶`). When activated:

- Overrides Scene/Section playback — loops only `ui.soloPattern` continuously
- `playback.soloPattern: number | null` — `null` = normal playback, number = solo that pattern index
- Pressing solo on another pattern switches immediately (next beat boundary)
- Pressing solo again on the same pattern deactivates (returns to normal playback)
- Visual: solo'd pattern row gets a distinct highlight (blue border)

This lets the user audition a single pattern while editing without disrupting the Scene graph structure.

**Matrix follows playback**: The matrix highlights whichever pattern is currently playing, whether from solo, scene traversal, or section playback. Auto-scroll to keep the playing pattern visible.

### Interaction

| Action | Result |
|--------|--------|
| Click pattern row | `selectPattern(pi)` → Grid/Tracker shows that pattern |
| Click `▶` on row | Toggle pattern solo (loop this pattern only, override Scene) |
| Double-click row | Rename pattern (inline edit) |
| Click `[+]` | Create new empty pattern at next available slot |
| Hover row (scene mode) | Show `→` button to add pattern to scene |
| Click `→` button | `sceneAddNode(pat.id, ...)` |

### State Changes

```typescript
ui: {
  currentPattern: number    // selected pattern index (drives Grid/Tracker)
  selectedTrack: number     // track within pattern (Grid/Tracker)
  phraseView: 'grid' | 'tracker' | 'scene'
  // Removed: currentSection (no longer needed for pattern editing)
  // Removed: matrixHeight (no resizable split — matrix is a sidebar)
}

playback: {
  soloPattern: number | null  // NEW: null = normal, number = solo that pattern
  // ...existing fields
}
```

### Desktop Layout

Matrix is a **left sidebar column** (not a top panel):

```
┌──────┬────────────────────┬──────────┐
│Matrix│ Center view area   │ DockPanel│
│(left)│ GRID / TRKR / SCENE│ (right)  │
└──────┴────────────────────┴──────────┘
```

This matches the current App.svelte `view-content-row` flex layout where MatrixView is already the first child.

### Mobile Layout

Mobile keeps SectionNav (compact 1D strip). Matrix is not shown — pattern selection happens via SectionNav's pattern picker dropdown.

```
Mobile:
┌─────────────────────────┐
│ AppHeader (compact)      │
│ PerfBar                  │
│ SectionNav [00][01]...   │  ← pattern picker dropdown
│ MobileTrackView / Scene  │
│ Sidebar                  │
└─────────────────────────┘
```

## Implementation Phases

### Phase 1: Flatten Matrix to Pattern List

1. Remove track header row (`matrix-header`, `track-col`)
2. Remove per-track cell columns from each row
3. Replace with: pattern index + name + single density bar + scene indicator
4. Click row → `selectPattern(pi)` (already exists, remove `ui.selectedTrack` assignment)
5. Remove section-related state: `in-loop`, `playback.currentSection` references
6. Remove `visibleCount` section-based logic, replace with pattern-count-based logic

**Files:** `MatrixView.svelte`

### Phase 2: Scene → Editor Pattern Sync

1. In `advanceSceneNode()` / `walkToNode()`: set `ui.currentPattern = patternIndex` when a pattern node is reached
2. In App.svelte `onStep`: after scene advances, Grid/Tracker automatically reflects the new pattern
3. Matrix highlights the playing pattern row (blue pulse)
4. Auto-scroll matrix to keep playing pattern visible

**Files:** `state.svelte.ts`, `App.svelte`

### Phase 3: Pattern Solo

1. Add `playback.soloPattern: number | null` to state
2. Add `▶` button to each matrix pattern row
3. Click `▶` → toggle `playback.soloPattern` (same pattern = deactivate, different = switch)
4. In App.svelte `onStep`: when `playback.soloPattern != null`, skip Scene/Section logic and loop that pattern via `engine.sendPatternByIndex()`
5. In `stop()`: clear `playback.soloPattern = null`
6. Visual: solo'd row gets blue left border, `▶` button highlighted

**Files:** `MatrixView.svelte`, `state.svelte.ts`, `App.svelte`

### Phase 4: Polish

1. Pattern rename (double-click inline edit)
2. Pattern `[+]` button (create empty pattern)
3. Pattern duplicate / delete from matrix context
4. Scene usage dot indicator per pattern row
5. Playing pattern auto-scroll in matrix

**Files:** `MatrixView.svelte`, `state.svelte.ts`

## Considerations

- **Section model**: `song.sections[]` and `playback.currentSection` still exist for backward compatibility with the linear arrangement fallback (`hasArrangement()`). These can be deprecated once Scene Graph fully replaces linear playback. This ADR does not remove sections — it decouples the Matrix UI from them.
- **Variable track count (future)**: By removing track columns from the matrix, adding/removing tracks only affects the Grid/Tracker view. The matrix density bar aggregates across all tracks regardless of count.
- **Performance**: Pattern list is simpler than section × track grid — fewer DOM elements (N patterns vs N × 8 cells). Density calculation per-pattern is cheap.
- **Pattern vs Section selection**: `ui.currentPattern` is the primary editing target. `ui.currentSection` becomes an internal detail for the section-based playback fallback, not exposed in the matrix UI.

## Supersedes

| Version | Change |
|---------|--------|
| 043 v1 (original) | Section × Track grid with timeline ordering, per-cell density, loop range bar. Replaced by flat pattern list with no track columns and no arrangement semantics. |

## Future Extensions

- **Pattern tagging / filtering**: Tag patterns (e.g., "intro", "drop", "fill") and filter in the list
- **Drag-reorder patterns**: Reorganize the pattern pool manually
- **Pattern color coding**: User-assigned colors shown as left border accent
- **Mini waveform / rhythm preview**: Tiny visual preview of the pattern's rhythm shape
- **Pattern groups**: Collapse related patterns into named folders
