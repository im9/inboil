# Audio Interface

## Overview

This document defines the contract between the Svelte 5 UI (main thread) and the TypeScript AudioWorklet processor (audio thread).

Communication is via **MessagePort** only. No SharedArrayBuffer is used.

## Threading Boundary

```
Main Thread (Svelte)                        AudioWorklet Thread (TypeScript)
─────────────────────                       ──────────────────────────────
engine.sendPattern(pattern, fx, perf, fxPad) → postMessage({ type: 'setPattern', pattern: {...} })
engine.play()                                → postMessage({ type: 'play' })
engine.stop()                                → postMessage({ type: 'stop' })

                                        ◄──  postMessage({ type: 'step', playheads: [...] })
```

The UI sends the **entire pattern + effects + performance + fxPad state** as a serialized object on every reactive change. This is simple and correct for the current scale (8 tracks × 64 steps).

## Audio Graph

```
AudioWorkletNode → AnalyserNode → AudioContext.destination
```

The `AnalyserNode` (fftSize=1024, smoothingTimeConstant=0.8) is inserted between the worklet and destination for the FxPad audio visualizer. It passes audio through transparently.

## Commands (UI → Worklet)

```typescript
interface WorkletCommand {
  type: 'play' | 'stop' | 'setBpm' | 'setPattern' | 'triggerNote' | 'releaseNote'
  bpm?: number
  pattern?: WorkletPattern
  reset?: boolean
  trackId?: number          // for triggerNote / releaseNote
  note?: number             // for triggerNote
  velocity?: number         // for triggerNote
}
```

### WorkletPattern

The full state snapshot sent via `setPattern`:

```typescript
interface WorkletPattern {
  bpm: number
  tracks: WorkletTrack[]
  fx: {
    reverb:  { size: number; damp: number }
    delay:   { time: number; feedback: number }    // time in ms (computed from beat fraction × BPM)
    ducker:  { depth: number; release: number }
    comp:    { threshold: number; ratio: number; makeup: number }
    filter:  { on: boolean; x: number; y: number }  // master filter sweep
    eq:      { bands: Array<{ on: boolean; freq: number; gain: number }> }  // 3-band EQ
  }
  perf: {
    rootNote: number        // 0–11 chromatic key (0=C)
    octave: number          // -2 to +2 octave shift for melodic tracks
    breaking: boolean       // rhythmic gate
    masterGain: number      // 0.0–1.0
    filling: boolean        // drum fill mode
    reversing: boolean      // reverse playback
    swing: number           // 0.0–1.0 (mapped to 0.50–0.67 in worklet)
    glitchX: number         // FxPad: glitch downsample rate (0–1)
    glitchY: number         // FxPad: glitch bit crush depth (0–1)
    granularOn: boolean     // FxPad: granular grain spawning active
    granularX: number       // FxPad: grain size (0–1, maps to 10–200ms)
    granularY: number       // FxPad: grain density (0–1, sparse→dense)
    granularPitch: number   // 0–1 (0.5 = no shift, ±12 semitones)
    granularScatter: number // 0–1 (position randomization)
    granularFreeze: boolean // freeze ring buffer writing
  }
}

interface WorkletTrack {
  steps: number
  trigs: WorkletTrig[]
  muted: boolean
  synthType: string
  volume: number            // 0.0–1.0 (default 0.8)
  pan: number               // -1.0 to 1.0
  reverbSend: number        // 0.0–1.0
  delaySend: number         // 0.0–1.0
  glitchSend: number        // 0.0–1.0
  granularSend: number      // 0.0–1.0
  voiceParams: Record<string, number>
}

interface WorkletTrig {
  active: boolean
  note: number
  velocity: number
  duration: number          // step count 1–16 (default 1)
  slide: boolean            // slide/glide flag (default false)
  chance?: number           // 0.0–1.0, undefined = always fire
  paramLocks?: Record<string, number>  // per-step voice param overrides
}
```

## Events (Worklet → UI)

```typescript
type WorkletEvent =
  | { type: 'step'; playheads: number[] }   // current step position per track
```

The `step` event fires on every step advance and carries the current playhead position for all 8 tracks.

## Parameter Application Timing

Parameters are applied with different timing depending on their nature:

| Category | Applied when | Examples |
|---|---|---|
| Immediate | On `setPattern` receipt | EQ, masterGain, FX params, voice params, fxPad XY |
| Step-quantized | At next step boundary | rootNote, octave, breaking, filling, reversing |

Step-quantized params are stored as `pending*` values and flushed in `_advanceStep()`. This prevents audible artifacts from mid-step changes to sequencer-affecting parameters.

## Engine API (Main Thread)

Located at `src/lib/audio/engine.ts`.

```typescript
class GrooveboxEngine {
  async init(): Promise<void>                              // Create AudioContext + load worklet + AnalyserNode
  sendPattern(pattern, fx, perf?, fxPad?, reset?): void    // Serialize & post full state
  play(): void                                             // Resume AudioContext + post play
  stop(): void                                             // Post stop (suspends context after 8s idle)
  triggerNote(trackId, note, velocity): void                // Immediate note trigger (VKBD audition)
  releaseNote(trackId): void                               // Release triggered note
  set onStep(cb: (playheads: number[]) => void)            // Register step callback
  getAnalyser(): AnalyserNode | null                       // FFT data for visualizer
}
```

## State Serialization

`patternToWorklet()` in `engine.ts` converts UI state to the wire format:
- Clones all objects (no shared references across threads)
- Computes delay time from beat fraction: `(60000 / bpm) * fraction`
- Maps FxPad XY positions to effect parameters (e.g., verb.x → reverb size, verb.y → reverb damp)
- Provides defaults for perf and fxPad if not supplied

## Initialization Sequence

```
1. User clicks Play (or first interaction)
2. GrooveboxEngine.init() creates AudioContext
3. AudioWorklet module loaded from worklet-processor.ts (Vite bundles as URL)
4. AudioWorkletNode created (stereo output, no inputs)
5. AnalyserNode created (fftSize=1024, smoothingTimeConstant=0.8)
6. Node → AnalyserNode → AudioContext.destination
7. MessagePort onmessage handler wired for 'step' events
8. $effect in App.svelte calls sendPattern() on every reactive state change
9. engine.play() resumes AudioContext + posts 'play' command
```

## Error Handling

The AudioWorklet processor uses `return true` from `process()` to stay alive indefinitely.
No explicit error channel is implemented yet — WASM errors are not applicable since DSP runs in TypeScript.
