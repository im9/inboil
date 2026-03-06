# ADR 031: Virtual MIDI Keyboard (PC Keyboard Input)

## Status: Implemented

## Context

INBOIL has no way to audition or input notes from a PC keyboard. Users must tap/click individual piano roll cells or the mobile fan-out keyboard to set root note — there is no "play notes live" experience. A virtual MIDI keyboard maps QWERTY keys to musical notes, enabling:

1. **Live audition** — press a key, hear the selected track's voice immediately
2. **Step recording** — while stopped, press a key to set the note for the current step and advance
3. **Real-time recording** — while playing, pressed notes are quantized and written to trigs (overdub)
4. **Root note selection** — quick key press to change root note

This is standard in most software instruments (Ableton, FL Studio, Renoise, M8 Tracker).

## Design

### Keyboard Layout

Two-row chromatic layout (standard "musical typing"):

```
┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
│ W │ E │   │ T │ Y │ U │   │ O │ P │   │  ← black keys (sharps/flats)
├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
│ A │ S │ D │ F │ G │ H │ J │ K │ L │ ; │  ← white keys
└───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
 C   D   E   F   G   A   B   C   D   E
```

Mapping (base octave = 4, MIDI 60 = C4):

| Key | Note | MIDI |
|-----|------|------|
| A | C4 | 60 |
| W | C#4 | 61 |
| S | D4 | 62 |
| E | D#4 | 63 |
| D | E4 | 64 |
| F | F4 | 65 |
| T | F#4 | 66 |
| G | G4 | 67 |
| Y | G#4 | 68 |
| H | A4 | 69 |
| U | A#4 | 70 |
| J | B4 | 71 |
| K | C5 | 72 |
| O | C#5 | 73 |
| L | D5 | 74 |
| P | D#5 | 75 |
| ; | E5 | 76 |

**Octave shift:** `Z` = octave down, `X` = octave up (shift base ±1, range C1–C7).

**Velocity:** Fixed at 0.8 by default. `1`–`9` = set velocity (0.1–0.9), `0` = 1.0.

### State

```typescript
// Phase 1: audition only — mode field deferred to Phase 2
export const vkbd = $state({
  enabled: false,          // toggle on/off (avoid conflicts with text input)
  octave: 4,               // base octave (default 4, range 1–7)
  velocity: 0.8,           // fixed velocity (0.0–1.0, default 0.8)
  heldKeys: new Set<string>(),  // currently pressed keys (for visual feedback)
})
```

Future phases will add `mode: 'audition' | 'step-record' | 'live-record'`.

### Modes

#### 1. Audition Mode (default)

Press key → trigger selected track's voice immediately (one-shot). No sequencer involvement.

```typescript
function onVkbdNoteOn(note: number, velocity: number) {
  if (vkbd.mode === 'audition') {
    engine.triggerNote(ui.selectedTrack, note, velocity)
    // triggerNote sends a one-shot message to the worklet
  }
}
```

**Engine extension needed:** `engine.triggerNote(trackId, note, velocity)` — sends a `{ type: 'triggerNote', trackId, note, velocity }` message to the worklet for immediate playback outside the sequencer clock.

#### 2. Step Record Mode

Playback stopped. Press key → set note on current step → advance cursor.

```typescript
function onVkbdNoteOn(note: number, velocity: number) {
  if (vkbd.mode === 'step-record' && !playback.playing) {
    const trackId = ui.selectedTrack
    const step = ui.selectedStep ?? 0
    const track = pattern.tracks[trackId]
    track.trigs[step].active = true
    track.trigs[step].note = note
    track.trigs[step].velocity = velocity
    // Advance to next step
    ui.selectedStep = (step + 1) % track.steps
  }
}
```

#### 3. Live Record Mode (Overdub)

Playback running. Incoming notes quantized to nearest step, written as trigs.

```typescript
function onVkbdNoteOn(note: number, velocity: number) {
  if (vkbd.mode === 'live-record' && playback.playing) {
    const trackId = ui.selectedTrack
    const step = playback.playheads[trackId]
    const track = pattern.tracks[trackId]
    track.trigs[step].active = true
    track.trigs[step].note = note
    track.trigs[step].velocity = velocity
  }
}
```

### Event Handling

Global `keydown` / `keyup` listener, active only when `vkbd.enabled` and no text input is focused.

```typescript
function handleKeyDown(e: KeyboardEvent) {
  if (!vkbd.enabled) return
  if (isTextInput(e.target)) return  // skip if typing in input/textarea
  if (e.repeat) return  // ignore key repeat

  const note = keyToNote(e.key, vkbd.octave)
  if (note !== null) {
    e.preventDefault()
    vkbd.heldKeys.add(e.key)
    onVkbdNoteOn(note, vkbd.velocity)
    return
  }

  // Octave shift
  if (e.key === 'z') { vkbd.octave = Math.max(1, vkbd.octave - 1); e.preventDefault() }
  if (e.key === 'x') { vkbd.octave = Math.min(7, vkbd.octave + 1); e.preventDefault() }

  // Velocity
  const vNum = parseInt(e.key)
  if (vNum >= 1 && vNum <= 9) { vkbd.velocity = vNum / 10; e.preventDefault() }
  if (e.key === '0') { vkbd.velocity = 1.0; e.preventDefault() }
}

function handleKeyUp(e: KeyboardEvent) {
  if (!vkbd.enabled) return
  vkbd.heldKeys.delete(e.key)
  const note = keyToNote(e.key, vkbd.octave)
  if (note !== null) {
    onVkbdNoteOff(note)
  }
}
```

