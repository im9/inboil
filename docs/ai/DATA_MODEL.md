# Data Model

## Song Structure

```mermaid
erDiagram
    Song ||--o{ Track : "tracks[]"
    Song ||--o{ Pattern : "patterns[]"
    Song ||--|| Scene : "scene"
    Song ||--|| Effects : "effects"

    Pattern ||--o{ Cell : "cells[]"
    Cell ||--o{ Trig : "trigs[]"
    Cell ||--o| CellInsertFx : "insertFx?"
    Cell ||--o| CellSampleRef : "sampleRef?"

    Cell }o--|| Track : "trackId → Track.id"

    Scene ||--o{ SceneNode : "nodes[]"
    Scene ||--o{ SceneEdge : "edges[]"
    Scene ||--o{ SceneLabel : "labels[]"

    SceneNode ||--o{ SceneDecorator : "decorators[]"
    SceneNode ||--o| GenerativeConfig : "generative?"
    SceneNode }o--o| Pattern : "patternId? → Pattern.id"

    SceneEdge }o--|| SceneNode : "from → node.id"
    SceneEdge }o--|| SceneNode : "to → node.id"

    Song {
        string name
        number bpm
        number rootNote
    }

    Track {
        number id "stable identifier"
        boolean muted
        number volume "0-1"
        number pan "-1 to 1"
    }

    Pattern {
        string id "e.g. pat_00"
        string name "max 8 chars"
        number color "0-7"
    }

    Cell {
        number trackId "→ Track.id (ADR 079)"
        string name "per-pattern track name"
        VoiceId voiceId "per-pattern instrument"
        number steps "1-64"
        number scale "step divisor (ADR 112)"
        Record voiceParams "normalized 0-1"
        number reverbSend
        number delaySend
        number glitchSend
        number granularSend
    }

    Trig {
        boolean active
        number note "MIDI 0-127"
        number velocity "0-1"
        number duration "1-16 steps"
        boolean slide
        number chance "0-1 optional"
        number[] notes "chord notes incl primary"
        Record paramLocks "P-Lock overrides"
    }

    CellInsertFx {
        string type "verb|delay|glitch|null"
        string flavour
        number mix "0-1"
        number x "0-1"
        number y "0-1"
    }

    CellSampleRef {
        string name "display name"
        string packId "factory pack id"
    }

    Effects {
        object reverb "size, damp"
        object delay "time, feedback"
        object ducker "depth, release"
        object comp "threshold, ratio, makeup, attack, release"
    }

    Scene {
        string name
    }

    SceneNode {
        string id
        string type "pattern|generative|..."
        number x "0-1"
        number y "0-1"
        boolean root "entry point"
        string patternId "for pattern nodes"
    }

    SceneEdge {
        string id
        string from "source node"
        string to "target node"
        number order "playback priority"
    }

    SceneLabel {
        string id
        string text
        number x
        number y
    }

    SceneDecorator {
        string type "transpose|tempo|repeat|fx|automation"
        Record params
    }

    GenerativeConfig {
        string engine "turing|quantizer|tonnetz"
        string mergeMode "replace|merge|layer"
        number targetTrack
    }
```

## Key Conventions

| Convention | Detail |
|---|---|
| **Track lookup** | `cellForTrack(pat, trackId)` not `cells[index]` (ADR 079) |
| **Parameters** | Normalized 0.0–1.0 on UI side; denormalized in DSP |
| **Undo** | Snapshot-based — `pushUndo(label)` before mutations |
| **Deep copy** | `clonePattern()` — `structuredClone` fails on Svelte proxies |
| **Two cursors** | `ui.currentPattern` (user) vs `playback.playingPattern` (scene) |
| **Sample key** | `"${trackId}_${patternIndex}"` — per-cell sample cache |
| **tracks[]** | Append-only (never spliced), indices are stable |

## Runtime State (non-persisted)

```mermaid
classDiagram
    class Playback {
        boolean playing
        number[] playheads
        string mode "loop | scene"
        number playingPattern
        number queuedPattern
        string sceneNodeId
        number sceneRepeatLeft
        number sceneTranspose
        string soloNodeId
        AutomationParams[] activeAutomations
    }

    class UI {
        number selectedTrack
        number currentPattern
        string phraseView
        string viewFocus "pattern | scene"
        boolean patternSheet
        number stepPage
        string brushMode
        string chordShape
        Set~number~ soloTracks
    }

    class Perf {
        number rootNote
        number octave
        boolean breaking
        boolean filling
        boolean reversing
        number masterGain
        number swing
        number perfX
        number perfY
        boolean perfTouching
    }

    class FxPad {
        object verb "on, x, y"
        object delay "on, x, y"
        object glitch "on, x, y"
        object granular "on, x, y"
        object filter "on, x, y"
        object eqLow "on, freq, gain, q"
        object eqMid
        object eqHigh
    }
```
