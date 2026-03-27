# ADR 126: Tonnetz Chord Slots

## Status: Proposed

## Context

The Tonnetz generative engine (ADR 078) currently supports a single `startChord` and a uniform `stepsPerChord` duration. All subsequent chords are derived by applying neo-Riemannian transforms (P, L, R, etc.) to the start chord.

This works well for exploratory/generative use, but makes it impossible to produce **deliberate chord progressions** like those common in house, pop, and film music — e.g., Bb → F → Gm → Eb (Calvin Harris style), where:

1. Specific chords are chosen intentionally, not derived from transforms
2. Each chord may have a different duration (e.g., I held for 2 bars, then V-vi-IV 1 bar each)

Current limitations:

- `sequence: string[]` only accepts transform operators — no way to specify an explicit chord
- `stepsPerChord: number` is uniform — every chord occupies the same number of steps
- With `stepsPerChord` max recently raised from 16 to 64, multi-bar progressions via transforms are possible, but the reachable chord set is constrained by the neo-Riemannian lattice

### Current data model (`src/lib/types.ts:175–182`)

```typescript
interface TonnetzParams {
  engine: 'tonnetz'
  startChord: [number, number, number]
  sequence: string[]       // 'P' | 'L' | 'R' | 'PL' | 'PR' | 'LR' | 'PLR'
  stepsPerChord: number
  voicing: 'close' | 'spread' | 'drop2'
}
```

### Current generation (`src/lib/generative.ts:231–268`)

Iterates over pattern steps, applies the next transform at each `stepsPerChord` boundary, and emits one active trig per chord with legato hold.

## Decision

### 1. Introduce `TonnetzSlot` union type

Each slot in the sequence is either a **transform** (operate on previous chord) or an **explicit chord** (jump to a specific triad). Each slot can optionally specify its own duration.

```typescript
type TonnetzSlot =
  | { op: string; steps?: number; rhythm?: TonnetzRhythm }          // transform
  | { chord: [number, number, number]; steps?: number; rhythm?: TonnetzRhythm }  // explicit triad

// Rhythm within a slot — controls which steps are active trigs vs rests
type TonnetzRhythm =
  | boolean[]                    // explicit pattern, e.g. [true,false,false,true,...]
  | 'legato'                     // one trig held for full duration (default, current behavior)
  | 'offbeat'                    // classic house offbeat stab: . x . x . x . x
  | 'onbeat'                     // four-on-the-floor: x . . . x . . . ...
  | 'syncopated'                 // x . x . . x . x  (Disclosure / Kaytranada style)
  | { preset: 'euclidean'; hits: number }  // euclidean distribution of hits across slot steps

interface TonnetzParams {
  engine: 'tonnetz'
  startChord: [number, number, number]
  voicing: 'close' | 'spread' | 'drop2'

  // Legacy fields (backward compat — used when slots is absent)
  sequence?: string[]
  stepsPerChord?: number

  // New: per-slot sequence with mixed transforms and explicit chords
  slots?: TonnetzSlot[]
}
```

**Backward compatibility**: if `slots` is absent, the engine falls back to `sequence` + `stepsPerChord` (current behavior). Migration converts legacy params to slots on first edit.

### 2. Generation algorithm changes (`tonnetzGenerate`)

```
function tonnetzGenerate(params: TonnetzParams, totalSteps: number): Trig[]
  slots = params.slots ?? legacyToSlots(params)
  chord = params.startChord
  step = 0
  slotIdx = 0

  while step < totalSteps:
    slot = slots[slotIdx % slots.length]

    // Determine chord for this slot
    if slot has 'chord':
      chord = slot.chord
    else:
      if slotIdx > 0 or step > 0:  // skip transform on first slot
        chord = applyTonnetzOp(chord, slot.op)

    // Determine duration
    dur = slot.steps ?? params.stepsPerChord ?? 4
    dur = min(dur, totalSteps - step)

    // Resolve rhythm pattern for this slot
    rhythm = resolveRhythm(slot.rhythm ?? 'legato', dur)
    // rhythm is boolean[] of length dur — true = active trig, false = rest

    voiced = applyVoicing(chord)
    for i in 0..dur:
      if rhythm[i]:
        // Find how long until next active step or slot end
        trigDur = distance to next true in rhythm after i, or remaining steps
        emit active trig with notes=voiced, duration=trigDur
      else:
        emit inactive trig

    step += dur
    slotIdx++
```

