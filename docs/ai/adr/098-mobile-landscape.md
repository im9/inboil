# ADR 098: Mobile Landscape Orientation

## Status: Proposed

## Context

ADR 095 (Mobile UI Redesign) shipped portrait-first layout with MobileTrackView as the primary view. Landscape orientation is not yet supported — the layout simply stretches vertically, wasting horizontal space and making the calculator grid awkward to use.

## Decision

Add landscape-specific layout for mobile using `orientation: landscape` media queries.

### Layout

```
┌─────────────┬──────────────────────────┐
│  Matrix /   │                          │
│  Track Nav  │   MobileTrackView (PO)   │
│             │                          │
├─────────────┤                          │
│  Transport  │                          │
└─────────────┴──────────────────────────┘
```

- Side-by-side: navigation/controls on the left, calculator grid on the right
- AppHeader collapses to minimal transport controls
- MobileMatrixView stacks vertically in left column
- Track navigation (voice bar, solo/mute) moves to left column

### Implementation

- `@media (orientation: landscape) and (max-height: 500px)` breakpoint
- CSS-only layout switch where possible; conditional rendering if needed
- Touch targets remain ≥ 44px
- Test on common phone landscape sizes (667×375, 812×375, 844×390)

### Desktop StepGrid in Landscape

Landscape right column (~650px) has enough width to show the desktop StepGrid (track label 112px + 16×24px steps = 496px) with the mix knob column hidden. This would give mobile users the same sequencer experience as desktop, and also fix the tutorial playground cutoff on narrow screens.

### SceneRibbon

SceneRibbon (existing but unused component) could fit in the landscape left column below transport, providing a mini scene status view without switching to the full scene canvas.

## Idea Memo: Orientation-Driven UI Swap (2026-04-08)

Not yet decided, but worth recording:

- **Portrait → Pads UI**: replace the calculator step grid with the desktop PadsView (ADR 130) reflowed vertically. Pads feel more natural for one-thumb tap on a phone, and the square pad layout fits portrait width well.
- **Landscape → Grid UI**: the desktop StepGrid (label 112px + 16×24px = 496px) fits comfortably in landscape (667–844px wide minus left nav column). Landscape users get the full sequencer experience.
- **Result**: orientation literally swaps the two desktop tabs. No mobile-only step UI needed in the long run; MobileTrackView could be retired or reduced to a shell.

### Realtime Pads (cross-cutting idea)

Mobile pads should **trigger notes in real time** (tap = immediate `triggerNote`), not the current "select step → tap pad to write note" model. Same direction is desired for the desktop Pads view in **virtual keyboard mode** — pads become a playable instrument, recording into the step grid is a separate gesture.

- Engine support already exists: `engine.triggerNote(trackId, note, velocity)` and `releaseNote` / `releaseNoteByPitch` ([engine.ts:222-234](src/lib/audio/engine.ts#L222-L234)), backed by the worklet's `triggerNote` message ([dsp/types.ts:6](src/lib/audio/dsp/types.ts#L6)).
- `vkbd` state already tracks `enabled`, `octave`, `velocity`, `heldKeys` ([state.svelte.ts:445-450](src/lib/state.svelte.ts#L445-L450)).
- Open question: how does step recording coexist with realtime play? Options: (a) dedicated REC mode toggle, (b) record only when transport is rolling, (c) long-press pad = write to selected step, tap = play live.
- Drum tracks: realtime pad-drumming is the natural fit and removes any awkwardness of "pads as note picker" for drums.

This idea cross-cuts ADR 130 (Pads view) and should not be implemented until ADR 130 Phase 2/3 lands and the Pads UI spec is stable.

## Considerations

- **Tablets**: Landscape tablets (≥768px width) use the desktop layout, not this mobile landscape layout
- **Keyboard avoidance**: BPM input may trigger virtual keyboard — ensure layout doesn't break
- **Scope**: Layout only — no new features beyond what ADR 095 provides
