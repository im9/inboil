# ADR 096: Odd Step Counts & Rotary Bubble Picker

## Status: Proposed

## Context

The current `STEP_OPTIONS = [2, 4, 8, 12, 16, 24, 32, 48, 64]` only includes even numbers. The engine already handles arbitrary integers via `playhead % track.steps`, but the UI restricts users to even options only.

Polyrhythm is a huge potential draw for INBOIL — layering a 5- or 7-step HI-HAT against a 16-step KICK instantly brings minimal patterns to life. The docs (first-beat guide) already recommend "try odd step counts for polyrhythm," but the implementation doesn't support it yet.

The UI is also a problem. The current step selector is a 20×20px button (`StepGrid.svelte:180`) that cycles through STEP_OPTIONS on click. Expanding from 9 to 19+ options makes cycling impractical — too many clicks to reach the desired value.

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

### 2. Rotary Bubble Picker UI

Replace the click-to-cycle button with a long-press bubble menu. Inspired by the rotary dial metaphor.

```
Normal state:        Long-press to expand:

 ┌────┐            ╭ 3  5  7 ╮
 │ 16 │    →     9  ●────── 11
 └────┘          8 │  16  │ 12
                 6 ●──────● 13
                 4 ╰ 14 15 16╯
                   24 32 48 64
```

#### UI Details

- **Trigger**: Long-press (300ms) or context menu (right-click). Short click retains the existing cycle behavior
- **Layout**: Bubbles fan out radially from the step count button (radius 80–100px)
- **Bubble grouping**:
  - Inner ring: 2–16 (common step counts, 15 items)
  - Outer ring highlight: 24, 32, 48, 64 (extended, 4 items)
  - Odd numbers visually distinguished with accent color
- **Selection**: Drag over a bubble and release (touch-friendly). Tap on a bubble also selects
- **Dismiss**: Selection confirms, backdrop tap, or Escape key
- **Animation**: Expand 150ms (staggered scale-in), collapse 100ms
- **Polyrhythm indicator**: On hover, show LCM (least common multiple) with other tracks as a tooltip
  - Example: KICK=16, HI-HAT candidate=7 → "LCM: 112 steps = 7 bars"

#### Component Structure

```
StepGrid.svelte
  └─ StepBubblePicker.svelte  (new)
       ├─ Bubble layout engine (polar → xy coordinates)
       ├─ Touch/pointer event handling
       └─ LCM tooltip
```

- `StepBubblePicker` mounts as a portal/overlay on `document.body` (avoids overflow clipping)
- Position anchored to the trigger button via `getBoundingClientRect()`

### 3. Engine Changes

None. `playhead % track.steps` works with any integer. The `setTrackSteps()` trig array expand/shrink logic also handles arbitrary integers correctly.

### 4. Mobile Support

- Long-press (300ms hold) is the default trigger on touch devices
- Bubble size: 36×36px (minimum recommended touch target)
- Drag selection: sliding a finger over bubbles produces haptic-style highlight
- Context menu suppressed (`preventDefault` on `contextmenu`)

### 5. Implementation Phases

**Phase 1: Expand STEP_OPTIONS**
- Update the array in `stepActions.ts`
- Existing cycle UI continues to work (just more options)
- Verify doc consistency

**Phase 2: StepBubblePicker**
- New component
- Polar coordinate layout engine
- Long-press trigger + drag selection
- Odd-number accent color, current-value highlight

**Phase 3: Polyrhythm Hints**
- LCM calculation utility
- Hover/focus tooltip
- Cross-track relationship display

## Considerations

- **StepGrid header width**: Currently `--head-w: 136px` includes btn-steps at 20px. The bubble picker is an overlay so it doesn't affect layout; the trigger button size stays the same
- **Preserving cycle behavior**: Short click still cycles (for power users). 19 options is a long cycle, but frequently used values (8, 16, 32) appear early
- **Saved data compatibility**: `setTrackSteps()` accepts arbitrary integers, so no compatibility issues with existing saves
- **LCM upper bound**: Extreme combinations (e.g. 13×11 = 143 steps) produce long cycles, but that's the whole point of polyrhythm. No cap needed

## Future Extensions

- **Preset groups**: Category filters like "Euclidean," "Odd meter," "Standard"
- **Euclidean rhythm generation**: After selecting step count, option to auto-place Euclidean hits (e.g. 3 hits on 5 steps = `x.x.x..x.x`)
- **Keyboard shortcut**: Direct number key input for step count
- **Generalize bubble picker**: Reuse the same UI pattern for other selectors (BPM presets, scale selection, etc.)
