# ADR 110: Per-Cell Sample References

## Status: Implemented

## Context

Samples were stored **globally per track** (`samplesByTrack[trackId]`). While Cell (pattern × track) already supports per-pattern `voiceId` and `voiceParams`, the sample data was shared across all patterns for a given track.

### Problem

The app lets each pattern assign a different instrument (`voiceId`) to the same track slot, but Sampler samples were forced to be identical across patterns. For example, assigning Kick to Pattern 0 and Clap to Pattern 1 on the same track slot was impossible without using separate tracks.

### Data flow (before)

```
UI (DockTrackEditor)
  → setSample(trackId, name, waveform, rawBuffer)
  → samplesByTrack[trackId] = { name, waveform, rawBuffer }   ← global
  → IDB key: `${projectId}_${trackId}`

Engine (_autoLoadSamples)
  → caches userSamples / packZones by trackId
  → resends voices on pattern switch
```

## Decision

### A. Add sampleRef to Cell

```typescript
// types.ts
export interface CellSampleRef {
  name: string         // display name (filename or pack name)
  packId?: string      // factory pack → re-hydrated from pool (no buffer needed)
}

export interface Cell {
  // ... existing fields ...
  sampleRef?: CellSampleRef  // undefined = no sample assigned
}
```

The actual sample data (rawBuffer / waveform) remains in memory + IDB. `sampleRef` is only a lightweight reference indicating which sample to use.

### B. IDB key changed to cell-scoped

```typescript
// storage.ts
export interface StoredSample {
  key: string          // `${projectId}_${trackId}_${patternIndex}`
  projectId: string
  trackId: number
  patternIndex: number // new field
  name: string
  buffer: ArrayBuffer
  createdAt: number
  packId?: string
}
```

When the same sample is referenced by multiple cells, it's stored redundantly in IDB (dedup is a future optimization).

### C. samplesByTrack → samplesByCell

```typescript
// state.svelte.ts
// Key: `${trackId}_${patternIndex}`
export const samplesByCell = $state<Record<string, SampleMeta>>({})

export function sampleCellKey(trackId: number, patternIndex: number): string {
  return `${trackId}_${patternIndex}`
}

export function setSample(
  trackId: number, patternIndex: number,
  name: string, waveform: Float32Array, rawBuffer: ArrayBuffer
): void { ... }
```

### D. Engine sample cache

```typescript
// engine.ts
// Cache keys changed from trackId → `${trackId}_${patternIndex}`
private userSamples: Map<string, { mono: Float32Array; sampleRate: number }>
private packZones:   Map<string, PackZoneData[]>
// Dedup: tracks what's currently loaded in each worklet track slot
private loadedSampleKey: Map<number, string>
```

`_autoLoadSamples` runs on pattern switch, comparing each cell's sample identity against `loadedSampleKey` to skip redundant worklet sends.

### E. Migration

Legacy projects with `samplesByTrack` are auto-migrated on load:

- Old IDB keys (`projectId_trackId`, no `patternIndex`) are detected by `patternIndex == null`
- The sample is expanded to all Sampler cells across all patterns
- `cell.sampleRef` is set on each matching cell

### F. Export / Import

Export format bumped to v3 with cell-scoped sample keys:

```typescript
// v2: samples: { [trackId]: { name, packId?, buffer? } }
// v3: samples: { [`${trackId}_${patternIndex}`]: { name, packId?, buffer? } }
```

v2 import detects numeric-only keys and expands to all patterns.

### G. Files changed

| File | Changes |
|------|---------|
| `src/lib/types.ts` | `CellSampleRef` interface, `sampleRef?` on `Cell` |
| `src/lib/storage.ts` | `patternIndex` in `StoredSample`, new key format |
| `src/lib/state.svelte.ts` | `samplesByCell`, `sampleCellKey`, updated `setSample`/`setSamplePack`, v3 export/import, legacy migration in `restoreSamples` |
| `src/lib/audio/engine.ts` | Per-cell cache maps, `loadedSampleKey` dedup, `_autoLoadSamples` by pattern |
| `src/lib/songClone.ts` | `sampleRef` cloned in `cloneCell` |
| `src/lib/validate.ts` | `sampleRef` schema validation in `validateCell` |
| `src/lib/components/DockTrackEditor.svelte` | Per-cell sample load/display |
| `src/lib/components/MobileParamOverlay.svelte` | Per-cell sample load/display |
| `src/lib/components/StepGrid.svelte` | `trackDisplayName` with `patternIndex` |
| `src/lib/components/TrackerView.svelte` | `trackDisplayName` with `patternIndex` |

## Considerations

- **Memory**: Same sample across N patterns = N× IDB storage. In practice, pattern count is 8–16 and samples are 50–500 KB, so this is acceptable. Content-hash dedup can optimize later.
- **Worklet send latency**: Pattern switches may trigger sample re-sends. The `loadedSampleKey` dedup map ensures identical samples are not re-sent.
- **Legacy compatibility**: Old IDB keys (`projectId_trackId`) auto-migrate transparently. No user action needed.
- **Factory packs**: Only `packId` reference is stored, so cell-scoped storage adds nearly zero overhead.

## Future Extensions

- Content-hash dedup (store identical buffers only once in IDB)
- Cross-pattern sample copy (drag & drop between cells)
- Per-cell sample chaining (A/B switch)
- Extend per-pattern customization to other voices (e.g. FM/WT wavetable selection)
