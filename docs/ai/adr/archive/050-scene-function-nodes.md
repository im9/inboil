# ADR 050 — Scene Function Nodes: Visual Redesign

| field   | value                              |
| ------- | ---------------------------------- |
| status  | implemented                        |
| date    | 2026-03-05                         |
| parent  | ADR 044 (Scene)              |

## Context

### Current State

ADR 044 defined five scene node types: `pattern`, `transpose`, `tempo`, `repeat`, `probability`. The implementation renders function nodes as small dark rectangles with text labels (`T+5`, `×120`, `RPT2`, `?%`). A `root` boolean flag on any node marks the playback entry point, distinguished only by a border color difference.

### Problems

1. **Root node is invisible**: The root node's visual distinction (1px border) is easily lost after design changes. Users can't tell which node starts playback.

2. **Function nodes are not self-explanatory**: Small dark rectangles with cryptic text labels (`T+5`, `?%`) don't communicate purpose. Users must memorize what each abbreviation means. No visual metaphor connects the node to its function.

3. **Missing function types**: ADR 044 listed transpose, tempo, repeat, probability. Real musical workflows also need FX control (reverb/delay/glitch on/off) and key changes. These are currently handled by the deprecated section system (`Section.verb`, `Section.key`).

### Insight

Max/MSP and similar visual patching environments succeed because each object is instantly recognizable by its icon/shape. The scene should follow the same principle: each function node type has a distinctive SVG icon that communicates its purpose at a glance.

## Decision

### 1. Root flag — keep, improve visually

The `root` boolean flag remains on `SceneNode`. The data model is unchanged. Instead of introducing a separate `start` node type (which adds overhead for simple scenes), the root node gets a strong visual indicator:

- **▶ icon overlay**: A play-triangle SVG icon rendered at the left edge of the root node, outside the node body.
- **Distinct border/shape**: The root node uses a thicker or double border to stand out from non-root nodes even after theme changes.

```
┌─────────────────────────────────────────────────┐
│  Scene Canvas                                   │
│                                                 │
│  ▶[LOFI]──▶[♫ T+5]──▶[4FLOR]──▶[≋ VRB]       │
│    root        │                  │             │
│                └──▶[ACID]─────────┘             │
│                                                 │
└─────────────────────────────────────────────────┘
```

The `▶` marker is not a separate node — it's a visual decoration on whichever node has `root: true`. This keeps the graph simple (no extra node for simple single-pattern scenes) while making the entry point unmistakable.

### 2. Function node types — updated

`key` is merged into `transpose` as an absolute mode. The `transpose` node gains a `mode` param:

- `mode: 0` (relative) — shift root note by `semitones` (existing behavior)
- `mode: 1` (absolute) — set root note to `key` value

This avoids two overlapping node types that both modify `rootNote`.

| Type | Icon | Purpose | Params |
|------|------|---------|--------|
| `transpose` | ♫ (notes) | Change key — relative shift or absolute set | `mode: 0\|1`, `semitones: -12..12` (relative) or `key: 0..11` (absolute) |
| `tempo` | ◴ (metronome) | Change BPM | `bpm: 60..300` |
| `repeat` | ↻ (loop arrows) | Replay N times | `count: 1..16` |
| `probability` | ⚄ (dice) | Intentional branch point | — (ADR 048: all forks are random) |
| `fx` | ≋ (waves) | Toggle FX sends | `verb/delay/glitch/granular: 0\|1` |

### 3. SVG icon rendering

Each function node renders an inline SVG icon instead of (or alongside) a text label. Icons are embedded directly in the Svelte template — no external icon library.

Node visual hierarchy:

| Node kind | Shape | Size | Background | Content |
|-----------|-------|------|------------|---------|
| `pattern` | rectangle | 72×32 | pattern color | pattern name text |
| `pattern` (root) | rectangle | 72×32 | pattern color | ▶ overlay + pattern name text |
| function | rounded rect | 48×24 | `--color-fg` | SVG icon + optional short label |

Function nodes use a rounded-rectangle shape (border-radius: 12px) to distinguish them from pattern nodes (sharp corners).

### 4. Picker UI update

The node picker groups items visually:

```
┌─────────────────┐
│ LOFI            │  ← patterns (as before)
│ 4FLOR           │
│ ACID            │
├─────────────────┤
│ ♫  TRANSPOSE    │  ← function nodes with icons
│ ◴  TEMPO        │
│ ↻  REPEAT       │
│ ⚄  PROBABILITY  │
│ ≋  FX           │
└─────────────────┘
```

### 5. FX function node behavior

The `fx` node acts as a modifier on downstream pattern nodes (same as transpose/tempo). When the graph traversal passes through an `fx` node, it toggles FX sends for subsequent patterns.

```typescript
params: {
  verb: 1,      // 0 = off, 1 = on
  delay: 0,
  glitch: 0,
  granular: 0
}
```

This replaces `Section.verb`, `Section.delay`, etc. from the arrangement system.

### 6. Transpose node — extended behavior

The `transpose` node absorbs the old `key` concept from `Section.key`:

```typescript
// Relative mode (existing behavior)
params: { mode: 0, semitones: 5 }   // shift +5 semitones

// Absolute mode (replaces Section.key)
params: { mode: 1, key: 2 }         // set key to D
```

Display label adapts to mode:
- Relative: `T+5`, `T-3`
- Absolute: `KEY D`, `KEY F#`

### 7. Migration

No data model migration needed — `SceneNode.root` is preserved. Changes:
- Add `fx` to `SceneNode.type` union
- Extend `transpose` params with `mode` field (default `0` for backward compat)
- Update `walkToNode()` to handle `fx` node traversal
- Update rendering to use SVG icons + rounded-rect for function nodes
- Add ▶ overlay rendering for root nodes

## Implementation Phases

### Phase 1: Root visual improvement + SVG icons

1. Add ▶ SVG overlay on root node (left edge of node)
2. Replace text labels with SVG icons for transpose, tempo, repeat, probability
3. Update node styling: rounded-rect shape for function nodes, icon + optional label
4. Update `nodeName()` to return icon-compatible display

### Phase 2: FX function node

1. Add `fx` to `SceneNodeType`
2. Implement graph traversal handling (apply FX state during `walkToNode`)
3. Add param editing UI (FX toggles in popup)
4. Render with ≋ SVG icon
5. Update picker

### Phase 3: Transpose absolute mode

1. Add `mode` param to transpose node
2. Update param editing UI (toggle relative/absolute, value picker)
3. Update display label logic
4. Implement absolute key setting in graph traversal

## Considerations

- **Icon legibility**: At small sizes (24px), icons must be simple silhouettes. Avoid detail-heavy designs. Test at 1x and 2x pixel density.
- **Max/MSP analogy**: The scene is not a full patching environment. Function nodes are modifiers in a directed flow, not arbitrary signal processors. Keep the conceptual model simple: patterns play, functions modify.
- **FX node granularity**: A single `fx` node with 4 toggles is simpler than 4 separate FX nodes. If users need per-FX control at different points in the graph, they can place multiple `fx` nodes. The popup UI for 4 toggles needs care at small sizes — to be refined during implementation.
- **Backward compatibility**: The `probability` node type is retained (ADR 048 makes all forks random, but the node type persists for visual clarity — "this is an intentional branch point"). Existing `transpose` nodes without `mode` param default to relative mode (`mode: 0`).

## Extends

| ADR | Impact |
|-----|--------|
| 044 (Scene) | Adds `fx` node type, extends `transpose` with absolute mode, improves root + function node visuals. Core graph model unchanged. |
