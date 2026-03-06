# Glossary

Domain-specific terms used throughout the docs. When a term appears in specs, it means exactly what is defined here.

## Sequencer Terms

| Term | Definition |
|---|---|
| **Song** | Top-level container. Holds BPM, rootNote, tracks (instrument config), patterns (pool), sections, scene graph. |
| **Pattern** | A reusable unit of music: string id + name + 8 cells (one per track). Stored in Song.patterns pool. |
| **Cell** | Step data for one track in one pattern: steps, trigs, voiceParams, FX send levels. |
| **Track** | Instrument configuration only: id, name, synthType, muted, volume, pan. No step data — that's in Cell. |
| **Section** | Arrangement slot referencing a pattern by index, with optional metadata (repeats, key, oct, FX). |
| **Scene** | Node-based directed graph for arrangement. Contains SceneNodes and SceneEdges. See ADR 044. |
| **SceneNode** | A node on the scene canvas: pattern, transpose, tempo, repeat, probability, or fx type. |
| **SceneEdge** | Directed connection between scene nodes with playback order. |
| **Step** | One time slot in a cell's grid. 0-indexed internally, 1-indexed in UI. |
| **Trig** | An active step that fires the synth. A step with no trig is "empty". |
| **Polymetric** | Cells running with different step counts, causing their loops to phase against each other. |
| **Playhead** | The current playing step position, advancing with the clock. One per track. |
| **BPM** | Beats per minute. Controls the global clock rate (stored in Song). One step = one 16th note. |
| **P-Lock** | Parameter Lock. Per-step voice parameter override stored in `trig.paramLocks`. See ADR 014. |
| **Chance** | Per-step trigger probability (0.0–1.0). `undefined` = 100%. See ADR 028. |
| **Duration** | Note gate length in steps (1–16). Controls how long a voice sustains before `noteOff()`. |
| **Slide** | Legato connection between consecutive notes. TB303: 60ms glide. MoogVoice: instant pitch change. |
| **Undo** | Snapshot-based undo/redo stack (max 50). `pushUndo()` before mutations, debounced 500ms. |

## Synthesis Terms

| Term | Definition |
|---|---|
| **VCO** | Voltage-Controlled Oscillator. The tone generator in subtractive synthesis. |
| **VCF** | Voltage-Controlled Filter. Shapes the frequency content of the oscillator. |
| **VCA** | Voltage-Controlled Amplifier. Controls the volume envelope. |
| **ADSR** | Attack, Decay, Sustain, Release — the four stages of an amplitude envelope. |
| **EG** | Envelope Generator. Produces a time-varying control signal for VCF or VCA. |
| **Ladder filter** | A specific VCF topology (Moog-style) with 4-pole rolloff. Emulated via two cascaded biquads. |
| **FM synthesis** | Frequency Modulation synthesis. One oscillator modulates the frequency of another. |
| **Operator** | A single oscillator unit in FM synthesis. This app uses 3-operator FM (YM2612-inspired). |
| **Modulation index** | In FM, controls the depth of pitch modulation — higher values = brighter/harsher tone. |
| **Send effect** | An effect that receives a mix of multiple tracks at configurable levels (reverb, delay). |
| **Sidechain ducker** | Kick-triggered gain reduction applied to all other tracks. Creates "pumping" effect. |
| **Bus compressor** | Peak-detecting compressor applied to the master bus. |

## UI Terms

