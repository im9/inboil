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
- **Pattern persistence** (SUPERSEDED) — Replaced by ADR 020 (Data Persistence). → [adr/007-pattern-persistence.md](./adr/007-pattern-persistence.md)
- **Granular enhancements** (IMPLEMENTED) — Pitch shift, reverse grains, scatter, freeze. → [adr/008-granular-enhancements.md](./adr/008-granular-enhancements.md)
- **Pattern chain** (SUPERSEDED) — Replaced by scene graph (ADR 044). → [adr/013-pattern-chain.md](./adr/013-pattern-chain.md)
- **Parameter locks** (IMPLEMENTED) — Per-step voice parameter overrides. → [adr/014-parameter-locks.md](./adr/014-parameter-locks.md)
- **Note duration, slide, ADSR** (IMPLEMENTED) — Gate length, legato, amp envelope. → [adr/021-note-duration-slide-adsr.md](./adr/021-note-duration-slide-adsr.md)
- **Lead arpeggiator** (IMPLEMENTED) — 5-mode arp with chord/octave range. → [adr/022-lead-arpeggiator.md](./adr/022-lead-arpeggiator.md)
- **Oscilloscope** (IMPLEMENTED) — Waveform display in header. → [adr/023-oscilloscope.md](./adr/023-oscilloscope.md)
- **Pattern copy & paste** (IMPLEMENTED) — CPY/PST/CLR operations. → [adr/025-pattern-copy-paste.md](./adr/025-pattern-copy-paste.md)
- **Step probability** (IMPLEMENTED) — Per-step chance (0–100%). → [adr/028-step-probability.md](./adr/028-step-probability.md)
- **Undo / redo** (IMPLEMENTED) — Snapshot-based undo (Ctrl+Z / Cmd+Z). → [adr/029-undo-redo.md](./adr/029-undo-redo.md)
- **Audio & MIDI export** (IMPLEMENTED) — WAV recording via MediaRecorder, MIDI Type 1 export. → [adr/030-audio-midi-export.md](./adr/030-audio-midi-export.md)
- **Virtual MIDI keyboard** (IMPLEMENTED, Phase 1) — PC keyboard audition mode. → [adr/031-virtual-keyboard.md](./adr/031-virtual-keyboard.md)
- **Mobile velocity/chance editing** (IMPLEMENTED) — 3-mode tabs (STEP/VEL/CHNC). → [adr/033-mobile-velocity-editing.md](./adr/033-mobile-velocity-editing.md)
- **Dockable panel** (IMPLEMENTED) — Right-side param dock with minimize toggle. → [adr/036-remove-footer-dockable-panel.md](./adr/036-remove-footer-dockable-panel.md)
- **Solo** (IMPLEMENTED) — Per-track additive solo with indicator. → [adr/039-solo.md](./adr/039-solo.md)
- **Section-based arrangement** (IMPLEMENTED) — Song → Section → Cell flat model. → [adr/042-section-based-arrangement.md](./adr/042-section-based-arrangement.md)
- **Matrix view** (IMPLEMENTED) — Pattern pool browser sidebar. → [adr/043-matrix-view.md](./adr/043-matrix-view.md)
- **Scene graph** (IMPLEMENTED) — Node-based directed graph for arrangement. → [adr/044-scene-graph.md](./adr/044-scene-graph.md)
- **Decouple playback from view** (IMPLEMENTED) — Separate `playback.mode` from `ui.phraseView`. → [adr/045-decouple-playback-from-view.md](./adr/045-decouple-playback-from-view.md)
- **Overlay sheet model** (IMPLEMENTED) — Pattern/FX/EQ as overlay sheets over SceneView. → [adr/054-split-view.md](./adr/054-split-view.md)
- **Dock minimize & sidebar separation** (IMPLEMENTED) — DockPanel minimize toggle, sidebar as fixed drawer. → [adr/055-dock-sidebar-separation.md](./adr/055-dock-sidebar-separation.md)
- **Pattern toolbar** (IMPLEMENTED) — RAND/KEY/VKBD in pattern sheet, PerfBar merged into AppHeader sub-header. → [adr/057-pattern-toolbar.md](./adr/057-pattern-toolbar.md)
- **Cross-category voice assignment** (IMPLEMENTED) — Any voice on any track, drill-down picker. → [adr/058-cross-category-voice.md](./adr/058-cross-category-voice.md)
- **Sampler** (IMPLEMENTED) — SamplerVoice + user sample loading; Crash/Ride in drum category. → [adr/012-sampler.md](./adr/012-sampler.md)
- **Full synth engines** (IMPLEMENTED) — Wavetable osc, SVF, WT synth, factory presets. → [adr/011-synth-engines.md](./adr/011-synth-engines.md)
- **Scene multi-select** (IMPLEMENTED) — Rectangle select, group drag, alignment tools, multi-copy/paste. → [adr/059-scene-multi-select.md](./adr/059-scene-multi-select.md)
- **Per-pattern voice assignment** (IMPLEMENTED) — voiceId + name moved from Track to Cell. → [adr/062-per-pattern-voice.md](./adr/062-per-pattern-voice.md)
- **Scene node decorators** (IMPLEMENTED) — Snap-attach function nodes to patterns as decorators. → [adr/066-scene-decorators.md](./adr/066-scene-decorators.md)
- **Piano roll drawing & chord brush** (IMPLEMENTED) — Pen draw, chord/strum brush, eraser. → [adr/067-piano-roll-drawing.md](./adr/067-piano-roll-drawing.md)
- **4-operator FM synth** (IMPLEMENTED) — 4-op, 8 algorithms, 12-voice poly. → [adr/068-fm-synth.md](./adr/068-fm-synth.md)
- **FX flavours** (IMPLEMENTED) — Tape delay, shimmer, stutter, per-pattern FX variant. → [adr/075-fx-improvements.md](./adr/075-fx-improvements.md)
- **Per-track insert FX** (IMPLEMENTED) — LiteReverb, insert verb/delay/glitch per track. → [adr/077-per-track-insert-fx.md](./adr/077-per-track-insert-fx.md)
- **Generative scene nodes** (IMPLEMENTED) — Turing Machine, Quantizer, Tonnetz. → [adr/078-generative-nodes.md](./adr/078-generative-nodes.md)
- **Cell.trackId** (IMPLEMENTED) — Explicit trackId on Cell, decouples array position from identity. → [adr/079-cell-trackid.md](./adr/079-cell-trackid.md)
- **Hardware MIDI input** (IMPLEMENTED) — Web MIDI API, USB + BLE MIDI. → [adr/081-midi-input.md](./adr/081-midi-input.md)
- **System sidebar tabs & REC** (IMPLEMENTED) — PROJECT/SETTINGS tabs, REC button, MIDI export. → [adr/085-system-sidebar-rec.md](./adr/085-system-sidebar-rec.md)
- **Engine–state decoupling** (IMPLEMENTED) — Engine receives all state via args, not imports. → [adr/086-engine-state-decoupling.md](./adr/086-engine-state-decoupling.md)

