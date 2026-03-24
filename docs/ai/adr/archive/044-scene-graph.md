# ADR 044: Scene — Node-Based Arrangement Canvas

## Status: Implemented

## Context

### Current State

ADR 042 flattened the Song → Chain → Phrase hierarchy into Song → Section → Cell. ADR 043 introduced a Matrix View (section × track grid) for arrangement overview. The current model stores step data inline in 64 fixed sections, with sequential playback controlled by `loopStart`/`loopEnd`.

### Problems

1. **Linear arrangement only**: Sections play in strict sequential order (0→1→2→...→loopEnd→loopStart). No branching, no conditional flow, no re-use without data duplication.
2. **Chain legacy**: The section model inherited chain-like properties (`repeats`, `key`, `oct`, per-section FX overrides) that complicate what should be simple pattern editing.
3. **Pattern creation vs arrangement conflated**: Section data is both the "pattern" (creative) and the "arrangement slot" (structural). Editing section 3 always means editing arrangement position 3.
4. **No re-use**: Using the same beat in positions 0 and 4 requires duplicating all cell data. Edits don't propagate.

### Insight

Separate concerns into two distinct layers:

- **Matrix View** = pattern pool (create, edit, browse reusable patterns)
- **Scene View** = node graph canvas (arrange patterns into a playback flow)

### Conceptual Metaphor: Palette & Canvas

The Matrix View is a **paint palette** — a collection of colors (patterns), each mixed and ready to use. The user crafts individual patterns here: tweaking kick sequences, shaping synth lines, adjusting hi-hat density. Each pattern is a distinct color on the palette.

The Scene View is the **canvas** — where those colors are applied through drawing. Patterns and FX nodes are the paint; connecting them is the brushstroke. A simple scene is a few bold strokes (A→B→C). A complex scene is a layered composition with branching paths, probability forks, and FX washes — an abstract painting of sound over time.

The creative flow mirrors painting: prepare your materials (patterns), then compose freely on the canvas (scene).

The Scene View replaces linear chain sequencing with a visual node graph, similar to the existing FX pad canvas interaction model. Patterns are dragged from the Matrix onto the Scene canvas as nodes. Connecting nodes defines playback order. Function nodes (FX, transpose, tempo, repeat, probability) modify the flow.

## Decision

### Architecture: Two-Layer Model

```
┌─────────────────────────────────────────────────┐
│ Matrix View (pattern pool)                      │
│                                                 │
│   [PAT.00] [PAT.01] [PAT.02] [PAT.03] ...      │
│   8 tracks × N steps per pattern                │
│   Click → edit in step sequencer                │
│                                                 │
├─────────────────────────────────────────────────┤
│ Scene View (node graph canvas)                  │
│                                                 │
│   ┌───┐    ┌───┐    ┌───┐                       │
│   │ A │───▶│ B │───▶│ C │                       │
│   │root│   └───┘    └─┬─┘                       │
│   └───┘        ┌───┐  │                         │
│                │FX:V│◀─┘                         │
│                └───┘                             │
│   Drag from Matrix, connect nodes               │
│                                                 │
├─────────────────────────────────────────────────┤
│ Step Sequencer / Tracker (edit selected pattern)│
└─────────────────────────────────────────────────┘
```

### Data Model

```typescript
/** Reusable pattern — 8 tracks of step data */
interface Pattern {
  id: string              // unique identifier
  name: string            // max 8 chars, shown in matrix + node
  cells: Cell[]           // 8 fixed (one per track)
}

/** Node on the scene canvas */
interface SceneNode {
  id: string
  type: 'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability'
  x: number               // canvas position (normalized 0–1)
  y: number
  root: boolean           // true = playback entry point (exactly one)
  patternId?: string      // for type === 'pattern'
  params?: Record<string, number>  // type-specific parameters
}

/** Directed edge between nodes */
interface SceneEdge {
  id: string
  from: string            // source node id
  to: string              // target node id
  order: number           // playback order when multiple edges from same source
}

/** Scene = the arrangement graph */
interface Scene {
  name: string
  nodes: SceneNode[]
  edges: SceneEdge[]
}

/** Song — updated top-level */
interface Song {
  name: string
  bpm: number
  rootNote: number
  tracks: Track[]         // 8 fixed (instrument config)
  patterns: Pattern[]     // pattern pool (replaces sections)
  scene: Scene            // arrangement graph (replaces loopStart/loopEnd)
}
```

### Node Types

