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
- Sample import / Sampler voice (deferred)

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
- 8 tracks (6 drum + 2 melodic) with TR-909 / TB-303 / Moog-inspired voices
- Full effects chain (reverb, delay, sidechain, compressor, EQ, granular, glitch, limiter)
- Performance features (KEY transposition, OCT octave shift, EQ, FILL, REV, GLT, BRK, swing)
- FxPad: XY performance controller with 4 draggable FX nodes (VERB, DLY, GLT, GRN)
- Audio visualizer: 3D wireframe terrain on FxPad canvas background, driven by AnalyserNode FFT data
- Per-track send mixer on FxPad (VERB, DLY, GLT, GRN per selected track)
- Pattern bank (100 patterns: 10 factory + 90 user), queued pattern switching, pattern chain
- Per-step velocity, chance (probability), duration, slide, parameter locks (p-locks)
- Lead arpeggiator (5 modes, chord types, octave range)
- Note bar editor (PianoRoll) with auto-legato for melodic tracks
- Virtual MIDI keyboard (PC keyboard audition, Phase 1)
- Undo/redo (snapshot-based, Ctrl+Z)
- Pattern copy/paste/clear
- Oscilloscope waveform display
- Per-track solo (additive, via DockPanel or MobileParamOverlay)
- Dockable parameter panel (right or bottom, persistent position)
- Desktop + mobile responsive UI (with mobile velocity/chance editing tabs)

The C++ DSP core (`src/dsp/`) is being developed in parallel but is not yet integrated into the web build.

## Future Platforms (DEFERRED)

- **iOS app** — DSP core reused via C++ static library; Swift/SwiftUI frontend
- **VST3 plugin** — DSP core compiled with JUCE; DAW integration

## Inspiration

- **Elektron Digitakt** — Track-per-instrument paradigm, trig locks, minimal encoders
- **Elektron Model:Cycles** — FM-based synthesis, minimal hardware, expressive per-step
- **Teenage Engineering OP-1 / OP-XY** — Clean information hierarchy, Brain scale transposition, thoughtful constraints
