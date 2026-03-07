# ADR 011: Synth Engine Architecture — Wavetable + Modulation Matrix

## Status: Proposed (revised)

## Context

The current melodic voices (AnalogSynth, FMSynth) are monophonic single-oscillator designs. They sound good for leads and bass but lack the depth needed for pads, chords, and modern production textures. To reach production-quality sound design (Serum / Pigments level) in the browser, we need:

1. **Wavetable oscillators** — richer timbres than basic waveforms
2. **Modulation matrix** — flexible routing (LFO/Env → any param)
3. **Polyphony** — chords and pads
4. **Per-voice effects** — filter types, distortion, chorus

### Current Melodic Voices (C++ WASM)

| Voice | Architecture | Limitations |
|-------|-------------|-------------|
| AnalogSynth | Saw → tanh → 1-pole LP → ADSR | Mono, single osc, fixed waveform |
| FMSynth | 2-op FM (carrier + modulator) | Mono, fixed algorithm, 2-op only |

### Current Infrastructure

- `SynthBase` abstract class: `noteOn()`, `tick()`, `reset()`
- `ADSR` envelope, `OnePole` filter, `fastTanh`/`fastExp` helpers
- All DSP runs in C++ WASM AudioWorklet at sample rate
- JS-side `voices.ts` mirrors C++ voices (used for non-WASM fallback)

## Proposed Design

### A. Wavetable Oscillator

Core building block replacing simple waveform generators.

```cpp
class WavetableOsc {
    // Table: 2048 samples × N frames (e.g., 256 frames per table)
    // Frame morphing: linear interpolation between adjacent frames
    // Position parameter (0.0–1.0) selects morph position
    float* _table;       // interleaved frames
    int    _frameSize;   // 2048
    int    _numFrames;   // 1–256
    float  _position;    // 0.0–1.0, modulatable
    float  _phase;

    float tick(float freq, float sr);  // cubic interpolation + frame lerp
};
```

**Built-in wavetables** (generated at startup, no file loading needed):
- Basic: Sine, Triangle, Saw, Square, PWM
- Spectral: Additive harmonic series (1–64 partials, variable rolloff)
- Digital: Formant vowels (A/E/I/O/U), Sync sweep, Hard sync
- Noise: Spectral noise bands

**Future**: User wavetable import (WAV → table extraction).

### B. Modulation Matrix

Flexible source → destination routing, evaluated per sample.

```cpp
struct ModSlot {
    ModSource source;   // LFO1, LFO2, Env1, Env2, Velocity, Note, Random
    ModDest   dest;     // Pitch, WTPos, Cutoff, Resonance, Volume, Pan, FMIndex, ...
    float     amount;   // -1.0 to 1.0 (bipolar)
};

class ModMatrix {
    static constexpr int MAX_SLOTS = 8;
    ModSlot _slots[MAX_SLOTS];

    // Per-sample: compute all source values, apply to dest params
    void process(float* params, const ModSources& sources);
};
```

**Mod Sources:**
| Source | Type | Notes |
|--------|------|-------|
| LFO 1/2 | Free-running or tempo-synced | Sine, Tri, Saw, Square, S&H |
| Env 1 (Amp) | ADSR | Always routed to amplitude |
| Env 2 (Mod) | ADSR | Free assignment |
| Velocity | Per-note | 0.0–1.0 |
| Note | Per-note | Normalized MIDI note |
| Random | Per-note | New random value each trigger |

**Mod Destinations:**
Pitch, WT Position, Filter Cutoff, Filter Resonance, FM Index, FM Ratio, Volume, Pan, LFO Rate, Env Mod Depth

### C. Voice Architecture

Single unified synth engine that subsumes current AnalogSynth and FMSynth:

```
┌─────────────────────────────────────────────────────┐
│  InboilSynth (per voice)                            │
│                                                     │
│  ┌──────────┐   ┌──────────┐                       │
│  │  OSC A   │   │  OSC B   │   Wavetable or        │
│  │ (WT/Ana) │   │ (WT/Ana) │   classic waveform    │
│  └────┬─────┘   └────┬─────┘                       │
│       │    mix/FM/RM  │                             │
│       └──────┬────────┘                             │
│              │                                      │
│       ┌──────▼──────┐                               │
│       │   FILTER    │   LP/HP/BP/Notch, 2/4-pole   │
│       │  (SVF)      │   Cutoff + Reso modulatable  │
│       └──────┬──────┘                               │
│              │                                      │
│       ┌──────▼──────┐                               │
│       │    AMP      │   Env1 (ADSR) + velocity      │
│       └──────┬──────┘                               │
│              │                                      │
│  ┌───────────▼───────────┐                          │
│  │   MOD MATRIX (8 slots)│                          │
│  │   LFO1, LFO2, Env2   │                          │
│  └───────────────────────┘                          │
└─────────────────────────────────────────────────────┘
```

**Osc Combine Modes:**
- Mix (crossfade A/B)
- FM (A modulated by B)
- Ring Mod (A × B)
- Unison (A+B detuned, stereo spread)

### D. Polyphony

Voice allocator wrapping InboilSynth:

```cpp
class PolySynth {
    static constexpr int MAX_VOICES = 4;  // CPU budget
    InboilSynth _voices[MAX_VOICES];
    int _nextVoice = 0;  // round-robin allocation

    void noteOn(uint8_t note, float vel);  // allocate voice
    void tick(float& outL, float& outR);   // sum all active voices
};
```

