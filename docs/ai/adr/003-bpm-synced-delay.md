# ADR 003: BPM-Synced Delay via Beat Fraction

## Status: Implemented

## Context

The delay effect initially stored its time as absolute milliseconds (e.g., 375ms).
When the user changed BPM during playback, the delay time stayed at the old ms value, causing the delay to drift out of musical sync.

## Decision

Delay time is stored as a **beat fraction** (e.g., 0.75 = dotted 8th note) in the UI state (`effects.delay.time`).

The conversion to milliseconds happens at **send time** in `engine.ts`:

```typescript
delay: { time: (60000 / pattern.bpm) * fx.delay.time, feedback: fx.delay.feedback }
```

This means every `sendPattern()` call recalculates the delay time based on current BPM. Since `sendPattern()` fires on every reactive change (including BPM changes), the delay stays musically sync'd.

## Common Beat Fractions

| Fraction | Musical value |
|---|---|
| 0.25 | Sixteenth note |
| 0.50 | Eighth note |
| 0.75 | Dotted eighth |
| 1.00 | Quarter note |

## Consequences

- **Positive:** Delay always stays in musical sync regardless of BPM changes.
- **Positive:** Simple implementation — one multiplication at send time.
- **Negative:** The worklet receives absolute ms and doesn't know the musical relationship. This is fine because the UI recalculates on every change.
