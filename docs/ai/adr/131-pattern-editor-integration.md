# ADR 131: Pads View — Single-Track Editor

## Status: Proposed

## Context

ADR 130 introduced the Pads view as a third tab alongside Grid and Tracker.
While the Pads view works, the right column (`col-right`) has a dead space
problem:

1. **Sampler tracks** — SamplerStepRow + SamplerParams fill the space, but
   the params duplicate what DockPanel already shows
2. **Non-sampler tracks** — only SamplerStepRow renders; the rest is empty

### What was tried and rejected

**Grid + Pads merge** (original ADR 131 design): Combining pads and the
full StepGrid into a single tab was prototyped and reverted. The cognitive
load was too high — pads + multi-track grid simultaneously is overwhelming,
and the layout constraints (square pads vs wide step grid) made neither
element work well.

### Key Insight

The Pads view's `col-right` should be a **single-track editor** — a
replica of one StepGrid track row with all its controls (header, steps,
velocity/chance/mix/FX bars, send knobs, PianoRoll for melodic tracks).
This gives the Pads view a clear role:

- **Grid** = multi-track overview (all tracks, compact rows)
- **Pads** = single-track deep editor (pads + full controls for one track)
- **Tracker** = text-based note entry

The pads (TRACK mode) serve as the track selector; the right column shows
everything about the selected track. No dead space for any voice type.

## Decision

### Replace col-right with single-track StepGrid replica

Remove `SamplerParams` from PadsView (params live in DockPanel only).
Replace col-right content with a full single-track editor:

### Layout

```
┌─ Grid ─┐┌─ Pads ─┐┌─ Tracker ─┐
└────────┘└────────┘└───────────┘
┌───────────────────────────────────────────────────────┐
│  Waveform (Sampler only — existing SamplerWaveform)   │
├───────────┬───────────────────────────────────────────┤
│           │  909K ●  ∧  │24│1/16│ S │ M │             │ track header
│           ├───────────────────────────────────────────┤
│  4×4      │  [■][□][■][□][■][□][■][□]...  │VOL│PAN│  │ step cells + mix
│  Pads     ├───────────────────────────────────────────┤
│           │  RST │ VEL │CHNC│ MIX │ FX │ INS │       │ vel mode tabs
│  ──────── ├───────────────────────────────────────────┤
│  TRK/SLC  │  ████ ██ ████ ██ ████ █ ███  │VRB│DLY│  │ vel bars + sends
│  /NOTE    ├───────────────────────────────────────────┤
│           │  PianoRoll (melodic tracks only)          │
│  oct ▲▼   │                                          │
│           │                                          │
└───────────┴───────────────────────────────────────────┘
```

### Single-Track Editor (col-right)

The right column renders the selected track's StepGrid row in full,
including all controls that currently appear only in StepGrid:

| Element | Source | Notes |
|---------|--------|-------|
| Track header | StepGrid `.ctrl-main` | name, steps cycle, scale, solo, mute |
| Step cells | StepGrid `.steps` | drag-to-paint, P-Lock dots, playhead |
| Vel mode tabs | StepGrid `.ctrl-vel` | RST, VEL, CHNC, MIX, FX, INS |
| Vel/chance bars | StepGrid `.vel-bars` | drag editing, all automation modes |
| Mix knobs | StepGrid `.mix-knobs` | VOL, PAN |
| Send knobs | StepGrid `.send-knobs` | VERB, DLY, GLT, GRN |
| PianoRoll | StepGrid inline | melodic tracks only (existing component) |

Step paging syncs with `ui.stepPage` / `ui.stepPageSize` (shared state
with StepGrid — switching tabs preserves position).

### SamplerParams removal

