# ADR 123: Sweep Redesign — Recording-Based Performance Automation

## Status: Implemented

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

The user never draws on a timeline. Input is spatial (pads, toggles), output is temporal (curves). The fun is in the **recording moment** — performing live, hearing results immediately. The sweep editor is for reviewing and fine-tuning after.

- **Input**: move pads, toggle effects — the same gestures used in live performance
- **Result**: `SweepCurve` / `SweepToggleCurve` data, produced automatically
- **Review**: sweep editor (existing overlay, redesigned dark-zone) for management and editing

### 2. Two Modes — Record vs. Review

Recording and review are **separate screens** with distinct roles.

**Record mode** — normal performance view:
- Triggered by ● button on sweep node (§7) → scene playback starts + recording begins
- User operates FX/EQ/Master/Filter pads as usual
- Pads are fully visible and interactive — no overlay obscures them
- Recording indicator (● + elapsed time) on the sweep node or header
- Recording engine writes captured data to the target chain's sweep modifier

**Review/edit mode** — sweep editor overlay:
- Accessed via existing entry point: select sweep node in scene view → DockPanel → edit button → overlay opens
- Redesigned with dark-zone background (`--dz-bg`) — same palette as FX pad
- Curve list: each recorded parameter shown as a labeled mini-curve
- Tap a curve to select → editing tools appear
- Play to preview: playback cursor sweeps across, active curves glow with `shadowBlur`

**Playback glow**: during scene playback in the sweep editor, an amber cursor sweeps left to right. Curves light up as the cursor passes — a subtle visual reward, not the main feature.

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

**Editing access:**
- Sweep editor opens per-chain (via sweep node selection in scene view → DockPanel → edit)
- Each chain's sweep data edited independently — consistent with other modifier nodes

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
| Toggle master pad on/off (comp/duck/ret/sat) | `SweepToggleCurve` (kind: `masterFxOn`) |
| Toggle filter on/off | `SweepToggleCurve` (kind: `fxOn`, fx: `filter`) |
| Toggle track mute | `SweepToggleCurve` (kind: `mute`) |

Each recording pass **merges** into existing data: re-recording a parameter overwrites that parameter's curve in the active chain's sweep; untouched parameters keep their curves.

### 5. Sweep Editor Visual Redesign

The existing SweepCanvas is redesigned from light-zone graph paper to **dark-zone neon** — matching FX/EQ/Master aesthetics. Same overlay mechanism, new look.

**Visual language** — consistent with FX pad, EQ overlay, and Master sheet:
- Dark-zone palette (`--dz-bg`, `--dz-divider`, `--dz-text`)
- Neon glow on interactive elements (same `shadowBlur` technique as FxPad constellation lines)
- Color-coded by parameter group using existing accent tokens (`--color-olive`, `--color-blue`, etc.)

**Two visual modes** — edit-friendly when stopped, expressive when playing:

**Edit mode** (stopped / editing):
- Each recorded parameter: label + color-coded mini-curve with **subtle** single-pass glow
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

Sweep editor displays curves and toggles in **separate sections** — they have different visual representations and editing operations.

```
Sweep editor:
  ─── Curves ───
  verb wet   ──╲╱──
  filter cut ──╱╲──

  ─── Toggles ───
  verb on    ████░░████
  delay on   ░░████░░░░
  hold       ░░░░████░░
```

#### Curve editing (continuous parameters)

Three levels, from coarse to fine:

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

#### Toggle editing (on/off parameters)

Toggles display as **colored blocks** (ON = accent color, OFF = dark gap). Editing operations:

- **Boundary drag**: drag the edge of an on/off block to shift its timing
- **Split**: tap inside a block to split it into two (inserts an off-gap)
- **Delete**: remove a block (turns that region OFF)
- **Merge**: drag two adjacent ON blocks together to close the gap

No point handles or bezier curves — toggles are purely about timing of state changes. Rec captures the exact moments the user tapped FX on/off, hold, or mute; editing just fine-tunes those moments.

