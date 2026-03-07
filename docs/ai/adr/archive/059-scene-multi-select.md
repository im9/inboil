# ADR 059: Scene Multi-Select

## Status: Implemented

## Context

SceneView currently supports single-node selection only (`ui.selectedSceneNode: string | null`). Users cannot select multiple nodes to move, delete, or format them as a group. This makes rearranging complex scenes tedious — each node must be dragged individually.

### Current Selection Model

```typescript
// state.svelte.ts
export const ui = $state({
  selectedSceneNode: null as string | null,   // single node
  selectedSceneEdge: null as string | null,
  selectedSceneLabel: null as string | null,
})
```

**Selection interactions (SceneView.svelte):**
- Click node → `ui.selectedSceneNode = nodeId`
- Click background → clears all selections
- Escape → clears all selections
- Delete → deletes single selected node/edge/label
- Ctrl+C → copies single node (Shift+C copies subgraph rooted at node)

**Drag (SceneView.svelte):**
- `dragging: string | null` — single node ID
- `onMove` calls `sceneUpdateNode(dragging, x, y)` for one node

**Pan (SceneView.svelte):**
- Background left-drag → pan
- Middle mouse / Ctrl+left → also pan
- Scroll wheel → zoom

**Auto-layout (`sceneFormatNodes` in state.svelte.ts):**
- BFS from root, formats **all** nodes — no way to format a subset

## Decision

### A. Default Mode: Select (not Pan)

Switch the default background drag behavior from pan to rectangle select. Pan via Space+drag, middle mouse, or trackpad 2-finger swipe (Illustrator/Photoshop convention):

| Input | Behavior |
|-------|----------|
| Background drag | Rectangle select |
| Space + drag | Pan |
| Middle mouse drag | Pan (unchanged) |
| 2-finger swipe (trackpad) | Pan (wheel deltaX/deltaY) |
| Pinch (trackpad) / Ctrl+scroll | Zoom centered on cursor |
| Scroll wheel (mouse) | Zoom (unchanged) |
| Two-finger pinch | Zoom + pan (unchanged, mobile touch) |

**Wheel handler refactor** — current `onWheel` treats all wheel events as zoom. Split by `ctrlKey`:

```typescript
function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!viewEl) return
  if (e.ctrlKey) {
    // Pinch-to-zoom (trackpad) or Ctrl+scroll (mouse)
    const rect = viewEl.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.5, Math.min(3, zoom * factor))
    panX = cx - (cx - panX) * (newZoom / zoom)
    panY = cy - (cy - panY) * (newZoom / zoom)
    zoom = newZoom
  } else {
    // 2-finger swipe (trackpad) or scroll wheel → pan
    panX -= e.deltaX
    panY -= e.deltaY
  }
}
```

The `cursor` changes to reflect the current mode:
- Default: `default` (arrow)
- Space held: `grab` → `grabbing` while dragging

### B. Selection State: `string | null` → `Set<string>`

```typescript
// state.svelte.ts
export const ui = $state({
  selectedSceneNodes: new Set<string>(),    // replaces selectedSceneNode
  selectedSceneEdge: null as string | null,
  selectedSceneLabel: null as string | null,
})
```

Helper for single-selection compatibility:

```typescript
export function primarySelectedNode(): string | null {
  const iter = ui.selectedSceneNodes.values()
  return iter.next().value ?? null
}
```

### C. Selection Interactions

| Input | Behavior |
|-------|----------|
| Click node | Clear selection, select that node |
| Shift+Click node | Toggle node in selection (add/remove) |
| Click background | Clear all selections |
| Background drag | Rectangle select — all nodes within rect |
| Escape | Clear all selections |

### D. Rectangle Selection

Background drag draws a selection rectangle:

```
  ┌─────────────────┐
  │  ╔═══╗   ╔═══╗  │   ← Nodes inside rect get selected
  │  ║ A ║   ║ B ║  │
  │  ╚═══╝   ╚═══╝  │
  └─────────────────┘
         ╔═══╗           ← Node outside rect: not selected
         ║ C ║
         ╚═══╝
```

**Implementation (SceneView.svelte):**
- New state: `selectRect: { x1, y1, x2, y2 } | null` (pixel coords within scene-view)
- On pointerdown on background (no Space) → start rect at pointer
- On pointermove → update rect end, live-highlight nodes inside
- On pointerup → finalize selection from nodes inside rect
- Shift+rect drag → add to existing selection (union)
- SceneCanvas renders the rect as a dashed outline

