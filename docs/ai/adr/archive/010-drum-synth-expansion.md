# ADR 010: Unified Drum Machine Voice

## Status: Implemented

## Context

The current drum palette has 6 separate voice classes (KickVoice, SnareVoice, ClapVoice, HatVoice, OpenHatVoice, CymbalVoice). Each is a standalone implementation with its own synthesis approach. This creates two problems:

1. **No voice variation** — users cannot change drum character (e.g., swap a 909 kick for an 808 kick) because each VoiceId maps to a single hardcoded class.
2. **Code duplication** — all drum voices share the same building blocks (sine osc, noise gen, filters, exponential envelopes) but each reimplements them independently.

ADR 063 proved that a single synth voice with factory presets (iDEATH) works well for melodic sounds. The same approach applies to drums.

## Decision

### A. Unified DrumMachine Voice

Replace all 6 drum voice classes with a single `DrumMachine` class that contains three synthesis sections. Each section can be independently mixed via level parameters:

```
[Tone]  ──┐
[Noise] ──┼──► [Output Filter] ──► [Drive] ──► [Amp Env] ──► out
[Metal] ──┘
```

#### Tone Section
Sine oscillator with pitch envelope (exponential sweep from `pitchStart` to `pitchEnd`).

| Param | Range | Used by |
|-------|-------|---------|
| `toneLevel` | 0.0-1.0 | Kick, Snare, Tom, Rimshot |
| `pitchStart` | 30-800 Hz | all tone users |
| `pitchEnd` | 30-800 Hz | all tone users |
| `pitchDecay` | 0.005-0.2 s | all tone users |

#### Noise Section
White noise through a multimode filter (LP/HP/BP selectable).

| Param | Range | Used by |
|-------|-------|---------|
| `noiseLevel` | 0.0-1.0 | Snare, Clap, Hat, Cymbal, Shaker |
| `noiseFilterFreq` | 500-12000 Hz | all noise users |
| `noiseFilterMode` | LP/HP/BP | LP for Snare, HP for Hat, BP for Cymbal |
| `noiseFilterQ` | 0.5-5.0 | varies |

#### Metal Section
6 detuned square-wave oscillators at inharmonic frequency ratios (TR-909 hat topology). Skipped entirely when `metalLevel = 0`.

| Param | Range | Used by |
|-------|-------|---------|
| `metalLevel` | 0.0-1.0 | Hat, OpenHat, Cowbell |
| `metalFreq` | 200-1200 Hz | base frequency |
| `metalRatios` | fixed | [1.0, 1.283, 1.800, 2.104, 2.587, 2.870] |

#### Shared Output

| Param | Range | Notes |
|-------|-------|-------|
| `decay` | 0.01-2.0 s | main amplitude decay |
| `drive` | 0.0-1.0 | tanh saturation amount |
| `hpFreq` | 20-8000 Hz | output highpass (removes rumble for hats) |
| `burstCount` | 1-6 | 1=normal, 4=clap-style repeated bursts |
| `burstGap` | 0.005-0.03 s | gap between bursts |
| `click` | 0.0-1.0 | transient noise click amount |

### B. Factory Presets

Each preset maps to a VoiceId in the registry. The `DrumMachine` class receives a preset name on construction (or via `setParam('preset', ...)`) and applies default parameter values.

| VoiceId | Preset | Tone | Noise | Metal | Key params |
|---------|--------|------|-------|-------|------------|
| `Kick` | 909 Kick | 340->55 Hz | - | - | drive=1.4, click=0.6 |
| `Kick808` | 808 Kick | 120->45 Hz | - | - | decay=0.8, drive=0.6 |
| `Snare` | 909 Snare | 185 Hz | LP 3kHz | - | toneLevel=0.2, noiseLevel=0.85 |
| `Clap` | 909 Clap | - | LP 1.2kHz | - | burstCount=4, burstGap=0.015 |
| `Hat` | C.HH | - | low | 6 osc | decay=0.04, hpFreq=5000 |
| `OpenHat` | O.HH | - | low | 6 osc | decay=0.18, hpFreq=4500 |
| `Cymbal` | Crash | - | BP 7.5kHz | - | decay=0.35, two-stage env |
| `Tom` | Tom | 300->120 Hz | - | - | decay=0.15 |
| `Rimshot` | Rimshot | 800 Hz | burst | - | decay=0.03, click=0.8 |
| `Cowbell` | Cowbell | - | - | 2 osc | metalFreq=587, BP filter |
| `Shaker` | Shaker | - | BP 5kHz | - | AM modulation |

### C. VoiceId & Registry Changes

New VoiceIds added to the registry:

