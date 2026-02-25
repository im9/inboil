# WASM Interface

## Overview

This document defines the contract between the Svelte 5 UI (main thread) and the C++ DSP core (AudioWorklet thread, compiled to WASM).

The boundary has two channels:
1. **Realtime channel** — `SharedArrayBuffer` + `Atomics` for lock-free state exchange.
2. **Control channel** — `MessagePort` for non-realtime commands (load pattern, change BPM, etc.).

## Threading Boundary

```
Main Thread (Svelte)                  AudioWorklet Thread (WASM)
─────────────────────                 ──────────────────────────
Write: paramBuffer[trackId][param]    Read: paramBuffer (every process() call)
Write: trigBuffer[trackId][step]      Read: trigBuffer (every step advance)
Read:  playheadBuffer[0]              Write: playheadBuffer (current step)
MessagePort.postMessage(cmd)    ───►  Receive command, apply on next safe cycle
                               ◄───  MessagePort.postMessage(event)
```

## SharedArrayBuffer Layout

All values are `Float32Array` or `Int32Array` views over the same `SharedArrayBuffer`.

### paramBuffer — `Float32Array[8][64]`
```
paramBuffer[trackIndex][paramIndex] = value
```
Parameter index mapping is defined per SynthType in `sound-design.md`.
The WASM reads this buffer each audio block; the UI writes it freely (no mutex needed, last-write-wins is acceptable for continuous parameters).

### trigBuffer — `Uint8Array[8][64]`
```
trigBuffer[trackIndex][stepIndex] = 1 (active) | 0 (inactive)
```
Written by UI; read by WASM sequencer clock.

### playheadBuffer — `Int32Array[8]`
```
playheadBuffer[trackIndex] = currentStep (0-indexed)
```
Written by WASM; read by UI for visual playhead rendering. UI never writes this.

### stateBuffer — `Int32Array[1]`
```
stateBuffer[0] = 0 (STOPPED) | 1 (PLAYING) | 2 (PAUSED)
```
Written by both sides with `Atomics.store`; read with `Atomics.load`.

## Control Channel (MessagePort)

Commands sent from UI → WASM:

```typescript
type ControlCommand =
  | { type: "SET_BPM"; bpm: number }
  | { type: "SET_TRACK_STEPS"; trackIndex: number; steps: number }
  | { type: "SET_TRACK_SCALE"; trackIndex: number; scale: 0.5 | 1 | 2 }
  | { type: "SET_TRACK_MUTE"; trackIndex: number; muted: boolean }
  | { type: "LOAD_SAMPLE"; trackIndex: number; buffer: ArrayBuffer }
  | { type: "TRANSPORT_PLAY" }
  | { type: "TRANSPORT_STOP" }
  | { type: "TRANSPORT_PAUSE" }
```

Events sent from WASM → UI:

```typescript
type EngineEvent =
  | { type: "TRIG_FIRED"; trackIndex: number; step: number }   // for visual feedback
  | { type: "PATTERN_LOOP" }                                    // pattern completed one cycle
```

## TypeScript Binding Layer

Located at `src/lib/wasm/engine.ts`.
Responsible for:
- Initializing WASM module and AudioWorklet
- Allocating SharedArrayBuffers and passing references to both sides
- Exposing a typed API to Svelte stores:

```typescript
interface GrooveboxEngine {
  setTrig(track: number, step: number, active: boolean): void;
  setParam(track: number, param: string, value: number): void;
  setBpm(bpm: number): void;
  setTrackSteps(track: number, steps: number): void;
  play(): void;
  stop(): void;
  pause(): void;
  onTrigFired(handler: (track: number, step: number) => void): void;
  getPlayhead(): Int32Array;  // returns view into SharedArrayBuffer
}
```

## Initialization Sequence

```
1. UI loads WASM module (async import)
2. UI creates SharedArrayBuffer (size calculated from track/step constants)
3. UI creates AudioContext + AudioWorkletNode
4. UI sends SAB references to AudioWorklet via MessagePort
5. WASM initializes synth voices on AudioWorklet thread
6. UI stores GrooveboxEngine instance in Svelte context
7. UI is ready to accept user interaction
```

## Error Handling

- WASM panics must not crash the audio thread silently. The AudioWorklet catches exceptions and posts an `{ type: "ENGINE_ERROR", message }` event.
- The UI shows the error non-intrusively (inline text, not a modal).
- No automatic recovery — user must reload.
