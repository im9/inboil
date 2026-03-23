# ADR 120: Reverb Flavour Engines

## Status: Proposed

## Context

Reverb flavours (Room / Hall / Shimmer, ADR 075/076) currently share a single `SimpleReverb` (Freeverb) engine with different `setSize`/`setDamp` parameter ranges. This produces barely audible differences between flavours — users cannot distinguish Room from Hall, and Shimmer lacks the characteristic octave-up shimmer sound.

The root cause: Freeverb's 4 comb + 2 allpass structure produces the same tonal character regardless of parameters. Real-world reverb types (room, hall, plate, shimmer) differ not in parameter tuning but in **algorithm structure** — the topology of reflections, diffusion patterns, and feedback paths.

### Current architecture

```
reverbIn → [SimpleReverb: 4 comb + 2 allpass] → rev[L,R]
              ↑ setSize(s)  setDamp(d)
              └─ only knobs: size range + damp range differ per flavour
```

- `engine.ts:411–434` maps flavour → size/damp ranges
- `worklet-processor.ts:997–1012` runs shimmer feedback loop (OctaveShifter)
- `effects.ts:41–66` SimpleReverb class
- Shimmer's OctaveShifter was rewritten (variable-delay pitch shift) but the feedback gain must stay very low (×1.2) to avoid self-oscillation, making the effect barely audible

### What users hear

- Room and Hall sound almost identical (same Freeverb, slightly different feedback/damp)
- Shimmer = Hall with faint high-pitched artifacts
- Switching flavours feels pointless

## Decision

### Per-flavour front-end processing + shared diffuse tail

Each flavour gets **distinct front-end processing** before feeding into the shared Freeverb backend. The character comes from the front-end; the Freeverb provides the diffuse tail.

```
            ┌─ Room:    EarlyReflections → Freeverb (short, damped)
reverbIn ──┤─ Hall:    PreDelay → ModulatedFreeverb (long, bright, chorused)
            └─ Shimmer: Freeverb (large) → OctaveShifter → feedback loop
```

### 1. Room: Early Reflections

Room character comes from discrete early reflections — audible echoes of the walls before the diffuse tail builds up.

```typescript
class EarlyReflections {
  // 6 taps at prime-number delays (3–35ms), alternating L/R
  // Each tap has gain rolloff (inverse square) and LP filter (wall absorption)
  private taps: Array<{ delay: number; gain: number; pan: number; lp: number }>
  private buf: Float32Array  // shared delay line (~40ms max)

  process(x: number): [number, number]  // returns L, R
}
```

Signal flow:
```
reverbIn → EarlyReflections → [L,R] mixed into Freeverb input + direct to output
```

- **X pad**: room size (scales tap delays — small room = tight reflections, large = wider spacing)
- **Y pad**: damping (controls LP cutoff on taps — bright walls vs absorptive)
- Tap delays: 3ms, 7ms, 11ms, 17ms, 23ms, 31ms (prime numbers to avoid resonance)
- Each tap panned alternately L/R for width
- Freeverb runs with short tail (size 0.3–0.6) and moderate damp

### 2. Hall: Pre-delay + Modulated Comb Filters

Hall character comes from a long pre-delay (sound travels far before first reflection) and chorused/modulated reverb tail.

```typescript
class PreDelay {
  // Simple delay line, 0–80ms configurable
  process(x: number): number
}

class ModulatedCombFilter extends CombFilter {
  // Existing CombFilter with LFO-modulated delay time (±2 samples at ~1Hz)
  // Creates chorus-like movement in the tail — signature of large spaces
  private lfoPhase: number
  private lfoInc: number
  private modDepth: number  // ±samples
}
```

Signal flow:
```
reverbIn → PreDelay(20–60ms) → ModulatedFreeverb (large size, low damp) → output
```

- **X pad**: size (pre-delay 20–60ms + Freeverb size 0.85–0.99)
- **Y pad**: modulation depth / brightness (LFO depth + damp)
- The modulated comb filters create a lush, evolving tail distinct from Room's static combs
- Freeverb runs with long tail, very low damp (bright, open)

### 3. Shimmer: Improved OctaveShifter Feedback

Keep the current architecture (Freeverb → OctaveShifter → feedback) but with better gain staging.

