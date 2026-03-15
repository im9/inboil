# ADR 095: Mobile UI Redesign

## Status: Implemented

## Context

Desktop-first development has left the mobile UI broken. Root causes:

1. **Spec drift** — The main view shifted from sequencer to MatrixView + SceneView, but mobile layout was never updated
2. **Deprecated SectionNav still present** — A relic of the linear-section era is still rendered on mobile only
3. **MatrixView / DockPanel hidden** — No pattern overview or track editing accessible on mobile
4. **SceneView shared with desktop** — Decorator / function nodes / edge editing are excessive for mobile

Meanwhile, MobileTrackView provides a Teenage Engineering Pocket Operator–style calculator UI that is fun and tactile. This component should become the centerpiece of the mobile experience.

### Current mobile layout

```
┌──────────────────────────┐
│  AppHeader (compact)     │
├──────────────────────────┤
│  SectionNav (deprecated) │  ← linear-section era relic
├──────────────────────────┤
│  SceneView (shared)      │  ← too many features for mobile
├──────────────────────────┤
│  Overlay Sheet           │  ← pattern editing
└──────────────────────────┘
    + PerfBubble (floating)
```

### Current component roles

| Component | Current state | Problem |
|---|---|---|
| `MobileTrackView` | PO-style calculator sequencer, inside Sheet | Good UX — should be promoted to main view |
| `MobileParamOverlay` | Bottom sheet with knob params | Reusable as-is |
| `PerfBubble` | Floating FAB for FILL/REV/BRK | Reusable as-is |
| `SectionNav` | Deprecated linear section nav | Should be removed |
| `SceneView` | Full graph editor shared with desktop | Needs a mobile-only lightweight alternative |
| `MatrixView` | Hidden on mobile | Needs a mobile-only compact alternative |

## Decision

### Design principle

**MobileTrackView is the primary view, supported by minimal auxiliary UI.**

- Mobile focuses on pattern input and playback controls
- SceneView / MatrixView get dedicated mobile-only components, separate from desktop versions
- Advanced features (decorators, function nodes, edge editing) are not supported on mobile — left to desktop

### New layout

```
┌──────────────────────────┐
│  Header + Transport      │  AppHeader compact + play/stop/BPM
├──────────────────────────┤
│  MobileMatrixView (1 row)│  Pattern selection grid
├──────────────────────────┤
│                          │
│  MobileTrackView (PO)    │  Main interaction area
│                          │
├──────────────────────────┤
│  MobileSceneRibbon       │  Scene playback state (compact)
└──────────────────────────┘
    + PerfBubble (floating)
    + MobileParamOverlay (bottom sheet, existing)
```

### New components

#### MobileMatrixView

Compact pattern selection grid.

```
┌─────────────────────────────────────┐
│ ■ ■ □ □ ■ □ □ □ □ □  LOFI         │
└─────────────────────────────────────┘
```

- Single-row horizontal cell strip (20×20px cells, horizontally scrollable)
- Cell color = pattern color, filled = has data
- Tap to select pattern → reflected in MobileTrackView
- Pattern name displayed at the right end
- **Not supported**: pattern add/delete/rename (desktop only)

#### MobileSceneRibbon

Compact scene playback status display.

```
┌─────────────────────────────────────┐
│ ▶ Verse → Chorus → [Break] → ...  │
└─────────────────────────────────────┘
```

- Linearized node chain showing the current playback path
- Highlight on the currently playing node
- Tap node → select pattern (jump playback position)
- Play/stop button (Scene mode)
- **Not supported**: node placement, edge editing, decorators, function nodes

#### Changes to existing components

| Component | Change |
|---|---|
| `App.svelte` | Rewrite isMobile branch with new layout |
| `SectionNav` | Remove all mobile references |
| `MobileTrackView` | Promote from Sheet to main area |
| `MobileParamOverlay` | No change |
| `PerfBubble` | No change |
| `SceneView` | Mobile-specific code (media queries, touch branching) can be cleaned up later |

### Implementation phases

#### Phase 1: Layout overhaul

- Create `MobileMatrixView` component
- Rewrite `App.svelte` mobile layout with new structure
- Remove `SectionNav` references from mobile
- Place `MobileTrackView` directly in main area (no longer inside Sheet)
- Keep overlay sheets for FX / EQ / Master only

#### Phase 2: MobileSceneRibbon

- Create `MobileSceneRibbon` component
- Linearize scene graph into a playback path for display
- Show currently playing node with highlight
- Scene mode play/stop button

#### Phase 3: Polish

- Touch interaction optimization (swipe gestures, etc.)
- Transition animations
- Landscape orientation support

## Considerations

- **Desktop isolation**: Separate mobile-only components (MobileMatrixView / MobileSceneRibbon) ensure zero impact on desktop MatrixView / SceneView. Avoids conditional-branching sprawl
- **Feature scope**: Decorators / function nodes / edge editing are not supported on mobile. Workflow assumption: create on mobile, refine on desktop
- **SectionNav removal**: No reason to keep a deprecated component. MobileSceneRibbon is a superset
- **MobileTrackView promotion**: Moving it out of the Sheet makes the pattern-select → step-edit flow seamless
- **Relation to ADR 074 (iOS Native)**: This ADR covers the web app's mobile browser experience. A native app is a separate track

## Future Extensions

- Landscape mode with expanded layout (MobileTrackView + MobileMatrixView side by side)
- Pattern name editing and color selection on mobile
- Simple node addition from MobileSceneRibbon (no drag-and-drop needed)
- Mobile-specific gestures (swipe to switch tracks, pinch to change step count, etc.)