```
function resolveRhythm(rhythm: TonnetzRhythm, steps: number): boolean[]
  if rhythm is boolean[]:  return rhythm (padded/trimmed to steps)
  if rhythm == 'legato':   return [true, false, false, ...]
  if rhythm == 'offbeat':  return [f,t,f,t,f,t,...] (length=steps)
  if rhythm == 'onbeat':   return [t,f,f,f,t,f,f,f,...] (every 4 steps)
  if rhythm == 'syncopated': return [t,f,t,f,f,t,f,t,...] (repeating)
  if rhythm is euclidean:  return bjorklund(rhythm.hits, steps)
```

Key changes from current algorithm:
- Variable duration per slot instead of uniform `stepsPerChord`
- Explicit chord slots bypass transform chain and set `chord` directly
- Transforms after an explicit chord operate on that chord (chain continues)
- Slot sequence loops when exhausted (same as current `sequence` cycling)
- Per-slot rhythm controls active/rest distribution within the slot duration

### 3. Legacy conversion helper

```typescript
function legacyToSlots(params: TonnetzParams): TonnetzSlot[] {
  // First slot: no transform (uses startChord as-is)
  const slots: TonnetzSlot[] = [{ op: 'P', steps: params.stepsPerChord }]
  // Actually, first chord is startChord with no transform applied.
  // We model this as: first slot is implicit (startChord plays for stepsPerChord),
  // then each sequence entry becomes a slot.
  // But to keep the slot array self-contained, we can use an explicit chord for slot 0:
  return [
    { chord: [...params.startChord], steps: params.stepsPerChord },
    ...params.sequence.map(op => ({ op, steps: params.stepsPerChord })),
  ]
}
```

### 4. UI changes (DockGenerativeEditor)

Replace the current OPS sequence editor with a slot editor:

```
┌─ TONNETZ ────────────────────────────────────────────┐
│  VOICING [close ▾]                                   │
│                                                      │
│  ┌─ SLOT 1 ───────────────────────────────────────┐  │
│  │ [CHORD ▾]  C [maj ▾]  STEPS [16]  [offbeat ▾] │  │
│  └────────────────────────────────────────────────┘  │
│  ┌─ SLOT 2 ───────────────────────────────────────┐  │
│  │ [XFORM ▾]  [P ▾]      STEPS [16]  [legato ▾]  │  │
│  └────────────────────────────────────────────────┘  │
│  ┌─ SLOT 3 ───────────────────────────────────────┐  │
│  │ [CHORD ▾]  F [maj ▾]  STEPS [8]   [offbeat ▾] │  │
│  └────────────────────────────────────────────────┘  │
│  ┌─ SLOT 4 ───────────────────────────────────────┐  │
│  │ [XFORM ▾]  [R ▾]      STEPS [8]   [eucl 5 ▾]  │  │
│  └────────────────────────────────────────────────┘  │
│  [+ Add Slot]  [− Remove]                            │
└──────────────────────────────────────────────────────┘
```

Each slot row has:
- **Mode toggle**: `CHORD` (explicit) or `XFORM` (transform) — dropdown or segmented button
- **CHORD mode**: root note picker + quality (maj/min) — same controls as current startChord
- **XFORM mode**: transform picker (P/L/R/PL/PR/LR/PLR) — same as current OPS
- **STEPS**: per-slot duration (1–64), small number stepper
- **RHYTHM**: dropdown — `legato` (default), `offbeat`, `onbeat`, `syncopated`, `eucl N` (euclidean with hit count)

The existing `startChord` controls remain for setting the initial chord. Slot 0 defaults to `{ chord: startChord }`.

### 5. Validation & migration

- `validateSongData()` accepts both legacy (sequence + stepsPerChord) and new (slots) formats
- `restoreSong()` auto-migrates: if `slots` is absent and `sequence` exists, convert via `legacyToSlots()`
- Slot validation: each slot must have either `op` (valid transform string) or `chord` (3-element MIDI array); `steps` if present must be 1–64

### 6. Preset updates

Add house/pop progression presets alongside existing transform-only presets:

