# Glossary

Domain-specific terms used throughout the docs. When a term appears in specs, it means exactly what is defined here.

## JA naming conventions

General nouns use katakana. Proper nouns / engine names stay in English. Abbreviations (P-Lock, FX) stay as-is.

| EN | JA | Notes |
|---|---|---|
| Grid mode | グリッドモード | |
| Tracker mode | トラッカーモード | |
| Piano Roll | ピアノロール | |
| Velocity | ベロシティ | |
| Sampler | サンプラー | |
| Voice | ボイス | |
| Effect | エフェクト | |
| Scene Node | シーンノード | |
| Function Node | ファンクションノード | |
| Sweep | スウィープ | not "スウィープオートメーション" |
| Playback | 再生 | |
| Shortcut | ショートカット | |
| Turing Machine | Turing Machine | proper noun — keep English |
| Quantizer | Quantizer | proper noun — keep English |
| Tonnetz | Tonnetz | proper noun — keep English |
| P-Lock | P-Lock | abbreviation — keep English |
| FX | FX | abbreviation — keep English |

## Sequencer Terms

| Term | Definition |
|---|---|
| **Song** | Top-level container. Holds BPM, rootNote, tracks (instrument config), patterns (pool), sections, scene graph. |
| **Pattern** | A reusable unit of music: string id + name + N cells (one per track, up to 16). Stored in Song.patterns pool. |
| **Cell** | Step data for one track in one pattern: name, voiceId, steps, trigs, voiceParams, FX send levels. Per-pattern instrument assignment (ADR 062). |
| **Track** | Mixer channel only: id, muted, volume, pan (ADR 080). Name and voiceId moved to Cell (ADR 062). |
| **Section** | Arrangement slot referencing a pattern by index, with optional metadata (repeats, key, oct, FX). |
| **Scene** | Node-based directed graph for arrangement. Contains SceneNodes and SceneEdges. See ADR 044. |
| **SceneNode** | A node on the scene canvas: pattern, generative, or function type (transpose/tempo/repeat/fx/sweep). Legacy types (probability/automation) kept for migration only. |
| **SceneEdge** | Directed connection between scene nodes with playback order. |
| **SceneDecorator** | Legacy function decorator on pattern nodes (ADR 066). Migrated to standalone function nodes with satellite attachment (ADR 093/116). Type retained for data migration. |
| **Automation** | Time-varying parameter curves attached to scene nodes (ADR 053). Graphical curve editor with linear/smooth interpolation. Target types: global (tempo, masterVolume), track (volume, pan), FX, and sends. |
| **Sweep** | Function node for painting parameter automation curves across repeat cycles (ADR 118). Kidpix-inspired freehand/bézier canvas. Applies relative offsets to volume, pan, voice params, and sends during scene playback. |
| **SceneLabel** | Free-floating text label on the scene canvas (ADR 052). |
| **SceneStamp** | Decorative SVG pictogram on the scene canvas with beat-synced playback animations (ADR 119). Kidpix-inspired personality stamps (pictogram figures, expressive faces). |
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
| **Generative Node** | Scene node running algorithmic composition: Turing Machine, Quantizer, or Tonnetz (ADR 078). |
| **FX Flavours** | 3 variants per send effect (e.g. reverb: room/hall/shimmer). Per-song default, per-pattern via decorators (ADR 075/076). |
| **Insert FX** | Dual-slot serial insert chain per track (verb/delay/glitch). Each slot has independent type/flavour/mix/params. Per-step P-Locks supported (ins0/ins1 mix/x/y). Processed before send bus (ADR 077/114). |
| **Cell.trackId** | Stable numeric reference linking Cell to Track.id. Decouples array position from identity (ADR 079). |
| **Step Scale** | Per-track step resolution divisor (ADR 112). Values: 1/8 (div 4), 3/16 (div 3), 1/16 (div 2, default), 3/32 (div 1.5), 1/32 (div 1). Enables polyrhythmic patterns. |
| **Function Node** | Scene node applying a transform to a pattern: transpose, repeat, tempo, FX, or sweep. Satellite types (transpose/repeat/tempo/fx) attach to pattern nodes (ADR 116). Sweep is an independent generative-sized node (ADR 118). |
| **Satellite Attach** | Function nodes attach to pattern nodes by clicking the pattern in placement mode. Drag to detach/reattach. No manual edge wiring needed (ADR 116). |
| **Tool Palette** | Circular button bar in SceneView for adding nodes. FN tools (neutral), GEN tools (accent-colored rings), Label. Visually distinct from flat square UI controls (ADR 116). |
| **Auto-generate** | Generative nodes auto-generate on edge connect and debounce-regenerate on parameter changes (ADR 117). |

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
| **Operator** | A single oscillator unit in FM synthesis. This app uses 4-operator FM with 8 algorithm topologies, per-op ADSR, LFO with sync. 12-voice polyphony with MEGAfm-style poly modes (MONO/POLY12/WIDE6/UNISON) (ADR 068). |
| **Modulation index** | In FM, controls the depth of pitch modulation — higher values = brighter/harsher tone. |
| **Wavetable** | A table of waveform samples (2048 × 5 shapes). Oscillator morphs between shapes via position parameter. |
| **SVF** | State Variable Filter. Trapezoidal-integrated multi-mode filter (LP/HP/BP/Notch). Used by WT synth. |
| **WT** | Wavetable synth (formerly iDEATH). Waldorf Protein-inspired direction (ADR 113). 16-voice poly (MONO/POLY16/WIDE8/UNISON). 2 osc (WT morph, MIX/FM/Ring combine) + SVF + unison + 2 env + 2 LFO + mod matrix + drive. VoiceId: `'WT'`. |
| **DrumMachine** | Unified drum synth (ADR 010). Tone osc + noise + metallic osc layers, configured per-drum via presets. All drum VoiceIds (except FMDrum) share this class. |
| **FMDrum** | FM-based drum synthesizer (ADR 111). 6 machines (KICK/SNARE/METAL/PERC/TONE/CHORD), 8 macro params, 21 factory presets. VoiceId: `'FMDrum'`. |
| **SamplerVoice** | Single-voice sample playback engine (ADR 012). Supports multi-sample zone mapping, chop, timestretch. Used directly by Crash/Ride (drum category) and as core inside PolySampler. |
| **PolySampler** | 8-voice polyphonic sampler wrapping SamplerVoice (ADR 106). Round-robin allocation, dynamic gain `1/√N`. Used by `Sampler` VoiceId — a melodic voice supporting piano roll, transpose, and arpeggiator. |
| **Factory preset** | Named parameter snapshot. WT: 30 presets across 6 categories (Lead/Bass/Pad/Pluck/Keys/FX). FM: 20 presets across 6 categories (Keys/Bass/Lead/Bells/Pad/SFX). |
| **Send effect** | An effect that receives a mix of multiple tracks at configurable levels (reverb, delay). |
| **Sidechain ducker** | Kick-triggered gain reduction applied to all other tracks. Creates "pumping" effect. |
| **Bus compressor** | Peak-detecting compressor applied to the master bus. |
| **Tape saturator** | Asymmetric soft-knee tape saturation on the master bus. Controlled via MasterView SAT XY pad (drive + tone). Adds tape compression and subtle hiss (ADR 122). |

