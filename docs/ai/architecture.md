# Architecture

## Layer Diagram

```
┌─────────────────────────────────────────────┐
│              Svelte 5 UI (browser)           │
│  Components / $state / $derived / $effect    │
└─────────────────┬───────────────────────────┘
                  │  engine.ts (sendPattern / onStep / getAnalyser)
┌─────────────────▼───────────────────────────┐
│         AudioWorklet Bridge (TypeScript)     │
│  Serializes state → MessagePort commands     │
└─────────────────┬───────────────────────────┘
                  │  MessagePort postMessage
┌─────────────────▼───────────────────────────┐
│        AudioWorklet Processor (TypeScript)   │
│  Sequencer clock / Synth voices / Effects    │
│  Split into dsp/ modules, runs on audio thrd │
└─────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Status |
|---|---|---|
| Frontend framework | Svelte 5 (runes) | DECIDED |
| Build tool | Vite | DECIDED |
| DSP language | TypeScript (AudioWorklet) | DECIDED |
| Audio runtime | Web Audio API + AudioWorklet | DECIDED |
| Styling | Plain CSS (scoped, no utility framework) | DECIDED |
| Type safety | TypeScript (strict) | DECIDED |
| Package manager | pnpm | DECIDED |
| C++ DSP core | C++17 via Emscripten (parallel, not yet integrated) | IN PROGRESS |

## Key Architectural Decisions

See [adr/](./adr/) for full rationale.

- **DSP in WASM (long-term)** — Enables reuse on iOS and VST. → [adr/001-wasm-dsp.md](./adr/001-wasm-dsp.md)
- **TypeScript AudioWorklet (current)** — Rapid iteration; WASM integration deferred. → [adr/002-ts-worklet.md](./adr/002-ts-worklet.md)
- **BPM-synced delay** — Delay time stored as beat fraction, computed to ms at send time. → [adr/003-bpm-synced-delay.md](./adr/003-bpm-synced-delay.md)
- **Queued pattern switching** — Pattern changes queue during playback, apply at loop boundary. → [adr/004-queued-pattern-switch.md](./adr/004-queued-pattern-switch.md)

## Threading Model

```
Main thread:     Svelte UI + user input + state management ($state runes)
AudioWorklet:    TypeScript DSP (synth voices, effects, sequencer clock)
Communication:   MessagePort (postMessage) — bidirectional
```

The AudioWorklet has no access to the DOM.
All communication crosses the thread boundary via `MessagePort`:
- **UI → Worklet:** `setPattern` (full state snapshot incl. FX, perf, fxPad), `play`, `stop`, `setBpm`
- **Worklet → UI:** `step` event with playhead positions array

No `SharedArrayBuffer` is used in the current implementation. The UI sends the entire pattern + effects + performance state as a serialized object on every reactive change. This is simple and correct for the current scale (8 tracks × 64 steps max).

## Directory Structure

```
/
├── src/
│   ├── App.svelte                ← Root component (layout, engine wiring)
│   ├── main.ts                   ← Entry point
│   ├── app.css                   ← Global styles (reset, tokens, base)
│   ├── lib/
│   │   ├── components/           ← Svelte 5 UI components
│   │   │   ├── AppHeader.svelte  ← BPM, transport, PAT navigation
│   │   │   ├── StepGrid.svelte   ← Desktop step sequencer grid
│   │   │   ├── ParamPanel.svelte ← Footer: synth knobs, sends, FX
│   │   │   ├── PianoRoll.svelte  ← Note editor for melodic tracks
│   │   │   ├── PerfBar.svelte    ← Performance controls (KEY, OCT, EQ, BRK…)
│   │   │   ├── FxPad.svelte     ← FX XY pad, audio visualizer, per-track sends
│   │   │   ├── MobileTrackView.svelte ← Mobile: calculator-style steps
│   │   │   ├── Knob.svelte       ← SVG rotary knob control
│   │   │   └── SplitFlap.svelte  ← パタパタ split-flap display
│   │   ├── audio/
│   │   │   ├── engine.ts         ← Main-thread audio engine API
│   │   │   ├── worklet-processor.ts ← AudioWorklet entry point + sequencer
│   │   │   └── dsp/              ← DSP modules (imported by worklet)
│   │   │       ├── types.ts      ← Message types (WorkletPattern, etc.)
│   │   │       ├── filters.ts    ← ResonantLP, BiquadHP, ADSR
│   │   │       ├── effects.ts    ← Reverb, delay, ducker, compressor, limiter, granular
│   │   │       └── voices.ts     ← Voice interface, all synth voices, makeVoice
│   │   ├── state.svelte.ts       ← Reactive state (Svelte 5 runes)
│   │   └── paramDefs.ts          ← Synth parameter definitions
│   └── dsp/                      ← C++ source (compiled separately, WIP)
│       ├── CMakeLists.txt
│       ├── engine/               ← C++ sequencer + voice manager
│       ├── synth/                ← C++ synth implementations
│       ├── fx/                   ← C++ effects chain
│       └── wasm/                 ← Emscripten bindings
├── docs/
│   └── ai/                       ← This directory
└── index.html
```

## State Flow

```
User action (click/drag)
  → Svelte $state mutation (state.svelte.ts)
    → $effect in App.svelte detects change via JSON.stringify
      → engine.sendPattern(pattern, effects, perf, fxPad)
        → MessagePort.postMessage({ type: 'setPattern', pattern: {...} })
          → AudioWorklet applies new state on next process() cycle

AudioWorklet step advance
  → MessagePort.postMessage({ type: 'step', playheads: [...] })
    → engine.onStep callback
      → playback.playheads[] updated ($state)
        → Svelte re-renders step grid with playhead indicators
```