#### Why separate sections

- Curves and toggles have fundamentally different shapes (continuous line vs. discrete blocks)
- Mixing them in one view forced awkward compromises in the draw-based editor (bezier points for on/off)
- Separate sections mean each gets the right editing tools without clutter
- Both sections live in the same sweep editor — one scroll, not separate screens

No freehand drawing. Recording is the only way to create data. Editing only modifies what was recorded.

### 7. Sweep Record Button

The ● record button appears in **two places** — both trigger the same recording for the target chain:

**Scene view** — on the sweep node, same position as root node's ▶:
```
Root node:          Sweep node:
┌──────────┐        ┌──────────┐
│ ▶  FROST │        │ ●  FROST │
│          │        │ ═══╲╱══  │
└──────────┘        └──────────┘
```

**Sweep editor** — in the toolbar, replacing Draw/Shape buttons:
```
Current:   [Draw] [Point] [Shape] [Clear] ✕
ADR 123:   [● Rec]  [Clear]              ✕
```

Draw and Shape are removed — recording replaces freehand drawing. Point editing becomes the default (always active): tap a curve to show control points, drag to adjust. No mode toggle needed.

**Recording flow:**
1. Tap ● (on node or in editor) → scene playback starts + recording begins for that chain
2. Move pads/toggles → parameter changes captured into this node's `SweepData`
3. Tap ● again or stop playback → recording ends, curves written
4. Untouched parameters keep existing curves (overdub merge per §8)

**Why on the node, not the header REC button:**
- Header REC stays as audio export (WAV capture) — no change, no risk
- Node ● makes the recording target explicit — user sees which chain they're recording into
- Same visual language as root ▶ — "press to activate this node"
- No dependency on OfflineAudioContext (verified non-functional in all browsers — see Known Limitation)

**Auto-generation interaction:**
- When a sweep node is auto-generated (§3), the ● button appears immediately
- User can tap it right away to start recording

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
- Redesign SweepCanvas.svelte: remove draw palette/brush modes, add dark-zone styling, split curve rendering and editing into cleaner internal structure

## Resolved Questions

- ~~Track volume/pan/voice params: recordable?~~ → **Record everything by default.** Exclusion-based: only song-level settings (BPM, etc.) are exempt.
- ~~Recording quantization?~~ → **High-resolution capture + normalized on stop.** Record at ms-level, convert to `t: 0-1` using chain length. Preserves sub-step detail.
- ~~Shape presets?~~ → **Dropped.** Shape presets are a drawing-tool concept. With rec-based input, "ramp up" = slowly drag the pad up while recording.
- ~~Trail rendering: Canvas 2D or WebGL?~~ → **Canvas 2D sufficient.** FxPad already renders similar glow effects.
- ~~Sweep node abolished?~~ → **No.** Modifier approach preserved — chain-scoped `t: 0-1` handles scene editing, repeat, and branching correctly. Only the input method changes from drawing to recording. Sweep nodes are auto-generated during REC when needed. No PerfBar SWP button — editing accessed through existing scene node → DockPanel → overlay flow.
- ~~Absolute step time?~~ → **No.** Absolute time breaks when scene structure changes. Normalized `t: 0-1` within chain scope is the correct abstraction.
- ~~REC button repurpose?~~ → **No.** OfflineAudioContext + AudioWorklet does not work in any browser (verified 2025) — cannot move audio export to offline render. Header REC stays as audio capture. Sweep recording triggered by ● button on sweep node instead.

### Undo

- `pushUndo('sweep recording')` called once when REC stops (before curves are written)
- Ctrl+Z restores sweep data to pre-recording state — same snapshot mechanism as all other undo
- No intermediate undo during recording — the recording is atomic (confirmed on stop)
- No explicit cancel — unwanted recordings are removed via undo or overwritten via overdub
- No performance concern: `SweepData` is part of song data, already included in undo snapshots

