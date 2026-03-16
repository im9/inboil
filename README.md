# inboil

Browser-based groove box / DAW inspired by Elektron hardware and Teenage Engineering OP-XY.
Step sequencing, analog-modeled synthesis, scene graph arrangement — all running in a single AudioWorklet, zero npm runtime dependencies.

## Features

- **19 voice types** — 11 drum synths, 2 sample drums (909 crash/ride), TB-303 bass, Moog lead, analog bass, 4-op FM (12-voice poly), wavetable (8-voice poly), user sampler
- **Audio Pool** — 79 factory samples (kicks, snares, hats, loops, etc.) stored in OPFS; inline browser with folder drill-down, search, audition; user samples auto-imported
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
├── App.svelte                  # Root component (layout, engine wiring)
├── main.ts                     # Entry point
├── app.css                     # Global styles (reset, tokens)
├── lib/
│   ├── audio/
│   │   ├── engine.ts           # Main thread ↔ worklet bridge
│   │   ├── worklet-processor.ts # AudioWorklet sequencer + DSP
│   │   └── dsp/                # DSP modules (voices, effects, filters)
│   ├── multiDevice/            # WebRTC multi-device jam (ADR 019)
│   ├── components/             # Svelte 5 UI components (43)
│   ├── types.ts                # Core data types (Song, Pattern, Cell, Trig)
│   ├── state.svelte.ts         # Reactive state (Svelte 5 runes)
│   ├── paramDefs.ts            # Synth parameter definitions
│   ├── presets.ts              # Factory presets (WT 30, FM 20)
│   ├── factory.ts              # Default song/pattern templates
│   ├── constants.ts            # Default values (perf, FX flavours, etc.)
│   ├── sceneActions.ts         # Scene graph CRUD, layout, clipboard
│   ├── scenePlayback.ts        # Scene traversal engine
│   ├── generative.ts           # Turing Machine, Quantizer, Tonnetz
│   ├── automation.ts           # Automation curve evaluation
│   ├── audioPool.ts            # OPFS audio pool (factory + user samples)
│   ├── storage.ts              # IndexedDB + localStorage persistence
│   ├── midi.ts                 # Web MIDI API integration
│   ├── midiExport.ts           # MIDI Type 1 export
│   ├── wavExport.ts            # WAV recording capture
│   └── songClone.ts            # Pure data clone/restore for serialization
├── dsp/                        # C++ synth engines → WASM (future)
public/
├── samples/                    # Factory sample WebM files (79) + manifest
site/                           # Astro docs & landing page
docs/ai/                        # Design specs & ADRs
```

## Links

- [Docs](https://inboil-site.pages.dev/ja/docs/)
- [Support (Ko-fi)](https://ko-fi.com/inboil)

## License

[AGPL-3.0](LICENSE)
