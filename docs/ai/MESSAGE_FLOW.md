# Worklet Message Flow

UI (main thread) ↔ AudioWorklet (audio thread) communication.

## Message Types

### UI → Worklet (WorkletCommand)

| type | key params | when sent |
|---|---|---|
| `play` | — | User presses play |
| `stop` | — | User presses stop |
| `setBpm` | `bpm` | BPM changed during playback |
| `setPattern` | `pattern`, `reset?` | Pattern sync (edit/switch) |
| `triggerNote` | `trackId`, `note`, `velocity` | Keyboard/UI audition |
| `releaseNote` | `trackId` | Key up |
| `releaseNoteByPitch` | `trackId`, `note` | Poly key up |
| `loadSample` | `trackId`, `buffer` (transfer), `sampleRate` | Sample cache hit |
| `loadZones` | `trackId`, `zones[]` | Pack zones cache hit |

### Worklet → UI (WorkletEvent)

| type | data | frequency |
|---|---|---|
| `step` | `playheads[]`, `cycle` | Every track step advance |
| `levels` | `peakL`, `peakR`, `gr`, `cpu` | ~60 fps (meter interval) |

## Sequence: Initial Play

```mermaid
sequenceDiagram
    participant U as UI (App.svelte)
    participant E as Engine
    participant W as Worklet

    U->>E: play()
    E->>E: init() — AudioContext + WorkletNode
    E->>W: setPattern(reset=false)
    E->>W: loadSample / loadZones (from cache)
    E->>W: play

    Note over W: Commit pending perf state<br/>Playheads → steps-1<br/>voices[t].reset()<br/>Accum = threshold (trigger step 0)

    W->>W: process() → advance to step 0 → noteOn
    W->>U: step { playheads, cycle=false }

    Note over U: $effect fires (batched)
    U->>E: sendPatternByIndex(reset=false)
    E->>W: setPattern(reset=false)
    Note over W: Same data, no-op (no reset)
```

## Sequence: Loop Cycle (no queue)

```mermaid
sequenceDiagram
    participant U as UI (App.svelte)
    participant W as Worklet

    Note over W: patternPos >= patternLen<br/>→ patternPos=0, pendingCycle=true

    W->>W: _advanceTrack → step 0 noteOn
    W->>U: step { playheads, cycle=true }

    Note over U: onStep: mode≠scene,<br/>no queuedPattern → return
    Note over W: Continues playing<br/>(natural loop, no reset)
```

## Sequence: Loop Cycle (queued pattern switch)

```mermaid
sequenceDiagram
    participant U as UI (App.svelte)
    participant E as Engine
    participant W as Worklet

    Note over U: User queues pattern B<br/>playback.queuedPattern = B

    W->>U: step { playheads, cycle=true }

    Note over U: onStep: cycle + queuedPattern
    U->>U: playingPattern = B<br/>queuedPattern = null
    U->>E: sendPatternByIndex(reset=true, B)
    E->>W: setPattern(pattern=B, reset=true)
    E->>W: loadSample / loadZones (if needed)

    Note over W: voices[t].reset()<br/>Playheads → steps-1<br/>Accum = threshold

    W->>W: process() → step 0 of pattern B
    W->>U: step { playheads, cycle=false }
```

## Sequence: Scene Cycle (pattern switch)

```mermaid
sequenceDiagram
    participant U as UI (App.svelte)
    participant S as ScenePlayback
    participant E as Engine
    participant W as Worklet

    W->>U: step { playheads, cycle=true }

    Note over U: onStep: mode=scene, cycle=true
    U->>S: advanceSceneNode()
    S->>S: walkToNode(edge)<br/>applyDecorators()<br/>applyLiveGenerative()
    S-->>U: { advanced=true, patternIndex=B }

    U->>U: perf.rootNote = transpose
    U->>E: sendPatternByIndex(reset=true, B)
    E->>W: setPattern(pattern=B, reset=true)
    E->>W: loadSample / loadZones (if needed)

    Note over W: voices[t].reset()<br/>Playheads → steps-1<br/>Accum = threshold

    W->>W: process() → step 0 of pattern B
    W->>U: step { playheads, cycle=false }

    Note over U: $effect fires (playingPattern changed)
    U->>E: sendPatternByIndex(reset=false, B)
    E->>W: setPattern(reset=false)
    Note over W: Same data, no-op
```

