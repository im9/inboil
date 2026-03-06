# ADR 056: Variable Track Count & Track Types

## Status: Proposed

## Context

The app is currently hardcoded to 8 tracks (6 drum + 2 melodic). This limits musical expressiveness — users cannot add extra melodic layers, audio playback, or MIDI output. The goal is to support **dynamic track count (1–16)** and introduce **track types** beyond synth voices.

### Current Hardcoded Assumptions

The number "8" appears in two forms across the codebase:

**Explicit `8` literals** (must be replaced):
- `worklet-processor.ts:135–191` — `playheads`, `gateCounters`, `muteGains`, `panGainsL/R`, all arp arrays initialized as `new Array(8)` / `Int32Array(8)` / etc.

**Already dynamic** (use `.length` or iterate `song.tracks`):
- `worklet-processor.ts:227–290` — `setPattern` handler loops over `p.tracks.length`
- `engine.ts:168` — `buildWorkletPattern()` maps over `s.tracks`
- All UI components (`StepGrid`, `DockPanel`, `TrackerView`, `MobileTrackView`, `TrackSelector`) iterate `song.tracks`

**Index-based role assumptions** (must be refactored):
- `worklet-processor.ts:390,405,439,452` — `t >= 6` checks for "melodic track" (arp, transpose)
- `factory.ts:395` — `trackIdx === 6 ? bass : trackIdx === 7 ? lead` for factory patterns
- `factory.ts:31–40` — `TRACK_DEFAULTS` as fixed 8-element array

### Key Insight

Most of the codebase is already dynamic — the worklet processes `p.tracks.length` tracks, and UI components iterate `song.tracks`. The main blockers are: (1) fixed-size typed arrays in the worklet, (2) `t >= 6` role checks that should use `isDrum(voiceId)` instead, and (3) `TRACK_DEFAULTS` as the sole source of initial track configuration.

## Decision

### A. Track Types

Add a `type` field to `Track` to distinguish synth, audio, and MIDI tracks:

```typescript
export interface Track {
  id: number
  name: string
  type: 'synth' | 'audio' | 'midi'  // NEW
  voiceId: VoiceId                    // synth only (ignored for audio/midi)
  muted: boolean
  volume: number
  pan: number
  // audio track fields (DEFERRED — Phase 3)
  // midi track fields (DEFERRED — Phase 4)
}
```

Phase 1 implements `'synth'` only. Existing tracks get `type: 'synth'` as default.

### B. Dynamic Track Count

Replace `TRACK_DEFAULTS` (fixed 8-element array) with a default configuration + add/remove API:

```typescript
const MAX_TRACKS = 16
const DEFAULT_TRACK_COUNT = 8

// Initial tracks remain the same 8 as today
export const INITIAL_TRACKS: TrackDefault[] = [
  { name: 'KICK',  voiceId: 'Kick',     note: 60, pan:  0.00 },
  // ... same 8 defaults
]

export function addTrack(voiceId: VoiceId): number | null {
  if (song.tracks.length >= MAX_TRACKS) return null
  pushUndo('Add track')
  const idx = song.tracks.length
  const drum = DRUM_VOICES.has(voiceId)
  song.tracks.push(makeTrack(idx, voiceId.toUpperCase().slice(0,4), voiceId, 0))
  // Add a cell to every pattern
  for (const pat of song.patterns) {
    pat.cells.push(makeEmptyCell(idx, voiceId, drum ? 60 : 48))
  }
  return idx
}

export function removeTrack(idx: number): boolean {
  if (song.tracks.length <= 1) return false
  pushUndo('Remove track')
  song.tracks.splice(idx, 1)
  // Re-index track ids
  song.tracks.forEach((t, i) => t.id = i)
  // Remove corresponding cell from every pattern
  for (const pat of song.patterns) {
    pat.cells.splice(idx, 1)
  }
  // Adjust selectedTrack
  if (ui.selectedTrack >= song.tracks.length) {
    ui.selectedTrack = song.tracks.length - 1
  }
  return true
}
```

### C. Worklet: Dynamic Arrays

Replace all fixed-size typed arrays with dynamically resized arrays in `setPattern`:

