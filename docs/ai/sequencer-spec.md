# Sequencer Specification

## Overview

A step sequencer modeled after Elektron-style trig-based sequencing.
Each pattern contains multiple tracks; each track has an independent step count and a list of trigs.

## Core Concepts

| Term | Definition |
|---|---|
| Pattern | A collection of tracks played simultaneously. One pattern plays at a time. |
| Track | A single instrument lane. Has its own step count, synth type, and trig list. |
| Trig | An active step that triggers a note/sound. Inactive steps are "empty". |
| Step | One position in a track's sequence grid (0-indexed internally, 1-indexed in UI). |
| Pattern Bank | 8 pattern slots stored in memory. Switching saves/loads full pattern state. |

## Pattern — DECIDED

```typescript
Pattern {
  id:        number          // 1–8 (maps to patternBank index 0–7)
  name:      string          // e.g. "PAT 01"
  bpm:       number          // 20–300
  tracks:    Track[]         // fixed at 8 tracks
}
```

The app maintains a **pattern bank** of 8 slots. Slot 0 is initialized with a demo pattern; slots 1–7 are empty. Switching patterns saves the current pattern to its bank slot and loads the target.

## Track — DECIDED

```typescript
Track {
  id:          number
  name:        string          // ALL CAPS display name (e.g. "KICK", "BASS")
  synthType:   SynthType       // 'DrumSynth' | 'NoiseSynth' | 'AnalogSynth' | 'FMSynth' | 'Sampler' | 'ChordSynth'
  steps:       number          // 1–64 (default 16)
  trigs:       Trig[]          // length === steps; index 0 = step 1
  muted:       boolean
  volume:      number          // 0.0–1.0
  pan:         number          // -1.0 to 1.0
  bottomPanel: 'params' | 'piano'   // which panel to show (melodic tracks only)
  reverbSend:  number          // 0.0–1.0 send level to reverb
  delaySend:   number          // 0.0–1.0 send level to delay
  voiceParams: Record<string, number>  // per-voice tunable parameters (see paramDefs.ts)
}
```

## Trig — DECIDED

```typescript
Trig {
  active:      boolean         // whether this step triggers
  note:        number          // MIDI note number 0–127 (60 = C4)
  velocity:    number          // 0.0–1.0
}
```

No `length` or `paramLocks` fields — those are deferred.

## Default Track Layout — DECIDED

| Track | Name | SynthType | Voice Class | Default Note | Default Pan |
|---|---|---|---|---|---|
| 0 | KICK | DrumSynth | KickVoice | 60 | 0.00 |
| 1 | SNARE | DrumSynth | SnareVoice | 60 | -0.10 |
| 2 | CLAP | DrumSynth | ClapVoice | 60 | 0.15 |
| 3 | C.HH | NoiseSynth | HatVoice | 60 | -0.30 |
| 4 | O.HH | NoiseSynth | OpenHatVoice | 60 | 0.35 |
| 5 | CYM | NoiseSynth | CymbalVoice | 60 | 0.25 |
| 6 | BASS | AnalogSynth | TB303Voice | 48 | 0.00 |
| 7 | LEAD | AnalogSynth | MoogVoice | 64 | 0.10 |

Tracks 0–5 are drums (note is ignored; fixed pitch set by voice params).
Tracks 6–7 are melodic (note from trigs, transposable by KEY).

## Variable Step Count — DECIDED

- Each track has an independent step count from **1 to 64**.
- Default is 16 steps.
- When tracks have different step counts, they cycle independently (polymetric sequencing).
- Example: Track 1 = 16 steps, Track 2 = 12 steps → creates a phasing rhythm.

## Playback Engine — DECIDED

- Global BPM stored in Pattern.
- The sequencer clock runs in TypeScript on the AudioWorklet thread.
- One step = `(60 / bpm / 4) * sampleRate` samples (16th note resolution).
- The UI receives playhead positions via MessagePort `step` events.
- Each track maintains an independent playhead (0-indexed).

## Playback States — DECIDED

```
STOPPED → PLAYING → STOPPED
```

- **STOPPED**: Playheads at 0, no audio output from sequencer.
- **PLAYING**: Advancing step clock, triggering synth voices.

No PAUSED state is implemented.

## Pattern Switching — DECIDED

### During stopped state
Switching pattern immediately saves the current pattern to its bank slot and loads the target.

### During playback (queued switch)
When the user selects a new pattern during playback, the switch is **queued** and applies at the **end of the current loop** (when track 0's playhead wraps to step 0).

```
State: playing PAT:01
User selects PAT:02
→ patternNav.pendingId = 2
→ AppHeader shows PAT:02 with blinking animation
→ PAT:01 plays to the end of its cycle
→ onStep detects track 0 wraps → applyPendingSwitch()
→ PAT:02 starts from step 0
```

If the user selects a different pattern before the switch happens, the pending target is replaced.
On stop, any pending switch is applied immediately.

See [adr/004-queued-pattern-switch.md](./adr/004-queued-pattern-switch.md).

## Parameter Lock (p-lock) — DEFERRED

Per-trig parameter overrides. The data model is not implemented in v1.

## Scale (per-track time multiplier) — DEFERRED

The `scale` field (0.5 | 1 | 2) for per-track speed multiplier is not yet implemented.

## Randomize — DECIDED

The randomize function generates musically coherent patterns:
- **Drum tracks**: Probability-based per-drum-type generation (kick: beats 1+3, snare: beats 2+4, etc.)
- **Melodic tracks**: Scale-quantized random notes from a randomly chosen root + scale (minor/major pentatonic, dorian)
- Bass uses lower note pool (C3–B3), lead uses upper pool (C4–B4)
