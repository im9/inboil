# ADR 063: iDEATH Synth Engine — Rename, Unison & Wobble Bass

## Status: Proposed

## Context

The current `InboilSynth` (ADR 011) is a 2-oscillator wavetable synth with SVF filter, dual ADSR, 2x LFO, and 8-slot modulation matrix. It already covers lead, pad, and basic bass sounds. However, it lacks features essential for Massive-style fat wobble bass:

1. **Unison** — multiple detuned copies of each oscillator with stereo spread (the core of "fat" sound)
2. **Tempo-synced LFO** — wobble locked to BPM (1/1, 1/2, 1/4, 1/8, 1/16, 1/32, dotted, triplet)
3. **Filter drive / saturation** — grit and aggression before or after the filter
4. **More aggressive wavetables** — SuperSaw, Screamer, PWM sweep

Additionally, the name "InboilSynth" is generic. Since this is the central synth engine and will continue to be extended, it deserves a proper identity.

### Naming

The app name "inboil" comes from the character **inBOIL** in Richard Brautigan's _In Watermelon Sugar_. The central commune in that novel is called **iDEATH** — the place where everything is created and life revolves around. Naming the core synth engine **iDEATH** reflects its role as the creative center of the app's sound design.

## Decision

### A. Rename

| Before | After | Notes |
|--------|-------|-------|
| `InboilSynthCore` class | `IdeathCore` | Internal engine core |
| `InboilSynth` class | `IdeathSynth` | Mono voice wrapper |
| `PolySynth` class | `IdeathPoly` | Polyphonic wrapper (unchanged architecture) |
| VoiceId `'Synth'` | `'iDEATH'` | Picker label: `iDEATH` |
| VoiceId `'Poly'` | `'iDEATH_Poly'` | Picker label: `iPOLY` |
| VOICE_LIST category | `'lead'` (unchanged) | Presets provide bass/lead/pad categorization |

All references in `paramDefs.ts`, `factory.ts`, `presets.ts`, `state.svelte.ts`, `worklet-processor.ts`, `engine.ts`, and UI components must be updated.

### B. Unison Engine

Add configurable unison to `IdeathCore`:

```
┌─────────────────────────────────────────────┐
│  IdeathCore (per mono voice)                │
│                                             │
│  ┌─ Unison Layer (1–7 voices) ────────────┐ │
│  │  voice 0: center (no detune)           │ │
│  │  voice 1: +detune, pan right           │ │
│  │  voice 2: -detune, pan left            │ │
│  │  voice 3: +detune*2, pan right         │ │
│  │  ...                                   │ │
│  │  Each voice: oscA + oscB (existing)    │ │
│  └────────────────────────────────────────┘ │
│              │                              │
│       ┌──────▼──────┐                       │
│       │   FILTER    │  (shared, post-mix)   │
│       └──────┬──────┘                       │
│       ┌──────▼──────┐                       │
│       │   DRIVE     │  tanh saturation      │
│       └──────┬──────┘                       │
│       ┌──────▼──────┐                       │
│       │    AMP      │  Env1 (ADSR)          │
│       └─────────────┘                       │
└─────────────────────────────────────────────┘
```

**Parameters:**

| Key | Label | Range | Default | Notes |
|-----|-------|-------|---------|-------|
| `unisonVoices` | `UNI` | 1–7 (step 2, odd only) | 1 | Number of unison voices |
| `unisonSpread` | `SPRD` | 0.0–1.0 | 0.3 | Detune spread amount (cents) |
| `unisonWidth` | `WIDE` | 0.0–1.0 | 0.8 | Stereo pan spread |
| `drive` | `DRIV` | 0.0–1.0 | 0.0 | Post-filter saturation (0=clean) |

**Implementation notes:**
- Odd voice counts only (1, 3, 5, 7) — center voice always exists, pairs spread symmetrically
- Detune: `freq * (1 + voiceIdx * spread * 0.01)` — max ~50 cents per pair
- Pan spread: linear distribution from -width to +width
- `tick()` returns stereo `[L, R]` when unison > 1 — requires worklet mono→stereo path update
- CPU budget: 7 unison × 2 osc = 14 oscillators per mono voice. Profile carefully; default to 1 (no unison)