## Sequence: Live Edit During Playback

```mermaid
sequenceDiagram
    participant U as UI (StepGrid/PianoRoll)
    participant A as App.svelte $effect
    participant E as Engine
    participant W as Worklet

    U->>U: Modify trig / voiceParam / FX
    U->>U: songVer.v++ (bump version)

    Note over A: $effect dependency changed<br/>playback.playing=true → send immediately

    A->>E: sendPatternByIndex(reset=false)
    E->>W: setPattern(reset=false)

    Note over W: tracks[] updated<br/>voiceParams applied<br/>Playheads NOT reset<br/>New data heard on next step
```

## Sequence: Stop

```mermaid
sequenceDiagram
    participant U as UI (App.svelte)
    participant E as Engine
    participant W as Worklet

    U->>E: stop()
    E->>W: stop

    Note over W: playing=false<br/>playheads → 0<br/>gateCounters → 0<br/>voices[t].noteOff()

    Note over W: FX tails continue<br/>(reverb/delay decay)

    U->>U: Reset perf, FX, scene state
    U->>U: playback.mode = 'loop'
    U->>U: projectAutoSave()

    Note over E: Suspend AudioContext<br/>after 8s (save CPU)
```

## Timing: Cycle Boundary Gap

```
┌──────────────────────────────────────────────────────────────────┐
│ Worklet process() N                                              │
│  patternPos >= patternLen → pendingCycle = true                  │
│  _advanceTrack → step 0 noteOn (OLD pattern data)               │
│  postMessage({ step, cycle: true })                              │
├──────────────────────────────────────────────────────────────────┤
│ Worklet process() N+1, N+2  (2.7ms each @ 48kHz)                │
│  Tracks continue advancing with OLD data                         │
│  (gap: waiting for UI to respond)                                │
├──────────────────────────────────────────────────────────────────┤
│ Main thread receives step event                                  │
│  advanceSceneNode() → resolve next pattern                       │
│  sendPatternByIndex(reset=true, newPattern)                      │
├──────────────────────────────────────────────────────────────────┤
│ Worklet receives setPattern(reset=true)                          │
│  voices[t].reset() — silence old notes                           │
│  Playheads → steps-1, accum = threshold                          │
├──────────────────────────────────────────────────────────────────┤
│ Worklet process() N+K                                            │
│  step 0 of NEW pattern fires cleanly                             │
└──────────────────────────────────────────────────────────────────┘

Round-trip latency: ~3–10ms (1–3 process() calls)
During this gap, OLD pattern step 0+ plays briefly before reset.
```

## Pattern Sync: $effect vs Direct Send

| Source | reset | When |
|---|---|---|
| `$effect` (line 81) | `false` | Any reactive state change (songVer, perf, fxPad, etc.) |
| `play()` (line 228/233) | `false` | Initial play — paired with `engine.play()` |
| `onStep` cycle (line 179/190) | `true` | Pattern switch at cycle boundary |
| Solo node (line 167) | `true` | Solo target reached at cycle |

**Rule**: `reset=true` rewinds playheads and retriggers step 0. `reset=false` hot-swaps data mid-playback.

## Worklet Internal: Pending State

Performance parameters are NOT applied immediately — they are committed at step boundaries to prevent mid-note changes:

| Pending Field | Committed When |
|---|---|
| `pendingRootNote` | `play` handler OR every 1/16 boundary (patternPos even) |
| `pendingBreaking` | Same |
| `pendingFilling` | Same |
| `pendingReversing` | Same |
| `pendingOctave` | `setPattern(reset=true)` only |
