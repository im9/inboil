# ADR 005: Swing / Shuffle

## Status: IMPLEMENTED

## Context

Current sequencer runs straight 16th notes only. House, techno, hip-hop, and funk grooves rely on swing (delaying even-numbered 16th notes) to feel right. Without swing, rhythms sound stiff and mechanical.

## Proposed Design

Add a global `swing` parameter (0.50–0.67) controlling the timing ratio of even 16th notes:

- **0.50** = straight (no swing, current behavior)
- **0.58** = light swing (MPC default)
- **0.67** = triplet swing (shuffle, maximum)

### Implementation

In `worklet-processor.ts`, the sequencer currently advances steps at fixed intervals (`samplesPerStep`). With swing:

- Odd steps (0, 2, 4, …): normal timing
- Even steps (1, 3, 5, …): delayed by `(swing - 0.5) * 2 * samplesPerStep`

The total pair duration (odd + even) remains constant — swing redistributes timing within each pair, not adding latency.

### UI

A SWG knob in PerfBar. UI displays normalized 0–100% (internally mapped to 0.50–0.67 effective swing ratio in the worklet via `0.5 + value * 0.17`).

## Consequences

- **Positive:** Enables groove styles essential for electronic music.
- **Positive:** Simple implementation — only changes step timing, no new DSP.
- **Negative:** Per-track swing is not supported (global only). Per-track swing is rare in hardware grooveboxes and adds complexity.
