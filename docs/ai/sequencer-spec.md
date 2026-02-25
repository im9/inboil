# Sequencer Specification

## Overview

A step sequencer modeled after Elektron-style trig-based sequencing.
Each pattern contains multiple tracks; each track has an independent step count and a list of trigs.

## Core Concepts

| Term | Definition |
|---|---|
| Pattern | A collection of tracks played simultaneously. One pattern plays at a time. |
| Track | A single instrument lane. Has its own step count, BPM multiplier, and trig list. |
| Trig | An active step that triggers a note/sound. Inactive steps are "empty". |
| Step | One position in a track's sequence grid (1-indexed). |
| Parameter Lock (p-lock) | Per-trig override of a synth parameter. See status below. |

## Pattern

```
Pattern {
  id:        string
  name:      string
  bpm:       number          // 20–300
  tracks:    Track[]         // fixed at 8 tracks (v1)
}
```

## Track

```
Track {
  id:          string
  synthType:   SynthType      // see sound-design.md
  steps:       number         // DECIDED: 1–64 (default 16)
  scale:       number         // step length multiplier: 0.5 | 1 | 2  (e.g. 2 = half-speed)
  trigs:       Trig[]
  muted:       boolean
  volume:      number         // 0.0–1.0
  pan:         number         // -1.0 to 1.0
}
```

## Trig

```
Trig {
  step:        number         // 1-indexed step position
  note:        number         // MIDI note number 0–127
  velocity:    number         // 0.0–1.0
  length:      number         // gate length in steps (0.0–1.0 = fraction of one step)
  paramLocks:  ParamLock[]    // DEFERRED — see below
}
```

## Variable Step Count — DECIDED

- Each track has an independent step count from **1 to 64**.
- Default is 16 steps.
- When tracks have different step counts, they cycle independently (polymetric sequencing).
- Example: Track 1 = 16 steps, Track 2 = 12 steps → creates a phasing rhythm.

## Parameter Lock (p-lock) — DEFERRED

Parameter locks allow any synth parameter to be overridden on a per-trig basis,
reverting to the track default on the next trig.

```
ParamLock {
  param:  string    // parameter name, e.g. "filterCutoff"
  value:  number
}
```

**Implementation status:** DEFERRED to a later milestone.
The data model above is included so the architecture supports it from the start.
Do NOT implement p-lock UI or DSP handling in v1.

## Playback Engine

- Global BPM stored in Pattern; individual tracks can have a `scale` multiplier.
- The sequencer clock runs inside the WASM DSP on the AudioWorklet thread.
- The UI reads playhead position via SharedArrayBuffer (read-only from UI side).
- Trig events are sent from WASM → UI via MessagePort for visual feedback only.

## Playback States

```
STOPPED → PLAYING → STOPPED
              ↕
           PAUSED
```

- STOPPED: Playhead at step 1, no audio output from sequencer.
- PLAYING: Advancing step clock, triggering synth voices.
- PAUSED: Clock frozen; resuming continues from current step.

## Pattern Chaining

### End-of-pattern switch — DECIDED

When the user selects a new pattern during playback, the switch happens at the end of the current pattern's cycle (not immediately).
This prevents mid-pattern interruptions during live performance.

```
State: playing PAT:01
User selects PAT:02
→ PAT:01 plays to the end of its longest track
→ PAT:02 starts from step 1
```

The "pending next pattern" is displayed in the UI (e.g. `PAT:01 → 02`) until the switch occurs.
If the user selects a different pattern before the switch, the pending target is replaced.

### Multi-pattern Queue — DEFERRED

Pre-queuing a sequence of patterns (e.g. 01→02→02→03) is a future feature.
Do not implement in v1.
