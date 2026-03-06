# ADR 055 — DockPanel Minimize & Sidebar Separation

| field   | value                              |
| ------- | ---------------------------------- |
| status  | proposed                           |
| date    | 2026-03-06                         |
| parent  | ADR 017 (Help Sidebar), ADR 054 (Overlay Sheet) |

## Context

With the overlay sheet model (ADR 054), the UI layout has fundamentally changed:

- SceneView is always the main view
- Pattern/FX/EQ are overlay sheets
- MatrixView is always visible (desktop)
- DockPanel (params) sits alongside the scene

Two problems remain:

### 1. DockPanel position toggle is obsolete

`btn-dock-pos` switches the dock between right and bottom. With the new layout, the dock is always to the right of the scene (desktop). The bottom position no longer makes sense since there's no full-width pattern editor to dock below. However, users still need a way to reclaim screen space for the scene canvas.

### 2. Sidebar (help/system) overlays DockPanel

The Sidebar component (`position: absolute; right: 0; top: 0; bottom: 0; z-index: 20`) renders inside `.view-area`, overlapping both the scene AND DockPanel. This creates a jarring layer violation — help/system content visually replaces the param knobs, even though they are unrelated concerns.

## Decision

### 1. DockPanel: Replace Position Toggle with Minimize

Remove `btn-dock-pos` and `toggleDockPosition`. Add a minimize toggle:

```
┌─ MatrixView ─┬─── SceneView ──────┬─ DockPanel ──┐
│              │                     │ [KK SN ─]    │
│  ■ □ ■      │  (scene canvas)     │  knobs...    │
│  □ ■ □      │                     │              │
└──────────────┴─────────────────────┴──────────────┘

┌─ MatrixView ─┬─── SceneView (wider) ──────────┬──┐
│              │                                  │[+]│
│  ■ □ ■      │  (scene canvas, more space)      │  │
│  □ ■ □      │                                  │  │
└──────────────┴──────────────────────────────────┴──┘
```

- **Minimized state**: DockPanel collapses to a thin strip (~24px) with an expand button
- **State**: `ui.dockMinimized: boolean` (default `false`)
- **Trigger**: Button in DockPanel header (replaces `btn-dock-pos`)
- Remove `ui.dockPosition` and related CSS for bottom layout

### 2. Sidebar: Right Drawer, Independent of DockPanel

Move Sidebar out of `.view-area` so it does not overlap scene or DockPanel. Render it as a right-edge drawer that slides over the entire app:

```
┌──────────────────────────────────┬─────────────┐
│ AppHeader                        │             │
├──────────────────────────────────┤   HELP      │
│ PerfBar                          │             │
├──────┬───────────────────┬──────┤  sections   │
│Matrix│ SceneView         │Dock  │             │
│      │                   │Panel │  GUIDE      │
│      │                   │      │  (hover tip)│
└──────┴───────────────────┴──────┴─────────────┘
```

- **Position**: `position: fixed; right: 0; top: 0; bottom: 0` — overlays the right edge of the app, not inside `.view-area`
- **z-index**: Above everything (z-index: 100+), including sheet overlays
- **Width**: 280px (unchanged)
- **Animation**: Keep existing slide-in/out (50ms)
- **No backdrop**: Grid/scene/dock remain interactive while sidebar is open (per ADR 017 Section H)
- **Collapse mode**: Keep guide-only collapse (per ADR 017 Section G)

### 3. Trigger Button Placement

Current triggers:
- `⚙` SYSTEM → AppHeader top-right
- `?` HELP → DockPanel bottom-right

With DockPanel minimizable, the `?` button needs a stable home:

- **`⚙` SYSTEM** → Keep in AppHeader (always visible)
- **`?` HELP** → Move to AppHeader (next to `⚙`), since DockPanel may be minimized

Both buttons always accessible regardless of dock state.

## Implementation Phases

### Phase 1: DockPanel Minimize

1. Replace `btn-dock-pos` with minimize toggle button
2. Add `ui.dockMinimized` state
3. Minimized dock: thin strip with expand button, no knobs rendered
4. Remove `ui.dockPosition`, `toggleDockPosition`, and bottom-dock CSS
5. CSS transition for width change

### Phase 2: Sidebar Separation

1. Move `<Sidebar />` from inside `.view-area` to top-level in `<div class="app">`
2. Change Sidebar CSS from `position: absolute` to `position: fixed`
3. Adjust z-index to sit above sheet overlays (z-index: 100+)
4. Move `?` help button from DockPanel to AppHeader

### Phase 3: Polish

1. Animate DockPanel minimize/expand (CSS transition on width)
2. Ensure keyboard shortcut for help (`?` key) still works
3. Test sidebar does not block DockPanel interaction when open

## Considerations

- **Mobile**: DockPanel uses bottom sheet on mobile — minimize may not apply. Sidebar on mobile is a future concern (ADR 017 Section I, ADR 054 mobile TODO)
- **Help content redesign** (ADR 034) is orthogonal — content structure can be updated independently inside the new drawer
- **DockPanel bottom layout removal**: Check if any existing presets or saved state references `dockPosition: 'bottom'` — need migration or silent fallback

## Extends

| ADR | Impact |
|-----|--------|
| 017 (Help Sidebar) | Sidebar moves from `.view-area` overlay to app-level fixed drawer |
| 034 (Help Redesign) | Unaffected — content changes apply inside the new drawer |
| 054 (Overlay Sheet) | DockPanel stays alongside sheets. Sidebar no longer conflicts |
