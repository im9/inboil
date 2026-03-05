# ADR Index

Quick reference for all Architecture Decision Records. Read individual ADRs only when relevant to the current task.

## Status Legend

- **Implemented**: Done. Code is the source of truth. Read only for historical rationale.
- **Proposed**: Not yet implemented. Read before working on related features.
- **Superseded**: Replaced by a newer ADR. Generally skip.

## Audio / DSP

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 001 | DSP Core in C++ / WASM | Decided | C++ code exists in `src/dsp/`, not yet integrated |
| 002 | TypeScript AudioWorklet | Implemented | Current DSP runtime |
| 003 | BPM-Synced Delay | Implemented | |
| 005 | Swing / Shuffle | Implemented | |
| 011 | Full Synth Engines | Proposed | |
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
| 043 | Matrix View | Implemented | Pattern pool browser sidebar (Phases 1-3) |
| 044 | Scene Graph | Implemented | Node-based directed graph for arrangement |
| 045 | Decouple Playback from View | Implemented | Separate playback.mode from ui.phraseView |
| 046 | Simplify View Toggle | Implemented | PAT/SCENE 2-button toggle, Grid/Tracker as system pref |

## UI / Layout

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 017 | Help Sidebar | Superseded | Replaced by 036 (DockPanel HELP tab) |
| 018 | Settings Panel (SYSTEM) | Superseded | Replaced by 036 (DockPanel SYS tab) |
| 034 | Help / Guide Redesign | Proposed | Content updates for 036's HELP tab |
| 035 | Master View | Proposed | XY pad + knobs for master bus |
| 036 | Remove Footer / Dockable Panel | Implemented | Unifies ParamPanel + Sidebar into DockPanel. Related: 034, 037 |

## Instruments / Sound Design

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 008 | Granular Enhancements | Implemented | Pitch shift, reverse, scatter, freeze |
| 009 | Instrument Selection | Proposed | |
| 010 | Drum Synth Expansion | Proposed | |
| 015 | Named Instrument Presets | Proposed | |

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
