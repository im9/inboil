# ADR 118: Repeat Sweep Automation

## Status: Proposed

## Context

### The acid / minimal techno gap

Acid and minimal techno tracks often revolve around a single pattern. Musical development comes not from switching patterns but from **gradual parameter evolution** — a 303 cutoff sweep over 32 bars, resonance building across 16 repetitions, hi-hats muting in and out. This is the defining production technique of these genres.

In the current inboil architecture, there are two ways to create parameter variation:

1. **Per-step paramLocks (ADR 093)** — fine-grained, per-step control. Great for a single repetition (step-level detail) but tedious for long sweeps: manually setting cutoff on 256 steps across 16 repeats is impractical.
2. **Create many patterns** — duplicate a pattern with slight variations. Works but defeats the purpose of repeat nodes and makes the scene graph unwieldy.

Neither approach captures the workflow of "one pattern, evolving over many repeats."

### What failed before

ADR 053 introduced curve-based automation with a Bézier/freehand graphical editor. It was removed (ADR 093) because:
- The editor felt clinical and disconnected from the musical intent
- Precision curve editing was intimidating rather than inviting
- The UX was a chore, not a creative tool

The lesson: **accuracy-first curve editors don't work for inboil**. The tool needs to feel playful — something you want to mess around with, not something you have to get right.

### Repeat phase awareness

The current repeat system (`sceneRepeatLeft` in `state.svelte.ts:165`) counts down remaining repeats but doesn't expose the current phase. Decorators and paramLocks have no concept of "which repeat am I in" — they see each repetition identically. This is the core missing primitive.

## Decision

### Repeat Sweep: function node with paint canvas

A new **sweep function node** in the scene graph. When connected to a pattern node, it enables a SWEEP tab in the pattern sheet and applies parameter curves spanning the **full repeat cycle**. The user paints curves on a kidpix-inspired canvas where brush = parameter, color = track, canvas = time across all repeats.

```
[Sweep] ──→ [Pattern A] ──→ [Repeat ×8]
   │
   └─ sweepData lives here; pattern sheet shows SWEEP tab when connected
```

The sweep node is pass-through (like other fn nodes) — it doesn't occupy playback time. Its presence activates sweep behavior on the downstream pattern node.

### 1. Repeat phase tracking

Expose the current repeat index alongside the existing countdown:

```typescript
// state.svelte.ts — playback state additions
sceneRepeatIndex: 0,    // current repeat (0-based), increments each cycle
sceneRepeatTotal: 1,    // total repeat count (from repeat fn node)
```

The **sweep progress** at any point during playback:

```
progress = (repeatIndex + stepInPattern / totalSteps) / repeatTotal
// 0.0 at the very start → 1.0 at the very end of all repeats
```

This gives sub-step resolution for smooth interpolation.

### 2. Data model

```typescript
/** A single painted sweep curve */
interface SweepCurve {
  target: SweepTarget
  points: { t: number; v: number }[]  // t: 0–1 (sweep progress), v: -1 to +1 (relative offset)
  color: string                        // display color on canvas
}

/** What parameter the sweep controls */
type SweepTarget =
  | { kind: 'track'; trackId: number; param: 'volume' | 'pan' | 'cutoff' | 'resonance' | 'decay' | 'tone' }
  | { kind: 'send';  trackId: number; param: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend' }
  | { kind: 'fx';    param: 'reverbWet' | 'reverbDamp' | 'delayTime' | 'delayFeedback' | 'filterCutoff' }
  // Mute removed — use volume=0 for effective mute. Binary on/off creates UX confusion with track-level mute/solo.

/** Sweep data stored on the sweep function node */
interface SweepData {
  curves: SweepCurve[]
}
```

Added to `FnParams`:

```typescript
interface FnParams {
  // ... existing fields
  sweep?: SweepData   // repeat sweep automation curves
}
```

The sweep node type is added to `FnNodeType`:

```typescript
type FnNodeType = 'transpose' | 'tempo' | 'repeat' | 'fx' | 'sweep'
```

### 3. Relative values with pinned endpoints

All sweep values are **relative offsets** from the parameter's base value (pattern default or decorator override). This ensures seamless looping:

```
Base cutoff = 0.5
Sweep curve: +0.0 → +0.3 → +0.0

Effective:   0.5  → 0.8  → 0.5
             ↑ start       ↑ end (seamless loop back)
```

- Start and end points are **pinned to ±0** (no offset). The canvas enforces this — left and right edges are locked to the center line.
- Values are clamped after applying offset: `clamp(base + offset, 0.0, 1.0)`
- Mute sweeps are binary: paint regions where the track is muted (offset irrelevant, just on/off).

### 4. Paint canvas UI — the kidpix approach

The sweep editor appears as a **SWEEP tab** in the pattern sheet (alongside the existing STEP tab). The tab is visible only when a sweep function node is connected to the pattern.

