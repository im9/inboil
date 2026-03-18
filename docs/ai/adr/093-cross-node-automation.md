# ADR 093: Cross-Node Automation

## Status: Proposed

## Context

Scene decorators (ADR 053/066) are currently **per-pattern-node**. Each node has its own set of decorators, and when the scene graph advances to the next node, the previous node's automations are snapshot-restored and replaced.

This works for isolated patterns but fails for gradual transitions that span multiple patterns. For example:

- Gradually sweeping delay feedback from 0% → 80% across a 4-pattern chain (intro → buildup)
- Slowly opening a filter over an entire song section (A→B→C→D)
- A tempo accelerando that spans multiple patterns

These are bread-and-butter arrangement techniques in any DAW, but the current per-node automation model cannot express them.

### Current automation lifecycle

```
Node A plays
  ├── snapshot current values
  ├── apply A's automations (per-step interpolation)
  └── pattern ends → advance

Node B plays
  ├── restore snapshot ← A's automation effect is erased
  ├── snapshot again
  ├── apply B's automations (starts from scratch)
  └── pattern ends → advance
```

The restore-on-advance behavior means an automation curve's effect is always confined to a single pattern's duration. There is no concept of "this curve spans the next 4 nodes."

### Known issues with current decorator automation

- **Pattern length sync**: Automation curves do not sync to the pattern's step count — curves repeat mid-pattern when the pattern is longer than the curve's implicit duration, causing unintended parameter cycling
- **UX mismatch**: The curve editor (bezier/freehand) feels disconnected from the step sequencer workflow. A step-based automation lane (like the velocity row) may be more intuitive for per-pattern automation, reserving curve-based editing for cross-node spans

These issues should be addressed as part of the cross-node automation redesign rather than patched independently.

## Decision

### Cross-node flag on automation decorators

Add a `crossNode` flag to `AutomationParams`:

```typescript
export interface AutomationParams {
  target: AutomationTarget
  points: AutomationPoint[]
  interpolation: 'linear' | 'smooth'
  crossNode?: number  // span: number of nodes this automation covers (including origin)
}
```

- `crossNode: undefined | 0 | 1` → current behavior (single node)
- `crossNode: 4` → automation spans 4 consecutive nodes in the chain

### Position calculation

When `crossNode > 1`, the automation's `t` (0.0–1.0) is normalized to the **total step count** across all spanned nodes, not just the current pattern:

```
Node A (16 steps) → Node B (32 steps) → Node C (16 steps) → Node D (16 steps)
crossNode: 4, total: 80 steps

t position during node A: 0/80 → 16/80 = 0.0 → 0.2
t position during node B: 16/80 → 48/80 = 0.2 → 0.6
t position during node C: 48/80 → 64/80 = 0.6 → 0.8
t position during node D: 64/80 → 80/80 = 0.8 → 1.0
```

### Modified scene graph lifecycle

```
Node A plays (has crossNode:4 automation)
  ├── snapshot current values
  ├── apply automation, t = local_pos / total_span_steps
  └── pattern ends → advance

Node B plays
  ├── DO NOT restore snapshot (cross-node automation still active)
  ├── continue automation, t = (A_steps + local_pos) / total_span_steps
  ├── remaining span: 3
  └── pattern ends → advance

...

Node D plays
  ├── continue automation, remaining span: 1
  ├── t approaches 1.0
  └── pattern ends → restore snapshot (span exhausted)
```

### State changes

```typescript
// playback state additions
crossNodeAutomations: {
  params: AutomationParams
  snapshot: AutomationSnapshot
  remainingNodes: number
  elapsedSteps: number
  totalSteps: number  // pre-calculated from chain inspection
}[]
```

### Chain inspection

When a cross-node automation starts, the scene graph is walked forward to calculate total step count:

```typescript
function calculateSpanSteps(startNodeId: string, span: number): number {
  let total = 0
  let nodeId = startNodeId
  for (let i = 0; i < span; i++) {
    const node = findNode(nodeId)
    if (!node || node.type !== 'pattern') break
    const pat = song.patterns.find(p => p.id === node.patternId)
    total += pat ? Math.max(...pat.cells.map(c => c.steps)) : 16
    // Follow first outgoing edge
    const edge = song.scene.edges.find(e => e.from === nodeId)
    if (!edge) break
    nodeId = edge.to
  }
  return total
}
```

### Scene view: horizontal snap (Tetris model)

Cross-node spans are represented visually by **snapping pattern nodes together horizontally** in the scene canvas. Adjacent nodes that share a cross-node automation fuse into a single block:

```
Separate nodes (no span):
[A] ──→ [B] ──→ [C] ──→ [D]

Snapped block (span = 4):
┌──────┬──────┬──────┬──────┐
│  A   │  B   │  C   │  D   │
└──────┴──────┴──────┴──────┘
  delay fb: 0% ──────────→ 80%    ← automation visualized below block
```

