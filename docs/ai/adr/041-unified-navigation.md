# ADR 041: Unified Navigation — Merge SONG/PHRASE Modes

## Status: Proposed

## Context

### Current Problem

ADR 040 introduced hierarchical drill-down (Song → Chain → Phrase) and a two-mode system (`ui.mode: 'phrase' | 'song'`). However the dual-mode design has fundamental problems:

1. **Dual playback confusion**: `playback.playing` (phrase-level) and `songPlay.active` (song-level) are independent systems. Users must understand which one is active. This was a design failure — the two systems should be one.

2. **Mode toggle is redundant**: With drill-down navigation, SONG mode at `songNav.level === 'phrase'` and PHRASE mode both display the same StepGrid/TrackerView. The mode distinction adds cognitive overhead without value.

3. **`songForPlayback` is a hack**: It builds a fake `Song` object to bridge song-level playback to the engine. The engine should natively understand chains.

4. **`rowToPhraseSet` ignores chain structure**: It simply takes `chainIds[0]` — all the chain/phrase hierarchy from ADR 032 is bypassed during song playback.

### Current State

```
ui.mode: 'phrase' | 'song'          ← redundant mode toggle
ui.songNav.level: 'song' | 'chain' | 'phrase'  ← drill-down (song mode only)
ui.phraseView: 'grid' | 'tracker'
ui.activePhrases: number[8]         ← direct phrase selection (phrase mode only)

playback.playing                     ← phrase-level play/stop
songPlay.active                      ← song-level play/stop (independent)
songPlay.currentRow / repeatCount    ← song position
songPlay.playingPhraseSet            ← which phrase set is playing
```

PerfBar has SONG / PHRASE mode buttons. Users switch modes to access different workflows.

### Goal

Single navigation hierarchy. Single playback system. No mode switching. Open the app → you're at the top level (Song) → drill down to edit → press play and the whole song plays.

## Decision

### Remove `ui.mode` — Use `songNav.level` as the Single Navigation State

```typescript
// REMOVE: ui.mode ('phrase' | 'song')
// KEEP: ui.songNav.level as the sole navigation state

export const ui = $state({
  songNav: {
    level: 'song' as 'song' | 'chain' | 'phrase',
    trackId: 0,
    rowIndex: 0,
    chainId: 0,
    entryIndex: 0,
  },
  phraseView: 'grid' as 'grid' | 'tracker',  // kept for grid/tracker toggle
  activePhrases: [0, 0, 0, 0, 0, 0, 0, 0],   // kept for phrase-level editing
  // ...rest unchanged
})
```

Navigation is always: **Song View → Chain Editor → Phrase Editor** (drill-down/back).

### Remove PerfBar Mode Buttons

```
Before: [SONG] [PHRASE] + conditional [GRID | TRKR]
After:  [GRID | TRKR]   ← only shown at phrase level
```

The SONG/PHRASE toggle disappears. Users navigate via:
- Breadcrumb (always visible, click any level)
- Enter/Escape (drill down/back)
- Direct tap on Song grid cells

Top-level view is always Song View. To edit a phrase, drill down.

### View Resolution (Simplified)

| songNav.level | phraseView | Component |
|---------------|------------|-----------|
| `song` | — | SongView |
| `chain` | — | ChainEditor |
| `phrase` | `grid` | StepGrid |
| `phrase` | `tracker` | TrackerView |

### Unified Playback (Future — Phase 2+)

The playback unification is the larger change and will be done incrementally:

**Phase 1** removes the UI mode and simplifies navigation only. Playback continues with the existing dual system temporarily.

**Phase 2+** will:
- Remove `songPlay` as a separate state
- Always play through the song structure
- Empty song (no rows) → plays current `activePhrases` directly (equivalent to old phrase-mode playback)
- Song with rows → plays through rows/chains as before
- Single play/stop button, single playback state

This keeps the quick-start UX: open app → no song rows exist → play → hear the current phrase. Add song rows → play → hear the arrangement.

### Quick Access to Phrase Editing

Without PHRASE mode, users need a fast way to reach phrase editing:

1. **Double-click/Enter on Song cell** → drill to chain → drill to phrase (2 steps, but each is a single tap)
2. **Breadcrumb phrase-level shortcut**: At chain level, clicking the phrase name in the chain entry drills directly to phrase editing (already implemented in ChainEditor)
3. **Keyboard shortcut**: Number keys `1`–`8` at song level could jump directly to phrase editing for that track

### Breadcrumb Updates

The breadcrumb becomes always visible (not just in "song mode"):

```
Song level:    (no breadcrumb — we're at the top)
Chain level:   ◀ SONG > KICK · CHN 00
Phrase level:  ◀ SONG > KICK · CHN 00 > PHR 03
```

Mobile compact form unchanged.

## Implementation Phases

### Phase 1: Remove Mode Toggle (Navigation Only)

1. Remove `ui.mode` from state
2. Remove SONG/PHRASE buttons from PerfBar
3. Update App.svelte view routing to use only `songNav.level`
4. Show GRID/TRKR toggle only when `songNav.level === 'phrase'`
5. Update Breadcrumb: always show when level !== 'song' (remove `ui.mode === 'song'` check)
6. Remove Tab key mode-toggle shortcut
7. Default `songNav.level` to `'song'` on app start
8. Keep `activePhrases` + `phraseView` — these are still used at phrase level
9. Playback unchanged (dual system remains temporarily)

### Phase 2: Unify Playback

1. Merge `songPlay` into `playback`
2. Single play/stop: if song has rows, play through arrangement; if no rows, play `activePhrases`
3. Remove `songForPlayback` hack — engine plays chains natively
4. Remove `songToggle` function
5. Update App.svelte engine sync logic

### Phase 3: Engine Chain Support

1. Teach audio engine to resolve chain → phrase sequences
2. Remove phrase-set flattening
3. Support per-track chain playback (different chain lengths per track)

## Considerations

- **Phase 1 is safe**: Only UI routing changes, no playback logic touched. Easy to verify.
- **Backward compatibility**: No `ui.mode` in saved state (it's UI-only), so no migration needed.
- **Default view**: App opens to Song View. For new users with an empty song, this shows an empty grid — may need a "getting started" hint or auto-drill to phrase level when song is empty.
- **`activePhrases` still needed**: Even without mode toggle, we need to track which phrase each track is editing at phrase level. The drill-down sets this automatically via `drillToPhrase()`.
- **Relationship to ADR 040**: This simplifies ADR 040's design by removing the mode concept it introduced. The drill-down navigation and breadcrumb remain.

## Future Extensions

- **Auto-drill on empty song**: If song has no rows, skip Song View and show phrase editing directly
- **Scene launch**: Click a song row to launch it immediately (Ableton Session View style)
- **Split view**: Desktop shows Song grid + phrase editor side by side
- **Pattern follow**: Auto-drill to the currently-playing phrase during song playback
