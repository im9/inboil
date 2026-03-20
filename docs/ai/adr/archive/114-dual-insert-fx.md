# ADR 114: Dual Insert FX Chain

## Status: Implemented

## Context

Currently each track has a single Insert FX slot (ADR 077). FX types are verb / delay / glitch, stored as `CellInsertFx` on `Cell`.

A single slot limits creative combinations — Delay → Bitcrush, Reverb → Delay, etc. are fundamental sound design chains. Hardware precedents:

- **Elektron Digitakt/Syntakt**: 2 inserts per track (fixed slots)
- **Roland SP-404**: 1 insert + master
- **Ableton Push**: unlimited chain (relies on PC power)

Given CPU budget constraints, the Elektron-style **2 fixed slots** approach is optimal. A known upper bound makes DSP resource usage predictable.

### Current Code Structure

- `CellInsertFx` — `src/lib/types.ts:24` — single FX slot type
- `Cell.insertFx?: CellInsertFx` — `src/lib/types.ts:51` — single optional
- `InsertFxSlot` — `worklet-processor.ts:121` — DSP-side single slot
- `insertSlots: (InsertFxSlot | null)[]` — one slot per track
- `_processInsert(slot, inL, inR)` — single slot processing
- `engine.ts:502` — `patternToWorklet` converts `cell.insertFx` → `WorkletInsertFx`

## Decision

### 1. Data Model

Change `Cell.insertFx` from a single object to a **fixed 2-element array**:

```typescript
// types.ts
export interface Cell {
  // ...
  insertFx?: [CellInsertFx | null, CellInsertFx | null]  // slot 0 → slot 1 (serial chain)
}
```

`CellInsertFx` type itself is unchanged. A `null` slot is bypassed.

### 2. WorkletTrack

```typescript
// dsp/types.ts
export interface WorkletTrack {
  // ...
  insertFx?: [WorkletInsertFx | null, WorkletInsertFx | null]
}
```

### 3. DSP (worklet-processor.ts)

Make `insertSlots` 2-dimensional:

```typescript
private insertSlots: [InsertFxSlot | null, InsertFxSlot | null][] = []
```

Processing is a serial chain:

```typescript
// slot 0 output feeds slot 1 input
for (const slot of this.insertSlots[t]) {
  if (slot) { const io = this._processInsert(slot, sL, sR); sL = io[0]; sR = io[1] }
}
```

### 4. engine.ts (patternToWorklet)

```typescript
insertFx: cell.insertFx ? [
  cell.insertFx[0]?.type ? serializeInsertFx(cell.insertFx[0]) : null,
  cell.insertFx[1]?.type ? serializeInsertFx(cell.insertFx[1]) : null,
] : undefined,
```

Extract a shared `serializeInsertFx()` helper.

### 5. stepActions.ts

Add slot index parameter:

```typescript
export function setInsertFxType(trackId: number, slot: 0 | 1, type: ...)
export function setInsertFxFlavour(trackId: number, slot: 0 | 1, flavour: string)
export function setInsertFxParam(trackId: number, slot: 0 | 1, param: 'mix' | 'x' | 'y', v: number)
```

### 6. UI (DockTrackEditor.svelte)

Stack two slots vertically:

```
┌─────────────────────────────────┐
│ INSERT FX                       │
├─────────────────────────────────┤
│ [1] [REVERB ▾] [Room ▾]        │
│     MIX ○  SIZE ○  DAMP ○      │
├─────────────────────────────────┤
│ [2] [DELAY ▾]  [Tape ▾]        │
│     MIX ○  TIME ○  FB ○        │
└─────────────────────────────────┘
```

- Slot numbers `[1]` `[2]` as labels
- Each slot independently sets type / flavour / params
- Both OFF: collapse to a single row (Dock scroll optimization)
- Signal flow: Voice → Slot 1 → Slot 2 → Send/Mix

### 7. Migration

Convert existing `cell.insertFx` (single object) to `[existingFx, null]`:

```typescript
// restoreSong or validate
if (cell.insertFx && !Array.isArray(cell.insertFx)) {
  cell.insertFx = [cell.insertFx as CellInsertFx, null]
}
```

Add array check to `validateSongData()`.

### 8. Implementation Phases

**Phase 1: Data + DSP**
- Convert `CellInsertFx` to array, update `WorkletTrack`
- Serial chain processing in `worklet-processor.ts`
- Update serialize in `engine.ts`
- Migration + validation
- Fix existing tests

**Phase 2: UI Polish**
- Slot collapse (both OFF → single row)
- Update StepGrid insert-dot display (two dots?)

**Phase 3: P-Lock Support**
- Per-slot Insert FX parameter P-Locks (per-step mix/x/y overrides)
- Keys: `ins0mix`, `ins0x`, `ins0y`, `ins1mix`, `ins1x`, `ins1y` in `trig.paramLocks`
- INS tab in vel-row (cycles I1M → I1X → I1Y → I2M → I2X → I2Y)
- Worklet resets to baseline then applies P-Lock overrides per step

## Considerations

- **CPU**: Worst case is all tracks × 2 slots = 16 FX instances. Current verb/delay/glitch are all lightweight, but be cautious if heavier FX are added later
- **3+ slots**: 2 is sufficient. 3 or more hits diminishing returns while increasing UI complexity
- **P-Lock**: Insert FX parameter P-Locks are currently unsupported. Per-slot P-Locks could be considered in the future but are out of scope for this ADR
- **Parallel vs serial**: Serial chain only. Parallel routing dramatically increases complexity — deferred

## Future Extensions

- P-Lock support for Insert FX parameters
- Additional FX types (chorus, phaser, EQ, etc.)
- Drag to reorder slots
- Integration with Dock panel phase 2 (collapsible sections)
