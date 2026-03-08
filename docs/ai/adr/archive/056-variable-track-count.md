# ADR 056: Variable Track Count

## Status: Implemented

## Context

The app was hardcoded to 8 tracks (6 drum + 2 melodic). This limited musical expressiveness — users could not add extra layers. The goal was to support **dynamic track count (0–16)** with optional voice assignment.

## Decision

### A. Dynamic Track Count (0–16)

`addTrack()` and `removeTrack(idx)` in `stepActions.ts` manage tracks globally:
- `addTrack(voiceId?)` — adds a track with optional voice (defaults to `null` = unassigned)
- `removeTrack(idx)` — removes a track, updates all patterns atomically
- Both push undo snapshots before mutating

### B. Nullable Voice Assignment

`Cell.voiceId` and `Track.voiceId` are `VoiceId | null`. A null voice means the track is an empty slot — step data exists but no sound plays. Users assign voices via DockPanel when ready.

Boundary functions handle null gracefully:
- `isDrum()` → false for null
- `getParamDefs()` / `defaultVoiceParams()` → empty for null
- `hasPresets()` / `getPresets()` → empty for null
- `makeVoice()` → returns null (worklet skips rendering)

### C. Worklet: Dynamic Arrays

All fixed-size typed arrays resize dynamically in `setPattern` when track count changes. Null voices produce no audio output — the render loop skips them with `if (!voice) continue`.

### D. Index-Based Role Checks Removed

All `t >= 6` checks replaced with `DRUM_VOICES.has(track.voiceId)` (with null guard).

### E. Migration / Reconciliation

`restoreSong()` reconciles `cells.length` with `tracks.length` on load — pads with empty cells or truncates. `buildWorkletPattern()` returns a muted fallback for missing cells.

### F. UI

- **StepGrid**: Scrollable via `position: absolute; inset: 0` inner wrapper. `+` button adds empty track
- **DockPanel**: Track selector uses numbered buttons with `flex-wrap` (auto 2-row at >8 tracks). `REMOVE` button with 2-step inline confirm. Voice selector visible when voiceId is null
- **MobileTrackView**: No change needed (already uses `% song.tracks.length`)

## Considerations

- **CPU budget**: 16 synth tracks feasible for simple voices; may need per-track CPU metering for PolySynth
- **Serialization**: 16 tracks × 64 steps ≈ 2× current, well within MessagePort limits
- **Migration**: Existing songs load as-is; reconciliation handles any mismatch