```typescript
// In setPattern handler, after voice diff:
const n = p.tracks.length
if (this.playheads.length !== n) {
  this.playheads     = new Array(n).fill(0)
  this.gateCounters  = new Int32Array(n)
  this.muteGains     = new Float64Array(n).fill(1.0)
  this.panGainsL     = new Float64Array(n).fill(Math.SQRT1_2)
  this.panGainsR     = new Float64Array(n).fill(Math.SQRT1_2)
  this.arpNotes      = Array.from({length: n}, () => [])
  this.arpIdx        = new Int32Array(n)
  this.arpCounter    = new Int32Array(n)
  this.arpTickSize   = new Int32Array(n)
  this.arpVel        = new Float64Array(n)
  this.arpSeed       = new Uint32Array(n).fill(77777)
}
```

### D. Remove Index-Based Role Checks

Replace all `t >= 6` checks with `isDrum(voiceId)` or track type checks:

```typescript
// Before (worklet-processor.ts):
const isMelodic = t >= 6

// After:
const isMelodic = !DRUM_VOICES.has(this.tracks[t].voiceId)
```

The worklet already receives `voiceId` per track. `DRUM_VOICES` set is already available in the worklet bundle.

### E. Pattern.cells — Variable Length

`Pattern.cells` changes from "always 8" to "one per track":

```typescript
/** Reusable pattern — name + color + cells (one per track) */
export interface Pattern {
  id: string
  name: string
  color: number
  cells: Cell[]   // length === song.tracks.length (was: 8 fixed)
}
```

When a track is added/removed, all patterns are updated atomically (see `addTrack` / `removeTrack` above).

### F. UI Considerations

**StepGrid (desktop)**: Already iterates `song.tracks`. For >8 tracks, add vertical scroll within the grid area. Track rows are ~28px tall, so 16 tracks ≈ 448px — fits most screens without scroll.

**DockPanel track selector**: Already iterates `song.tracks`. For >8 tracks, use a compact scrollable row or two-row layout.

**MobileTrackView**: Already uses ◄/► navigation with `% song.tracks.length`. No change needed.

**Add/Remove UI**: "+" button at bottom of track list (StepGrid) or end of TrackSelector. Long-press or context menu on track label to remove.

## Implementation Order

### Phase 1: Dynamic Track Count (synth only)
1. Add `Track.type = 'synth'` field (default, backward compatible)
2. Replace `TRACK_DEFAULTS` usage with `INITIAL_TRACKS` + addTrack/removeTrack API
3. Refactor worklet fixed-size arrays to dynamic resize
4. Replace all `t >= 6` index checks with `DRUM_VOICES.has(voiceId)`
5. Add "+" track button to StepGrid and TrackSelector
6. Add remove-track action (context menu or long-press)
7. Update `Pattern.cells` comment (already variable length in practice)

### Phase 2: Audio Track
1. Add `SamplerVoice` (ADR 012) or `AudioTrack` voice type
2. `Track.type = 'audio'` with sample buffer reference
3. File picker / drag-and-drop for sample loading
4. `loadSample` worklet command for buffer transfer

### Phase 3: MIDI Track
1. `Track.type = 'midi'` with MIDI output config
2. Web MIDI API integration for external device output
3. MIDI channel/port selection in DockPanel
4. Trigs generate MIDI messages instead of audio

### Phase 4: Track Reordering
1. Drag-to-reorder tracks in StepGrid
2. Update all pattern cells atomically on reorder

## Considerations

- **CPU budget**: 16 synth tracks in AudioWorklet is feasible for simple voices but tight for PolySynth (ADR 011). May need per-track CPU metering.
- **Serialization size**: 16 tracks × 64 steps ≈ 2× current. Still well within MessagePort limits (~50KB per setPattern).
- **Migration**: Existing songs with 8 tracks load as-is. `Track.type` defaults to `'synth'` if missing.
- **Audio tracks** require `postMessage` with transferable buffers — larger payload than synth tracks.
- **MIDI tracks** need Web MIDI API permission prompt — not available in all browsers.

## Future Extensions

- Per-track audio bus routing (group tracks → sub-mix → master)
- Track freeze (render to audio buffer to save CPU)
- Track templates / presets (save/load track configurations)
- Track groups (collapsible drum group, melodic group)
