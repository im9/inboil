# ADR 084: MIDI Step & Live Record

## Status: Proposed

## Context

ADR 081 implemented hardware MIDI keyboard input (noteOn/noteOff/CC), and ADR 031 implemented PC virtual keyboard audition. Both currently only support **audition mode** — notes are played but not written into the pattern.

Step recording (place notes one step at a time) and live recording (capture notes in real-time during playback) are standard DAW/groovebox features that neither MIDI nor vkbd currently support.

### Current State

- `engine.triggerNote()` / `releaseNote()` auditions only — no pattern write
- `setTrigNote(trackId, step, note)` in `stepActions.ts` writes notes to pattern (used by piano roll / tracker)
- `ui.selectedStep` tracks cursor position in step grid
- `playback.playheads[]` provides real-time step position per track during playback
- TrackerView already handles keyboard note entry (`keyToMidi` → `setTrigNote`) but requires manual step navigation

## Decision

### Recording Mode State

```typescript
// state.svelte.ts — adjacent to vkbd
export const recording = $state({
  mode: 'off' as 'off' | 'step' | 'live',
})
```

### Step Record Mode

While step record is active, noteOn from either MIDI or vkbd writes the note at the current cursor position and advances the cursor:

```typescript
// recordActions.ts
function stepRecord(trackId: number, note: number, velocity: number) {
  const cell = activeCell(trackId)
  const step = ui.selectedStep ?? 0

  pushUndo('Step record')
  const trig = cell.trigs[step]
  trig.active = true
  trig.note = note
  trig.velocity = velocity

  // Advance cursor to next step (wrap around)
  ui.selectedStep = (step + 1) % cell.steps
}
```

Integration in `midi.ts` and `PatternToolbar.svelte` (vkbd):

```typescript
if (recording.mode === 'step') {
  stepRecord(ui.selectedTrack, note, velocity)
  engine.triggerNote(ui.selectedTrack, note, velocity)  // audition simultaneously
} else {
  engine.triggerNote(ui.selectedTrack, note, velocity)
}
```

### Live Record Mode

During playback, noteOn writes to the pattern at the current playhead position:

```typescript
function liveRecord(trackId: number, note: number, velocity: number) {
  if (!playback.playing) return

  const cell = activeCell(trackId)
  const step = playback.playheads[trackId] ?? 0

  pushUndo('Live record')
  const trig = cell.trigs[step]
  trig.active = true
  trig.note = note
  trig.velocity = velocity
}
```

Quantization is implicit — notes snap to the nearest step boundary since the worklet only reports discrete step positions.

### UI: Record Button

Add a REC button to PatternToolbar, next to the VKBD/MIDI group:

```
[⌨ C4] [MIDI] [● REC ▼]
                  ├ STEP
                  └ LIVE
```

- Tap: toggle record on/off (last used mode)
- Long-press or dropdown: choose STEP / LIVE
- Visual: red dot pulses when active, steady when idle

```typescript
// PatternToolbar.svelte
<button
  class="btn-rec"
  class:active={recording.mode !== 'off'}
  onpointerdown={toggleRecord}
>● REC</button>
```

### Shared Pipeline

```
MIDI keyboard ──┐
                 ├──→ noteOn(trackId, note, velocity)
PC vkbd ────────┘         │
                     ┌────▼─────┐
                     │ recording │
                     │  mode?    │
                     └────┬──┬──┘
                    step  │  │ live
                    ┌─────┘  └──────┐
                    ▼               ▼
              setTrig at        setTrig at
              selectedStep      playhead
              + advance         (during playback)
                    │               │
                    └───────┬───────┘
                            ▼
                     engine.triggerNote()
                     (audition always)
```

## Implementation Phases

1. **Phase 1: Step Record** — `recording` state, `stepRecord()`, PatternToolbar REC button, integration in midi.ts + vkbd handler. ~60 LOC.
2. **Phase 2: Live Record** — `liveRecord()` with playhead-based quantization, auto-engage during playback. ~30 LOC.
3. **Phase 3: Overdub & Erase** — Hold-to-erase (record + hold note already on step = deactivate), overdub toggle (add notes without clearing existing trigs).

## Considerations

- **Quantization**: Phase 1–2 use step-grid quantization only (snap to nearest step). Sub-step timing and swing-aware quantization are future work.
- **Undo granularity**: Each note in step record gets its own undo entry. Live record batches per-loop (one undo per pass through the pattern).
- **Conflict with piano roll**: Step record writes to `selectedStep` cursor in grid view. Piano roll has its own click-to-place workflow. Record mode should be disabled or ignored when piano roll is the active editor.
- **Metronome**: Live record benefits from a click track. Not in scope here — separate feature.

## Future Extensions

- Sub-step quantization (half-step, triplet grid)
- Metronome / count-in for live record
- Note length recording (hold duration → trig.duration)
- Velocity curve / fixed velocity option
- Loop overdub with erase-on-second-pass
