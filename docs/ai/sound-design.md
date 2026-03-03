# Sound Design

## Overview

8 tracks, each permanently assigned a voice type.
All synthesis is implemented in **TypeScript** and runs inside the AudioWorklet processor.
A parallel C++ DSP core exists in `src/dsp/` (compiled via Emscripten) but is not yet integrated.

## Track Assignment — DECIDED

| Track | Name | SynthType | Voice Class | Description |
|---|---|---|---|---|
| 0 | KICK | DrumSynth | KickVoice | TR-909 style bass drum |
| 1 | SNARE | DrumSynth | SnareVoice | TR-909 style snare |
| 2 | CLAP | DrumSynth | ClapVoice | TR-909 style hand clap |
| 3 | C.HH | NoiseSynth | HatVoice | TR-909 closed hi-hat |
| 4 | O.HH | NoiseSynth | OpenHatVoice | TR-909 open hi-hat |
| 5 | CYM | NoiseSynth | CymbalVoice | TR-909 crash cymbal |
| 6 | BASS | AnalogSynth | TB303Voice | TB-303 acid bass |
| 7 | LEAD | AnalogSynth | MoogVoice | Moog-style 4-pole lead |

## Synth Voices

### KickVoice (TR-909 style)

Based on 909 bridged-T oscillator circuit analysis.
Exponential pitch sweep (~340→55 Hz) + exponential amplitude decay + 2ms noise click transient.

Parameters (via `paramDefs.ts`):
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| pitchStart | PSTRT | 100–600 Hz | 340 | Initial pitch |
| pitchEnd | PEND | 30–120 Hz | 55 | Final pitch |
| pitchDecay | PDCY | 0.01–0.10 s | 0.035 | Pitch sweep time constant |
| ampDecay | DCY | 0.1–1.0 s | 0.35 | Amplitude decay time constant |
| drive | DRIV | 0.5–2.5 | 1.4 | Soft-clip saturation |

### SnareVoice (TR-909 style)

Separate tone/noise VCAs with exponential decay. Tone at ~185 Hz, noise through resonant LP filter.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| toneDecay | TDCY | 0.03–0.3 s | 0.08 | Tone body decay |
| noiseDecay | NDCY | 0.02–0.25 s | 0.07 | Noise snap decay |
| toneAmt | TONE | 0.0–0.6 | 0.20 | Tone level |
| noiseAmt | NOIS | 0.3–1.2 | 0.85 | Noise level |
| noiseFc | SNAP | 1000–6000 Hz | 3000 | Noise filter center freq |

### ClapVoice (TR-909 style)

4 rapid noise bursts (~2ms each, ~15ms apart) + exponential decay tail. Bandpass filtered noise.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| decay | DCY | 0.05–0.5 s | 0.18 | Tail decay |
| filterFc | TONE | 600–3000 Hz | 1200 | Bandpass center |
| burstGap | SPRD | 0.008–0.025 s | 0.015 | Gap between bursts |

### HatVoice (TR-909 closed hat)

6 square-wave oscillators at inharmonic metallic ratios (from 909 IC divider circuit). 12 dB/oct HP filter + 25% noise.
Tuned from 909 sample analysis: spectral peaks at 5000, 5800, 6700, 8500 Hz.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| decay | DCY | 0.01–0.15 s | 0.04 | Amplitude decay |
| baseFreq | FREQ | 400–1200 Hz | 800 | Oscillator base frequency |
| hpCutoff | HP | 3000–9000 Hz | 5000 | High-pass filter cutoff |
| volume | VOL | 0.1–1.0 | 0.65 | Output level |

### OpenHatVoice (TR-909 open hat)

Same oscillator bank as closed hat but longer decay and lower HP cutoff.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| decay | DCY | 0.05–0.5 s | 0.18 | Amplitude decay |
| baseFreq | FREQ | 400–1200 Hz | 800 | Oscillator base frequency |
| hpCutoff | HP | 3000–9000 Hz | 4500 | High-pass filter cutoff |
| volume | VOL | 0.1–1.0 | 0.60 | Output level |

