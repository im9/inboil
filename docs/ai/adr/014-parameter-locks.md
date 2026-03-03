# ADR 014: Parameter Locks

## Status: Implemented

## Context

Currently all 16 steps of a track share the same voice parameters (cutoff, decay, etc.). Parameter locks (p-locks) allow per-step parameter overrides — a technique pioneered by Elektron hardware. This enables tonal motion, filter sweeps, and per-step timbre variation without automation lanes.

## Proposed Design

### Data Model

```typescript
// Per-step parameter overrides (sparse — only locked params are stored)
interface Trig {
  active: boolean
  velocity: number
  note: number
  locks: Record<string, number>  // key → physical-unit value (same as voiceParams)
}
```

`locks` is empty `{}` by default. Only parameters that have been explicitly locked on a step are present. At trigger time, the engine merges `track.voiceParams` with `trig.locks`, where locks win.

### Trigger Resolution

```typescript
function resolveParams(track: Track, stepIdx: number): Record<string, number> {
  const trig = track.trigs[stepIdx]
  return { ...track.voiceParams, ...trig.locks }
}
```

This runs on the main thread before sending trigger data to the worklet. The worklet receives the already-merged parameter set per trigger — no p-lock awareness needed in DSP code.

### UI: Step-Selection Mode

**Approach:** Reuse existing ParamPanel knobs. Add a step-selection interaction:

1. **Enter p-lock mode:** Tap-and-hold a step in the grid (or tap a step while the track is already selected). The step becomes "focused" — indicated by a pulsing highlight.
2. **ParamPanel shows per-step values:** When a step is focused, knobs display the effective value for that step (merged base + locks). Turning a knob writes to `trig.locks[key]` instead of `track.voiceParams[key]`.
3. **Exit p-lock mode:** Tap elsewhere, tap the focused step again, or tap another step to switch focus.
4. **Clear a lock:** Double-tap a knob (or long-press) to remove that key from `trig.locks`, reverting to the track default.

### State Extension

```typescript
// In ui state
export const ui = $state({
  selectedTrack: 0,
  focusedStep: -1,  // -1 = no step focused (normal mode), 0–15 = p-lock editing
  view: 'grid' as 'grid' | 'fx',
})
```

### Visual Indicators

- **Locked step dot:** Steps with non-empty `locks` show a small dot or diamond below the trig square.
- **Focused step:** Pulsing border or glow animation on the currently focused step.
- **Knob lock indicator:** When editing a locked step, knobs that have overrides show a dot or different accent color (e.g., blue instead of olive).

### StepGrid Changes

```svelte
<!-- In step button -->
<button
  class="step"
  class:playhead={isPlayhead}
  class:focused={ui.focusedStep === stepIdx}
  class:has-locks={Object.keys(trig.locks).length > 0}
  onpointerdown={() => toggleTrig(trackId, stepIdx)}
  onpointerdown|long={() => { ui.focusedStep = stepIdx }}
>
```

Long-press detection (~300ms) differentiates between toggle (short tap) and p-lock focus (hold).

### ParamPanel Changes

```typescript
const focusedTrig = $derived(
  ui.focusedStep >= 0 ? track.trigs[ui.focusedStep] : null
)

// For each knob: show locked value if present, else track default
const effectiveValue = $derived.by(() => {
  if (focusedTrig && focusedTrig.locks[p.key] !== undefined) {
    return focusedTrig.locks[p.key]
  }
  return track.voiceParams[p.key] ?? p.default
})

// On knob change: write to locks (if step focused) or voiceParams (normal)
function onKnobChange(key: string, value: number) {
  if (ui.focusedStep >= 0) {
    setTrigLock(ui.selectedTrack, ui.focusedStep, key, value)
  } else {
    setVoiceParam(ui.selectedTrack, key, value)
  }
}
```

### Worklet Message Update

Currently `sendPattern()` sends track-level voiceParams. With p-locks, the trigger message needs per-step resolved params:

```typescript
// Option A: Send full resolved params per active trig
trigData[stepIdx] = {
  active: trig.active,
  velocity: trig.velocity,
  note: trig.note,
  params: resolveParams(track, stepIdx),  // merged
}

// Option B: Send base voiceParams + per-trig lock overrides (smaller payload)
// Worklet merges at trigger time
```

Option A is simpler (worklet stays unaware of p-locks). Option B saves bandwidth if many steps share the same base params. Start with Option A.

### Factory Pattern Compatibility

Factory patterns use `voiceParams` per track. No changes needed — `locks` defaults to `{}` for all trigs, so existing patterns work unchanged.

## Consequences

- **Positive:** Per-step timbre variation — huge creative potential (acid lines, rolling filter, snare tuning per step).
- **Positive:** Reuses existing ParamPanel UI — no new knob components needed.
- **Positive:** Sparse storage — only locked values stored, minimal memory overhead.
- **Positive:** Worklet stays simple — receives pre-merged params.
- **Negative:** Long-press detection adds touch interaction complexity (must not interfere with toggle).
- **Negative:** Serialization size increases if many steps are locked (mitigated by sparse storage).
- **Dependency:** Requires current voice parameter system (already implemented).
