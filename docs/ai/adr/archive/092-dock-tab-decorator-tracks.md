# ADR 092: DockPanel Tab — Scene Controls & Track Params in One Place

## Status: Implemented

## Context

ADR 069 added a decorator editing section to DockPanel, visible when a pattern node is selected in SceneView. Track parameters are visible when the pattern sheet (step sequencer) is open. The problem: **you can never see both at the same time.**

Current visibility logic:
- Decorator section → SceneView active, pattern node selected, no sheet open
- Track params → pattern sheet open

This means editing a decorator's transpose while checking a track's voice parameters requires closing the sheet, selecting the node, tweaking, reopening the sheet — back and forth. For any non-trivial sound design work involving decorators or generative nodes, this is unacceptably tedious.

### Why this matters

Decorators (transpose, tempo, repeat, FX, automation) and generative nodes (Tonnetz, etc.) modify the pattern as a whole. Track parameters (voice, volume, send, presets) control individual sounds. These are complementary — users frequently need both to shape a pattern's behavior. Forcing a view-switch between them breaks flow.

Additionally, these scene-level controls remain hard to discover. They only appear when a pattern node is selected in SceneView with no sheet open — a narrow condition most users won't stumble into.

## Decision

### Tab switcher in DockPanel

Add a two-tab switcher to DockPanel when a pattern sheet is open:

```
┌─────────────────────────────┐
│ Pattern A1                  │
│ [TRACKS] [SCENE]            │  ← tab bar, above track list
│─────────────────────────────│
│                             │
│  (tab content)              │
│                             │
└─────────────────────────────┘
```

- **TRACKS tab** (default): existing track parameter UI (voice, knobs, presets, send, mixer)
- **SCENE tab**: decorators + connected generative nodes for the current pattern

The tab bar appears only when the pattern sheet is open. When no sheet is open and a scene node is selected, the current behavior remains (decorator section shows directly, no tabs needed).

### Tab naming rationale

"SCENE" was chosen over "DECO" because:
- The tab contains both decorators and connected generative nodes — not just decorators
- TRACKS vs SCENE is a clear conceptual split: per-track sound design vs scene-level pattern control
- Scales to future additions (looper connections, etc.) without renaming

### Tab bar design

```
┌──────────┬──────────┐
│  TRACKS  │  SCENE   │
└──────────┴──────────┘
```

- Position: below the pattern name header, above content
- Pattern-level concern (scene controls affect all tracks) → tab sits above the track selector row
- Active tab uses the pattern's color accent; inactive tab is dimmed
- Badge on SCENE tab showing count (e.g. `SCENE ³`) when decorators/generative nodes exist — aids discoverability
- Keyboard shortcut: `Tab` to toggle when DockPanel is focused (or a dedicated key)

### SCENE tab content

```
┌─────────────────────────────┐
│ Pattern A1                  │
│ [TRACKS] [SCENE ³]          │
│─────────────────────────────│
│ DECORATORS        [+ Add ▾] │
│ ┌─────────────────────────┐ │
│ │ TRANSPOSE         [×]   │ │
│ │ [REL|ABS]  ◎ +5 semi    │ │
│ ├─────────────────────────┤ │
│ │ FX                 [×]   │ │
│ │ [VRB] [DLY] [GLT] [GRN] │ │
│ └─────────────────────────┘ │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ GENERATIVE                  │
│ ┌─────────────────────────┐ │
│ │ TONNETZ             [→] │ │
│ │ ◎ Range  ◎ Density      │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

- Decorators section: `[+ Add ▾]` dropdown (Transpose, Tempo, Repeat, FX, Automation), full-size Knob/toggle controls, `×` to remove
- Generative section: shows all generative nodes connected via edges to this pattern's scene node
- Empty state: "Place this pattern in the scene to add decorators."
- Scrollable if many items

### State changes

```typescript
// added to ui
dockTab: 'tracks' | 'scene'  // default: 'tracks', reset on pattern change
```

- Persisted per session (not to localStorage — resets on reload is fine)
- Reset to `'tracks'` when `ui.currentPattern` changes (user expects to see the new pattern's tracks first)
- When adding a decorator via the `[+ Add ▾]` menu, auto-switch to `'scene'` tab

### Visibility logic (updated)

```
Pattern sheet open?
├── Yes → Show tab bar [TRACKS | SCENE]
│   ├── TRACKS tab → existing track params
│   └── SCENE tab → decorators + generative nodes (for current pattern's scene node)
└── No
    ├── Scene pattern node selected → decorator section (no tabs, same as ADR 069)
    ├── Scene generative node selected → generative editor
    └── Neither → navigator
```

### Finding the pattern's scene node

SCENE tab needs to find the scene node for the current pattern, even when selected via the pattern sheet (not from SceneView):

```typescript
const currentPatternSceneNode = $derived.by(() => {
  if (!ui.patternSheet) return null
  const patId = song.patterns[ui.currentPattern]?.id
  if (!patId) return null
  return song.scene.nodes.find(n => n.type === 'pattern' && n.patternId === patId) ?? null
})

const connectedGenerativeNodes = $derived.by(() => {
  if (!currentPatternSceneNode) return []
  const inEdges = song.scene.edges.filter(e => e.to === currentPatternSceneNode.id)
  return inEdges
    .map(e => song.scene.nodes.find(n => n.id === e.from))
    .filter((n): n is SceneNode => n?.type === 'generative' && !!n.generative)
})
```

If the pattern has no scene node (not placed in the scene), the SCENE tab shows an empty state: "Place this pattern in the scene to add decorators."

## Considerations

- **Vertical space**: Tab bar adds ~28px of height. Acceptable given the large improvement in workflow
- **Multiple scene nodes for same pattern**: A pattern can appear in multiple scene nodes. Use the first match, or the one currently playing. This is an edge case — revisit if it causes confusion
- **ADR 069 compatibility**: The standalone decorator section (no sheet, scene node selected) stays unchanged. The tab is additive, not a replacement
- **SceneNodePopup**: Remains read-only labels. Clicking a decorator tag could now also switch to SCENE tab + open pattern sheet, providing a third entry point
- **Badge count**: Includes both decorators and connected generative nodes for accurate representation

## Future Extensions

- Decorator reordering via drag (application order)
- Decorator presets ("Breakdown" = Tempo −20 + FX verb on)
- Decorator copy/paste between pattern nodes
- Looper node display in SCENE tab (ADR 087)
- Third tab for pattern-level settings (length, time signature) if needed
