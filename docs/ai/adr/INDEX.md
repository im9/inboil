# ADR Index

Quick reference for all Architecture Decision Records. Read individual ADRs only when relevant to the current task.

## Status Legend

- **Implemented**: Done. Code is the source of truth. Read only for historical rationale.
- **Proposed**: Not yet implemented. Read before working on related features.
- **Superseded**: Replaced by a newer ADR. Generally skip.

## File Organization

- **Top-level** (`docs/ai/adr/`): Proposed ADRs only — active design decisions awaiting implementation.
- **Archive** (`docs/ai/adr/archive/`): Implemented + Superseded ADRs — historical record, not actively maintained.

## Audio / DSP

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 001 | DSP Core in C++ / WASM | Proposed | C++ code exists in `src/dsp/`, not yet integrated |
| 002 | TypeScript AudioWorklet | Implemented | Current DSP runtime |
| 003 | BPM-Synced Delay | Implemented | |
| 005 | Swing / Shuffle | Implemented | |
| 011 | Full Synth Engines | Implemented | Wavetable osc, SVF, WT synth (ADR 063), factory presets |
| 012 | Sampler | Implemented | SamplerVoice + user sample loading; Crash/Ride in drum category |
| 023 | Oscilloscope Display | Implemented | |
| 075 | FX / EQ / Master Improvements | Implemented | FX flavours (tape delay, stutter, shimmer), EQ Q control, compressor attack/release, dock controls |
| 076 | Per-Pattern FX Flavours | Implemented | SceneDecorator flavourOverrides, DockPanel cycle UI, applyDecorators integration |
| 077 | Per-Track Insert FX | Implemented | LiteReverb, insert verb/delay/glitch per track, DockPanel UI, CPU meter warnings |

## Sequencer / Pattern

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 004 | Queued Pattern Switch | Implemented | |
| 006 | Per-Step Velocity | Implemented | |
| 013 | Pattern Chain | Superseded | Replaced by scene graph (044) |
| 014 | Parameter Locks | Implemented | P-Lock system |
| 021 | Note Duration, Slide, ADSR | Implemented | |
| 022 | Lead Arpeggiator | Implemented | |
| 025 | Pattern Copy & Paste | Implemented | |
| 028 | Step Probability | Implemented | Shift+drag on velocity bars |
| 029 | Undo / Redo | Implemented | Desktop only (Ctrl+Z / Ctrl+Shift+Z) |
| 033 | Mobile Velocity / Chance Editing | Implemented | 3-mode tabs (STEP/VEL/CHNC) with drag editing |
| 067 | Piano Roll Drawing & Chord Brush | Implemented | Pen draw + drag legato, chord/strum brush with drag duration, eraser with continuation cell support |

## Song Structure / Arrangement

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 024 | Project & Scene Hierarchy | Superseded | Concept evolved into 042+044 |
| 027 | Node Chain Song Builder | Superseded | Concept evolved into 044 |
| 032 | Song View (M8-Style) | Superseded | Replaced by 042 (Section-Based Arrangement) |
| 037 | ChainView Redesign | Superseded | Replaced by 042+044 |
| 040 | Drill-Down Navigation | Superseded | Replaced by 041+044 |
| 041 | Unified Navigation | Superseded | Replaced by 045+046 (decouple playback + simplify toggle) |
| 042 | Section-Based Arrangement | Implemented | Song → Section → Cell flat model. *Section/SectionNav deprecated — superseded by Scene graph (044)* |
| 043 | Matrix View | Implemented | Pattern pool browser sidebar |
| 049 | Pattern Identity | Implemented | Rename UI + color picker, reflected in Matrix & Scene |
| 044 | Scene Graph | Implemented | Node-based directed graph for arrangement |
| 045 | Decouple Playback from View | Implemented | Separate `playback.mode` from `ui.phraseView` |
| 046 | Simplify View Toggle | Implemented | PAT/SCENE 2-button toggle, Grid/Tracker as system pref |
| 048 | Scene Playback | Implemented | Random branching at forks + terminal stop |
| 050 | Scene Function Nodes | Implemented | SVG icon nodes, root visual upgrade, `fx` node, transpose absolute mode |
| 051 | Scene View Polish | Implemented | Play/stop on root, per-node solo (armed/active), progress bar, edge handles, solid accent edge |
| 052 | Scene Free-Floating Labels | Implemented | Canvas text labels independent of nodes |
| 053 | Scene Automation Node | Implemented | Graphical curve editor, decorator-based automation, snapshot/restore, mini-curve visualization |
| 054 | Overlay Sheet Model | Implemented | Pattern/FX/EQ as overlay sheets over SceneView |
| 055 | Dock Minimize & Sidebar Separation | Implemented | DockPanel edge-handle minimize, sidebar as fixed drawer |
| 059 | Scene Multi-Select | Implemented | Rectangle select, group drag, alignment tools, partial auto-layout, multi-copy/paste |
| 066 | Scene Node Decorators | Implemented | Snap-attach function nodes to patterns as decorators, edge branching = probabilistic routing |
| 069 | Dock Panel Decorator Editor | Implemented | Full-size Knob/toggle editing in DockPanel, Add dropdown, SceneNodePopup read-only labels |
| 070 | Scene Navigator | Implemented | Pattern list in DockPanel, tap-to-select, BPM-synced playback pulse, context-aware display for EQ/Master/FX sheets |
| 078 | Generative Scene Nodes | Implemented | Generative nodes (Quantizer/Tonnetz/Turing Machine), write+live modes, Freeze, presets+seed, DockPanel editing |
| 079 | Cell.trackId | Implemented | Explicit trackId on Cell decouples array position from track identity, enables per-pattern track counts |
| 089 | Generative Auto-Mode | Implemented | Auto write/live removed, sparkle arm-then-play in PatternToolbar, Tonnetz legato + startChord UI |
| 090 | Worklet-Side Generative | Proposed | Move generative computation from main thread to AudioWorklet for timing accuracy |
| 096 | Odd Step Counts & PO-Style Step Picker | Implemented | STEP_OPTIONS 2–16 + 24/32/48/64, long-press grid picker (bubble picker rejected) |