## Module Dependency Notes

**engine.ts is decoupled from reactive state (ADR 086).** `engine.ts` imports only types from `state.svelte.ts` — all reactive state (`fxFlavours`, `masterPad`, `soloTracks`, `masterLevels`) is passed via `EngineContext` arguments and `EngineCallbacks` at init time.

`state.svelte.ts` uses a dynamic import for `engine.ts` in `restoreSamples()` — this is intentional for lazy loading (engine may not be initialized at restore time). Vite emits a warning about mixed dynamic/static imports; this is harmless since other modules statically import `engine.ts` into the main chunk.

## Threading Model

```
Main thread:     Svelte UI + user input + state management ($state runes)
AudioWorklet:    TypeScript DSP (synth voices, effects, sequencer clock)
Communication:   MessagePort (postMessage) — bidirectional
```

The AudioWorklet has no access to the DOM.
All communication crosses the thread boundary via `MessagePort`:
- **UI → Worklet:** `setPattern` (full state snapshot incl. FX, perf, fxPad), `play`, `stop`, `setBpm`, `triggerNote`, `releaseNote`, `loadSample`
- **Worklet → UI:** `step` event with playhead positions array, `levels` event with peak/GR/CPU metering

No `SharedArrayBuffer` is used in the current implementation. The UI sends the entire pattern + effects + performance state as a serialized object on every reactive change. This is simple and correct for the current scale (up to 16 tracks × 64 steps max).

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
│   │   │   ├── TrackerView.svelte ← M8-style vertical tracker editor
│   │   │   ├── SceneView.svelte  ← Node-based scene graph canvas
│   │   │   ├── MatrixView.svelte ← Pattern pool browser sidebar
│   │   │   ├── SectionNav.svelte ← (deprecated) Linear section strip, mobile only
│   │   │   ├── DockPanel.svelte  ← Right dock: synth param knobs, preset browser, minimizable
│   │   │   ├── PianoRoll.svelte  ← Note bar editor for melodic tracks (poly chord support)
│   │   │   ├── PatternToolbar.svelte ← Pattern sheet toolbar (RAND, KEY, VKBD)
│   │   │   ├── PerfBubble.svelte ← Mobile floating FILL/REV/BRK bubble menu
│   │   │   ├── PerfButtons.svelte ← Shared FILL/REV/BRK button strip
│   │   │   ├── FxPad.svelte      ← FX XY pad, audio visualizer, per-track sends
│   │   │   ├── MasterView.svelte ← Master bus VU meter + audio-reactive visuals
│   │   │   ├── FilterView.svelte ← EQ/filter XY pad (FILTER, LOW, MID, HIGH nodes)
│   │   │   ├── MobileTrackView.svelte ← Mobile: calculator-style steps + VEL/CHNC tabs
│   │   │   ├── MobileParamOverlay.svelte ← Mobile: bottom-sheet param overlay
│   │   │   ├── TrackSelector.svelte ← Track dot selector (mobile FX/EQ views)
│   │   │   ├── WelcomeOverlay.svelte ← First-visit welcome overlay
│   │   │   ├── Oscilloscope.svelte ← Waveform display in header
│   │   │   ├── Sidebar.svelte    ← Help / System settings panel (fixed right drawer)
│   │   │   ├── Knob.svelte       ← SVG rotary knob control
│   │   │   ├── SplitFlap.svelte  ← パタパタ split-flap display
│   │   │   ├── SceneCanvas.svelte ← Canvas layer for scene edges/arrowheads
│   │   │   ├── SceneToolbar.svelte ← Scene view toolbar (add node, zoom, layout)
│   │   │   ├── SceneLabels.svelte ← Free-floating canvas text labels
│   │   │   ├── SceneBubbleMenu.svelte ← Radial menu for adding scene nodes
│   │   │   ├── SceneNodePopup.svelte ← Node detail popup (rename, params)
│   │   │   ├── AlgoGraph.svelte ← FM algorithm topology visualization (ADR 068)
│   │   │   ├── AutomationEditor.svelte ← Automation curve editor (ADR 053)
│   │   │   ├── DockAutomationEditor.svelte ← Dock inline automation editor
│   │   │   ├── DockDecoratorEditor.svelte ← Dock decorator knobs (ADR 069)
│   │   │   ├── DockGenerativeEditor.svelte ← Dock generative node editor (ADR 078)
│   │   │   ├── DockPresetBrowser.svelte ← Factory preset browser (WT/FM)
│   │   │   ├── DockTrackEditor.svelte ← Track param knobs, send/mixer
│   │   │   ├── EnvGraph.svelte  ← ADSR envelope visualization
│   │   │   ├── FxBubbleMenu.svelte ← FX node radial menu
│   │   │   ├── WaveGraph.svelte ← Wavetable preview visualization
│   │   │   ├── MiniSequencer.svelte ← Compact sequencer (unused, future mobile)
│   │   │   └── SceneRibbon.svelte ← Playback scrubber (unused, future mobile)
│   │   ├── audio/
│   │   │   ├── engine.ts         ← Main-thread audio engine API
│   │   │   ├── worklet-processor.ts ← AudioWorklet entry point + sequencer
│   │   │   └── dsp/              ← DSP modules (imported by worklet)
│   │   │       ├── types.ts      ← Message types (WorkletPattern, etc.)
│   │   │       ├── filters.ts    ← ResonantLP, BiquadHP, SVFilter, DJFilter, PeakingEQ, ADSR
│   │   │       ├── effects.ts    ← Reverb, delay, ducker, compressor, limiter, granular
│   │   │       └── voices.ts     ← Voice interface, all synth voices, makeVoice
│   │   ├── factory.ts            ← Factory patterns, track defaults, song builder
│   │   ├── state.svelte.ts       ← Reactive state (Svelte 5 runes)
│   │   ├── paramDefs.ts          ← Synth parameter definitions
│   │   ├── paramHelpers.ts       ← Knob value/change helpers, p-lock check
│   │   ├── presets.ts            ← Factory presets for WT (30 presets) and FM (20 presets)
│   │   ├── constants.ts          ← Default values (DEFAULT_PERF, etc.)
│   │   ├── sceneActions.ts       ← Scene graph CRUD, layout, clipboard
│   │   ├── sceneData.ts          ← Scene clone/restore, migration helpers
│   │   ├── sectionActions.ts     ← Pattern/section operations, duplicate, copy/paste
│   │   ├── songClone.ts          ← Pure data clone/restore for Song serialization
│   │   ├── generative.ts         ← Turing Machine, Quantizer, Tonnetz algorithms
│   │   ├── midiInput.ts          ← Web MIDI API integration (ADR 081)
│   │   └── storage.ts            ← IndexedDB access layer (ADR 020)
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
      → engine.sendPatternByIndex(song, perf, fxPad, false, patternIndex)
        → MessagePort.postMessage({ type: 'setPattern', pattern: {...} })
          → AudioWorklet applies new state on next process() cycle

AudioWorklet step advance
  → MessagePort.postMessage({ type: 'step', playheads: [...] })
    → engine.onStep callback
      → playback.playheads[] updated ($state)
        → Svelte re-renders step grid with playhead indicators
```
