# ADR 001: DSP Core in C++ compiled to WebAssembly

## Status: Superseded

## Context

The app requires real-time audio synthesis in the browser with low latency (≤10ms).
The same DSP code must eventually run on iOS (as a native library) and as a VST3 plugin.
JavaScript alone cannot guarantee the performance required for audio synthesis, and
a pure-JS DSP layer would need to be completely rewritten for iOS/VST.

## Decision

All audio synthesis and sequencer clock logic is implemented in **C++17**,
compiled to **WebAssembly via Emscripten** for the web platform.

The WASM module runs inside an **AudioWorklet** to isolate it from the main thread
and prevent garbage-collection pauses from causing audio glitches.

## Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| Pure JavaScript DSP | No path to iOS/VST reuse; GC pauses cause audio dropouts |
| Web Audio API built-ins only | Too limited for custom synthesis algorithms |
| Rust → WASM | Team familiarity and iOS/VST tooling favor C++ (JUCE, CoreAudio) |
| Tone.js / similar lib | Abstracts too much; prevents fine-grained DSP control |

## Consequences

- **Positive:** DSP code is write-once, run on web/iOS/VST.
- **Positive:** Near-native audio performance in the browser.
- **Negative:** Emscripten build adds complexity to the dev toolchain.
- **Negative:** Debugging across the WASM boundary is harder than pure JS.
- **Mitigated by:** The `wasm-interface.md` document defines a clear, typed API boundary that limits where cross-language bugs can occur.

## Superseded (2026-03)

DSP is now implemented entirely in **TypeScript AudioWorklet** (`src/lib/audio/worklet-processor.ts` + `src/lib/audio/dsp/`). The pure-JS approach has proven sufficient for performance — no GC-related audio dropouts have been observed in practice.

The original C++ prototype (`src/dsp/`) was removed as dead code. If iOS/VST portability is revisited, a fresh C++ layer should be written against the current AudioWorklet DSP as the reference implementation, rather than resurrecting the old headers.
