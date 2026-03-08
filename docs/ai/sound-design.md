# Sound Design

## Overview

8 tracks with configurable voice assignment via VoiceId registry (ADR 009).
All synthesis is implemented in **TypeScript** and runs inside the AudioWorklet processor.
A parallel C++ DSP core exists in `src/dsp/` (compiled via Emscripten) but is not yet integrated.

## Default Track Assignment — DECIDED

Tracks can be reassigned to any voice via VoicePicker (ADR 009). These are the factory defaults:

| Track | Name | VoiceId | Voice Class | Description |
|---|---|---|---|---|
| 0 | KICK | Kick | DrumMachine | TR-909 style bass drum |
| 1 | SNARE | Snare | DrumMachine | TR-909 style snare |
| 2 | CLAP | Clap | DrumMachine | TR-909 style hand clap |
| 3 | C.HH | Hat | DrumMachine | TR-909 closed hi-hat |
| 4 | O.HH | OpenHat | DrumMachine | TR-909 open hi-hat |
| 5 | CYM | Cymbal | DrumMachine | TR-909 crash cymbal |
| 6 | BASS | Bass303 | TB303Voice | TB-303 acid bass |
| 7 | LEAD | MoogLead | MoogVoice | Moog-style 4-pole lead |

## Synth Voices

### DrumMachine (unified drum synth — ADR 010)

A single `DrumMachine` class handles all drum sounds (Kick, Kick808, Snare, Clap, Hat, OpenHat, Cymbal, Tom, Rimshot, Cowbell, Shaker). Each VoiceId selects a preset from `DRUM_PRESETS` that configures the same parameter set differently. The architecture has three signal layers:

1. **Tone oscillator** — sine with exponential pitch sweep (pitchStart → pitchEnd)
2. **Noise generator** — white noise through SVF (LP/HP/BP configurable)
3. **Metallic oscillator** — 6 square waves at inharmonic ratios (hat/cymbal sounds)

All three are mixed per-preset, then processed through HP filter → drive → burst generator → output.

Parameters (via `paramDefs.ts`, shared by all drum VoiceIds):
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| toneLevel | TONE | 0.0–1.0 | 1.0 | Tone oscillator level |
| pitchStart | PSTRT | 30–800 Hz | 340 | Initial pitch |
| pitchEnd | PEND | 30–800 Hz | 55 | Final pitch |
| pitchDecay | PDCY | 0.003–0.2 s | 0.035 | Pitch sweep time constant |
| noiseLevel | NOIS | 0.0–1.2 | 0 | Noise level |
| noiseFilterFreq | FREQ | 500–12000 Hz | 3000 | Noise filter frequency |
| noiseFilterQ | Q | 0.5–5.0 | 1.0 | Noise filter resonance |
| noiseFilterMode | FTYP | 0–2 (step 1) | 0 | Filter: LP/HP/BP |
| metalLevel | METL | 0.0–1.0 | 0 | Metallic oscillator level |
| metalFreq | MFRQ | 200–1200 Hz | 800 | Metal base frequency |
| decay | DCY | 0.01–2.0 s | 0.35 | Amplitude decay |
| drive | DRIV | 0.0–2.5 | 1.4 | Distortion amount |
| hpFreq | HP | 20–8000 Hz | 20 | Output highpass frequency |
| click | CLCK | 0.0–1.0 | 0.6 | Transient click amount |
| burstCount | BRST | 1–6 (step 1) | 1 | Burst count (1=normal, 4=clap) |
| burstGap | GAP | 0.005–0.03 s | 0.015 | Burst gap time |

Each drum VoiceId has a factory preset in `DRUM_PRESETS` that overrides these defaults for the specific drum sound.

### SamplerVoice (ADR 012)

