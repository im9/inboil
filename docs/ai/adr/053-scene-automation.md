# ADR 053 — Scene Automation Node

| field   | value                              |
| ------- | ---------------------------------- |
| status  | proposed                           |
| date    | 2026-03-06                         |
| parent  | ADR 050 (Scene Function Nodes)     |

## Context

Automation is a standard DAW feature. It adds expressiveness to static pattern loops by dynamically changing parameters (volume, filter cutoff, effect amounts, etc.) over time.

In the current inboil scene graph, function nodes (transpose, tempo, repeat, probability, fx) set parameters once *before* a pattern plays. There is no way to continuously vary parameters *during* pattern playback.

### Use Cases

- Gradually increase tempo during a pattern (accelerando)
- Open a filter cutoff over 4 bars
- Fade in reverb wet amount
- Fade out pattern volume

## Decision

### 1. New Function Node Type: `automation`

```typescript
type: 'automation'
params: {
  target: number    // 0=tempo, 1=volume, 2=filterCutoff, 3=reverbWet, 4=delayWet
  startVal: number  // normalized 0.0–1.0
  endVal: number    // normalized 0.0–1.0
  curve: number     // 0=linear, 1=ease-in, 2=ease-out, 3=s-curve
}
```

Add `'automation'` to the `SceneNode.type` union:

```typescript
type: 'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx' | 'automation'
```

### 2. Behavior Model

Automation nodes connect to the graph via edges, like other function nodes. They **continuously vary a parameter during the connected pattern's playback**:

```
[INTRO] ──→ [automation: tempo 80→120] ──→ [BUILDUP]
                                             ↑ tempo changes 80→120 during this pattern's playback
```

- When an automation node's outgoing edge leads to a pattern node, values are interpolated in sync with that pattern's playback steps
- Multiple automation nodes can connect to the same pattern (different targets)
- If multiple automations target the same parameter, the last connected one takes priority

### 3. Interpolation

Interpolate using the pattern's playback progress `t = currentStep / totalSteps` (0.0–1.0):

```typescript
function interpolate(t: number, start: number, end: number, curve: number): number {
  let ct: number
  switch (curve) {
    case 0: ct = t; break                                    // linear
    case 1: ct = t * t; break                                // ease-in
    case 2: ct = 1 - (1 - t) * (1 - t); break              // ease-out
    case 3: ct = t < 0.5 ? 2*t*t : 1 - 2*(1-t)*(1-t); break // s-curve
  }
  return start + (end - start) * ct
}
```

### 4. Scene Graph Traversal Integration

During `walkToNode()` traversal:
1. Collect automation nodes along the path before reaching the next pattern node
2. Store collected automation info in `playback` state when pattern playback starts
3. As the AudioWorklet playhead advances, compute interpolated values on the main thread and update DSP parameters

```typescript
// Addition to playback state
activeAutomations: Array<{
  target: number
  startVal: number
  endVal: number
  curve: number
}>
```

### 5. UI

#### Node Display

```
┌────────┐
│ ⤯ A→B  │  ← automation icon + start→end notation
└────────┘
 tempo 80→120  ← label (target name + denormalized values)
```

- Icon: Rising curve SVG (similar to ⤯)
- Node shape: Same rounded rect as other function nodes
- Added to BubbleMenu

#### Parameter Editing (DockPanel)

```
┌──────────────────────────┐
│ AUTOMATION               │
│                          │
│ Target: [tempo     ▾]    │
│ Start:  ===●========  80 │
│ End:    ========●===  120│
│ Curve:  [linear  ▾]     │
│                          │
│ ┌──────────────────┐     │
│ │    ╱‾‾‾          │     │  ← curve preview
│ │   ╱              │     │
│ │  ╱               │     │
│ │ ╱                │     │
│ └──────────────────┘     │
└──────────────────────────┘
```

#### Canvas Drawing (During Playback)

When an active pattern has connected automation nodes, draw a mini-curve below the node with a dot indicating the current position:

```
┌──────────┐
│ BUILDUP  │
└──────────┘
 ╱‾‾● ← current position
```

### 6. Target Parameters

| target | Name | Range (denormalized) | DSP parameter |
|--------|------|---------------------|---------------|
| 0 | Tempo | 60–300 BPM | `playback.bpm` |
| 1 | Volume | 0–100% | `perf.masterGain` |
| 2 | Filter Cutoff | 20–20000 Hz | `fxPad.filter.x` |
| 3 | Reverb Wet | 0–100% | `effects.reverb.size` |
| 4 | Delay Wet | 0–100% | `effects.delay.feedback` |

## Implementation Phases

### Phase 1: Data model + node type
1. Add `'automation'` to `SceneNode.type`
2. Support automation in `sceneAddFunctionNode`
3. Add automation icon to BubbleMenu
4. Node display (SVG icon + label)

### Phase 2: Param editing UI
1. Automation parameter editing UI in DockPanel
2. Target selector, start/end sliders, curve selector
3. Curve preview drawing

### Phase 3: Playback integration
1. Collect automation nodes in `walkToNode()`
2. Add `activeAutomations` to `playback` state
3. Compute and apply interpolated values in the playback loop
4. Notify AudioWorklet of tempo changes

### Phase 4: Visual feedback
1. Mini-curve + current position dot during playback (canvas drawing)
2. Automation edge animation

## Considerations

- **Scope**: This feature spans 4 phases. Phase 3 (playback integration) requires AudioWorklet coordination. Implement incrementally
- **Real-time tempo changes**: Changing BPM during playback requires dynamically updating the AudioWorklet's `interval`. The existing `setTempo()` message handles this
- **Parameter normalization**: All automation values are stored as 0.0–1.0 and denormalized per target. This aligns with the existing parameter design convention (CLAUDE.md)
- **Cycle detection**: If an automation node is connected in a cycle, the existing graph traversal cycle detection handles it
- **Future extensions**: LFO (periodic modulation) and step automation (discrete value changes) can be added as separate node types

## Future Extensions

- **LFO node**: Periodic parameter modulation (sine, triangle, square, random)
- **Envelope node**: ADSR envelope for parameter control
- **Custom curve editor**: Draw arbitrary automation shapes with bezier curves
- **Per-track automation**: Automate parameters independently per track (instrument)

## Extends

| ADR | Impact |
|-----|--------|
| 044 (Scene Graph) | Add `'automation'` to `SceneNode.type` |
| 050 (Scene Function Nodes) | 6th function node. BubbleMenu + DockPanel extension |
| 048 (Scene Playback) | Extend `walkToNode()`, add automation info to `playback` state |
