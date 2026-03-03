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
  paramLocks?: Record<string, number>  // key → physical-unit value (same as voiceParams)
}
```

`paramLocks` is `undefined` by default (omitted). Only parameters that have been explicitly locked on a step are present. At trigger time, the engine merges `track.voiceParams` with `trig.paramLocks`, where locks win.

### Trigger Resolution

```typescript
function resolveParams(track: Track, stepIdx: number): Record<string, number> {
  const trig = track.trigs[stepIdx]
  return { ...track.voiceParams, ...(trig.paramLocks ?? {}) }
}
```

This runs on the main thread before sending trigger data to the worklet. The worklet receives the already-merged parameter set per trigger — no p-lock awareness needed in DSP code.

### UI: Step-Selection Mode

**Approach:** Reuse existing ParamPanel knobs. Toggle-button `lockMode` in ParamPanel:

1. **Enter p-lock mode:** Tap the lock toggle button in ParamPanel. `lockMode = true`.
2. **Select step:** While in lock mode, tap a step in the grid to set `selectedStep`. The step becomes highlighted.
3. **ParamPanel shows per-step values:** When a step is selected, knobs display the effective value for that step (merged base + locks). Turning a knob writes to `trig.paramLocks[key]` instead of `track.voiceParams[key]`.
4. **Exit p-lock mode:** Tap the lock toggle again, or tap the selected step again to deselect.
5. **Clear a lock:** Double-tap a knob (or long-press) to remove that key from `trig.paramLocks`, reverting to the track default.

### State Extension

```typescript
// In ui state
export const ui = $state({
  selectedTrack: 0,
  lockMode: false,                      // p-lock editing mode toggle
  selectedStep: null as number | null,   // null = no step selected, 0–15 = p-lock target
  view: 'grid' as 'grid' | 'fx' | 'eq' | 'chain',
  sidebar: null as 'help' | 'system' | null,
})
```

### Visual Indicators

- **Locked step dot:** Steps with non-empty `paramLocks` show a small dot indicator.
- **Selected step:** Highlighted when `selectedStep` matches the step index in lock mode.
- **Knob lock indicator:** When editing a locked step, knobs that have overrides show a dot or different accent color (e.g., blue instead of olive).

### StepGrid Changes

```svelte
<!-- In step button -->
<button
  class="step"
  class:playhead={isPlayhead}
  class:selected={ui.lockMode && ui.selectedStep === stepIdx}
  class:has-locks={trig.paramLocks && Object.keys(trig.paramLocks).length > 0}
  onpointerdown={() => {
    if (ui.lockMode) { ui.selectedStep = stepIdx }
    else { toggleTrig(trackId, stepIdx) }
  }}
>
```

In lock mode, tapping a step selects it for p-lock editing instead of toggling the trig.

### ParamPanel Changes

```typescript
const selectedTrig = $derived(
  ui.selectedStep !== null ? track.trigs[ui.selectedStep] : null
)

// For each knob: show locked value if present, else track default
const effectiveValue = $derived.by(() => {
  if (selectedTrig?.paramLocks?.[p.key] !== undefined) {
    return selectedTrig.paramLocks[p.key]
  }
  return track.voiceParams[p.key] ?? p.default
})

// On knob change: write to paramLocks (if step selected) or voiceParams (normal)
function onKnobChange(key: string, value: number) {
  if (ui.selectedStep !== null) {
    setParamLock(ui.selectedTrack, ui.selectedStep, key, value)
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

Factory patterns use `voiceParams` per track. No changes needed — `paramLocks` defaults to `undefined` for all trigs, so existing patterns work unchanged.

## Consequences

- **Positive:** Per-step timbre variation — huge creative potential (acid lines, rolling filter, snare tuning per step).
- **Positive:** Reuses existing ParamPanel UI — no new knob components needed.
- **Positive:** Sparse storage — only locked values stored, minimal memory overhead.
- **Positive:** Worklet stays simple — receives pre-merged params.
- **Negative:** Lock mode toggle adds an extra UI state to manage.
- **Negative:** Serialization size increases if many steps are locked (mitigated by sparse storage).
- **Dependency:** Requires current voice parameter system (already implemented).
