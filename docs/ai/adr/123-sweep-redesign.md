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

Replace the draw-based sweep editor with a **recording-based performance tool**. Users play the scene and move pads/toggles in real time; movements are captured as sweep curves. Sweep becomes a **PerfBar overlay sheet** for reviewing and editing recorded performances.

### 1. Core Principle

The user never draws on a timeline. Input is spatial (pads, toggles), output is temporal (curves). The fun is in the **recording moment** — performing live, hearing results immediately. The sheet is a practical tool for after.

- **Input**: move pads, toggle effects — the same gestures used in live performance
- **Result**: `SweepCurve` / `SweepToggleCurve` data, produced automatically
- **Review**: SWP sheet — dark-zone curve list for management and editing

### 2. Two Modes — Record vs. Review

Recording and review are **separate screens** with distinct roles.

**Record mode** — normal performance view:
- Scene plays, user operates FX/EQ/Master/Filter pads as usual
- REC button active → parameter movements captured in the background
- Pads are fully visible and interactive — no overlay obscures them
- Minimal recording indicator (REC ● + elapsed time) in header

**Review/edit mode** — SWP overlay sheet:
- Opened via PerfBar `SWP` button (same model as FX/EQ/Master)
- Dark-zone background (`--dz-bg`) — same palette as FX pad
- Curve list: each recorded parameter shown as a labeled mini-curve
- Tap a curve to select → editing tools appear
- Play to preview: playback cursor sweeps across, active curves glow with `shadowBlur`

```
Record:                          Review:
┌──────────────────────┐        ┌──────────────────────┐
│  REC ●  00:12        │        │  SWP sheet            │
│                      │        │                      │
│  [ FX pad ] [ EQ ]  │        │  verb wet  ──╲╱──    │
│  [Master ] [Filter]  │        │  delay fb  ━━━━▏glow │
│                      │        │  flt cut   ──╱╲──    │
│  (normal perf view)  │        │  [trim] [delete]     │
└──────────────────────┘        └──────────────────────┘
```

**Playback glow**: during scene playback in the SWP sheet, an amber cursor sweeps left to right. Curves light up as the cursor passes — a subtle visual reward, not the main feature.

**Recording preview** (future): floating trail strip above pads during REC, showing real-time trace of movements. Nice-to-have, not essential for core functionality.

### 3. Sweep as PerfBar Button — Not a Scene Node

The sweep node is removed from the scene graph. Sweep becomes a **PerfBar toggle button**, following the same pattern as FX/EQ/Master:

```
PerfBar:  [ FX ] [ EQ ] [ MST ] [ SWP ]
```

- `SWP` tap → opens SweepSheet overlay (full main-view area)
- Escape / backdrop tap → closes sheet
- Same overlay sheet mechanics as FX/EQ (ADR 054)

**Rationale:**
- Consistent with existing FX/EQ/Master overlay model — no new interaction pattern
- Recording requires pads visible (not buried under a sheet), so sweep's primary input happens outside the sheet
- Sweep node was a misfit in the scene graph: its UI is main-view sized, and requiring node placement before recording adds unnecessary friction
- PerfBar placement gives one-tap access without navigating the scene graph

**Sweep modifier node — abolished:**
- `sweep` removed from `ModifierType` union and `SceneNode` types
- Existing sweep modifier nodes migrated: `SweepData` lifted to scene-level field, nodes deleted from graph
- `transpose`, `tempo`, `repeat`, `fx` stay — these modify pattern chain traversal and belong in the graph
- Sweep is fundamentally different: recording captures the scene's entire time axis, not a per-chain segment. Pattern-specific automation is achieved naturally by recording at the right moment.

**Data model — simple now, extensible later:**
- Scene holds a single `SweepData` (global automation for the whole scene)
- Data references targets by `sweepId`, so future expansion to multiple sweep sets (e.g., shared across scenes) is possible without restructuring

### 4. What Gets Recorded

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

### 5. SWP Sheet Visual Design

The sheet is a **management screen** with playback-reactive polish — not a visualization destination.

**Background**: `--dz-bg`, minimal grid using `--dz-divider` (consistent with FX pad dark zone)