## UI Terms

| Term | Definition |
|---|---|
| **SplitFlap** | パタパタ split-flap mechanical display. Per-character 3D CSS flip animation. Used for BPM, PAT, track names, octave. |
| **Othello flip** | Step trig toggle animation: 3D `rotateY` flip between cream (empty) and olive (active) faces. |
| **PerfBar** | Performance controls strip (AppHeader sub-header): KEY piano, OCT shift, FX/EQ sheet toggles, FILL/REV/BRK buttons. DUC/CMP/GAIN/SWG controls are in MasterView. |
| **FxPad** | XY performance surface with 4 draggable FX nodes, audio visualizer, and per-track send mixer. Rendered as overlay sheet (ADR 054). |
| **DockPanel** | Right-side param dock (minimizable to 16px via edge handle). Track selector + preset browser + synth knobs + lock toolbar + send/mixer knobs. |
| **MasterView** | Master bus overlay sheet with VU meter and audio-reactive visuals. |
| **MobileParamOverlay** | Mobile bottom-sheet overlay for param editing, lock, solo, mute. Opened by tapping track name. |
| **Zone inversion** | Dark zone (navy bg) vs light zone (cream bg) — compositional tool for visual separation. |
| **Knob** | SVG rotary control (270° arc). Vertical drag to change value. |
| **PianoRoll** | DAW-style note bar editor for melodic tracks. 24-note range (C3–B4). Click+drag to draw note bars, click head/continuation to delete. |
| **Note Bar** | A trig with duration ≥ 1, visualized as a colored bar spanning multiple steps in the PianoRoll. Head = olive, continuation = semi-transparent. |
| **Auto-Legato** | Melodic tracks (t≥6) automatically connect consecutive notes with legato (no retrigger). Rest = retrigger. No explicit slide flag needed. |
| **TrackerView** | M8-style vertical single-track step editor. NOTE/VEL/DUR/SLD/CHN columns. Rendered in pattern overlay sheet. |
| **SceneView** | Node-based scene graph canvas. Always the main view (ADR 054). Arrangement editor with pattern and function nodes. |
| **MatrixView** | Pattern pool browser sidebar (desktop). Grid of 24×24px cells showing pattern density and selection. |
| **SectionNav** | *(removed)* Legacy linear section strip. Fully removed (ADR 095). Superseded by Scene graph (ADR 044) + MobileMatrixView. |
| **FilterView** | EQ/filter XY pad rendered as overlay sheet (ADR 054). FILTER + 3-band EQ nodes. |
| **MobilePerfSheet** | Mobile Kaoss Pad XY controller. 4 tabs (PERF/GLITCH/FILTER/MOTION) with per-zone effects, Canvas visualizer, accelerometer/gyroscope support. |
| **Oscilloscope** | Waveform display in AppHeader. Zero-crossing-aligned, DPR-aware Canvas 2D. |
| **TrackSelector** | Track dot selector bar, used in mobile FX/EQ views. Hidden on desktop. |
| **VoicePicker** | Voice selection UI (inline in DockPanel, not a standalone component) for changing a cell's instrument. Category tabs (DRUM/SYNTH/SMPL) + voice list (ADR 009/058). |
| **VoiceId** | Granular voice identifier string (e.g. 'Kick', 'Bass303', 'FM'). Replaces the old coarse SynthType. See ADR 009. |
| **Virtual keyboard (VKBD)** | PC keyboard as musical note input. QWERTY two-row chromatic layout. Phase 1: audition only. |
| **Hardware MIDI** | Web MIDI API integration for USB + BLE MIDI keyboards. Per-note release, CC1→DJ Filter (ADR 081). |
| **WAV Recording** | MediaRecorder-based capture from pre-destination node. Armed-then-record with reverb tail (ADR 085). |
| **Chord Brush** | Piano roll drawing mode: triad/7th/sus2/sus4 shapes. Strum variant adds velocity decay (ADR 067). |

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
| **WASM / WebAssembly** | Binary instruction format. C++ WASM approach was superseded (ADR 001); all DSP is TypeScript. |
| **VST3** | Plugin format for DAWs. Potential future native port target. |
| **OPFS** | Origin Private File System. Browser-native filesystem API used by the Audio Pool for persistent sample storage. |
| **Audio Pool** | OPFS-based sample library (ADR 104). 111 factory samples (90 browsable + 21-zone Grand Piano pack) auto-installed at startup. User samples auto-added on LOAD. Browsable via DockPoolBrowser. |

## Status Markers (used in all docs)

| Marker | Meaning |
|---|---|
| **DECIDED** | Confirmed. Implement as specified. |
| **PROPOSED** | Recommended, not yet confirmed. Do not implement without user approval. |
| **OPEN** | Under discussion. Do not implement. |
| **DEFERRED** | Intentionally postponed. Data model may exist, but no UI or DSP implementation. |