## Open Questions

_None remaining for ADR 123 scope — sweep recording via node ● does not depend on unresolved technical questions._

## Known Limitation: OfflineAudioContext + AudioWorklet

As of 2025, **OfflineAudioContext does not work with AudioWorklet** in any browser (Chrome, Firefox, Safari). `addModule()` succeeds but `new AudioWorkletNode()` fails — the processor is not recognized in offline context.

**Impact on this ADR:** None — ADR 123 no longer depends on OfflineAudioContext. Header REC stays as real-time audio capture. Sweep recording uses the node ● button.

**Impact on future offline WAV export:** If inboil wants faster-than-realtime WAV export in the future, this blocker must be resolved. Options:
- Wait for browser vendors to fix AudioWorklet + OfflineAudioContext
- Dual audio graph: rebuild DSP with built-in AudioNodes for offline context (major effort)
- Server-side rendering
- WebAssembly DSP port

This is **not in scope for ADR 123** but documented here as a verified technical constraint.

## Out of Scope

**Global-scoped sweep parameters** — Master, FX, EQ, and Filter are global parameters but sweep is chain-scoped. Recording these during a specific chain means they only apply when that chain plays — which may surprise users who expect "master comp change" to persist across all chains. This is an existing limitation of chain-scoped sweep (not introduced by ADR 123). A future ADR should address whether to introduce a separate global sweep scope for these parameters, allowing automation that applies regardless of which chain is active.


## Implementation Phases

### Phase 1: Foundation

#### Implementation Checklist
- [x] Extract `sweepEval.ts` — move `evaluateCurve()` + `evaluateToggle()` to `src/lib/sweepEval.ts` as exported pure functions
- [x] Add `buildSweepData(curves, toggles)` helper to `sweepEval.ts`
- [x] Update `scenePlayback.ts` to import from `sweepEval.ts` (remove inline copies)
- [x] Update `SweepCanvas.svelte` to import from `sweepEval.ts` (remove inline copy)
- [x] Update `sweepPlayback.test.ts` to import from `sweepEval.ts` (remove reimplementations)
- [x] Dark-zone background: replace cream/light-zone palette with `--dz-bg`, `--dz-divider`, `--dz-text-*` tokens
- [x] Remove draw palette panel (target picker drill-down, mode buttons: free/bezier/shape)
- [x] Remove freehand drawing mode and shape presets
- [x] Keep point-editing (bezier mode) as the default and only editing mode — always active, no mode toggle
- [x] Canvas rendering: dark background, neon-accent curve strokes, `--dz-*` grid/borders
- [x] Toggle section: render `SweepToggleCurve[]` as colored blocks (ON = accent, OFF = dark gap) below curve section
- [x] Toggle block editing: boundary drag, split, delete, merge
- [x] `pnpm check` passes
- [x] `pnpm test` passes

### Phase 2: Recording

