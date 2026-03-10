# ADR 077: Per-Track Insert FX

## Status: Proposed

## Context

The current FX architecture uses a send-bus design: up to 16 tracks route their output to 4 shared buses (Reverb / Delay / Glitch / Granular), with each track controlling wet amount via send level (0.0–1.0).

```
Track 0  ──┬──→ dry mix
Track 1  ──┤
  ...       ├──→ reverbSend  ──→ [SimpleReverb]   ──→ return mix
Track 15 ──┤──→ delaySend   ──→ [PingPongDelay]  ──→ return mix
            ├──→ glitchSend  ──→ [Glitch S&H]     ──→ return mix
            └──→ granularSend──→ [GranularProc]   ──→ return mix
```

This means all tracks share the same reverb/delay "character". ADR 075's FX Flavours enabled algorithm switching, but it's still global — "Bitcrush on drums only" or "Dotted Delay on bass only" is not possible.

Insert FX places individual effect instances per track, dramatically expanding sound design possibilities. Especially powerful combined with ADR 012 Sampler (individual effects on drum breaks).

## Decision

### 1. Architecture: Insert → Send Serial Chain

```
Track N  ──→ [Insert FX slot] ──→ pan ──┬──→ dry mix ──→ ...
                                        ├──→ sendBus(verb)
                                        ├──→ sendBus(delay)
                                        └──→ sendBus(glitch/granular)
```

Insert FX is placed **immediately after** track output, **immediately before** pan and send. The insert-processed signal feeds into the send buses.

### 2. Insert FX Slot Design

Each track gets **1 slot** (Phase 1). Multiple slot chains are possible in the future, but starting with one to manage CPU and UI complexity.

```typescript
// Added to Cell (per-pattern, per-track)
export interface CellInsertFx {
  type: 'verb' | 'delay' | 'glitch' | 'granular' | null  // null = bypass
  flavour: string       // 'room', 'hall', 'digital', 'dotted', etc.
  mix: number           // 0.0–1.0 dry/wet
  x: number             // 0.0–1.0 param1 (type-dependent)
  y: number             // 0.0–1.0 param2 (type-dependent)
}

export interface Cell {
  // ... existing fields ...
  insertFx?: CellInsertFx  // optional for backwards compat
}
```

#### Parameter Mapping

| type | x | y |
|------|---|---|
| verb | size | damp |
| delay | time | feedback |
| glitch | rate (S&H freq) | bit depth |
| granular | grain size | density |

Reuses the same parameter space as send FX, so DSP code can be shared.

### 3. Worklet Implementation

#### 3a. Insert FX Instance Pool

Up to 16 tracks, managed with **lazy instantiation**. Tracks without insert FX don't create instances:

```typescript
// worklet-processor.ts
private insertSlots: (InsertFxSlot | null)[] = new Array(16).fill(null)

interface InsertFxSlot {
  type: string
  reverb?: SimpleReverb
  delay?: PingPongDelay
  glitch?: { holdL: number; holdR: number; counter: number }
  granular?: GranularProcessor
  mix: number
  x: number
  y: number
}
```

#### 3b. Insert Update in setPattern

```typescript
// Inside setPattern
for (let t = 0; t < tracks.length; t++) {
  const ins = tracks[t].insertFx
  if (!ins || !ins.type) {
    this.insertSlots[t] = null  // bypass
    continue
  }
  // Only recreate when type changes (prevents clicks)
  if (!this.insertSlots[t] || this.insertSlots[t]!.type !== ins.type) {
    this.insertSlots[t] = this.createInsertSlot(ins.type, this.sr)
  }
  this.updateInsertParams(this.insertSlots[t]!, ins)
}
```

#### 3c. Insert Application in process()

Inserted immediately after voice output, before panning:

```typescript
// Current: voiceL/R → pan → sendBus
// Changed: voiceL/R → insertFx → pan → sendBus
if (this.insertSlots[t]) {
  const slot = this.insertSlots[t]!
  const [wetL, wetR] = this.processInsert(slot, voiceL, voiceR)
  voiceL = voiceL * (1 - slot.mix) + wetL * slot.mix
  voiceR = voiceR * (1 - slot.mix) + wetR * slot.mix
}
```

### 4. Memory & CPU Budget Management

#### Memory Estimate (per-instance)

| FX | Buffer Size | ×16 tracks |
|----|-------------|------------|
| SimpleReverb | comb 4937 + allpass 997 = ~12K samples × 2ch × 4B = **~48KB** | **~768KB** |
| PingPongDelay | 44100 samples × 2ch × 4B = **~350KB** | **~5.6MB** |
| Glitch (S&H) | No buffer ≈ **0KB** | **~0KB** |
| Granular | 0.75s × 2ch × 4B + grain state = **~270KB** | **~4.3MB** |

Worst case (all 16 tracks with Delay): ~6MB — **memory is not a concern**. The AudioWorklet heap can handle hundreds of MB.

#### CPU Cost Estimate (per-sample, 44.1kHz)

