# ADR 111: FM Drum Voice

## Status: Implemented

## Context

The existing drum voices (ADR 010, `DrumMachine` class) use subtractive synthesis: sine tone + noise + metallic oscillators. This produces good analog-style sounds but lacks the harmonic richness and timbral range of FM synthesis.

Elektron Model:Cycles demonstrates that a single FM engine with different "machine" algorithms can cover kicks, snares, hi-hats, percussion, tonal, and chord sounds — all from pure synthesis with no samples. This approach fits inboil's zero-dependency philosophy and adds a distinct sonic character alongside the existing analog drum voices.

### Current drum architecture

- `DrumMachine` (drums.ts): unified class with 11 presets, 16 shared params
- Tone section: sine osc + exponential pitch sweep (`pitchStart → pitchEnd` over `pitchDecay`)
- Noise section: white noise through LP/HP/BP filter
- Metal section: 6 detuned square-wave oscillators (TR-909 topology)
- Amp: simple exponential decay, no ADSR

### Current FM architecture

- `FMCore` (melodic.ts): 4-operator FM with 8 algorithms, per-op ADSR, LFO
- Designed for melodic/sustained notes — too many params for drums, no pitch envelope
- `FMVoice` wraps 12 cores for poly modes (POLY12, WIDE6, UNISON)

## Decision

### A. New VoiceId: `'FMDrum'`

A single voice class `FMDrumVoice` with a `machine` parameter (0–5) that selects the internal FM algorithm. Each machine is optimized for a different percussion family.

```
category: 'drum'
label: 'FMD'
fullName: 'FM Drum'
```

### B. Machine types

| # | Name | Algorithm | Character |
|---|------|-----------|-----------|
| 0 | KICK | 2-op, carrier pitch sweep + mod env | Deep FM kick, sub-bass thump |
| 1 | SNARE | 2-op + noise, carrier+mod short decay | Snappy FM snare, noise body |
| 2 | METAL | 3-op, inharmonic ratios, ring-mod | Hats, bells, metallic textures |
| 3 | PERC | 2-op, fast pitch env, short decay | Toms, rimshots, wood blocks |
| 4 | TONE | 2-op, sustained carrier, vibrato | Pitched FM tone (bass to lead) |
| 5 | CHORD | 2-op × 3 stacked, maj/min/7th | FM chord stabs |

### C. DSP architecture

```typescript
// src/lib/audio/dsp/fm-drum.ts

class FMDrumOp {
  phase = 0
  ratio = 1.0
  level = 1.0
  feedback = 0.0         // self-modulation (carrier only)
  env: ExpDecay | ADSR   // fast exponential for drums, ADSR for TONE machine

  tick(freq: number, sr: number, modIn: number): number {
    const fb = this.feedback > 0 ? this.prevOut * this.feedback : 0
    const out = Math.sin(this.phase * TAU + modIn + fb) * this.env.tick() * this.level
    this.phase += (freq * this.ratio) / sr
    return out
  }
}

class FMDrumVoice implements Voice {
  private machine = 0        // 0–5
  private ops: FMDrumOp[]    // 2–3 operators depending on machine
  private noiseGen: NoiseGen  // for SNARE machine
  private pitchEnv: ExpDecay  // pitch sweep envelope
  private ampEnv: ExpDecay    // master amplitude envelope

  // Shared params (normalized 0–1, denormalized in paramDefs)
  // machine:  0–5 discrete
  // color:    mod ratio (maps to machine-specific harmonics)
  // shape:    mod index / depth
  // sweep:    pitch envelope depth (semitones)
  // contour:  pitch envelope time
  // punch:    attack transient / click
  // decay:    amplitude decay time
  // drive:    soft clipping amount
  // tone:     post-filter cutoff (LP)
}
```

### D. Parameter design

Model:Cycles uses simplified, performance-friendly param names. Same approach here — 8 core params that map to different internals per machine:

