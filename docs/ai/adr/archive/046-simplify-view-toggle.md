# ADR 046 — Simplify View Toggle

| field   | value                              |
| ------- | ---------------------------------- |
| status  | implemented                        |
| date    | 2025-03-05                         |
| parent  | ADR 045 (Decouple Playback)        |

## Context

PerfBar has three view buttons: GRID / TRKR / SCENE. However, GRID and TRKR are
both "pattern editors" — they show the same data in different visual formats.
Having three buttons creates problems:

1. **Unnecessary cognitive load** — the user's real choice is "edit a pattern" or
   "arrange scenes", not a three-way decision.
2. **Grid vs Tracker is a preference** — users rarely switch mid-session; it
   depends on personal workflow style.
3. **Wastes space on mobile** — three tabs + scene mode toggle crowd the bar.

### Current code

```
state.svelte.ts:300
  phraseView: 'grid' as 'grid' | 'tracker' | 'scene'
```

PerfBar.svelte: GRID / TRKR / SCENE buttons (lines 220–248)
App.svelte: three-branch rendering on `phraseView` (lines 157–183)

## Decision

Simplify the view toggle to **PAT | SCENE** (two buttons). Grid vs Tracker is
controlled by a system setting in the SYS tab.

### State changes

```ts
// state.svelte.ts

// Before
ui.phraseView: 'grid' | 'tracker' | 'scene'

// After
ui.phraseView: 'pattern' | 'scene'
prefs.patternEditor: 'grid' | 'tracker'  // persisted to localStorage
```

Add `patternEditor` to `StoredPrefs` and persist via `savePrefs()` / `loadPrefs()`:

```ts
interface StoredPrefs {
  v: number
  lang: Lang
  visited: boolean
  scaleMode: boolean
  dockPosition: 'right' | 'bottom'
  patternEditor: 'grid' | 'tracker'  // NEW
}
```

Default is `'grid'` (no impact on existing users).

### PerfBar view toggle

```
Before:  [GRID] [TRKR] [SCENE] (●)
After:   [PAT]  [SCENE] (●)
```

- **PAT** — `ui.phraseView = 'pattern'` (renders Grid or Tracker)
- **SCENE** — `ui.phraseView = 'scene'`
- **(●)** — scene playback mode toggle (ADR 045, unchanged)

### App.svelte rendering

```ts
// Before
{#if ui.phraseView === 'tracker'}
  <TrackerView />
{:else if ui.phraseView === 'scene'}
  <SceneView />
{:else}
  <StepGrid />          // mobile: <MobileTrackView />
{/if}

// After
{#if ui.phraseView === 'scene'}
  <SceneView />
{:else if prefs.patternEditor === 'tracker'}
  <TrackerView />
{:else}
  <StepGrid />          // mobile: <MobileTrackView />
{/if}
```

### DockPanel SYS tab

Added between SCALE MODE and LANGUAGE:

```
┌─────────────────────────┐
│ SYSTEM               ✕  │
├─────────────────────────┤
│ SCALE MODE    [ON]      │
│ EDITOR        [GRID]    │  ← NEW: toggle between GRID / TRKR
│ LANGUAGE      [JP]      │
│ ABOUT   inboil v0.1.0   │
├─────────────────────────┤
│ RESET         [RESET]   │
└─────────────────────────┘
```

Clicking the button toggles `prefs.patternEditor` between `'grid'` and
`'tracker'`. Changes apply immediately when `ui.phraseView === 'pattern'`.

### Migration

Map old `phraseView` values:

| old value   | new value                                              |
|-------------|--------------------------------------------------------|
| `'grid'`    | `phraseView = 'pattern'`, `patternEditor = 'grid'`    |
| `'tracker'` | `phraseView = 'pattern'`, `patternEditor = 'tracker'` |
| `'scene'`   | `phraseView = 'scene'`                                 |

`phraseView` is runtime-only state (not persisted to localStorage), so just
changing the default to `'pattern'` is sufficient.

### Affected files

| file | change |
|------|--------|
| `state.svelte.ts` | `phraseView` type change, add `prefs.patternEditor`, update `StoredPrefs` |
| `App.svelte` | Two-stage rendering, update `play()` auto-engage guard |
| `PerfBar.svelte` | GRID/TRKR → single PAT button |
| `DockPanel.svelte` | Add EDITOR toggle in SYS tab |
| `SectionNav.svelte` | Update `phraseView` toggle value |
| `MatrixView.svelte` | `phraseView === 'scene'` checks — unchanged |
| `SceneView.svelte` | `phraseView === 'scene'` checks — unchanged |

### `phraseView` reference migration

- `ui.phraseView === 'grid'` → `ui.phraseView === 'pattern' && prefs.patternEditor === 'grid'` (only if needed)
- `ui.phraseView === 'tracker'` → `ui.phraseView === 'pattern' && prefs.patternEditor === 'tracker'` (only if needed)
- `ui.phraseView === 'scene'` → unchanged
- `ui.phraseView !== 'scene'` → unchanged

In practice, most code only checks whether the view is `'scene'` or not, so
minimal changes are needed.

## Considerations

- **No instant Grid ↔ Tracker switch?** — Requires opening SYS tab, but
  mid-session switching is rare. Keyboard shortcuts can be added later.
- **Mobile SYS access is cumbersome** — MobileParamOverlay has a settings path,
  and the preference only needs to be set once.
- **Future keyboard shortcuts** — `G` for Grid, `T` for Tracker could provide
  direct switching without affecting `playback.mode` (ADR 045).

## Future Extensions

- Keyboard shortcuts for instant Grid ↔ Tracker switching
- Swipe gestures for PAT ↔ SCENE on mobile
- PianoRoll as a third pattern editor option
  (`prefs.patternEditor: 'grid' | 'tracker' | 'pianoroll'`)
