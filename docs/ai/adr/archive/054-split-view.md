# ADR 054 — Split View: Scene + Pattern Co-Display

| field   | value                              |
| ------- | ---------------------------------- |
| status  | implemented                        |
| date    | 2026-03-06                         |
| parent  | ADR 046 (Simplify View Toggle)     |

## Context

The current UI switches between SceneView and MatrixView (pattern step sequencer) via a PAT/SCENE toggle. This forces a full context switch — users lose sight of one view while working in the other. Common friction points:

1. Editing a pattern requires leaving the scene, losing spatial context ("which pattern am I editing relative to the arrangement?")
2. Returning to the scene requires leaving the pattern, losing editing context
3. During playback, users want to see scene progress AND pattern steps simultaneously

Traditional DAWs have this same Arrangement/Clip duality (Ableton, Logic). But inboil targets a more playful, direct-manipulation feel where context loss should be minimized.

## Decision

### 1. Split Layout with Flexible Focus

Replace the binary PAT/SCENE toggle with a split layout where both views are always present, but one is the "main" (expanded) and the other is "compact" (collapsed).

```
【Pattern Focus】              【Scene Focus】
┌─────────────────┐           ┌─────────────────┐
│ [A]→[B]→[C]→[D] │ compact  │  SceneView      │ main
├─────────────────┤           │  (full canvas)   │
│                  │           ├─────────────────┤
│  MatrixView     │ main     │ ■□■□ ■□■□       │ compact
│  (full editor)   │           │ □■□□ □■□□       │
└─────────────────┘           └─────────────────┘
```

### 2. Compact Scene (Ribbon Mode)

When the pattern editor is the main view, the scene collapses into a thin horizontal ribbon at the top:

- Single row of nodes, horizontal layout
- Node names only (no edge routing, no function node icons)
- Active node highlighted (playback indicator)
- Tap a node → select that pattern in the sequencer below
- Tap the ribbon area → expand to full scene view (swap focus)

### 3. Compact Pattern (Mini Sequencer)

When the scene is the main view, the pattern editor collapses into a thin strip at the bottom:

- Shows the currently selected pattern's steps in a condensed form
- Read-only or simplified editing (tap to toggle steps)
- Tap to expand into full pattern editor (swap focus)

### 4. Focus Transitions

Triggers for swapping focus:

| Action | Result |
|--------|--------|
| Tap scene node (in ribbon) | Select pattern + stay in pattern focus |
| Tap ribbon background / expand handle | Switch to scene focus |
| Double-tap scene node (in full scene) | Switch to pattern focus for that pattern |
| Tap mini-sequencer / expand handle | Switch to pattern focus |
| Pinch-out on compact view | Expand to main |

Transitions use lightweight animations to maintain spatial continuity — no hard cut. See section 6 for details.

### 5. Layout Proportions

| Mode | Compact height | Main height |
|------|---------------|-------------|
| Desktop | ~48px | remaining |
| Mobile | ~40px | remaining |

The compact view is intentionally minimal — just enough to maintain awareness, not enough to be a distraction.

### 6. Transition Animations

All animations use CSS transform / opacity / filter only (GPU-composited, no layout thrashing). Target: 60fps on mobile.

#### Focus Swap (pane resize)

```css
.pane-scene {
  height: var(--scene-h);
  transition: height 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
```

`--scene-h` toggles between `40px` (compact) and `calc(100% - 40px)` (main). Both panes slide simultaneously — the expanding pane pushes the shrinking one.

#### Node Tap Pulse

When a scene node is tapped (in ribbon or full view) to select a pattern, a short pulse animates from the node toward the sequencer pane:

```css
@keyframes tap-pulse {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.3) translateY(8px); opacity: 0; }
}
```

Duration: 200ms. A small circle (accent color) expands and fades downward from the tapped node — gives a sense of "sending" the pattern to the editor.

#### Ribbon Node Stagger

When the scene collapses into ribbon mode, nodes pop in left-to-right with staggered delays:

```css
.ribbon-node {
  animation: pop-in 0.15s cubic-bezier(0.2, 0, 0, 1.2) backwards;
  animation-delay: calc(var(--i) * 30ms);
}
@keyframes pop-in {
  from { transform: scale(0.7); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
```

The slight overshoot in the easing (`1.2`) gives a playful bounce. Total stagger stays under 300ms (max ~10 nodes × 30ms) so it feels snappy.