```typescript
{ name: 'House Stabs', engine: 'tonnetz', params: {
  engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'close',
  slots: [
    { chord: [60, 64, 67], steps: 16, rhythm: 'offbeat' },  // C major, offbeat stabs
    { chord: [55, 60, 64], steps: 16, rhythm: 'offbeat' },  // G major
    { chord: [57, 60, 64], steps: 16, rhythm: 'offbeat' },  // Am
    { chord: [53, 57, 60], steps: 16, rhythm: 'offbeat' },  // F major
  ]
}},
{ name: 'Pad Progression', engine: 'tonnetz', params: {
  engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'spread',
  slots: [
    { chord: [60, 64, 67], steps: 32 },  // C major, 2 bars legato
    { chord: [53, 57, 60], steps: 16 },  // F major, 1 bar
    { chord: [55, 59, 62], steps: 16 },  // G major, 1 bar
  ]
}},
{ name: 'Hybrid P·L + Jump', engine: 'tonnetz', params: {
  engine: 'tonnetz', startChord: [60, 64, 67], voicing: 'spread',
  slots: [
    { op: 'P', steps: 16, rhythm: 'legato' },
    { op: 'L', steps: 16, rhythm: 'syncopated' },
    { chord: [53, 57, 60], steps: 16, rhythm: 'offbeat' },  // F major anchor
    { op: 'R', steps: 16, rhythm: { preset: 'euclidean', hits: 5 } },
  ]
}},
```

## Implementation Checklist

### Phase 1: Data model & generation
- [ ] Add `TonnetzSlot`, `TonnetzRhythm` types and optional `slots` field to `TonnetzParams` in `types.ts`
- [ ] Implement `legacyToSlots()` in `generative.ts`
- [ ] Implement `resolveRhythm()` with preset patterns (legato, offbeat, onbeat, syncopated) and euclidean (Bjorklund)
- [ ] Update `tonnetzGenerate()` to use slots with per-slot duration and rhythm
- [ ] Add validation for slots format in `validate.ts`
- [ ] Add migration in `restoreSong()` (legacy → slots)
- [ ] Unit tests: slot-based generation, mixed chord/transform, variable duration, rhythm patterns, legacy compat

### Phase 2: UI
- [ ] Replace OPS editor with slot editor in `DockGenerativeEditor.svelte`
- [ ] Per-slot mode toggle (CHORD / XFORM)
- [ ] Per-slot step stepper
- [ ] Per-slot rhythm selector
- [ ] Add/remove slot buttons
- [ ] SceneView faceplate: show chord names instead of op labels when slots have explicit chords

### Phase 3: Presets & polish
- [ ] Add house/pop progression presets
- [ ] Update Playground generator component
- [ ] Update docs (tonnetz.mdx EN + JA)

## Considerations

- **Why not a separate `progression` engine?** The transform + explicit chord hybrid is more powerful than either alone. A dedicated engine would duplicate voicing logic, merge modes, and UI infrastructure. Keeping it as a Tonnetz extension means users can freely mix generative transforms with deliberate chords.

- **startChord redundancy**: When `slots[0]` is an explicit chord, `startChord` is technically unused. We keep it for backward compat and as a fallback (if slot 0 is a transform, startChord is the initial chord). Could also serve as a "key center" hint for future UI features.

- **Slot count limit**: No hard cap, but UI should scroll gracefully. Practical limit is total steps ÷ minimum slot duration. Most house/pop progressions use 4–8 slots.

## Future Extensions

- **Chord quality beyond triads**: 7th chords (4-note), sus2/sus4, add9 — would require changing `chord` from `[number, number, number]` to `number[]`
- **Roman numeral input mode**: key-aware entry (I, IV, V, vi) that auto-generates MIDI triads — UI convenience layer on top of slots
- **Strum / arpeggio per slot**: per-slot note spread timing for strummed chord textures
- **Custom rhythm editor**: tap-in or grid-draw for `boolean[]` rhythm patterns beyond presets
- **Tonnetz lattice visualization**: 2D hex grid showing chord positions and transform paths — interactive slot editing by clicking lattice nodes
- **Generative rhythm via Turing Machine**: feed Turing gate output into slot rhythm for evolving stab patterns
