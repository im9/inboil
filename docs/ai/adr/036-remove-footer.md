# ADR 036: Remove Footer / Relocate Parameter Panel

## Status: Proposed

## Context

The current layout has a persistent footer area at the bottom of the screen (desktop: `ParamPanel`, mobile: `MobileParamFooter` drawer).

**Current problems:**

1. **Desktop**: The footer is fixed at the very bottom of the window, causing frequent accidental window resizing when users touch the window edge
2. **Mobile**: The footer drawer is collapsed by default, so many users never discover the parameter editing features
3. **Usability**: All parameter knobs are crammed into a single horizontal row, requiring horizontal scrolling even on desktop

**Current footer features:**

Desktop (`ParamPanel.svelte`):
- Track name display (SplitFlap)
- LOCK button + Step indicator + CLR
- Synth parameter knobs
- Send knobs (VERB, DLY, GLT, GRN)
- Mixer knobs (VOL, PAN)
- Help button (?)

Mobile (`MobileTrackView.svelte` drawer + `MobileParamFooter.svelte`):
- Drawer handle (open/close toggle)
- Lock toolbar (LOCK, Step indicator, CLR, MUTE)
- Tabbed parameter knobs (MIX, SYNTH, FX)

**StepGrid whitespace:**

The current `StepGrid` uses fixed-width steps at `24px` + `2px` gap (`StepGrid.svelte:350`). `.steps` has `flex: 1` taking all remaining width. With 16 steps this only uses ~416px, leaving a large empty area on the right side of a 1200px screen.

## Decision

Desktop and mobile take different approaches.

### Desktop: Dockable Panel (Right or Bottom)

Replace both the footer (`ParamPanel`) and the sidebar (`Sidebar.svelte`) with a single **dockable panel** that the user can position to the right or bottom of the view area. Inspired by Chrome DevTools dock positions, but limited to two options: right (default) and bottom.

Currently the Sidebar (`Sidebar.svelte`) occupies `position: absolute; right: 0; width: 280px` within `view-area` — the exact same region the new parameter panel would use. Rather than having two panels compete for the same space, unify them into one component with tab-based content switching.

```
Desktop — dock right (default):
┌────────────────────────────────────────────────┐
│ AppHeader                                      │
├────────────────────────────────────────────────┤
│ PerfBar                                        │
├────────────────────────────────────────────────┤
│ Label M Steps (...) │ Panel [⊏⊐ ⊑⊒]          │
│ BD01 M ■■□□■■□□■■□□ │ ┌PARAM┬HELP┬SYS───────┐│
│ VEL   ▮▮  ▮▮  ▮▮  ▮▮ │ │ BD01  [LOCK] [CLR]  ││
│ SD02 M □□■□□□■□□□■□ │ │                      ││
│ ...                  │ │ ○DCY ○TNE ○SNP      ││
│                      │ │ ○ATK ○REL ○BIT      ││
│                      │ │───────────────────── ││
│                      │ │ ○VRB ○DLY ○GLT ○GRN ││
│                      │ │ ○VOL ○PAN            ││
│                      │ └──────────────────────┘│
└────────────────────────────────────────────────┘

Desktop — dock bottom:
┌────────────────────────────────────────────────┐
│ AppHeader                                      │
├────────────────────────────────────────────────┤
│ PerfBar                                        │
├────────────────────────────────────────────────┤
│ Label M Steps                                  │
│ BD01 M ■■□□■■□□■■□□■■□□■■□□■■□□■■□□            │
│ VEL   ▮▮  ▮▮  ▮▮  ▮▮  ▮▮  ▮▮  ▮▮  ▮▮          │
│ ...                                            │
├────────────────────────────────────────────────┤
│ Panel [⊏⊐ ⊑⊒]  PARAM┬HELP┬SYS                │
│ BD01 [LOCK][CLR]  ○DCY ○TNE ○SNP  ○VRB ○DLY  │
│                   ○ATK ○REL ○BIT  ○GLT ○GRN   │
└────────────────────────────────────────────────┘
```

`[⊏⊐ ⊑⊒]` = dock position toggle (right / bottom)

#### Panel Tabs

| Tab | Content | Replaces |
|-----|---------|----------|
| **PARAM** | Synth knobs, Send, Mixer, LOCK/CLR for selected track | `ParamPanel.svelte` |
| **HELP** | Collapsible help sections + hover guide | `Sidebar.svelte` (help mode) |
| **SYS** | Scale mode, language, factory reset | `Sidebar.svelte` (system mode) |

This replaces both `ParamPanel.svelte` and `Sidebar.svelte` with a single component.