**Hit test:** A node is "inside" if its center (normalized x,y) falls within the rect bounds, converted to normalized coordinates.

### E. Group Drag

When dragging a node that is part of a multi-selection, all selected nodes move together:

```typescript
// SceneView.svelte — onMove handler
if (dragMoved && dragging) {
  const dx = normX - dragStartNorm.x
  const dy = normY - dragStartNorm.y
  if (ui.selectedSceneNodes.has(dragging)) {
    // Move all selected nodes by delta
    for (const id of ui.selectedSceneNodes) {
      const node = song.scene.nodes.find(n => n.id === id)
      if (node) {
        node.x = Math.max(0, Math.min(1, nodeStartPositions.get(id)!.x + dx))
        node.y = Math.max(0, Math.min(1, nodeStartPositions.get(id)!.y + dy))
      }
    }
  } else {
    // Single unselected node — move just that one
    sceneUpdateNode(dragging, normX, normY)
  }
  dragStartNorm = { x: normX, y: normY }
}
```

**Key detail:** On drag start, snapshot all selected node positions into a `Map<string, {x,y}>` so delta-based movement is smooth. Call `pushUndo('Move nodes')` once on first move.

### F. Partial Auto-Layout

Extend `sceneFormatNodes` to accept an optional node set:

```typescript
export function sceneFormatNodes(nodeIds?: Set<string>): void {
  pushUndo('Format nodes')
  const targets = nodeIds
    ? song.scene.nodes.filter(n => nodeIds.has(n.id))
    : song.scene.nodes
  // ... existing BFS layout logic, but only reposition targets
}
```

When nodes are selected, the toolbar "Auto-layout" button formats only the selection. When nothing is selected, it formats all (current behavior).

### G. Keyboard Actions on Multi-Selection

| Key | Multi-select behavior |
|-----|----------------------|
| Delete / Backspace | Delete all selected nodes |
| Ctrl+C | Copy all selected nodes + internal edges as subgraph |
| Ctrl+V | Paste subgraph at offset |
| Escape | Clear selection |
| Space (hold) | Activate pan mode (cursor changes to grab) |

### H. Visual Feedback

- **Selected nodes:** existing `selected` class (border highlight) applied to all nodes in Set
- **Selection rectangle:** dashed border, semi-transparent fill, rendered on SceneCanvas
- **Pan mode indicator:** cursor changes to `grab` while Space is held

```css
.scene-node.selected {
  border: 2px solid var(--color-fg);   /* existing — no change */
}
```

Selection rect rendered on canvas:
```typescript
ctx.setLineDash([4, 4])
ctx.strokeStyle = 'rgba(30, 32, 40, 0.4)'
ctx.fillStyle = 'rgba(30, 32, 40, 0.06)'
ctx.strokeRect(x, y, w, h)
ctx.fillRect(x, y, w, h)
ctx.setLineDash([])
```

## Implementation Order

### Phase 1: Pan mode + multi-select basics
1. Add Space key tracking for pan mode (`spaceHeld` state + cursor change)
2. Background drag default → rectangle select (Space+drag → pan)
3. Change `ui.selectedSceneNode` → `ui.selectedSceneNodes: Set<string>`
4. Update all references across codebase (~15 locations)
5. Shift+Click to toggle nodes in selection
6. Click to single-select (clear + add)

### Phase 2: Rectangle select + group drag
7. Render selection rectangle on SceneCanvas
8. Hit-test nodes inside rect on pointerup
9. Group drag — move all selected nodes together
10. `pushUndo` on group move start
11. Delete key deletes all selected nodes

### Phase 3: Partial layout + alignment + copy
12. Fix `sceneFormatNodes(nodeIds?)` — layout within bounding box of selected nodes (not full canvas)
13. Alignment tools for multi-selection (see Section I)
14. Ctrl+C / Ctrl+V for multi-node copy/paste

### I. Partial Format Fix + Alignment Tools

**Problem with current partial format:** `sceneFormatNodes(nodeIds)` runs BFS on the full graph but spreads selected nodes across the entire canvas (0.08–0.92), ignoring the spatial context of unselected nodes.

**Fix:** When `nodeIds` is provided, compute the bounding box of the selected nodes *before* layout, then redistribute within that bounding box instead of the full canvas:

