# ADR 121: FX Hold Unification

## Status: Proposed

## Context

Two FX "hold" operations exist with inconsistent interaction models:

### Reverb Hold (not yet implemented)
- Holds reverb tail indefinitely (feedback = 1.0, input gated)
- Strymon BigSky-style — a performance toggle, not a sound flavour
- Attempted in ADR 120 session as "freeze" but rolled back due to gain staging issues
- Terminology settled on "hold" (not "freeze") — BigSky precedent

### Granular Freeze (currently a flavour)
- `FX_FLAVOURS.granular` includes `'freeze'` alongside `'cloud'` and `'stretch'` (`constants.ts:92`)
- When selected, auto-engages freeze when granular pad is ON (`engine.ts:381-382`)
- Mutable Instruments Clouds — the reference hardware — uses a **dedicated button**, not a mode/flavour toggle
- `perf.granularFreeze` already exists as a separate boolean (`constants.ts:149`), toggled by long-press on FxPad (`FxPad.svelte:81`)

### The problem

1. **Granular freeze is not a flavour** — it doesn't change the sound character (like cloud vs stretch), it holds the buffer. Clouds treats it as an independent control.
2. **Reverb hold is not a flavour** — it doesn't change the reverb algorithm, it sustains the current tail.
3. **Both are the same class of operation**: "stop input, loop current buffer indefinitely." They should share a consistent UI pattern.

### Current code paths

| | Granular Freeze | Reverb Hold |
|---|---|---|
| State | `perf.granularFreeze` | not implemented |
| DSP | `GranularProcessor.setFreeze()` — stops write pointer | `SimpleReverb/ModulatedReverb` — needs feedback=1.0, damp=0 |
| UI trigger | FxPad long-press (mode2 tap) OR flavour='freeze' auto-engage | — |
| Flavour slot | Yes (`FX_FLAVOURS.granular[1]`) | No |

## Decision

### 1. Remove granular freeze from flavours

Remove `{ id: 'freeze', ... }` from `FX_FLAVOURS.granular`. Granular flavours become just `cloud` and `stretch` (sound character variants).

### 2. Unified hold toggle per FX bus

Each FX bus that supports hold gets a HOLD toggle in DockPanel, using the same UI pattern (`.mode-row` + `.mode-switch`, matching P-LOCK):

```
┌─────────────────────────────────────┐
│ VERB  [active]        ROOM HALL SHIM│
│  ◯ SIZE   ◯ DAMP                    │
│  HOLD ─────────────────────── (○)   │
├─────────────────────────────────────┤
│ GRN                   CLOUD  STRCH  │
│  ◯ SIZE   ◯ DENS                    │
│  HOLD ─────────────────────── (○)   │
└─────────────────────────────────────┘
```

- Only shown for FX types that support hold (VERB, GRN)
- Toggle controls `perf.reverbHold` / `perf.granularHold` (rename from `granularFreeze`)
- P-LOCK style slide toggle — consistent with existing DockPanel controls

### 3. FxPad long-press behavior change

Currently GRN long-press enters mode2 (pitch/scatter), and mode2 tap toggles freeze. With freeze removed from flavours:

- **GRN long-press (pad ON)**: still enters mode2 for pitch/scatter control
- **GRN mode2 tap (no drag)**: toggles `perf.granularHold` (renamed)
- **VERB long-press (pad ON)**: toggles `perf.reverbHold` (simpler than mode2 — just toggle on release)
- FxPad node shows "HOLD" label when hold is active (instead of "FRZ")

### 4. DSP changes for reverb hold

- `SimpleReverb.setFreeze(on)`: feedback → 1.0, damp → 0 (saves/restores previous values)
- `ModulatedReverb.setFreeze(on)`: same
- `ShimmerReverb.setFreeze(on)`: feedback → 0.35 (max safe), damp → minimum
- Worklet: gate reverb input to 0 during hold, boost output to compensate internal gain (0.015)
- Gain staging needs careful testing — ADR 120 session showed ×8 boost was attempted but caused issues

### 5. State naming

Rename for consistency:
- `perf.granularFreeze` → `perf.granularHold`
- Add `perf.reverbHold`
- Internal DSP method stays `setFreeze()` (implementation detail)

## Considerations

- **Migration**: `granularFreeze` → `granularHold` rename needs migration in `restoreSong`
- **Flavour slot removal**: Songs saved with `granular: 'freeze'` need fallback to `'cloud'`
- **Reverb hold gain staging**: SimpleReverb's internal gain (0.015) makes comb buffer contents very quiet. Hold output needs boosting but the right factor needs ear-testing (×3–×8 range attempted in ADR 120, needs more work)
- **Hold during playback only**: Hold captures whatever is in the buffer at that moment. If pressed during silence, nothing happens. This is expected behavior (same as Clouds).
- **Mobile**: HOLD toggle should also appear in mobile FX controls (MobileParamOverlay)

## Implementation Phases

### Phase 1: Granular hold rename + flavour removal
- Remove `'freeze'` from `FX_FLAVOURS.granular`
- Rename `granularFreeze` → `granularHold` across codebase
- Migration: map `granular: 'freeze'` → `'cloud'` in saved data
- FxPad: change "FRZ" label to "HOLD"

### Phase 2: DockPanel HOLD toggles
- Add `.mode-row` HOLD toggle to VERB and GRN bands in DockFxControls
- Wire `perf.granularHold` / `perf.reverbHold`

### Phase 3: Reverb hold DSP
- `setFreeze()` on SimpleReverb, ModulatedReverb, ShimmerReverb
- Input gating + output boost in worklet
- Ear-test gain staging carefully (one change at a time)

## Future Extensions

- **Delay hold**: Freeze delay buffer for infinite repeats (dub-style)
- **Momentary hold**: Hold only while button is pressed (vs toggle)
- **Hold + modulation**: Slowly modulate held buffer for evolving textures
