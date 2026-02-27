# ADR 004: Queued Pattern Switching at Loop Boundary

## Status: IMPLEMENTED

## Context

In a live performance groovebox, switching patterns mid-loop is disorienting.
Elektron hardware (Digitakt, Syntakt) queues pattern changes to apply at the end of the current pattern cycle.

## Decision

When the user selects a new pattern **during playback**, the switch is queued:

1. `patternNav.pendingId` is set to the target pattern number.
2. The UI immediately shows the pending pattern number with a **blinking animation** (400ms pulse) so the user knows the change is acknowledged.
3. On each step advance, `App.svelte`'s `onStep` callback checks if track 0's playhead wrapped to step 0.
4. When it wraps, `applyPendingSwitch()` saves the current pattern to its bank slot and loads the target.
5. On stop, any pending switch is applied immediately (via `clearPendingSwitch()`).

When the user selects a pattern while **stopped**, the switch happens immediately.

If the user selects a different pattern before the queued switch fires, the pending target is replaced (not queued further — only one pending switch at a time).

## Implementation

```
state.svelte.ts:
  patternNav = $state({ pendingId: 0 })
  switchPattern(id) — sets pendingId during playback, loads immediately when stopped
  applyPendingSwitch() — called from onStep when track 0 wraps
  clearPendingSwitch() — called on stop, applies pending immediately

AppHeader.svelte:
  displayPatId = pendingId > 0 ? pendingId : pattern.id
  isPending = pendingId > 0 → triggers blink animation
```

## Consequences

- **Positive:** Matches Elektron hardware UX — no jarring mid-loop switches.
- **Positive:** User gets immediate visual feedback that the switch is queued.
- **Positive:** Simple implementation using reactive state.
- **Negative:** Multi-pattern queue (e.g., 01→02→02→03) is not supported — only one pending target. This is intentional for v1.
