# ADR 115: Centralized Keyboard Routing

## Status: Proposed

## Context

Keyboard event handling is distributed across multiple components, each registering its own `<svelte:window onkeydown>` or element-level `onkeydown`. This has caused real bugs and makes the system fragile.

### Current state

**Window-level handlers** (3 competing `<svelte:window onkeydown>`):

| Component | Scope | Guards |
|-----------|-------|--------|
| `App.svelte:296` | Space (play/stop), Ctrl+Z (undo/redo), Copy/Paste, Delete (pattern clear) | `isTextInputTarget`, `e.defaultPrevented`, `.closest('.matrix-view')`, `hasSheet`, `hasSceneSelection` |
| `SceneView.svelte:478` | Delete (scene node/edge/label), Space (pan mode), Copy/Paste (scene), Escape, alignment shortcuts | `isTextInputTarget`, `e.defaultPrevented`, `ui.patternSheet`, `.closest('.matrix-view')`, `.closest('.scene-view')` |
| `TrackerView.svelte:105` | Arrow keys, PageUp/Down, `[`/`]` (track switch), value entry | `isTextInputTarget`, `e.defaultPrevented` |

**Element-level handlers** (scoped to focused element):

| Component | Scope |
|-----------|-------|
| `StepGrid.svelte` | Arrow key navigation between step buttons, Enter to toggle |
| `SceneLabels.svelte` | Label editing |
| `DockPanel.svelte` | Knob interaction |
| `AppHeader.svelte` | Button shortcuts |
| `SidebarProject.svelte` | Project actions |

### Bugs caused by this architecture

1. **Delete key conflict**: App.svelte's `<svelte:window>` handler fires BEFORE SceneView's (Svelte registers window listeners in template rendering order, not parent/child mount order). When scene nodes are selected and user presses Delete, App.svelte clears the pattern data instead of SceneView deleting the scene nodes. The workaround in App.svelte (`hasSceneSelection` guard) is brittle and inverts the dependency.

2. **Focus-dependent routing**: `e.target` / `.closest()` checks assume the correct element has focus, but this breaks when `startDrag` calls `preventDefault()` on `pointerdown` (preventing the scene-node button from receiving focus). The event target remains on the previously focused element, causing the wrong handler to process the key.

3. **Missing guards**: `isTextInputTarget` was missing from several components, causing keyboard shortcuts to fire while typing in text inputs (e.g., scene label rename, project name input).

4. **Duplicated logic**: Multiple components independently check `ui.patternSheet`, `isTextInputTarget`, `e.defaultPrevented`, and `.closest('.matrix-view')`. When a new context is added (e.g., a modal dialog), every handler must be updated.

## Decision

Replace the distributed `<svelte:window onkeydown>` handlers with a single centralized keyboard dispatcher.

### 1. Key Router module (`src/lib/keyRouter.ts`)

A single module that owns the window-level keydown/keyup listener and routes events based on application state (not DOM queries).

```typescript
// src/lib/keyRouter.ts
import { isTextInputTarget } from './domHelpers'

export type KeyLayer = 'text-input' | 'sheet' | 'tracker' | 'scene' | 'app'

export type KeyHandler = (e: KeyboardEvent) => boolean | void
// Return true (or call e.preventDefault()) to stop propagation to lower layers.

const layers: Map<KeyLayer, KeyHandler> = new Map()

export function registerKeyLayer(layer: KeyLayer, handler: KeyHandler): void {
  layers.set(layer, handler)
}

export function unregisterKeyLayer(layer: KeyLayer): void {
  layers.delete(layer)
}
```

### 2. Priority chain

The dispatcher evaluates layers in strict priority order. The first handler that returns `true` or calls `e.preventDefault()` wins; remaining layers are skipped.

```
Priority (high → low):
  1. text-input    — always checked first (isTextInputTarget → bail out)
  2. sheet         — active when ui.patternSheet / ui.fxSheet / ui.eqSheet is open
  3. tracker       — active when tracker view is visible (ui.gridMode === 'tracker')
  4. scene         — active when scene view has selection or scene-specific keys apply
  5. app           — global fallback (play/stop, undo/redo)
```

```typescript
const PRIORITY: KeyLayer[] = ['text-input', 'sheet', 'tracker', 'scene', 'app']

function dispatch(e: KeyboardEvent): void {
  if (e.defaultPrevented) return
  // Text input is a hard gate, not a registered handler
  if (isTextInputTarget(e)) return

  for (const layer of PRIORITY) {
    if (layer === 'text-input') continue  // already handled above
    const handler = layers.get(layer)
    if (!handler) continue
    const consumed = handler(e)
    if (consumed || e.defaultPrevented) return
  }
}
```

### 3. Registration by components

Each component registers/unregisters its layer on mount/unmount. Components no longer add `<svelte:window onkeydown>`.

