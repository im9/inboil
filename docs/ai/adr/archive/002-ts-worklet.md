# ADR 002: TypeScript AudioWorklet as Current DSP Runtime

## Status: Implemented

## Context

ADR 001 established C++/WASM as the long-term DSP target for cross-platform reuse (iOS, VST).
However, the WASM integration adds significant build complexity (Emscripten toolchain, SharedArrayBuffer COOP/COEP headers, debugging across the WASM boundary).

During the initial development phase, rapid iteration on synthesis algorithms, effects chain, and sequencer behavior is more valuable than cross-platform portability.

## Decision

All audio DSP runs in **TypeScript** directly inside the AudioWorklet processor (`worklet-processor.ts`).
Communication uses **MessagePort** only — no SharedArrayBuffer.

The UI sends the entire pattern + effects + performance state as a serialized object via `postMessage` on every reactive change. The worklet applies the new state on the next `process()` cycle.

The C++ DSP core (`src/dsp/`) is developed in parallel but not yet integrated into the web build.

## Consequences

- **Positive:** Zero build complexity — standard Vite + TypeScript toolchain.
- **Positive:** Easy debugging — all DSP code is readable TypeScript in the same dev tools.
- **Positive:** Fast iteration on synthesis algorithms without Emscripten rebuild cycles.
- **Negative:** TypeScript DSP is not reusable on iOS/VST (will need C++ port eventually).
- **Negative:** JavaScript GC pauses could theoretically cause audio glitches (not observed at current complexity).
- **Mitigated by:** The TypeScript voice/FX implementations serve as reference implementations for the C++ port. The `WorkletPattern` interface acts as the API contract both runtimes must satisfy.
