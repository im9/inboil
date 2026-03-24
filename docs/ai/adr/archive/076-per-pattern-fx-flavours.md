# ADR 076: Per-Pattern FX Flavours

## Status: Implemented

## Context

ADR 075 Phase 1 implemented FX flavours (Room/Hall, Digital/Dotted, Bitcrush/Redux, Cloud/Freeze/Stretch) as global (per-song) state. `fxFlavours` is a top-level reactive state in `state.svelte.ts`, persisted as `Song.flavours?`.

Current limitations:
- Flavours are fixed per song — they don't change on pattern transitions
- Scene node FX decorators (`dec.type === 'fx'`) only control on/off, cannot change flavours
- Section's `verb?/delay?/glitch?/granular?` (ChainFx) only has on/x/y

For a groove box, switching the "character" of effects on pattern transitions greatly increases expressiveness. Example: Room reverb in the intro → Hall in the chorus, Dotted delay in the breakdown, etc.

## Decision

### 1. Add FxFlavours to Section / Scene Decorator

#### Section (Linear Playback)

Add an optional `flavours` field to the `Section` interface:

```typescript
export interface Section {
  // ... existing fields ...
  flavours?: Partial<FxFlavours>  // per-section flavour override
}
```

Using `Partial` allows overriding only specified effects; unspecified ones retain the previous section's value.

#### Scene Decorator (Graph Playback)

Extend the existing `SceneDecorator` type `'fx'`. Currently `params` only has `{ verb: 0|1, delay: 0|1, ... }` for on/off. Add flavour information:

```typescript
// Additional fields for SceneDecorator.params (type === 'fx'):
{
  verb: 0 | 1,
  delay: 0 | 1,
  glitch: 0 | 1,
  granular: 0 | 1,
  // New: flavour overrides (optional, string values)
  verbFlavour?: string,     // 'room' | 'hall'
  delayFlavour?: string,    // 'digital' | 'dotted'
  glitchFlavour?: string,   // 'bitcrush' | 'redux'
  granularFlavour?: string, // 'cloud' | 'freeze' | 'stretch'
}
```

Since `Record<string, number>` typed `params` cannot hold strings, flavour information needs a separate field:

```typescript
export interface SceneDecorator {
  type: 'transpose' | 'tempo' | 'repeat' | 'fx' | 'automation'
  params: Record<string, number>
  automationParams?: AutomationParams
  flavourOverrides?: Partial<FxFlavours>  // NEW: for type === 'fx'
}
```

### 2. Flavour Application at Playback

#### applyDecorators (Scene)

Add flavour application to `applyDecorators()` in `state.svelte.ts`:

```typescript
} else if (dec.type === 'fx') {
  fxPad.verb     = { ...fxPad.verb,     on: !!dec.params.verb }
  // ... existing on/off logic ...
  // NEW: apply flavour overrides
  if (dec.flavourOverrides) {
    if (dec.flavourOverrides.verb)     fxFlavours.verb     = dec.flavourOverrides.verb
    if (dec.flavourOverrides.delay)    fxFlavours.delay    = dec.flavourOverrides.delay
    if (dec.flavourOverrides.glitch)   fxFlavours.glitch   = dec.flavourOverrides.glitch
    if (dec.flavourOverrides.granular) fxFlavours.granular = dec.flavourOverrides.granular
  }
}
```

#### applySection (Linear) — *deprecated, Section superseded by Scene*

Add flavour application to `applySection()`:

```typescript
export function applySection(sec: Section) {
  // ... existing FX on/off + key/oct ...
  // Apply flavour overrides
  if (sec.flavours) {
    if (sec.flavours.verb)     fxFlavours.verb     = sec.flavours.verb
    if (sec.flavours.delay)    fxFlavours.delay    = sec.flavours.delay
    if (sec.flavours.glitch)   fxFlavours.glitch   = sec.flavours.glitch
    if (sec.flavours.granular) fxFlavours.granular = sec.flavours.granular
  }
}
```

### 3. UI: Flavour Configuration

#### DockPanel Decorator Editor

Per ADR 069, FX decorator editing is done in the DockPanel. Currently on/off toggles only. Add flavour selection:

```
┌─ FX Decorator ─────────────┐
│  VERB  [ON]  Room ▼        │
│  DLY   [OFF] Digital ▼     │
│  GLT   [OFF] Bitcrush ▼    │
│  GRN   [OFF] Cloud ▼       │
└─────────────────────────────┘
```

Each row: on/off toggle + flavour select (dropdown or tap-to-cycle). Unset = "—" (retain global value).

#### SectionNav (Linear Sections)

When a Section has flavours set, display a small indicator (color dot, etc.) on the SectionNav cell. Editing is done in the DockPanel's Section parameter screen.

### 4. Serialization

#### Section.flavours

Add `flavours` clone/restore to `cloneSection` / `restoreSection`. Since it's `Partial<FxFlavours>`, an optional spread is sufficient:

```typescript
...(s.flavours ? { flavours: { ...s.flavours } } : {}),
```

#### SceneDecorator.flavourOverrides

Spread-clone decorator `flavourOverrides` in `cloneScene` / `restoreScene`.

#### Backwards Compatibility

Both fields are optional — absent in old save data, defaulting to "no override" (retain global value).

## Implementation Order

1. **Section.flavours + applySection** — Flavour switching in linear playback
2. **SceneDecorator.flavourOverrides + applyDecorators** — Flavour switching in graph playback
3. **DockPanel UI** — Add flavour select to decorator editor
4. **clone/restore/undo** — Serialization support

## Considerations

- **Snapshot restoration**: Scene playback restores parameters via `automationSnapshot`, but should flavours be included in snapshots? → No. Flavours are DSP algorithm selections, not continuous values, so explicit per-transition setting is more natural. Unset retains the previous value.
- **Crossfade**: Flavour switching may cause click noise (especially Reverb Room↔Hall). Phase 1 accepts instant switching; short crossfade (10–30ms) to be considered in the future.
- **Undo**: Flavour switching modifies `fxFlavours` state, which is covered by `cloneSong`'s `flavours` for undo/redo. Section/Decorator flavourOverrides are also snapshot as part of the Song.

## Future Extensions

### Per-Track Insert FX

Current FX uses a shared send-bus architecture across all tracks. For per-track effect characters, **insert FX** is needed:

- **Architecture**: Generate track-count × effect instances in the worklet (e.g., 16 tracks × Reverb = 16 reverb instances)
- **CPU cost**: Up to 16× increase from current single instance. SimpleReverb (comb×8 + allpass×4) is feasible for multiple instances, but Shimmer/Granular would be too heavy
- **UI**: Per-track FX slots (insert FX section within DockPanel track parameters)
- **Routing**: Insert → send serial chain. Post-insert signal feeds into send buses
- **State**: Add `insertFx?: { type: FxType; flavour: string; params: Record<string, number> }[]` to `Cell`
- **ADR 012 Sampler**: Strongest use case is applying insert FX to sampler tracks (e.g., individual bitcrush on drum breaks)

Insert FX can build on ADR 075's flavour foundation, but requires significant signal chain changes in the worklet — should be designed as a separate ADR (see ADR 077).