- **4 voices max** — AudioWorklet CPU budget constraint
- **Voice stealing:** oldest-note priority
- **Mono mode:** single voice with legato/portamento option

### E. Filter Upgrade

Replace `OnePole` (6dB/oct) with State Variable Filter (SVF):

```cpp
struct SVFilter {
    float cutoff, reso;
    enum Mode { LP, HP, BP, Notch } mode;

    // 2-pole (12dB/oct) or cascaded 4-pole (24dB/oct)
    float process(float in);
};
```

### F. Backward Compatibility

Existing voice types map to InboilSynth presets:

| Current Voice | InboilSynth Config |
|---------------|-------------------|
| AnalogSynth | OscA=Saw (classic), Filter=LP 1-pole, no mod matrix |
| FMSynth | OscA=Sine, OscB=Sine, Combine=FM, ratio+index params |

Factory presets recreate all current sounds, so no existing patterns break.

### G. Parameter Count & UI

InboilSynth exposes many parameters. UI strategy:

| Layer | What | Where |
|-------|------|-------|
| Macro | 4–6 macro knobs (mapped via mod matrix) | Track knob row (existing) |
| Detail | Full parameter page | Overlay sheet (ADR 054) |
| Presets | Named presets per synth config | ADR 015 |

Macro knobs (e.g., "Brightness", "Movement", "Body", "Space") abstract complexity for quick tweaking. Power users access the full detail page.

### H. Implementation Strategy — JS First, WASM Later

**Start in JS (AudioWorkletProcessor)**, migrate hot paths to C++ WASM only if profiling shows need.

| Phase | Runtime | Rationale |
|-------|---------|-----------|
| Phase 1 | JS (AudioWorklet) | Fast iteration, zero build overhead, easy debugging |
| Phase 2 | Profile | Measure CPU per voice with Chrome DevTools + `performance.now()` in process() |
| Phase 3 | Selective WASM | Move only bottlenecks (wavetable interpolation, SVF, mod matrix inner loop) |

**Why JS first:**
- Current voices already run fine in JS AudioWorklet
- Wavetable lookup + lerp is simple math — JS JIT handles it well for mono/low-poly
- WASM adds build complexity (Emscripten), increases bundle size, and complicates debugging
- Bundle size priority: keep WASM minimal, only pay for what's proven necessary

**WASM migration criteria** (move to C++ only when):
- CPU usage > 30% of AudioWorklet budget (128 samples @ 44.1kHz ≈ 2.9ms)
- Measured across 4-voice poly + mod matrix + SVF filter
- JS profiling shows specific hot functions, not general overhead

**C++ WASM scope if needed:**
- `SynthBase` infrastructure already exists in `src/dsp/synth/`
- Add `WavetableOsc`, `SVFilter`, `ModMatrix` as new C++ classes
- Keep JS versions as reference/fallback
- Estimated WASM addition: ~15–20KB gzipped (synth engine only, no wavetable data)

**Wavetable data budget:**
- Built-in tables generated at startup (math, not stored data) — zero bundle cost
- 8 basic tables × 256 frames × 2048 samples × 4 bytes = ~16MB if naive
- Optimization: generate on `AudioWorklet` init, keep only active tables in memory (~512KB typical)

## Implementation Order

1. **SVFilter** (JS) — replace OnePole, used by everything after
2. **WavetableOsc** (JS) — table generation + morphing oscillator
3. **InboilSynth** (JS) — unified voice (2 osc + filter + 2 env)
4. **CPU profiling** — measure budget with realistic patches
5. **ModMatrix** (JS) — source/dest routing, per-sample evaluation
6. **PolySynth** (JS) — voice allocator (4-voice)
7. **LFO** — tempo-synced + free-running, multiple shapes
8. **WASM migration** — if profiling shows need, move hot paths to C++
9. **Factory presets** — recreate current sounds + new patches
10. **Detail UI** — full parameter overlay sheet

Steps 1–3 can ship as a first release (already a big upgrade). Step 4 determines if WASM is needed. Steps 5–7 add the "Serum-like" modulation depth.

## Consequences

- **Positive:** Production-quality sound design in the browser — wavetable + mod matrix covers 80% of Serum/Pigments workflows
- **Positive:** Single engine replaces AnalogSynth + FMSynth — less code to maintain long-term
- **Positive:** Polyphony enables chord progressions — massive musical upgrade
- **Positive:** Mod matrix makes sounds evolve over time — pads, textures, movement
- **Positive:** JS-first approach keeps bundle small and iteration fast
- **Negative:** Wavetable + mod matrix per sample is CPU-heavy. Must profile before scaling up
- **Negative:** 4-voice poly × full synth engine may push AudioWorklet budget
- **Negative:** Large parameter space needs careful UI (macro knobs + detail page)
- **Risk:** JS may not be fast enough for 4-voice poly + full mod matrix — WASM fallback path exists
- **Risk:** Wavetable memory (~512KB active) — generate on init, don't store in bundle
- **Dependency:** ADR 015 (Presets) — essential for managing complex patches
- **Dependency:** ADR 054 (Overlay Sheets) — detail parameter page UI