**Snap interaction:**
- Drag a pattern node close to another's right edge → snap guide appears → release to join
- Left-most node in the block is the span origin (left = first to play)
- Detach by dragging a node away from the block (or context menu "Unsnap")
- Block acts as a single draggable unit in scene canvas (move/select together)

**Visual rules:**
- Horizontal only — vertical snap is not supported (avoids ambiguity with layering/parallel concepts)
- Thin dividers between patterns within the block (like Tetris piece segments)
- Shared automation curves rendered as a mini-waveform strip below the block
- Block outline color matches the automation target's accent

**Relationship to edges:**
- Snapped patterns have implicit edges (left → right adjacency = connection)
- Explicit edge arrows are hidden within the block, shown only at entry/exit
- Outgoing edges from the last node, and incoming edges to the first node, render normally
- Branching from a mid-block node breaks the block at that point (block splits)

### Automation editor (within span)

```
┌──────────────────────────────────┐
│ TARGET: [delay feedback    ▾]    │
│ MODE:   ● Bezier  ○ Freehand    │
├──────────────────────────────────┤
│     ╱                            │
│   ╱           (curve)            │
│ ╱                                │
│ A    │  B       │  C   │  D     │  ← node boundaries shown as guides
├──────────────────────────────────┤
```

When a block contains multiple nodes, the automation editor canvas shows node boundary markers so the user can see where each pattern begins/ends within the curve. The span is determined by the block's node count — no separate span selector needed.

## Considerations

- **Forks (branching)**: If node A has two outgoing edges (A→B, A→C), span calculation follows the edge that is actually taken at runtime. Pre-calculation uses the first/default edge; if a different branch is taken, the span may be shorter than expected. Acceptable trade-off — deterministic chains are the primary use case
- **Loops**: If the chain loops back (D→A), the cross-node automation completes and the snapshot is restored. The looped node starts fresh. No special handling needed
- **Random routing**: Probabilistic edge selection (ADR 066) means the exact chain is unknown at design time. Span calculation becomes an estimate. Could show a warning in UI: "Span may vary due to random routing"
- **Multiple cross-node automations**: Overlapping spans on different targets work independently. Same-target overlaps: later automation's value wins (last-write-wins, same as current stacking behavior)
- **Alternative: edge decorators**: Attaching decorators to edges instead of nodes was considered. Simpler per-transition but cannot express "gradual change across N nodes" — only "instant change at transition." The span model is more expressive
- **Step count mismatch**: Different patterns may have different step counts (16 vs 32). The position normalization handles this naturally

## Implementation Phases

### Phase 1: Core span logic
- Add `crossNode` to `AutomationParams`
- Modify `advanceSceneNode` / `walkToNode` to preserve cross-node automations across transitions
- Chain inspection for total step calculation
- Position normalization in `applyAutomations`

### Phase 2: Horizontal snap UI
- Snap detection on node drag (proximity to right edge of another pattern node)
- Block rendering: fused outline, thin dividers, hidden internal edges
- Block as single drag/select unit
- Unsnap interaction (drag away or context menu)
- Mini automation strip below block

### Phase 3: Automation editor integration
- Node boundary markers in automation canvas (derived from block)
- Block node count determines span automatically (no manual selector)
- Warning for non-deterministic chains (random edges within span)
- Undo support for snap/unsnap

### Decorator migration: pattern node → function node

Current decorator automation is attached directly to pattern nodes, which creates several problems:
- Decorators are invisible/implicit — users don't know they're there until they find the editor
- Pattern nodes conflate two concerns: "what plays" and "what parameter changes happen"
- Hard to reason about when effects apply vs. when they're restored

**Proposed change**: Move decorator/automation functionality from pattern nodes to **function nodes**:

- Pattern nodes become pure "play this pattern" — no parameter overrides
- Function nodes inserted between pattern nodes act as explicit parameter transformers ("open filter here", "reduce volume to 50%")
- Function nodes are visible in the scene graph, making data flow obvious
- Cross-node spans (this ADR) become a property of function nodes spanning a range of downstream pattern nodes

This enables progressive disclosure:
- Beginners: pattern nodes only, simple sequencing
- Intermediate: add function nodes for parameter control
- Advanced: function nodes with cross-node spans, orchestration layer (ADR 103)

Pattern-level initial values (e.g., "this pattern always starts at volume 0.8") can be stored as simple node properties rather than automation curves.

## Future Extensions

- **Scene-level automation**: A global automation lane not tied to any node, running for the entire scene duration
- **Relative mode**: Cross-node automation as offset from current value (additive), not absolute — enables layering with per-node automations
- **Loop-aware span**: "Loop the curve every N nodes" for repeating modulation patterns across the entire arrangement
- **Crossfade**: Volume automation across a 2-node block enables crossfade-like transitions. However, true crossfade (A still audible while B fades in) requires **2-pattern simultaneous playback** in the worklet — currently only 1 pattern plays at a time. Workaround: use Looper (ADR 087) to capture A to tape, then fade tape volume down while B plays. Full crossfade support would need a worklet architecture change (dual-pattern buffer with overlap)
