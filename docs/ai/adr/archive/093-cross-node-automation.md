# ADR 093: Decorator Migration & Step Automation

## Status: Implemented

## Context

Scene decorators (ADR 053/066) are attached directly to pattern nodes. This creates several problems:

1. **Decorators are invisible** — users don't know they exist until they stumble into the DockPanel decorator editor. In normal workflow (write patterns → arrange in scene), decorators are hidden complexity.
2. **Automation UX mismatch** — curve editor (bezier/freehand) feels disconnected from the step sequencer. Per-step control (like velocity/chance) is more intuitive for most use cases.
3. **DockPanel complexity** — conditional rendering of decorator sections adds branching logic and makes the panel harder to maintain.
4. **Pattern nodes conflate concerns** — "what plays" and "what parameter changes happen" are mixed in one node.

### What the original ADR 093 proposed

Cross-node automation spans via `crossNode` flag + horizontal snap "Tetris" blocks. This addressed gradual transitions across multiple patterns but added significant complexity (span calculation, snapshot lifecycle, block rendering).

### Why rewrite

The per-step automation approach (paramLocks) solves most use cases more intuitively. For global parameters that don't fit per-step (tempo ramps, master volume), function nodes in the scene graph provide explicit visual control. The cross-node span concept becomes unnecessary.

## Decision

### 1. Move decorators to function nodes

Pattern nodes become **pure "play this pattern"** — no decorators, no parameter overrides.

Current decorator types become function node behaviors:

| Current decorator | → Function node type | Rationale |
|---|---|---|
| `transpose` | Transpose node | Scene-level key change — stays in graph |
| `tempo` | Tempo node | Global BPM change — stays in graph |
| `repeat` | Repeat node | Loop count — stays in graph |
| `fx` | FX node | Send/flavour override — stays in graph |
| `automation` (curve) | **Removed** | Replaced by per-step paramLocks |

Function nodes connect via edges like any other node. The scene graph visually shows parameter flow:

```
[Transpose +5] → [Pattern A] → [Tempo 140] → [Pattern B]
```

Function nodes apply their effect when the scene traversal reaches them, then immediately follow the outgoing edge to the next node. They don't occupy playback time.

### 2. Per-step automation via paramLocks

Extend `Trig.paramLocks` to support track-level and send parameters:

```typescript
// Existing paramLocks (voice params like cutoff, resonance)
paramLocks?: Record<string, number>

// New keys added to the same paramLocks record:
// 'vol'         → track volume override (0–1)
// 'pan'         → track pan override (-1 to 1)
// 'reverbSend'  → reverb send override (0–1)
// 'delaySend'   → delay send override (0–1)
// 'glitchSend'  → glitch send override (0–1)
// 'granularSend' → granular send override (0–1)
```

These per-step overrides work exactly like existing voice paramLocks — set on individual trigs, applied at step boundaries in the worklet.

**UI**: Same pattern as velocity/chance editing:
- Select step(s) in StepGrid or PianoRoll
- Adjust parameter in DockPanel or dedicated automation row
- Visual feedback: colored bar height per step (like velocity row)

**Interpolation (smooth by default)**:

Per-step values define **targets**, not instantaneous jumps. The worklet interpolates between the current value and the target value sample-by-sample, producing smooth ramps by default:

```
Step values:     0.2       0.5       0.8       0.3

Smooth (default): ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╲╲╲╲╲╲╲   ← linear ramp between steps
Stepped:          ___|‾‾‾‾‾‾|‾‾‾‾‾‾|___|     ← hard jump at step boundary
```

- **Smooth** (default): linear interpolation across the step duration. Natural for filter sweeps, volume fades, send level transitions. Most common use case.
- **Stepped**: value jumps instantly at step boundary. Useful for choppy/glitch effects, gated pads, rhythmic parameter modulation.

The mode is per-paramLock key — users can have smooth volume and stepped filter cutoff on the same step. Implementation: a flag per trig paramLock entry, or a global per-track toggle per parameter.

**Worklet integration**: The worklet maintains a `currentVal` and `targetVal` per track for each overridable parameter. On step advance, `targetVal` is updated from the trig's paramLock. In the per-sample loop:

```typescript
// Per-sample interpolation (smooth mode):
// rampCoeff = 1.0 / samplesPerStep — reaches target by next step
this.trackVol[t] += (targetVol - this.trackVol[t]) * rampCoeff

// Stepped mode: immediate assignment
this.trackVol[t] = targetVol

// Mix output uses interpolated value:
const gain = this.trackVol[t] * this.muteGains[t]
```

