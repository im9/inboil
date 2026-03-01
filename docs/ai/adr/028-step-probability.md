# ADR 028: Step Probability (Chance)

## Status: Proposed

## Context

All active trigs fire deterministically every cycle. Adding a per-step probability ("chance") value enables generative variation — a trig with 50% chance fires roughly half the time, introducing organic feel without manual pattern editing.

## Decision

### Data Model

Add an optional `chance` field to the `Trig` interface:

```typescript
interface Trig {
  // ...existing fields...
  chance?: number  // 0.0–1.0, default undefined (= 100%)
}
```

- `undefined` or `1.0` = always fires (backward compatible)
- `0.0` = never fires
- Values between = probability of firing each cycle

### Editing

- Chance is editable per-step, likely via a dedicated knob or tap-cycle in the step detail view (P-Lock panel area)
- Could also be P-Lockable for per-step overrides

### Worklet Integration

In `_advanceStep()`, when a trig is active, check `Math.random() < (trig.chance ?? 1.0)` before firing the voice. If the check fails, skip `noteOn` but still respect gate timing.

### UI Indication

Steps with chance < 1.0 should have a visual indicator (e.g. dimmed opacity proportional to chance value, or a small dot/badge).

## Future Extensions

- Per-track global probability multiplier
- Conditional trigs (fire on Nth repeat only, e.g. "every 4th cycle")
- Probability curves (ramp up/down over pattern length)