#### Implementation Checklist
- [x] Recording engine module `sweepRecorder.svelte.ts` — arm/start/stop, capture parameter changes with ms timestamps, BPM-based `t` normalization on stop
- [x] Sweep node ● record button in SceneView (on sweep node, left of node)
- [x] Sweep node ● record button in sweep editor toolbar (circular, matching node style)
- [x] Arm-based flow: ● arms recording, any parameter touch starts playback + recording
- [x] Capture FX pad movements (verb/delay/glitch/granular x/y) as `SweepCurve` — FxPad + DockFxControls
- [x] Capture EQ node movements (freq/gain/q per band) as `SweepCurve` — DockEqControls
- [x] Capture Master pad movements (comp/duck/ret/sat x/y) as `SweepCurve` — DockMasterControls + MasterView
- [x] Capture Filter pad movements (cutoff/resonance) as `SweepCurve` — DockMasterControls + MasterView
- [x] Capture track volume/pan knob movements as `SweepCurve` — StepGrid + TrackerView
- [x] Capture voice param knob movements as `SweepCurve` — DockTrackEditor
- [x] Capture send level knob movements as `SweepCurve` — StepGrid + TrackerView
- [x] Capture FX on/off toggles as `SweepToggleCurve` — FxPad + DockFxControls
- [x] Capture FX hold toggles as `SweepToggleCurve` — FxPad
- [x] Capture track mute toggles as `SweepToggleCurve` — StepGrid + TrackerView
- [x] Auto-generate sweep node when chain has none (§3)
- [x] Chain routing: detect sceneNodeId change in captureValue/captureToggle, flush to old chain, switch target
- [x] Overdub merge: touched parameters overwrite, untouched keep existing curves (§8)
- [x] User vs sweep detection: `isUserControlled` callback, `applySweepStep` skips user-controlled targets during REC
- [x] `pushUndo('sweep recording')` on REC stop before writing curves
- [x] Recording indicator (● + elapsed time) visible during REC
- [x] `pnpm check` passes
- [x] `pnpm test` passes

### Phase 3: Playback Glow + Editing

#### Implementation Checklist
- [x] Playback mode: gradient trail glow with 60fps rAF interpolation
- [x] Playback cursor: amber sweep line with glow + curve crossing dot
- [x] Dim base curve (alpha 0.2) always visible as context
- [x] Curve selection: click on curve in canvas or list to select (Phase 1)
- [x] Point adjustment: drag points, double-click to delete, click on curve to add (Phase 1)
- [x] Trim/splice: Shift+drag range selection → Delete to remove points, edge handles to adjust
- [x] Knob precision: select a point → knobs for exact t (time) and v (value) control
- [x] Scene play/stop button in sweep editor toolbar
- [x] `pnpm check` passes
- [x] `pnpm test` passes

### Phase 4: Recording Preview Strip

Thin floating strip that shows real-time traces of parameter movements during REC — visual feedback that "something is being captured." Nice-to-have; recording works without it. If it doesn't feel right, revert.

#### Design

A `SweepTrailStrip` component rendered inside the pattern sheet area during `sweepRec.state === 'recording'`. Shows the last ~2 seconds of captured parameter values as fading sparkline traces, one per active parameter.

```
┌─────────────────────────────────────────────────────┐
│  verb wet ~~╲╱~~  filter freq ──╱──                 │  ← trail strip (32px tall)
├─────────────────────────────────────────────────────┤
│                                                     │
│              [ FX pad / Master pad ]                │  ← normal performance view
│                                                     │
```

**Visual language:**
- Dark-zone background (`--color-fg`), matching sweep editor
- Each parameter trace: colored sparkline (curve color), fading from left (old) to right (current)
- Parameter label in `--dz-text-dim` at left edge of each trace
- Max 4 traces visible (most recently touched); older traces fade out
- No interaction — purely visual feedback, no pointer events

**Data flow:**
- `sweepRecorder` exposes a reactive `recentTraces` array: `{ key: string, label: string, color: string, values: number[] }[]`
- Values are a rolling window of the last ~120 samples (2 seconds at 60fps)
- `captureValue()` pushes to the rolling buffer; `captureToggle()` pushes 0/1
- `SweepTrailStrip` renders with `requestAnimationFrame` on a small canvas or inline SVG polylines
- Component auto-hides when `sweepRec.state !== 'recording'`

**Placement:**
- Inside `.pattern-sheet` container, above the main content (FxPad/MasterView/StepGrid)
- `position: relative` in normal flow (not absolute), so it pushes content down by 32px
- Appears with a subtle slide-down animation (80ms) when recording starts