##### Voice Processing (Baseline Cost Before Insert FX)

Polyphony expansion (FM/Wavetable: 4poly → 12poly planned) will significantly increase baseline cost:

| Configuration | Max Simultaneous Voices | Estimate |
|---------------|------------------------|----------|
| Current: 16tr × 4poly | 64 voices | Baseline |
| Planned: 16tr × 12poly | 192 voices | **3×** |

FM/Wavetable voices are relatively heavy (osc + filter + envelope). The 12poly expansion alone will significantly increase CPU usage. Insert FX is **added on top** of this, so it must fit within the remaining budget.

##### Insert FX Additional Cost

| FX | ops/sample | ×16 tracks |
|----|------------|------------|
| SimpleReverb | comb×8 + allpass×4 = 12 ops | 192 ops |
| PingPongDelay | buffer read×2 + write×2 = 4 ops | 64 ops |
| Glitch (S&H) | 2 ops | 32 ops |
| Granular | grain×10 = 10 ops | 160 ops |

Insert FX processes the track's **mixed output** (after all voices are summed), so polyphony increase does not directly affect Insert FX computation. However, if 12poly voice processing consumes most of the CPU, less headroom remains for Insert FX.

Worst case (12poly + all 16 tracks with Reverb Insert): 3× voice processing + 192 ops/sample additional. Tough on low-end mobile.

**→ Measure 12poly baseline with Phase 0 CPU meter before deciding Insert FX implementation scope.**

#### Mitigations

1. **No hard limit, CPU meter for self-regulation**: Don't hard-limit simultaneous active count; visualize CPU load and let users decide (see §4a below)
2. **Lightweight insert algorithm**: `LiteReverb` with reduced comb filters (comb×4 + allpass×2) for insert use. Roughly half the CPU cost of full Reverb
3. **Exclude Granular**: Granular is not selectable for insert (highest CPU cost + ring buffer memory)
4. **Lazy instantiation**: Tracks with insert OFF don't create instances → zero cost for unused slots

#### 4a. CPU Meter (Useful Independent of Insert FX)

Measure `process()` execution time in the AudioWorklet and display a CPU load indicator in the UI. Useful for general performance monitoring beyond Insert FX, so it can be implemented before Insert FX.

##### Worklet Side: Measurement + Transmission

```typescript
// worklet-processor.ts
private cpuPeak = 0
private readonly budgetMs: number  // = 128 / sampleRate * 1000 (render quantum)

constructor() {
  // 128 samples @ 44.1kHz = 2.9ms budget per render quantum
  this.budgetMs = 128 / sampleRate * 1000
}

process(inputs, outputs) {
  // performance.now() is available in AudioWorklet (Chrome 113+, Safari 17+)
  const t0 = performance.now()
  // ... process ...
  const cpuMs = performance.now() - t0
  if (cpuMs > this.cpuPeak) this.cpuPeak = cpuMs

  // Piggyback on existing meter transmission (~60Hz)
  if (this.meterCount >= this.meterInterval) {
    const cpuPercent = (this.cpuPeak / this.budgetMs) * 100
    this.port.postMessage({ type: 'levels', peakL, peakR, cpu: cpuPercent })
    this.cpuPeak = 0
  }
}
```

##### Main Thread Side: State + Display

```typescript
// state.svelte.ts
export const masterLevels = $state({ peakL: 0, peakR: 0, cpu: 0 })

// engine.ts — add to existing 'levels' handler
if (e.data.type === 'levels') {
  masterLevels.peakL = e.data.peakL
  masterLevels.peakR = e.data.peakR
  masterLevels.cpu   = e.data.cpu ?? 0
}
```

##### UI: CPU Indicator

Compact CPU meter at the right edge of PerfBar (top bar):

```
┌─ PerfBar ──────────────────────────────────────────────┐
│  ▶ 120BPM  [FX] [EQ]  PAT1  ···          CPU ▐▐▐░░ 42%│
└────────────────────────────────────────────────────────┘
```

- **0–60%**: Green — normal
- **60–85%**: Yellow — elevated load
- **85–100%**: Red + pulse animation — near limit, consider reducing Insert FX
- **100%+**: Red blinking — audio glitches likely. Tooltip: "CPU overload — reduce Insert FX or tracks"

Compact display (5 bars + percentage). Future expansion: tap to show per-Insert FX breakdown in DockPanel.

### 5. UI Design

#### DockPanel — Track Parameters

Add Insert FX section above existing Send level sliders:

```
┌─ Track 3: BASS ───────────┐
│                            │
│  INSERT FX                 │
│  ┌─────────────────────┐   │
│  │ [DELAY ▼] [Dotted ▼]│   │ ← type select + flavour select
│  │  MIX ═══════○══     │   │ ← dry/wet slider
│  │  X   ═══○══════     │   │ ← param1 (time)
│  │  Y   ════════○═     │   │ ← param2 (feedback)
│  └─────────────────────┘   │
│                            │
│  SEND                      │
│  VRB ═══○══════  0.3       │
│  DLY ══════○═══  0.5       │
│  GLT ○═════════  0.0       │
│  GRN ○═════════  0.0       │
│                            │
│  VOL ═══════○══            │
│  PAN    ════○════          │
└────────────────────────────┘
```