```
┌─ Pattern Sheet ─────────────────────────────────────┐
│  [ STEP ]  [ SWEEP ]                                │
├─────────────────────────────────────────────────────┤
│                                                      │
│  PALETTE                                             │
│  ┌──────────┐   ┌──────────────────────────────────┐ │
│  │ 🎨 Bass  │   │          +1.0                    │ │
│  │  >cutoff │   │           ╱~~╲                   │ │
│  │   reso   │   │    ·····╱·····╲····              │ │
│  │   decay  │   │  ±0.0 ─────────────────── ±0.0  │ │
│  │          │   │    ·····················╲···      │ │
│  │ 🎨 Hat  │   │                          ╲       │ │
│  │  >mute   │   │          -1.0            ╲      │ │
│  │   vol    │   ├──────────────────────────────────┤ │
│  │          │   │  rep 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8│
│  │ 🎨 Kick │   └──────────────────────────────────┘ │
│  │   vol    │                                        │
│  └──────────┘   [ 🖌 Free ] [ 📐 Bézier ] [ 🧹 Erase ]│
│                                                      │
│  ▪▪▪▪░░░░▪▪▪▪▪▪░░   ← Hat mute (painted blocks)    │
│                                                      │
│                              [ Clear ] [ Done ]      │
└─────────────────────────────────────────────────────┘
```

#### Palette (left panel)

- Tree view: Track → Parameters
- Selecting a parameter picks the "brush color"
- Each parameter gets a distinct color (auto-assigned from a palette, user can override)
- Active brush is highlighted; other curves show as dimmed background layers
- Only parameters relevant to the track's voice type are shown (e.g., cutoff only for synths that have it)
- Mute appears as a special entry under each track

#### Canvas (main area)

- **X-axis**: full repeat span (repeat 1 through N), with vertical gridlines at repeat boundaries
- **Y-axis**: relative offset (-1.0 to +1.0), center line = no change (±0)
- **Left/right edges pinned**: the curve must start and end at ±0 (enforced by snapping the first and last few pixels to center)
- Background grid shows repeat boundaries and ±0.5 / ±1.0 reference lines
- Non-active curves render as faded colored lines (layered visualization)

#### Drawing modes

**Freehand mode** (default — the fun one):
- Press and drag to paint a curve
- Raw input smoothed with a configurable window (moving average, ~8 samples)
- On release: Ramer-Douglas-Peucker simplification (epsilon ~0.03) → ~15-40 points
- Endpoints auto-snapped to ±0 with a short ease-in/ease-out (~5% of width)
- Overdraw: painting over an existing region replaces that segment
- Feels loose, immediate, playful — like drawing in kidpix

**Bézier mode** (for precision):
- Click to place anchor points
- Drag handles for curve tension
- Double-click to delete a point
- First and last points locked to ±0
- Points auto-sort by t
- For users who want exact control over filter sweeps

**Erase mode**:
- Paint over a region to delete curve data there (reverts to ±0)
- For mute lanes: erase painted blocks

#### Mute lane

Mute is special — it's binary, not a continuous curve:

```
▪▪▪▪░░░░▪▪▪▪▪▪░░
 on  off  on    off
```

- Paint blocks to mute (like coloring in squares)
- Erase to unmute
- Resolution: per-repeat or per-beat (user toggleable)
- Renders below the main canvas as a horizontal strip per mute-target track

### 5. Smoothing pipeline

Raw freehand input → musically useful curve:

```
1. Raw input    ~~~∿∿∿~∿~~∿~~    (jagged, ~200 points at 60fps)
2. Moving avg   ~~∿~~∿~~~~∿~~    (smoothed, same count)
3. RDP simplify ·──╱──╲──────    (reduced to ~20 points)
4. Endpoint pin ·──╱──╲──────·   (start/end eased to ±0)
5. Stored       [{t,v}, ...]     (ready for playback interpolation)
```

### 6. Playback integration

In `scenePlayback.ts`, when a pattern with a connected sweep node starts playing, the sweep data is collected during `walkToNode()` (same as other fn nodes). On each step advance:

```typescript
function applySweep(sweepData: SweepData, step: number, totalSteps: number): void {
  if (!sweepData?.curves.length) return

  const progress = (playback.sceneRepeatIndex + step / totalSteps) / playback.sceneRepeatTotal

  for (const curve of node.sweepData.curves) {
    const offset = evaluateCurve(curve.points, progress)  // -1 to +1

    if (curve.target.kind === 'mute') {
      // Binary: offset > 0 means muted
      applyMute(curve.target.trackId, offset > 0)
    } else {
      // Continuous: add offset to base value
      const base = getBaseValue(curve.target)
      const value = clamp(base + offset, 0.0, 1.0)
      applyParameterValue(curve.target, value)
    }
  }
}
```

Called on each step advance (same timing as paramLock application). For smooth results, the worklet interpolates between step-boundary values sample-by-sample (same mechanism as ADR 093 smooth mode).

### 7. Interaction with existing systems

