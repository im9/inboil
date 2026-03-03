# ADR 035: Master View

## Status: Proposed

## Context

Master bus controls are scattered across small knobs in PerfBar, making it hard to see the full picture. The DSP chain has parameters like Compressor threshold/ratio and Ducker release that are not exposed in the UI. There is also no output level meter.

### Current Signal Chain

```
Voices ──┬── dry (kick bypass for sidechain)
         ├── reverbSend ──► Reverb  ──┐
         ├── delaySend  ──► Delay   ──┤
         ├── glitchSend ──► Glitch  ──┼─► sum
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

| Param | Default | Location |
|-------|---------|----------|
| Comp Threshold | `0.30` | `worklet-processor.ts:153` |
| Comp Ratio | `6` | `worklet-processor.ts:154` |
| Ducker Release | `120ms` | `constants.ts:37` |
| Post-gain scalar | `× 0.8` | `worklet-processor.ts:531-532` |
| Limiter ceiling | hardcoded in PeakLimiter | `effects.ts` |
| Reverb/Delay return level | fixed at 1.0 | `worklet-processor.ts:505-506` |

## Decision

### 1. New View: `ui.view = 'master'`

Add MASTER as the 5th view tab (`grid | fx | eq | chain | master`).

### 2. UI Design: XY Pad + Knob Hybrid

Center the view around XY pads, similar to FxPad / FilterView, leveraging the interactive feel of a web app. Map related parameter pairs to X/Y axes so users can explore them intuitively via drag. Standalone single-value parameters use knobs.

### 3. Master View Layout

```
┌─────────────────────────────────────────────────┐
│  [VU L ████████████░░░░]  [VU R ██████████░░░]  │  ← always-on peak meter
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─ COMP ──────────────┐ ┌─ DUCK ────────────┐ │
│  │                     │ │                    │ │
│  │         ●           │ │        ●           │ │  ← XY pads
│  │                     │ │                    │ │    (reuse FxPad node)
│  │  X: THR   Y: RAT   │ │  X: DEPTH  Y: REL │ │
│  └─────────────────────┘ └────────────────────┘ │
│                                                 │
│  ┌─ RETURN ────────────┐                        │
│  │                     │                        │
│  │    ●                │  GAIN [◉]  MKP [◉]    │  ← XY + knob row
│  │                     │  SWG  [◉]             │
│  │  X: VERB   Y: DLY  │                        │
│  └─────────────────────┘                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 4. XY Pad Mappings

| Pad | X axis | Y axis | Feel |
|-----|--------|--------|------|
| **COMP** | Threshold (0.1–1.0) ← gentle … aggressive → | Ratio (1–20) ↑ hard … soft ↓ | Top-right = heavy crush, bottom-left = natural |
| **DUCK** | Depth (0–1.0) ← shallow … deep → | Release (20–500ms) ↑ tight … loose ↓ | Top-right = pumping, bottom-left = transparent |
| **RETURN** | Verb return (0–2.0) ← dry … wet → | Delay return (0–2.0) ↑ wet … dry ↓ | Top-right = spacious |

Each pad reuses the FxPad XY node component. Drag interaction, touch support, and visual feedback come for free from existing code.

### 5. New Parameters

| Section | Param | Range | Default | Notes |
|---------|-------|-------|---------|-------|
| **OUTPUT** | VU meter L/R | −∞…0 dBFS | — | worklet → main thread (message or SharedArrayBuffer) |
| **OUTPUT** | Gain | 0.0–1.0 | 0.8 | Move existing `perf.masterGain` |
| **COMP** | Threshold | 0.1–1.0 | 0.30 | Expose existing `effects.comp.threshold` |
| **COMP** | Ratio | 1–20 | 6 | Expose existing `effects.comp.ratio` |
| **COMP** | Makeup | 1.0–4.0 | 2.2 | Move existing CMP knob |
| **DUCKER** | Depth | 0.0–1.0 | 0.85 | Move existing DUC knob |
| **DUCKER** | Release | 20–500 ms | 120 | Expose existing `effects.ducker.release` |
| **FX RETURN** | Reverb return | 0.0–2.0 | 1.0 | New: reverb return level scaler |
| **FX RETURN** | Delay return | 0.0–2.0 | 1.0 | New: delay return level scaler |
| **SWING** | Swing | 0–100% | 0 | Move existing `perf.swing` |

### 6. VU Meter Implementation

Compute peak/RMS per sample in the worklet and send to the main thread periodically (~60fps):

```typescript
// worklet-processor.ts
port.postMessage({
  type: 'levels',
  peakL: this.peakL,
  peakR: this.peakR,
})
```

Main thread receives `peakL` / `peakR` and renders via CSS `width` or `<canvas>`. Includes peak hold (1s decay) + clip indicator.

### 7. PerfBar Changes

PerfBar knobs remain after adding Master view (quick access). They stay bidirectionally synced with Master view knobs. PerfBar can be simplified in the future.

### 8. Mobile

- MASTER view gets a dedicated screen (added to view-toggle tabs)
- XY pads stack vertically (COMP → DUCK → RETURN), each full-width
- Knob row sits below the pads in a horizontal layout
- VU meter is fixed at the top of the screen

## Considerations

### State Persistence (related issue)

Currently `perf` state (masterGain, swing) is lost on reload. `effects` (reverb, delay, ducker, comp) are also not tied to patterns. When implementing Master view:
- Option A: Save `effects` + `perf` per pattern
- Option B: Persist as global settings in localStorage
- Option C: Both (pattern save + global defaults)

### FX Return Level

Currently `rev[0]` / `del[0]` are added directly to the mix in the worklet (`worklet-processor.ts:505-506`). Adding return levels requires a scaler in the worklet:

```typescript
const mixL = kickDry + (restL + rev[0] * verbReturn + del[0] * dlyReturn + grn[0] + gltL) * duck
```

### Phased Implementation

1. **Phase 1**: Add view + COMP / DUCK XY pads (reuse FxPad component) + GAIN / MKP / SWG knobs
2. **Phase 2**: FX RETURN pad + worklet-side return level scalers
3. **Phase 3**: VU meter (worklet → main thread peak messaging)
4. **Phase 4**: Visual polish (GR meter, comp waveform on pad background, etc.)

## Future Extensions

- Spectrum analyzer / FFT display
- A/B comparison (bypass master chain)
- Preset system (save/load master chain settings)
- Tap tempo (place BPM control in master view as well)