#### MatrixView Indicator

Tracks with active Insert FX show a small dot (effect color) in the MatrixView track header:

```
┌────┬────────────────────┐
│ KK │ ● ● ○ ○ ● ○ ● ○   │  ← steps
│ SN │ ● ○ ○ ● ● ○ ○ ●   │
│ HH │ ● ● ● ● ● ● ● ●   │
│ BS ◆│ ● ○ ● ○ ● ○ ● ○   │  ← ◆ = insert FX active
│ LD │ ● ○ ○ ○ ● ○ ○ ○   │
└────┴────────────────────┘
```

### 6. WorkletPattern Extension

```typescript
// dsp/types.ts
export interface WorkletInsertFx {
  type: 'verb' | 'delay' | 'glitch' | null
  mix: number
  x: number
  y: number
  // flavour-specific flags
  dotted?: boolean    // delay flavour
  redux?: boolean     // glitch flavour
  hall?: boolean      // reverb flavour
}

export interface WorkletTrack {
  // ... existing fields ...
  insertFx?: WorkletInsertFx
}
```

### 7. Serialization / Undo

- `Cell.insertFx` is optional — backwards compatible with old save data
- `clonePattern()` spread-clones `insertFx`
- `pushUndo()` is automatically covered by existing Song snapshot system
- P-Lock relationship: Insert FX parameters are fixed at Cell level (whole pattern). Per-step P-Lock is out of scope for Phase 1

## Implementation Order

1. **Phase 0: CPU Meter (can be implemented independently)**
   - `performance.now()` measurement in worklet `process()`
   - Add `masterLevels.cpu` state
   - CPU indicator in PerfBar
   - Useful without Insert FX — recommended to implement first

2. **Phase 1: DSP + Data Structures**
   - Add `CellInsertFx` interface
   - Add `WorkletInsertFx`
   - `InsertFxSlot` instance pool (verb / delay / glitch only, up to 16 tracks)
   - Insert processing path in `process()`
   - Insert parameter assembly in `buildWorkletPattern()`

3. **Phase 2: UI**
   - Insert FX section in DockPanel track parameters
   - Type / flavour selector (tap-to-cycle or dropdown)
   - Mix / x / y sliders (reuse existing DockPanel knob components)
   - MatrixView track header indicator
   - CPU meter warning levels (built on Phase 0)

4. **Phase 3: Optimization**
   - `LiteReverb` lightweight reverb implementation (halves CPU)
   - Tooltip warnings when CPU threshold exceeded

5. **Phase 4: Extensions**
   - Insert P-Lock (per-step mix / x / y overrides)
   - Multiple slot chains (max 2)
   - Integration with ADR 076 per-pattern flavours

## Considerations

- **Why exclude Granular from Insert**: ring buffer (0.75s × 2ch × 4bytes ≈ 270KB/instance) × 16 = ~4.3MB — memory is fine, but 10 grains × 16 tracks = 160 grains of per-sample computation is very heavy. Sharing a single instance on the send bus is practical
- **Memory is not a concern**: Even 16 tracks of PingPongDelay (heaviest) is only ~5.6MB. AudioWorklet heap reserves hundreds of MB. The bottleneck is CPU only
- **Insert vs Send usage guidance**: Insert = track-specific character (bitcrush on drums, delay on bass). Send = shared spatial effects (reverb/delay across everything). Both can be used simultaneously
- **LiteReverb trade-off**: comb×4 reduces density and can sound metallic. However, for insert use cases ("adding character"), lo-fi quality is acceptable
- **Tail on pattern transition**: Insert FX switching will cut reverb/delay tails. Phase 1 accepts instant switching; tail fade (50ms) to be considered in the future
- **Relationship with ADR 075 flavours**: Insert FX flavours are stored directly in Cell, independent of global `fxFlavours`. Send bus flavours are global; Insert flavours are per-track
- **Priority vs 12poly expansion**: FM/Wavetable 4→12poly expansion is planned. 12poly roughly triples voice processing CPU cost, so it should be implemented before Insert FX, with CPU meter measurements to inform Insert FX scope. Measurement results will determine acceptable slot counts and whether LiteReverb is necessary

## Future Extensions

- **Insert FX presets**: Save frequently-used type + flavour + params combinations as presets (e.g., "Crunchy Bass" = glitch/redux, mix 0.4, rate 0.3)
- **Sidechain Insert**: Trigger Insert FX behavior from another track (e.g., kick ducks Insert Delay feedback)
- **Stereo Insert**: Current voices output mono, but stereo Insert (ping-pong delay etc.) would widen the stereo image
- **WASM DSP**: If CPU constraints are severe, migrate Insert FX to C++ WASM for acceleration
