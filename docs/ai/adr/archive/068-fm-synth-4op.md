# ADR 068: 4-Operator FM Synth Engine

## Status: Implemented

## Context

The current `FMVoice` is a 2-operator (+ feedback) FM synth with only 5 parameters (ratio, feedback, op2Index, carrierIndex, decay). While functional for basic bell/pluck sounds, it lacks the depth needed for serious sound design:

- No algorithm selection — fixed modulator→carrier routing
- No per-operator envelope control
- No detune or multiple (fine frequency ratio)
- Only 4 presets (Bell, Pluck, Metallic, Soft)
- Cannot produce classic FM sounds: electric piano, brass, organ, bass, SFX

YM2612-inspired synths like MEGA FM demonstrate that 4-op FM with algorithm selection and rich presets can be both powerful and approachable. The goal is to bring that capability to inboil's FM voice while keeping the UI beginner-friendly through good presets.

## Proposal

### A. 4-Operator Architecture

Expand `FMVoice` from 2-op to 4-op. Each operator has:

| Parameter | Range | Description |
|-----------|-------|-------------|
| `ratio` | 0.5–16.0 | Frequency multiplier (coarse) |
| `detune` | -50–+50 cents | Fine pitch offset |
| `level` | 0.0–1.0 | Output level / modulation depth |
| `attack` | 0.001–2.0s | Envelope attack |
| `decay` | 0.01–4.0s | Envelope decay |
| `sustain` | 0.0–1.0 | Envelope sustain level |
| `release` | 0.01–4.0s | Envelope release |
| `feedback` | 0.0–1.0 | Self-modulation (typically OP1 only) |

### B. Algorithm Selection

8 algorithms inspired by YM2612, covering the essential routing topologies:

```
ALG 0:  [4]→[3]→[2]→[1]→out       (serial — harsh, metallic)
ALG 1:  [4]→[3]→[2]→out            (3-op serial + parallel carrier)
        [1]→out
ALG 2:  [4]→[3]→out                (paired modulators)
        [4]→[2]→[1]→out
ALG 3:  [4]→[3]→out                (dual pairs)
        [2]→[1]→out
ALG 4:  [3]→[2]→out                (2 mod + 2 carrier, classic EP)
        [4]→[1]→out
ALG 5:  [4]→[3]→out                (3 carriers, 1 modulator)
        [2]→out
        [1]→out
ALG 6:  [4]→[3]→out                (additive + 1 mod pair)
        [2]→out
        [1]→out (with feedback)
ALG 7:  [4]→out [3]→out            (full additive — organ-like)
        [2]→out [1]→out
```

Stored as normalized param `algorithm` (0–7), displayed as visual diagram in UI.

### C. Parameter Mapping

Total per-voice parameters: `algorithm` (1) + 4 operators × 8 params (32) = **33 parameters**.

To keep the knob UI manageable, expose a **flattened subset** in ParamPanel:

| Label | Key | Description |
|-------|-----|-------------|
| ALG | `algorithm` | Algorithm selector (0–7) |
| FB | `op1Fb` | OP1 feedback |
| R1–R4 | `op1Ratio`–`op4Ratio` | Operator ratios |
| L1–L4 | `op1Level`–`op4Level` | Operator levels |
| D1–D4 | `op1Decay`–`op4Decay` | Operator decay (most impactful envelope param) |
| ATK | `op1Attack` | Carrier attack (global shortcut) |
| REL | `op1Release` | Carrier release (global shortcut) |

Full per-operator ADSR editing via a detail panel (future, or long-press on knob).

### D. Presets

Expand from 4 to ~20 presets organized by category:

| Category | Presets |
|----------|---------|
| **Keys** | EP Piano, Clav, Harpsichord, Vibraphone |
| **Bass** | FM Bass, Slap Bass, Sub Bass, Acid FM |
| **Lead** | Brass, Flute, Whistle, Sync Lead |
| **Bell** | Bell, Tubular Bell, Glocken, Celesta |
| **Pad** | FM Pad, Glass Pad |
| **SFX** | Laser, Noise Hit |

Each preset stores all 33 parameters + a display name. Presets are the primary way beginners discover sounds — algorithm/operator details are for advanced users.

### E. C++ WASM Implementation

The DSP runs in `FMSynth.h` (WASM AudioWorklet). The TypeScript `FMVoice` mirrors it for the fallback path.

```cpp
struct Operator {
  float phase = 0;
  float ratio = 1.0f;
  float detune = 0.0f;  // cents
  float level = 1.0f;
  float feedback = 0.0f;
  float prevOut = 0.0f;  // for feedback
  ADSR env;
};

class FMSynth4 : public SynthBase {
  Operator ops[4];
  int algorithm = 0;
  // tick(): route operators per algorithm, sum carriers
};
```

## Phases

### Phase 1: Core 4-op Engine + Presets

- Implement `FMSynth4` in C++ (replace `FMSynth`)
- Mirror in TypeScript `FMVoice`
- Algorithm routing for all 8 algorithms
- Per-operator ratio, level, ADSR, feedback
- Detune per operator
- 15–20 factory presets
- Update `paramDefs.ts` with new param set
- Backward compat: map old 5-param presets to new format

### Phase 2: UI Polish

- Algorithm visualizer (SVG diagram showing op routing)
- Operator detail panel (full ADSR per op)
- Preset browser with category tabs

### F. Tempo-Sync LFO

Reuse the same LFO architecture as iDEATH (ADR 063):

| Parameter | Range | Description |
|-----------|-------|-------------|
| `lfoRate` | 0.1–20 Hz (free) or 1/1–1/32 (sync) | LFO speed |
| `lfoSync` | on/off | Tempo-sync toggle |
| `lfoWave` | sine, tri, saw, square, S&H | LFO shape |
| `lfoDest` | OP1–4 level, OP1–4 ratio, algorithm blend | Modulation target |
| `lfoDepth` | 0.0–1.0 | Modulation amount |

Key use cases:
- **Wobble bass**: LFO → carrier level at 1/8 sync
- **Vibrato**: LFO → all ratios at free ~5Hz
- **Rhythmic FM**: LFO → modulator level at 1/16 sync for trance plucks
- **Evolving pads**: Slow LFO → algorithm blend (crossfade between algorithms)

## Changed Files

| File | Changes |
|------|---------|
| `src/dsp/synth/FMSynth.h` | Replace 2-op with 4-op `FMSynth4` |
| `src/lib/audio/dsp/voices.ts` | Rewrite `FMVoice` as 4-op with algorithm routing |
| `src/lib/paramDefs.ts` | Expand FM params (5 → ~15 knob params) |
| `src/lib/presets.ts` | Expand FM presets (4 → ~20) |
| `src/lib/factory.ts` | Update default FM param values |

## Consequences

- **Positive**: Dramatic increase in FM sound design capability — EP, bass, brass, organ all possible
- **Positive**: Presets make 4-op FM approachable for beginners
- **Positive**: Closer to classic FM synths (DX7/YM2612) that users already understand
- **Negative**: 33 parameters per voice increases state complexity
- **Negative**: C++ and TypeScript implementations must stay in sync
- **Mitigation**: Flattened knob UI keeps the default experience simple; full params are opt-in
- **Mitigation**: Presets as primary discovery path — most users never touch operator-level params

## Open Questions

- Should detune be exposed in the default knob panel or hidden in detail view?
- Velocity → operator level scaling: global or per-operator?
- Should we support custom algorithm routing beyond the 8 presets (like DX7's 32)?
- ~~LFO modulation of FM index: reuse iDEATH mod matrix or add FM-specific LFO?~~ → Yes, add FM-specific LFO (see below)
