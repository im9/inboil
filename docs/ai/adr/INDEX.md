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
| 011 | Full Synth Engines | Implemented | Wavetable osc, SVF, InboilSynth/PolySynth, factory presets |
| 012 | Sampler | Proposed | |
| 023 | Oscilloscope Display | Implemented | |

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

## Song Structure / Arrangement

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 024 | Project & Scene Hierarchy | Superseded | Concept evolved into 042+044 |
| 027 | Node Chain Song Builder | Superseded | Concept evolved into 044 |
| 032 | Song View (M8-Style) | Superseded | Replaced by 042 (Section-Based Arrangement) |
| 037 | ChainView Redesign | Superseded | Replaced by 042+044 |
| 040 | Drill-Down Navigation | Superseded | Replaced by 041+044 |
| 041 | Unified Navigation | Superseded | Replaced by 045+046 (decouple playback + simplify toggle) |
| 042 | Section-Based Arrangement | Implemented | Song → Section → Cell flat model |
| 043 | Matrix View | Implemented | Pattern pool browser sidebar |
| 049 | Pattern Identity | Implemented | Rename UI + color picker, reflected in Matrix & Scene |
| 044 | Scene Graph | Implemented | Node-based directed graph for arrangement |
| 045 | Decouple Playback from View | Implemented | Separate `playback.mode` from `ui.phraseView` |
| 046 | Simplify View Toggle | Implemented | PAT/SCENE 2-button toggle, Grid/Tracker as system pref |
| 048 | Scene Playback | Implemented | Random branching at forks + terminal stop |
| 050 | Scene Function Nodes | Implemented | SVG icon nodes, root visual upgrade, `fx` node, transpose absolute mode |
| 051 | Scene View Polish | Implemented | Play/stop on root, per-node solo (armed/active), progress bar, edge handles, solid accent edge |
| 052 | Scene Free-Floating Labels | Implemented | Canvas text labels independent of nodes |
| 053 | Scene Automation Node | Proposed | Continuous parameter change during pattern playback |
| 054 | Overlay Sheet Model | Implemented | Pattern/FX/EQ as overlay sheets over SceneView |
| 055 | Dock Minimize & Sidebar Separation | Implemented | DockPanel edge-handle minimize, sidebar as fixed drawer |
| 059 | Scene Multi-Select | Implemented | Rectangle select, group drag, alignment tools, partial auto-layout, multi-copy/paste |

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

## Instruments / Sound Design

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 008 | Granular Enhancements | Implemented | Pitch shift, reverse, scatter, freeze |
| 009 | Instrument Selection | Implemented | VoiceId registry, bubble picker, worklet voice swap |
| 058 | Cross-Category Voice Assignment | Implemented | Any voice on any track, drill-down picker, voiceId-based melodic detection |
| 062 | Per-Pattern Voice Assignment | Implemented | voiceId + name moved from Track to Cell; per-pattern instruments and track names |
| 010 | Drum Synth Expansion | Proposed | Analog-modeled percussion (808 Kick, Rimshot, Tom, etc.) |
| 015 | Named Instrument Presets | Proposed | |
| 056 | Variable Track Count & Track Types | Proposed | Dynamic 1–16 tracks, synth/audio/midi types |
| 063 | iDEATH Synth Engine | Proposed | Rename InboilSynth → iDEATH, unison, tempo-sync LFO, wobble bass |

## Performance / Live

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 026 | Auto-Performance | Proposed | Auto Fill/Break/Reverse |
| 031 | Virtual MIDI Keyboard | Implemented | Phase 1: audition mode, octave synced with piano roll |
| 038 | Custom Functions | Proposed | User-defined FX/filter macros, keyboard/bubble triggers |
| 039 | Solo Button | Implemented | Per-track additive solo via DockPanel / MobileParamOverlay |

## Data / Infrastructure

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 007 | Pattern Persistence | Proposed | |
| 016 | VST Plugin / MIDI | Proposed | |
| 019 | Multi-Device Collaboration | Proposed | |
| 020 | Data Persistence & Storage | Proposed | |
| 030 | Audio & MIDI Export | Proposed | |