#### Focus Blur Hint

The pane losing focus gets a momentary blur that clears as it settles into compact size:

```css
.pane-compact-enter {
  animation: blur-settle 0.25s ease-out;
}
@keyframes blur-settle {
  0%   { filter: blur(3px); opacity: 0.8; }
  100% { filter: blur(0); opacity: 1; }
}
```

This subtly communicates "this view is stepping back" without being heavy-handed.

#### Reduced Motion

All animations respect `prefers-reduced-motion: reduce` — swap to instant transitions with no blur/scale effects.

```css
@media (prefers-reduced-motion: reduce) {
  .pane-scene, .ribbon-node, .pane-compact-enter {
    animation: none;
    transition-duration: 0s;
  }
}
```

## Implementation Phases

### Phase 1: Layout Shell

1. Replace PAT/SCENE toggle with split container component
2. Both views render simultaneously (compact view uses CSS to constrain height)
3. Focus state (`ui.viewFocus: 'pattern' | 'scene'`) controls which is expanded
4. Animate height transitions

### Phase 2: Ribbon Scene

1. Compact SceneView renderer — horizontal node strip
2. Tap node → `selectPattern()` in the main sequencer
3. Active node highlight synced with playback

### Phase 3: Mini Sequencer

1. Compact MatrixView renderer — condensed step display
2. Read-only initially, simplified editing later
3. Pattern name + track indicators

### Phase 4: Transition Polish

1. Smooth animated focus swap (CSS transitions or spring animation)
2. Gesture support (swipe/pinch to swap focus)
3. Remember last focus per session

## Implementation Update: Overlay Sheet Model

The split view approach was prototyped but felt like "jumping to another screen" — the exact problem it aimed to solve. The design was revised to an **overlay sheet model**:

### Current Design (Desktop)

- **SceneView is always the main view** — never hidden or replaced
- **Pattern editor, FX pad, EQ** appear as overlay sheets on top of the scene
- **MatrixView** is always visible on the left as the pattern selector
- PAT/SCENE toggle buttons removed; FX/EQ toggle buttons remain in PerfBar
- Sheet triggers: MatrixView cell double-tap, SceneView pattern node double-tap
- Sheet dismiss: Escape, backdrop tap, handle bar tap
- Playback auto-engages scene mode only when no sheet is open (`!hasSheet`)
- Animations: `fade 100ms` backdrop, `fly y:12px 100ms` sheet, `slide 120ms` vel-row/piano-roll

### TODO: Mobile

- Mobile currently lacks MatrixView, so the only way to open the pattern sheet is SceneView pattern node double-tap
- Need a trigger for the initial state when no scene nodes exist yet (e.g. button in SectionNav/PerfBar, or tap empty scene area)
- Consider whether mobile needs a persistent mini pattern selector

### Playback Rules

Two independent cursors:

- `ui.currentPattern` — user's selection for viewing/editing (controlled by MatrixView taps, never by scene playback)
- `playback.playingPattern` — what the engine is actually playing (controlled by scene graph during scene mode)

Playback mode is decided at **play() time**, not during playback:

| State when play() is called | Result |
|-----|--------|
| Sheet open (pattern/FX/EQ) | Loop `ui.currentPattern` |
| Sheet closed + scene has nodes | Scene mode — graph controls playback |
| Sheet closed + no scene | Loop `ui.currentPattern` |

During scene playback:
- Scene graph advances `playback.playingPattern` — does NOT touch `ui.currentPattern`
- User can freely browse/select patterns in MatrixView without affecting playback
- Opening a sheet does NOT interrupt scene playback mid-song
- To switch to pattern loop: stop → open sheet → play

## Considerations

- **Rendering cost**: SceneView canvas runs continuously. Sheet overlay does not interfere with scene rendering
- **DockPanel interaction**: DockPanel (PARAM/FX/EQ tabs) remains accessible alongside the sheet overlay — not blocked

## Extends

| ADR | Impact |
|-----|--------|
| 046 (Simplify View Toggle) | PAT/SCENE toggle removed. FX/EQ remain as sheet toggles |
| 045 (Decouple Playback from View) | Auto-engage conditioned on `!hasSheet` instead of view focus |
| 044 (Scene Graph) | Scene data model unchanged. SceneView always mounted |
| 043 (Matrix View) | MatrixView always visible (desktop). Double-tap opens pattern sheet |
