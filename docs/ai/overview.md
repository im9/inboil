# Product Overview

## Vision

A browser-based groovebox in the spirit of Elektron hardware (Digitakt, Model:Cycles).
The goal is a focused, expressive tool for composing and performing electronic music in the browser — no installation required.

## Goals

- Real-time step sequencing with per-step parameter control
- Low-latency audio synthesis via WebAssembly DSP
- Portable DSP core (C++) reusable for iOS and VST without rewrite
- Minimalist, distraction-free UI that respects the hardware groovebox workflow

## Non-Goals (v1)

- Cloud sync / user accounts
- Collaboration features
- MIDI controller support (deferred)
- Mobile-responsive layout (desktop-first for now)

## Constraints

| Constraint | Detail |
|---|---|
| Browser audio | Web Audio API + AudioWorklet for WASM execution |
| DSP language | C++17, compiled to WASM via Emscripten |
| Frontend | Svelte 5 (runes API) |
| No external audio libs (v1) | All synthesis written from scratch in C++ |
| Latency target | ≤ 10ms audio output latency on modern desktop Chrome/Firefox/Safari |

## Future Platforms (DEFERRED)

- **iOS app** — DSP core reused via C++ static library; Swift/SwiftUI frontend
- **VST3 plugin** — DSP core compiled with JUCE; DAW integration

## Inspiration

- **Elektron Digitakt** — Track-per-instrument paradigm, trig locks, minimal encoders
- **Elektron Model:Cycles** — FM-based synthesis, minimal hardware, expressive per-step
- **Teenage Engineering OP-1** — Clean information hierarchy, thoughtful constraints
