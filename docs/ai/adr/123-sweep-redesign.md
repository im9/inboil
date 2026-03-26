# ADR 123: Sweep Redesign — Recording-Based Performance Automation

## Status: Proposed

## Context

The current sweep editor is a drawing tool: pick a parameter from a list, paint a curve on a canvas, repeat. While functional, it plays like a DAW automation lane — methodical and dull.

Problems with the current approach:
- **One-parameter-at-a-time workflow** — select from palette, draw, switch, draw again
- **No audio feedback while editing** — must play scene to hear the result
- **Light-mode graph paper look** — visually disconnected from dark-zone performance views
- **Drawing curves is precise but not musical** — "configuring" instead of "performing"

The underlying data model (sweep as chain-scoped modifier, `t: 0-1` normalized to pattern+repeat) is sound — it handles scene editing, repeat, and branching correctly. The problem is purely the **input method**.

## Decision

Replace the draw-based input with **recording-based input**. Users play the scene and move pads/toggles in real time; movements are captured as sweep curves. The sweep modifier node and data model are preserved — only the input layer changes.

### 1. Core Principle

The user never draws on a timeline. Input is spatial (pads, toggles), output is temporal (curves). The fun is in the **recording moment** — performing live, hearing results immediately. The SWP sheet is a practical tool for reviewing and editing after.

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
- Recording engine auto-routes captured data to the correct chain's sweep modifier (§3)

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

### 3. Sweep Modifier Preserved — Auto-Generated on REC

The sweep modifier node is **kept in the scene graph**. Chain-scoped `t: 0-1` data model is preserved — it correctly handles scene editing, repeat nodes, and graph branching.

**Auto-generation during recording:**
- When REC captures parameter movements during a chain's playback, the recording engine checks if that chain already has a sweep modifier
- If not → a sweep node is **automatically created** as a satellite of the pattern node (same as manual creation)
- If yes → data is written to the existing sweep node (overdub per §7)

```
Before REC:
  [Pat A] → [Pat B] → [Pat C]

User touches filter during Pat B playback:

After REC:
  [Pat A] → [Pat B] → [sweep] → [Pat C]
                         ↑ auto-generated
```

**Why auto-generate:**
- Zero friction — user just presses REC and performs, no node placement needed
- First-time users don't need to understand modifier concepts
- Advanced users can still manually create/move/delete sweep nodes in scene view

**Chain routing during recording:**
- Recording engine tracks which pattern chain is currently playing
- When the active chain changes (scene traversal moves to next pattern), the write target switches to the new chain's sweep modifier
- Continuous gestures spanning a chain boundary are split seamlessly: the outgoing chain's curve ends at its final value, the incoming chain's curve starts from that same value — no audible discontinuity
- `t` values are normalized to each chain's scope (pattern length × repeat count) — same as existing sweep data

**SWP sheet shows all chains:**
- PerfBar `SWP` button opens sheet listing sweep data across all chains
- Grouped by chain/pattern for clarity
- Same editing tools apply regardless of which chain owns the data

### 4. What Gets Recorded

**Everything by default** — exclusion-based. Only song-level settings (BPM, etc.) are exempt.

| User action | Recorded as |
|---|---|
| Drag FX pad (verb x/y, delay x/y, ...) | `SweepCurve` (kind: `fx`) |
| Drag EQ node (freq/gain/q) | `SweepCurve` (kind: `eq`) |
| Drag Master pad (comp, duck, ret, sat) | `SweepCurve` (kind: `master`) |
| Drag Filter pad | `SweepCurve` (kind: `master`, filterCutoff/filterResonance) |
| Drag track volume/pan knobs | `SweepCurve` (kind: `track`) |
| Drag voice param knobs (cutoff, decay, etc.) | `SweepCurve` (kind: `track`) |
| Drag send level knobs | `SweepCurve` (kind: `send`) |
| Toggle FX on/off | `SweepToggleCurve` (kind: `fxOn`) |
| Toggle FX hold | `SweepToggleCurve` (kind: `hold`) |
| Toggle track mute | `SweepToggleCurve` (kind: `mute`) |