| Term | Definition |
|---|---|
| **SplitFlap** | パタパタ split-flap mechanical display. Per-character 3D CSS flip animation. Used for BPM, PAT, track names, octave. |
| **Othello flip** | Step trig toggle animation: 3D `rotateY` flip between cream (empty) and olive (active) faces. |
| **PerfBar** | Performance controls strip: KEY piano, OCT shift, DUC/CMP/GAIN/SWG knobs, FX/EQ sheet toggles, FILL/REV/BRK buttons. |
| **FxPad** | XY performance surface with 4 draggable FX nodes, audio visualizer, and per-track send mixer. Rendered as overlay sheet (ADR 054). |
| **DockPanel** | Right-side param dock (minimizable to 16px via edge handle). Track selector + synth knobs + lock toolbar + send/mixer knobs. |
| **MobileParamOverlay** | Mobile bottom-sheet overlay for param editing, lock, solo, mute. Opened by tapping track name. |
| **Zone inversion** | Dark zone (navy bg) vs light zone (cream bg) — compositional tool for visual separation. |
| **Knob** | SVG rotary control (270° arc). Vertical drag to change value. |
| **PianoRoll** | DAW-style note bar editor for melodic tracks. 24-note range (C3–B4). Click+drag to draw note bars, click head/continuation to delete. |
| **Note Bar** | A trig with duration ≥ 1, visualized as a colored bar spanning multiple steps in the PianoRoll. Head = olive, continuation = semi-transparent. |
| **Auto-Legato** | Melodic tracks (t≥6) automatically connect consecutive notes with legato (no retrigger). Rest = retrigger. No explicit slide flag needed. |
| **TrackerView** | M8-style vertical single-track step editor. NOTE/VEL/DUR/SLD/CHN columns. Rendered in pattern overlay sheet. |
| **SceneView** | Node-based scene graph canvas. Always the main view (ADR 054). Arrangement editor with pattern and function nodes. |
| **MatrixView** | Pattern pool browser sidebar (desktop). Grid of 24×24px cells showing pattern density and selection. |
| **SectionNav** | Section strip + metadata editor. Two-row navigator for section selection and parameter editing. |
| **FilterView** | EQ/filter XY pad rendered as overlay sheet (ADR 054). FILTER + 3-band EQ nodes. |
| **PerfBubble** | Mobile floating FAB for FILL/REV/BRK. Draggable, snaps to screen edges. |
| **Oscilloscope** | Waveform display in AppHeader. Zero-crossing-aligned, DPR-aware Canvas 2D. |
| **TrackSelector** | Track dot selector bar, used in mobile FX/EQ views. Hidden on desktop. |
| **Virtual keyboard (VKBD)** | PC keyboard as musical note input. QWERTY two-row chromatic layout. Phase 1: audition only. |

## Performance Terms

| Term | Definition |
|---|---|
| **KEY (Brain Scale)** | OP-XY Brain-inspired diatonic transposition. White keys = modes of C major, black keys = chromatic major. |
| **OCT** | Octave shift (-2 to +2) for melodic tracks. Applied at cycle boundary (pending shown with SplitFlap blink). |
| **FILL** | Press-hold: random high-density drum triggers. Snare-heavy (75%), hat-heavy (85%), sparse kick (25%). Not saved. |
| **REV** | Press-hold: reverse step playback direction. All playheads decrement. |
| **GLT** | Glitch effect (downsample + bitcrush). Activatable from PerfBar (press-hold) or FxPad GLT node (XY control). |
| **BRK** | Press-hold: rhythmic 16th-note gate on master output. |
| **GRN (Granular)** | FxPad node: captures recent audio into ring buffer, replays as overlapping grains. X=size, Y=density. |
| **SWG (Swing)** | Global swing knob (0–100%). Even-step timing delayed by up to 17% of step duration (0.50–0.67 ratio). |
| **Arpeggiator** | Lead track auto-arpeggiation. 5 modes (OFF/UP/DOWN/U-D/RND), chord types, octave range. See ADR 022. |

## FxPad Terms

| Term | Definition |
|---|---|
| **FxPad** | XY performance surface for real-time FX control. 4 nodes (VERB, DLY, GLT, GRN) draggable on 2D plane. |
| **FX node** | A draggable circle on FxPad. Tap to toggle on/off, drag to set XY parameters. |
| **Sends bar** | Compact per-track mixer at bottom of FxPad. Track dots + VERB/DLY/GLT/GRN send knobs. |
| **Audio visualizer** | Canvas 2D wireframe terrain on FxPad background, driven by AnalyserNode FFT data. |

## Technical Terms

| Term | Definition |
|---|---|
| **AudioWorklet** | A Web Audio API node that runs JavaScript on a dedicated audio processing thread. |
| **MessagePort** | The communication channel between main thread and AudioWorklet. Uses `postMessage`. |
| **AnalyserNode** | Web Audio node for FFT analysis. Inserted between worklet and destination for visualizer data. |
| **DSP** | Digital Signal Processing. The mathematical operations that produce and transform audio. |
| **Audio block** | 128 samples processed in one `process()` call of the AudioWorklet. |
| **Runes** | Svelte 5's reactivity system (`$state`, `$derived`, `$effect`). |
| **WASM / WebAssembly** | Binary instruction format. Used by the C++ DSP core (not yet integrated). |
| **Emscripten** | Compiler toolchain for C++ → WebAssembly. Used for `src/dsp/`. |
| **VST3** | Plugin format for DAWs. Future target platform for C++ DSP core. |

## Status Markers (used in all docs)

| Marker | Meaning |
|---|---|
| **DECIDED** | Confirmed. Implement as specified. |
| **PROPOSED** | Recommended, not yet confirmed. Do not implement without user approval. |
| **OPEN** | Under discussion. Do not implement. |
| **DEFERRED** | Intentionally postponed. Data model may exist, but no UI or DSP implementation. |
