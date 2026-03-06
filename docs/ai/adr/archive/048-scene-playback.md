# ADR 048 — Scene Playback: Random Branching & Terminal Stop

| field   | value                              |
| ------- | ---------------------------------- |
| status  | implemented                        |
| date    | 2026-03-05                         |
| parent  | ADR 044 (Scene Graph)              |

## Context

Scene graph playback (`advanceSceneNode`) has two hard-coded behaviors that
limit musical expression:

1. **Deterministic branching** — When a pattern node has multiple outgoing edges,
   playback always follows the first edge (`outEdges[0]`). This makes branching
   useless for pattern nodes; only the dedicated `probability` function node
   picks randomly. The comment "Phase 5 adds probability branching" has not been
   implemented.

2. **Infinite loop** — When a node has no outgoing edges (terminal), playback
   resets to the root node. There is no way to create a song that ends — scene
   playback loops forever.

### Current code

```
// advanceSceneNode() — line 1268
if (outEdges.length === 0) {
  playback.sceneTranspose = 0
  return startSceneNode(root)           // ← always loops
}
return walkToNode(outEdges[0])          // ← always first edge

// walkToNode() — function node dead end
if (fnEdges.length === 0) {
  playback.sceneTranspose = 0
  return startSceneNode(root)           // ← always loops
}
currentEdge = node.type === 'probability'
  ? fnEdges[Math.floor(Math.random() * fnEdges.length)]
  : fnEdges[0]                          // ← first edge for non-probability
```

## Decision

### 1. Random branching at all forks

When any node (pattern or function) has multiple outgoing edges, pick one at
random. This applies uniformly — the `probability` node type is no longer the
only source of non-determinism.

```ts
// Unified random pick for any node type with multiple edges
const pick = edges[Math.floor(Math.random() * edges.length)]
```

The `edge.order` field is retained for display sorting in the scene canvas but
no longer affects playback selection.

The `probability` function node retains its identity as a named node type (users
may still place it for visual clarity), but its behavior is now identical to
the default: random pick among outgoing edges. No special-casing required.

### 2. Terminal nodes stop playback

When a pattern node has no outgoing edges, playback stops instead of looping to
root. This gives users a natural "end of song" mechanism: leave the final
pattern node unconnected.

Function node dead ends (no outgoing edges from a function node mid-chain) also
stop playback, since there is no pattern to play.

**Return value change:**

```ts
// advanceSceneNode return type gains `stop` flag
export function advanceSceneNode(): {
  advanced: boolean
  patternIndex: number
  stop?: boolean           // ← new: signals App.svelte to call stop()
}
```

App.svelte checks `stop` and calls `stop()`:

```ts
// App.svelte onStep callback
const result = advanceSceneNode()
if (result.stop) { stop(); return }
```

### 3. Reset behavior on manual replay

When the user presses play after a terminal stop, scene playback restarts from
root (existing behavior — `sceneNodeId` is cleared by `stop()`).

## Changes

### state.svelte.ts

- `advanceSceneNode()`:
  - `outEdges.length === 0` → return `{ advanced: false, patternIndex: -1, stop: true }`
  - `outEdges.length > 0` → `walkToNode(edges[Math.floor(Math.random() * edges.length)])`
- `walkToNode()`:
  - Function node dead end → return `{ advanced: false, patternIndex: -1, stop: true }`
  - Multi-edge from function node → always random pick (remove `probability` special case)
- `startSceneNode()`:
  - Multi-edge from root function node → always random pick (remove `probability` special case)

### App.svelte

- `onStep` callback: check `result.stop` → call `stop()`

## Migration

No data migration needed. `SceneEdge.order` is kept as-is. `probability` node
type remains valid in the type union — it just behaves like any other function
node at forks.
