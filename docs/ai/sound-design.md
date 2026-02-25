# Sound Design

## Overview

8 tracks, each permanently assigned a synth type.
All synthesis is implemented in C++ and compiled to WASM.
No external audio sample libraries are bundled in v1 (except the Sampler track which loads user files).

## Track Assignment — PROPOSED

| Track | Name | Synth Type | Primary Use |
|---|---|---|---|
| 1 | Kick | `DrumSynth` | Bass drum (sine + pitch EG) |
| 2 | Snare | `DrumSynth` | Snare / clap (tone + noise mix) |
| 3 | Hats | `NoiseSynth` | Hi-hat, cymbal (bandpass-filtered noise) |
| 4 | Bass | `AnalogSynth` | Bass lines (VCO→VCF→VCA) |
| 5 | Lead | `AnalogSynth` | Lead / arp (same engine as Bass) |
| 6 | FM | `FMSynth` | Metallic / bell / digital tones |
| 7 | Sampler | `Sampler` | User WAV playback, pitch-shifted |
| 8 | Chord | `ChordSynth` | Polyphonic chord pads |

> Track assignment is PROPOSED. Confirm before treating as DECIDED.

## Synth Types

### DrumSynth
Additive model: sine oscillator for the body, white noise for the transient.

Parameters:
- `pitch` — base frequency (Hz)
- `pitchDecay` — pitch envelope time (ms)
- `tone` — noise/sine mix (0.0 = pure sine, 1.0 = pure noise)
- `decay` — amplitude decay (ms)
- `drive` — soft-clip saturation (0.0–1.0)

### NoiseSynth
White noise through a bandpass filter with AR envelope.

Parameters:
- `frequency` — bandpass center frequency (Hz)
- `resonance` — filter Q (0.1–20)
- `attack` — envelope attack (ms)
- `decay` — envelope decay (ms)
- `open` — boolean; if true, gate-length controls decay (open hi-hat behavior)

### AnalogSynth
Subtractive synthesis: VCO → VCF → VCA, Moog-style ladder filter model.

Parameters:
- `waveform` — `saw` | `square` | `triangle`
- `detune` — oscillator detune (cents, ±50)
- `filterCutoff` — Hz (20–20000)
- `filterResonance` — 0.0–1.0
- `filterEnvAmount` — how much the filter EG modulates cutoff (±1.0)
- `attack` / `decay` / `sustain` / `release` — amplitude ADSR (ms / level)
- `filterAttack` / `filterDecay` — filter EG times (ms)

### FMSynth
2-operator FM synthesis (carrier + modulator).

Parameters:
- `ratio` — modulator-to-carrier frequency ratio (0.5–16.0)
- `index` — modulation index / depth (0.0–10.0)
- `attack` / `decay` / `sustain` / `release` — amplitude ADSR
- `indexDecay` — modulation index decay (FM brightness over time)

### Sampler
Plays back a loaded WAV file at variable pitch.

Parameters:
- `sample` — loaded buffer reference
- `start` — playback start point (0.0–1.0 of sample length)
- `end` — playback end point (0.0–1.0)
- `loop` — boolean
- `speed` — playback speed / pitch multiplier (0.25–4.0)

### ChordSynth
Polyphonic pad: plays a chord voicing relative to the trig's root note.
Internally uses the AnalogSynth engine with fixed soft attack.

Parameters:
- `voicing` — chord type: `major` | `minor` | `dom7` | `maj7` | `sus2` | `sus4`
- `spread` — octave spread of voicing (1–3)
- All AnalogSynth parameters apply to each voice.

## Global Effects Chain — PROPOSED

Runs after the voice mixer, applied to the master output.

| Effect | Parameters | Status |
|---|---|---|
| Delay | time (ms, tempo-syncable), feedback (0–1), wet (0–1), pingPong (bool) | PROPOSED |
| Reverb | roomSize (0–1), damping (0–1), wet (0–1) | PROPOSED |
| Compressor | threshold (dB), ratio, attack (ms), release (ms) | PROPOSED |
| BitCrusher | bitDepth (4–24), sampleRateReduction (1–32) | PROPOSED |

> Effects are per-pattern send levels — each track has a send amount per effect. OPEN: per-track insert effects are not planned for v1.

## Per-Track Mixer

Each track feeds into a simple mixer before the global effects:
- `volume` 0.0–1.0
- `pan` -1.0–1.0
- `send_delay` 0.0–1.0
- `send_reverb` 0.0–1.0
