# ADR 085 — System Sidebar Tabs & REC Button in Sub-Header

**Status**: Implemented
**Created**: 2026-03-11

## Context

The SYSTEM sidebar has grown to include project management, export, settings, and MIDI input — all in one long scrollable list. Users must scroll to find what they need. WAV recording is a performance action buried in a settings panel.

## Decision

### 1. Split SYSTEM sidebar into two tabs: PROJECT / SETTINGS

**PROJECT tab** (default):
- NEW PROJECT / SAVE AS buttons
- Project name (rename)
- EXPORT MIDI button
- EXAMPLES + saved PROJECTS list

**SETTINGS tab**:
- PATTERN INPUT toggle (Grid / Tracker)
- SCALE LOCK toggle
- HOVER GUIDE toggle
- LANGUAGE toggle
- MIDI INPUT section (toggle, device, channel — conditional on `midiIn.available`)
- FACTORY RESET (footer)
- About line (`inboil v0.1.0 — © 2026 origamiworks`)

### 2. Move WAV REC to sub-header

- Red circle `●` icon button, placed between transport (▶■) and the separator
- Recording state: pulse animation, red border
- Stop: click same button again → downloads WAV
- Consistent with hardware groovebox REC button placement

### 3. Move MIDI export to PROJECT tab

- Labeled `EXPORT MIDI`
- Placed after SAVE AS, before project list
- Logical grouping: file/project operations together

## State Changes

- Add `ui.systemTab: 'project' | 'settings'` (default: `'project'`, not persisted)
- Remove `recording` local state from Sidebar; add to AppHeader
- Move WAV capture imports from Sidebar to AppHeader

## UI Layout

```
Sidebar header:  SYSTEM                    ×
Tab bar:         [PROJECT]  [SETTINGS]
─────────────────────────────────────────
(tab content scrolls)

Sub-header:  BPM ▶ ■ ● | SCENE FX EQ MST | FILL REV BRK | ? SYSTEM
```

## Consequences

- Sidebar is less cluttered; each tab has a clear purpose
- REC is instantly accessible during performance
- MIDI export stays discoverable in PROJECT tab alongside other file operations
- No persistence needed for tab selection — always opens to PROJECT
