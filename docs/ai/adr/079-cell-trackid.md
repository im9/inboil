# ADR 079 — Explicit Cell.trackId (decouple cell position from track identity)

**Status**: Proposed → Implementing
**Date**: 2026-03-11

## Context

`pattern.cells` is an array where the index implicitly equals the track ID:
`cells[trackId]` assumes array position = `song.tracks[trackId]`.

ADR 056 introduced per-pattern track counts — `removeTrack` splices cells
from the current pattern only. After the splice, `cells[3]` may now refer
to what was formerly track 4, while `song.tracks[3]` still refers to the
original track 3. Mute, solo, volume, and pan read from
`song.tracks[trackId]` point to the wrong track.

The index-based coupling is fundamentally incompatible with per-pattern
track counts.

## Decision

Add an explicit `trackId: number` field to `Cell`. All lookups change from
`cells[trackId]` to `cells.find(c => c.trackId === trackId)`.

### Design rules

| Rule | Detail |
|------|--------|
| `Cell.trackId` | Stable reference to `Track.id` in `song.tracks` |
| `song.tracks` | Never spliced (append-only). Index = Track.id. |
| `removeTrack(trackId)` | Finds cell by `trackId`, splices only that cell from current pattern |
| `addTrack` | Pushes to `song.tracks` + pushes cell with matching `trackId` to current pattern |
| `activeCell(trackId)` | `pat.cells.find(c => c.trackId === trackId)` |
| `ensureCells(pat)` | Computes missing trackIds, pushes cells for those |
| Legacy migration | `restoreSong` assigns `trackId = index` to cells lacking the field |
| Max tracks | 16 — linear `.find()` is negligible |

### What does NOT change

- `song.tracks` structure and indices (already stable, never spliced)
- Trig, Pattern, Track interfaces
- Playback engine track ordering (maps from `song.tracks` array order)

## Consequences

- Every `cells[i]` lookup replaced with `cells.find(c => c.trackId === id)`
- Components iterate `cells` array and read `cell.trackId` for track lookup
- `removeTrack` becomes splice-by-trackId, not by array index
- Old saved projects auto-migrate (assign trackId from index position)