| Type | Purpose | Params | Behavior |
|------|---------|--------|----------|
| `pattern` | Play a pattern | `patternId` | Plays all steps once, then follows outgoing edges |
| `transpose` | Shift root note | `semitones: -12..12` | Applies transpose to all downstream pattern nodes |
| `tempo` | Change BPM | `bpm: 60..300` or `delta: -50..50` | Sets/offsets BPM for downstream nodes |
| `repeat` | Loop N times | `count: 1..16` | Replays the incoming pattern N times before continuing |
| `probability` | Random branch | `weights: number[]` | Randomly selects one outgoing edge based on weights |

### Playback Rules

1. **Entry point**: Playback starts at the `root` node (exactly one per scene).
2. **Sequential traversal**: When a pattern node finishes, follow outgoing edges in `order` sequence (edge.order = 0, 1, 2...).
3. **Function nodes are inline**: Transpose/tempo/repeat nodes modify the next pattern node — they don't "play" themselves.
4. **Cycles allowed**: A→B→A creates an alternating loop. The graph is a directed graph (not necessarily acyclic).
5. **Dead end = loop to root**: If a node has no outgoing edges, playback returns to the root node.
6. **Root always loops**: After completing the full graph traversal (or hitting a dead end), playback restarts from root.

```
Example: A(root) → B → C → A  (plays A, B, C, A, B, C, ... forever)
Example: A(root) → B           (plays A, B, A, B, ... B has no out-edge, loops to root)
                 → C           (A has 2 out-edges: plays B first (order=0), then C (order=1))
         Result: A, B, C, A, B, C, ...
```

### Scene View Canvas

Reuses the FX pad canvas interaction model (`FxPad.svelte`):

```
┌──────────────────────────────────────────────┐
│  Scene Canvas                                │
│                                              │
│  ┌─────┐         ┌─────┐      ┌─────┐       │
│  │4FLOR│────────▶│LOFI │─────▶│4FLOR│       │
│  │ root│  ┌─────▶│     │      │     │───┐   │
│  └─────┘  │      └─────┘      └─────┘   │   │
│           │                              │   │
│      ┌────┴─┐                  ┌──────┐  │   │
│      │ T+5  │                  │DLY.ON│◀─┘   │
│      └──────┘                  └──────┘      │
│                                              │
│  [+ Pattern]  [+ Function]      [▶ Play]     │
└──────────────────────────────────────────────┘
```

**Interactions:**

| Action | Result |
|--------|--------|
| Drag pattern from Matrix → Canvas | Create pattern node at drop position |
| Drag from node edge → another node | Create directed edge (connection) |
| Click node | Select → step sequencer shows that pattern |
| Drag node | Reposition on canvas |
| Long-press/right-click node | Context menu: delete, set as root, add function |
| Click edge | Select edge (delete, reorder) |
| Click canvas background | Deselect all |
| Pinch/scroll | Zoom canvas |
| Two-finger drag | Pan canvas |

**Alternative insertion (non-D&D):**

Drag & drop from Matrix → Canvas is the primary insertion method, but it requires both panels to be visible simultaneously. The following supplementary methods cover cases where D&D is impractical:

| Method | Trigger | Behavior |
|--------|---------|----------|
| Matrix `+` button | Click `+` icon on a pattern row | Insert pattern node after the currently selected node in Scene (auto-connect with edge). If no node selected, append after the last node in traversal order. |
| Matrix long-press | Long-press / right-click pattern row | Context menu with "Add to Scene" option (same behavior as `+` button) |
| Scene function toolbar | Floating mini-toolbar on Scene Canvas | One-tap icons for transpose / tempo / repeat / probability — inserts function node after selected node |

The `+` icon on Matrix rows is always visible (not a modal "pencil mode"). This avoids mode confusion — no state to track, no mode indicator needed. The icon appears in the row header area next to the pattern number.

When inserting via `+` button with no Scene Canvas visible, the node is placed automatically (grid-snapped position to the right of the insertion target). The user can reposition later when viewing the Scene.

**Node rendering:**
- Pattern nodes: rounded rect with pattern name, density indicator (like matrix cells)
- Function nodes: smaller, colored by type (transpose=purple, tempo=orange, repeat=green, probability=yellow)
- Root node: distinct border (olive glow)
- Playing node: blue pulse animation
- Edges: directional arrows, animated during playback

### Playback State

```typescript
interface ScenePlayback {
  playing: boolean
  currentNodeId: string | null    // currently playing node
  currentPatternId: string | null // pattern being played
  playheads: number[]             // 8 track step positions
  traversalStack: string[]        // history for cycle detection / debugging
}
```

The engine receives pattern data the same way — `patternToWorklet()` reads from `song.patterns[id].cells[i]` instead of `song.sections[index].cells[i]`. The scene controls which pattern is sent to the worklet and when to advance.

### Relationship to Matrix View (ADR 043)

Matrix View is repurposed from "section × track arrangement grid" to "pattern pool browser":