```typescript
// SceneView.svelte
import { registerKeyLayer, unregisterKeyLayer } from '$lib/keyRouter'
import { onMount } from 'svelte'

onMount(() => {
  registerKeyLayer('scene', handleSceneKeys)
  return () => unregisterKeyLayer('scene')
})

function handleSceneKeys(e: KeyboardEvent): boolean {
  // Delete scene nodes/edges/labels
  // Scene copy/paste, alignment shortcuts
  // Space for pan mode
  // No need to check isTextInputTarget or ui.patternSheet — router already handled those
}
```

### 4. Routing by application state, not DOM queries

Replace all `.closest()` DOM queries with explicit state checks:

| Current (DOM query) | New (state check) |
|---------------------|-------------------|
| `(e.target as HTMLElement)?.closest?.('.matrix-view')` | Layer priority: `sheet` layer only active when `hasSheet` |
| `(e.target as HTMLElement)?.closest?.('.scene-view')` | `scene` layer always registered when SceneView is mounted |
| Focus-dependent Delete routing | `scene` layer has higher priority than `app` layer; checks `ui.selectedSceneNodes` |

### 5. Element-level handlers stay as-is

Element-level `onkeydown` handlers (StepGrid, SceneLabels, DockPanel knobs) remain on their elements. These are fine because:
- They only fire when the element has focus (no window listener conflict)
- They handle element-specific navigation (arrow keys in grid, Enter to toggle)
- They call `e.preventDefault()` which the router respects via `e.defaultPrevented` check

### 6. Conditional layer activation

Layers can be conditionally active. Instead of checking `ui.patternSheet` inside every handler, the `sheet` layer is only registered when a sheet is open:

```typescript
// PatternSheet.svelte (or wherever sheet open/close is managed)
$effect(() => {
  if (hasSheet) {
    registerKeyLayer('sheet', handleSheetKeys)
    return () => unregisterKeyLayer('sheet')
  }
})
```

This means the `sheet` layer simply doesn't exist when no sheet is open, and the `scene`/`app` layers naturally receive the events.

### 7. Window listener setup

A single `<svelte:window onkeydown={dispatch} onkeyup={dispatchUp}>` in `App.svelte`. The `keyup` dispatcher follows the same pattern (needed for SceneView's Space-held pan mode).

### 8. Migration path

Incremental migration, one component at a time:

**Phase 1: Infrastructure**
- Create `src/lib/keyRouter.ts` with dispatcher and layer registration
- Add single `<svelte:window>` listener in App.svelte using the dispatcher
- Move App.svelte's current handler logic into the `app` layer

**Phase 2: SceneView migration**
- Move SceneView's `<svelte:window onkeydown>` into a `scene` layer
- Remove all `.closest()` guards from the scene handler
- Remove the `hasSceneSelection` workaround from the `app` layer
- Migrate `onkeyup` (Space release for pan mode) to `dispatchUp`

**Phase 3: TrackerView migration**
- Move TrackerView's `<svelte:window onkeydown>` into a `tracker` layer
- Layer is only registered when `ui.gridMode === 'tracker'`

**Phase 4: Sheet layer**
- Extract copy/paste/delete routing for sheet context into `sheet` layer
- Currently split between App.svelte (`hasSheet` branches) and individual sheet components

**Phase 5: Cleanup**
- Remove all `isTextInputTarget` calls from individual handlers (router handles it)
- Remove all `.closest('.matrix-view')` / `.closest('.scene-view')` checks
- Remove duplicated `e.defaultPrevented` guards from layer handlers (router handles it)
- Audit element-level handlers to ensure they call `e.preventDefault()` when consuming events

## Considerations

- **Element-level handlers are not centralized**: StepGrid, SceneLabels, and DockPanel keep their element-level `onkeydown`. This is intentional. Element-scoped keyboard handling is correct for navigation within a focused widget. Only window-level listeners cause the ordering/conflict bugs.

- **Single handler per layer**: Each layer has exactly one handler. If two components want to share a layer, they must coordinate (e.g., a sheet layer handler that dispatches internally based on which sheet is open). This prevents the N-handlers-on-one-layer problem that recreates the current bug.

- **Testing**: The router module is a pure function of (event, registered layers) and can be unit-tested independently of Svelte components. Test cases should cover: text input bail-out, layer priority ordering, consumed-event short-circuit, missing layers.

- **keyup routing**: Must mirror keydown priority. SceneView needs Space keyup for pan mode release. The `scene` layer registers both keydown and keyup handlers.

- **Hot-reloading**: Svelte HMR may re-run mount effects, causing double registration. `registerKeyLayer` is idempotent (Map.set overwrites) so this is safe.

- **Future modal/dialog support**: A new `modal` layer at priority 0 (highest) can be added without touching any existing handler. This is a direct benefit of the layered architecture.

## Future Extensions

- **Key binding customization**: The router is a natural place to add user-configurable key bindings (remap shortcuts via settings)
- **Shortcut discovery UI**: The layer registry can enumerate all active shortcuts for a help overlay
- **Context-aware shortcut hints**: Tooltip system could query the router to show which shortcuts are active in the current context
