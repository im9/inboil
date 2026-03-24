# ADR 123: Sweep Boolean Automation

## Status: Proposed

## Context

Sweep automation (ADR 118) controls continuous parameters (volume, cutoff, send levels) across repeat cycles via painted curves. This works well for gradual builds and transitions.

However, modern electronic music relies heavily on **boolean state changes at precise moments**: reverb hold engaging during a buildup, FX cutting out at a drop, tracks muting/unmuting for arrangement dynamics. These are not gradual — they are on/off switches at specific points in time.

Currently there is no way to automate boolean toggles across a repeat cycle. The FX function node (ADR 093) can enable/disable sends for an entire pattern, but cannot change state mid-pattern or across repeats. Hold toggles (ADR 121) will be performance-only with no automation path.

### What's missing

| Use case | Current workaround | Problem |
|---|---|---|
| Reverb hold during buildup, release at drop | Manual performance | Not reproducible in scene playback |
| FX on/off at specific beats across 32 repeats | Separate patterns per FX state | Combinatorial explosion of patterns |
| Track mute/unmute for arrangement dynamics | Manual or separate patterns | Same |
| Hold → release → hold pattern over time | Not possible | — |

## Decision

### 1. Boolean targets as sweep curves with on/off points

Extend the existing sweep curve model to support boolean targets. Instead of a separate lane system, boolean automation uses the **same SweepCanvas** — points on the timeline mark on/off transitions.

```
┌─ SweepCanvas ──────────────────────────────────┐
│  ~~cutoff~~~    ~~~volume~~~     (continuous)   │
│         ~~~~              ~~~~                  │
│                                                 │
│  VERB HOLD  ●━━━━━━━━━━━━━━●──────●━━━━━━━━━●  │
│  DLY ON     ●━━━━━━━━━━━━━━━━━━━━━●────●━━━━●  │
│             on             off     on  off      │
└─────────────────────────────────────────────────┘
```

- Points mark transitions: ON at t=0.1, OFF at t=0.5, ON at t=0.8, etc.
- Filled segments (━) = ON, empty segments (─) = OFF
- Same canvas, same point-painting interaction as continuous curves
- Click to place on/off points, same as placing curve points

### 2. SweepToggleTarget type

```typescript
SweepToggleTarget =
  | { kind: 'hold';  fx: 'verb' | 'delay' | 'glitch' | 'granular' }
  | { kind: 'fxOn';  fx: 'verb' | 'delay' | 'glitch' | 'granular' }
  | { kind: 'mute';  trackId: number }
```

### 3. SweepToggleCurve — same pattern as SweepCurve

```typescript
SweepToggleCurve {
  target: SweepToggleTarget
  points: number[]    // sorted t values (0–1), each toggles state
                      // odd index = ON→OFF, even index = OFF→ON
                      // starts OFF before first point
  color: string
}
```

Points are simple `t` values — no `v` needed since state alternates. First point = ON, second = OFF, third = ON, etc. This mirrors how continuous curves use `{ t, v }` points but simplified for boolean.

### 4. Extend SweepData

```typescript
SweepData {
  curves: SweepCurve[]           // existing continuous automation
  toggles?: SweepToggleCurve[]   // boolean automation
}
```

Backwards compatible — `toggles` is optional, existing sweep nodes work unchanged.

### 5. Playback evaluation

`applySweepStep()` already evaluates continuous curves per step. Add toggle evaluation in the same pass:

- For each toggle curve, count how many points are ≤ current progress `t`
- Odd count = ON, even count = OFF
- Apply the boolean state to the corresponding perf/state field
- On sweep end (pattern exit), restore all toggled states to pre-sweep values (same snapshot/restore as continuous sweep)

### 6. SweepCanvas UI

- Boolean curves rendered as horizontal bars on the same canvas as continuous curves
- Click on the bar timeline to place toggle points (alternating on/off)
- ON regions shown as filled color bars, OFF regions as thin lines
- Target picker: same palette UI, with boolean targets in a separate group
- Delete points by clicking existing points (same as continuous curve editing)

## Considerations

- **Hold depends on ADR 121**: Hold toggle targets require `perf.reverbHold` etc. to exist first
- **FX on/off**: Currently FxPad on/off is UI state, not perf state. May need to promote FX on/off to perf booleans for sweep to control them
- **Mute vs volume=0**: Track mute is a boolean (instant silence), volume sweep to 0 is gradual. Both useful — toggle for mute, continuous curve for fade
- **Resolution**: Evaluated per-step, same as continuous. Sub-step boolean changes would cause clicks
- **Initial state**: Before first point = OFF. To start ON from the beginning, place a point at t=0
- **Snapshot restore**: Existing `AutomationSnapshot` pattern handles restoring all toggled booleans when sweep stops

## Implementation Phases

### Phase 1: Data model + playback
- Add `SweepToggleCurve` / `SweepToggleTarget` types
- Extend `SweepData` with optional `toggles`
- Evaluate toggles in `applySweepStep()`
- Snapshot/restore for boolean state

### Phase 2: SweepCanvas UI
- Render boolean curves as horizontal bar segments
- Point placement/deletion interaction
- Target picker with boolean param group

### Phase 3: Full target coverage
- Hold targets (requires ADR 121)
- FX on/off targets (may require promoting FxPad state to perf)
- Track mute targets
