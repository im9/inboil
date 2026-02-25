# Architecture

## Layer Diagram

```
┌─────────────────────────────────────────────┐
│              Svelte 5 UI (browser)           │
│  Components / Stores / Runes / Event Bus     │
└─────────────────┬───────────────────────────┘
                  │  JS calls (wasm-interface.md)
┌─────────────────▼───────────────────────────┐
│           WASM Bridge (TypeScript)           │
│  Serializes state → WASM; routes audio msgs  │
└─────────────────┬───────────────────────────┘
                  │  Emscripten-generated bindings
┌─────────────────▼───────────────────────────┐
│           DSP Core (C++17 → WASM)            │
│  Sequencer engine / Synth voices / Effects   │
│  Runs inside AudioWorklet (dedicated thread) │
└─────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Status |
|---|---|---|
| Frontend framework | Svelte 5 (runes) | DECIDED |
| Build tool | Vite | DECIDED |
| DSP language | C++17 | DECIDED |
| WASM compiler | Emscripten | DECIDED |
| Audio runtime | Web Audio API + AudioWorklet | DECIDED |
| Styling | Plain CSS (no utility framework) | DECIDED |
| Type safety | TypeScript (strict) | DECIDED |
| Package manager | pnpm | DECIDED |

## Key Architectural Decisions

See [adr/](./adr/) for full rationale.

- **DSP in WASM** — Enables reuse on iOS and VST; avoids JS GC pauses in the audio thread. → [adr/001-wasm-dsp.md](./adr/001-wasm-dsp.md)

## Threading Model

```
Main thread:     Svelte UI + user input
AudioWorklet:    WASM DSP (runs at audio sample rate, isolated)
SharedArrayBuffer: State exchange between main ↔ audio thread
```

The AudioWorklet has no access to the DOM.
All communication crosses the thread boundary via `SharedArrayBuffer` + `Atomics`, or `MessagePort` for non-realtime messages.

## Directory Structure (planned)

```
/
├── src/
│   ├── lib/
│   │   ├── components/     ← Svelte UI components
│   │   ├── stores/         ← Svelte 5 runes-based state
│   │   └── wasm/           ← WASM bridge (TypeScript)
│   ├── dsp/                ← C++ source (compiled separately)
│   │   ├── engine/         ← Sequencer + voice manager
│   │   ├── synth/          ← Individual synth implementations
│   │   └── fx/             ← Effects chain
│   └── routes/             ← SvelteKit routes (if used)
├── docs/
│   └── ai/                 ← This directory
└── wasm/                   ← Compiled WASM artifacts (gitignored build output)
```
