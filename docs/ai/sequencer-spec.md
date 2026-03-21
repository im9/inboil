# Sequencer Specification

## Overview

A step sequencer modeled after Elektron-style trig-based sequencing.
The data model uses a Song → Pattern → Cell hierarchy (ADR 042/044). Each Pattern contains N Cells (one per track, up to 16 tracks per ADR 056), and each Cell has an independent step count and trig list.

## Core Concepts

| Term | Definition |
|---|---|
| Song | Top-level container: BPM, rootNote, tracks (instrument config), patterns (pool), sections, scene graph. |
| Pattern | A reusable unit of music: id + name + N cells (one per track). One pattern plays at a time. |
| Cell | Step data for one track in one pattern: name, voiceId, steps, trigs, voiceParams, FX sends. |
| Track | Instrument configuration only: id, name, voiceId, muted, volume, pan. |
| Section | Arrangement slot referencing a pattern by index, with optional metadata (repeats, key, FX). |
| Scene | Node-based directed graph for arrangement. Nodes reference patterns or apply functions. |
| Trig | An active step that triggers a note/sound. Inactive steps are "empty". |
| Step | One position in a cell's sequence grid (0-indexed internally, 1-indexed in UI). |

## Song — DECIDED

```typescript
Song {
  name:            string
  bpm:             number            // 40–240
  rootNote:        number            // 0–11 (C=0, C#=1, ..., B=11) — song-level key
  tracks:          Track[]           // up to 16 (mixer-only, ADR 056/080)
  patterns:        Pattern[]         // pattern pool (100 slots: 21 factory + 79 user)
  sections:        Section[]         // arrangement slots referencing patterns
  scene:           Scene             // arrangement graph (ADR 044)
  effects:         Effects           // global send/bus FX params
  flavours?:       FxFlavours        // per-song FX flavour selection (ADR 075)
  fxPadState?:     FxPadState        // persisted FxPad node positions
  masterPadState?: MasterPadState    // persisted master pad positions
  masterGain?:     number            // 0–1 master volume
  swing?:          number            // 0–1 swing amount
}
```

## Pattern — DECIDED

```typescript
Pattern {
  id:        string            // e.g. 'pat_00'
  name:      string            // max 8 chars
  color:     number            // 0–7 index into PATTERN_COLORS
  cells:     Cell[]            // one per track (up to 16)
}
```

The song maintains a pool of 100 pattern slots. Slots 0–20 are factory patterns (demo); slots 21–99 are empty user slots. Patterns are referenced by index.

## Cell — DECIDED

```typescript
Cell {
  trackId:      number         // stable reference to Track.id (ADR 079)
  name:         string         // per-pattern track name (ADR 062)
  voiceId:      VoiceId | null  // per-pattern instrument (null = unassigned, ADR 056/062)
  steps:        number         // 1–64
  trigs:        Trig[]         // length === steps
  voiceParams:  Record<string, number>  // per-voice tunable parameters (see paramDefs.ts)
  presetName?:  string         // applied preset name (display only)
  reverbSend:   number         // 0.0–1.0 send level to reverb
  delaySend:    number         // 0.0–1.0 send level to delay
  glitchSend:   number         // 0.0–1.0 send level to glitch
  granularSend: number         // 0.0–1.0 send level to granular
  insertFx?:    [CellInsertFx | null, CellInsertFx | null]  // dual insert FX chain (ADR 077/114)
  sampleRef?:   CellSampleRef  // per-cell sample reference (ADR 110)
  scale?:       number         // step divisor: 4=1/8, 3=3/16, 2=1/16 (default), 1.5=3/32, 1=1/32 (ADR 112)
}

CellInsertFx {
  type:    'verb' | 'delay' | 'glitch' | null
  flavour: string             // e.g. 'room', 'hall', 'tape', 'bitcrush'
  mix:     number             // 0.0–1.0
  x:       number             // 0.0–1.0 param1
  y:       number             // 0.0–1.0 param2
}
```

## Track — DECIDED

```typescript
Track {
  id:          number
  muted:       boolean
  volume:      number          // 0.0–1.0
  pan:         number          // -1.0 to 1.0
}
```

Track is mixer-only (ADR 080). Name and voiceId moved to Cell for per-pattern assignment (ADR 062).
Step data (trigs, voiceParams, sends) lives in Cell.
Voice can be changed per-pattern via VoicePicker in DockPanel (ADR 009).

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
  flavours?:    Partial<FxFlavours>  // per-section FX flavour override (ADR 076)
}
```

## Scene — DECIDED

```typescript
Scene {
  name:   string
  nodes:  SceneNode[]
  edges:  SceneEdge[]
  labels: SceneLabel[]        // free-floating canvas text labels (ADR 052)
}

SceneDecorator {
  type:              'transpose' | 'tempo' | 'repeat' | 'fx' | 'automation'
  params:            Record<string, number>
  automationParams?: AutomationParams  // for type === 'automation' (ADR 053)
}

AutomationPoint {
  t: number          // 0.0–1.0 — position within pattern duration
  v: number          // 0.0–1.0 — normalized parameter value
}

