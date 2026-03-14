# inboil

Browser-based groove box / DAW inspired by Elektron hardware and Teenage Engineering OP-XY.
Step sequencing, analog-modeled synthesis, scene graph arrangement — all running in a single AudioWorklet, zero npm runtime dependencies.

## Features

- **19 voice types** — 11 drum synths, 2 sample drums (909 crash/ride), TB-303 bass, Moog lead, analog bass, 4-op FM (12-voice poly), wavetable (8-voice poly), user sampler
- **Variable track count (up to 16)** — per-pattern, independent step counts (1–64), polymetric
- **Parameter locks (P-Lock)** — per-step parameter overrides, Elektron-style
- **Piano roll & tracker view** — note/duration editing for melodic tracks
- **Scene graph** — node-based arrangement with pattern nodes, generative nodes (Turing Machine, Quantizer, Tonnetz), decorators, and edge-based branching
- **Scale-aware arpeggiator** — UP / DOWN / UP-DOWN / RANDOM with diatonic chord modes
- **Effects** — reverb, delay, glitch, granular with XY performance pads; per-track insert FX; 3-band EQ; DJ filter
- **Sidechain ducker & bus compressor** — master bus processing with peak limiter
- **50 factory presets** — 30 WT + 20 FM across 6 categories each
- **100 pattern slots** — 21 factory + 79 user, IndexedDB persistence
- **Performance controls** — fill, reverse, break, swing, key transpose, chord brush
- **WAV recording** — capture master output with reverb tail
- **Hardware MIDI** — USB + BLE MIDI input with per-note release
- **Responsive** — desktop grid, tablet compact, mobile calculator layout
- **Bilingual** — English / Japanese (help, tooltips, docs)

## Tech Stack

| Layer | Tech |
|-------|------|
| UI | Svelte 5 (runes), TypeScript |
| Build | Vite 6 |
| DSP | TypeScript AudioWorklet (C++ WASM port planned) |
| Audio | AudioWorklet, Web Audio API |
| Docs | Astro + Starlight |
| Fonts | Bebas Neue, JetBrains Mono |

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in a browser that supports AudioWorklet.

### Commands

```bash
pnpm dev       # Vite dev server
pnpm build     # production build
pnpm check     # svelte-check
pnpm deploy    # build + Cloudflare Pages
```

## Project Structure

```
src/
├── App.svelte                # Root component
├── lib/
│   ├── audio/
│   │   ├── engine.ts         # Main thread ↔ worklet bridge
│   │   ├── worklet-processor.ts  # AudioWorklet sequencer + DSP
│   │   └── dsp/              # DSP core (voices, effects, filters)
│   ├── components/           # Svelte UI components (~40)
│   ├── paramDefs.ts          # Synth parameter definitions
│   ├── presets.ts            # Factory presets (WT 30, FM 20)
│   ├── factory.ts            # Default song/pattern templates
│   ├── sceneActions.ts       # Scene graph mutations
│   ├── storage.ts            # IndexedDB + localStorage persistence
│   └── state.svelte.ts       # Reactive state (Svelte 5 runes)
├── dsp/                      # C++ synth engines → WASM (future)
site/                         # Astro docs & landing page
docs/ai/                      # Design specs & ADRs
```

## Links

- [Docs](https://inboil-site.pages.dev/ja/docs/)
- [Support (Ko-fi)](https://ko-fi.com/inboil)

## License

[AGPL-3.0](LICENSE)
