# ADR 035: Master View — Overlay Sheet

## Status: Implemented

## Context

Master bus controls are scattered across small knobs in PerfBar (DUC, CMP, GAIN, SWG).
Several DSP parameters remain hardcoded and unexposed (comp threshold/ratio, ducker release, FX return levels).
There is no output level meter.

### Current Signal Chain

```
Voices ──┬── dry (kick bypass for sidechain)
         ├── reverbSend  ──► Reverb  ──┐
         ├── delaySend   ──► Delay   ──┤
         ├── glitchSend  ──► Glitch  ──┼─► sum
         └── granularSend ► Granular──┘
                                       ▼
               SidechainDucker (kick triggers)
                       ▼
               BusCompressor
                       ▼
               3-band Parametric EQ
                       ▼
               DJ Filter (LP↔HP sweep)
                       ▼
               Break Gate
                       ▼
               Master Gain × 0.8
                       ▼
               Peak Limiter ──► output
```

### Currently Exposed (PerfBar knobs)

| Param | State | UI |
|-------|-------|----|
| Master Gain | `perf.masterGain` | GAIN knob |
| Ducker Depth | `effects.ducker.depth` | DUC knob |
| Comp Makeup | `effects.comp.makeup` | CMP knob |
| Swing | `perf.swing` | SWG knob |

### Hardcoded / Hidden

| Param | Default | Source |
|-------|---------|--------|
| Comp Threshold | 0.30 | `effects.comp.threshold` (state exists, no UI) |
| Comp Ratio | 6 | `effects.comp.ratio` (state exists, no UI) |
| Ducker Release | 120ms | `effects.ducker.release` (state exists, no UI) |
| Post-gain scalar | ×0.8 | `worklet-processor.ts` |
| Reverb/Delay return level | fixed 1.0 | `worklet-processor.ts` mix sum |

## Decision

### 1. Overlay Sheet (ADR 054 pattern)

Master view opens as an overlay sheet over SceneView, same as FX and EQ.
Triggered by a `MST` button in PerfBar (next to existing FX / EQ buttons).

```typescript
// PerfBar toggle
ui.phraseView = ui.phraseView === 'master' ? 'pattern' : 'master'
```

### 2. Layout: XY Pads + Knobs

```
┌──────────────────────────────────────────────────┐
│  [VU L ████████████░░░░]  [VU R ████████░░░░░░]  │  ← peak meter (Phase 3)
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌─ COMP ─────────────┐  ┌─ DUCK ─────────────┐ │
│  │                     │  │                    │ │
│  │         ●           │  │        ●           │ │  ← XY pads
│  │                     │  │                    │ │
│  │  X: THR   Y: RAT   │  │ X: DEPTH  Y: REL  │ │
│  └─────────────────────┘  └────────────────────┘ │
│                                                  │
│  ┌─ RETURN ────────────┐                         │
│  │                     │  GAIN [◉]  MKP [◉]     │  ← knobs
│  │    ●                │  SWG  [◉]              │
│  │                     │                         │
│  │  X: VERB   Y: DLY  │                         │
│  └─────────────────────┘                         │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 3. XY Pad Mappings

| Pad | X axis | Y axis | Feel |
|-----|--------|--------|------|
| COMP | Threshold (0.1–1.0) aggressive→gentle | Ratio (1–20) soft→hard | Top-left = heavy crush, bottom-right = natural |
| DUCK | Depth (0–1.0) shallow→deep | Release (20–500ms) tight→loose | Top-right = strong pumping, bottom-left = transparent |
| RETURN | Verb return (0–2.0) dry→wet | Delay return (0–2.0) dry→wet | Top-right = spacious |

Each pad reuses the same drag interaction pattern as FxPad/FilterView (pointer capture, `toNorm()`, tap-to-toggle).

### 4. New State

```typescript
// Add to fxPad state (or new masterPad state):
master: {
  comp:   { on: true, x: 0.22, y: 0.30 }   // x=threshold, y=ratio (normalized)
  duck:   { on: true, x: 0.85, y: 0.45 }   // x=depth, y=release (normalized)
  ret:    { on: true, x: 0.50, y: 0.50 }   // x=verbReturn, y=dlyReturn (normalized)
}
```

XY values are normalized 0–1. Denormalize in engine sync:
- Comp threshold: `0.1 + x * 0.9` (0.1–1.0)
- Comp ratio: `1 + y * 19` (1–20)
- Duck depth: `x` (0–1.0, already normalized)
- Duck release: `20 + y * 480` (20–500ms)
- Verb return: `x * 2.0` (0–2.0)
- Delay return: `y * 2.0` (0–2.0)

### 5. Worklet Changes

Add `verbReturn` / `dlyReturn` fields to the effects command. Apply in mix sum:

```typescript
const mixL = kickDry + (restL + rev[0] * verbReturn + del[0] * dlyReturn + grn[0] + gltL) * duck
```

Other params (comp threshold/ratio, ducker depth/release) already flow to the worklet via existing `syncEffects`.

### 6. PerfBar Changes

- Add `MST` toggle button next to FX / EQ
- Existing DUC / CMP / GAIN / SWG knobs remain (quick access)
- Knobs stay bidirectionally synced with Master sheet XY pads

### 7. VU Meter (Phase 3)

Worklet sends peak L/R via `postMessage` at ~60fps:

```typescript
port.postMessage({ type: 'levels', peakL, peakR })
```

Render as CSS `width` bars with peak hold (1s decay) + clip indicator.

## Changes

### New: MasterView.svelte
- XY pad component (3 pads: COMP, DUCK, RETURN)
- Knob row (GAIN, MKP, SWG)
- Same overlay sheet styling as FxPad/FilterView

### PerfBar.svelte
- Add MST toggle button

### App.svelte
- Add `ui.phraseView === 'master'` branch in overlay sheet conditional

### state.svelte.ts
- Add master pad state (comp/duck/return XY nodes)
- Add `verbReturn` / `dlyReturn` to effects

### constants.ts
- Add default master pad values

### engine.ts
- Sync master pad XY → effects params (denormalize)
- Sync verbReturn/dlyReturn

### worklet-processor.ts
- Add `verbReturn` / `dlyReturn` fields, apply in mix sum

## Phases

1. **Phase 1**: MasterView overlay sheet + COMP/DUCK XY pads + GAIN/MKP/SWG knobs. Wire to existing effects state.
2. **Phase 2**: RETURN pad + worklet-side return level scalers.
3. **Phase 3**: VU meter (worklet → main thread peak messaging).

## Mobile

- MasterView stacks pads vertically (COMP → DUCK → RETURN), each full-width
- Knob row below pads, horizontal
- Accessed via same sheet mechanism as FX/EQ
