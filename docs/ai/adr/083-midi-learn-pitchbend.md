# ADR 083: MIDI Learn & Pitch Bend

## Status: Proposed

## Context

ADR 081 implemented hardware MIDI keyboard input (Phase 1-3): noteOn/noteOff, per-note release, and hardcoded CC1 → DJ Filter mapping. Two capabilities remain:

1. **Pitch Bend** — MIDI pitch bend (0xE0, 14-bit) has no target. The worklet has no command to update a single voice param in real-time without resending the full pattern via `setPattern`.
2. **MIDI Learn** — CC mapping is hardcoded (CC1 → filter only). Users with MIDI controllers (nanoKONTROL, Launch Control, etc.) need arbitrary CC → knob assignments.

### Current State

- `midi.ts` handles noteOn/noteOff/CC1 (`handleCC`), merges into vkbd pipeline
- DockPanel knobs use `knobChange(paramDef, value)` → `setVoiceParam()` / `setParamLock()`
- Voice params are normalized 0.0-1.0 in UI, denormalized via `denormalizeParam()` before storage
- Worklet receives voice params only via `setPattern` (full pattern resend)
- `Voice.setParam(key, value)` exists on all voices for real-time param updates
- `detune` param exists on MoogVoice (303/Lead); not on DrumMachine or FM

## Decision

### Phase 1: Pitch Bend via `setVoiceParam` Worklet Command

Add a lightweight worklet command for real-time single-param updates:

```typescript
// dsp/types.ts — add to WorkletCommand.type union
'setVoiceParam'

// WorkletCommand — add fields
paramKey?: string
paramValue?: number
```

```typescript
// worklet-processor.ts
case 'setVoiceParam': {
  const t = cmd.trackId ?? 0
  const v = this.voices[t]
  if (v && cmd.paramKey) v.setParam(cmd.paramKey, cmd.paramValue ?? 0)
  break
}
```

```typescript
// engine.ts
setVoiceParam(trackId: number, key: string, value: number): void {
  this._post({ type: 'setVoiceParam', trackId, paramKey: key, paramValue: value })
}
```

Pitch bend in `midi.ts`:

```typescript
// 0xE0 = Pitch Bend — 14-bit value, center = 8192
} else if (cmd === 0xe0) {
  const bend = ((velocity << 7) | note) - 8192  // -8192..+8191
  const semitones = (bend / 8192) * 2  // ±2 semitones
  engine.setVoiceParam(ui.selectedTrack, 'pitchBend', semitones)
}
```

`pitchBend` is a new transient param (not saved in voiceParams). Melodic voices apply it as a frequency multiplier:

```typescript
// In MoogVoice.tick() / WTCore.tick() / FMVoice.tick()
const bendMul = Math.pow(2, this.pitchBend / 12)
const freq = this.baseFreq * bendMul
```

### Phase 2: MIDI Learn

#### State

```typescript
// state.svelte.ts
export const midiLearn = $state({
  active: false,           // learn mode engaged
  targetParam: null as string | null,  // param key awaiting CC assignment
  mappings: [] as CcMapping[],
})

interface CcMapping {
  cc: number           // MIDI CC number (0-127)
  paramKey: string     // voice param key or special target
  label: string        // display name
}
```

Mappings are persisted alongside song data. Special targets beyond voice params: `'volume'`, `'pan'`, `'reverbSend'`, `'delaySend'`, `'filterX'`, `'filterY'`.

#### Learn Flow

1. User taps LEARN button in Sidebar MIDI section (or long-press a DockPanel knob)
2. `midiLearn.active = true` — DockPanel knobs show pulsing border
3. User taps a knob → `midiLearn.targetParam = paramDef.key`
4. User moves a CC on their controller → `handleCC` captures the CC number
5. Mapping created: `{ cc, paramKey, label }`
6. Learn mode auto-exits

```
┌─────────────────────────────────┐
│  MIDI INPUT                     │
│  ● Enabled               [ON]  │
│  Device: [All ▼]                │
│  Channel: [Omni ▼]             │
│                                 │
│  CC MAPPINGS            [LEARN] │
│   CC1  → DJ Filter              │
│   CC7  → Volume                 │
│   CC74 → Cutoff                 │
│                          [CLR]  │
└─────────────────────────────────┘
```

#### CC Dispatch

```typescript
function handleCC(cc: number, value: number) {
  const norm = value / 127

  // Learn mode — capture CC assignment
  if (midiLearn.active && midiLearn.targetParam) {
    midiLearn.mappings.push({ cc, paramKey: midiLearn.targetParam, label: midiLearn.targetParam })
    midiLearn.targetParam = null
    midiLearn.active = false
    return
  }

  // Hardcoded CC1 (mod wheel) fallback
  if (cc === 1) {
    fxPad.filter.x = norm
    fxPad.filter.on = value > 0
    return
  }

  // User-defined mappings
  for (const m of midiLearn.mappings) {
    if (m.cc === cc) applyMapping(m, norm)
  }
}

function applyMapping(m: CcMapping, norm: number) {
  switch (m.paramKey) {
    case 'volume':     song.tracks[ui.selectedTrack].volume = norm; break
    case 'pan':        song.tracks[ui.selectedTrack].pan = norm * 2 - 1; break
    case 'reverbSend': /* ... */ break
    case 'filterX':    fxPad.filter.x = norm; fxPad.filter.on = norm > 0; break
    default:           knobChange({ key: m.paramKey }, norm); break
  }
}
```

## Implementation Phases

1. **Phase 1: `setVoiceParam` command + Pitch Bend** — New worklet command, pitch bend handler in `midi.ts`, `pitchBend` param on melodic voices. ~40 LOC.
2. **Phase 2: MIDI Learn** — `midiLearn` state, learn flow, CC dispatch with user mappings, Sidebar UI, persistence. ~120 LOC.

## Considerations

- **Pitch bend range**: +-2 semitones is the MIDI standard default. Could make configurable later but not worth the complexity now.
- **pitchBend as transient**: Not saved in `voiceParams` — it's a live performance param that resets when note ends. Similar to how aftertouch works on hardware synths.
- **setVoiceParam latency**: Direct worklet message, no rAF throttle needed. Same path as triggerNote (~1 sample buffer delay).
- **CC conflicts**: If CC1 is user-mapped to something else, the hardcoded mod wheel mapping should yield to the user mapping. Phase 2 changes precedence.
- **Mapping scope**: Mappings apply to the selected track. Could extend to global mappings (e.g., CC7 → master volume) in the future.

## Future Extensions

- NRPN / 14-bit CC for high-resolution control
- Per-track CC mappings (vs current selected-track-only)
- Aftertouch (channel + poly) → filter/volume modulation
- MPE support for expressive controllers (Roli Seaboard, Linnstrument)
- Import/export CC mapping presets for common controllers