AutomationTarget =
  | { kind: 'global'; param: 'tempo' | 'masterVolume' | 'swing' | 'compThreshold' | 'compRatio'
                            | 'compMakeup' | 'compAttack' | 'compRelease' | 'duckDepth' | 'duckRelease'
                            | 'retVerb' | 'retDelay' }
  | { kind: 'track';  trackIndex: number; param: 'volume' | 'pan' }
  | { kind: 'fx';     param: 'reverbWet' | 'reverbDamp' | 'delayTime' | 'delayFeedback'
                            | 'filterCutoff' | 'glitchX' | 'glitchY' | 'granularSize' | 'granularDensity' }
  | { kind: 'eq';     band: 'eqLow' | 'eqMid' | 'eqHigh'; param: 'freq' | 'gain' | 'q' }
  | { kind: 'send';   trackIndex: number; param: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend' }

AutomationParams {
  target:        AutomationTarget
  points:        AutomationPoint[]
  interpolation: 'linear' | 'smooth'
}

SceneNode {
  id:                string
  type:              'pattern' | 'generative' | FnNodeType | LegacyFnType
                     // FnNodeType = 'transpose' | 'tempo' | 'repeat' | 'fx' (ADR 093/116)
                     // LegacyFnType = 'probability' | 'automation' (migration only)
  x:                 number           // canvas position (normalized 0–1)
  y:                 number
  root:              boolean          // true = playback entry point (exactly one)
  patternId?:        string           // for type === 'pattern'
  params?:           Record<string, number>       // legacy fn node params (migration only)
  automationParams?: AutomationParams // legacy automation (migration only)
  fnParams?:         FnParams         // function node params (ADR 093/116)
  decorators?:       SceneDecorator[] // deprecated (ADR 093) — migrated to fn nodes
  generative?:       GenerativeConfig // for type === 'generative' (ADR 078)
}

FnNodeType = 'transpose' | 'tempo' | 'repeat' | 'fx'

FnParams {
  transpose?: { semitones: number; mode: 'rel' | 'abs'; key?: number }
  tempo?:     { bpm: number }
  repeat?:    { count: number }
  fx?:        { verb: boolean; delay: boolean; glitch: boolean; granular: boolean }
}

SceneEdge {
  id:    string
  from:  string                // source node id
  to:    string                // target node id
  order: number                // playback order when multiple edges from same source
}
```

```typescript
SceneLabel {
  id:    string
  text:  string
  x:     number               // normalized 0–1
  y:     number
  size?: number               // font scale factor (default 1.0 = 10px)
}
```

### Generative Config (ADR 078/089)

```typescript
GenerativeConfig {
  engine:      GenerativeEngine  // 'turing' | 'quantizer' | 'tonnetz'
  mergeMode:   'replace' | 'merge' | 'layer'  // 'layer' deprecated → treated as 'replace' (ADR 117)
  targetTrack: number            // auto-selected on connect to first unused track
  seed?:       number
  params:      TuringParams | QuantizerParams | TonnetzParams
}
```

### Function Node Satellite Model (ADR 116)

Function nodes (transpose/repeat/tempo/fx) attach as **satellites** to pattern nodes — no manual edge wiring needed. They are rendered as naked SVG icons positioned above their parent pattern node. Edges from fn nodes are hidden visually but maintained in data for playback. Drag a satellite away to detach; drop on another pattern to reattach. Same-type duplicates on one pattern are replaced automatically. During scene playback, satellite fn effects are applied via `applySatelliteFnNodes()` when entering a pattern.

### Auto-generate on Connect (ADR 117)

Connecting a generative node to a pattern triggers automatic generation. Parameter changes debounce-regenerate (300ms). Target track auto-selects the first unused track. Merge mode simplified to replace (default) and fill (empty steps only).

See ADR 044 for scene graph design, ADR 053 for automation, ADR 078 for generative nodes, ADR 116 for function node UX, ADR 117 for generative UX simplification.

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
  notes?:      number[]       // poly: all chord notes (includes primary `note`); absent = mono [note]
}
```

See ADR 021 for duration/slide, ADR 028 for chance, ADR 014 for parameter locks.

## Default Track Layout — DECIDED

| Track | Name | VoiceId | Voice Class | Default Note | Default Pan |
|---|---|---|---|---|---|
| 0 | KICK | Kick | DrumMachine | 60 | 0.00 |
| 1 | SNARE | Snare | DrumMachine | 60 | -0.10 |
| 2 | CLAP | Clap | DrumMachine | 60 | 0.15 |
| 3 | C.HH | Hat | DrumMachine | 60 | -0.30 |
| 4 | O.HH | OpenHat | DrumMachine | 60 | 0.35 |
| 5 | RIDE | Ride | SamplerVoice | 60 | 0.25 |
| 6 | BASS | Bass303 | TB303Voice | 48 | 0.00 |
| 7 | FM | FM | FMVoice | 57 | 0.00 |
| 8 | LEAD | MoogLead | MoogVoice | 60 | 0.00 |

Tracks 0–5 are drums (note is ignored; fixed pitch set by voice params).
Tracks 6–8 are melodic (note from trigs, transposable by KEY).

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

## Step Scale (per-track resolution) — IMPLEMENTED

Per-track step resolution via the `scale` divisor on Cell (ADR 112). Values: 4 (1/8), 3 (3/16), 2 (1/16, default), 1.5 (3/32), 1 (1/32). The sequencer base tick is 1/32; each track's step advance is multiplied by its divisor. Different divisors across tracks create polyrhythmic patterns.

## Randomize — DECIDED

The randomize function generates musically coherent patterns:
- **Drum tracks**: Probability-based per-drum-type generation (kick: beats 1+3, snare: beats 2+4, etc.)
- **Melodic tracks**: Scale-quantized random notes from a randomly chosen root + scale (minor/major pentatonic, dorian)
- Bass uses lower note pool (C3–B3), lead uses upper pool (C4–B4)