```
Before (ADR 043):
  Matrix rows = arrangement positions (sections 0–63)
  Matrix cols = tracks

After (ADR 044):
  Matrix rows = patterns in pool
  Matrix cols = tracks
  Click pattern → edit in step sequencer
  Drag pattern → create node on scene canvas
  [+] button → insert pattern into scene (non-D&D alternative)
  Long-press → context menu with "Add to Scene"
```

The matrix no longer implies arrangement order. It's purely a pattern library with density visualization. The `+` button on each row provides a non-modal shortcut for scene insertion, essential for mobile and when the Scene Canvas is hidden.

### Desktop Layout

```
┌────────────────────────────────────────────────────┐
│ AppHeader                                          │
│ PerfBar                                            │
├──────────┬─────────────────────────┬───────────────┤
│ Matrix   │ Step Sequencer          │ DockPanel     │
│ (pattern │ or Tracker              │ (params/FX)   │
│  pool)   │                         │               │
│          ├─────────────────────────┤               │
│          │ Scene Canvas            │               │
│          │ (node graph)            │               │
└──────────┴─────────────────────────┴───────────────┘
```

The Step Sequencer and Scene Canvas share the center area. Toggle between them or use a vertical split (resizable).

### Mobile Layout

Same functionality, canvas adapts to touch:
- Full-screen scene canvas (swipe to access)
- Pattern list instead of matrix grid
- Drag-and-drop with touch hold

## Implementation Phases

### Phase 0: Preparatory Refactor (Decouple Pattern Data from Arrangement)

Introduce the `Pattern` type and indirection layer **without changing any runtime behavior**. This separates the two concerns currently conflated in `Section`: pattern data (cells) vs arrangement metadata (repeats, key, oct, FX).

**Data model change:**

```typescript
// NEW: Pattern holds only cell data
interface Pattern {
  id: string
  name: string          // max 8 chars
  cells: Cell[]         // 8 fixed (one per track)
}

// CHANGED: Section becomes a thin arrangement slot referencing a Pattern
interface Section {
  patternIndex: number  // index into Song.patterns (was: inline cells[])
  repeats: number
  key?: number
  oct?: number
  perf?: number
  perfLen?: number
  verb?: ChainFx
  delay?: ChainFx
  glitch?: ChainFx
  granular?: ChainFx
}

// CHANGED: Song gains a pattern pool
interface Song {
  name: string
  bpm: number
  rootNote: number
  tracks: Track[]
  patterns: Pattern[]   // NEW: pattern pool
  sections: Section[]   // CHANGED: sections reference patterns by index
}
```

**Steps:**

1. Add `Pattern` type (`{ id, name, cells[] }`)
2. Add `Song.patterns: Pattern[]` — pattern pool
3. Change `Section`: remove `cells[]` and `name`, add `patternIndex: number`
4. Migrate factory: `makeEmptySection()` creates a Pattern + Section pair; `makeDefaultSong()` populates `song.patterns` from factory data and sets `section.patternIndex` accordingly
5. Update `patternToWorklet()`: read `song.patterns[sec.patternIndex].cells[i]` instead of `sec.cells[i]`
6. Update `cloneSection()` / `cloneSong()` / `restoreSong()` for new structure
7. Update `sectionHasData()`: check `song.patterns[sec.patternIndex]` for active trigs
8. Update UI components (SectionNav, MatrixView, AppHeader) — minimal changes, mostly changing `sec.cells` → `song.patterns[sec.patternIndex].cells`
9. Update `SONG_PRESETS` / `songLoadPreset()` — presets reference `patternIndex` instead of copying cells inline

**What does NOT change:**
- `advanceSection()`, `loopStart/loopEnd`, `playback.currentSection` — arrangement logic stays identical
- SectionNav UI layout — still shows slots with metadata editing
- Playback flow in App.svelte — untouched
- Step sequencer / tracker — reads cells via the new indirection but otherwise unchanged

**Verification:** All existing behavior should be identical after Phase 0. Same playback, same UI, same presets — just with an indirection layer between sections and cell data.

### Phase 1: Pattern Pool (Complete Separation)

1. Enable pattern re-use: multiple sections can reference the same `patternIndex`
2. **Matrix View redesign**: repurpose from section timeline to pattern pool browser
   - Current layout (section × track grid with density) loses its timeline meaning
   - Layout options to evaluate: pattern name list with mini density bars, name-based grid, or keep track-column grid
   - Patterns are an unordered collection — vertical axis no longer implies arrangement order
   - Need: filter/sort (has data, used in scene, empty), scene-usage indicator
   - Pattern count may grow beyond 64 — layout must scale