`SamplerParams.svelte` is removed from PadsView. All voice parameters
(including Sampler's AMP, SAMPLE, CHOP, SYNC groups) are accessed through
DockPanel's `DockTrackEditor`, which already renders them. This eliminates
the duplication and clarifies roles:

- **DockPanel** = parameter controls (knobs, voice picker, presets, FX)
- **Pads view** = performance surface (pads, steps, velocity, piano roll)

### Waveform

SamplerWaveform stays at the top of PadsView, unchanged. For non-sampler
tracks it renders an empty canvas (existing behavior). Future Phase 2
can add voice-specific visualizations (envelope, wavetable, FM algorithm).

### Pads Column

Unchanged from current implementation:

- **TRACK mode**: tap pad → select track
- **SLICE mode**: sampler chop slice auditioning
- **NOTE mode**: chromatic note input with octave shift
- **Auto-switch**: sampler tracks default to SLICE, others to NOTE
- **Step input**: tap pad while step selected → write note
- **MPC-style layout**: bottom-left origin (pad 1 = bottom-left)

### State Changes

```typescript
// No changes to patternEditor type
prefs.patternEditor: 'grid' | 'pads' | 'tracker'  // kept as-is

// ui.padMode unchanged
ui.padMode: 'track' | 'slice' | 'note'
```

### Tab Structure

Three tabs remain: Grid / Pads / Tracker. Each has a clear role:

- **Grid**: multi-track overview, all tracks visible, compact editing
- **Pads**: single-track deep editor with MPC pads + full controls
- **Tracker**: text-based note entry

## Implementation Checklist

### Phase 1: Single-Track Editor in PadsView

- [ ] Remove `SamplerParams` from PadsView col-right
- [ ] Add track header row (name, steps cycle, scale, solo, mute)
- [ ] Add step cells with drag-to-paint (reuse StepGrid logic)
- [ ] Add vel mode tabs (RST / VEL / CHNC / MIX / FX / INS)
- [ ] Add velocity/chance/param bars with drag editing
- [ ] Add mix knobs (VOL, PAN) on step row
- [ ] Add send knobs (VERB, DLY, GLT, GRN) on vel bar row
- [ ] Add PianoRoll for melodic tracks (below vel bars)
- [ ] Sync step paging with `ui.stepPage` / `ui.stepPageSize`
- [ ] Verify step-set mode (long-press steps button)
- [ ] Verify P-Lock mode (lock toggle, step selection, lock dots)
- [ ] Verify playhead highlighting
- [ ] Delete `SamplerParams.svelte`
- [ ] Verify DockPanel still shows all voice params correctly

### Phase 2: Voice Visualizations (canvas area)

- [ ] Drum voice: tone shape + decay envelope
- [ ] WT synth: wavetable shape + morph position
- [ ] FM synth: algorithm routing diagram
- [ ] ADSR envelope curve (shared across voice types)

### Phase 3: Mobile Layout

- [ ] Stacked vertical layout for < 640px
- [ ] Pads full-width row, single-track editor below
- [ ] Touch interactions verified

## Considerations

### Why not merge Grid and Pads?

Merging was prototyped and reverted — the cognitive load of seeing pads +
full multi-track StepGrid simultaneously was overwhelming. Layout constraints
(square pads need height, step grid needs width) made neither element work
well. Keeping them as separate tabs with distinct roles is cleaner:

- Grid = see all tracks at once, bulk editing
- Pads = focus on one track, deep editing with performance pads

### Code reuse vs duplication

StepGrid is ~1200 lines with tightly coupled drag-selection and animation
state. Rather than extracting a shared `SingleTrackRow` component (high
refactoring risk), Phase 1 duplicates the relevant rendering logic in
PadsView. The interaction code (drag-to-paint steps, drag velocity bars,
vel mode cycling) can be extracted to `stepActions.ts` or a shared module
if the duplication becomes a maintenance burden.

### Vertical space budget

On a 900px-tall viewport (common laptop), PadsView col-right:
- Track header: 32px
- Step cells: 28px
- Vel tabs: 28px
- Vel bars: 60px
- Send knobs: 36px
- PianoRoll: ~250px (melodic) or absent (drum/sampler)
- Total: ~184px (drum) to ~434px (melodic) — fits comfortably beside pads

### What this ADR does NOT change

- Grid tab: completely unchanged, keeps its own multi-track StepGrid
- Tracker tab: completely unchanged
- DockPanel: role unchanged — all voice params live here
- Pad modes and behavior: identical to ADR 130
- Audio/DSP: no changes
- Data model: no changes to Song/Pattern/Cell/Track types

### Relationship to ADR 130

ADR 130 remains the authority for:
- Sampler-specific features (chop, waveform editing, slice modes)
- Factory sample expansion
- Phase 2 (auto-chop, sweep mangling) and Phase 3 (granular playback)

This ADR handles the PadsView layout improvement only.

## Idea Memo: Step Recording via Realtime Pads (2026-04-08)

With pads becoming a first-class part of the editor, **step recording** is
worth tackling. The Pads view has pads visible, the step row visible, and
the playhead visible — all the ingredients for "play it in, see it land."

### Direction

- **Pads become playable** — tap = `engine.triggerNote(trackId, note, velocity)`,
  release = `releaseNoteByPitch`. Engine API already exists.
- **Recording mode** — when transport is rolling AND a REC arm is active,
  pad taps are quantized to the nearest step and written into the cell at
  the current playhead.
- **Coexistence with current "select step → tap pad" model** — that model
  stays for offline editing. Realtime recording is a separate gesture path.

### Open questions (defer until Phase 1 lands)

- REC arm UI: global toggle or per-track arm?
- Quantization: snap to nearest step always, or allow micro-timing?
- Overdub vs replace
- Count-in / metronome
- Mobile vs desktop behavior

## Future Extensions

- **Voice-specific canvas** — Envelope, wavetable, FM algorithm visualizations
  in the waveform area for non-sampler tracks
- **Step recording** — See idea memo above
- **Canvas plugins** — Spectrum analyzer, Tonnetz overlay in canvas area
