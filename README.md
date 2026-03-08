# INBOIL

Browser-based step sequencer inspired by Elektron hardware.
Up to 16 tracks, pattern sequencing, parameter locks, real-time performance — all running in WebAssembly + Web Audio.

## Features

- **Variable track count (up to 16)** — drum + melodic tracks with independent step counts (1–64)
- **Polymetric sequencing** — each track runs at its own length
- **Parameter locks (P-Lock)** — per-step parameter overrides, Elektron-style
- **Piano roll** — note/duration editing for melodic tracks
- **Scale-aware arpeggiator** — UP / DOWN / UP-DOWN / RANDOM with diatonic chord modes
- **DSP in WebAssembly** — analog-modeled synths (kick, snare, clap, hat, cymbal, 303 bass, Moog lead, FM)
- **Effects** — reverb, delay, glitch, granular, filter, 3-band EQ with XY performance pads
- **Sidechain ducker & compressor** — master bus processing
- **Pattern bank** — 20 factory presets + 80 user slots, localStorage persistence
- **Performance controls** — fill, reverse, break, swing, key transpose
- **Responsive** — desktop grid, tablet compact, mobile calculator layout
- **Bilingual help** — English / Japanese

## Tech Stack

| Layer | Tech |
|-------|------|
| UI | Svelte 5, TypeScript |
| Build | Vite 6 |
| DSP | C++ → WebAssembly (Emscripten) |
| Audio | AudioWorklet, Web Audio API |
| Fonts | Bebas Neue, JetBrains Mono |

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in a browser that supports AudioWorklet.

### Build

```bash
pnpm build
pnpm preview
```

### DSP (WASM)

```bash
cd src/dsp
mkdir -p build && cd build
emcmake cmake ..
emmake make
```

Requires [Emscripten](https://emscripten.org/) toolchain.

## Project Structure

```
src/
├── App.svelte              # Root component
├── lib/
│   ├── audio/
│   │   ├── engine.ts       # Main thread ↔ worklet bridge
│   │   └── worklet-processor.ts  # AudioWorklet sequencer + DSP
│   ├── components/         # Svelte UI components
│   ├── paramDefs.ts        # Synth parameter definitions
│   └── state.svelte.ts     # Reactive state (patterns, UI, effects)
├── dsp/                    # C++ synth engines → WASM
│   ├── engine/             # Audio engine core
│   ├── synth/              # DrumSynth, AnalogSynth, FMSynth, NoiseSynth
│   └── fx/                 # Effects processors
docs/                       # Design docs & ADRs
```

## License

Private — all rights reserved.