Each recording pass **merges** into existing data: re-recording a parameter overwrites that parameter's curve in the active chain's sweep; untouched parameters keep their curves.

### 5. SWP Sheet Visual Design

The sheet is a **management screen** with neon-tinged polish — matching FX/EQ/MST sheet aesthetics. Not a pure visualization, but not a boring list either.

**Visual language** — consistent with FX pad, EQ overlay, and Master sheet:
- Dark-zone palette (`--dz-bg`, `--dz-divider`, `--dz-text`)
- Neon glow on interactive elements (same `shadowBlur` technique as FxPad constellation lines)
- Color-coded by parameter group using existing accent tokens (`--color-olive`, `--color-blue`, etc.)

**Two visual modes** — edit-friendly when stopped, expressive when playing:

**Edit mode** (stopped / editing):
- Each recorded parameter: label + color-coded mini-curve with **subtle** single-pass glow
- Grouped by chain/pattern
- Selected curve: full opacity, accent-colored border — control points clearly visible
- Unselected curves: dim, 30% opacity, no glow
- Hovering a curve brightens its glow — same feedback pattern as FxPad effect nodes
- Priority: **readability and precision** — glow stays gentle so point handles and trim edges are easy to grab

**Playback mode** (playing) — neon curves come alive:
- **Multi-pass rendering**: each curve drawn in 3 layers — wide outer glow (shadowBlur=20, low alpha), mid glow (shadowBlur=10), bright white core line — fiber-optic bundle aesthetic
- **Additive blending**: `globalCompositeOperation = 'lighter'` — overlapping curves blend brighter at intersections
- **Cursor flash**: amber cursor sweeps left to right; curves flare to full brightness at crossing, then decay — sparkler trail
- **Value-driven intensity**: stroke width and glow scale with parameter value — filter wide open = thick, blazing; closed = thin, dim
- **Active pulse**: curves with changing values breathe with luminance oscillation; static segments stay quiet
- **Toggle illumination**: ON segments glow as solid accent-colored bands; OFF segments go dark
- **Particles** (optional): small light specks drift along curves near the cursor — adds depth without obscuring data
- Priority: **spectacle** — this is the reward for performing. Editing is disabled during playback anyway

All effects use Canvas 2D `shadowBlur` + `globalAlpha` + `lineWidth` + `globalCompositeOperation` — same techniques as FxPad, scaled up. No WebGL needed.

**Recording preview strip** (future, during REC):
- Thin horizontal band floating above performance pads
- Real-time trace of parameter movements as they're captured
- Optional visual feedback — recording works without it

### 6. Post-Recording Editing

Three levels of editing, from coarse to fine:

**Trim/splice** (QuickTime-style):
- Range selection on a curve → delete, copy, move
- Drag edges to adjust start/end positions
- `t: 0-1` normalized — trim adjusts the range within the chain's scope

**Point adjustment**:
- Tap a curve → control points appear
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
3. Move pads/toggles → parameter changes captured and routed to active chain's sweep modifier
4. Press REC again or stop → recording ends, curves written to sweep data
5. Untouched parameters keep existing curves (overdub merge per §8)

This cleanly separates two concerns:
- **REC** = creative performance capture (real-time, interactive)
- **Export** = final output rendering (offline, non-interactive)

### 8. Overdub Conflict Resolution

During re-recording with existing curves:
- `applySweepStep` continues playing **untouched** parameters
- When the user **touches** a parameter, its existing curve is disabled for that recording pass
- On stop: user input replaces the old curve for that target in the active chain's sweep; untouched curves preserved

**User vs. sweep detection:**
- Recording engine listens to `pointerdown` / `pointermove` on pad elements (direct user input)
- `applySweepStep` writes to state via a separate code path
- Detection is based on **input source** (pointer event), not state change observation — avoids confusion with sweep-driven changes
- Once a target is marked "user-controlled," `applySweepStep` skips it for the rest of the recording pass

### 9. Data Model — No Changes

The existing data model is preserved:

