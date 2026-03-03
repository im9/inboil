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
| 013 | Pattern Chain | Implemented | Superseded by 032 when implemented |
| 014 | Parameter Locks | Implemented | P-Lock system |
| 021 | Note Duration, Slide, ADSR | Implemented | |
| 022 | Lead Arpeggiator | Implemented | |
| 025 | Pattern Copy & Paste | Implemented | |
| 028 | Step Probability | Implemented | Shift+drag on velocity bars |
| 029 | Undo / Redo | Implemented | Desktop only (Ctrl+Z / Ctrl+Shift+Z) |
| 033 | Mobile Velocity Editing | Proposed | Long-press gauge |

## Song Structure / Arrangement

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 024 | Project & Scene Hierarchy | Proposed | |
| 027 | Node Chain Song Builder | Proposed | |
| 032 | Song View (M8-Style) | Proposed | Major data model restructure. Related: 013, 037 |
| 037 | ChainView Redesign | Proposed | Incremental UX fix → evolves into Song View. Related: 032 |

## UI / Layout

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 017 | Help Sidebar | Implemented | Mobile overlay pending. Subsumed by 036 |
| 018 | Settings Panel (SYSTEM) | Implemented | Subsumed by 036 |
| 034 | Help / Guide Redesign | Proposed | Content updates for 036's HELP tab |
| 035 | Master View | Proposed | XY pad + knobs for master bus |
| 036 | Remove Footer / Dockable Panel | Proposed | Unifies ParamPanel + Sidebar. Related: 034, 037 |

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

## Data / Infrastructure

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 007 | Pattern Persistence | Proposed | |
| 016 | VST Plugin / MIDI | Proposed | |
| 019 | Multi-Device Collaboration | Proposed | |
| 020 | Data Persistence & Storage | Proposed | |
| 030 | Audio & MIDI Export | Proposed | |
