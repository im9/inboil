# ADR 013: Pattern Chain

## Status: PROPOSED

## Context

Users need a way to arrange patterns into a song structure. A traditional "Song mode" with a separate timeline editor adds significant complexity. Pattern chaining offers a simpler alternative: define an ordered list of patterns that play sequentially, looping at the end. This covers the primary use case (arranging a track) without a full DAW-style arrangement view.

## Proposed Design

### Data Model

```typescript
interface ChainEntry {
  patternId: number  // 1-based pattern ID
  repeats: number    // how many times to loop this pattern before advancing (1–16)
}

interface Chain {
  entries: ChainEntry[]  // ordered list, max 64 entries
  active: boolean        // chain mode on/off
}
```

A chain is a flat list of `(patternId, repeats)` pairs. When chain mode is active, the sequencer advances through the list automatically.

### Playback Behavior

1. **Chain OFF (default):** Current behavior — single pattern loops forever.
2. **Chain ON:**
   - Sequencer plays `entries[0]` for `repeats` loops, then auto-switches to `entries[1]`, etc.
   - At end of chain, loops back to `entries[0]`.
   - Pattern switch happens at beat boundary (reuses existing `applyPendingSwitch` mechanism).
   - A `chainIndex` counter tracks the current position in the chain.
   - User can still manually switch patterns with ◀▶ — this jumps to the matching chain entry (or disables chain if pattern isn't in chain).

### Chain Editor UI

- **Location:** Accessible via a toggle/tab in the header or a dedicated "CHAIN" button.
- **Display:** Horizontal strip of pattern slots, each showing pattern number (00–99) and repeat count.
- **Interaction:**
  - Tap empty slot → opens pattern picker (grid of 00–99) or uses current pattern.
  - Tap existing slot → edit repeat count (1–16 stepper).
  - Long press / swipe → remove entry.
  - Drag to reorder (v2).
- **Visual feedback:** Current chain position highlighted during playback.

### State Extension

```typescript
export const chain = $state<Chain>({
  entries: [],
  active: false,
})

export const chainPlayback = $state({
  index: 0,       // current entry in chain
  loopCount: 0,   // how many times current entry has looped
})
```

### Worklet Integration

Chain logic lives entirely on the main thread. The worklet doesn't need to know about chains — it only receives pattern data via `sendPattern()`. Chain advancement is triggered by the existing `onStep` callback when track 0 wraps to step 0, similar to how `applyPendingSwitch` works.

```typescript
// In onStep callback, after applyPendingSwitch:
if (chain.active && heads[0] === 0 && prev0 !== 0) {
  advanceChain()
}
```

### Song Mode Unnecessary

Pattern chain replaces the need for a dedicated song mode because:
- Patterns can repeat N times → verse/chorus/bridge structure.
- Chain loops → full song playback.
- Manual override → live arrangement during performance.
- Combined with pattern randomize → generative song structures.

For more complex arrangements (tempo changes per section, per-pattern FX snapshots), those can be added as optional fields on `ChainEntry` in the future.

## Consequences

- **Positive:** Simple song arrangement without DAW complexity.
- **Positive:** Reuses existing pattern switch infrastructure.
- **Positive:** Chain data is lightweight — just an array of IDs and repeat counts.
- **Negative:** No per-pattern tempo changes (all patterns share the BPM of the active pattern).
- **Negative:** No parallel pattern playback (one pattern at a time).
- **Dependency:** Requires working pattern bank (ADR 004, already implemented).
