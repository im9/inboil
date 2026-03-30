# Product Overview

## Vision

A browser-based groovebox in the spirit of Elektron hardware (Digitakt, Model:Cycles) and Teenage Engineering OP-XY.
The goal is a focused, expressive tool for composing and performing electronic music in the browser — no installation required.

## Goals

- Real-time step sequencing with per-track parameter control
- Low-latency audio synthesis via TypeScript AudioWorklet
- Potential future native port for iOS/VST (ADR 001 superseded C++ WASM approach)
- Minimalist, distraction-free UI that respects the hardware groovebox workflow
- Performance features for live playing (KEY, OCT, EQ, FILL, REV, GLT, BRK)
- FxPad XY performance surface with real-time FX control and audio visualization
- Mobile-responsive layout (calculator-style on phone, full grid on desktop)

## Non-Goals (v1)

- Cloud sync / user accounts

## Constraints

| Constraint | Detail |
|---|---|
| Browser audio | Web Audio API + AudioWorklet |
| DSP runtime | TypeScript AudioWorklet |
| Frontend | Svelte 5 (runes API) |
| No external audio libs (v1) | All synthesis written from scratch in TypeScript |
| Package manager | pnpm |
| Build tool | Vite |

## Current State

The TypeScript AudioWorklet implementation is fully functional with:
- Variable track count (up to 16 tracks, ADR 056) with configurable voice assignment (any voice on any track, ADR 058)
- 20 voice types: 12 drum (unified DrumMachine — Kick, Kick808, Snare, Clap, Hat, OpenHat, Cymbal, Tom, Rimshot, Cowbell, Shaker; FM Drum — 6 machines with 22 presets, ADR 111), 2 sample (Crash, Ride via SamplerVoice, loaded from Audio Pool), 2 bass (TB-303, Analog), 2 lead (Moog with arpeggiator, 4-op FM 12-voice with 8 algorithms and MEGAfm-style poly modes — ADR 068), 1 wavetable synth (WT — 16-voice with MONO/POLY16/WIDE8/UNISON poly modes), 1 polyphonic sampler (PolySampler — 8-voice round-robin, multi-sample zone mapping)
- Audio Pool (ADR 104): OPFS-based persistent sample library with 111 factory sample files (WebM/Opus, ~1.7MB) — 90 browsable samples across 11 categories + 21 Grand Piano pack zones. Multi-sample packs, inline browser with folder drill-down, search, audition, user sample auto-import and management
- Full effects chain (reverb, delay, sidechain, compressor, EQ, granular, glitch, limiter)
- Performance features (KEY transposition, OCT octave shift, EQ, FILL, REV, GLT, BRK, swing)
- FxPad: XY performance controller with 4 draggable FX nodes (VERB, DLY, GLT, GRN)
- Audio visualizer: 3D wireframe terrain on FxPad canvas background, driven by AnalyserNode FFT data
- Per-track send mixer on FxPad (VERB, DLY, GLT, GRN per selected track)
- Song model: pattern pool (100 slots, 4 pre-populated in default song), scene
- Scene: node-based directed graph for arrangement (pattern nodes + modifier nodes via ADR 066/093)
- Generative scene nodes: Turing Machine, Quantizer, Tonnetz neo-Riemannian transforms (ADR 078/089)
- Scene stamps: kidpix-inspired decorative SVG pictograms with beat-synced animations (ADR 119)
- Graphic score automation: inline DockPanel editor with EQ/Master/FX automation targets (ADR 026). Curve automation removed (ADR 093) — replaced by per-step paramLocks
- FX flavours: 3 variants per send effect — reverb (room/hall/shimmer), delay (digital/dotted/tape), glitch (bitcrush/redux/stutter), granular (cloud/stretch/reverse) (ADR 075/076)
- Per-track dual insert FX chain: 2-slot serial chain (verb/delay/glitch/dist) with per-step P-Locks (ADR 077/114/122)
- Tape saturator: master bus saturation with tape compression and hiss, controlled via MasterView SAT XY pad (ADR 122)
- SceneView always main view; pattern/FX/EQ as overlay sheets (ADR 054)
- MatrixView: pattern pool browser sidebar (desktop)
- Queued pattern switching
- Per-step velocity, chance (probability), duration, slide, parameter locks (p-locks)
- Piano roll with chord brush (pen/eraser/chord/strum), drag legato, poly chord input (ADR 067)
- Per-track step scale: 1/8, 3/16, 1/16 (default), 3/32, 1/32 resolution per track for polyrhythmic patterns (ADR 112)
- Lead arpeggiator (5 modes, chord types, octave range)
- Factory preset browser (30 WT presets across 6 categories, 20 FM presets across 6 categories)
- Master view with VU meter and audio-reactive visuals (ADR 035)
- Hardware MIDI keyboard input: USB + BLE MIDI, per-note release, CC1→DJ Filter (ADR 081)
- Virtual MIDI keyboard (PC keyboard audition, Phase 1)
- WAV recording via MediaRecorder with reverb tail capture (ADR 085)
- MIDI Type 1 multi-track export + JSON project export/import (ADR 030/020)
- Undo/redo (snapshot-based, Ctrl+Z)
- Pattern copy/paste/clear
- Oscilloscope waveform display
- Per-track solo (additive, via DockPanel or MobileParamOverlay)
- DockPanel (right, minimizable): synth param knobs, send/mixer, decorator editor, generative editor
- Sidebar (fixed right drawer): Help + System (PROJECT/SETTINGS tabs, REC button) (ADR 055/085)
- Desktop + mobile responsive UI (with mobile velocity/chance editing tabs)

The C++ DSP approach was superseded (ADR 001). All DSP runs as TypeScript in `src/lib/audio/dsp/`.

## Future Platforms (DEFERRED)

- **iOS app** — native port of TS DSP; Swift/SwiftUI frontend
- **VST3 plugin** — native DSP port with JUCE; DAW integration

## Inspiration

- **Elektron Digitakt** — Track-per-instrument paradigm, trig locks, minimal encoders
- **Elektron Model:Cycles** — FM-based synthesis, minimal hardware, expressive per-step
- **Teenage Engineering OP-1 / OP-XY** — Clean information hierarchy, Brain scale transposition, thoughtful constraints