```typescript
interface SweepData {
  curves: SweepCurve[]          // continuous parameters
  toggles?: SweepToggleCurve[]  // boolean on/off
}
```

- `t: 0-1` normalized to chain scope (pattern length × repeat count) — unchanged
- `SweepData` stored in `SceneNode.modifierParams.sweep` — unchanged
- Recording engine converts real-time timestamps to normalized `t` using the active chain's total length

**High-resolution capture:**
- Record at ms-level timestamps during performance
- Convert to normalized `t` on REC stop, using the chain's known length
- Preserves fast pad movements without losing sub-step detail

### 10. Structural Cleanup

- Extract `evaluateCurve()` / `evaluateToggle()` to `sweepEval.ts` (pure, testable)
- `buildSweepData(curves, toggles)` helper (prevents field-drop bugs)
- Replace SweepCanvas.svelte with: `SweepTrails.svelte` (curve rendering) + `SweepEdit.svelte` (point/trim editing)
- SweepSheet.svelte wraps both as overlay sheet component

## Resolved Questions

- ~~Track volume/pan/voice params: recordable?~~ → **Record everything by default.** Exclusion-based: only song-level settings (BPM, etc.) are exempt.
- ~~Recording quantization?~~ → **High-resolution capture + normalized on stop.** Record at ms-level, convert to `t: 0-1` using chain length. Preserves sub-step detail.
- ~~Shape presets?~~ → **Dropped.** Shape presets are a drawing-tool concept. With rec-based input, "ramp up" = slowly drag the pad up while recording.
- ~~Trail rendering: Canvas 2D or WebGL?~~ → **Canvas 2D sufficient.** FxPad already renders similar glow effects.
- ~~Sweep node abolished?~~ → **No.** Modifier approach preserved — chain-scoped `t: 0-1` handles scene editing, repeat, and branching correctly. Only the input method changes from drawing to recording. Sweep nodes are auto-generated during REC when needed.
- ~~Absolute step time?~~ → **No.** Absolute time breaks when scene structure changes. Normalized `t: 0-1` within chain scope is the correct abstraction.

### Undo

- `pushUndo('sweep recording')` called once when REC stops (before curves are written)
- Ctrl+Z restores sweep data to pre-recording state — same snapshot mechanism as all other undo
- No intermediate undo during recording — the recording is atomic (confirmed on stop)
- No explicit cancel — unwanted recordings are removed via undo or overwritten via overdub
- No performance concern: `SweepData` is part of song data, already included in undo snapshots

## Open Questions

- OfflineAudioContext: can the existing AudioWorklet processors run unchanged in offline mode, or do they need adaptation?
- SWP sheet grouping: how to present multi-chain sweep data clearly? (tab per chain, flat list with headers, etc.)

## Out of Scope

**Global-scoped sweep parameters** — Master, FX, EQ, and Filter are global parameters but sweep is chain-scoped. Recording these during a specific chain means they only apply when that chain plays — which may surprise users who expect "master comp change" to persist across all chains. This is an existing limitation of chain-scoped sweep (not introduced by ADR 123). A future ADR should address whether to introduce a separate global sweep scope for these parameters, allowing automation that applies regardless of which chain is active.

## Implementation Phases

### Phase 1: Foundation
- Add `SWP` button to PerfBar
- SweepSheet overlay: dark-zone curve list (label + mini-curve per parameter, grouped by chain)
- Extract `sweepEval.ts`
- Dark-zone visual redesign of sweep editing

### Phase 2: Recording
- Repurpose REC button for parameter capture
- Recording engine: capture pad/toggle state changes, route to active chain's sweep modifier
- Auto-generation of sweep nodes when chain has none
- Overdub merge logic
- Audio export moved to offline render (menu action)

### Phase 3: Playback Glow + Editing
- Playback cursor + `shadowBlur` glow on active curves
- Curve selection + point adjustment
- Trim/splice range editing
- Knob precision controls

### Phase 4: Recording Preview (nice-to-have)
- Floating trail strip above pads during REC
- Real-time trace of parameter movements
