# ADR 080: Pre-Launch Structural Audit

## Status: Implemented

## Context

Before launch, audit and resolve structural inconsistencies and technical debt accumulated during feature development.

## Resolved Issues

### 1. `song.tracks` — Separated into Mixer-Only Role ✅

**Problem**: `Track` held `name` / `voiceId` / `muted` / `volume` / `pan`, duplicating Cell's responsibility. Template switching caused `song.tracks` to inflate without shrinking.

**Resolution**: Removed `name` / `voiceId` from `Track`, making it a pure mixer channel (`id` / `muted` / `volume` / `pan`).

- `Track` interface: `id`, `muted`, `volume`, `pan` only
- `makeTrack(id, pan)` simplified
- Removed `track.voiceId` sync in `changeVoice()`
- `ensureCells()` / `restoreSong()` fallbacks use default values
- Legacy save migration: `restoreSong()` reads old `Track.name/voiceId` for Cell creation
- Orphaned track cleanup: `pruneOrphanedTracks()` after template apply

### 2. BPM Range Unified ✅

Defined `BPM_MIN` (40) / `BPM_MAX` (240) in `constants.ts`. All 3 locations (AppHeader, Automation, Decorator knob) now reference these constants.

### 3. Codebase Audit Results ✅

| Category | Result |
|----------|--------|
| `restoreCell()` insertFx deep clone | Fixed — spread copy added |
| Undo coverage | Fixed — added `pushUndo()` to 8 section functions + `songLoadPreset` + label drag/resize |
| WorkletPattern ↔ Cell mapping | No gaps found |
| Memory leaks (`$effect` / `addEventListener`) | No issues found |
| Unused code | No issues found |

## Consequences

- `Track` is mixer-only. Musical information (`name`, `voiceId`, `trigs`, `insertFx`) lives entirely in `Cell`
- Future per-pattern track label editing requires only `Cell.name` UI — no structural changes
- `muted` / `volume` remain global (appropriate for performance controls). Extension path exists to move them to `Cell` if per-pattern mixing is needed
