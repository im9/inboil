# ADR 069: Dock Panel Decorator Editor

## Status: Implemented

## Context

ADR 066 introduced decorator editing (Transpose, Tempo, Repeat, FX, Automation) inside SceneNodePopup using small `±` buttons and toggles. Usability issues remain:

1. **Cramped UI** — SceneNodePopup uses 7px fonts, 18px buttons in `.dec-edit-row`. No knobs or sliders, making fine-tuning difficult
2. **Context mismatch** — When a pattern node is selected in scene view, DockPanel only shows track parameters. In a scene context, users more often want to edit decorators (pattern behavior settings)
3. **Low discoverability** — Adding decorators requires drag-to-snap only. Hard to discover for new users

### Current code

- SceneNodePopup decorator editing: `SceneNodePopup.svelte:171-211` — ± buttons, FX toggles, detach button
- DockPanel: `DockPanel.svelte` — TRACKS → Voice → Presets → Lock → Knob grid → Send → Mixer
- Decorator type: `state.svelte.ts:88-93` — `SceneDecorator` interface
- Decorator operations: `sceneActions.ts` — attach / detach / update / addAutomation

## Decision

### Overview

Add a decorator editing section to DockPanel. When a pattern node is selected in scene view, display full-size decorator editing UI at the top of DockPanel. Simplify SceneNodePopup to read-only label display + detach button only.

### DockPanel layout

```
┌─────────────────────────────┐
│ ◀ handle                    │
│                             │
│ DECORATORS  [+ Add ▾]      │  ← only when scene view && pattern node selected
│ ┌─────────────────────────┐ │
│ │ TRANSPOSE         [×]  │ │
│ │ [REL|ABS]  ◎ +5 semi   │ │  ← full-size Knob (32px)
│ ├─────────────────────────┤ │
│ │ TEMPO              [×]  │ │
│ │ ◎ 140 BPM              │ │
│ ├─────────────────────────┤ │
│ │ FX                 [×]  │ │
│ │ [VRB] [DLY] [GLT] [GRN]│ │  ← full-size toggles
│ ├─────────────────────────┤ │
│ │ AUTOMATION         [×]  │ │
│ │ ~TEMPO  [Edit curve]    │ │
│ └─────────────────────────┘ │
│─────────────────────────────│
│ TRACKS  [1][2][3]...       │  ← existing track parameters
│ ...                         │
└─────────────────────────────┘
```

### Visibility condition

```typescript
// derived inside DockPanel
const scenePatternNode = $derived.by(() => {
  // scene view active && pattern sheet closed && single pattern node selected
  if (ui.patternSheet) return null
  const selected = Object.keys(ui.selectedSceneNodes)
  if (selected.length !== 1) return null
  const node = song.scene.nodes.find(n => n.id === selected[0])
  return (node?.type === 'pattern') ? node : null
})
```

- Show DECORATORS section only when `scenePatternNode` is non-null
- Hidden when pattern sheet (step sequencer) is open → **no conflict**

### Add dropdown

```
[+ Add ▾]
├ Transpose
├ Tempo
├ Repeat
├ FX
└ Automation
```

- Click to add a decorator directly (no drag-to-snap required)
- Add `sceneAddDecorator(nodeId, type)` to `sceneActions.ts`

### Decorator editing UI

Each decorator displayed as a card:

| Type | Controls |
|------|----------|
| Transpose | REL/ABS toggle + Knob (±12 semitones / key select) |
| Tempo | Knob (60–300 BPM, step=5) |
| Repeat | Knob (1–16, step=1) |
| FX | 4 toggle buttons (VRB/DLY/GLT/GRN), 22px height each |
| Automation | Target display + "Edit curve" button (opens existing AutomationEditor) |

- Each card has a `×` button → `sceneDetachDecorator()` to detach
- Reuses existing `Knob.svelte` component (size=32)

### SceneNodePopup changes

Simplify decorator section to read-only:

```
Before (current):
┌─────────────────────┐
│ T+5  [−][+]    [×]  │  ← editable
│ ×140 [−][+]    [×]  │
│ FX [VRB][DLY]  [×]  │
│ [＋Auto]             │
└─────────────────────┘

After:
┌─────────────────────┐
│ T+5  ×140  FX VDG   │  ← labels only (same as existing .dec-tag)
│                [×]   │  ← single detach button
└─────────────────────┘
```

- Remove `±` buttons, mode toggles, FX toggles from `.dec-edit-row`
- Keep compact label display via `decoratorLabel()`
- Clicking a decorator tag → set `ui.dockMinimized = false` to expand DockPanel

### State changes

```typescript
// added to ui
focusedDecoratorIndex: number | null  // focused decorator in DockPanel
```

- Set `ui.focusedDecoratorIndex = i` on tag click in SceneNodePopup → DockPanel scrolls to and highlights the corresponding card

## Implementation Phases

### Phase 1: DockPanel decorator section
- Add `scenePatternNode` derived and DECORATORS section to `DockPanel.svelte`
- Transpose / Tempo / Repeat Knob editing
- FX toggle buttons
- Automation "Edit curve" button
- `×` detach button

### Phase 2: Add dropdown + SceneNodePopup simplification
- Add `sceneAddDecorator()` to `sceneActions.ts`
- Add `[+ Add ▾]` dropdown to DockPanel
- Simplify SceneNodePopup to read-only labels + detach only
- Tag click → DockPanel expand linkage

### Phase 3: Polish
- Decorator card collapse/expand animation
- Verify scene node decorator tags update in real-time during Knob drag
- Mobile support (touch-friendly sizing)

## Considerations

- **DockPanel vertical space** — 4–5 decorators + track parameters may overflow. Make decorator section collapsible (click card header to expand) or limit max height with scroll
- **Standalone function node editing** — Keep existing `±` controls in SceneNodePopup for function nodes (they are pre-attach and not DockPanel targets)
- **Undo** — Existing `sceneUpdateDecorator()` calls `pushUndo()`, so edits from DockPanel automatically support undo via the same function

## Future Extensions

- Decorator reordering (drag to change application order)
- Decorator presets (mentioned in ADR 066: "Breakdown" = Tempo −20 + FX verb on)
- Batch editing when multiple pattern nodes selected (apply common decorators)