**Curve list** (static / stopped):
- Each recorded parameter: label + color-coded mini-curve (Canvas 2D)
- Selected curve: full opacity, highlighted border
- Unselected curves: dim, 30% opacity
- Colors per parameter group (verb = `--color-olive`, delay = `--color-blue`, etc.)

**Playback glow** (playing):
- Amber vertical cursor sweeps left to right
- Curve at cursor position pulses with `shadowBlur` (8–12px)
- Toggle curves: on-segments illuminate, off-segments stay dark
- Subtle — enhances awareness of "what's moving now" without being a light show

**Recording preview strip** (future, during REC):
- Thin horizontal band floating above performance pads
- Real-time trace of parameter movements as they're captured
- Optional visual feedback — recording works without it

### 6. Post-Recording Editing

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

### 7. Rec Button Repurpose — Parameter Recording, Not Audio Capture

The existing REC button changes role: instead of capturing audio output, it captures **parameter movements** as sweep automation data.

**Audio export becomes a separate offline render operation:**
- Uses `OfflineAudioContext` to render at CPU speed (not real-time)
- Triggered from a menu/export action, not the REC button
- Outputs WAV — same model as Ableton's "Export Audio/Video" (bounce/render)

**REC button flow:**
1. Play scene (or press REC while stopped → auto-starts playback)
2. Press REC → recording starts, header shows REC ● + elapsed time
3. Move pads/toggles → parameter changes captured as `SweepCurve` / `SweepToggleCurve`
4. Press REC again or stop → recording ends, curves written to sweep data
5. Untouched parameters keep existing curves (overdub merge per §8)

This cleanly separates two concerns:
- **REC** = creative performance capture (real-time, interactive)
- **Export** = final output rendering (offline, non-interactive)

### 8. Overdub Conflict Resolution

During re-recording with existing curves:
- `applySweepStep` continues playing **untouched** parameters
- When the user **touches** a parameter, its existing curve is disabled for that recording pass
- Detection: first state change on a target → mark as "user-controlled" → skip in `applySweepStep`
- On stop: user input replaces the old curve for that target; untouched curves preserved

### 9. Data Model

No changes to `SweepData` — the existing format works:

```typescript
interface SweepData {
  curves: SweepCurve[]          // continuous parameters
  toggles?: SweepToggleCurve[]  // boolean on/off
}
```

Recording produces these same types from real-time input instead of drawn strokes.

### 10. Structural Cleanup

- Extract `evaluateCurve()` / `evaluateToggle()` to `sweepEval.ts` (pure, testable)
- `buildSweepData(curves, toggles)` helper (prevents field-drop bugs)
- Replace SweepCanvas.svelte with: `SweepTrails.svelte` (trail rendering) + `SweepEdit.svelte` (point/trim editing)
- SweepSheet.svelte wraps both as overlay sheet component

## Open Questions

- Track volume/pan/voice params: recordable via step sequencer knobs, or FX/EQ/Master pads only?
- Recording quantization: raw capture + RDP, or snap to step grid?
- Shape presets (ramp up, triangle, etc.): keep as quick-apply templates, or drop?
- Trail rendering: Canvas 2D sufficient, or WebGL for complex glow? (Assessment: Canvas 2D is sufficient — FxPad already renders similar effects)
- OfflineAudioContext: can the existing AudioWorklet processors run unchanged in offline mode, or do they need adaptation?

## Implementation Phases

### Phase 1: Foundation
- Remove `sweep` from `ModifierType` / `SceneNode` types
- Migration: existing sweep modifier nodes → lift `SweepData` to scene-level field, delete nodes from graph
- Add `SWP` button to PerfBar
- SweepSheet overlay: dark-zone curve list (label + mini-curve per parameter)
- Extract `sweepEval.ts`

### Phase 2: Recording
- Repurpose REC button for parameter capture
- Recording engine: capture pad/toggle state changes as curves
- Overdub merge logic
- Audio export moved to offline render (menu action)

### Phase 3: Playback Glow + Editing
- Playback cursor + `shadowBlur` glow on active curves
- Trail selection + point adjustment
- Trim/splice range editing
- Knob precision controls

### Phase 4: Recording Preview (nice-to-have)
- Floating trail strip above pads during REC
- Real-time trace of parameter movements