When no paramLock is set on a trig, the value holds (no change) — same behavior as velocity holding its last value until a new trig.

### 3. DockPanel simplification

With decorators moved to function nodes and automation moved to paramLocks:

- **Remove** `DockDecoratorEditor.svelte` section entirely
- **Remove** `DockAutomationEditor.svelte` (curve editor)
- **Add** paramLock editing to `DockTrackEditor` (when step selected)
- DockPanel focuses on: track params, voice params, paramLock overrides, FX/EQ controls

The `scenePatternNode` derived state and its conditional branches in DockPanel can be removed.

### 4. Function node improvements (out of scope)

Function node visual design and UX (BACKLOG item "Node function UX") is a separate concern. This ADR only addresses the data model migration and DockPanel cleanup.

## Data Model Changes

### SceneNode

```typescript
// Remove decorators from pattern nodes
interface SceneNode {
  id: string
  type: 'pattern' | 'generative' | 'transpose' | 'tempo' | 'repeat' | 'fx'
  // ... existing fields
  decorators?: never  // deprecated — migrate to function nodes
  // Function node params (type-specific)
  fnParams?: {
    transpose?: { semitones: number; mode: 'rel' | 'abs' }
    tempo?: { bpm: number }
    repeat?: { count: number }
    fx?: { verb: boolean; delay: boolean; glitch: boolean; granular: boolean; flavourOverrides?: Partial<FxFlavours> }
  }
}
```

### Trig paramLocks

No schema change needed — `paramLocks` is already `Record<string, number>`. New keys (`vol`, `pan`, `reverbSend`, etc.) are recognized by the worklet.

## Migration

### Decorator → function node migration

In `restoreSong()`:

```typescript
for (const node of song.scene.nodes) {
  if (node.decorators?.length) {
    for (const dec of node.decorators) {
      if (dec.type === 'automation') continue  // drop curve automations
      // Create function node with edge → pattern node
      const fnNode = createFunctionNode(dec, node)
      song.scene.nodes.push(fnNode)
      // Rewire: incoming edges → fnNode, fnNode → pattern node
      rewireEdges(song.scene.edges, node.id, fnNode.id)
    }
    delete node.decorators
  }
}
```

Automation curve decorators are dropped (no paramLock equivalent for arbitrary curves). This is acceptable — only one user, curves can be recreated as paramLocks.

## Scene Traversal Changes

In `scenePlayback.ts`, `applyDecorators()` is replaced by function node handling in `walkToNode()`:

```typescript
function walkToNode(nodeId: string): SceneNode {
  const node = findNode(nodeId)
  if (!node) return null

  // Function nodes: apply effect and follow edge immediately
  if (node.fnParams) {
    applyFunctionNode(node)
    const edge = getOutgoingEdge(node.id)
    if (edge) return walkToNode(edge.to)  // recurse to next node
    return null  // dead end
  }

  // Pattern/generative nodes: stop and play
  return node
}
```

Function nodes are "pass-through" — they apply their effect (set tempo, transpose, toggle FX) and the traversal continues to the next node without stopping.

## Implementation Phases

### Phase 1: Per-step paramLock automation
- Add `vol`, `pan`, send keys to worklet paramLock handling
- Smooth interpolation in worklet (linear ramp per sample, default behavior)
- UI for editing per-step track params (velocity-row pattern)
- DockTrackEditor: paramLock section when step selected

### Phase 2: Decorator → function node migration
- Migration in `restoreSong()`
- Update `walkToNode()` for pass-through function nodes
- Remove `applyDecorators()` / decorator snapshot lifecycle
- Remove `DockDecoratorEditor.svelte` and `DockAutomationEditor.svelte`

### Phase 3: DockPanel cleanup
- Simplify conditional rendering
- Remove `scenePatternNode` derived state
- Consolidate track param + paramLock editing

## Considerations

- **Smooth by default**: Most musical parameter changes (filter sweeps, volume fades, send levels) sound better with smooth transitions. Stepped mode is opt-in for rhythmic/glitch effects.
- **Curve automation loss**: Dropping curve-based automation is a trade-off. Per-step paramLocks with smooth interpolation cover most use cases. The resolution is step-level (not sample-level), but at 1/16 or 1/32 resolution, the difference is inaudible.
- **Function node chains**: Multiple function nodes before a pattern node apply in traversal order (left to right in the graph). This is deterministic and visually explicit.
- **Generative nodes**: Unaffected — they already have their own DockGenerativeEditor.
- **ADR 093 cross-node spans**: Superseded. If gradual transitions are needed across patterns, per-step paramLocks on each pattern achieve the same result with more control.
