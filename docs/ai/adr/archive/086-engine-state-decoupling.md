# ADR 086: Decouple engine.ts from Reactive State

## Status: Implemented

## Context

`audio/engine.ts` directly imports reactive Svelte state (`ui`, `masterPad`, `masterLevels`, `fxFlavours`, `cellForTrack`) from `state.svelte.ts`. In turn, `state.svelte.ts` needs engine for sample loading, creating a **circular dependency** broken only by a dynamic `await import()`.

### Problems

1. **Circular dependency** — `engine.ts` statically imports from `state.svelte.ts`, which dynamically imports `engine.ts`. The dynamic import is a workaround, not a fix.
2. **Untestable** — engine cannot be unit-tested without the Svelte runtime and full state initialization.
3. **Implicit coupling** — Which reactive state affects audio is hidden inside engine internals. Callers of `sendPattern()` cannot predict or control what state engine reads.
4. **Timing ambiguity** — engine reads reactive proxies at call time; if state mutates between the caller's decision to send and engine's read, the snapshot may be inconsistent.
5. **Vite warning** — `engine.ts` is both dynamically and statically imported, preventing chunk splitting (harmless but noisy).

### Current Coupling Points

| Symbol | Direction | Usage in engine.ts |
|---|---|---|
| `ui.soloTracks` | read | `buildWorkletPattern()` — solo/mute logic |
| `masterPad` (.comp/.duck/.ret) | read | `buildWorkletPattern()` — master bus params |
| `fxFlavours` (.verb/.delay/.glitch/.granular) | read | `buildWorkletPattern()`, `granularFlavourParams()` — FX variant selection |
| `cellForTrack()` | call | `buildWorkletPattern()` — find cell by trackId |
| `masterLevels` | **write** | `init()` message handler — metering data from worklet |

All reads happen inside `buildWorkletPattern()`, called by `sendPattern()` / `sendPatternByIndex()`.

## Proposed Design

### Principle

**engine.ts receives all data via function arguments; it never imports reactive state.**

### A. Pass reads as parameters

Extend `sendPattern()` / `sendPatternByIndex()` signatures:

```typescript
interface EngineContext {
  fxFlavours: FxFlavours
  masterPad: { comp: PadState; duck: PadState; ret: PadState }
  soloTracks: Set<number>
}

// Before:
sendPatternByIndex(song, perf, fxPad, reset, patternIndex)

// After:
sendPatternByIndex(song, perf, fxPad, ctx, reset, patternIndex)
```

`cellForTrack()` is a pure function — move it to a shared utility (e.g. `lib/songUtils.ts`) imported by both engine and state without circularity.

### B. Inject metering callback

`masterLevels` is the only **write** from engine to state. Replace with a callback:

```typescript
interface EngineCallbacks {
  onLevels(peakL: number, peakR: number, gr: number, cpu: number): void
  onStep(playheads: number[]): void  // already exists as callback
}

engine.init(callbacks: EngineCallbacks)
```

### C. Remove all state.svelte.ts imports from engine.ts

After A + B, `engine.ts` imports only:
- `type Song, Pattern` — type-only (no runtime dependency)
- `worklet-processor.ts` types and URL
- `dsp/voices.ts` — `isSidechainSource()`

The circular dependency is fully eliminated. `state.svelte.ts` can then use a normal static import for engine.

### D. Update call sites

All callers already have access to the required state. The change is mechanical:

| Caller | Current args | Added |
|---|---|---|
| `App.svelte` ($effect) | `song, perf, fxPad` | `{ fxFlavours, masterPad, soloTracks: ui.soloTracks }` |
| `midi.ts` | `song, perf, fxPad` | same context object |
| `PatternToolbar.svelte` | `song, perf, fxPad` | same context object |

## Implementation Plan

1. **Extract `cellForTrack()`** into `lib/songUtils.ts` (or keep in `state.svelte.ts` but import in engine via the shared module)
2. **Add `EngineContext` interface** to engine.ts
3. **Add `onLevels` callback** to `engine.init()`
4. **Update `buildWorkletPattern()`** to use context params instead of direct state imports
5. **Remove `import { ui, masterPad, masterLevels, fxFlavours, cellForTrack } from '../state.svelte.ts'`** from engine.ts
6. **Update all call sites** (App.svelte, midi.ts, PatternToolbar.svelte) to pass context
7. **Convert `state.svelte.ts`** dynamic import to static import
8. **Remove "Module Dependency Notes" section** from architecture.md (no longer needed)
9. **Verify** build produces no circular dependency or dynamic/static import warnings

## Consequences

- **Positive:** Circular dependency eliminated — cleaner module graph
- **Positive:** engine.ts becomes testable in isolation (pure function of inputs)
- **Positive:** All state that affects audio is explicit at call sites — easier to reason about
- **Positive:** Vite dynamic/static import warning disappears
- **Positive:** Foundation for future engine extraction (desktop app, worker, etc.)
- **Negative:** `sendPattern` signature grows by one argument — minor API churn
- **Negative:** All call sites need updating — mechanical but touches multiple files
- **Risk:** Low — pure refactoring with no behavior change; existing tests cover persistence round-trip
