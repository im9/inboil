# ADR 066: Scene Node Decorators — Function Node Snap-Attach Model

## Status: Implemented

## Context

Function nodes (Transpose, Tempo, Repeat, FX) were placed inline within edge chains:

```
[Pattern A] ──→ [T+5] ──→ [Pattern B]
```

Problems with this design:

1. **No initial settings on root node** — function nodes require edges, so the playback start pattern cannot have Transpose or FX applied
2. **Graph clutter** — changing a pattern's settings requires extra nodes and edges, adding visual noise
3. **Not intuitive** — function nodes represent "pattern attributes" but exist as independent graph nodes

### Code references (pre-implementation)

- `SceneNode` type: `state.svelte.ts`
- Traversal logic `walkToNode()`: `state.svelte.ts` — applies function node effects while walking edge chains
- Rendering: `SceneView.svelte` — function nodes rendered as 48×24px pills
- Function node creation: `sceneAddFunctionNode()`: `state.svelte.ts`

## Decision

### Overview

Attach function nodes directly to pattern nodes as **decorators**.
In the UI, dragging a function node close to a pattern node triggers **snap-attach**.

```
Before: [Pat A] ──→ [T+5] ──→ [Pat B]

After:  [Pat A]        [Pat B]
         ├ T+5    ──→    ├ FX verb
         └ ×140          └ RPT2
```

### Data model

Added `decorators` field to `SceneNode`:

```typescript
export interface SceneNode {
  id: string
  type: 'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx'
  x: number
  y: number
  root: boolean
  patternId?: string
  params?: Record<string, number>
  decorators?: SceneDecorator[]   // function nodes attached to this pattern
}

export interface SceneDecorator {
  type: 'transpose' | 'tempo' | 'repeat' | 'fx'
  params: Record<string, number>
}
```

- `decorators` only on pattern nodes (function nodes do not carry decorators)
- `probability` is not a decorator (remains edge-based for branching semantics)
- Old data without `decorators` gets `[]` fallback via `??=`

### Traversal changes

When `walkToNode()` / `startSceneNode()` reaches a pattern node, `applyDecorators()` runs before playback starts, applying each decorator in array order.

Legacy edge-chain function nodes continue to work (backward compatible).

### UI: Snap-attach

```
                  ┌──────────┐
  Dragging:       │ Pattern A│
                  └──────────┘
                       ↑ approach
                  ┌────┐
                  │T+5 │  ← function node
                  └────┘

                  ┌──────────┐
  After snap:     │ Pattern A│
                  │  ├ T+5   │  ← bound as decorator
                  └──────────┘
```

**Snap detection:**
- Highlight when function node center is within **60px** of a pattern node
- Drop confirms → function node removed, added to pattern's `decorators[]`
- Detach via popup `×` button → standalone function node re-created nearby

**Pattern node rendering:**
- Decorators displayed as compact pill rows below the pattern node
- Each decorator: icon + parameter label (7px font, dark rounded tag)

```
┌──────────────────┐
│  ♪ Intro         │  ← pattern name (72×32)
├──────────────────┤
│ ♫ T+5  ◴ ×140   │  ← decorators (pill row)
└──────────────────┘
```

### SceneNodePopup integration

When a pattern node with decorators is selected, a popup appears with:
- Per-decorator +/− parameter controls
- REL/ABS mode toggle for transpose decorators
- FX toggle buttons (VRB/DLY/GLT/GRN)
- `×` detach button to remove a decorator back to standalone node

### IndexedDB compatibility

- `decorators` is optional → old data returns `undefined`
- `restoreScene()` fills `decorators ??= []` on load
- No DB_VERSION increment needed (additive field only)

### Pure data functions (`sceneData.ts`)

Clone, restore, and migration logic extracted into a testable pure module:
- `cloneSceneNode()` / `cloneScene()` — deep clone including decorators
- `restoreScene()` — restore from saved data with defaults
- `hasMigratableFnNodes()` / `migrateFnToDecorators()` — edge-chain migration

## Implementation Phases

### Phase 1: Data model + traversal logic ✓
- `SceneDecorator` type and `SceneNode.decorators` field
- `applyDecorators()` integrated into `startSceneNode()` / `walkToNode()`
- Default value fallback on load

### Phase 2: Snap UI + micro-interactions ✓
- Snap candidate highlight on function node drag (60px threshold)
- Attach on drop / detach via popup
- Decorator pill display below pattern nodes
- **Attach animation**: bounce snap (`cubic-bezier(0.2, 0, 0, 1.3)`, 200ms)
- **Playing pulse**: decorator flash on playback (80ms)
- **Hover preview**: decorator row lifts 1px (`translateY(-1px)`, 60ms ease-out)

### Phase 3: Popup integration ✓
- `SceneNodePopup` extended with decorator parameter editing UI
- Per-decorator +/− controls, mode toggles, FX toggles
- Detach button (`×`) to convert back to standalone node

### Phase 4: Migration utility ✓
- `migrateFnToDecorators()` detects `[...] → [Fn] → [Pattern]` chains
- Converts function node to decorator, rewires incoming edges to target pattern
- One-click toolbar button (shown only when migratable nodes exist)
- Unit tests: 19 tests covering clone, restore, and migration

## Edge branching semantics

With decorators handling function application, edges become purely for **routing**:

```
Before:  edges = routing + function application (ambiguous)
After:   decorators = function application (attached to pattern)
         edges = pure routing (flow control only)
```

### Branching = probabilistic transition

Multiple outgoing edges from a node represent **probabilistic branching**:

```
              ┌──→ [Pat B ├ T+5]     ← 50%
[Pat A] ──┤
              └──→ [Pat C ├ FX verb]  ← 50%
```

- **Single edge** → deterministic transition (100%)
- **Multiple edges** → equal probability or weighted selection
- Edge `weight` property for weighted branching (future)

### Probability node status

The `probability` node type overlaps with edge branching. Transition plan:

1. **Current**: both coexist; `probability` nodes kept for backward compatibility
2. **Future**: deprecate `probability` nodes once weighted edge branching is stable

## Considerations

- **Edge-based function nodes phased out** — replaced by decorators; Phase 4 migration converts existing data
- **Decorator application order** — applied in array order; reordering possible in UI
- **Repeat decorator + edge-based repeat overlap** — decorator applied first (override, not multiply)
- **Undo support** — attach/detach/update all use `pushUndo()`
- **Mobile** — snap uses same 60px distance threshold for touch

## Future Extensions

- Decorator presets ("Breakdown" = Tempo −20 + FX verb on)
- Right-click menu on pattern node to add decorators directly
- Decorator color coding (type-based: transpose=olive, tempo=blue, fx=salmon)
- Ghost preview while snapping (semi-transparent decorator appears on approach)
