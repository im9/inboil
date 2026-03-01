# ADR 026: Auto-Performance (Auto Fill / Break / Reverse)

## Status: PROPOSED

## Context

During pattern chain playback or single-pattern looping, automatically inserting Fill / Break / Reverse effects would add natural variation to performances. This removes the need to manually press buttons while still creating dynamic evolution.

## Proposal

### Auto-Performance Rules

During pattern chain (or single-pattern loop) playback, automatically apply performance effects based on loop count:

| Loop Count | Action |
|-----------|--------|
| 1st | Normal playback |
| 2nd | Fill (50% probability) |
| 3rd | Normal playback |
| 4th | Fill (80%) + Break or Reverse (40%) |
| 8th | Fill + Break (high probability) |

### Parameters

```typescript
interface AutoPerformance {
  enabled: boolean      // default: true
  fillProb: number      // Fill probability (0.0–1.0, default: 0.5)
  breakProb: number     // Break probability (0.0–1.0, default: 0.3)
  reverseProb: number   // Reverse probability (0.0–1.0, default: 0.2)
  interval: number      // Base interval (2 = every 2 loops, 4 = every 4 loops)
}
```

### Trigger Timing

- Increment loop counter when the pattern reaches its final step
- Evaluate rules before the next loop starts and set perf flags (filling / breaking / reversing)
- Apply for one loop only, then automatically turn off

### UI

- `AUTO PERF` toggle + probability sliders in SYSTEM settings panel
- `AP` indicator in header (lit when active)
- Manual Fill/Break/Rev buttons remain unchanged (manual always takes priority)

### Worklet Changes

```typescript
// worklet-processor.ts — inside _advanceStep()
if (this.playheads[0] === 0 && this.loopCount > 0) {
  // Evaluate auto-performance at loop boundary
  if (this.autoPerf.enabled) {
    const n = this.loopCount
    if (n % this.autoPerf.interval === 0) {
      if (Math.random() < this.autoPerf.fillProb)    this.filling = true
      if (Math.random() < this.autoPerf.breakProb)   this.breaking = true
      if (Math.random() < this.autoPerf.reverseProb)  this.reversing = true
    }
  }
  this.loopCount++
}
```

## Changed Files

| File | Changes |
|------|---------|
| `state.svelte.ts` | `AutoPerformance` type, default values, SYSTEM settings |
| `worklet-processor.ts` | Loop counter, auto-perf evaluation logic |
| `engine.ts` | Send `autoPerf` parameters to worklet |
| `types.ts` | Add `autoPerf` to `WorkletPattern.perf` |
| Settings panel | AUTO PERF UI |

## Consequences

- **Positive**: Loop playback stays interesting. Adds live performance feel
- **Positive**: Default ON benefits beginners. Advanced users can turn it OFF
- **Negative**: Unpredictable behavior may be inconvenient during recording (auto-OFF during REC?)
- **Negative**: `Math.random()` is non-deterministic — consider LCG for reproducibility

## Open Questions

- Default probability values need experiential tuning
- Should the loop counter reset or continue across pattern transitions in a chain?
- Break duration (1 step? Last few steps of the pattern?)
