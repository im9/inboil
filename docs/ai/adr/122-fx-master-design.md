# ADR 122: FX & Master Audio Design

## Status: Proposed

## Context

The current FX and master bus architecture has grown organically and lacks a clear design framework for what belongs where. This causes confusion when adding new effects or adjusting existing ones.

### Current architecture

```
Track voices ──┬── dry (pan, volume) ──────────────────────────────┐
               ├── reverbSend ──► VERB (Room/Hall/Shimmer) ──┐    │
               ├── delaySend  ──► DLY  (Digi/Dotted/Tape)  ──┤    │
               ├── glitchSend ──► GLT  (Crush/Redux/Stutter)─┤    │
               └── granSend   ──► GRN  (Cloud/Stretch)  ─────┤    │
                                                              ▼    ▼
Per-track insert FX (2 slots):                            SidechainDucker
  verb | delay | glitch                                       │
                                                         BusCompressor
                                                              │
                                                          PeakingEQ ×3
                                                              │
                                                           DJ Filter
                                                              │
                                                          Break gate
                                                              │
                                                        TapeSaturator (SAT)
                                                              │
                                                          Master gain
                                                              │
                                                         PeakLimiter
```

### Problems

1. **No distortion/saturation as per-track effect** — insert FX types are `verb | delay | glitch`. Users want distortion/overdrive on individual tracks (bass, drums), not just master.

2. **TapeSaturator identity crisis** — originally implemented as "tape saturation" (tanh distortion), reworked to tape compression (asymmetric soft-knee). The name says "saturator" but the behavior is "compressor with color." User wants DECO Classic (vacuum tube) character but current implementation is more cassette-like.

3. **No clear design principle** for what goes where:
   - Master bus: processing that affects the final mix (comp, EQ, limiter, sat)
   - Send FX: shared effects with per-track send levels (reverb, delay, glitch, granular)
   - Insert FX: per-track serial chain (currently only verb/delay/glitch)

### Current code

- Master bus: `TapeSaturator` (`effects.ts:451`), `BusCompressor` (`effects.ts:154`), `PeakLimiter` (`effects.ts:189`), `SidechainDucker` (`effects.ts:137`)
- Send FX: `SimpleReverb`/`ModulatedReverb`/`ShimmerReverb`, `PingPongDelay`/`TapeDelay`, `GranularProcessor`, `StutterBuffer` (all in `effects.ts`)
- Insert FX: `WorkletInsertFx.type: 'verb' | 'delay' | 'glitch'` (`types.ts:71`)
- Master pad: `sat: { on, x: drive, y: tone }` in `EngineContext.masterPad` (`engine.ts:15`)

## Decision

### 1. Design principles

| Layer | Purpose | Character | Examples |
|---|---|---|---|
| **Insert FX** | Shape individual track sound | Creative, per-track | Distortion, saturation, chorus, phaser |
| **Send FX** | Shared spatial/textural effects | Ambient, shared | Reverb, delay, granular, glitch |
| **Master bus** | Final mix polish | Transparent, subtle | Compression, EQ, limiting, tape warmth |

**Rule of thumb**: if you'd want different settings per track, it's an insert. If it's shared space, it's a send. If it's mix glue, it's master.

### 2. Add distortion/saturation as insert FX type

Add `'dist'` to `WorkletInsertFx.type`:

```typescript
type: 'verb' | 'delay' | 'glitch' | 'dist' | null
```

Distortion insert with XY pad control:
- **X**: drive (0–1 → clean to heavy)
- **Y**: tone (0–1 → dark to bright)
- **Flavours**: `overdrive` (soft, tube-like) / `fuzz` (hard clip) / `bitcrush` (digital)

### 3. Rename and refine TapeSaturator

Rename to `MasterTape` or keep `TapeSaturator` but clarify its role as **master bus tape coloring** — not distortion. Refine toward DECO Classic character:

- Add mid-frequency presence boost (~1.5–3kHz shelf, subtle)
- Widen the soft-knee for smoother compression onset
- Keep head bump and hiss as tape character elements
- At low drive: nearly transparent warmth. At high drive: gentle, musical compression

### 4. Insert FX distortion engine

New class `Distortion` in `effects.ts`:

```typescript
export class Distortion {
  // Overdrive: tube-style asymmetric saturation with cabinet-like tone shaping
  // Fuzz: hard clip with even/odd harmonic blend
  // Bitcrush: sample rate reduction + bit depth (moved from glitch send?)
}
```

Overdrive flavour should have:
- Pre-EQ boost (mid push before saturation)
- Asymmetric soft clip (similar principle to TapeSaturator but more aggressive)
- Post-EQ (cabinet simulation — LP + resonance)
- Mix control (parallel processing)

## Considerations

- **Bitcrush overlap**: glitch send already has crush/redux. Insert bitcrush would be per-track with mix control — different use case (subtle lo-fi vs destructive send effect). Could share DSP code.
- **CPU budget**: Distortion per-track is cheap (transfer function + filters). No concern.
- **Insert slot count**: Currently 2 slots per track (ADR 114). Distortion fits in existing slots.
- **Migration**: Adding `'dist'` to insert type union is backwards compatible (existing saves don't use it).
- **TapeSaturator tuning**: "Classic tube" vs "cassette" is largely about the saturation curve shape and mid-frequency emphasis. Can be iterated by ear without architectural changes.

## Implementation Phases

### Phase 1: Insert distortion
- `Distortion` class with overdrive/fuzz flavours
- Add `'dist'` to `WorkletInsertFx.type`
- Worklet routing for insert distortion
- DockPanel UI for insert dist (XY knobs + flavour selector)

### Phase 2: TapeSaturator refinement
- Add mid-presence boost (~2kHz) for Classic tube character
- Widen soft-knee curve
- Ear-test with reference material (DECO Classic, Studer console saturation)

### Phase 3: Glitch/dist boundary cleanup
- Consider whether bitcrush should be available as both send and insert
- Unify or clearly separate the DSP code

## Future Extensions

- **Amp sim**: Guitar/bass amp modeling as insert FX (preamp + cabinet IR)
- **Chorus/phaser/flanger**: Classic modulation effects as insert types
- **Per-track EQ**: Parametric EQ as insert FX (currently only master bus)
- **Waveshaper**: Custom transfer curve editor for insert distortion
