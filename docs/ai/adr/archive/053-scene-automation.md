# ADR 053 — Scene Automation Node (Graphical Curve Editor)

| field   | value                              |
| ------- | ---------------------------------- |
| status  | implemented                        |
| date    | 2026-03-06                         |
| revised | 2026-03-08                         |
| parent  | ADR 050 (Scene Function Nodes)     |

## Context

Automation is a standard DAW feature. It adds expressiveness to static pattern loops by dynamically changing parameters (volume, filter cutoff, effect amounts, etc.) over time.

In the current inboil scene, function nodes (transpose, tempo, repeat, probability, fx) set parameters once *before* a pattern plays. There is no way to continuously vary parameters *during* pattern playback.

### Use Cases

- Gradually increase tempo during a pattern (accelerando)
- Open a filter cutoff over 4 bars
- Fade in reverb wet amount per track
- Wobble a track's pan left-right
- Sweep a synth parameter (e.g. filter resonance) while a pattern plays

## Decision

### 1. New Function Node Type: `automation`

```typescript
export interface AutomationPoint {
  t: number  // 0.0–1.0 — position within pattern duration
  v: number  // 0.0–1.0 — normalized parameter value
}

export type AutomationTarget =
  | { kind: 'global'; param: 'tempo' | 'masterVolume' }
  | { kind: 'track';  trackIndex: number; param: 'volume' | 'pan' }
  | { kind: 'fx';     param: 'reverbWet' | 'reverbDamp' | 'delayTime' | 'delayFeedback'
                            | 'filterCutoff' | 'glitchX' | 'glitchY' | 'granularSize' | 'granularDensity' }
  | { kind: 'send';   trackIndex: number; param: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend' }

type: 'automation'
params: {
  target: AutomationTarget
  points: AutomationPoint[]       // sorted by t, minimum 2 points
  interpolation: 'linear' | 'smooth'  // linear = connect-the-dots, smooth = monotone cubic spline
}
```

Add `'automation'` to the `SceneNode.type` union:

```typescript
type: 'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx' | 'automation'
```

### 2. Behavior Model — Decorator Pattern

Automation nodes act as **decorators** on pattern nodes. An automation node's outgoing edge connects to a pattern node, and it continuously varies a parameter during that pattern's playback:

```
[INTRO] ──→ [auto: filter sweep] ──→ [BUILDUP]
                                       ↑ filter cutoff varies according to drawn curve
```

- Multiple automation nodes can connect to the same pattern (different targets)
- Multiple automations on the same target: values are **summed** (clamped 0–1), enabling layered modulation
- An automation node without a target connection is inert (no effect)

### 3. Graphical Curve Editor

The core of this ADR: automation curves are drawn visually, not entered numerically.

#### Editor Canvas

A dedicated `<canvas>` element inside DockPanel (or overlay sheet) when an automation node is selected:

```
┌──────────────────────────────────┐
│ TARGET: [track 1 volume  ▾]     │
│ MODE:  ● Bezier  ○ Freehand     │
├──────────────────────────────────┤
│ 1.0 ┤                     ╱‾‾╲  │
│     │        ╱‾‾‾╲       ╱    │  │
│     │       ╱     ╲     ╱     │  │
│     │      ╱       ╲   ╱      │  │
│     │     ╱         ╲─╱       │  │
│ 0.0 ┤────╱                    │  │
│     └──────────────────────── t  │
│     0              pattern    1  │
├──────────────────────────────────┤
│ INTERP: ● linear  ○ smooth      │
│ [Clear] [Snap ▾] [Undo]         │
└──────────────────────────────────┘
```

- Horizontal axis: pattern time `t` (0–1), with optional grid lines at beat/step boundaries
- Vertical axis: parameter value `v` (0–1)
- Canvas size: fits DockPanel width (~248px usable), height ~140px

#### Drawing Modes

