# ADR 008: Granular Processor Enhancements

## Status: PROPOSED

## Context

The current GranularProcessor is a basic grain cloud: captures audio into a ring buffer and replays with Hann-windowed grains at random offsets. This works well as a texture generator, but lacks creative sound design possibilities compared to dedicated granular tools.

## Proposed Enhancements

### 1. Pitch Shift per Grain

Each grain plays back at a modified rate (faster = pitch up, slower = pitch down). Requires interpolated reads from the ring buffer instead of integer-position reads.

- New parameter: `pitch` (-12 to +12 semitones, or 0.5x–2.0x ratio)
- Could be randomized per grain for shimmering textures

### 2. Reverse Grains

A probability parameter (0.0–1.0) controlling how many grains play backwards. Combined with normal grains creates an ambient swirl effect.

### 3. Grain Scatter (Position Randomization)

Currently grains pick random offsets within the last 0.5s. A scatter parameter could widen this to the full 0.75s buffer or narrow to near-realtime (stutter effect).

### 4. Freeze Mode

Stop writing to the ring buffer but continue spawning grains from frozen content. Creates a sustained texture from the captured moment. Toggle via FxPad long-press on GRN node.

## FxPad Mapping

Current: X = grain size, Y = density.
With enhancements, the FxPad XY could be remapped or a secondary mode added:
- **Mode 1** (default): X = size, Y = density
- **Mode 2** (hold): X = pitch, Y = scatter

## Consequences

- **Positive:** Significantly expands sonic palette with minimal DSP cost.
- **Positive:** Pitch shift and reverse are common in granular tools (Clouds, Beads).
- **Negative:** More parameters to expose in UI. FxPad XY has limited axes.
- **Negative:** Interpolated reads for pitch shift add ~2x computation per grain.