#### Responsive Step Display

- The panel and step area share the available width (right dock) or height (bottom dock)
- Visible step count is auto-calculated: `floor(stepAreaWidth / 26)` (each step = 24px + 2px gap)
- When a track's step count exceeds the visible count, overflow steps are shown as compact indicators (dots or mini-bars), or via page switching
- Resizing the panel dynamically adjusts the visible step count
- Bottom dock allows full-width step display (all steps visible), at the cost of vertical space

#### Dock Behavior

- **Right dock** (default): Panel sits alongside StepGrid within `view-area` (`display: flex`). Multi-row knob layout. Default width ~280px.
- **Bottom dock**: Panel sits below the view content, similar to current footer but unified. Horizontal knob row with more space than the old `ParamPanel`. Full-width step grid above.
- User preference is persisted in `localStorage`
- Panel is always visible (no open/close action required)

### Mobile: Overlay Approach

Mobile screens are too narrow for a side panel. Use an overlay within the view-area instead.

```
Mobile (proposed):
┌────────────────────┐
│ AppHeader (compact) │
├────────────────────┤
│ PerfBar            │
├────────────────────┤
│ TrackView          │
│                    │
│ ┌ParamOverlay────┐ │
│ │MIX SYNTH FX   │ │
│ │ ○  ○  ○  ○    │ │
│ │[LOCK] [MUTE]  │ │
│ └────────────────┘ │
└────────────────────┘
```

- Track name tap to toggle (replaces current drawer handle)
- Semi-transparent backdrop-blur background
- Tab switching: MIX / SYNTH / FX (same approach as existing `MobileParamFooter`)
- Swipe down to dismiss

### Footer Area

Remove entirely. The dockable panel subsumes both the footer and the sidebar, so there is no separate footer element. When the user docks to the bottom, the panel visually occupies the footer position but is the same unified component. May be revived in the future for passive information display (StatusBar, etc.), but that is out of scope for this ADR.

### LOCK / MUTE / Help Relocation

- LOCK button: Desktop dockable panel (PARAM tab) / Mobile ParamOverlay
- MUTE button: Already exists in each StepGrid track row (`StepGrid.svelte:152`), simply remove from footer
- Help button: No longer needed as a standalone button — Help is a tab within the dockable panel. On mobile, accessible via the overlay or a header button.

### Implementation Phases

**Phase 1**: Dockable panel component (right dock)
- Create unified panel with PARAM / HELP / SYS tabs
- Port knob logic from `ParamPanel.svelte` into PARAM tab
- Port help/system content from `Sidebar.svelte` into HELP / SYS tabs
- Implement responsive step display (auto-calculated visible count)

**Phase 2**: Bottom dock support
- Add dock position toggle (right / bottom)
- Adapt knob layout for horizontal orientation
- Persist dock preference in `localStorage`

**Phase 3**: Mobile ParamOverlay
- Convert `MobileParamFooter` to overlay
- Remove drawer handle, open/close via track name tap
- Implement swipe gesture

**Phase 4**: Cleanup
- Remove `ParamPanel.svelte`, `Sidebar.svelte`, `MobileParamFooter.svelte`
- Remove drawer-related code from `MobileTrackView.svelte`
- Remove sidebar references from `App.svelte`

## Considerations

- **Overflow step interaction**: Users with 32 or 64 steps will want to interact with steps beyond the visible area → need click-to-page-switch on the indicator section
- **Right dock minimum width**: On narrow screens (640–900px) the right dock becomes cramped → add a breakpoint to fall back to mobile overlay approach, or auto-switch to bottom dock
- **Panel default width**: How to determine initial width → default to ~280px (fits 3–4 knob columns), adjustable via resize
- **Sidebar unification trade-off**: Currently Help/System sidebar can overlay the view without affecting layout. In the unified panel, switching to HELP tab hides the PARAM tab. Users who want to read help while tweaking knobs would lose that ability → consider allowing the hover guide to work regardless of active tab
- **Existing ADR alignment**: ADR 033 (Mobile Velocity Editing) — no conflict, velocity editing happens on the step buttons themselves. ADR 034 (Help Redesign) — help content moves into the HELP tab of the unified panel; 034 should be updated to reflect this
- **Non-StepGrid views**: The dockable panel applies to StepGrid view. ChainView will likely need its own sidebar for chain-specific purposes — to be addressed in a future ChainView UI redesign, not in this ADR

## Future Extensions

- Panel resize (drag to adjust width/height depending on dock position)
- Parameter automation drawing integrated into the panel
- Revive footer area as StatusBar / Guide (e.g., contextual help, operation guides, tutorial hints)
