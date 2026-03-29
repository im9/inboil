# Sweep Automation

Recording, storage, and playback of continuous parameter automation (ADR 118, 123).

## Data Model

```mermaid
classDiagram
    class SweepData {
        curves: SweepCurve[]
        toggles?: SweepToggleCurve[]
        durationMs?: number
        offsetMs?: number
    }
    class SweepCurve {
        target: SweepTarget
        points: ~t: 0-1, v: 0-1~[]
        color: string
    }
    class SweepToggleCurve {
        target: SweepToggleTarget
        points: ~t: 0-1, on: boolean~[]
        color: string
    }
    SweepData *-- SweepCurve
    SweepData *-- SweepToggleCurve
```

Curve values are **absolute normalized (0–1)**. Denormalized to native range on playback:

| Target kind | Param examples | Native range | Denorm formula |
|---|---|---|---|
| `fx` | reverbWet, delayTime | 0–1 | `v` (direct) |
| `master` | masterVolume, swing, compThreshold | 0–1 | `v` (direct) |
| `track:volume` | — | 0–1 | `v` (direct) |
| `track:pan` | — | -1..+1 | `v * 2 - 1` |
| `track:voiceParam` | cutoff, decay | min..max | `min + v * range` |
| `send` | reverbSend, delaySend | 0–1 | `v` (direct) |
| `eq:freq/gain` | — | 0–1 | `v` (direct) |
| `eq:q` | — | 0.3–8.0 | `0.3 + v * 7.7` |

## Recording Flow

```mermaid
sequenceDiagram
    participant UI as XY Pad / Knob
    participant Rec as sweepRecorder
    participant Song as song.scene

    UI->>Rec: captureValue(target, value 0–1)
    Rec->>Rec: checkChainTransition()
    alt pattern changed
        Rec->>Rec: flush old chain captures
        Rec->>Rec: reset recordingStartMs, progressOffset=0
    end
    Rec->>Rec: curveCaptures.set(key, {timeMs, value})

    Note over Rec: On recording stop
    Rec->>Rec: convertCurveCaptures(duration)
    Note right of Rec: t = progressOffset + (timeMs - startMs) / duration<br/>v = value (absolute 0–1)
    Rec->>Rec: rdpSimplify(points, 0.02)
    Rec->>Song: mergeOverdub into sweep node
```

Key points:
- `captureValue` receives 0–1 normalized values from all UI controls
- Chain transition detection is synchronous (inside `captureValue`)
- Each pattern's sweep is stored on its own sweep modifier node
- Points are simplified with Ramer-Douglas-Peucker (epsilon=0.02)

## Playback Flow

```mermaid
sequenceDiagram
    participant W as Worklet
    participant App as App.svelte onStep
    participant SP as scenePlayback
    participant Eval as sweepEval

    W->>App: onStep(heads[], cycle)
    alt cycle && scene mode
        Note over App: Skip sweep on cycle step<br/>(heads wrap to 0, would corrupt carry-over)
        App->>SP: advanceSceneNode()
        SP->>SP: clearCurveCarryOverDeltas()
        SP->>SP: applySatelliteModifiers()
        SP->>SP: snapshotAutomationTargets()
    else normal step
        App->>SP: applySweepStep(step, totalSteps)
        SP->>Eval: evaluateCurve(points, progress)
        alt progress < first point t
            Eval-->>SP: NaN (carry-over zone)
        else in range
            Eval-->>SP: value 0–1 (absolute)
        end
        SP->>SP: applySweepValue(base, value, firstValue)
    end
```

### Progress Calculation

```
progress = (sceneRepeatIndex + step / totalSteps) / sceneRepeatTotal
```

With rep=2 and 16 steps: progress spans 0.0–1.0 across both reps.

### Carry-Over Delta (per-curve, per-pattern)

At each curve's first evaluation in a new pattern, a delta is computed:

```
delta = liveParamValue − denorm(firstPointValue)
result = denorm(curveValue) + delta
```

| Scenario | delta | Effect |
|---|---|---|
| First pattern in scene | 0 (forced) | Absolute values applied directly |
| Continuous recording | ≈ 0 | Values match at boundary, no jump |
| Separately recorded | ≠ 0 | Bridges gap smoothly from carry-over |

Deltas are cached in `curveCarryOverDeltas` (Map) and cleared on each pattern transition.

## Pattern Transition (Critical Ordering)

```mermaid
sequenceDiagram
    participant App as onStep (cycle=true)
    participant SP as scenePlayback

    Note over App: ⚠ DO NOT apply sweep here<br/>(heads=0 would corrupt values)
    App->>SP: advanceSceneNode()
    SP->>SP: patternTransitionCount++
    SP->>SP: curveCarryOverDeltas.clear()
    SP->>SP: applySatelliteModifiers(newPattern)
    SP->>SP: snapshotAutomationTargets()
    Note over SP: Next normal step:<br/>deltas computed from live values
```

The cycle step skip is essential — without it, the worklet's wrapped-around `heads[]=0` causes sweep evaluation at progress ≈ 0.5 (for rep=2), overwriting the carry-over values.

## Stop → Play Reset

```mermaid
sequenceDiagram
    participant App as App.svelte

    Note over App: play()
    App->>App: markScenePlayStart()
    Note right of App: Save initialAutomationSnapshot<br/>patternTransitionCount = 0

    Note over App: ... playback ...

    Note over App: stop()
    App->>App: restoreAutomationSnapshot(initialSnapshot)
    Note right of App: Restores pre-playback state<br/>(not carry-over from last pattern)
```

Using the initial snapshot (not the per-pattern carry-over snapshot) ensures FX on/off and parameter values don't leak across play sessions.

## Send Parameters

Send params (reverbSend, delaySend, etc.) are stored **per cell**, not globally. When patterns change, the cell changes too. Carry-over does not apply — each pattern's send starts from its own cell's value.

## Legacy Migration

Old saves stored offset values (`v = value * 2 - 1`, range -1..+1). On load, `migrateSweepCurvesToAbsolute()` in `restoreScene` converts to absolute: `v = (v + 1) / 2`. Detection: any point with `v < -0.001 || v > 1.001`.
