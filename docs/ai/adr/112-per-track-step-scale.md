# ADR 112: Per-Track Step Scale

## Status: Proposed

## Context

All tracks currently advance at the same step rate (1/16 note per step). The worklet uses a single `stepInterval` derived from BPM, and all playheads advance by 1 on every step tick. This means a 16-step pattern always spans 1 bar at 1/16 resolution.

Hardware sequencers like Elektron Model:Cycles allow per-track "scale" settings (1/8, 1/16, 1/32, etc.) so different tracks can run at different resolutions within the same pattern. This enables polyrhythmic and polymetric patterns — e.g., a hi-hat running at 1/32 while the kick runs at 1/16.

### Current timing architecture (worklet-processor.ts)

```
stepTick():
  patternPos++                    // global position counter
  for each track:
    playheads[t] = (playheads[t] + 1) % track.steps
    // all tracks advance at same rate
```

- `samplesPerStep` = `(60 / bpm) * sampleRate / 4` (1/16 note)
- `patternLen` = max step count across all tracks
- `patternPos` = global cycle counter (0..patternLen)
- Swing: alternates threshold between even/odd steps globally

## Decision

### A. Base resolution: 1/32

Double the internal tick rate from 1/16 to 1/32. Each track gets a `divisor` that determines how many base ticks pass before it advances:

| Scale | Divisor | Steps per bar | Behavior |
|-------|---------|---------------|----------|
| 1/8   | 4       | 8             | Half-time |
| 3/16  | 3       | ~10.67        | Dotted 8th |
| 1/16  | 2       | 16            | Standard (default) |
| 3/32  | 1.5     | ~21.33        | Dotted 16th |
| 1/32  | 1       | 32            | Double-time |

Default divisor = 2 (1/16 resolution), which preserves current behavior exactly.

### B. Data model

```typescript
// types.ts — add to Cell
export interface Cell {
  // ... existing fields ...
  scale?: number  // step divisor (default 2 = 1/16). 1 = 1/32, 4 = 1/8
}
```

Cell-level (not Track-level) because scale is a pattern property — the same track can have different scales in different patterns, just like step count and voiceParams.

### C. Worklet changes

```typescript
// worklet-processor.ts

// Change: samplesPerStep now at 1/32 base
// samplesPerStep = (60 / bpm) * sampleRate / 8  (was /4)

// Per-track accumulators replace single patternPos for step timing
private trackAccum: Float64Array = new Float64Array(MAX_VOICES)  // fractional step counter
private divisors: Float64Array = new Float64Array(MAX_VOICES).fill(2)  // default 1/16

stepTick():
  // patternPos still increments at 1/32 base for cycle detection
  patternPos++

  for each track t:
    trackAccum[t] += 1.0
    if trackAccum[t] >= divisors[t]:
      trackAccum[t] -= divisors[t]
      // advance playhead — this is where noteOn/noteOff happens
      playheads[t] = (playheads[t] + 1) % track.steps
      processTrig(t, playheads[t])
    // else: skip this track on this tick
```

Key insight: `trackAccum` handles fractional divisors (e.g., 1.5 for 3/32) correctly — the accumulator wraps naturally.

### D. Swing interaction

Swing currently alternates the step threshold between even/odd steps. With per-track scale, swing must apply per-track:

```typescript
// Per-track swing phase
private swingPhases: Uint8Array = new Uint8Array(MAX_VOICES)

// In track step processing:
const isOdd = swingPhases[t] & 1
swingPhases[t]++
const threshold = isOdd
  ? (1 + swing) * 2 * baseSamplesPerStep * divisors[t]
  : (1 - swing) * 2 * baseSamplesPerStep * divisors[t]
```

### E. Pattern length / cycle detection

`patternLen` stays as the cycle boundary in base ticks (1/32). For a track with 16 steps at divisor 2, it needs 32 base ticks to complete. For 32 steps at divisor 1, also 32 base ticks.

```typescript
// patternLen = max across all tracks of (track.steps * track.divisor)
patternLen = Math.max(...tracks.map(t => t.steps * (t.divisor ?? 2)))
```

### F. UI display

The step grid already supports variable step counts per track. The scale selector goes in the existing step-count area of the track header:

```
┌─ Track Header ──────────────┐
│ [KICK] [16] [1/16▾]  M  S  │
│  ▸ name   steps  scale      │
└─────────────────────────────┘
```

Scale is a dropdown/cycle button with preset values: `1/8`, `3/16`, `1/16`, `3/32`, `1/32`.

The step LED positions in StepGrid don't change — they always show one LED per step. The visual density just means "this track plays faster/slower."

### G. WorkletPattern extension

```typescript
// dsp/types.ts — add scale to WorkletTrack
export interface WorkletTrack {
  // ... existing fields ...
  scale?: number  // divisor (default 2)
}
```

`buildWorkletPattern` in engine.ts reads `cell.scale` and maps to `track.scale`.

### H. Implementation phases

**Phase 1: Worklet core**
- Change base resolution to 1/32
- Add `trackAccum[]` and `divisors[]`
- Update `stepTick()` to use per-track advancement
- Verify default divisor=2 produces identical behavior to current code
- Unit test: timing accuracy at various divisors

**Phase 2: Data model + engine**
- Add `scale?` to Cell type
- Update `buildWorkletPattern` to pass scale
- Update `cloneCell`, `restoreCell`, `validateCell`
- Playhead display: step events still sent per-track, UI unchanged

**Phase 3: UI**
- Scale selector in StepGrid track header
- Scale selector in DockTrackEditor
- Mobile: MobileParamOverlay scale control
- Persist in song save/load

## Considerations

- **Backward compatibility**: Default divisor=2 means existing songs play identically. No migration needed — missing `scale` field = 1/16.
- **Fractional divisors**: 3/16 (divisor=3) and 3/32 (divisor=1.5) produce triplet-like feels. The accumulator approach handles this without special cases.
- **Step count independence**: Scale and step count are orthogonal. 8 steps at 1/32 = same time as 16 steps at 1/16. Users can combine freely.
- **Playhead sync**: When multiple tracks have different scales, their playheads drift naturally. Pattern cycle resets all playheads, maintaining bar alignment.
- **CPU**: Ticking at 1/32 base doubles the step-processing rate, but `stepTick` is cheap (no DSP, just index math). Voice `tick()` runs at sample rate regardless. Impact is negligible.
- **Swing granularity**: Swing at 1/32 base is finer than at 1/16. This is a benefit — 1/32 swing produces subtler groove than 1/16 swing.

## Future Extensions

- Per-track swing amount (independent groove per track)
- Euclidean rhythm generator that respects track scale
- Scale as a P-Lock target (per-step scale changes for glitch effects)
- Polymetric mode: tracks don't reset on cycle, free-running until manually reset
