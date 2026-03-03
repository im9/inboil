# ADR 006: Per-Step Velocity Editing

## Status: IMPLEMENTED

## Context

The data model already stores per-step velocity (`WorkletTrig.velocity`), but the UI has no direct way to edit it. Currently velocity is either default (1.0) or set by FILL (random 0.55–1.0). Velocity variation is essential for dynamic, human-feeling patterns.

## Proposed Design

### Option A: Velocity bar overlay

A mini bar chart overlaid on the step grid, toggled by a VEL button. Each bar represents one step's velocity (0.0–1.0). Drag vertically to adjust.

Pros: Visual, precise, common in DAWs (FL Studio, Ableton).
Cons: Needs additional UI real estate or overlay mode.

### Option B: Hold-and-drag on step

Hold a step button + drag up/down to adjust velocity. Value shown as opacity or bar height on the step face.

Pros: No extra UI, direct manipulation.
Cons: Discoverability — hidden gesture.

### Option C: Step detail panel

Tap an active step to open a small detail popup with velocity knob + note selector.

Pros: Extensible (can add per-step probability, ratchet, etc. later).
Cons: Extra tap to access, slows workflow.

## Recommendation

**Option A** for desktop (bar overlay), **Option B** as secondary for quick tweaks. The bar overlay maps well to the existing light zone aesthetic and is a proven pattern.

## Consequences

- **Positive:** Unlocks dynamic, expressive patterns without leaving the step grid.
- **Positive:** Data model already supports it — no worklet changes needed.
- **Negative:** Adds a UI mode (velocity editing vs. step toggling). Must be clearly indicated.
