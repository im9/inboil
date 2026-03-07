# ADR 062 — Per-Pattern Voice Assignment

**Status**: Implemented
**Date**: 2026-03-07

## Context

Currently `voiceId` lives on `Track`, meaning every pattern shares the same instrument per track slot. Users want to assign different instruments per pattern (e.g., a kick on track 1 in pattern A, but a tom on track 1 in pattern B).

## Decision

Move `voiceId` from `Track` to `Cell`. Each cell (= one track × one pattern) carries its own voice assignment.

### Data Model Changes

```ts
// Cell gains voiceId
interface Cell {
  voiceId: VoiceId          // NEW — was on Track
  steps: number
  trigs: Trig[]
  voiceParams: Record<string, number>
  reverbSend: number
  delaySend: number
  glitchSend: number
  granularSend: number
}

// Track keeps voiceId as template default for new cells
interface Track {
  id: number
  name: string
  voiceId: VoiceId          // kept as default for new cells
  muted: boolean
  volume: number
  pan: number
}
```

### Key Changes

1. **factory.ts** — `makeEmptyCell` already receives `voiceId`; store it in the returned Cell.
2. **engine.ts** — `buildWorkletPattern` reads `cell.voiceId` instead of `track.voiceId`.
3. **worklet-processor.ts** — Voice re-instantiation already handles per-pattern voiceId changes (line 271–275). No structural change needed.
4. **state.svelte.ts** — `changeVoice()` updates `cell.voiceId` + `cell.voiceParams` for the active cell. Also updates `track.voiceId` to keep the template in sync.
5. **UI** — `StepGrid`, `DockPanel`, `PianoRoll`, `MobileParamOverlay` read voiceId from the active cell instead of the track.

### Migration

Existing songs saved without `cell.voiceId` fall back to `track.voiceId` during deserialization.

## Consequences

- Each pattern can use a different instrument per track slot.
- Track-level `voiceId` becomes a convenience default, not the source of truth.
- Slightly larger serialized song data (one extra string per cell).