Sample playback voice used by Crash, Ride, and user Sampler. Loads audio via `loadSample` WorkletCommand. Factory samples for Crash/Ride are bundled; user Sampler accepts any audio file. Crash and Ride are categorized as `drum` in the UI (not `sampler`) because they are drum sounds that happen to use sample playback internally.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| decay | DCY | 0.05–5.0 s | 1.0 | Amplitude decay time |
| start | STRT | 0.0–1.0 | 0.0 | Sample start point |
| end | END | 0.0–1.0 | 1.0 | Sample end point |
| pitchShift | PTCH | -24–24 (step 1) | 0 | Pitch shift (semitones) |
| reverse | REV | 0–1 (step 1) | 0 | Reverse playback |
| chopSlices | CHOP | 0–32 (step 8) | 0 | Slice count: OFF/8/16/32 (ADR 065) |
| chopMode | MODE | 0–1 (step 1) | 0 | Chop: NOTE-MAP / SEQ |
| sampleBPM | BPM | 0–200 (step 1) | 0 | Sample BPM (0=OFF, enables tempo sync) |
| loopMode | LOOP | 0–1 (step 1) | 0 | Loop: ONE-SHOT / LOOP |
| stretchMode | STRC | 0–1 (step 1) | 0 | Stretch: REPITCH / WSOLA |

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
| decay | DCY | 0.08–0.5 s | 0.18 | Amplitude decay |
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

### AnalogVoice (generic analog synth)

Single sawtooth oscillator → tanh saturation → resonant LP filter with envelope sweep. Used as fallback voice for non-default synth assignments.

Parameters:
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| cutoffBase | CUT | 200–4000 Hz | 800 | Filter base cutoff |
| envMod | MOD | 500–8000 Hz | 4500 | Envelope modulation depth |
| resonance | RESO | 0.5–6.0 | 3.5 | Filter Q |
| decay | DCY | 0.1–0.5 s | 0.25 | Amplitude decay |

### iDEATH (wavetable synth — mono/poly)

Named after the central commune in Richard Brautigan's "In Watermelon Sugar". VoiceId: `'iDEATH'`. Class: `IdeathSynth`.

Dual wavetable oscillator synth with SVF filter, dual envelopes, dual LFOs, unison, filter drive, and modulation matrix. Combine modes: Mix (crossfade), FM (A modulated by B), Ring Mod (A × B). Wavetable shapes: Saw, Square, Triangle, Sine, Pulse — generated at startup (no stored data). See ADR 011.

Mono/poly mode switchable via `polyMode` parameter (0=mono, 1=4-voice poly with round-robin allocation and oldest-note stealing). Poly mode supports chord input via `trig.notes[]` field.

Parameters (via `paramDefs.ts`):
| Key | Label | Range | Default | Description |
|---|---|---|---|---|
| polyMode | POLY | 0–1 (step 1) | 0 | Polyphony: MONO/POLY(4) |
| oscAPos | WV-A | 0.0–1.0 | 0.0 | Osc A wavetable position |
| oscBPos | WV-B | 0.0–1.0 | 0.25 | Osc B wavetable position |
| oscBSemi | SEMI | -24–24 (step 1) | 0 | Osc B semitone offset |
| oscMix | MIX | 0.0–1.0 | 0.5 | Osc A/B mix |
| combine | COMB | 0–2 (step 1) | 0 | Combine mode: MIX/FM/RING |
| fmIndex | FMIX | 0.0–8.0 | 3.0 | FM modulation depth |
| cutoffBase | CUT | 50–8000 Hz | 1200 | SVF filter cutoff |
| envMod | FMOD | 0–8000 Hz | 4000 | Filter envelope depth |
| resonance | RESO | 0.5–10.0 | 2.0 | Filter resonance |
| filterMode | FTYP | 0–3 (step 1) | 0 | Filter: LP/HP/BP/Notch |
| drive | DRIV | 0.0–1.0 | 0.0 | Post-filter drive (saturation) |
| unisonVoices | UNI | 1–7 (step 2) | 1 | Unison voices: 1/3/5/7 |
| unisonSpread | SPRD | 0.0–1.0 | 0.3 | Unison detune spread |
| unisonWidth | WIDE | 0.0–1.0 | 0.8 | Unison stereo width |
| attack | ATCK | 0.001–1.0 s | 0.005 | Amp attack |
| decay | DCY | 0.01–2.0 s | 0.3 | Amp decay |
| sustain | SUST | 0.0–1.0 | 0.5 | Amp sustain level |
| release | RLS | 0.01–2.0 s | 0.3 | Amp release |
| modDecay | MDCY | 0.01–2.0 s | 0.25 | Mod envelope decay |
| lfo1Rate | LF1R | 0.1–20.0 Hz | 2.0 | LFO 1 rate |
| lfo1Shape | LF1S | 0–4 (step 1) | 0 | LFO 1: SIN/TRI/SAW/SQR/S&H |
| lfo1Sync | L1SY | 0–1 (step 1) | 0 | LFO 1 tempo sync: OFF/ON |
| lfo1Div | L1DV | 0–11 (step 1) | 2 | LFO 1 sync division |
| lfo2Rate | LF2R | 0.1–20.0 Hz | 0.5 | LFO 2 rate |
| lfo2Shape | LF2S | 0–4 (step 1) | 0 | LFO 2: SIN/TRI/SAW/SQR/S&H |

