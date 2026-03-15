# ADR 096: Odd Step Counts & PO-Style Step Picker

## Status: Implemented

## Context

The original `STEP_OPTIONS = [2, 4, 8, 12, 16, 24, 32, 48, 64]` only included even numbers. The engine already handles arbitrary integers via `playhead % track.steps`, but the UI restricted users to even options only.

Polyrhythm is a huge potential draw for INBOIL — layering a 5- or 7-step HI-HAT against a 16-step KICK instantly brings minimal patterns to life. The docs (first-beat guide) already recommend "try odd step counts for polyrhythm," but the implementation didn't support it yet.

The UI was also a problem. The step selector was a 20×20px button that cycles through STEP_OPTIONS on click. Expanding from 9 to 19+ options made cycling impractical.

### Design iterations

A rotary bubble picker was prototyped first (radial overlay with 19 bubbles), but rejected:

- 19 bubbles in a radial layout was too crowded and hard to scan
- A two-level drill-down variant (5 group bubbles → 3–4 value bubbles) was tried but felt unintuitive
- The long-press → overlay → select flow had interaction issues (menu closing on pointer-up)

The final design follows the **Pocket Operator approach**: long-press the step button to enter step-set mode, then tap directly on the step grid to set the length. This is immediate, visual, and works identically on desktop and mobile.

## Decision

### 1. Expand STEP_OPTIONS

```ts
// stepActions.ts
export const STEP_OPTIONS = [
  2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 12, 13, 14, 15, 16,
  24, 32, 48, 64,
] as const
```

All integers from 2–16, plus extended steps 24/32/48/64. 19 options total.

- 1 is excluded (1-step = drone; limited use case)
- 17–23, 25–31, etc. are excluded (clutters UI with little polyrhythmic benefit)
- `setTrackSteps()` clamping needs no change (already `Math.max(2, Math.min(64, n))`)

### 2. PO-Style Step-Set Mode

Long-press (300ms) or right-click the step count button to enter **step-set mode** for that track row. The step grid transforms into a step-count selector:

```
Normal state:              Step-set mode:
┌──────────────────┐       ┌──────────────────────────────────────────┐
│ KICK  16  S  M   │  →    │ KICK  16  S  M   1  2  3  4 ... 16  24 32 48 64 │
│ ■□■□■□■□■□■□■□■□ │       │                  ████████████░░░░  ┆  ┆  ┆  ┆    │
└──────────────────┘       └──────────────────────────────────────────┘
                                              ▲ active    ▲ ghost  ▲ ext (dashed)
```

#### Behavior

- **Trigger**: Long-press (300ms) or right-click on the step count button
- **Grid**: Temporarily shows 16 cells + 4 extended cells (24, 32, 48, 64), each displaying its number
- **Active cells** (≤ current step count): Olive-tinted background, colored number
- **Current-end cell**: Olive border highlight showing current step count boundary
- **Ghost cells** (> current step count): Dim, untinted
- **Extended cells**: Dashed border to distinguish from 1–16
- **Selection**: Tap any cell to set that step count, mode closes automatically
- **Dismiss**: Tap the step count button again, or right-click again
- **Short tap**: Preserved — still cycles through STEP_OPTIONS as before

#### No separate component

Step-set mode is implemented directly in `StepGrid.svelte` using a conditional `{#if}` block. No overlay, no portal, no new component. The step grid itself transforms.

### 3. Engine Changes

None. `playhead % track.steps` works with any integer.

### 4. Mobile Support

- Long-press (300ms) works identically on touch devices
- Step-set cells use the same 24px grid as normal steps
- Context menu suppressed (`preventDefault` on `contextmenu`)

## Considerations

- **Preserving cycle behavior**: Short click still cycles through STEP_OPTIONS. 19 options is a long cycle, but commonly used values (8, 16, 32) appear early
- **Saved data compatibility**: `setTrackSteps()` accepts arbitrary integers, so no compatibility issues with existing saves
- **Rejected approach**: Rotary bubble picker (StepBubblePicker.svelte) was built and deleted — too many items for radial layout, interaction issues with long-press overlay

## Future Extensions

- **Euclidean rhythm generation**: After selecting step count, option to auto-place Euclidean hits (e.g. 3 hits on 5 steps = `x.x.x..x.x`)
- **Keyboard shortcut**: Direct number key input for step count
- **LCM polyrhythm hints**: Show least common multiple with other tracks when hovering in step-set mode
