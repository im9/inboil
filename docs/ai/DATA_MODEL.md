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
    Cell ||--o| CellInsertFx : "insertFx? (dual chain)"
    Cell ||--o| CellSampleRef : "sampleRef?"

    Cell }o--|| Track : "trackId → Track.id"

    Scene ||--o{ SceneNode : "nodes[]"
    Scene ||--o{ SceneEdge : "edges[]"
    Scene ||--o{ SceneLabel : "labels[]"
    Scene ||--o{ SceneStamp : "stamps[]"
    Scene ||--o| SweepData : "globalSweep?"

    SceneNode ||--o| ModifierParams : "modifierParams?"
    SceneNode ||--o| GenerativeConfig : "generative?"
    SceneNode }o--o| Pattern : "patternId? → Pattern.id"

    SceneEdge }o--|| SceneNode : "from → node.id"
    SceneEdge }o--|| SceneNode : "to → node.id"

    Song {
        string name
        number bpm
        number rootNote "0-11"
        FxFlavours flavours "FX flavour variants (ADR 075)"
        Record fxPadState "FX/EQ pad state"
        Record masterPadState "master bus pad state"
        number masterGain "0-1"
        number swing "0-1"
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
        number rootNote "0-11 per-pattern key override (optional)"
    }

    Cell {
        number trackId "→ Track.id (ADR 079)"
        string name "per-pattern track name"
        VoiceId voiceId "per-pattern instrument"
        number steps "1-64"
        number scale "step divisor (ADR 112)"
        Record voiceParams "normalized 0-1"
        string presetName "last applied preset (optional)"
        number reverbSend
        number delaySend
        number glitchSend
        number granularSend
        CellInsertFx[2] insertFx "dual chain (ADR 077/114)"
        CellSampleRef sampleRef "optional (ADR 110)"
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
        string type "verb|delay|glitch|dist|null"
        string flavour
        number mix "0-1"
        number x "0-1"
        number y "0-1"
    }

    CellSampleRef {
        string name "display name"
        string packId "factory pack id (optional)"
    }

    Effects {
        object reverb "size, damp"
        object delay "time, feedback"
        object ducker "depth, release"
        object comp "threshold, ratio, makeup, attack, release"
    }

    Scene {
        string name
        SceneStamp[] stamps "decorative stamps (ADR 119)"
        SweepData globalSweep "global sweep automation (ADR 123)"
    }

    SceneNode {
        string id
        string type "pattern|generative|probability|modifier types"
        number x "0-1"
        number y "0-1"
        boolean root "entry point"
        string patternId "for pattern nodes"
        ModifierParams modifierParams "for modifier/sweep nodes (ADR 093/125)"
        GenerativeConfig generative "for generative nodes (ADR 078)"
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
        number x "0-1"
        number y "0-1"
        number size "font scale (default 1.0)"
    }

    SceneStamp {
        string id
        string stampId "key into STAMP_LIBRARY"
        number x "0-1"
        number y "0-1"
        number scale "size multiplier (default 1.0)"
    }

    GenerativeConfig {
        string engine "turing|quantizer|tonnetz"
        string mergeMode "replace|merge|layer"
        number targetTrack
        number seed "optional"
        object params "TuringParams|QuantizerParams|TonnetzParams"
    }

    ModifierParams {
        object transpose "semitones, mode (rel/abs), key?"
        object tempo "bpm"
        object repeat "count"
        object fx "verb, delay, glitch, granular, flavourOverrides?"
        SweepData sweep "painted curves (ADR 118)"
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
| **Node types** | `pattern`, `generative`, `probability`, modifier: `transpose`, `tempo`, `repeat`, `fx`, `sweep` |

## Runtime State (non-persisted)

```mermaid
classDiagram
    class Playback {
        boolean playing
        number[] playheads
        string mode "loop | scene"
        number playingPattern "null when stopped"
        number queuedPattern "null = no queue"
        string sceneNodeId
        string sceneEdgeId
        number sceneRepeatLeft
        number sceneRepeatIndex "current repeat 0-based (ADR 118)"
        number sceneRepeatTotal "total repeat count (ADR 118)"
        number sceneTranspose
        number sceneAbsoluteKey "absolute key override"
        string soloNodeId
        AutomationSnapshot automationSnapshot
    }

    class UI {
        number selectedTrack
        number currentPattern
        string phraseView "pattern|scene|fx|eq|master|perf|tonnetz|quantizer|turing"
        string viewFocus "pattern | scene"
        boolean patternSheet
        object patternSheetOrigin "x, y | null"
        Record selectedSceneNodes
        string selectedSceneEdge
        Record selectedSceneLabels
        Record selectedSceneStamps
        string sidebar "help | system | null"
        string systemTab "project | settings"
        boolean lockMode
        number selectedStep "null = none"
        Set~number~ soloTracks
        boolean mobileOverlay
        string focusSceneNodeId
        string dockTab "tracks | scene"
        string brushMode "draw|eraser|chord|strum|select"
        string chordShape "triad|7th|sus2|sus4"
        number stepPage
        number stepPageSize
        boolean sweepTab
        boolean granularMode2
        string tonnetzNodeId "active Tonnetz sheet node (ADR 126)"
        string quantizerNodeId "active Quantizer sheet node (ADR 127)"
        string turingNodeId "active Turing sheet node (ADR 127)"
    }

    class Perf {
        number rootNote
        number octave
        boolean breaking
        boolean filling
        boolean reversing
        number masterGain
        number swing
        number granularPitch
        number granularScatter
        boolean granularHold
        boolean reverbHold
        boolean delayHold
        boolean glitchHold
        number perfX
        number perfY
        boolean perfTouching
        number tiltX "mobile perf sheet"
        number tiltY "mobile perf sheet"
        boolean stuttering "ADR 097 Phase 2"
        boolean halfSpeed "ADR 097 Phase 2"
        boolean tapeStop "ADR 097 Phase 2"
    }

    class FxPad {
        object verb "on, x, y"
        object delay "on, x, y"
        object glitch "on, x, y"
        object granular "on, x, y"
        object filter "on, x, y"
        object eqLow "on, x, y, q, shelf"
        object eqMid "on, x, y, q"
        object eqHigh "on, x, y, q, shelf"
    }
```