The current OctaveShifter (variable-delay pitch shift) correctly produces octave-up output. The problem is gain: reverb internal gain (0.015) means the shifter receives a tiny signal, and the feedback multiplier must stay low (×1.2) to avoid self-oscillation.

Fix: **normalize reverb output before feeding to shifter**, and use a proper feedback coefficient:

```typescript
// In worklet process loop (Faust/Valhalla-style gain staging):
// 1. Pitch-shift the reverb tail (no artificial boost — use natural level)
let shimShifted = octShifter.process(shimmerPrev)
// 2. DC blocker (80Hz HPF) — critical to prevent DC buildup in feedback
shimDcOut = shimShifted - shimDcPrev + shimDcCoeff * shimDcOut
shimDcPrev = shimShifted
shimShifted = shimDcOut
// 3. Feed back at controlled level (Faust reference: max 0.35)
shimReverbIn += shimShifted * shimmerAmount * 0.35
// ... run reverb ...
// 4. Capture reverb stereo sum for next frame's pitch shift input
shimmerPrev = rev[0] + rev[1]
// 5. Blend shifted octave directly for audibility
rev[0] += shimShifted * shimmerAmount * 0.5
rev[1] += shimShifted * shimmerAmount * 0.5
```

- **X pad**: reverb size (0.8–0.99)
- **Y pad**: shimmer amount (shifted signal blend + feedback)
- The normalization step (`/ 0.03`) ensures the shifter gets usable signal regardless of reverb gain
- `tanh` prevents clipping; feedback coefficient stays well below unity

### 4. Worklet Integration

The worklet needs to know which flavour is active to route through the correct front-end:

```typescript
// worklet-processor.ts additions
private earlyRef = new EarlyReflections(sampleRate)
private preDelay = new PreDelay(sampleRate)
private reverbFlavour: 'room' | 'hall' | 'shimmer' = 'room'

// In setPattern handler:
this.reverbFlavour = p.fx.reverbFlavour ?? 'room'

// In process loop:
if (this.reverbFlavour === 'room') {
  const er = this.earlyRef.process(reverbIn)
  const rev = this.reverb.process(reverbIn * 0.7)  // reduced direct, ER carries weight
  mixL += er[0] * 0.5 + rev[0]
  mixR += er[1] * 0.5 + rev[1]
} else if (this.reverbFlavour === 'hall') {
  const delayed = this.preDelay.process(reverbIn)
  const rev = this.reverb.process(delayed)  // modulated combs
  // rev already has chorus from modulated comb filters
} else {
  // shimmer path (existing)
}
```

### 5. ModulatedCombFilter

Extend the existing `CombFilter` to support LFO-modulated read position:

```typescript
class ModulatedCombFilter {
  private buf: Float32Array
  private ptr = 0
  private filt = 0
  private fb: number
  private damp: number
  private lfoPhase = 0
  private lfoInc: number   // ~0.8–1.5 Hz
  private modDepth: number  // ±2–4 samples

  process(x: number): number {
    // Read with fractional delay (base delay ± LFO offset)
    const lfo = Math.sin(6.283185 * this.lfoPhase) * this.modDepth
    this.lfoPhase += this.lfoInc
    if (this.lfoPhase >= 1) this.lfoPhase -= 1

    const readPos = (this.ptr - this.buf.length + lfo + this.buf.length * 2) % this.buf.length
    // Linear interpolation for fractional read
    const i0 = readPos | 0
    const frac = readPos - i0
    const y = this.buf[i0] + (this.buf[(i0 + 1) % this.buf.length] - this.buf[i0]) * frac

    this.filt = y * (1 - this.damp) + this.filt * this.damp
    this.buf[this.ptr] = x + this.filt * this.fb + DENORMAL_DC
    if (++this.ptr >= this.buf.length) this.ptr = 0
    return y
  }
}
```

Each of Hall's 4 comb filters gets a slightly different LFO rate (0.8, 1.1, 1.3, 1.6 Hz) and phase offset to avoid correlation — this creates the lush, evolving quality.

### 6. Engine Parameter Mapping

