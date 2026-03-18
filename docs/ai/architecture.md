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
| C++ DSP core | C++17 via Emscripten | SUPERSEDED (ADR 001) |

## Key Architectural Decisions

See [adr/](./adr/) for full rationale.

- **DSP in WASM** (SUPERSEDED) — Original C++ prototype removed; TypeScript AudioWorklet is the current DSP layer. → [adr/001-wasm-dsp.md](./adr/001-wasm-dsp.md)
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
- **Audio Pool** (IMPLEMENTED) — OPFS-based sample library, 111 factory samples (incl. Grand Piano pack), inline browser with search/audition. → [adr/archive/104-audio-pool.md](./adr/archive/104-audio-pool.md)
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
- **UI → Worklet:** `setPattern` (full state snapshot incl. FX, perf, fxPad), `play`, `stop`, `setBpm`, `triggerNote`, `releaseNote`, `releaseNoteByPitch`, `loadSample`, `loadZones`
- **Worklet → UI:** `step` event with playhead positions array, `levels` event with peak/GR/CPU metering

No `SharedArrayBuffer` is used in the current implementation. The UI sends the entire pattern + effects + performance state as a serialized object on every reactive change. This is simple and correct for the current scale (up to 16 tracks × 64 steps max).

## Directory Structure

```
/
├── src/
│   ├── App.svelte                  ← Root component (layout, engine wiring, initPool)
│   ├── main.ts                     ← Entry point
│   ├── app.css                     ← Global styles (reset, tokens, base)
│   ├── lib/
│   │   ├── components/ (49 files)  ← Svelte 5 UI components
│   │   │   ├── AppHeader.svelte    ← BPM, transport, PAT navigation, CPY/PST/CLR
│   │   │   ├── StepGrid.svelte     ← Desktop step sequencer grid
│   │   │   ├── TrackerView.svelte  ← M8-style vertical tracker editor
│   │   │   ├── PianoRoll.svelte    ← Note bar editor for melodic tracks (poly chord support)
│   │   │   ├── SceneView.svelte    ← Node-based scene graph canvas
│   │   │   ├── SceneCanvas.svelte  ← Canvas layer for scene edges/arrowheads
│   │   │   ├── SceneToolbar.svelte ← Scene view toolbar (add node, zoom, layout)
│   │   │   ├── SceneLabels.svelte  ← Free-floating canvas text labels
│   │   │   ├── SceneBubbleMenu.svelte ← Radial menu for adding scene nodes
│   │   │   ├── SceneNodePopup.svelte ← Node detail popup (rename, params)
│   │   │   ├── MatrixView.svelte   ← Pattern pool browser sidebar
│   │   │   ├── DockPanel.svelte    ← Right dock: synth param knobs, preset browser, minimizable
│   │   │   ├── DockTrackEditor.svelte ← Track param knobs, send/mixer, sample LOAD/POOL
│   │   │   ├── DockPoolBrowser.svelte ← Inline audio pool browser (ADR 104)
│   │   │   ├── DockPresetBrowser.svelte ← Factory preset browser (WT/FM)
│   │   │   ├── DockDecoratorEditor.svelte ← Dock decorator knobs (ADR 069)
│   │   │   ├── DockGenerativeEditor.svelte ← Dock generative node editor (ADR 078)
│   │   │   ├── DockAutomationEditor.svelte ← Dock inline automation editor
│   │   │   ├── DockNavigator.svelte  ← Scene BFS navigator (ADR 070)
│   │   │   ├── DockFxControls.svelte ← FX knobs/toggles/flavours
│   │   │   ├── DockEqControls.svelte ← EQ band controls (freq/gain/Q)
│   │   │   ├── DockMasterControls.svelte ← Master gain/comp/duck/return
│   │   │   ├── AutomationEditor.svelte ← Automation curve editor (ADR 053)
│   │   │   ├── PatternToolbar.svelte ← Pattern sheet toolbar (RAND, KEY, VKBD)
│   │   │   ├── PerfButtons.svelte  ← Shared FILL/REV/BRK button strip
│   │   │   ├── FxPad.svelte        ← FX XY pad, audio visualizer, per-track sends
│   │   │   ├── FxBubbleMenu.svelte ← FX node radial menu
│   │   │   ├── MasterView.svelte   ← Master bus VU meter + audio-reactive visuals
│   │   │   ├── FilterView.svelte   ← EQ/filter XY pad (FILTER, LOW, MID, HIGH nodes)
│   │   │   ├── Sidebar.svelte      ← Help / System settings panel (fixed right drawer)
│   │   │   ├── SidebarHelp.svelte  ← Help content (bilingual, searchable)
│   │   │   ├── SidebarProject.svelte ← Project management (save/load/export)
│   │   │   ├── SidebarSettings.svelte ← System preferences
│   │   │   ├── MobileTrackView.svelte ← Mobile: calculator-style steps + VEL/CHNC tabs
│   │   │   ├── MobileParamOverlay.svelte ← Mobile: bottom-sheet param overlay
│   │   │   ├── MobileMatrixView.svelte ← Mobile pattern pool browser (ADR 095)
│   │   │   ├── MobilePerfSheet.svelte ← Mobile Kaoss Pad (4 tabs, accelerometer/gyroscope)
│   │   │   ├── MobileSceneRibbon.svelte ← Mobile scene playback ribbon (future)
│   │   │   ├── WelcomeOverlay.svelte ← First-visit welcome overlay
│   │   │   ├── Oscilloscope.svelte ← Waveform display in header
│   │   │   ├── AlgoGraph.svelte    ← FM algorithm topology visualization (ADR 068)
│   │   │   ├── EnvGraph.svelte     ← ADSR envelope visualization
│   │   │   ├── WaveGraph.svelte    ← Wavetable preview visualization
│   │   │   ├── Knob.svelte         ← SVG rotary knob control
│   │   │   ├── ErrorDialog.svelte  ← Fatal error dialog with error codes (ADR 091)
│   │   │   ├── ErrorToast.svelte   ← Transient error/info notification
│   │   │   ├── MiniSequencer.svelte ← Compact sequencer (unused, future mobile)
│   │   │   └── SceneRibbon.svelte  ← Playback scrubber (unused, future mobile)
│   │   ├── audio/
│   │   │   ├── engine.ts           ← Main-thread audio engine API
│   │   │   ├── worklet-processor.ts ← AudioWorklet entry point + sequencer
│   │   │   └── dsp/                ← DSP modules (imported by worklet)
│   │   │       ├── types.ts        ← Message types (WorkletPattern, etc.)
│   │   │       ├── filters.ts      ← ResonantLP, BiquadHP, SVFilter, DJFilter, PeakingEQ, ADSR
│   │   │       ├── effects.ts      ← Reverb, delay, ducker, compressor, limiter, granular
│   │   │       ├── drums.ts        ← Drum voice implementations
│   │   │       ├── bass.ts         ← Bass voice implementations
│   │   │       ├── melodic.ts      ← Melodic voice implementations (Lead, FM, WT)
│   │   │       ├── sampler.ts      ← Sampler/PolySampler voices
│   │   │       └── voices.ts       ← Voice registry + re-export (makeVoice)
│   │   ├── multiDevice/            ← WebRTC multi-device jam (ADR 019)
│   │   │   ├── index.ts            ← Public API (host/guest handlers, signaling)
│   │   │   ├── host.ts / guest.ts  ← Role-specific WebRTC logic
│   │   │   ├── chunking.ts         ← DataChannel message chunking
│   │   │   ├── deltaSync.ts        ← Incremental state sync
│   │   │   └── protocol.ts         ← Wire format definitions
│   │   ├── types.ts                ← Core data types (Song, Pattern, Cell, Trig, Track)
│   │   ├── state.svelte.ts         ← Reactive state (Svelte 5 runes)
│   │   ├── toast.svelte.ts         ← Toast notification state
│   │   ├── paramDefs.ts            ← Synth parameter definitions
│   │   ├── paramHelpers.ts         ← Knob value/change helpers, p-lock check
│   │   ├── presets.ts              ← Factory presets for WT (30) and FM (20)
│   │   ├── constants.ts            ← Default values (DEFAULT_PERF, FX flavours, etc.)
│   │   ├── factory.ts              ← Factory patterns, track defaults, song builder
│   │   ├── demo.ts                 ← Demo song data
│   │   ├── sceneActions.ts         ← Scene graph CRUD, layout, clipboard
│   │   ├── sceneData.ts            ← Scene clone/restore, migration helpers
│   │   ├── sceneGeometry.ts        ← Scene node geometry calculations
│   │   ├── scenePlayback.ts        ← Scene graph traversal engine
│   │   ├── sectionActions.ts       ← Pattern/section operations, copy/paste
│   │   ├── stepActions.ts          ← Step-level mutations (toggle, velocity, etc.)
│   │   ├── songClone.ts            ← Pure data clone/restore for Song serialization
│   │   ├── generative.ts           ← Turing Machine, Quantizer, Tonnetz algorithms
│   │   ├── automation.ts           ← Automation curve evaluation
│   │   ├── automationDraw.ts       ← Automation drawing/editing helpers
│   │   ├── randomize.ts            ← Pattern randomization
│   │   ├── audioPool.ts            ← OPFS audio pool: factory install, import, browse (ADR 104)
│   │   ├── storage.ts              ← IndexedDB access layer (ADR 020)
│   │   ├── compat.ts               ← Save format migration / compatibility
│   │   ├── midi.ts                 ← Web MIDI API integration (ADR 081)
│   │   ├── midiExport.ts           ← MIDI Type 1 export
│   │   ├── wavExport.ts            ← WAV recording capture
│   │   ├── icons.ts                ← SVG icon definitions
│   │   ├── padHelpers.ts           ← XY pad coordinate helpers
│   │   └── qr.ts                   ← QR code generation (multi-device)
├── public/
│   └── samples/                    ← Factory sample WebM files (111) + manifest
├── docs/
│   └── ai/                         ← This directory
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
