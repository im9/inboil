# ADR 009: Instrument Selection

## Status: Implemented

## Context

Tracks currently have fixed instrument assignments — track 0 is always KickVoice, track 7 is always MoogVoice, etc. The `synthType` field exists on Track but `makeVoice()` ignores it for tracks 0–7, using a hardcoded switch on `trackIdx`. Users cannot change a track's instrument, limiting creative flexibility.

### Current Factory (`voices.ts:makeVoice`)

```typescript
// Track index determines voice — synthType is ignored
switch (trackIdx) {
  case 0: return new KickVoice(sr)
  case 1: return new SnareVoice(sr)
  // ...
  case 6: return new TB303Voice(sr)
  case 7: return new MoogVoice(sr)
}
```

## Proposed Design

### Voice Registry

Replace the track-index switch with a registry mapping voice identifiers to constructors:

```typescript
const VOICE_REGISTRY: Record<string, (sr: number) => Voice> = {
  // Drums
  'kick':     sr => new KickVoice(sr),
  'kick808':  sr => new Kick808Voice(sr),
  'snare':    sr => new SnareVoice(sr),
  'clap':     sr => new ClapVoice(sr),
  'hat':      sr => new HatVoice(sr),
  'openhat':  sr => new OpenHatVoice(sr),
  'cymbal':   sr => new CymbalVoice(sr),
  'rimshot':  sr => new RimshotVoice(sr),
  'tom':      sr => new TomVoice(sr),
  'cowbell':  sr => new CowbellVoice(sr),
  'ride':     sr => new RideVoice(sr),
  'shaker':   sr => new ShakerVoice(sr),
  // Melodic
  'bass303':  sr => new TB303Voice(sr),
  'analog':   sr => new AnalogVoice(sr),
  'moog':     sr => new MoogVoice(sr),
  'fm':       sr => new FMVoice(sr),
  'poly':     sr => new PolyVoice(sr),
  'chord':    sr => new ChordVoice(sr),
  'sampler':  sr => new SamplerVoice(sr),
}
```

`makeVoice()` looks up `track.synthType` (or a new `voiceId` field) in the registry. Fallback to `AnalogVoice` for unknown types.

### State Changes

Update `SynthType` to use granular voice identifiers:

```typescript
export type VoiceId =
  | 'kick' | 'kick808' | 'snare' | 'clap' | 'hat' | 'openhat' | 'cymbal'
  | 'rimshot' | 'tom' | 'cowbell' | 'ride' | 'shaker'
  | 'bass303' | 'analog' | 'moog' | 'fm' | 'poly' | 'chord' | 'sampler'
```

Or keep the existing `synthType` coarse categories for backward compatibility and add a `voiceId` field.

### Worklet Communication

When user changes a track's instrument:
1. UI updates `track.voiceId` in state
2. `patternToWorklet()` sends the new voice ID
3. Worklet receives `setPattern` → detects voice change → calls `makeVoice()` to create new voice instance
4. New voice replaces old voice on that track (reset state)

### UI: Instrument Picker

**Option A: Inline dropdown**
- Tap track name/type label → dropdown with voice list grouped by category (Drums / Bass / Lead / FX)
- Compact, fast access

**Option B: Dedicated instrument browser**
- Full-screen or modal panel with voice categories, preview (tap to audition)
- Better for discovery, overkill for v1

**Option C: Cycle button**
- Small arrow buttons next to track name to cycle through voices in category
- Minimal UI footprint, quick switching

**Recommendation: Option A** (dropdown) for desktop, **Option C** (cycle) for mobile.

### Category Grouping

```
DRUMS:  kick, kick808, snare, clap, hat, openhat, cymbal, rimshot, tom, cowbell, ride, shaker
BASS:   bass303, analog
LEAD:   moog, fm, poly
PAD:    chord, poly
SAMPLE: sampler
```

### Parameter Reset on Switch

When switching instruments, voice params must reset to the new voice's defaults (from `paramDefs.ts`). The `defaultVoiceParams()` function already handles this — just call it with the new voice ID.

### Piano Roll Visibility

The `isDrum()` check determines piano roll visibility. Update to use the voice registry's category instead of checking `SynthType`:

```typescript
export function isDrum(track: Track): boolean {
  return DRUM_VOICES.includes(track.voiceId)
}
```

## Consequences

- **Positive:** Users can customize track instruments freely — huge creative upgrade.
- **Positive:** Registry pattern is extensible — new voices plug in with one line.
- **Positive:** Enables ADR 010, 011, 012 voices to be user-accessible.
- **Negative:** Voice change requires worklet re-instantiation — possible audio glitch (mitigate with quick fade-out).
- **Negative:** Parameter panel must dynamically adapt to voice — already works via `getParamDefs()`.
- **Risk:** Polyphonic voices on multiple tracks may exceed CPU budget — need per-voice profiling.
