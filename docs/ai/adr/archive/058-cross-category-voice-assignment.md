# ADR 058: Cross-Category Voice Assignment

## Status: Implemented

## Context

ADR 009 introduced a voice registry and `changeVoice()`. The VoicePicker UI has category tabs (DRUM/BASS/LEAD) and technically allows selecting any voice. However, actually assigning a voice across categories (e.g. putting a Lead on track 0, or filling all 8 tracks with drums) exposes several bugs:

### 1. Track name not updated on voice change

`changeVoice()` updates `voiceId` and `voiceParams` but leaves `track.name` unchanged. Switching track 0 from Kick to MoogLead still shows "KICK".

```typescript
// state.svelte.ts:643
export function changeVoice(trackIdx: number, newVoiceId: VoiceId) {
  pushUndo('Change instrument')
  song.tracks[trackIdx].voiceId = newVoiceId
  const c = activeCell(trackIdx)
  c.voiceParams = defaultVoiceParams(newVoiceId)
  // name unchanged!
}
```

### 2. Worklet uses `t >= 6` for melodic detection

`worklet-processor.ts` has 4 hardcoded index checks that assume tracks 0-5 are drums and 6-7 are melodic:

- `:390` — `const isMelodic = t >= 6` (arp gate logic)
- `:405` — `t >= 6 && arpNotes[t].length > 0` (arp playback)
- `:439` — `t >= 6 ? transposeNote(...)` (transpose)
- `:452` — `if (t >= 6)` (arp note assignment)

A Lead voice on track 0 gets no arp/transpose. A Kick on track 7 gets arp applied incorrectly.

### 3. Factory pattern generation assumes fixed layout

```typescript
// factory.ts:395
const baseNote = trackIdx === 6 ? f.bass[1] : trackIdx === 7 ? f.lead[1] : defaultNote
```

### 4. Send defaults not reset on category change

`makeEmptyCell()` correctly uses `DRUM_VOICES.has(voiceId)` for initial send values, but `changeVoice()` does not update sends when switching between drum and melodic.

### Goal

Any track should accept any voice, regardless of category. Valid configurations include:
- 8 drum tracks (kick-only, or any drum mix)
- 1 kick + 7 leads
- All melodic, no drums
- The current default 6+2 layout

The track's behavior (arp, transpose, piano roll, send defaults) must follow the **voice**, not the **track index**.

## Decision

### A. Auto-update track name in `changeVoice()`

Sync `track.name` from `VOICE_LIST` metadata:

```typescript
import { VOICE_LIST } from './audio/dsp/voices.ts'

export function changeVoice(trackIdx: number, newVoiceId: VoiceId) {
  pushUndo('Change instrument')
  const track = song.tracks[trackIdx]
  track.voiceId = newVoiceId
  const meta = VOICE_LIST.find(v => v.id === newVoiceId)
  if (meta) track.name = meta.label
  const c = activeCell(trackIdx)
  c.voiceParams = defaultVoiceParams(newVoiceId)
}
```

### B. Replace `t >= 6` with voiceId-based detection in worklet

The worklet already receives `voiceId` per track. Add a `DRUM_SET` constant and replace all 4 index checks:

```typescript
// worklet-processor.ts (module scope)
const DRUM_SET = new Set(['Kick','Snare','Clap','Hat','OpenHat','Cymbal'])

// In process loop — replace all t >= 6 occurrences:
const isMelodic = !DRUM_SET.has(this.tracks[t].voiceId)
```

| Line | Before | After |
|------|--------|-------|
| :390 | `const isMelodic = t >= 6` | `const isMelodic = !DRUM_SET.has(this.tracks[t].voiceId)` |
| :405 | `t >= 6 &&` | `isMelodic &&` |
| :439 | `t >= 6 ?` | `isMelodic ?` |
| :452 | `if (t >= 6)` | `if (isMelodic)` |

### C. Decouple factory from track index

Replace index-based note selection with voiceId-based:

```typescript
// factory.ts — replace trackIdx === 6 / === 7
const baseNote = DRUM_VOICES.has(voiceId)
  ? defaultNote
  : voiceId === 'Bass303' || voiceId === 'Analog'
    ? f.bass[1]
    : f.lead[1]
```

### D. Reset sends on category change

When the voice category changes (drum <-> melodic), reset send levels to appropriate defaults:

```typescript
const wasDrum = DRUM_VOICES.has(track.voiceId)
const nowDrum = DRUM_VOICES.has(newVoiceId)
if (wasDrum !== nowDrum) {
  c.reverbSend = nowDrum ? 0.08 : 0.25
  c.delaySend  = nowDrum ? 0.00 : 0.12
}
```

## Implementation Order

### Phase 1: Core (3 changes)
1. `changeVoice()` — auto-update `track.name` from voice metadata
2. `worklet-processor.ts` — replace 4x `t >= 6` with `DRUM_SET.has()` check
3. `factory.ts:395` — replace index-based note selection with voiceId-based

### Phase 2: Polish
4. `changeVoice()` — reset sends on category change
5. VoicePicker — visual hint when selecting a different category (optional)

## Considerations

- **Relation to ADR 056**: ADR 056 (Variable Track Count) also requires removing `t >= 6`. This ADR is a prerequisite that makes 056 easier to implement.
- **Existing data compatibility**: Only `track.name` is overwritten on voice change. Saved songs with correct `voiceId` values work as-is.
- **Undo**: `changeVoice()` already calls `pushUndo`, so name + send changes are covered.
- **Performance**: `DRUM_SET.has()` is O(1), same cost as `t >= 6`.
- **UI already works**: `isDrum(track)` in StepGrid/TrackerView/MobileTrackView uses `voiceId`, not index. PianoRoll visibility, velocity row display etc. already adapt correctly.

## Future Extensions

- Combine with ADR 056 for fully dynamic track count + free voice assignment
- Per-pattern voice override: optional `voiceId` on `Cell` for pattern-specific instruments
- Voice preset system: save/recall instrument + parameter sets
