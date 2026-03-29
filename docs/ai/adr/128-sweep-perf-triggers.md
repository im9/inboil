# ADR 128: Sweep Automation for Perf Triggers (Fill / Reverse / Break)

## Status: Proposed

## Context

The performance buttons (Fill, Reverse, Break) in `PerfButtons.svelte` and `MobilePerfSheet.svelte` currently only support manual triggering — the user presses/holds the button during playback. These buttons set `perf.filling`, `perf.reversing`, and `perf.breaking` which the AudioWorklet reads each tick.

During scene playback, there is no way to pre-program these triggers. This limits scene arrangement expressiveness:

- **Fill** adds variation to repetitive patterns (e.g. "fill on bar 4 of every 4-bar phrase") without creating separate patterns
- **Break** creates silence/gaps — an effect impossible to achieve with step sequencer patterns alone
- **Reverse** flips playback direction for glitch/transition effects

The sweep toggle system (ADR 123) already handles boolean automation for `hold`, `fxOn`, and `mute` targets. Adding perf triggers follows the same architecture.

### Current toggle evaluation

`evaluateToggle()` in `sweepEval.ts` uses **interval semantics**: it returns the on/off state at the current progress point. This naturally maps to perf triggers — fill/rev/brk should be active for the duration of the "on" interval, matching how the manual buttons work (hold to activate).

### Current perf state

```typescript
// constants.ts — DEFAULT_PERF
filling: false,
reversing: false,
breaking: false,
```

Set by `PerfButtons.svelte` (pointerdown/pointerup) and `MobilePerfSheet.svelte` (touch + shake). Read by `worklet-processor.ts` via message passing.

## Decision

### 1. Extend SweepToggleTarget

Add a `perf` kind to `SweepToggleTarget` in `types.ts`:

```typescript
export type SweepToggleTarget =
  | { kind: 'hold';  fx: 'verb' | 'delay' | 'glitch' | 'granular' }
  | { kind: 'fxOn';  fx: 'verb' | 'delay' | 'glitch' | 'granular' }
  | { kind: 'mute';  trackId: number }
  | { kind: 'perf';  param: 'fill' | 'rev' | 'brk' }       // ← new
```

### 2. Scope routing

Perf triggers are **chain-scoped** (per-pattern), so `isGlobalTarget()` returns false for them. Each pattern's sweep node stores its own fill/rev/brk automation, enabling different perf gestures per pattern (e.g. "fill on bar 4 of INTRO", "brk before BUILD drop").

During recording, perf toggles go to `toggleCaptures` (not `globalToggleCaptures`) and get flushed at chain transitions, ensuring each pattern gets its own perf automation.

### 3. Playback application

In `scenePlayback.ts` `applySweepData()`, add a case for the `perf` kind alongside existing `hold`/`fxOn`/`mute`:

```typescript
const PERF_MAP: Record<string, keyof typeof perf> = {
  fill: 'filling', rev: 'reversing', brk: 'breaking',
}

// inside toggle evaluation loop:
} else if (toggle.target.kind === 'perf') {
  const key = PERF_MAP[toggle.target.param]
  if (key && perf[key] !== on) {
    (perf as unknown as Record<string, boolean>)[key] = on
    changed = true
  }
}
```

### 4. Semantics: interval-active

Perf triggers use **interval semantics** (same as all existing toggle targets): the effect is active for the entire "on" region of the toggle curve. This matches the manual button behavior (hold to activate, release to deactivate).

No edge-trigger logic needed — `evaluateToggle()` already returns the correct state.

### 5. Recording support

`captureToggle()` in `sweepRecorder.svelte.ts` already handles any `SweepToggleTarget`. The PerfButtons component needs to call `captureToggle()` when toggling during recording:

```typescript
// PerfButtons.svelte — onToggle handler:
captureToggle({ kind: 'perf', param: 'fill' }, on, '--salmon-text')
```

Same for MobilePerfSheet. Color convention: use `--salmon-*` tokens (perf accent color).

### 6. Label support

Update `toggleLabel()` in `sweepCanvasHelpers.ts`:

```typescript
if (target.kind === 'perf') {
  const labels: Record<string, string> = { fill: 'Fill', rev: 'Reverse', brk: 'Break' }
  return labels[target.param] ?? target.param
}
```

### 7. Target key

Update `targetKey()` in `sweepEval.ts`:

```typescript
// existing: hold:verb, fxOn:delay, mute:3
// new:
if (target.kind === 'perf') return `perf:${target.param}`
```

### 8. SweepCanvas toggle picker

The toggle target picker in SweepCanvas needs to offer perf targets alongside existing hold/fxOn/mute options. Three new entries: Fill, Reverse, Break.

## Implementation Checklist

- [x] Add `perf` kind to `SweepToggleTarget` in `types.ts`
- [x] Add `targetKey()` case in `sweepEval.ts` (falls into existing `param` branch → `perf:fill`)
- [x] Update `isGlobalTarget()` in `sweepEval.ts` (perf has `param` → handled in `'param' in target` branch)
- [x] Add `PERF_MAP` + playback case in `scenePlayback.ts`
- [x] Update `toggleLabel()` in `sweepCanvasHelpers.ts`
- [x] Call `captureToggle()` from `PerfButtons.svelte`
- [x] Call `captureToggle()` from `MobilePerfSheet.svelte`
- [x] Add perf targets to SweepCanvas toggle picker (recording-only — no manual picker needed)
- [x] Add unit tests for new target in `sweepPlayback.test.ts` + `sweepCanvasHelpers.test.ts`
- [ ] Verify with demo song: fill on bar 4, brk before drop

## Considerations

- **No worklet changes needed**: perf flags are already sent from main thread to worklet via existing message flow. Sweep just sets the same `perf.*` flags that the manual buttons do.
- **Overdub merging**: existing `mergeOverdubToggles()` works for perf targets without modification — same data shape.
- **Restore/migration**: no migration needed. Old saves without `perf` toggles simply have no perf automation — backwards compatible.
- **Conflict with manual input**: if the user manually presses Fill while sweep has it automated, `isUserControlled()` already prevents sweep from overriding manual input during recording.

## Phase 2: Quantized Recording (Implemented)

Perf toggle points are auto-quantized to bar boundaries during recording. `quantizeTogglePoints()` in `sweepRecorder.svelte.ts` snaps each point's `t` to the nearest bar grid (`msPerBar / totalMs`).

- Only applies to `perf` kind targets — other toggles (hold/fxOn/mute) remain unquantized
- Pure helper exported for testability
- Bar size derived from `song.bpm` at recording time

### Phase 2 Checklist

- [x] Extract `quantizeTogglePoints()` as pure function
- [x] Apply quantization in `convertGlobalToggleCaptures()` for perf targets
- [x] Add unit tests for quantize logic

## Future Extensions

- **Fill intensity parameter**: varying fill density (light fill vs heavy fill) as a continuous sweep curve rather than toggle (see BACKLOG)
- **Custom break patterns**: instead of silence, allow break to trigger a specific pattern or effect tail