| Param | Label | Range | Meaning |
|-------|-------|-------|---------|
| machine | MACH | 0–5 discrete | Algorithm selector |
| color | COLR | 0.0–1.0 | Modulator ratio (timbral brightness) |
| shape | SHPE | 0.0–1.0 | FM depth / mod index |
| sweep | SWEP | 0.0–1.0 | Pitch envelope depth |
| contour | CNTR | 0.0–1.0 | Pitch envelope time |
| punch | PNCH | 0.0–1.0 | Attack transient |
| decay | DCY | 0.0–1.0 | Amplitude decay time |
| tone | TONE | 0.0–1.0 | Output filter cutoff |

Machine-specific mapping examples:
- **KICK**: `color` = sub-harmonic ratio, `shape` = mod depth for "body", `sweep` = pitch drop range
- **METAL**: `color` = inharmonic ratio spread, `shape` = cross-mod depth, `sweep` = env speed
- **CHORD**: `color` = chord type (maj/min/7th/dim), `shape` = voicing spread

### E. Factory presets

Define `FM_DRUM_PRESETS` in constants.ts — approximately 6–8 presets per machine type (36–48 total):

```typescript
export const FM_DRUM_PRESETS: Record<string, Record<string, number>> = {
  'FM Kick 1':    { machine: 0, color: 0.3, shape: 0.6, sweep: 0.7, contour: 0.3, punch: 0.8, decay: 0.5, tone: 0.4 },
  'FM Kick Deep': { machine: 0, color: 0.1, shape: 0.8, sweep: 0.9, contour: 0.2, punch: 0.5, decay: 0.7, tone: 0.2 },
  'FM Snare 1':   { machine: 1, color: 0.5, shape: 0.4, sweep: 0.3, contour: 0.5, punch: 0.6, decay: 0.4, tone: 0.6 },
  // ...
}
```

These are browsable via the existing preset system (ADR 015). The `machine` param changes when loading a preset, switching the internal algorithm.

### F. Integration points

| File | Change |
|------|--------|
| `src/lib/audio/dsp/fm-drum.ts` | New file: `FMDrumVoice` class |
| `src/lib/audio/dsp/voices.ts` | Add `FMDrum` to `VOICE_LIST` (category: drum) and `VOICE_REGISTRY` |
| `src/lib/paramDefs.ts` | Add `FMDrum` param definitions (8 params) |
| `src/lib/constants.ts` | Add `FM_DRUM_PRESETS` |
| `src/lib/audio/dsp/filters.ts` | Add `ExpDecay` helper if needed (or inline in fm-drum.ts) |

No changes to worklet, engine, UI, or storage — the voice system is fully pluggable.

### G. Implementation phases

**Phase 1: Core DSP + KICK/SNARE machines**
- `FMDrumVoice` class with 2-op FM engine
- Pitch envelope (exponential sweep)
- Machine 0 (KICK) and 1 (SNARE) with noise
- 8 params registered in paramDefs
- Voice registered in VOICE_LIST/REGISTRY

**Phase 2: METAL/PERC machines + presets**
- Machine 2 (METAL): 3-op with inharmonic ratios
- Machine 3 (PERC): fast envelopes, wide pitch range
- Factory presets for all 4 machines
- Unit tests for DSP output

**Phase 3: TONE/CHORD machines**
- Machine 4 (TONE): sustained notes, ADSR instead of decay
- Machine 5 (CHORD): multi-voice stacking
- Full preset library

## Considerations

- **CPU**: FM is cheap — 2–3 sin() calls per sample per voice. Much lighter than the existing WT synth. No poly modes needed (drums are mono), so single-instance only.
- **Param count**: 8 params is intentionally minimal vs DrumMachine's 16 or FM's 30+. The "machine" selector does the heavy lifting. Users tweak a few knobs, not program from scratch.
- **Existing drums stay**: FMDrum is additive, not a replacement. Analog drums and FM drums coexist in the drum category — users pick based on taste.
- **No poly**: FMDrum is always mono (one voice). Drum hits don't need sustain overlap. This keeps it simple and CPU-light.

## Future Extensions

- LFO modulation destinations (color, shape, sweep for evolving textures)
- Per-machine sub-algorithms (e.g. KICK with 2-op vs 3-op variations)
- P-Lock on machine param for per-step machine switching (instant timbral variation)
- Sidechain detection for KICK machine (auto-duck other tracks)