#### Implementation Checklist
- [x] Add `recentTraces` reactive array to `sweepRecorder.svelte.ts` — rolling window per active parameter, pushed from `captureValue`/`captureToggle`
- [x] Create `SweepTrailStrip.svelte` — dark-zone strip, renders sparkline traces via SVG polylines
- [x] Mount in App.svelte inside pattern sheet area, conditional on `sweepRec.state === 'recording'`
- [x] Slide-down/up animation on mount/unmount (80ms)
- [x] Cap at 4 visible traces, fade older ones
- [x] `pnpm check` passes
- [x] `pnpm test` passes

### Phase 5: Global-Scope Sweep Parameters

Master, FX, EQ, and Filter are global parameters, but sweep data is chain-scoped. When a user records a filter sweep during Chain A, that automation only plays when Chain A is active — switching to Chain B "drops" the filter. This is confusing, especially for parameters that users perceive as global.

#### Design

Introduce a **global sweep layer** that runs independently of chain playback:

- New `globalSweep?: SweepData` field on `Scene` interface — scene-level, not per-node
- Global sweep `t` normalized to **total scene duration** (sum of all chain durations in traversal order)
- During recording: master/fx/eq/filter targets route to global sweep; track-scoped targets (volume, pan, voice params, sends, mute) route to chain sweep as before
- During playback: `applySweepStep` evaluates global sweep first (scene-wide progress), then chain sweep (chain-local progress). Chain sweep offsets stack on top of global sweep offsets
- Overdub: global and chain sweeps are independent — re-recording a global param overwrites its global curve, not the chain curve

**Target routing rules:**

| Target kind | Scope | Rationale |
|---|---|---|
| `master` (volume, swing, comp, duck, ret, sat) | global | Affects entire mix |
| `fx` (verb, delay, glitch, granular params) | global | Shared FX bus |
| `eq` (low/mid/high freq/gain/q) | global | Master bus EQ |
| `fxOn` / `hold` / `masterFxOn` toggles | global | FX/master on/off is global state |
| `track` (volume, pan, voice params) | chain | Per-pattern track config |
| `send` (reverb/delay/glitch/granular send) | chain | Per-pattern send levels |
| `mute` toggles | chain | Per-pattern mute state |

**Scene-wide `t` calculation:**

```
Scene graph:  Root → [Pat A ×2] → [Pat B ×1] → [Pat C ×3]
Chain durations: A=32 steps, B=16 steps, C=48 steps  (total=96 steps)
Global t:     A occupies 0.000–0.333, B occupies 0.333–0.500, C occupies 0.500–1.000
```

Pre-calculate chain order + cumulative durations at scene play start. During playback: `globalT = (stepsCompletedSoFar + currentChainProgress * currentChainSteps) / totalSceneSteps`.

**Data model changes:**
- `Scene.globalSweep?: SweepData` — new optional field
- `validateSongData()` accepts optional `globalSweep` (backward compatible)
- Old saves without `globalSweep` work unchanged (field simply absent)
- No migration needed — absence means "no global sweep"

#### Why not just extend chain sweep

- Chain `t: 0-1` is normalized per-chain. A "scene-wide filter ramp" would need to be sliced across every chain, duplicated, and kept in sync — fragile and confusing to edit
- Global sweep with scene-wide `t` is the natural representation for parameters that don't belong to any single chain

#### Implementation Checklist
- [x] Add `globalSweep?: SweepData` to `Scene` interface in `types.ts`
- [x] Add `durationMs?: number` to `SweepData` for global sweep timing
- [x] Add `isGlobalTarget(target)` helper to `sweepEval.ts` — returns true for master/fx/eq/fxOn/hold targets
- [x] Update recording engine: route global targets to `song.scene.globalSweep`, chain targets to per-node sweep
- [x] `markScenePlayStart()` tracks scene clock origin for global sweep progress
- [x] Update `applySweepStep()` to evaluate global sweep first (elapsed-time progress), then chain sweep (offsets stack)
- [x] Add global sweep section to sweep editor UI (list display, delete per curve/toggle, clear all)
- [x] Tests for `isGlobalTarget` (8 tests)
- [x] `pnpm check` passes
- [x] `pnpm test` passes
