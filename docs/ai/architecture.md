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

- **DSP in WASM (long-term)** — Enables reuse on iOS and VST. C++ exists, not yet integrated. → [adr/001-wasm-dsp.md](./adr/001-wasm-dsp.md)
- **TypeScript AudioWorklet** (IMPLEMENTED) — Rapid iteration; WASM integration deferred. → [adr/002-ts-worklet.md](./adr/002-ts-worklet.md)
- **BPM-synced delay** (IMPLEMENTED) — Beat fraction → ms at send time. → [adr/003-bpm-synced-delay.md](./adr/003-bpm-synced-delay.md)
- **Queued pattern switching** (IMPLEMENTED) — Queue during playback, apply at loop boundary. → [adr/004-queued-pattern-switch.md](./adr/004-queued-pattern-switch.md)
- **Swing / shuffle** (IMPLEMENTED) — Global swing parameter for groove timing. → [adr/005-swing.md](./adr/005-swing.md)
- **Per-step velocity editing** (IMPLEMENTED) — Bar overlay + mobile 3-mode tabs. → [adr/006-velocity-editing.md](./adr/006-velocity-editing.md)
- **Pattern persistence** (PROPOSED) — localStorage save/load for patterns. → [adr/007-pattern-persistence.md](./adr/007-pattern-persistence.md)
- **Granular enhancements** (IMPLEMENTED) — Pitch shift, reverse grains, scatter, freeze. → [adr/008-granular-enhancements.md](./adr/008-granular-enhancements.md)
- **Pattern chain** (IMPLEMENTED) — Sequential pattern playback with per-entry FX/perf. → [adr/013-pattern-chain.md](./adr/013-pattern-chain.md)
- **Parameter locks** (IMPLEMENTED) — Per-step voice parameter overrides. → [adr/014-parameter-locks.md](./adr/014-parameter-locks.md)
- **Note duration, slide, ADSR** (IMPLEMENTED) — Gate length, legato, amp envelope. → [adr/021-note-duration-slide-adsr.md](./adr/021-note-duration-slide-adsr.md)
- **Lead arpeggiator** (IMPLEMENTED) — 5-mode arp with chord/octave range. → [adr/022-lead-arpeggiator.md](./adr/022-lead-arpeggiator.md)
- **Oscilloscope** (IMPLEMENTED) — Waveform display in header. → [adr/023-oscilloscope.md](./adr/023-oscilloscope.md)
- **Pattern copy & paste** (IMPLEMENTED) — CPY/PST/CLR operations. → [adr/025-pattern-copy-paste.md](./adr/025-pattern-copy-paste.md)
- **Step probability** (IMPLEMENTED) — Per-step chance (0–100%). → [adr/028-step-probability.md](./adr/028-step-probability.md)
- **Undo / redo** (IMPLEMENTED) — Snapshot-based undo (Ctrl+Z / Cmd+Z). → [adr/029-undo-redo.md](./adr/029-undo-redo.md)
- **Audio & MIDI export** (PROPOSED) — Offline bounce, real-time recording, MIDI file export. → [adr/030-audio-midi-export.md](./adr/030-audio-midi-export.md)
- **Virtual MIDI keyboard** (IMPLEMENTED, Phase 1) — PC keyboard audition mode. → [adr/031-virtual-keyboard.md](./adr/031-virtual-keyboard.md)
- **Song View** (PROPOSED) — M8-style Phrase/Chain/Song structure. → [adr/032-session-view.md](./adr/032-session-view.md)
- **Mobile velocity/chance editing** (IMPLEMENTED) — 3-mode tabs (STEP/VEL/CHNC). → [adr/033-mobile-velocity-editing.md](./adr/033-mobile-velocity-editing.md)
- **Dockable panel** (IMPLEMENTED) — Unified PARAM/HELP/SYS dock (right or bottom). → [adr/036-remove-footer-dockable-panel.md](./adr/036-remove-footer-dockable-panel.md)
- **Solo** (IMPLEMENTED) — Per-track additive solo with indicator. → [adr/039-solo.md](./adr/039-solo.md)

## Threading Model

```
Main thread:     Svelte UI + user input + state management ($state runes)
AudioWorklet:    TypeScript DSP (synth voices, effects, sequencer clock)
Communication:   MessagePort (postMessage) — bidirectional
```

The AudioWorklet has no access to the DOM.
All communication crosses the thread boundary via `MessagePort`:
- **UI → Worklet:** `setPattern` (full state snapshot incl. FX, perf, fxPad), `play`, `stop`, `setBpm`, `triggerNote`, `releaseNote`
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
│   │   │   ├── AppHeader.svelte  ← BPM, transport, PAT navigation, CPY/PST/CLR
│   │   │   ├── StepGrid.svelte   ← Desktop step sequencer grid
│   │   │   ├── DockPanel.svelte  ← Right/bottom dock: PARAM/HELP/SYS modes
│   │   │   ├── PianoRoll.svelte  ← Note bar editor for melodic tracks
│   │   │   ├── PerfBar.svelte    ← Perf controls (KEY, OCT, SWG, FILL/REV/BRK, VKBD)
│   │   │   ├── PerfBubble.svelte ← Mobile floating FILL/REV/BRK bubble menu
│   │   │   ├── PerfButtons.svelte ← Shared FILL/REV/BRK button strip
│   │   │   ├── FxPad.svelte      ← FX XY pad, audio visualizer, per-track sends
│   │   │   ├── FilterView.svelte ← EQ/filter XY pad (FILTER, LOW, MID, HIGH nodes)
│   │   │   ├── ChainView.svelte  ← Pattern chain editor
│   │   │   ├── MobileTrackView.svelte ← Mobile: calculator-style steps + VEL/CHNC tabs
│   │   │   ├── MobileParamOverlay.svelte ← Mobile: bottom-sheet param overlay
│   │   │   ├── TrackSelector.svelte ← Track dot selector (mobile FX/EQ views)
│   │   │   ├── Oscilloscope.svelte ← Waveform display in header
│   │   │   ├── Sidebar.svelte    ← Help / System settings panel (mobile)
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
│   │   ├── paramDefs.ts          ← Synth parameter definitions
│   │   └── constants.ts          ← Default values (DEFAULT_PERF, etc.)
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
