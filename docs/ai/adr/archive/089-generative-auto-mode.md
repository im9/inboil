# ADR 089: Generative Auto-Mode & Sequencer Integration

## Status: Implemented

**Amends**: ADR 078 (Generative Scene Nodes) — replaces explicit write/live mode toggle with context-aware auto-detection and step sequencer integration.

## Context

ADR 078 introduced generative nodes (Turing Machine, Quantizer, Tonnetz) with two explicit modes: **write** (bake into pattern) and **live** (real-time modulation during scene playback). Users must manually toggle between these modes, which adds friction and is unintuitive — the correct mode is almost always obvious from context.

Additionally, the current "Generate" action is only accessible from the DockPanel generative editor, disconnected from the step sequencer where its output lands.

## Proposal

### 1. Auto-Mode Detection

Remove the explicit write/live toggle button. The mode is determined automatically:

| Playback Context | Mode | Behavior |
|------------------|------|----------|
| **Scene play** | Live | Generative nodes modulate in real-time per step. No pattern mutation. |
| **Pattern play (loop)** | Write standby | Nothing happens until user explicitly triggers generate. |

### 2. Step Sequencer Generate Button

Add a **generate icon button** (e.g. dice or sparkle) to the step sequencer toolbar (PatternToolbar):

- **Tap** → runs the upstream generative chain for the current pattern and writes the result into the pattern (write mode)
- Without tapping, pattern content is untouched — no surprises
- Button is only visible/enabled when the current pattern has upstream generative nodes in the scene graph

This makes the generate action discoverable and co-located with the data it affects.

### 3. Live Mode: Beyond the Step Grid

With live mode tied to scene playback, generative output can bypass the step sequencer grid entirely:

- **Microtiming**: Generate note events with sub-step timing offsets, not quantized to the grid
- **Microtonality**: Generate fractional MIDI notes (e.g. 60.5) for quarter-tone or just-intonation output
- **Continuous modulation**: Generative curves applied directly to voice parameters per-sample

This opens a path from step-sequenced patterns toward the graphic score aesthetic (ADR 026).

## Changed Files

| File | Changes |
|------|---------|
| `state.svelte.ts` | Remove `outputMode` from `GenerativeConfig` (or make it derived). Auto-detect based on `playback.mode`. |
| `DockGenerativeEditor.svelte` | Remove write/live toggle UI |
| `PatternToolbar.svelte` | Add generate button (visible when upstream generative nodes exist) |
| `state.svelte.ts` (`applyLiveGenerative`) | Only runs during scene playback |
| `engine.ts` | Future: accept sub-step timing offsets for microtiming |

## Consequences

- **Positive**: One fewer concept for users to learn — mode is always contextually correct
- **Positive**: Generate button in sequencer makes the feature more discoverable
- **Positive**: Opens path to microtiming/microtonality without breaking existing grid-based workflow
- **Negative**: Power users lose manual mode override — mitigate with Shift+click or long-press for force-write during scene play if needed

## Open Questions

- Icon for the generate button: dice (randomness) or sparkle (AI/magic)?
- Should the generate button show a preview diff before committing to the pattern?
- Microtiming/microtonality is a large follow-up — scope for this ADR is auto-mode + sequencer button only