### CymbalVoice (TR-909 crash)

Same metallic oscillator technique but with wider ratio spread, 35% noise, onset body burst at 500 Hz.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| decay | DCY | 0.15–1.5 s | 0.35 | Amplitude decay |
| baseFreq | FREQ | 250–800 Hz | 500 | Oscillator base frequency |
| hpCutoff | HP | 1500–5000 Hz | 2500 | High-pass filter cutoff |
| volume | VOL | 0.1–1.0 | 0.55 | Output level |

### TB303Voice (acid bass)

Sawtooth → pre-filter tanh drive → resonant LP (Q=7) with quadratic envelope sweep.
Dual-envelope architecture: filterEnv (sustain=0, acid sweep) + ampEnv (sustain=1.0, gate-style VCA).
Auto-legato: consecutive notes connect via `slideNote()` — 60ms exponential pitch glide + filter retrigger for acid squelch.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| cutoffBase | CUT | 50–500 Hz | 200 | Filter base cutoff |
| envMod | MOD | 500–8000 Hz | 4000 | Envelope modulation depth |
| resonance | RESO | 1.0–14.0 | 7.0 | Filter Q |
| decay | DCY | 0.08–0.5 s | 0.18 | Filter envelope decay time |
| drive | DRIV | 0.5–3.0 | 1.6 | Pre-filter saturation |

### MoogVoice (4-pole analog lead)

Two detuned sawtooth oscillators → tanh saturation → two cascaded resonant LP biquads (24 dB/oct total) with inter-stage soft clip.
Dual-envelope architecture: filterEnv (sustain=0) + ampEnv (sustain=0.8).
Auto-legato: consecutive notes connect via `slideNote()` — instant pitch change (no glide), envelopes continue.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| cutoffBase | CUT | 100–2000 Hz | 400 | Filter base cutoff |
| envMod | MOD | 1000–10000 Hz | 5500 | Envelope modulation depth |
| resonance | RESO | 0.5–3.5 | 1.8 | Filter Q |
| filterDecay | FDCY | 0.1–1.0 s | 0.35 | Filter envelope decay time |
| ampAttack | ATCK | 0.001–0.5 s | 0.005 | Amp envelope attack |
| ampDecay | ADCY | 0.01–1.0 s | 0.3 | Amp envelope decay |
| ampSustain | SUST | 0.0–1.0 | 0.8 | Amp envelope sustain level |
| ampRelease | RLS | 0.01–2.0 s | 0.25 | Amp envelope release |

### FMVoice (YM2612-inspired 3-operator FM)

Op1: self-feedback modulator (Genesis "rasp"). Op2: fast-decaying bright transient. Carrier: phase-modulated by op chain.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| op2Ratio | RATIO | 0.5–4.0 | 2.1 | Modulator frequency ratio |
| fbAmt | FDBK | 0.0–1.0 | 0.55 | Op1 self-feedback amount |
| op2Index | IDX2 | 1.0–8.0 | 4.5 | Op2 modulation index |
| carrierIndex | CIDX | 1.0–8.0 | 3.5 | Carrier modulation index |
| decay | DCY | 0.1–0.8 s | 0.30 | Carrier ADSR decay time |

## DSP Building Blocks

Located in `src/lib/audio/dsp/`. Split into modules for maintainability and C++ porting.

| Module | Class | Description |
|---|---|---|
| filters.ts | ResonantLP | 2-pole resonant low-pass biquad (12 dB/oct). Used for 303 filter, snare noise, clap. |
| filters.ts | BiquadHP | 2-pole high-pass biquad (12 dB/oct). Used for metallic percussion. |
| filters.ts | ADSR | 4-stage envelope generator (attack/decay/sustain/release). |
| effects.ts | SimpleReverb | Freeverb-style: 4 comb filters + 2 allpass, stereo spread. |
| effects.ts | PingPongDelay | Stereo ping-pong with cross-feedback. |
| effects.ts | SidechainDucker | Kick-triggered gain duck with exponential recovery. |
| effects.ts | BusCompressor | Peak-detecting compressor (0.8ms attack, 60ms release). |
| effects.ts | PeakLimiter | Lookahead (~1.5ms) brickwall limiter at 0.92 ceiling. |
| effects.ts | GranularProcessor | Ring buffer (~0.75s stereo) + grain pool (max 10). Send effect. |
| voices.ts | Voice (interface) | Common tick/trigger/setParams/isIdle interface. |
| voices.ts | KickVoice, SnareVoice, … | All synth voice implementations. |
| voices.ts | makeVoice(type) | Factory function for voice instantiation. |

