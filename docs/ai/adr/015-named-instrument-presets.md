# ADR 015: Named Instruments — Drum Kits & Synth Presets

## Status: PROPOSED

## Context

Currently synth voices are identified by technical type names (`DrumSynth`, `AnalogSynth`, `FMSynth`, `NoiseSynth`). These lack personality and don't help users identify sounds. We want to give instruments memorable names — but drums and melodic synths need different treatment.

### Current Architecture

- **6 drum tracks** (0–5): each is an independent track with its own voice instance (Kick, Snare, Clap, Hat, OpenHat, Cymbal)
- **2 melodic tracks** (6–7): Bass (TB303Voice), Lead (MoogVoice)
- `voiceKey()` in `paramDefs.ts` maps track index → voice type
- Each voice type has different parameters (Kick: pitchStart/pitchEnd, Snare: toneDecay/noiseDecay, etc.)

### Key Insight

Drums should be named **as a kit** (a collection of sounds), not as individual instruments. A "de Steil" drum kit contains kick, snare, clap, hat, open hat, cymbal — all designed to work together. This mirrors hardware drum machines (TR-808, TR-909 are kits, not individual sounds). Melodic synths are named individually since they're independent instruments.

## Proposed Design

### A. Drum Kits

A kit is a **named preset bundle** for tracks 0–5. The underlying 6-track architecture stays unchanged — a kit is purely a metadata/preset layer.

```typescript
interface DrumKitSlot {
  voiceKey: string                   // 'Kick', 'Snare', 'Clap', 'Hat', 'OpenHat', 'Cymbal'
  name: string                      // slot display name: 'KICK', 'RIM', 'CLAP'
  synthType: SynthType              // engine: 'DrumSynth' | 'NoiseSynth'
  params: Record<string, number>    // voice param defaults
  pan: number                       // default pan position
}

interface DrumKit {
  id: string        // 'de-steil', 'kapow-808', 'tin-roof'
  name: string      // 'de Steil', 'Kapow 808', 'Tin Roof'
  slots: DrumKitSlot[]  // exactly 6 slots (tracks 0–5)
}
```

#### Built-in Kits

| Kit Name | Character | Kick | Snare | Perc | HH Style |
|----------|-----------|------|-------|------|-----------|
| **de Steil** | Geometric, clean (default) | Tight analog | Crisp snap | Short clap | Metallic |
| **Kapow** | Hard-hitting 808 | Deep sub | Trap snare | Big clap | Sharp hats |
| **Tin Roof** | Lo-fi, dusty | Soft thud | Brushy | Finger snap | Muted hats |
| **Neon** | Bright, distorted | Punchy click | Noise blast | Zap | Fizzy hats |

Each kit defines voice params for all 6 slots. Example:

```typescript
const DRUM_KITS: DrumKit[] = [
  {
    id: 'de-steil', name: 'de Steil',
    slots: [
      { voiceKey: 'Kick',    name: 'KICK',  synthType: 'DrumSynth',  pan: 0.00,
        params: { pitchStart: 340, pitchEnd: 55, pitchDecay: 0.035, ampDecay: 0.35, drive: 1.4 } },
      { voiceKey: 'Snare',   name: 'SNARE', synthType: 'DrumSynth',  pan: -0.10,
        params: { toneDecay: 0.08, noiseDecay: 0.07, toneAmt: 0.20, noiseAmt: 0.85, noiseFc: 3000 } },
      { voiceKey: 'Clap',    name: 'CLAP',  synthType: 'DrumSynth',  pan: 0.15,
        params: { decay: 0.18, filterFc: 1200, burstGap: 0.015 } },
      { voiceKey: 'Hat',     name: 'C.HH',  synthType: 'NoiseSynth', pan: -0.30,
        params: { decay: 0.04, baseFreq: 800, hpCutoff: 5000, volume: 0.65 } },
      { voiceKey: 'OpenHat', name: 'O.HH',  synthType: 'NoiseSynth', pan: 0.35,
        params: { decay: 0.18, baseFreq: 800, hpCutoff: 4500, volume: 0.60 } },
      { voiceKey: 'Cymbal',  name: 'CYM',   synthType: 'NoiseSynth', pan: 0.25,
        params: { decay: 0.35, baseFreq: 500, hpCutoff: 2500, volume: 0.55 } },
    ]
  },
  // ... more kits
]
```

#### Kit Selection Flow

1. User selects a kit (e.g., "Kapow") from a picker
2. `applyDrumKit(kitId)` iterates tracks 0–5:
   - Sets `voiceParams` to kit slot defaults
   - Sets slot name, pan, synthType
   - Preserves existing trig patterns (step data untouched)
3. User can still tweak individual params per track after loading