```typescript
// engine.ts — reverb flavour params
if (flavour === 'room') {
  reverbSize = 0.3 + pad.x * 0.3       // 0.3–0.6 (short tail)
  reverbDamp = 0.3 + (1 - pad.y) * 0.5 // 0.3–0.8 (warm)
  earlySize = pad.x                      // scales tap delays
  earlyDamp = 1 - pad.y                  // LP cutoff on taps
} else if (flavour === 'hall') {
  reverbSize = 0.85 + pad.x * 0.14     // 0.85–0.99 (long tail)
  reverbDamp = (1 - pad.y) * 0.15      // 0–0.15 (bright)
  preDelayMs = 20 + pad.x * 40         // 20–60ms
  modDepth = pad.y * 4                  // 0–4 samples LFO depth
} else { // shimmer
  reverbSize = 0.8 + pad.x * 0.19
  shimmerAmount = pad.y * 0.6
}
```

### 7. WorkletPattern Extension

```typescript
// dsp/types.ts — add to fx object
reverbFlavour: 'room' | 'hall' | 'shimmer'
earlyReflections?: { size: number; damp: number }
preDelay?: { ms: number }
modDepth?: number
```

## Considerations

- **CPU budget**: EarlyReflections is cheap (6 buffer reads per sample). ModulatedCombFilter adds one `sin()` + one interpolated read per comb — negligible vs existing 8 combs. PreDelay is trivial. Total overhead: ~5% increase on reverb processing.
- **Memory**: EarlyReflections needs ~40ms buffer (~1764 samples). PreDelay needs ~80ms (~3528). ModulatedCombFilter uses the same buffers as CombFilter. Total: ~5KB additional.
- **Backwards compatibility**: Existing songs store `FxFlavours.verb` as `'room' | 'hall' | 'shimmer'`. No migration needed — new processing is additive.
- **LiteReverb (per-track inserts)**: Not affected. Only the main send bus reverb gets flavour processing.
- **Hall modulation vs chorus**: The LFO modulation on comb filters is subtle (±2–4 samples at ~1Hz). It creates a slowly evolving quality, not an audible chorus effect. Similar to Lexicon 480L's internal modulation.
- **Shimmer gain staging**: ShimmerReverb (Faust port) handles gain staging internally. DC blocker at 80Hz prevents buildup. Feedback max 0.35 (Faust reference).

## Implementation (completed)

### Freeverb upgrade
- SimpleReverb and ModulatedReverb upgraded from 4 comb + 2 allpass to **8 comb + 4 allpass** (classic Freeverb spec)
- Eliminates metallic resonance from sparse comb topology

### Room: Early Reflections
- `EarlyReflections` class: 6 prime-delay taps with gain/pan/LP, slew-smoothed delays
- Worklet routing: ER × 1.6 + Freeverb × 0.3 (ER dominates, Freeverb is diffuse wash)
- Engine: X = room size (scales ER delays + Freeverb 0.2–0.45), Y = brightness (damp + ER LP)

### Hall: Pre-delay + Modulated Combs
- `PreDelay` class: 0–80ms delay line
- `ModulatedReverb`: 8 modulated comb filters with per-comb LFO (0.8–1.6 Hz, phase-spread)
- Engine: X = size (0.85–0.99) + pre-delay (10–80ms), Y = mod depth (1–8 samples) + brightness

### Shimmer: Faust/Valhalla-style allpass network
- `ShimmerReverb` class: ported from thedrgreenthumb/faust shimmer.dsp
- Cross-coupled stereo allpass network with integrated pitch shifter in feedback loop
- 80Hz DC blocker, feedback max 0.35, modulated fractional delays (0.7–1.5 Hz LFO)
- Not based on Freeverb — completely separate allpass topology
- Size parameter slew-smoothed to prevent clicks on XY pad changes

### Crossfade on flavour switch
- 50ms equal-power crossfade (cos curve) between old and new engines
- Both engines process in parallel during crossfade, using separate output buffers

### Hold (Strymon BigSky style)
- `setFreeze(true)` on all reverb engines: feedback → 1.0, damp → 0
- Input gated during hold (new audio doesn't enter reverb)
- Room: Freeverb output boosted ×3 during hold (ER has no memory to hold)
- UI: HOLD button in DockPanel VERB knob row, `perf.reverbHold` toggle
- Terminology: "Hold" not "Freeze" — freeze is for granular buffer capture (different concept)

## Future Extensions

- **Plate reverb**: Dense allpass chain with metallic character — a 4th flavour
- **Convolution reverb**: IR-based reverb for realistic spaces (high CPU, optional)
- **Per-flavour presets**: Save/load specific reverb tunings per flavour
