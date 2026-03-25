# ADR 123: Sweep Redesign — Recording-Based Performance Automation

## Status: Proposed

## Context

The current sweep editor is a drawing tool: pick a parameter from a list, paint a curve on a canvas, repeat. While functional, it plays like a DAW automation lane — methodical and dull.

Problems with the current approach:
- **One-parameter-at-a-time workflow** — select from palette, draw, switch, draw again
- **No audio feedback while editing** — must play scene to hear the result
- **Light-mode graph paper look** — visually disconnected from dark-zone performance views
- **Drawing curves is precise but not musical** — "configuring" instead of "performing"
- **Contradicts the app's design philosophy** — Scene uses node graphs to escape linear timelines, but sweep forces users back into a left-to-right timeline editor

## Decision

Replace the draw-based sweep editor with a **recording-based performance tool**. Users play the scene and move pads/toggles in real time; movements are captured as sweep curves. The sweep node becomes a **container for recorded performances**, not a graph editor.

### 1. Core Principle

The user never draws on a timeline. Input is spatial (XY pads), output is temporal (curves). The timeline exists internally but is never the primary editing surface.

- **Input**: move pads, toggle effects — the same gestures used in live performance
- **Result**: `SweepCurve` / `SweepToggleCurve` data, produced automatically
- **Display**: neon light trails — a visual trace of the performance, not a graph to be edited

### 2. Recording Flow — Seamless Transition

No discrete ARM → REC → STOP → REVIEW steps. Recording and review are the same screen.

```
┌────────────────────────────────────────────────┐
│  REC ●                                         │
│                                                │
│  ═══════╗          ← neon trails render in     │
│    ══════╝           real time as you perform   │
│         ═══════╗                                │
│                                                │
│  [verb] [delay] [glitch]  ← pad status overlay │
└────────────────────────────────────────────────┘
         ↕ seamless
┌────────────────────────────────────────────────┐
│  ▶ ■                                           │
│                                                │
│  ═══════╗          ← same trails, now static   │
│    ══════╝           tap a trail to edit points │
│         ═══════╗                                │
│                                                │
│  [trim] [knob]  ← editing tools appear         │
└────────────────────────────────────────────────┘
```

- **REC mode**: scene plays, user moves pads, trails draw in real time. Stop → trails freeze in place.
- **Edit mode**: same view, same trails. Tap a trail to select it. Edit tools appear (trim, knob adjust). Play to preview.
- Transition is just toggling recording on/off. No screen change, no mode switch animation.

### 3. What Gets Recorded

| User action | Recorded as |
|---|---|
| Drag FX pad (verb x/y, delay x/y, ...) | `SweepCurve` (kind: `fx`) |
| Drag EQ node (freq/gain/q) | `SweepCurve` (kind: `eq`) |
| Drag Master pad (comp, duck, ret, sat) | `SweepCurve` (kind: `master`) |
| Drag Filter pad | `SweepCurve` (kind: `master`, filterCutoff/filterResonance) |
| Toggle FX on/off | `SweepToggleCurve` (kind: `fxOn`) |
| Toggle FX hold | `SweepToggleCurve` (kind: `hold`) |
| Toggle track mute | `SweepToggleCurve` (kind: `mute`) |

Each recording pass **merges** into existing data: re-recording a parameter overwrites its curve; untouched parameters keep their curves.

### 4. Neon Trail Visualization

Curves render as glowing light trails on a dark background — cyberpunk aesthetic, not business charts.

**Background**: `--dz-bg` (#1E2028), minimal grid using `--dz-divider`

**Trail rendering** (Canvas 2D, multi-pass stroke with `shadowBlur`):
- Each parameter has its target color (verb = `--color-olive`, delay = `--color-blue`, etc.)
- Active trail: full glow (shadowBlur 8–16px), 100% opacity
- Inactive trails: dim glow, 20% opacity
- Multiple simultaneous trails run in parallel like light streaks in a long-exposure photo

**ON/OFF as illumination**:
- FX ON → trail lights up (glow appears)
- FX OFF → trail goes dark (no glow, dim or absent)
- Same visual language as FxPad constellation lines, extended along time axis

**Playback cursor**: vertical glow line (amber) sweeping left to right, revealing trails as it passes

### 5. Post-Recording Editing

Three levels of editing, from coarse to fine:

**Trim/splice** (QuickTime-style):
- Range selection on a trail → delete, copy, move
- Drag edges of a segment to adjust timing
- Coarse structural editing

**Point adjustment**:
- Tap a trail → control points appear
- Drag points to adjust position
- Double-tap to delete a point

**Knob precision**:
- Select a point → knobs appear for exact t (time) and v (value) control
- For cases where dragging isn't precise enough
- Reuses existing knob components

No freehand drawing. Recording is the only way to create curves. Editing only modifies what was recorded.

### 6. Recording UI Layout

Recording must coexist with the performance pads — the user needs to see and touch them.

- **Recording state**: minimal floating bar (REC ● + time) overlaid on the normal performance view. Pads fully visible and interactive.
- **Trail view**: occupies the sheet area (where SweepCanvas currently lives). Shows during both recording and editing.
- Existing FX/EQ/Master/Filter pads used as-is — they write to global reactive state, recording captures changes via `$effect`.

### 7. Overdub Conflict Resolution

During re-recording with existing curves:
- `applySweepStep` continues playing **untouched** parameters
- When the user **touches** a parameter, its existing curve is disabled for that recording pass
- Detection: first state change on a target → mark as "user-controlled" → skip in `applySweepStep`
- On stop: user input replaces the old curve for that target; untouched curves preserved

### 8. Data Model

No changes to `SweepData` — the existing format works:

```typescript
interface SweepData {
  curves: SweepCurve[]          // continuous parameters
  toggles?: SweepToggleCurve[]  // boolean on/off
}
```

Recording produces these same types from real-time input instead of drawn strokes.

### 9. Structural Cleanup

- Extract `evaluateCurve()` / `evaluateToggle()` to `sweepEval.ts` (pure, testable)
- `buildSweepData(curves, toggles)` helper (prevents field-drop bugs)
- Replace SweepCanvas.svelte with: `SweepTrails.svelte` (trail rendering + recording) + `SweepEdit.svelte` (point/trim editing)

## Open Questions

- Track volume/pan/voice params: recordable via step sequencer knobs, or FX/EQ/Master pads only?
- Recording quantization: raw capture + RDP, or snap to step grid?
- Shape presets (ramp up, triangle, etc.): keep as quick-apply templates, or drop?
- Should the sweep node be merged into the pattern node? (Every pattern could have optional recorded automation, no separate node needed)
- Trail rendering: Canvas 2D sufficient, or WebGL for complex glow? (Assessment: Canvas 2D is sufficient — FxPad already renders similar effects)

## Implementation Phases

_Phases intentionally left open — revisit after design discussion settles._
