# ADR 033: Mobile Velocity / Chance Editing

## Status: Implemented

## Context

Desktop has an inline velocity lane (drag bars per step) below each selected track. On mobile (`MobileTrackView`), there is no way to adjust per-step velocity or chance. The calculator-style step buttons only toggle on/off.

## Decision

### 3-Mode Tab System

Instead of long-press detection (unreliable on Mac trackpad), use an explicit mode switcher:

- **STEP** mode (default): tap toggles trig on/off, paint-drag supported
- **VEL** mode: drag up/down on active steps to edit velocity, tap to reset to 1.0
- **CHNC** mode: drag up/down on active steps to edit chance, tap to reset to 1.0

Animated tab bar with sliding pill indicator (CSS `transition: left 200ms`).

### Visual Design

Active steps show a velocity/chance gauge as a gradient fill:

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│          │     │  ░░░░░░  │     │  ████████ │
│   OFF    │     │  ░░░░░░  │     │  ████████ │
│          │     │  ██████  │     │  ████████ │
│          │     │  ██████  │     │  ████████ │
└──────────┘     └──────────┘     └──────────┘
  inactive        vel = 50%        vel = 100%
```

- Gauge visible on ALL active steps in VEL/CHNC mode (not just during drag)
- Olive fill for velocity, blue fill for chance
- Percentage overlay shown during active drag

### Implementation Notes

- Uses `mousemove`/`mouseup` for trackpad + `touchmove`/`touchend` for mobile (PointerEvent unreliable on Mac trackpad)
- Plain JS variables for drag mechanics (not `$state`) to avoid Svelte re-render overhead
- `setTrigVelocity()`/`setTrigChance()` called once at drag start (for undo snapshot), then direct trig property mutation during drag
- Sensitivity: `dy / 60` for comfortable drag range
- Lock mode: long-press selects step (existing behavior), not velocity edit

### Constraints

- STEP mode behavior unchanged from before
- Only active trigs can be edited in VEL/CHNC mode
- `touch-action: none` already set on calculator area
- iOS Safari compatible via touch event listeners with `{ passive: false }`

## Future Extensions

- Swipe across multiple steps to "paint" velocity curves
