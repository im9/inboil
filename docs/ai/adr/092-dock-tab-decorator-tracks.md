# ADR 092: DockPanel Tab — Decorators & Track Params in One Place

## Status: Proposed

## Context

ADR 069 added a decorator editing section to DockPanel, visible when a pattern node is selected in SceneView. Track parameters are visible when the pattern sheet (step sequencer) is open. The problem: **you can never see both at the same time.**

Current visibility logic:
- Decorator section → SceneView active, pattern node selected, no sheet open
- Track params → pattern sheet open

This means editing a decorator's transpose while checking a track's voice parameters requires closing the sheet, selecting the node, tweaking, reopening the sheet — back and forth. For any non-trivial sound design work involving decorators, this is unacceptably tedious.

### Why this matters

Decorators (transpose, tempo, repeat, FX, automation) modify the pattern as a whole. Track parameters (voice, volume, send, presets) control individual sounds. These are complementary — users frequently need both to shape a pattern's behavior. Forcing a view-switch between them breaks flow.

Additionally, decorators remain hard to discover. They only appear when a pattern node is selected in SceneView with no sheet open — a narrow condition most users won't stumble into.

## Decision

### Tab switcher in DockPanel

Add a two-tab switcher to DockPanel when a pattern sheet is open:

```
┌─────────────────────────────┐
│ Pattern A1                  │
│ [TRACKS] [DECO]             │  ← tab bar, above track list
│─────────────────────────────│
│                             │
│  (tab content)              │
│                             │
└─────────────────────────────┘
```

- **TRACKS tab** (default): existing track parameter UI (voice, knobs, presets, send, mixer)
- **DECO tab**: decorator list + editor (same UI as current ADR 069 section)

The tab bar appears only when the pattern sheet is open. When no sheet is open and a scene node is selected, the current behavior remains (decorator section shows directly, no tabs needed).

### Tab bar design

```
┌──────────┬──────────┐
│  TRACKS  │   DECO   │
└──────────┴──────────┘
```

- Position: below the pattern name header, above content
- Pattern-level concern (decorators affect all tracks) → tab sits above the track selector row
- Active tab uses the pattern's color accent; inactive tab is dimmed
- Badge on DECO tab showing decorator count (e.g. `DECO ²`) when decorators exist — aids discoverability
- Keyboard shortcut: `Tab` to toggle when DockPanel is focused (or a dedicated key)

### DECO tab content

Same as the current ADR 069 decorator section, now accessible from within the pattern sheet:

```
┌─────────────────────────────┐
│ Pattern A1                  │
│ [TRACKS] [DECO ²]           │
│─────────────────────────────│
│ DECORATORS        [+ Add ▾] │
│ ┌─────────────────────────┐ │
│ │ TRANSPOSE         [×]   │ │
│ │ [REL|ABS]  ◎ +5 semi    │ │
│ ├─────────────────────────┤ │
│ │ FX                 [×]   │ │
│ │ [VRB] [DLY] [GLT] [GRN] │ │
│ └─────────────────────────┘ │
│                             │
│ No decorators yet?          │
│ Add one to modify playback  │  ← empty state hint
│ behavior for this pattern.  │
└─────────────────────────────┘
```

- `[+ Add ▾]` dropdown: Transpose, Tempo, Repeat, FX, Automation
- Each decorator card: full-size Knob/toggle controls, `×` to remove
- Empty state: brief explanation text (helps discoverability)
- Scrollable if many decorators

### State changes

```typescript
// added to ui
dockTab: 'tracks' | 'deco'  // default: 'tracks', reset on pattern change
```

- Persisted per session (not to localStorage — resets on reload is fine)
- Reset to `'tracks'` when `ui.currentPattern` changes (user expects to see the new pattern's tracks first)
- When adding a decorator via the `[+ Add ▾]` menu, auto-switch to `'deco'` tab

### Visibility logic (updated)

```
Pattern sheet open?
├── Yes → Show tab bar [TRACKS | DECO]
│   ├── TRACKS tab → existing track params
│   └── DECO tab → decorator editor (for current pattern's scene node)
└── No
    ├── Scene pattern node selected → decorator section (no tabs, same as ADR 069)
    ├── Scene generative node selected → generative editor
    └── Neither → navigator
```

### Finding the pattern's scene node

DECO tab needs to find the scene node for the current pattern, even when selected via the pattern sheet (not from SceneView):

```typescript
const currentPatternSceneNode = $derived.by(() => {
  const patId = ui.currentPattern
  return song.scene.nodes.find(n => n.type === 'pattern' && n.patternId === patId) ?? null
})
```

If the pattern has no scene node (not placed in scene graph), the DECO tab shows an empty state: "Place this pattern in the scene graph to add decorators."

## Implementation

### Phase 1: Tab bar + DECO tab
- Add `ui.dockTab` state
- Add tab bar component to DockPanel (below pattern header, above content)
- Move decorator editor into DECO tab, reuse `DockDecoratorEditor.svelte`
- Wire `currentPatternSceneNode` lookup
- Badge with decorator count on DECO tab
- Auto-switch to DECO on decorator add

### Phase 2: Polish
- Empty state messaging for both "no decorators" and "no scene node"
- Tab transition animation (subtle horizontal slide)
- Keyboard shortcut for tab toggle
- Verify undo works correctly across tab switches

## Considerations

- **Vertical space**: Tab bar adds ~28px of height. Acceptable given the large improvement in workflow
- **Multiple scene nodes for same pattern**: A pattern can appear in multiple scene nodes. Use the first match, or the one currently playing. This is an edge case — revisit if it causes confusion
- **ADR 069 compatibility**: The standalone decorator section (no sheet, scene node selected) stays unchanged. The tab is additive, not a replacement
- **SceneNodePopup**: Remains read-only labels. Clicking a decorator tag could now also switch to DECO tab + open pattern sheet, providing a third entry point

## Future Extensions

- Decorator reordering via drag (application order)
- Decorator presets ("Breakdown" = Tempo −20 + FX verb on)
- Decorator copy/paste between pattern nodes
- Third tab for pattern-level settings (length, time signature) if needed
