# ADR 026: Graphic Score Automation

## Status: Proposed

## Context

The DockPanel already shows a pattern list (Scene Navigator) in its upper half when FX/EQ/Master overlay sheets are open. Clicking a pattern node currently opens the decorator editor. Automation curves already exist as decorator attachments (ADR 053), but they are buried behind an "Edit curve" button and feel utilitarian.

We want a more visual, playful approach to automation — inspired by graphic scores (図形楽譜). Instead of precise DAW-style automation lanes, the user draws expressive shapes that modulate parameters over the pattern's duration. The aesthetic should feel artistic and inviting, not clinical.

## Proposal

### Entry Point

1. In the DockPanel, when a pattern node is selected in the scene view, its decorator cards are shown (existing behavior).
2. Each **automation decorator** card displays a thumbnail of its curve (mini-curve visualization already exists).
3. Tapping the card opens an **inline Graphic Score Editor** in the DockPanel's lower section — no overlay, no popup.
4. A prominent **"+ Draw"** button lets the user add a new automation curve to the selected pattern node.

### Graphic Score Editor

Reuses and extends the existing `AutomationEditor.svelte`:

#### Drawing Modes

| Mode | Gesture | Description |
|------|---------|-------------|
| **Pencil** (default) | Drag on canvas | Freehand drawing, smoothed with RDP simplification (existing) |
| **Line** | Click start → click end | Straight-line segment between two points |
| **Eraser** | Drag on canvas | Removes points in brush radius |

The existing Bezier point-editing mode remains available as an advanced option but is not the primary interaction.

#### Visual Style (Graphic Score Aesthetic)

- **Thick, organic strokes**: Curves rendered with 3–4px stroke width, slightly rounded joins
- **Color-coded by target**: Each automation target gets a distinct color from the pattern's palette
- **Translucent fill**: Area under curve filled with 15% opacity of the stroke color
- **Background grid**: Subtle beat divisions (1/4, 1/8, 1/16) as dotted vertical lines
- **Playhead scrub line**: Thin vertical line showing current position during playback
- **No axis labels**: Just min/max indicators at edges — keep it visual, not numerical

#### Multi-Lane View

When a pattern node has multiple automation decorators:
- Each curve is drawn as a **layered overlay** on the same canvas (like overlapping graphic score elements)
- Active (editing) curve is fully opaque; others are dimmed (30% opacity)
- Tap a curve to select it for editing
- Target label shown as a small colored pill at the left edge of each curve

### Target Selection

Reuses existing `AutomationTarget` type:

```typescript
type AutomationTarget =
  | { kind: 'global'; param: 'tempo' | 'masterVolume' }
  | { kind: 'track';  trackIndex: number; param: 'volume' | 'pan' }
  | { kind: 'fx';     param: 'reverbWet' | 'reverbDamp' | 'delayTime' | ... }
  | { kind: 'send';   trackIndex: number; param: 'reverbSend' | 'delaySend' | ... }
```

Target picker shown as a compact dropdown when adding a new curve. Context-aware: only shows tracks used in the host pattern (existing behavior).

### Data Model

No changes to the core data model. Automation curves remain as `SceneNode.decorators[]` with `type: 'automation'` and `automationParams`. This means:
- The same pattern placed at different scene nodes can have different automation
- Curves are per-node, not per-pattern — consistent with the existing decorator architecture

### Playback Integration

Existing automation playback path is unchanged:
- `applyDecorators()` in `state.svelte.ts` reads `automationParams.points[]` and interpolates at the current step
- Values are sent to the worklet via `engine.ts`
- No DSP changes required

## UI Layout

```
┌─ DockPanel ──────────────────────┐
│ ▸ pat_00 ★  T+5 ×140           │  ← Scene Navigator
│ ▸ pat_01     FX  RPT2          │
│ ● pat_02  ← selected           │
│   pat_03   (unused)             │
├──────────────────────────────────┤
│ Decorators: [Transpose] [FX]    │  ← Decorator cards
│                                  │
│ Automation:                      │
│ ┌────────────────────────────┐  │
│ │ ~~~curve 1: tempo~~~       │  │  ← Graphic Score canvas
│ │ ~~~curve 2: reverbSend~~~  │  │     (multi-lane overlay)
│ │          ▏← playhead       │  │
│ └────────────────────────────┘  │
│ [Pencil] [Line] [Eraser]  +Draw│  ← Tool buttons
└──────────────────────────────────┘
```

## Changed Files

| File | Changes |
|------|---------|
| `AutomationEditor.svelte` | Pencil/Line/Eraser modes, graphic score visual style, multi-lane overlay, playhead indicator |
| `DockPanel.svelte` | Inline automation editor area below decorator cards |
| `DockDecoratorEditor.svelte` | Automation card tap → opens inline editor instead of standalone overlay |
| `state.svelte.ts` | `ui.editingAutomationInline` flag (replaces or supplements `editingAutomationDecorator`) |

## Consequences

- **Positive**: Unique, fun interaction — draws users in rather than intimidating them
- **Positive**: Graphic score aesthetic differentiates inboil from other DAWs/groove boxes
- **Positive**: Reuses existing data model and playback — low-risk implementation
- **Positive**: Multi-lane overlay encourages layering multiple automations (emergent complexity)
- **Negative**: Freehand curves on small DockPanel canvas may lack precision — mitigate with snap grid and post-draw smoothing
- **Negative**: Multi-lane overlay may be hard to read with 4+ curves — consider max visible lanes or scroll

## Open Questions

- Should there be a "full-screen" mode that expands the editor to the main canvas area for detailed work?
- Undo scope: per-curve local undo (existing) or integrate with global undo stack?
- Should curves animate/pulse subtly during playback to reinforce the "living score" feel?