```typescript
export function applyDrumKit(kitId: string) {
  const kit = DRUM_KITS.find(k => k.id === kitId)
  if (!kit) return
  for (let i = 0; i < 6; i++) {
    const slot = kit.slots[i]
    const track = pattern.tracks[i]
    track.name = slot.name
    track.synthType = slot.synthType
    track.pan = slot.pan
    track.voiceParams = { ...slot.params }
    // trigs are preserved — only sound character changes
  }
  pattern.drumKit = kitId  // track which kit is loaded
}
```

#### Slot Customization within Kit

Individual slots can be swapped (e.g., replace the snare with a rimshot) without changing the whole kit. This uses ADR 009's voice registry:

```typescript
export function setDrumSlot(trackIdx: number, voiceKey: string) {
  // Swap one slot's voice type while keeping the rest of the kit
  const track = pattern.tracks[trackIdx]
  track.voiceParams = defaultVoiceParams(trackIdx, track.synthType)
  // voiceKey change triggers worklet to create new voice instance
}
```

### B. Named Melodic Synths

Melodic synths are individually named since each track is independent:

| ID | Name | Engine | voiceKey | Character |
|----|------|--------|----------|-----------|
| `pauline` | **Pauline** | AnalogSynth | Bass303 | Warm acid bass, resonant filter |
| `melon-sugar` | **MelonSugar** | AnalogSynth | MoogLead | Sweet, thick lead |
| `voss` | **Voss** | AnalogSynth | Analog | Clean subtractive |
| `akari` | **Akari** | FMSynth | FM | Bright bell/pluck |

```typescript
interface SynthPreset {
  id: string
  name: string          // display name for UI
  engine: SynthType
  voiceKey: string
  category: 'bass' | 'lead' | 'pad' | 'fx'
  params: Record<string, number>
}

const SYNTH_PRESETS: SynthPreset[] = [
  { id: 'pauline',     name: 'Pauline',    engine: 'AnalogSynth', voiceKey: 'Bass303',  category: 'bass',
    params: { cutoffBase: 200, envMod: 4000, resonance: 7.0, decay: 0.18, drive: 1.6 } },
  { id: 'melon-sugar', name: 'MelonSugar', engine: 'AnalogSynth', voiceKey: 'MoogLead', category: 'lead',
    params: { cutoffBase: 400, envMod: 5500, resonance: 1.8, decay: 0.35 } },
  // ...
]
```

### C. Pattern State Extension

```typescript
interface Pattern {
  // existing fields...
  drumKit: string       // kit ID: 'de-steil'
}
```

Factory patterns can specify which kit to use:

```typescript
type FactoryDef = {
  // existing fields...
  kit?: string          // drum kit ID (default: 'de-steil')
  bassPreset?: string   // bass synth preset ID
  leadPreset?: string   // lead synth preset ID
}
```

### D. UI

- **Kit selector**: In ParamPanel or track-nav area, show current kit name (e.g., "de Steil"). Tap to cycle or open picker.
- **Track label**: Drum tracks show slot name (KICK, SNARE), not kit name. Kit name shown in a header/badge above the drum group.
- **Melodic tracks**: Show synth preset name (Pauline, MelonSugar) as track subtitle.
- **Mobile**: Kit name in track-nav header when a drum track is selected.

### Naming Principles

- Short (≤10 chars, fit SplitFlap)
- Evocative of sound character without being literal
- No trademarked names (no "Moog", "Roland", "808")
- Diverse cultural references

## Implementation Complexity

**Low complexity.** Kit is a metadata/preset layer:
- No changes to DSP, worklet, or AudioWorklet architecture
- No changes to sequencer or trig/step system
- Track-level voice instances remain separate (no multi-voice track needed)
- Purely additive: `DrumKit` definition + `applyDrumKit()` action + UI picker
- Existing factory pattern `vp` (voice param overrides) already does per-track params — kits formalize this pattern

## Implementation Order

1. Define `DrumKit` type and built-in kits (data only)
2. Add `applyDrumKit()` action to state
3. Add `drumKit` field to Pattern
4. Add kit selector UI (desktop + mobile)
5. Define `SynthPreset` type and built-in presets
6. Add synth preset selector to melodic tracks
7. Update factory patterns to reference kits/presets

## Consequences

- **Positive:** Drum sounds grouped as kits — matches user mental model (hardware drum machines).
- **Positive:** Switching kits instantly changes all drum sounds while preserving patterns.
- **Positive:** Individual slot customization still possible after kit selection.
- **Positive:** Melodic synths named individually — fits their independent nature.
- **Positive:** Very low implementation complexity — purely additive metadata layer.
- **Positive:** Lays groundwork for user-created kits/presets.
- **Negative:** Kit switching resets all drum voice params (by design, but user may lose tweaks).
- **Negative:** Need enough built-in kits to be useful (minimum 3–4 at launch).
- **Dependency:** Benefits from ADR 009 (instrument selection) for slot-swapping UI.
- **Dependency:** Benefits from ADR 010/011 for more drum voices to populate kits.