### C. Tempo-Synced LFO

Extend existing `LFO` class with sync mode:

```typescript
// New LFO rate modes
type LFOSyncDiv = '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32'
                | '1/4T' | '1/8T' | '1/16T'    // triplet
                | '1/4D' | '1/8D' | '1/16D'    // dotted
```

**Parameters:**

| Key | Label | Range | Default | Notes |
|-----|-------|-------|---------|-------|
| `lfo1Sync` | `L1SY` | 0–1 (step 1) | 0 | 0=free, 1=tempo-synced |
| `lfo1Div` | `L1DV` | 0–11 (step 1) | 2 | Sync division index (1/4 default) |

**BPM delivery:** Worklet already receives BPM for delay sync. LFO converts division to Hz: `rate = bpm / 60 * divisor` (e.g., 1/4 note at 120 BPM = 2 Hz).

**Wobble effect:** LFO1 → Cutoff modulation (already in mod matrix). Tempo sync ensures wobble locks to the beat.

### D. Filter Drive

Simple `tanh` saturation stage after the SVF filter:

```typescript
// In tick(), after filter.process():
if (this.drive > 0) {
  const amt = 1 + this.drive * 4  // 1x–5x gain into tanh
  sig = Math.tanh(sig * amt) / Math.tanh(amt)  // normalized tanh
}
```

Placed post-filter so the filter resonance feeds into the saturation naturally.

### E. Wobble Bass Presets

Add to `presets.ts` in the `'bass'` category:

| Preset | Character | Key Settings |
|--------|-----------|-------------|
| Wobble Bass | Classic dubstep wobble | LFO1→Cutoff, tempo sync 1/4, unison 3, saw, drive 0.4 |
| Filthy Bass | Aggressive reese | Unison 5, high spread, ring mod, heavy drive |
| Sub Wobble | Deep sub with movement | LFO1→Cutoff slow, sine osc, unison 1, low cutoff |
| Growl Bass | Mid-range growl | FM combine, LFO1→FMIndex, tempo sync 1/8, drive 0.6 |

### F. Stereo Output Path

Current worklet processes mono voices (`tick() → number`). Unison with stereo spread requires:

1. Add `tickStereo(): [number, number]` to `IdeathCore` (returns L/R)
2. When `unisonVoices === 1`, `tickStereo()` returns `[mono, mono]` (no overhead)
3. Worklet mixes stereo output into existing L/R buffers
4. Other voices remain mono — only iDEATH/iPOLY use stereo path

## Implementation Order

1. **Rename** — InboilSynth → iDEATH (class names, VoiceId, labels, all references)
2. **Tempo-synced LFO** — sync mode + division selector, BPM delivery
3. **Filter drive** — tanh saturation with drive param
4. **Wobble bass presets** — new presets in bass category, verify sound
5. **Unison engine** — multi-voice detune + stereo spread (most complex)
6. **Stereo worklet path** — tickStereo() for iDEATH voices

Steps 1–4 are low-risk and deliver the wobble bass sound quickly. Steps 5–6 add the "fat" quality and can be profiled for CPU impact.

## Consequences

- **Positive:** Distinctive engine identity (iDEATH) rooted in the app's literary origin
- **Positive:** Wobble bass — the #1 missing bass sound — becomes a preset away
- **Positive:** Unison transforms thin patches into massive walls of sound
- **Positive:** Tempo-synced LFO is useful far beyond wobble (tremolo, filter patterns, rhythmic FX)
- **Positive:** Drive adds character without needing external effects
- **Negative:** Unison multiplies oscillator count (7 voices × 2 osc = 14 osc per note) — CPU concern
- **Negative:** Stereo output path adds complexity to worklet for one voice type
- **Risk:** 7-voice unison + PolySynth (4 notes) = 56 oscillators — likely too heavy, may need to cap unison in poly mode
- **Mitigation:** Default unison to 1 (off). Poly mode caps unison at 3. Profile before shipping higher counts.
- **Dependency:** Existing mod matrix (LFO → Cutoff) handles wobble routing — no new infrastructure needed
