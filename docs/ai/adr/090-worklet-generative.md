# ADR 090: Worklet-Side Generative Engine

## Status: Proposed

**Depends on**: ADR 089 (Generative Auto-Mode), ADR 078 (Generative Scene Nodes)

## Context

ADR 089 introduced arm-mode generative with delayed per-step writing: at loop head the main thread generates all trigs into a buffer, then writes one trig per step as the playhead advances. This gives a visual "filling in" effect in the piano roll, but the audio engine still receives the full pattern at once — there is no true real-time generation at the audio level.

For microtiming (sub-step offsets), microtonality (fractional MIDI notes), and continuous parameter modulation, the generative algorithms need to run inside the WASM AudioWorklet where they have sample-accurate timing.

## Proposal

### Phase 1: Worklet Generative API

Add a generative execution context to the C++ worklet:

- **GenerativeState**: per-voice shift register, scale tables, Tonnetz chord state
- **`setGenerativeConfig(trackIdx, engineType, params)`**: configure from main thread via message port
- **`advanceGenerative(stepIndex)`**: called at each step boundary inside the worklet
- Output: note/velocity/gate values applied directly to voice triggers

### Phase 2: Microtiming & Microtonality

With generation happening in the worklet:

- **Microtiming**: generate note events with sub-step sample offsets, not quantized to grid
- **Microtonality**: fractional MIDI notes (e.g. 60.5) for quarter-tone or just-intonation
- **Continuous modulation**: generative curves applied per-sample to voice parameters

### Phase 3: Main Thread Sync

The worklet generates and plays autonomously. The main thread needs feedback for UI:

- Worklet posts `generatedStep` messages back to main thread with the trig data
- Main thread updates `cell.trigs[step]` for piano roll / step sequencer display
- This is display-only — the worklet is the source of truth during live generation

## Risks

- **C++ port of generative algorithms**: Turing, Quantizer, Tonnetz must be reimplemented in C++
- **State sync complexity**: two sources of truth (worklet for audio, main thread for UI)
- **Testing**: worklet code is harder to unit test than pure TypeScript functions
- **Regression**: changes to the audio worklet affect all playback, not just generative

## Consequences

- **Positive**: True real-time generation with sample-accurate timing
- **Positive**: Opens path to graphic score aesthetic (ADR 026)
- **Positive**: Generative output no longer limited to step grid
- **Negative**: Significant implementation effort (C++ port + message protocol)
- **Negative**: Dual source of truth adds complexity

## Open Questions

- Should the TypeScript generative functions be kept as reference implementations / test oracles?
- Can we use wasm-bindgen or similar to share algorithm code between TS and C++?
- Priority relative to other worklet work (ADR 087 looper, sampler)?
