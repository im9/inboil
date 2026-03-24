# ADR 057: Pattern Toolbar — Move RAND, KEY, VKBD into Pattern Sheet

## Status: Implemented

## Context

RAND, KEY (root note + octave), and VKBD (virtual keyboard) are currently placed in the global AppHeader and PerfBar. However, these controls are only useful during pattern editing:

- **RAND** — randomizes the current pattern's content
- **KEY** — sets root note for transposition, but scene playback resets `perf.rootNote` on every pattern switch via `sendPatternByIndex()`, making the PerfBar KEY effectively useless during scene playback
- **VKBD** — auditions notes on the selected track, only relevant when editing steps

For live key/transpose changes during scene playback, the correct tool is the **transpose node** in the scene. Having KEY in PerfBar creates the false impression it persists across scene transitions.

### Current Location

```
AppHeader:  [INBOIL] [−120+BPM] [▶ ■ RAND] [PROJECT_NAME] [? ⚙]
PerfBar:    [KEY piano ▲OCT▼] | [GAIN SWG] | [FX EQ MST] | [FILL REV BRK] | [VKBD]
```

RAND lives in AppHeader's transport group (desktop) and mobile transport.
KEY + OCT occupy the first group of PerfBar (~300px on desktop, fan-out overlay on mobile).
VKBD is at the end of PerfBar (desktop only, hidden on mobile).

## Decision

### A. New Pattern Toolbar

Move RAND, KEY+OCT, and VKBD into a **toolbar row inside the pattern overlay sheet**, between the sheet handle and the editor content.

```
Pattern Sheet (desktop & mobile)
┌──────────────────────────────────────────────────────┐
│  ═══ handle bar ═══                                  │ ← close sheet
│  [KEY: C D E F G A B] [▲OCT▼] │ [RND] │ [⌨ VKBD]  │ ← NEW toolbar
│  ┌──────────────────────────────────────────────────┐│
│  │  StepGrid / TrackerView / MobileTrackView        ││
│  │  (pattern editor content)                        ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

The toolbar is only visible when the pattern sheet is open (`ui.patternSheet === true` with pattern editor active). It does **not** appear for FX/EQ/MST overlay sheets.

### B. Remove from Current Locations

**AppHeader**: Remove RAND button from both desktop transport and mobile `transport-center`. Transport becomes `[▶ ■]` only.

**PerfBar**: Remove KEY group (piano keyboard, oct-block, key-menu, key-arc-overlay) and VKBD group. PerfBar simplifies to:

```
PerfBar (after):  [GAIN SWG] | [FX EQ MST] | [FILL REV BRK]
```

On mobile, PerfBar becomes the view toggle tabs + GAIN/SWG knobs only. The mobile KEY fan-out overlay (`key-arc-overlay`) moves into the pattern sheet toolbar.

### C. PatternToolbar Component

Extract a new `PatternToolbar.svelte` component containing:

```typescript
// PatternToolbar.svelte
// Props: onRandom (callback)
// Reads: perf.rootNote, perf.octave, vkbd.enabled, vkbd.octave
// Contains: KEY piano, OCT ▲▼, RAND button, VKBD toggle + info
```

This component is rendered inside the pattern sheet in `App.svelte`:

```svelte
<div class="pattern-sheet" transition:fly={{ y: 12, duration: 100 }}>
  <div class="sheet-handle" onpointerdown={closeAllSheets}>
    <span class="handle-bar"></span>
  </div>
  {#if ui.patternSheet}
    <PatternToolbar onRandom={randomizePattern} />
  {/if}
  {#if prefs.patternEditor === 'tracker'}
    <TrackerView />
  {:else}
    <StepGrid />
  {/if}
</div>
```

### D. Mobile Layout

On mobile, the toolbar compacts to match existing mobile patterns:

```
┌─────────────────────────────────────────┐
│  ═══ handle ═══                         │
│  [C●] [▲▼] │ [RND]                     │ ← compact: key-menu-trigger + oct-mini + RND
│  ┌─────────────────────────────────────┐│
│  │  MobileTrackView / TrackerView      ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

The KEY fan-out overlay (arc of piano keys) is triggered from within the pattern toolbar, same as current PerfBar mobile behavior. VKBD toggle is hidden on mobile (no PC keyboard).

### E. State Changes

No state model changes needed. `perf.rootNote`, `perf.octave`, and `vkbd` state remain global — only their UI controls move.

## Implementation Steps

1. Create `PatternToolbar.svelte` — extract KEY/OCT/RAND/VKBD from PerfBar and AppHeader
2. Render `PatternToolbar` inside pattern sheet in `App.svelte` (both mobile and desktop branches)
3. Remove RAND from `AppHeader.svelte` (desktop transport + mobile transport-center)
4. Remove KEY group, VKBD group, and mobile key-arc-overlay from `PerfBar.svelte`
5. Remove `onRandom` prop from `PerfBar` (no longer needed)
6. Adjust PerfBar layout after removal (less content, may simplify mobile flex-wrap)
7. Update `ui-design.md` docs to reflect new locations

## Considerations

- **Sheet must be open to randomize**: RAND moves from always-visible header to sheet-only. This is intentional — randomizing without seeing the pattern is rarely useful. If needed, a keyboard shortcut (e.g., `R`) could trigger randomize regardless of sheet state.
- **KEY during non-sheet playback**: If a user plays a single pattern (not scene mode) without opening the sheet, they lose quick KEY access. This is acceptable — scene transpose node is the proper tool for live key changes, and single-pattern playback is primarily a preview/editing workflow.
- **PerfBar becomes very slim**: After removal, PerfBar has only GAIN, SWG, FX/EQ/MST toggles, and FILL/REV/BRK. Consider whether PerfBar should merge into AppHeader in a future ADR.
- **VKBD keyboard listeners**: The `window.addEventListener('keydown')` for VKBD currently lives in PerfBar's `$effect`. This logic moves to PatternToolbar but still registers globally on `window` — works the same regardless of component location.

## Future Extensions

- Merge slimmed PerfBar into AppHeader (single dark bar)
- Pattern-local KEY/OCT (store rootNote per pattern instead of global perf)
- Inline RAND options (density slider, drum-only/melodic-only randomize)
