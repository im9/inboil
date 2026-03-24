# ADR 052 — Scene Free-Floating Labels

| field   | value                              |
| ------- | ---------------------------------- |
| status  | implemented                        |
| date    | 2026-03-06                         |
| parent  | ADR 044 (Scene)              |

## Context

As scenes grow complex, it becomes hard to understand what groups of nodes represent. Users want to annotate sections (e.g. "intro / verse / chorus") or leave design notes directly on the canvas.

### Alternatives Considered

- **A: Node-attached labels** — Add a `SceneNode.label` field and display text below each node
  - Downside: Conflicts with pattern node double-tap (pattern transition) and editing UI
- **B: Free-floating labels (adopted)** — Independent text elements placed at arbitrary positions on the canvas
  - Upside: No node dependency, freely positionable/resizable, sticky-note feel

## Decision

### 1. `SceneLabel` Interface

```typescript
export interface SceneLabel {
  id: string
  text: string
  x: number       // normalized 0-1
  y: number       // normalized 0-1
  size?: number   // font scale (default 1.0 = 10px, range 0.5-4.0)
}

export interface Scene {
  nodes: SceneNode[]
  edges: SceneEdge[]
  labels: SceneLabel[]   // NEW
}
```

### 2. State Functions

- `sceneAddLabel(x, y, text?)` — Add label (spread assignment for Svelte 5 reactivity)
- `sceneUpdateLabel(id, text)` — Update text
- `sceneDeleteLabel(id)` — Delete
- `sceneMoveLabel(id, x, y)` — Drag move
- `sceneResizeLabel(id, delta)` — Resize

### 3. UI

- **Creation**: Via "T" icon in bubble menu. Enters input mode immediately after creation (`requestAnimationFrame` deferred set)
- **Display**: DOM `<span>` element, `position: absolute` + `transform: translate(-50%, -50%)`
- **Editing**: Double-tap switches to inline `<input>`. Enter/blur to confirm, Escape to cancel
- **Moving**: Drag (pointer capture)
- **Resizing**: Drag the top-right handle up/down when selected
- **Deletion**: Delete key when selected, or explicit delete only (empty text does NOT auto-delete on blur)

### 4. Display Style

```
  ┌──────────┐
  │  LOFI    │  pattern node
  └──────────┘
           intro section    ← free label (independent position)
```

- Font: `var(--font-data)`, `10px * size`
- Color: `rgba(30, 32, 40, 0.35)`, hover 0.6, selected 0.7 + outline
- Empty text displays `…`

## Considerations

- **Svelte 5 reactivity**: The `labels` array is updated via spread assignment `[...arr, item]`, not `.push()`. Guard with `?? []` for scenes loaded without `labels`
- **Bubble menu close vs focus conflict**: `editingLabelId` is set via `requestAnimationFrame` to prevent blur → immediate deletion race when the bubble menu closes

## Extends

| ADR | Impact |
|-----|--------|
| 044 (Scene) | Adds `labels` array to `Scene`. No impact on graph traversal or playback |
| 050 (Scene Function Nodes) | Adds label item to bubble menu |
