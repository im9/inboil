# ADR 047 — FX / EQ as Main Views

| field   | value                              |
| ------- | ---------------------------------- |
| status  | implemented                        |
| date    | 2026-03-05                         |
| parent  | ADR 046 (Simplify View Toggle)     |

## Context

FxPad and FilterView are currently rendered inside DockPanel as tabs (`'fx'` and
`'eq'`). This creates three problems:

1. **Cramped space** — DockPanel is 280px wide. Both components use Canvas 2D
   (FxPad) or WebGL2 + Canvas 2D (FilterView) for audio-reactive visualization.
   Their interaction surface (draggable nodes, spectrum display) benefits from
   full view-main space.
2. **Render cost** — Both components run `requestAnimationFrame` loops for
   visualization. Hiding them in a narrow panel wastes GPU cycles on small
   canvases or forces pausing when not on-tab.
3. **Conceptual mismatch** — FX and EQ are global audio bus controls, not
   per-track parameters. Grouping them with per-track PARAM in DockPanel
   conflates two levels of control. Hardware grooveboxes (Elektron, SP-404)
   treat FX as a dedicated page/mode, not a sidebar tab.

### Current code

```
DockPanel.svelte:138  ['param', 'fx', 'eq', 'help', 'sys']
DockPanel.svelte:248  {:else if ui.dockTab === 'fx'}  → <FxPad />
DockPanel.svelte:258  {:else if ui.dockTab === 'eq'}  → <FilterView />
```

FxPad animation guard: `if (ui.dockTab === 'fx') startVis()` (line 476)
FilterView animation guard: `if (ui.dockTab === 'eq') startVis()` (line 475)

PerfBar view toggle: `[PAT] [SCENE] (●)`

## Decision

Move FxPad and FilterView out of DockPanel into view-main as first-class views.
Add FX and EQ buttons to the PerfBar view toggle.

### State changes

```ts
// state.svelte.ts

// Before
ui.phraseView: 'pattern' | 'scene'
ui.dockTab: 'param' | 'fx' | 'eq' | 'help' | 'sys'

// After
ui.phraseView: 'pattern' | 'scene' | 'fx' | 'eq'
ui.dockTab: 'param' | 'help' | 'sys'
```

No new persisted preferences. `phraseView` is runtime-only state.

### PerfBar view toggle

```
Before:  [PAT]  [SCENE] (●)
After:   [PAT]  [SCENE] (●)  |  [FX]  [EQ]
```

- **PAT** / **SCENE** — editing/arrangement views (left group)
- **FX** — `ui.phraseView = 'fx'` (renders FxPad in view-main)
- **EQ** — `ui.phraseView = 'eq'` (renders FilterView in view-main)
- **(●)** — scene playback mode toggle (unchanged)

The separator between SCENE and FX visually groups editing views apart from
performance/mix views, matching hardware groovebox conventions.

### App.svelte rendering

```svelte
<!-- Desktop -->
{#if ui.phraseView === 'scene'}
  <SceneView />
{:else if ui.phraseView === 'fx'}
  <FxPad />
{:else if ui.phraseView === 'eq'}
  <FilterView />
{:else if prefs.patternEditor === 'tracker'}
  <TrackerView />
{:else}
  <StepGrid />
{/if}

<!-- Mobile -->
{#if ui.phraseView === 'scene'}
  <SceneView />
{:else if ui.phraseView === 'fx'}
  <FxPad />
{:else if ui.phraseView === 'eq'}
  <FilterView />
{:else if prefs.patternEditor === 'tracker'}
  <TrackerView />
{:else}
  <MobileTrackView />
{/if}
```

### FxPad / FilterView animation guard

```ts
// Before
if (ui.dockTab === 'fx') startVis()

// After
if (ui.phraseView === 'fx') startVis()
```

Same for FilterView (`'eq'`).

### DockPanel changes

Remove `'fx'` and `'eq'` from the tab array and conditional rendering:

```ts
// Before
['param', 'fx', 'eq', 'help', 'sys']

// After
['param', 'help', 'sys']
```

Remove the `FxPad` and `FilterView` imports, the `dock-fx` container divs, and
the associated `{:else if}` branches.

DockPanel remains visible alongside FX/EQ views (showing PARAM knobs while
adjusting FX is useful).

### MatrixView visibility

MatrixView (pattern pool sidebar) is only relevant for pattern/scene views:

```svelte
{#if ui.phraseView === 'pattern' || ui.phraseView === 'scene'}
  <MatrixView />
{/if}
```

When in FX or EQ view, MatrixView is hidden to give the full-width canvas to
the visualization.

### Mobile layout

FX/EQ buttons appear in the PerfBar mobile tab row alongside PAT and SCENE.
FxPad and FilterView render full-screen in the view-area, same as SceneView
does on mobile.

### Affected files

| file | change |
|------|--------|
| `state.svelte.ts` | Expand `phraseView` type, narrow `dockTab` type |
| `App.svelte` | Add FxPad/FilterView rendering branches, import components |
| `PerfBar.svelte` | Add FX/EQ buttons to view toggle |
| `DockPanel.svelte` | Remove FX/EQ tabs and rendering, remove FxPad/FilterView imports |
| `FxPad.svelte` | Change animation guard from `dockTab` to `phraseView` |
| `FilterView.svelte` | Change animation guard from `dockTab` to `phraseView` |

## Considerations

- **DockPanel still visible in FX/EQ view?** — Yes. PARAM knobs alongside the
  FX pad lets users tweak send levels while dragging FX nodes. Only MatrixView
  hides.
- **Mobile FX/EQ access improves** — Currently unreachable on mobile (DockPanel
  is desktop-only). Now accessible via the same PerfBar tabs as PAT/SCENE.
- **4 view buttons on mobile** — PAT / SCENE / FX / EQ. Four buttons is
  manageable and consistent with hardware layouts.
- **Auto-engage guard** — The `play()` auto-engage condition checks
  `ui.phraseView === 'scene'`. FX/EQ views do not auto-engage scene mode
  (correct: user is adjusting mix, not starting arrangement).

## Future Extensions

- Dedicated mobile FX gestures (e.g. full-screen XY pad with swipe navigation)
- FX preset system (save/recall FX node positions)
- Combined FX+EQ single-page view for master bus overview (ADR 035)
