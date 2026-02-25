# Glossary

Domain-specific terms used throughout the docs. When a term appears in specs, it means exactly what is defined here.

## Sequencer Terms

| Term | Definition |
|---|---|
| **Pattern** | The top-level musical unit. Contains 8 tracks and plays as one loop. |
| **Track** | One instrument lane within a pattern. Has a fixed SynthType and its own step count. |
| **Step** | One time slot in a track's grid. Steps are numbered from 1. |
| **Trig** | An active step that fires the synth. A step with no trig is "empty". |
| **Polymetric** | Tracks running with different step counts, causing their loops to phase against each other. |
| **Parameter Lock (p-lock)** | A per-trig override of a synth parameter, reverting to the track default afterward. (DEFERRED) |
| **Playhead** | The current playing step position, advancing with the clock. One per track. |
| **BPM** | Beats per minute. Controls the global clock rate. |
| **Scale** | A per-track time multiplier (0.5 = double speed, 2 = half speed). |
| **Gate / Length** | How long a trig holds the synth voice open, expressed as a fraction of one step. |

## Synthesis Terms

| Term | Definition |
|---|---|
| **VCO** | Voltage-Controlled Oscillator. The tone generator in subtractive synthesis. |
| **VCF** | Voltage-Controlled Filter. Shapes the frequency content of the oscillator. |
| **VCA** | Voltage-Controlled Amplifier. Controls the volume envelope. |
| **ADSR** | Attack, Decay, Sustain, Release — the four stages of an amplitude envelope. |
| **EG** | Envelope Generator. Produces a time-varying control signal for VCF or VCA. |
| **Ladder filter** | A specific VCF topology (Moog-style) with 4-pole rolloff and characteristic resonance. |
| **FM synthesis** | Frequency Modulation synthesis. One oscillator (modulator) modulates the frequency of another (carrier). |
| **Operator** | A single oscillator unit in FM synthesis. This app uses 2-operator FM. |
| **Modulation index** | In FM, controls the depth of pitch modulation — higher values = more sidebands = brighter/harsher tone. |
| **Send effect** | An effect that receives a mix of multiple tracks at configurable levels (vs. insert which is in-series). |

## Technical Terms

| Term | Definition |
|---|---|
| **WASM / WebAssembly** | A binary instruction format for the browser VM. Used to run the C++ DSP core at near-native speed. |
| **AudioWorklet** | A Web Audio API node that runs JavaScript/WASM on a dedicated audio processing thread. |
| **SharedArrayBuffer (SAB)** | A shared memory region accessible from both the main thread and AudioWorklet thread. |
| **Emscripten** | The compiler toolchain that compiles C++ to WebAssembly. |
| **DSP** | Digital Signal Processing. The mathematical operations that produce and transform audio. |
| **Audio block** | The chunk of audio samples processed in one `process()` call of the AudioWorklet (typically 128 samples). |
| **VST3** | A plugin format for digital audio workstations (DAWs). Future target platform. |
| **Runes** | Svelte 5's reactivity system (`$state`, `$derived`, `$effect`). Replaces Svelte 4 stores. |

## Status Markers (used in all docs)

| Marker | Meaning |
|---|---|
| **DECIDED** | Confirmed by the user. Implement as specified. |
| **PROPOSED** | Recommended by AI, not yet confirmed. Do not implement without user approval. |
| **OPEN** | Actively under discussion. Do not implement. |
| **DEFERRED** | Intentionally postponed. The data model may exist, but no UI or DSP implementation. |
