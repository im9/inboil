# ADR 011: Full Synth Engine Implementations

## Status: Proposed

## Context

The current melodic voices (TB303Voice, AnalogVoice, MoogVoice, FMVoice) are monophonic single-oscillator designs. They sound good for leads and bass but lack the depth needed for pads, chords, and modern production textures. `ChordSynth` is declared in `SynthType` but unimplemented.

### Current Melodic Voices

| Voice | Architecture | Limitations |
|-------|-------------|-------------|
| TB303Voice | Saw → resonant LP → drive | Mono, no waveform choice, fixed character |
| AnalogVoice | Saw → LP → drive | Mono, single oscillator, basic envelope |
| MoogVoice | 2 detuned saws → 2× LP | Mono, dual-osc but fixed detune |
| FMVoice | 3-op FM + feedback | Mono, fixed algorithm |

### Goals

- **AnalogSynth v2**: Multi-oscillator subtractive with waveform selection, unison, PWM
- **PolySynth**: 4–6 voice polyphony for chords and pads
- **FM Synth v2**: Full 4-operator FM with algorithm selection (DX7-lite)
- **ChordSynth**: Stacked chord voicing from a single trig (detect/quantize to chord)

## Proposed Design

### A. AnalogSynth v2

Upgrade AnalogVoice to a full subtractive synth:

- **2 oscillators** with selectable waveform (saw, square, triangle, pulse)
- **PWM** on pulse waveform (LFO-modulated pulse width)
- **Unison** mode: 2–4 detuned copies with stereo spread
- **Multi-mode filter**: LP / HP / BP selectable, 2-pole or 4-pole
- **2 envelopes**: amp ADSR + filter ADSR (independent)
- **LFO** → pitch / filter / amplitude (selectable destination)

Params: `osc1Wave`, `osc2Wave`, `osc2Semi`, `osc2Detune`, `filterType`, `cutoff`, `resonance`, `envMod`, `attack`, `decay`, `sustain`, `release`, `lfoRate`, `lfoDepth`, `lfoTarget`

### B. PolySynth

A voice allocator wrapping AnalogSynth v2:

- **4–6 voice polyphony** with voice stealing (oldest-note priority)
- Each voice is an independent AnalogSynth v2 instance
- **Voice allocator** in the sequencer: when a step triggers, assign to next free voice
- Monophonic vs polyphonic mode toggle
- **Unison mode**: all voices play same note with detune + spread

Implementation approach:
- `PolyVoice` class holds N sub-voices
- `noteOn()` allocates a sub-voice, `tick()` sums all active sub-voices
- Voice count limited to 4 for CPU budget in AudioWorklet

### C. FM Synth v2

Upgrade FMVoice to 4-operator with algorithms:

- **4 operators** (each: sine oscillator + ADSR envelope + level)
- **8 algorithms** (preset operator routing topologies, DX7-subset)
- **Operator ratios**: coarse (1–16) + fine (0.0–1.0)
- **Feedback** on any single operator
- Per-operator envelope: rate-based (DX7-style) or ADSR

Params: `algorithm`, `op1Ratio`, `op1Level`, `op2Ratio`, `op2Level`, `op3Ratio`, `op3Level`, `op4Ratio`, `op4Level`, `fbOp`, `fbAmt`, `decay`

### D. ChordSynth

Chord voicing from single trigs:

- Input: single MIDI note from trig
- **Chord mode**: selects interval stack (minor, major, 7th, sus2, sus4, power)
- Internally triggers 3–4 notes (root + intervals) using PolySynth engine
- **Strum** parameter: slight time offset between chord notes (0–30ms)
- **Spread**: detune between chord voices

Params: `chordType`, `strum`, `spread`, `cutoff`, `decay`

## Implementation Order

1. AnalogSynth v2 (foundation for PolySynth)
2. PolySynth (wraps AnalogSynth v2)
3. FM Synth v2 (independent, can be parallel)
4. ChordSynth (uses PolySynth internally)

## Consequences

- **Positive:** Production-quality sound design capability; covers pads, leads, bass, chords.
- **Positive:** PolySynth enables chord progressions — massive musical upgrade.
- **Negative:** Poly voices multiply CPU cost ×4–6. Must profile AudioWorklet budget.
- **Negative:** Many parameters per synth — needs thoughtful UI (macro knobs + detail page).
- **Risk:** 4-op FM parameter space is vast. Preset system would help discoverability.
- **Dependency:** Requires ADR 009 (instrument selection) for assigning synth types to tracks.