## UI / Layout

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 017 | Help Sidebar | Implemented | Sidebar as app-level fixed drawer (ADR 055) |
| 018 | Settings Panel (SYSTEM) | Implemented | Part of Sidebar (ADR 055) |
| 034 | Help / Guide Redesign | Implemented | Search, floating guide, content overhaul, KEY/scale ref, showGuide toggle |
| 035 | Master View | Implemented | XY pad + faders + VU meter for master bus |
| 036 | Remove Footer / Dockable Panel | Implemented | Right-side param dock with minimize toggle (ADR 055) |
| 047 | FX / EQ as Main Views | Superseded | Replaced by 054 (overlay sheets) |
| 057 | Pattern Toolbar | Implemented | RAND/KEY/VKBD in pattern sheet, PerfBar merged into AppHeader sub-header |
| 085 | System Sidebar Tabs & REC Button | Implemented | PROJECT/SETTINGS tabs in sidebar, REC ● button in sub-header, MIDI export in PROJECT tab |
| 092 | DockPanel Tab — Scene & Tracks | Implemented | TRACKS/SCENE tab switcher in DockPanel, decorators + generative nodes accessible from pattern sheet |
| 095 | Mobile UI Redesign | Implemented | PO-style calculator main view, MobileMatrixView, header redesign, swipe nav, overlay animations |
| 098 | Mobile Landscape Orientation | Proposed | Landscape-specific layout for mobile (split from ADR 095) |

## Instruments / Sound Design

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 008 | Granular Enhancements | Implemented | Pitch shift, reverse, scatter, freeze |
| 009 | Instrument Selection | Implemented | VoiceId registry, bubble picker, worklet voice swap |
| 058 | Cross-Category Voice Assignment | Implemented | Any voice on any track, drill-down picker, voiceId-based melodic detection |
| 062 | Per-Pattern Voice Assignment | Implemented | voiceId + name moved from Track to Cell; per-pattern instruments and track names |
| 010 | Unified Drum Machine Voice | Implemented | Single DrumMachine class with tone/noise/metal sections, 11 factory presets |
| 015 | Named Instrument Presets | Implemented | Built-in presets for all voices, user presets (IDB), pattern templates |
| 056 | Variable Track Count | Implemented | Up to 16 tracks, nullable voiceId, dynamic worklet arrays, StepGrid scroll, DockPanel 2-row selector |
| 063 | WT Synth Engine | Implemented | Wavetable synth (formerly iDEATH), 8-voice poly (MONO/POLY8/WIDE4/UNISON), unison, tempo-sync LFO, drive, wobble bass presets |
| 068 | 4-Operator FM Synth | Implemented | 4-op, 8 algorithms, per-op ADSR, tempo-sync LFO, 12-voice poly (MONO/POLY12/WIDE6/UNISON), AlgoGraph, 20 presets |
| 064 | Dynamic Sidechain Source | Implemented | Voice-registry auto-detect, replaces hardcoded track 0 |
| 065 | Sampler Chop & Timestretch | Implemented | Chop (NOTE-MAP/SEQ), repitch BPM sync, WSOLA timestretch |
| 106 | Multi-Sample Mapping & Factory Expansion | Implemented | Note-range zone map in SamplerVoice, factory grand piano (Salamander, PD), vocal chops+phrases (CC0), PolySampler dynamic gain |

