# ADR 070: Scene Navigator in DockPanel

## Status: Implemented

## Context

When scene view is active and the pattern sheet is closed, DockPanel shows different content depending on selection:

- **Pattern node selected** → Decorator editor (ADR 069)
- **Nothing selected / function node selected** → Track synth parameters

The track synth parameters are contextually mismatched in scene view — users aren't editing step sequences, so voice/preset/knob controls aren't useful. The DockPanel space could instead provide scene-specific navigation.

### Current code

- DockPanel conditional: `{#if scenePatternNode}` (decorators) / `{#if !scenePatternNode}` (track params)
- Scene state: `song.scene.nodes` (`SceneNode[]`), `song.scene.edges` (`SceneEdge[]`)
- Pattern pool: `song.patterns` (`Pattern[]`) with `id`, `name`, `color`
- Node selection: `ui.selectedSceneNodes` (`Record<string, true>`)
- Node creation: `sceneAddNode(patternId, x, y)` in `sceneActions.ts`
- Viewport: `panX`, `panY`, `zoom` locals in `SceneView.svelte` (no external API yet)

## Decision

### Overview

Replace the track synth parameters section with a **Scene Navigator** when in scene view context (pattern sheet closed, no pattern node selected). The navigator lists all pattern nodes in the scene and unplaced patterns from the pool.

### DockPanel layout

```
┌─────────────────────────────┐
│ ◀ handle                    │
│                             │
│ SCENE                       │
│ ┌─────────────────────────┐ │
│ │ ★ Intro          T+5 FX │ │  ← root node, decorator badges
│ │   Verse A        ×140   │ │  ← normal node
│ │   Verse B               │ │
│ │   Bridge         RPT2   │ │
│ │   Outro                 │ │
│ ├─────────────────────────┤ │
│ │ + Drop (unused)         │ │  ← unplaced pattern, dimmed
│ │ + Fill (unused)         │ │  ← click to add to scene
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Visibility condition

```typescript
// Show navigator when: scene view active, pattern sheet closed, no pattern node selected
const showNavigator = $derived(!ui.patternSheet && !scenePatternNode)
```

- `scenePatternNode` non-null → decorator editor (ADR 069)
- `showNavigator` true → scene navigator (this ADR)
- Otherwise (pattern sheet open) → track synth parameters

### Navigator items

**Placed patterns** (top section):
- List all `song.scene.nodes` where `type === 'pattern'`
- Show pattern name + color dot
- Root node marked with `★`
- Decorator badges (compact tags like `T+5`, `FX`, `×140`)
- Tap → select node in scene (`ui.selectedSceneNodes = { [nodeId]: true }`)
- Selected item highlighted

**Unplaced patterns** (bottom section, dimmed):
- Patterns in `song.patterns` not referenced by any scene node
- Shown with `+` prefix and "(unused)" suffix
- Tap → `sceneAddNode(patternId, x, y)` at viewport center, then select it

### Node selection behavior

Tapping a placed pattern in the navigator:
1. Sets `ui.selectedSceneNodes = { [nodeId]: true }`
2. This triggers `scenePatternNode` to become non-null → DockPanel switches to decorator editor
3. Net effect: tap pattern name → immediately see its decorators

This creates a natural drill-down flow: **Navigator → select pattern → Decorator editor**.

### State changes

No new state needed. Uses existing:
- `ui.selectedSceneNodes` for selection
- `song.scene.nodes` for placed patterns
- `song.patterns` for full pattern pool

## Implementation

### Single phase

- Add `showNavigator` derived to DockPanel
- Build navigator list component inline in DockPanel
- Wire tap-to-select and tap-to-add handlers
- Style with existing DockPanel CSS variables
- Mobile: larger tap targets (44px row height)

## Considerations

- **No camera focus** — SceneView viewport (`panX`/`panY`/`zoom`) are local variables with no external API. Adding focus-on-select would require exposing a `focusNode()` callback or event. Deferred to future iteration.
- **Ordering** — List in scene node array order (insertion order). Could sort alphabetically or by graph topology later.
- **Performance** — Pattern list is small (typically <20), no virtualization needed.
- **Transition feel** — Tapping a navigator item instantly switches to decorator editor via reactive state. No extra animation needed since ADR 069 cards already have pop-in animation.

## Future Extensions

- Focus-on-select: pan/zoom SceneView to center on tapped node
- Drag-reorder to change scene node array order
- Graph topology view (indented tree showing edge connections)
- Batch operations (select multiple from list)