Factory presets: 22 presets across 6 categories (Lead, Bass, Pad, Pluck, Keys, FX). Browsable from DockPanel preset browser (iDEATH only).

## DSP Building Blocks

Located in `src/lib/audio/dsp/`. Split into modules for maintainability and C++ porting.

| Module | Class | Description |
|---|---|---|
| filters.ts | ResonantLP | 2-pole resonant low-pass biquad (12 dB/oct). Used for 303 filter, snare noise, clap. |
| filters.ts | BiquadHP | 2-pole high-pass biquad (12 dB/oct). Used for metallic percussion. |
| filters.ts | SVFilter | Trapezoidal-integrated state variable filter. LP/HP/BP/Notch modes. Used by iDEATH synth. |
| filters.ts | DJFilter | Combined LP/HP sweep filter. X = LP←0.5→HP, Y = resonance. Used for master filter. |
| filters.ts | PeakingEQ | Parametric peaking EQ band. Used for 3-band master EQ. |
| filters.ts | ADSR | 4-stage envelope generator (attack/decay/sustain/release). |
| effects.ts | SimpleReverb | Freeverb-style: 4 comb filters + 2 allpass, stereo spread. |
| effects.ts | PingPongDelay | Stereo ping-pong with cross-feedback. |
| effects.ts | SidechainDucker | Kick-triggered gain duck with exponential recovery. |
| effects.ts | BusCompressor | Peak-detecting compressor (0.8ms attack, 60ms release). |
| effects.ts | PeakLimiter | Lookahead (~2.5ms) brickwall limiter at 0.92 ceiling. |
| effects.ts | GranularProcessor | Ring buffer (~0.75s stereo) + grain pool (max 10). Send effect. |
| voices.ts | Voice (interface) | Common tick/trigger/setParams/isIdle interface. |
| voices.ts | DrumMachine | Unified drum synth (ADR 010). All drum VoiceIds use this class with different presets. |
| voices.ts | TB303Voice, MoogVoice, AnalogVoice, FMVoice | Individual melodic voice implementations. |
| voices.ts | IdeathSynth | Wavetable synth with mono/poly, unison, SVF, dual LFO, factory presets. |
| voices.ts | SamplerVoice | Sample playback voice (ADR 012). Used by Crash, Ride, and user Sampler. |
| voices.ts | WavetableOsc | Band-limited wavetable oscillator with 5 morphable shapes (Saw/Square/Triangle/Sine/Pulse). |
| voices.ts | makeVoice(trackIdx, voiceId, sr) | Registry-based factory for voice instantiation (ADR 009). |
| voices.ts | VOICE_REGISTRY | Maps VoiceId string → voice constructor. |
| voices.ts | DRUM_VOICES | ReadonlySet of drum VoiceIds for isDrum() check. |
| voices.ts | VOICE_LIST | VoiceMeta array with id, label, category for UI picker. |

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
                                            PeakingEQ ×3
                                                    │
                                              DJ Filter
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

Lookahead (~2.5ms) brickwall limiter at 0.92 ceiling. Fast attack, slow release.

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
- Runs only when FxPad overlay sheet is open (RAF paused otherwise)
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