## Effects Chain — DECIDED

```
voices ──┬──────────────────────── dry (kick separated for sidechain bypass)
         ├─ reverbSend   ──► SimpleReverb    ─┐
         ├─ delaySend    ──► PingPongDelay   ─┤
         ├─ glitchSend   ──► Glitch          ─┤
         └─ granularSend ──► GranularProcessor─┴─► sum
                                                    │
                              SidechainDucker ◄─────┘ (kick triggers, rest ducked)
                                                    │
                                              BusCompressor
                                                    │
                                                3-band EQ
                                                    │
                                              Break gate
                                                    │
                                              Master gain
                                                    │
                                              PeakLimiter (0.92 ceiling)
                                                    │
                                                 output
```

### Per-Track Mixer

Each track feeds into the mix bus with:
- `volume` 0.0–1.0 (default 0.8)
- `pan` -1.0–1.0 (constant-power pan law)
- `reverbSend` 0.0–1.0
- `delaySend` 0.0–1.0
- `glitchSend` 0.0–1.0
- `granularSend` 0.0–1.0

All four sends are accumulated as separate buses per sample frame, then processed through their respective effects and summed. Kick (track 0) is separated from the mix and added back **after** the sidechain ducker so it punches through untouched.

### SimpleReverb

Freeverb-style: 4 comb filters (tuned, L/R stereo spread) → 2 allpass filters.

Parameters (global):
- `size` 0.0–1.0 (maps to feedback 0.60–0.96)
- `damp` 0.0–1.0

### PingPongDelay

Stereo ping-pong with cross-feedback.

Parameters (global):
- `time` — stored as **beat fraction** (0.75 = dotted 8th). Converted to ms at send time: `(60000 / bpm) * fraction`.
- `feedback` 0.0–1.0

See [adr/003-bpm-synced-delay.md](./adr/003-bpm-synced-delay.md).

### SidechainDucker

Kick-triggered sidechain compression. On trigger, gain drops to `(1 - depth)` then recovers exponentially.

Parameters (global):
- `depth` 0.0–1.0 (default 0.85 — aggressive hyperpop pump)
- `release` ms (default 120)

### BusCompressor

Peak-detecting compressor with fast attack (0.8ms) and medium release (60ms).

Parameters (global):
- `threshold` 0.0–1.0 (default 0.30)
- `ratio` (default 6)
- `makeup` gain (default 2.2)

### 3-Band DJ EQ

Subtractive crossover: LP at 300 Hz (Butterworth) + HP at 3000 Hz.
Mid = original − low − high.

Gain: 0 = kill, 0.5 = unity, 1.0 = 2× boost.

### Break Gate

While BRK is held: 1/16-note rhythmic gate (half-step on, half-step off). Smooth ~0.75ms envelope to avoid clicks.

### GranularProcessor — DECIDED

**Send effect.** Per-track `granularSend` feeds into a stereo ring buffer (~0.75s); replays overlapping grains with Hann window envelopes. Wet-only return mixed into the master bus.

Controlled via FxPad GRN node:
- **X axis** → grain size: 10ms (left) to 200ms (right)
- **Y axis** → density/spawn interval: 200ms sparse (bottom) to 15ms dense wash (top)

Implementation:
- Ring buffer: continuously writes send bus signal
- Grain pool: max 10 active grains, each with random offset within last 0.5s of buffer
- Grain envelope: Hann window `0.5 * (1 - cos(2π * phase))` — zero at edges, no clicks
- Disable behavior: stops spawning new grains, existing grains ring out naturally (no click)
- Output gain: 0.85 when active, 0.6 during ring-out