| System | Interaction |
|--------|-------------|
| **Per-step paramLocks** | ParamLocks take precedence — if a step has an explicit paramLock for the same parameter, it overrides the sweep value for that step |
| **Function node decorators** | Sweep offsets are relative to the value *after* decorator application (e.g., if an FX node enables reverb, sweep offsets apply on top) |
| **Repeat node** | Sweep reads `sceneRepeatTotal` from the repeat function node. Without a repeat node (count = 1), the sweep spans a single play-through |
| **Automation snapshot** | Sweep values are restored via the existing snapshot mechanism when scene playback ends |

## Considerations

- **Why a function node, not pattern-level data?** The sweep node's presence in the scene graph makes sweep automation visible and explicit. It also enables the pattern sheet to conditionally show the SWEEP tab (only when a sweep node is connected). The sweep node is pass-through like other fn nodes — it doesn't add a new "view" or navigation layer. During brainstorming, an independent node with its own step counter was also considered but rejected: when patterns across nodes have different instruments, target parameters may not exist (requiring skip logic). The sweep node targets the specific pattern it's connected to.
- **Canvas size on mobile**: The overlay sheet works on mobile (ADR 054), but drawing precision is lower on small screens. Mitigated by aggressive smoothing and the forgiving freehand approach — you don't need to be precise.
- **Performance**: Curve evaluation per step is O(log n) with binary search over ~20 points — negligible. No per-sample evaluation needed; the worklet's existing ramp interpolation handles smoothness between steps.
- **Relationship to ADR 103 (Orchestration Layer)**: ADR 103 envisions AI-interpreted mood shapes spanning multiple nodes. Repeat Sweep is complementary — it handles the simpler, manual case of "one pattern, evolving parameters." The paint canvas could eventually serve as input for ADR 103's figure drawing.
- **Why relative, not absolute?** Absolute values create discontinuities at repeat boundaries (parameter jumps from sweep endpoint back to base value). Relative with pinned ±0 endpoints guarantees seamless looping. It also means the same sweep works regardless of the base parameter value.
- **What about cross-pattern sweeps?** Out of scope. If the need arises (e.g., cutoff sweep spanning pattern A → B), this could be revisited as an independent node approach (brainstorm "case 1"). For now, the repeat-within-one-pattern model covers acid/minimal techno workflows.

## Implementation Phases

### Phase 1: Sweep node + data model
- Add `'sweep'` to `FnNodeType`
- Add `sweep?: SweepData` to `FnParams`
- Define `SweepCurve`, `SweepTarget`, `SweepData` types
- Add `sceneRepeatIndex` / `sceneRepeatTotal` to playback state
- Increment `sceneRepeatIndex` in scene advance logic
- Sweep node in BubbleMenu (icon, creation, edge wiring)
- Serialization / migration (existing songs: no sweep nodes = no change)

### Phase 2: Paint canvas UI
- SWEEP tab in pattern sheet (visible when sweep node connected)
- `SweepCanvas.svelte` component
- Palette panel with track → parameter tree
- Freehand drawing with smoothing + RDP simplification
- Endpoint pinning
- Mute lane (binary paint)
- Layer rendering (active curve + dimmed background curves)

### Phase 3: Playback integration
- `applySweep()` in scene playback step advance
- Curve evaluation with interpolation
- Mute application
- ParamLock precedence logic
- Automation snapshot integration (restore on stop)

### Phase 4: Bézier mode
- Anchor point placement and dragging
- Control handle adjustment
- Point deletion
- Locked endpoints
- Mode toggle (freehand ↔ Bézier)

### Phase 5: Playback visual effects

The sweep's impact should be **visible and dramatic** on the scene canvas during playback — not just a tiny indicator, but effects that communicate the parameter changes happening in real-time:

- **Glow**: Pattern node border glows in the active sweep curve's color, intensity tracks the current offset magnitude
- **Color shift**: Pattern node background color shifts with sweep progress (e.g., warmer as cutoff opens, cooler as it closes)
- **Edge particles**: Particles flow along the edge from sweep node → pattern node, speed/density reflects sweep intensity
- **Sweep progress arc**: A progress arc around the sweep node itself, showing how far through the full repeat cycle the sweep has progressed
- **SWEEP tab live cursor**: When the pattern sheet SWEEP tab is open during playback, a vertical playhead line moves across the canvas showing current position

## Future Extensions

- **Sweep presets**: Save/load commonly used sweep shapes (acid ramp, slow build, stutter mute pattern)
- **Sweep copy/paste**: Copy sweep data between pattern nodes
- **Per-voice param sweeps**: Extend `SweepTarget` to include voice-specific parameters (oscillator shape, envelope, etc.)
- **Tempo-synced LFO brush**: A special brush that paints periodic waveforms (sine, triangle, square) snapped to tempo divisions — combines the fun of freehand with rhythmic precision
- **Cross-pattern sweeps**: If demand emerges, revisit the independent node approach for sweeps spanning multiple pattern nodes
- **ADR 103 integration**: The paint canvas could serve as the freehand drawing surface for orchestration figures, with AI interpreting painted shapes into multi-parameter sweeps
