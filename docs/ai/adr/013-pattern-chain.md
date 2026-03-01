# ADR 013: Pattern Chain

## Status: IMPLEMENTED

## Context

Users need a way to arrange patterns into a song structure. A traditional "Song mode" with a separate timeline editor adds significant complexity. Pattern chaining offers a simpler alternative: define an ordered list of patterns that play sequentially, looping at the end. This covers the primary use case (arranging a track) without a full DAW-style arrangement view.

## Implemented Design

### Data Model

```typescript
interface ChainFx {
  on: boolean
  x: number   // send amount / param X (0–1)
  y: number   // param Y (0–1)
}

interface ChainEntry {
  patternId: number       // 1-based pattern ID
  repeats: number         // how many times to loop before advancing (1–8)
  key: number | null      // 0–11 override root note, null = use pattern default
  perf: number            // 0=NONE, 1=FILL, 2=BRK, 3=REV
  perfLen: number         // steps (1/4/8/16) — perf activates for last N steps of last repeat
  verb: ChainFx
  delay: ChainFx
  glitch: ChainFx
  granular: ChainFx
}

interface Chain {
  entries: ChainEntry[]   // ordered list, max 99 entries
  active: boolean         // chain mode on/off
  currentIndex: number    // current entry position
  repeatCount: number     // loops completed for current entry
  playingPatternId: number // pattern currently playing (independent of editing)
}
```

### Playback Behavior

1. **Chain OFF (default):** Single pattern loops forever.
2. **Chain ON:**
   - Sequencer plays `entries[currentIndex]` for `repeats` loops, then auto-advances.
   - At end of chain, loops back to `entries[0]`.
   - Pattern switch happens at bar boundary via `advanceChain()`.
   - **FX/key** applied on entry advance via `applyChainEntry()`.
   - **Perf** (FILL/BRK/REV) checked every step via `updateChainPerf(step)`:
     - Only activates on **last repeat** (`repeatCount >= repeats - 1`)
     - Only for the **last N steps** (`step >= 16 - perfLen`)
     - Returns boolean to trigger pattern resend only when state changes
   - Chain is independent of editing — uses `getPatternData(id)` from `patternBank[]`.
   - ON/OFF preserves position — resume from where you stopped.

3. **Navigation:**
   - `chainJump(index)`: Jump to any entry (tap row number).
   - `chainRewind()`: Return to first entry.
   - Both work during playback and while stopped.

### Chain Editor UI (ChainView)

Full-screen view accessible via PerfBar view toggle (`ui.view = 'chain'`).

**Header:**
```
CHAIN [ON/OFF] [⏮] ────── 03/08 [+ ADD] [CLR]
```
- SplitFlap position display (current/total)
- Rewind button (⏮) — jump to entry 01
- + ADD appends current editing pattern
- CLR removes all entries

**Entry row (single line):**
```
► ◀04|LOFI▶ C ◀×4▶ ●●○○ [VRB🎛][DLY🎛][GLT🎛][GRN🎛] [BRK][¼] [×]
```
- Row marker (number / ► arrow) — tap to jump
- Pattern nav (◀ ID|NAME ▶)
- KEY button (--- / C / C# / ... / B) — tap to cycle
- Repeats (◀ ×N ▶) with progress dots during playback
- FX nodes: toggle button + compact Knob (20px) per effect
  - VRB (olive), DLY (blue), GLT (salmon), GRN (purple)
- PERF button: cycles NONE → FILL → BRK → REV
- PERF LEN button: cycles BAR → ½ → ¼ → 1S (16/8/4/1 steps)
  - Disabled (---) when PERF is NONE, for consistent layout
- Delete button (×)

**Empty state:**
- Shows preset buttons (currently: LOFI)
- Pre-populated with LOFI preset on app init

**Colors:**
- FILL: `--color-olive`
- BRK: `--color-salmon`
- REV: `--color-blue`
- FX nodes match FxPad colors

**All elements have `data-tip` / `data-tip-ja` for hover guide integration.**

### Chain Presets

Factory presets defined in `CHAIN_PRESETS[]`. Each preset uses `makeChainEntry()` helper with options for key, perf, perfLen, FX toggles, and delaySend override.

Current preset: **LOFI** — 8-entry song structure using LOFI (pattern 05) and LF.B (pattern 20) with progressive FX buildup, key modulation (→C, →Em), and perf effects (BRK ¼, FILL ½).

### Worklet Integration

Chain logic lives entirely on the main thread. The worklet receives pattern data via `sendPattern()`. Chain advancement is triggered by the `onStep` callback when track 0 wraps to step 0. Mid-bar perf activation sends pattern data on the specific step where perf state changes.

```typescript
// In onStep callback:
engine.onStep = (heads) => {
  // Bar boundary: advance chain + apply FX/key
  if (heads[0] === 0 && prev0 !== 0) {
    const advanced = advanceChain()
    if (chain.active && advanced) {
      applyChainEntry(chain.entries[chain.currentIndex])
    }
    updateChainPerf(heads[0])
    sendPattern(...)
    chainSent = true
  }
  // Every step: check for mid-bar perf activation
  if (!chainSent && chain.active) {
    const changed = updateChainPerf(heads[0])
    if (changed) sendPattern(...)
  }
}
```

## Consequences

- **Positive:** Simple song arrangement without DAW complexity.
- **Positive:** Reuses existing pattern switch infrastructure.
- **Positive:** Per-entry FX, key, and perf with step-level timing control.
- **Positive:** Position preservation allows stop/resume workflow.
- **Positive:** Factory presets demonstrate song structure out of the box.
- **Negative:** No per-pattern tempo changes (all patterns share BPM).
- **Negative:** No parallel pattern playback (one pattern at a time).
- **Dependency:** Requires working pattern bank (ADR 004, already implemented).