### UI

#### Toggle Button

Add a keyboard icon button (`⌨`) in PerfBar, next to the existing KEY button. Tap to toggle `vkbd.enabled`.

```
[⌨] C4        (Phase 1: octave display only)
```

On mobile: hidden (physical keyboard unlikely). On desktop: visible in PerfBar.
Velocity is settable via number keys (1–9 = 0.1–0.9, 0 = 1.0) but not yet shown in UI. Mode selector deferred to Phase 2.

#### Visual Feedback

When `vkbd.enabled`:
- Show a compact keyboard strip below PerfBar (or as overlay)
- Highlight pressed keys in real-time (`vkbd.heldKeys`)
- Show current octave and velocity
- Mode indicator (AUD/STEP/LIVE)

#### Keyboard Strip (Optional, Phase 2)

A visual representation showing which keys map to which notes:

```
┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐
│W│E│ │T│Y│U│ │O│P│ │  ← rendered as mini piano
├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
│A│S│D│F│G│H│J│K│L│;│
└─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘
 C4 D4 E4 F4 G4 A4 B4 C5
```

### Worklet Extension

The worklet needs a new message type for immediate note trigger:

```typescript
// In worklet-processor.ts
case 'triggerNote': {
  const { trackId, note, velocity } = msg
  const voice = voices[trackId]
  voice.noteOn(note, velocity, sampleRate)
  break
}
```

This bypasses the sequencer — the voice is triggered immediately, independent of the step clock.

## Implementation Order

1. **Phase 1: Audition mode** — keydown → triggerNote. Toggle button in PerfBar. Most immediate value.
2. **Phase 2: Step record** — write notes to trigs with cursor advance. Requires `ui.selectedStep` integration.
3. **Phase 3: Live record** — quantized overdub during playback.
4. **Phase 4: Visual keyboard strip** — optional visual feedback.

## Interaction with ADR 016 (Web MIDI)

Virtual keyboard and hardware MIDI input serve the same purpose (note input). They should share the same handler pipeline:

```
PC keyboard → keyToNote() ─┐
                            ├──→ onNoteOn(note, velocity) → audition / record
MIDI controller → msg.data ─┘
```

When ADR 016 is implemented, the virtual keyboard becomes one of multiple input sources feeding the same note handler.

## Consequences

- **Positive:** Enables live playing and auditioning without mouse — fundamental for music tools
- **Positive:** Step record mode dramatically speeds up melody input
- **Positive:** No external dependencies — pure keyboard event handling
- **Positive:** Shares pipeline with future MIDI input (ADR 016)
- **Negative:** Key mapping conflicts with future keyboard shortcuts (must be togglable)
- **Negative:** Desktop-only feature (mobile has no physical keyboard)
- **Risk:** Text input focus detection must be reliable to avoid phantom notes while typing pattern names etc.
- **Dependency:** Requires new `triggerNote` message in worklet (minor extension)

## Implementation Notes (Phase 1)

### Changed Files

| File | Changes |
|------|---------|
| `src/lib/audio/dsp/types.ts` | Added `triggerNote` and `releaseNote` to `WorkletCommand` type union |
| `src/lib/audio/worklet-processor.ts` | `triggerNote` handler (voice.noteOn), `releaseNote` handler (voice.noteOff), voice tick in non-playing state |
| `src/lib/audio/engine.ts` | `triggerNote()` and `releaseNote()` methods |
| `src/lib/state.svelte.ts` | `vkbd` state (enabled, octave, velocity, heldKeys) |
| `src/lib/components/PerfBar.svelte` | Toggle button (SVG piano icon), key listener ($effect), ensureEngine() for lazy init |
| `src/lib/components/PianoRoll.svelte` | Octave linked to `vkbd.octave` (single source of truth) |
| `src/lib/components/Sidebar.svelte` | Help section for virtual keyboard |

### Key Decisions

- **Octave sync**: `vkbd.octave` is the single source of truth. Piano roll's `octaveOffset` is derived from it. Both ▲▼ buttons and Z/X keys modify the same value.
- **Lazy engine init**: First keypress calls `engine.init()` + `sendPattern()` if not already running, so the keyboard works without pressing play first.
- **NoteOff on all-keys-up**: `releaseNote` is sent when `heldKeys` becomes empty (not per-key), so legato transitions between keys work naturally.
- **Voice tick when stopped**: The worklet's `process()` loop now ticks voices even when `playing === false`, enabling audition without transport.