```typescript
export type VoiceId =
  | 'Kick' | 'Kick808' | 'Snare' | 'Clap' | 'Hat' | 'OpenHat' | 'Cymbal'
  | 'Tom' | 'Rimshot' | 'Cowbell' | 'Shaker'   // new
  | 'Bass303' | 'MoogLead' | 'Analog' | 'FM'
  | 'iDEATH'
```

All drum VoiceIds map to the same `DrumMachine` factory, with different preset defaults:

```typescript
const VOICE_REGISTRY = {
  Kick:     sr => new DrumMachine(sr, 'Kick'),
  Kick808:  sr => new DrumMachine(sr, 'Kick808'),
  Snare:    sr => new DrumMachine(sr, 'Snare'),
  // ... etc
}
```

`VOICE_LIST` updates:

```typescript
{ id: 'Kick',     label: 'KICK',   category: 'drum', sidechainSource: true },
{ id: 'Kick808',  label: '808K',   category: 'drum', sidechainSource: true },
{ id: 'Snare',    label: 'SNARE',  category: 'drum' },
{ id: 'Clap',     label: 'CLAP',   category: 'drum' },
{ id: 'Hat',      label: 'C.HH',   category: 'drum' },
{ id: 'OpenHat',  label: 'O.HH',   category: 'drum' },
{ id: 'Cymbal',   label: 'CYM',    category: 'drum' },
{ id: 'Tom',      label: 'TOM',    category: 'drum' },
{ id: 'Rimshot',  label: 'RIM',    category: 'drum' },
{ id: 'Cowbell',  label: 'BELL',   category: 'drum' },
{ id: 'Shaker',   label: 'SHKR',   category: 'drum' },
```

`Kick808` gets `sidechainSource: true` (ADR 064).

### D. Parameter Exposure

All presets share the same parameter set (`paramDefs.ts` entry for `DrumMachine`). The DockPanel shows all params regardless of preset — users can tweak a kick into a tom-like sound by adjusting pitch, or add metal oscillators to a snare.

Normalized param list (all 0.0-1.0, denormalized in the voice):

| Key | Label | Group | Notes |
|-----|-------|-------|-------|
| `toneLevel` | TONE | mix | sine osc level |
| `noiseLevel` | NOIS | mix | noise level |
| `metalLevel` | METL | mix | metallic osc level |
| `pitchStart` | PSTRT | tone | sweep start freq |
| `pitchEnd` | PEND | tone | sweep end freq |
| `pitchDecay` | PDCY | tone | pitch env speed |
| `noiseFilterFreq` | FREQ | noise | filter cutoff |
| `noiseFilterQ` | Q | noise | filter resonance |
| `decay` | DCY | amp | main decay time |
| `drive` | DRIV | amp | saturation |
| `hpFreq` | HP | amp | output highpass |
| `click` | CLCK | amp | transient amount |
| `burstCount` | BRST | amp | 1=normal, 4=clap |
| `burstGap` | GAP | amp | burst spacing |

### E. Migration

Existing patterns reference VoiceIds (`Kick`, `Snare`, etc.) which remain unchanged. The factory now returns `DrumMachine` instances instead of individual classes, but the interface is identical. **Zero migration needed.**

Old voice classes (`KickVoice`, `SnareVoice`, etc.) are deleted after the unified voice is verified.

## Consequences

- **Positive:** Single codebase for all drum sounds (~200 lines vs ~350 lines across 6 classes)
- **Positive:** 5 new percussion types (808 Kick, Tom, Rimshot, Cowbell, Shaker) as presets, not new code
- **Positive:** Users can morph between drum types by tweaking parameters (e.g., turn a kick into a tom)
- **Positive:** Consistent parameter interface — all drums use the same param keys
- **Positive:** `Kick808` inherits `sidechainSource: true` automatically (ADR 064)
- **Negative:** Slightly more CPU per voice due to section-level branching — mitigated by skipping sections when level=0
- **Negative:** More params exposed than relevant for each preset (e.g., Hat shows `pitchStart` even though it's unused) — acceptable trade-off for flexibility
- **Risk:** Unified voice may not perfectly match the tuned sound of existing separate voices — mitigate by A/B testing presets against current output before removing old classes

## Implementation

### Phase 1: DrumMachine class + Kick/Snare/Clap presets
1. Implement `DrumMachine` with tone, noise, and output sections
2. Create `Kick`, `Kick808`, `Snare`, `Clap` presets
3. A/B test against existing voices
4. Wire into registry, add `paramDefs`

### Phase 2: Metal section + remaining presets
5. Add metal oscillator bank
6. Create `Hat`, `OpenHat`, `Cymbal`, `Tom`, `Rimshot`, `Cowbell`, `Shaker` presets
7. Remove old voice classes
