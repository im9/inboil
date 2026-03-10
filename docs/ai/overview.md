# Product Overview

## Vision

A browser-based groovebox in the spirit of Elektron hardware (Digitakt, Model:Cycles) and Teenage Engineering OP-XY.
The goal is a focused, expressive tool for composing and performing electronic music in the browser — no installation required.

## Goals

- Real-time step sequencing with per-track parameter control
- Low-latency audio synthesis via AudioWorklet (TypeScript now, WASM future)
- Portable DSP core (C++) reusable for iOS and VST without rewrite (long-term)
- Minimalist, distraction-free UI that respects the hardware groovebox workflow
- Performance features for live playing (KEY, OCT, EQ, FILL, REV, GLT, BRK)
- FxPad XY performance surface with real-time FX control and audio visualization
- Mobile-responsive layout (calculator-style on phone, full grid on desktop)

## Non-Goals (v1)

- Cloud sync / user accounts
- Collaboration features
- MIDI controller support (deferred)

## Constraints

| Constraint | Detail |
|---|---|
| Browser audio | Web Audio API + AudioWorklet |
| DSP runtime | TypeScript (current); C++17 via Emscripten (future) |
| Frontend | Svelte 5 (runes API) |
| No external audio libs (v1) | All synthesis written from scratch in TypeScript |
| Package manager | pnpm |
| Build tool | Vite |

## Current State

The TypeScript AudioWorklet implementation is fully functional with:
- Variable track count (up to 16 tracks, ADR 056) with configurable voice assignment (any voice on any track, ADR 058)
- 19 voice types: 11 drum (unified DrumMachine — Kick, Kick808, Snare, Clap, Hat, OpenHat, Cymbal, Tom, Rimshot, Cowbell, Shaker), 2 sample (Crash, Ride via SamplerVoice), 2 bass (TB-303, Analog), 2 lead (Moog with arpeggiator, 4-op FM 12-voice with 8 algorithms and MEGAfm-style poly modes — ADR 068), 1 wavetable synth (WT — 8-voice with MONO/POLY8/WIDE4/UNISON poly modes), 1 user sampler
- Full effects chain (reverb, delay, sidechain, compressor, EQ, granular, glitch, limiter)
- Performance features (KEY transposition, OCT octave shift, EQ, FILL, REV, GLT, BRK, swing)
- FxPad: XY performance controller with 4 draggable FX nodes (VERB, DLY, GLT, GRN)
- Audio visualizer: 3D wireframe terrain on FxPad canvas background, driven by AnalyserNode FFT data
- Per-track send mixer on FxPad (VERB, DLY, GLT, GRN per selected track)
- Song model: pattern pool (100 patterns: 21 factory + 79 user), sections, scene graph
- Scene graph: node-based directed graph for arrangement (pattern/transpose/tempo/repeat/probability/fx nodes, decorators via ADR 066)
- SceneView always main view; pattern/FX/EQ as overlay sheets (ADR 054)
- MatrixView: pattern pool browser sidebar (desktop)
- SectionNav: *(deprecated)* linear section strip — superseded by Scene graph
- Queued pattern switching
- Per-step velocity, chance (probability), duration, slide, parameter locks (p-locks)
- Lead arpeggiator (5 modes, chord types, octave range)
- Note bar editor (PianoRoll) with auto-legato for melodic tracks, poly chord input for WT/FM poly mode
- Factory preset browser (22 WT presets across 6 categories, 20 FM presets across 6 categories)
- Master view with VU meter and audio-reactive visuals (ADR 035)
- Virtual MIDI keyboard (PC keyboard audition, Phase 1)
- Undo/redo (snapshot-based, Ctrl+Z)
- Pattern copy/paste/clear
- Oscilloscope waveform display
- Per-track solo (additive, via DockPanel or MobileParamOverlay)
- DockPanel (right, minimizable): synth param knobs, send/mixer knobs
- Sidebar (fixed right drawer): Help/System settings (ADR 055)
- Desktop + mobile responsive UI (with mobile velocity/chance editing tabs)

The C++ DSP core (`src/dsp/`) is being developed in parallel but is not yet integrated into the web build.

## Future Platforms (DEFERRED)

- **iOS app** — DSP core reused via C++ static library; Swift/SwiftUI frontend
- **VST3 plugin** — DSP core compiled with JUCE; DAW integration

## Inspiration

- **Elektron Digitakt** — Track-per-instrument paradigm, trig locks, minimal encoders
- **Elektron Model:Cycles** — FM-based synthesis, minimal hardware, expressive per-step
- **Teenage Engineering OP-1 / OP-XY** — Clean information hierarchy, Brain scale transposition, thoughtful constraints
