# Sequencer Specification

## Overview

A step sequencer modeled after Elektron-style trig-based sequencing.
The data model uses a Song → Pattern → Cell hierarchy (ADR 042/044). Each Pattern contains 8 Cells (one per track), and each Cell has an independent step count and trig list.

## Core Concepts

| Term | Definition |
|---|---|
| Song | Top-level container: BPM, rootNote, tracks (instrument config), patterns (pool), sections, scene graph. |
| Pattern | A reusable unit of music: id + name + 8 cells. One pattern plays at a time. |
| Cell | Step data for one track in one pattern: steps, trigs, voiceParams, FX sends. |
| Track | Instrument configuration only: id, name, synthType, muted, volume, pan. |
| Section | Arrangement slot referencing a pattern by index, with optional metadata (repeats, key, FX). |
| Scene | Node-based directed graph for arrangement. Nodes reference patterns or apply functions. |
| Trig | An active step that triggers a note/sound. Inactive steps are "empty". |
| Step | One position in a cell's sequence grid (0-indexed internally, 1-indexed in UI). |

## Song — DECIDED

```typescript
Song {
  name:      string
  bpm:       number            // 20–300
  rootNote:  number            // 0–11 (C=0, C#=1, ..., B=11) — song-level key
  tracks:    Track[]           // 8 fixed (instrument config only)
  patterns:  Pattern[]         // pattern pool (100 slots: 21 factory + 79 user)
  sections:  Section[]         // arrangement slots referencing patterns
  scene:     Scene             // arrangement graph (ADR 044)
}
```

## Pattern — DECIDED

```typescript
Pattern {
  id:        string            // e.g. 'pat_00'
  name:      string            // max 8 chars
  cells:     Cell[]            // 8 fixed (one per track)
}
```

The song maintains a pool of 100 pattern slots. Slots 0–20 are factory patterns (demo); slots 21–99 are empty user slots. Patterns are referenced by index.

## Cell — DECIDED

```typescript
Cell {
  steps:        number         // 1–64
  trigs:        Trig[]         // length === steps
  voiceParams:  Record<string, number>  // per-voice tunable parameters (see paramDefs.ts)
  reverbSend:   number         // 0.0–1.0 send level to reverb
  delaySend:    number         // 0.0–1.0 send level to delay
  glitchSend:   number         // 0.0–1.0 send level to glitch
  granularSend: number         // 0.0–1.0 send level to granular
}
```

## Track — DECIDED

```typescript
Track {
  id:          number
  name:        string          // ALL CAPS display name (e.g. "KICK", "BASS")
  synthType:   SynthType       // 'DrumSynth' | 'NoiseSynth' | 'AnalogSynth' | 'FMSynth' | 'Sampler' | 'ChordSynth'
  muted:       boolean
  volume:      number          // 0.0–1.0
  pan:         number          // -1.0 to 1.0
}
```

Track is instrument config only. Step data (trigs, voiceParams, sends) lives in Cell.

## Section — DECIDED

```typescript
Section {
  patternIndex: number         // index into Song.patterns
  repeats:      number         // 1–16
  key?:         number         // root note override (0–11)
  oct?:         number         // octave override
  perf?:        number         // 0=NONE, 1=FILL, 2=BRK, 3=REV
  perfLen?:     number         // steps (1/4/8/16)
  verb?:        ChainFx
  delay?:       ChainFx
  glitch?:      ChainFx
  granular?:    ChainFx
}
```

## Scene — DECIDED

```typescript
Scene {
  name:   string
  nodes:  SceneNode[]
  edges:  SceneEdge[]
}

SceneNode {
  id:         string
  type:       'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx'
  x:          number           // canvas position (normalized 0–1)
  y:          number
  root:       boolean          // true = playback entry point (exactly one)
  patternId?: string           // for type === 'pattern'
  params?:    Record<string, number>
}

SceneEdge {
  id:    string
  from:  string                // source node id
  to:    string                // target node id
  order: number                // playback order when multiple edges from same source
}
```

See ADR 044 for scene graph design and playback traversal.

## Trig — DECIDED

```typescript
Trig {
  active:      boolean         // whether this step triggers
  note:        number          // MIDI note number 0–127 (60 = C4)
  velocity:    number          // 0.0–1.0
  duration:    number          // step count 1–16 (default 1), gate length
  slide:       boolean         // slide/glide flag (default false)
  chance?:     number          // 0.0–1.0, undefined = always fire (100%)
  paramLocks?: Record<string, number>  // per-step voice param overrides (P-Lock)
}
```

See ADR 021 for duration/slide, ADR 028 for chance, ADR 014 for parameter locks.

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

- Each cell has an independent step count from **1 to 64**.
- Default is 16 steps.
- When cells have different step counts, they cycle independently (polymetric sequencing).
- Example: Cell 1 = 16 steps, Cell 2 = 12 steps → creates a phasing rhythm.

## Playback Engine — DECIDED

- Global BPM stored in Song.
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

### Manual selection
Selecting a pattern via MatrixView or SectionNav sets `ui.currentPattern` and sends the new pattern to the engine immediately.

### Scene graph playback
When the scene graph is active (has a root node) and `playback.mode === 'scene'`, the graph drives pattern advancement at beat boundaries. See ADR 044 for traversal logic.

### Solo pattern
`playback.soloNodeId` targets a scene node for solo repeat. When the scene reaches that node, the engine loops its pattern exclusively. If the node is not yet playing, solo enters an "armed" state until the scene reaches it. Solo switches happen at cycle boundaries.

See [adr/004-queued-pattern-switch.md](./adr/004-queued-pattern-switch.md).

## Parameter Lock (p-lock) — IMPLEMENTED

Per-trig parameter overrides via `paramLocks` field on Trig. When a step has p-locks, the engine merges `cell.voiceParams` with `trig.paramLocks` (locks win). Editing is done via `lockMode` toggle in DockPanel (desktop) or MobileParamOverlay (mobile). See ADR 014.

## Scale (per-track time multiplier) — DEFERRED

The `scale` field (0.5 | 1 | 2) for per-track speed multiplier is not yet implemented.

## Randomize — DECIDED

The randomize function generates musically coherent patterns:
- **Drum tracks**: Probability-based per-drum-type generation (kick: beats 1+3, snare: beats 2+4, etc.)
- **Melodic tracks**: Scale-quantized random notes from a randomly chosen root + scale (minor/major pentatonic, dorian)
- Bass uses lower note pool (C3–B3), lead uses upper pool (C4–B4)