### Glitch Effect — DECIDED

**Send effect.** Per-track `glitchSend` feeds into the glitch processor. Wet-only return mixed into the master bus.

Controlled via FxPad GLT node XY position:
- **X axis** → downsample rate (hold every 4–15 samples, PRNG-varied)
- **Y axis** → bit crush depth (5-bit quantization, 32 amplitude levels)

Also toggleable via PerfBar GLT press-hold button.

### PeakLimiter

Lookahead (~1.5ms) brickwall limiter at 0.92 ceiling. Fast attack, slow release.

## FxPad (XY Performance Controller) — DECIDED

An XY touch/drag surface with 4 draggable FX nodes. Tap a node to toggle on/off, drag to adjust parameters.

| Node | Label | Color | X axis | Y axis |
|---|---|---|---|---|
| verb | VERB | olive | Reverb size (0.4–0.99) | Reverb damp (inverted: top=bright) |
| delay | DLY | blue | Delay time fraction (0.125–1.0) | Delay feedback (0–0.85) |
| glitch | GLT | salmon | Downsample rate | Bit crush depth |
| granular | GRN | purple | Grain size (10–200ms) | Density (sparse→dense) |

When a node is **on**, its XY position overrides the corresponding global FX parameters (e.g., reverb size/damp, delay time/feedback). When **off**, global defaults are used. FxPad ON/OFF does **not** affect send levels — per-track sends are the sole control for FX send amount. For GRN, ON/OFF also gates grain spawning.

### FxPad Send Mixer

A compact per-track send mixer at the bottom of FxPad:
- Track selector dots (8 dots, one per track)
- Track name display
- VERB send knob (per-track reverb send level)
- DLY send knob (per-track delay send level)
- GLT send knob (per-track glitch send level)
- GRN send knob (per-track granular send level)

This is the **only** place to adjust per-track FX sends. ParamPanel and MobileTrackView do not duplicate these controls.

### Audio Visualizer

Canvas 2D 3D wireframe terrain rendered behind the FxPad nodes:
- 18 rows × 32 points per row, displaced vertically by AnalyserNode FFT frequency data
- Perspective projection: back rows compressed horizontally + faded, front rows full width + bright
- Colors by depth/frequency: olive (low) → blue (mid) → salmon (high) → purple (very high)
- Runs only when `ui.view === 'fx'` (RAF paused otherwise)
- DPR-aware for crisp rendering on high-density displays

## Performance Features — DECIDED

Accessible from PerfBar (press-hold buttons and knobs):

| Feature | Button | Behavior | Quantization |
|---|---|---|---|
| Key change | KEY piano | Diatonic transposition (OP-XY Brain style). Melodic tracks only. | Step-quantized |
| Octave shift | OCT ▼/▲ | -2 to +2 octave shift for melodic tracks (SplitFlap display) | Cycle-quantized |
| 3-band EQ | LOW/MID/HIGH knobs | Kill/unity/boost per band | Immediate |
| Master gain | GAIN knob | 0.0–1.0 master volume | Immediate |
| Drum fill | FILL | Random high-density drum triggers (snare 75%, hat 85%, kick 25%) | Step-quantized |
| Reverse | REV | Playheads decrement instead of increment | Step-quantized |
| Glitch | GLT | Downsample + bitcrush on master output | Immediate |
| Break | BRK | Rhythmic gate at 16th-note rate | Step-quantized |

### Diatonic Transposition (KEY)

OP-XY Brain-inspired key system:
- Notes are stored as absolute MIDI (C major basis)
- White key roots use modes of C major (D=Dorian, E=Phrygian, etc.)
- Black key roots use the major scale transposed chromatically
- Only melodic tracks (6–7) are transposed; drums are unaffected

### Smooth Mute

Track mute/unmute uses exponential fade: ~30ms fade out (preserves reverb tails), ~2ms fade in (immediate response).
