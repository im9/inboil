# ADR 113: WT Synth Evolution — Expanded Wavetables and Modulation

## Status: Proposed

## Context

The current WT synth (ADR 011, 063) has a solid architecture: 2 oscillators with MIX/FM/Ring combine, SVF filter (LP/HP/BP/Notch), unison (up to 7 voices), 2 ADSR envelopes, 2 LFOs, and an 8-slot mod matrix. However, the sonic palette is limited by:

1. **Only 5 wavetable shapes** (Saw, Square, Triangle, Sine, Pulse) — all generated from additive synthesis. Real wavetable synths offer 50–200+ shapes including vocal formants, spectral sweeps, and exotic digital textures.
2. **No filter variety** — SVF with 4 modes is functional but generic. Hardware synths like Waldorf Protein offer comb, formant, and parallel filter topologies for more character.
3. **Limited mod sources** — 5 sources (LFO1, LFO2, Env2, Velocity, Note). Missing: aftertouch/expression, audio-rate osc mod, random/chaos.
4. **No wavetable import** — Users can't load custom wavetables.

Waldorf Protein is the primary design reference: dual wavetable oscillators, multiple filter algorithms (comb, formant, SVF), deep modulation matrix, and a particle oscillator. Protein's philosophy — maximum character from limited resources, filter and mod depth over raw wavetable count — aligns well with the browser runtime constraints. The existing WT synth is already structurally close; the gaps are in filter variety and mod depth.

### Current architecture (melodic.ts)

| Component | Implementation | Limitation |
|-----------|---------------|------------|
| Oscillators | `WavetableOsc`: 2048-sample tables, 5 shapes (additive), position morphing | 5 shapes only |
| Filter | `SVFilter`: LP/HP/BP/Notch, cutoff + resonance | No comb/formant/parallel |
| Combine | MIX / FM / Ring between oscA and oscB | Good as-is |
| Envelopes | 2× `ADSR` (amp + mod) | Sufficient |
| LFOs | 2× LFO with 5 shapes, tempo sync | Good as-is |
| Mod matrix | 8 slots, 5 sources → 6 destinations | Limited sources and destinations |
| Unison | 1/3/5/7 voices, detune + stereo spread | Good as-is |
| Poly | 16 cores, MONO/POLY16/WIDE8/UNISON | Good as-is |

## Decision

### A. Expanded wavetable library

Add new wavetable shapes generated from additive synthesis and mathematical functions. No sample import needed — all shapes are computed at init time and cached per sample rate.

```typescript
const enum WTShape {
  // Existing (0–4)
  Saw, Square, Triangle, Sine, Pulse,
  // New: Digital / Spectral (5–9)
  SuperSaw,     // multiple detuned saws summed
  PWM50,        // 50% pulse width
  Formant1,     // vocal "A" formant (3 resonant peaks)
  Formant2,     // vocal "O" formant
  Spectral,     // odd harmonics with spectral tilt
  // New: Harsh / Aggressive (10–14)
  Bitcrush,     // quantized sine (step function)
  Metallic,     // inharmonic partials (bell-like)
  Distorted,    // saturated sine (tanh waveshaping)
  Noise,        // band-limited noise (random harmonics)
  Feedback,     // simulated FM feedback (sine + self-mod)
}
```

SHAPE_COUNT increases from 5 to 15. The `position` knob (0.0–1.0) morphs across all 15 in sequence. Each shape is still a single 2048-sample cycle, band-limited per sample rate.

### B. New filter algorithms

Add `CombFilter` and `FormantFilter` alongside the existing SVF:

```typescript
const enum FilterType {
  SVF,      // existing: LP/HP/BP/Notch
  Comb,     // feedforward + feedback comb (flanging, karplus-strong textures)
  Formant,  // 3 parallel bandpass (vowel A/E/I/O/U morph via cutoff)
}
```

The `filterType` param selects which filter topology is used. SVF remains default. `cutoff` and `resonance` map to different physical parameters per type:
- **Comb**: cutoff → delay time (pitch), resonance → feedback amount
- **Formant**: cutoff → vowel morph (A→E→I→O→U), resonance → bandwidth

### C. Expanded mod matrix

**New sources:**
```typescript
const enum ModSrc {
  LFO1, LFO2, Env2, Velocity, Note,
  // New
  Random,     // sample & hold random per note
  ModWheel,   // MIDI CC1 / expression
  Env1,       // amp envelope as mod source
}
```

**New destinations:**
```typescript
const enum ModDst {
  Pitch, WTPos, Cutoff, Resonance, FMIndex, Volume,
  // New
  FilterType,  // morph between filter algorithms
  PanSpread,   // stereo width modulation
  UniDetune,   // unison detune depth
  Drive,       // distortion amount
}
```

Slot count stays at 8 — enough for complex patches without overwhelming the UI.

### D. Drive / waveshaping section

Add a post-filter drive stage with selectable shapes:

```typescript
const enum DriveType { Off, Soft, Hard, Fold, Bitcrush }
```

This is separate from the existing `drive` param (which is currently a simple tanh). Adding wavefold and bitcrush opens up aggressive bass and lead sounds (wobble bass territory).

### E. Implementation phases

**Phase 1: Wavetable expansion**
- Add 10 new `WTShape` entries with additive/mathematical generation
- Update `generateTable()` and cache
- Update `SHAPE_COUNT`, paramDefs range for `posA`/`posB`
- UI: position knob now sweeps across 15 shapes

**Phase 2: Filter algorithms**
- `CombFilter` class (delay line + feedback)
- `FormantFilter` class (3 parallel BPFs with vowel presets)
- `filterType` param in WTCore, paramDefs
- Existing patches unaffected (default = SVF)

**Phase 3: Mod matrix + drive**
- New mod sources (Random, ModWheel, Env1)
- New mod destinations (FilterType, PanSpread, UniDetune, Drive)
- Drive type selector
- Factory presets showcasing new capabilities

### F. Factory preset additions

New preset categories leveraging expanded features:

| Category | Presets | Key features used |
|----------|---------|-------------------|
| Wobble Bass | 4–6 | LFO → Cutoff + WTPos, aggressive drive, comb filter |
| Formant | 3–4 | Formant filter, vocal wavetables, mod env → vowel |
| Digital | 4–6 | Bitcrush/metallic shapes, hard drive, noise osc |
| Ambient | 3–4 | Slow LFO → position, long release, comb filter |

## Considerations

- **CPU**: New wavetable shapes are precomputed — zero runtime cost. Comb filter adds one delay line read/write per sample. Formant filter adds 3 BPF ticks. Both are lightweight compared to the existing unison processing (7 osc pairs).
- **Bundle size**: All shapes are generated mathematically, no audio data to bundle. Filter classes add ~200 lines of DSP code.
- **Backward compatibility**: All new params are optional with defaults matching current behavior. Existing presets play identically.
- **Wavetable import (deferred)**: User-loadable .wav wavetables would be powerful but requires a file format parser and UI. Not in scope — mathematical generation covers the 80% use case.
- **Protein parity**: This gets us roughly 70% of Protein's feature depth. Missing: particle oscillator (granular), per-osc filter, audio-rate modulation. These are future extensions.

## Future Extensions

- User wavetable import (.wav single-cycle loader)
- Particle oscillator mode (granular cloud from wavetable)
- Per-oscillator filter (pre-combine filtering)
- Audio-rate FM mod source (oscB → mod matrix)
- Wavetable editor (draw/morph custom shapes in browser)
- More filter types: phaser, vocal resonator, analog-modeled ladder