3. Add pattern CRUD: create, duplicate, delete patterns in the pool
4. `ui.currentPattern` replaces pattern-selection aspect of `ui.currentSection`
5. Step sequencer edits selected pattern (decoupled from section selection)
6. `Song.scene: Scene` — initially auto-generated linear chain from existing sections (migration bridge)
7. Remove `Section.repeats` (absorbed by `repeat` function node)
8. Remove `Section.key/oct` (absorbed by `transpose` function node)

### Phase 2: Scene Canvas (View Only)

1. `SceneView.svelte` — canvas component (reuse FX pad canvas patterns)
2. Render nodes and edges from `song.scene`
3. Node click → select pattern → step sequencer updates
4. Node drag → reposition on canvas
5. Visual states: root, playing, selected
6. Place in center area (toggle or split with step sequencer)

### Phase 3: Scene Editing

1. Drag pattern from Matrix → Scene canvas (create node)
2. Matrix `+` button and long-press "Add to Scene" (non-D&D insertion)
3. Drag from node output → node input (create edge)
4. Delete nodes and edges
5. Set root node
6. Add function nodes via Scene floating toolbar (transpose, tempo, repeat)
7. Edge ordering (multiple outgoing edges)
8. Undo/redo for scene edits

### Phase 4: Scene Playback

1. Graph traversal engine (follow edges from root)
2. Pattern switching at beat boundary (reuse `advanceSection` timing)
3. Function node processing (transpose, tempo, repeat)
4. Cycle handling (detect and allow infinite loops)
5. Visual playback indicator (animate current node + edge)
6. Root loop (restart from root when dead end)

### Phase 5: Probability Node & Polish

1. Probability node (weighted random branch selection)
2. Scene presets (replace `SONG_PRESETS` with scenes)
3. Canvas zoom/pan
4. Mobile scene view
5. Copy/paste nodes and subgraphs

## Considerations

- **Phase 0 as safety net**: Phase 0 is a pure refactor — no behavior changes, no new UI. It can be verified by confirming all existing functionality works identically. If Phase 0 succeeds, subsequent phases have a clean foundation. If the project pivots, Phase 0's indirection layer is still useful (pattern re-use becomes trivial).
- **Migration from sections**: Current 64 sections become 64 patterns in the pool (Phase 0 creates the 1:1 mapping, Phase 1 enables N:1 re-use). The LOFI preset arrangement becomes a simple linear scene (A→B→C→...).
- **Performance**: Canvas rendering follows the FX pad model — requestAnimationFrame with band-driven animation. Node count is typically small (< 50 nodes).
- **Undo**: Scene edits (add/remove nodes, edges) use the existing snapshot-based undo system. Phase 0 updates `cloneSong()`/`restoreSong()` to handle the new indirection.
- **FX overrides**: Per-section FX state (`verb`, `delay`, `glitch`, `granular` on Section) is replaced by FX function nodes in the scene, applied as modifiers to downstream pattern nodes. During Phase 0, FX state remains on Section (moved to SceneNode in Phase 1+).
- **Variable step counts**: Each pattern's cells can have different step counts per track. The worklet handles polymetric playback. Graph traversal advances to the next node when track 0 completes its cycle (same as current behavior).
- **Complexity budget**: The node graph adds conceptual complexity. The UI must make simple cases simple (drag 3 patterns, connect linearly) while enabling advanced flows (branching, probability) for power users.

## Supersedes

| ADR | Impact |
|-----|--------|
| 027 (Node Chain) | Early proposal for node-based song builder. ADR 044 is the refined, production-ready evolution — same core concept (canvas + pattern nodes + connections + branching) with concrete data model, phased implementation, and FX pad canvas reuse. |
| 037 (ChainView Redesign) | Proposed improvements to the linear chain view (expandable rows, pattern picker, drag-reorder, timeline). The chain view itself is replaced by SectionNav (arrangement slots) + Matrix View (pattern pool) + Scene Canvas (node graph). |
| 042 (Section-Based Arrangement) | Section model replaced by Pattern + Scene. Inline cells → Pattern pool. Linear loopStart/loopEnd → Scene traversal. |
| 043 (Matrix View) | Matrix View repurposed from arrangement grid to pattern pool browser. |

## Future Extensions

- **Scene templates**: Save/load scenes as presets
- **Sub-scenes**: A scene node that references another scene (nested graphs)
- **Audio-reactive branching**: Function node that branches based on audio input level
- **Timeline view**: Optional linear timeline derived from scene for traditional arrangement editing
- **Collaborative scenes**: Multiple users editing the same scene in real-time
- **MIDI mapping**: Map MIDI controls to scene node triggering (launch nodes live)
- **Conditional nodes**: Branch based on play count, time, or user input