**Bezier Mode** (precision):
- Click to add anchor points on the canvas
- Drag existing points to reposition
- Shift+drag to adjust curve tension (control handles)
- Double-click a point to delete it
- Points auto-sort by `t`
- Minimum 2 points (start + end)

**Freehand Mode** (intuitive):
- Press and drag across canvas to draw a curve
- Raw input sampled at ~60 Hz → produces many points
- On pointer-up, simplify with Ramer-Douglas-Peucker (epsilon ~0.02) to reduce to ~10–30 points
- Result stored as `AutomationPoint[]`, same as Bezier mode
- Can redraw any segment by drawing over it

#### Editor Controls

| Control | Behavior |
|---------|----------|
| Target selector | Dropdown grouped by kind: Global / Track N / FX / Send |
| Mode toggle | Switch between Bezier and Freehand |
| Interpolation | `linear` (straight lines between points) or `smooth` (monotone cubic) |
| Snap | Off / 1/4 beat / 1/8 beat / 1/16 step — quantizes `t` on point placement |
| Clear | Reset to default (flat line at 0.5) |
| Undo | Undo last point add / freehand stroke (local undo stack, not global) |

### 4. Interpolation

At playback time, compute value for progress `t`:

```typescript
function evaluateAutomation(points: AutomationPoint[], t: number, interpolation: string): number {
  if (points.length === 0) return 0.5
  if (t <= points[0].t) return points[0].v
  if (t >= points[points.length - 1].t) return points[points.length - 1].v

  // find surrounding points
  let i = 0
  while (i < points.length - 1 && points[i + 1].t < t) i++
  const p0 = points[i], p1 = points[i + 1]
  const segT = (t - p0.t) / (p1.t - p0.t)

  if (interpolation === 'linear') {
    return p0.v + (p1.v - p0.v) * segT
  }
  // smooth: monotone cubic hermite
  return monotoneCubic(points, i, segT)
}
```

### 5. Target Parameter Mapping

#### Global

| param | Range (denormalized) | DSP target |
|-------|---------------------|------------|
| `tempo` | 60–300 BPM | `playback.bpm` via `setTempo()` message |
| `masterVolume` | 0–100% | `perf.masterGain` |

#### Track (per `trackIndex`)

| param | Range | DSP target |
|-------|-------|------------|
| `volume` | 0.0–1.0 | `Track.volume` |
| `pan` | -1.0–1.0 (stored 0–1, mapped) | `Track.pan` |

#### FX (global effect parameters)

| param | Range | DSP target |
|-------|-------|------------|
| `reverbWet` | 0–1 | `fxPad.verb.x` |
| `reverbDamp` | 0–1 | `fxPad.verb.y` |
| `delayTime` | 0–1 | `fxPad.delay.x` |
| `delayFeedback` | 0–1 | `fxPad.delay.y` |
| `filterCutoff` | 0–1 | `fxPad.filter.x` |
| `glitchX` | 0–1 | `fxPad.glitch.x` |
| `glitchY` | 0–1 | `fxPad.glitch.y` |
| `granularSize` | 0–1 | `fxPad.granular.x` |
| `granularDensity` | 0–1 | `fxPad.granular.y` |

#### Send (per `trackIndex`)

| param | Range | DSP target |
|-------|-------|------------|
| `reverbSend` | 0–1 | `Cell.reverbSend` |
| `delaySend` | 0–1 | `Cell.delaySend` |
| `glitchSend` | 0–1 | `Cell.glitchSend` |
| `granularSend` | 0–1 | `Cell.granularSend` |

### 6. Scene Traversal Integration

During `walkToNode()` traversal:
1. Collect automation nodes along the path before reaching the next pattern node
2. Store collected automations in playback state when pattern playback starts
3. On each step advance (main thread tick), evaluate all active automations at `t = currentStep / totalSteps` and apply values to their targets