```typescript
export function sceneFormatNodes(nodeIds?: Record<string, true>): void {
  // ... BFS layer assignment (unchanged) ...

  if (targets) {
    // Compute bounding box of selected nodes
    const targetNodes = nodes.filter(n => targets[n.id])
    const minX = Math.min(...targetNodes.map(n => n.x))
    const maxX = Math.max(...targetNodes.map(n => n.x))
    const minY = Math.min(...targetNodes.map(n => n.y))
    const maxY = Math.max(...targetNodes.map(n => n.y))
    // Use bounding box as layout region (with small inset)
    margin = { x1: minX, x2: maxX, y1: minY, y2: maxY }
  }
  // Assign positions within margin region
}
```

**Alignment tools:** When 2+ nodes are selected, provide alignment actions. Triggered via keyboard shortcuts or context menu:

| Action | Shortcut | Behavior |
|--------|----------|----------|
| Align Left | Alt+A | Set all selected nodes' x to `min(x)` |
| Align Right | Alt+D | Set all selected nodes' x to `max(x)` |
| Align Top | Alt+W | Set all selected nodes' y to `min(y)` |
| Align Bottom | Alt+S | Set all selected nodes' y to `max(y)` |
| Align Center H | Alt+X | Set all selected nodes' y to `mean(y)` |
| Align Center V | Alt+E | Set all selected nodes' x to `mean(x)` |
| Distribute H | Alt+Shift+X | Space selected nodes evenly along x axis |
| Distribute V | Alt+Shift+E | Space selected nodes evenly along y axis |

**Implementation:**

```typescript
export function sceneAlignNodes(
  nodeIds: Record<string, true>,
  mode: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v' | 'distribute-h' | 'distribute-v'
): void {
  const targets = song.scene.nodes.filter(n => nodeIds[n.id])
  if (targets.length < 2) return
  pushUndo('Align nodes')

  switch (mode) {
    case 'left':       { const v = Math.min(...targets.map(n => n.x)); targets.forEach(n => n.x = v); break }
    case 'right':      { const v = Math.max(...targets.map(n => n.x)); targets.forEach(n => n.x = v); break }
    case 'top':        { const v = Math.min(...targets.map(n => n.y)); targets.forEach(n => n.y = v); break }
    case 'bottom':     { const v = Math.max(...targets.map(n => n.y)); targets.forEach(n => n.y = v); break }
    case 'center-h':   { const v = targets.reduce((s, n) => s + n.y, 0) / targets.length; targets.forEach(n => n.y = v); break }
    case 'center-v':   { const v = targets.reduce((s, n) => s + n.x, 0) / targets.length; targets.forEach(n => n.x = v); break }
    case 'distribute-h': {
      targets.sort((a, b) => a.x - b.x)
      const min = targets[0].x, max = targets[targets.length - 1].x
      targets.forEach((n, i) => n.x = targets.length === 1 ? min : min + (i / (targets.length - 1)) * (max - min))
      break
    }
    case 'distribute-v': {
      targets.sort((a, b) => a.y - b.y)
      const min = targets[0].y, max = targets[targets.length - 1].y
      targets.forEach((n, i) => n.y = targets.length === 1 ? min : min + (i / (targets.length - 1)) * (max - min))
      break
    }
  }
}
```

**UI:** Alignment actions appear in the right-click bubble menu when 2+ nodes are selected, grouped as a row of small icons.

## Considerations

- **Pan accessibility:** Space+drag and trackpad 2-finger swipe are standard in design tools (Illustrator, Photoshop, Figma). Middle mouse also works. Mobile uses two-finger pan (unchanged). Mouse scroll wheel also pans (matching Illustrator behavior where scroll = pan, Ctrl+scroll = zoom)
- **Backward compatibility:** `primarySelectedNode()` helper lets existing code that needs a single node (e.g. param popup, double-click) work without changes
- **Mobile:** Rectangle select via touch drag on background. Pan via two-finger gesture (unchanged). No Space key needed
- **Performance:** Set operations are O(1). Group drag iterates the selection set on each move — fine for up to ~50 nodes
- **Undo granularity:** Group move records one undo snapshot (not per-node). Group delete records one snapshot
- **Edge handling:** Deleting multiple nodes also deletes all edges connected to any deleted node
- **Right-click:** Still opens bubble menu (unchanged by this ADR)

## Future Extensions

- Lasso select (freeform selection path) for irregular node clusters
- Snap to grid while dragging (hold Shift or toggle)
- Group/ungroup: collapse selected nodes into a single compound node