## Performance / Live

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 026 | Graphic Score Automation | Implemented | Inline editor in DockPanel + overlay docks, EQ/Master/FX automation targets, context-aware filtering, XY pad color-matched curves |
| 031 | Virtual MIDI Keyboard | Implemented | Phase 1: audition mode, octave synced with piano roll |
| 038 | Custom Functions | Superseded | Replaced by decorators (ADR 066/076) + generative nodes (ADR 078) |
| 081 | Hardware MIDI Keyboard Input | Implemented | Web MIDI API, USB + BLE MIDI, per-note release, CC1→DJ Filter |
| 083 | MIDI Learn & Pitch Bend | Proposed | setVoiceParam worklet command, pitch bend, CC learn mode for DockPanel knobs |
| 084 | MIDI Step & Live Record | Proposed | Step input + live record from MIDI/vkbd, shared pipeline (originally ADR 081 Phase 4) |
| 039 | Solo Button | Implemented | Per-track additive solo via DockPanel / MobileParamOverlay |
| 097 | Mobile Punch-In Effects | Implemented | Kaoss Pad UI with 4 tabs, DJFilter routing, accelerometer/gyroscope, Canvas visualizer |
| 087 | Looper / Tape Node | Proposed | OP-1 Field style tape looper as scene function node, 4-track overdub, BPM-synced |
| 093 | Cross-Node Automation | Proposed | Automation decorators that span multiple chained pattern nodes, gradual parameter transitions |
| 094 | Interactive Docs & Playground | Proposed | Tutorial JSON snapshots, SceneCanvas sandbox, in-app onboarding (split from ADR 072) |

## Data / Infrastructure

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 007 | Pattern Persistence | Superseded | Replaced by 020 (Data Persistence) |
| 016 | VST Plugin / MIDI | Proposed | |
| 019 | Multi-Device Collaboration | Implemented | WebRTC 1:1 (host+guest), CF Workers DO signaling, chunked DataChannel, delta sync |
| 020 | Data Persistence & Storage | Implemented | localStorage + IndexedDB + JSON Export/Import; cloud sync cancelled (no external dependencies) |
| 030 | Audio & MIDI Export | Implemented | MIDI Type 1 export, WAV capture via MediaRecorder |
| 061 | Authentication | Superseded | Self-hosted OAuth cancelled; cloud sync/external API integration all cancelled — no auth needed |
| 071 | Donate Feature | Implemented | Ko-fi link in Sidebar SYSTEM panel, no feature gating |
| 072 | Landing Page, Docs & Tutorial | Implemented | Astro + Starlight LP with interactive demos, specs, bilingual docs. Playground/onboarding split to ADR 094 |
| 073 | Desktop App | Proposed | Tauri v2 shell (Phase 1 done); Phase 2: CI, auto-update, code signing |
| 074 | Mobile App (iOS Native) | Proposed | Swift/SwiftUI + C++ DSP port to Core Audio |
| 080 | Pre-Launch Structural Audit | Implemented | Track→mixer-only, BPM constants, insertFx clone fix, undo coverage |
| 082 | Test Strategy | Implemented | 129 unit tests (vitest), 18 E2E tests (Playwright): persistence, storage, scene, voice, P-LOCK |
| 086 | Engine–State Decoupling | Implemented | Remove circular dependency: engine receives all state via args, not imports |
| 091 | Release Readiness Assessment | Proposed | Pre-launch checklist: error UI, browser compat, LP/tutorial, storage notice |
| 099 | Auto-Save and Undo Durability | Implemented | beforeunload localStorage recovery snapshot, auto-restore on load (Option 3) |
| 100 | WebRTC Chunk Buffer Hardening | Implemented | MAX_CHUNKS limit, 30s TTL, duplicate guard, channel cleanup, 5MB memory budget |
| 101 | Branch Strategy, Versioning & Changelog | Proposed | main-only + tags, SemVer 0.x beta, manual CHANGELOG.md, annotated tag releases |
| 102 | Mobile Melodic Input & Track Management | Proposed | Mobile piano roll improvements + track add/remove |
| 103 | Orchestration Layer | Proposed | Multi-node parameter curves, gradual transitions across scene graph segments |
| 104 | Audio Pool | Implemented | OPFS-based pool with 79 factory samples (WebM/Opus), inline Sampler browser with search/drill-down/audition, user sample auto-import, 909 crash/ride migration, rename/move/delete management |
| 105 | CI/CD Pipeline | Proposed | GitHub Actions: type check + unit test + build on push/PR. No auto-deploy. E2E deferred to Phase 2 |