```typescript
// Addition to playback state
activeAutomations: Array<{
  target: AutomationTarget
  points: AutomationPoint[]
  interpolation: 'linear' | 'smooth'
}>
```

### 7. Node Display (SceneView Canvas)

```
┌────────┐
│ ∿ AUTO │  ← wave icon + label
└────────┘
 trk1 vol   ← target summary
```

- Icon: Sine-wave-like SVG (`∿`)
- Node shape: Same rounded rect as other function nodes
- Label below: abbreviated target (`trk1 vol`, `tempo`, `verb wet`, etc.)
- Added to BubbleMenu as 7th item

#### Playback Visualization

When an active pattern has connected automation nodes, draw a mini-curve on the pattern node with a moving dot:

```
┌──────────┐
│ BUILDUP  │
│ ╱‾╲_╱● │  ← automation curve + playhead position
└──────────┘
```

### 8. Data Storage & Serialization

Points arrays are plain JSON-serializable. Typical automation curve: 5–30 points (~200–1200 bytes). No special serialization needed.

Default new automation node:
```typescript
{
  target: { kind: 'global', param: 'masterVolume' },
  points: [{ t: 0, v: 0 }, { t: 1, v: 1 }],  // simple ramp up
  interpolation: 'linear'
}
```

## Implementation Phases

### Phase 1: Data model + node type
1. Define `AutomationPoint`, `AutomationTarget` types
2. Add `'automation'` to `SceneNode.type`
3. Support automation in `sceneAddFunctionNode` with default params
4. Add automation icon to BubbleMenu
5. Node display on canvas (SVG icon + target label)

### Phase 2: Graphical curve editor
1. Canvas-based curve editor component (`AutomationEditor.svelte`)
2. Bezier mode: click to add points, drag to move, double-click to delete
3. Freehand mode: pointer draw + Ramer-Douglas-Peucker simplification
4. Target selector dropdown (grouped by kind, dynamic track list)
5. Interpolation toggle, snap grid, clear, local undo
6. Integrate into DockPanel (shown when automation node selected)

### Phase 3: Playback integration
1. Collect automation nodes in `walkToNode()`
2. Add `activeAutomations` to playback state
3. Evaluate curves on each step tick, apply to DSP targets
4. Handle tempo automation (AudioWorklet `setTempo()` message)
5. Handle track-level and send-level parameter updates

### Phase 4: Visual feedback
1. Mini-curve + playhead dot rendered inside pattern nodes during playback
2. Automation node edge highlighting when active

## Considerations

- **Point density**: Freehand mode could generate excessive points. RDP simplification with epsilon ~0.02 keeps curves under 30 points. If needed, enforce a hard cap at 64 points
- **Real-time tempo changes**: BPM automation requires dynamically updating the AudioWorklet's `interval`. The existing `setTempo()` message handles this
- **Parameter normalization**: All values stored 0.0–1.0, denormalized per target at application time (CLAUDE.md convention)
- **Cycle detection**: Existing graph traversal cycle detection applies
- **Canvas performance**: Editor canvas redraws only on point mutations or mode changes, not on animation frames. Playback visualization uses the existing SceneView render loop
- **Touch support**: Freehand mode naturally supports touch/stylus input. Bezier mode point dragging uses pointer events (works on touch)

## Future Extensions

- **LFO node**: Periodic parameter modulation (sine, triangle, square, random) — separate node type
- **Envelope node**: ADSR-style parameter control
- **Per-voice automation**: Automate synth parameters (voiceParams) per track
- **Curve presets**: Save/load commonly used automation shapes
- **Multi-lane editing**: Edit multiple automation curves simultaneously in a stacked view

## Extends

| ADR | Impact |
|-----|--------|
| 044 (Scene) | Add `'automation'` to `SceneNode.type` |
| 050 (Scene Function Nodes) | 7th function node. BubbleMenu + DockPanel extension |
| 048 (Scene Playback) | Extend `walkToNode()`, add automation info to playback state |
