# ADR 033: Mobile Velocity Editing (Long-press Gauge)

## Status: Proposed

## Context

Desktop has an inline velocity lane (drag bars per step) below each selected track. On mobile (`MobileTrackView`), there is no way to adjust per-step velocity. The calculator-style step buttons only toggle on/off.

## Decision

### Interaction Model

Long-press on a calc-btn to enter velocity-edit mode for that step:

1. **Tap** (< 300ms): Toggle trig on/off (existing behavior, unchanged)
2. **Long-press** (≥ 300ms): Enter velocity-drag mode
   - Visual feedback: the "on" face color fills proportionally to velocity (e.g. 70% velocity → olive fills 70% from bottom)
   - While holding, drag **up/down** to adjust velocity (up = louder, down = softer)
   - Release to confirm

### Visual Design

The active step's `.face.on` becomes a velocity gauge:

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│          │     │  ░░░░░░  │     │  ████████ │
│   OFF    │     │  ░░░░░░  │     │  ████████ │
│          │     │  ██████  │     │  ████████ │
│          │     │  ██████  │     │  ████████ │
└──────────┘     └──────────┘     └──────────┘
  inactive        vel = 50%        vel = 100%
```

- The filled portion uses `--color-olive` (existing active color)
- The unfilled portion uses a dimmed variant (e.g. `rgba(108,119,68,0.2)`)
- During drag, show velocity percentage overlay text (e.g. "72%")

### State Management

- `velDragStep: number | null` — which step is being velocity-edited
- `velDragActive: boolean` — whether currently in drag mode
- Use a 300ms timeout on `pointerdown` to distinguish tap vs long-press
- If the pointer moves significantly before 300ms, cancel long-press detection

### Implementation Notes

- Reuse existing `setTrigVelocity()` from state
- Calculate velocity from vertical drag delta: `v = clamp(startVel + (startY - clientY) / 100, 0.05, 1.0)`
- The step must be active (trig.active = true) to edit velocity; if tapping an inactive step, toggle it on first
- Consider haptic feedback via `navigator.vibrate(10)` on entering vel-edit mode (if supported)

### Constraints

- Must not interfere with existing tap-to-toggle behavior
- Must work with touch (not just pointer) on iOS Safari
- `touch-action: none` already set on calculator area
- Lock mode interaction: if lock mode is active, long-press should still select the step (existing behavior), not edit velocity

## Future Extensions

- Visual velocity indicators on all steps (not just during editing) — e.g. opacity or fill height always visible
- Swipe across multiple steps to "paint" velocity curves
