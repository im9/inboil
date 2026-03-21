# ADR 110: Node Function UX — Playful Visual Redesign

## Status: Proposed

## Context

Scene graph nodes currently have a Max/MSP-like appearance that feels intimidating for newcomers.

**Function node problems:**
- Text-only labels like `T+5`, `RPT2`, `×140` give no intuitive sense of what the node does
- Small 48×24px pills have weak visual presence
- Repeat / tempo exist in the type definition (`FnNodeType`) and runtime (`applyFunctionNode`) but have no UI for creation or editing

**Generative node problems:**
- Turing's `.turing-bits` and Quantizer's `.quant-keys` exist but are static — they don't communicate what the node is doing
- Tonnetz shows only text like `P·L·R`, which is meaningless without music theory knowledge

**Toolbar problems:**
- Abstract 13×13px SVG icons don't convey "what will be added"
- Function nodes (transpose, repeat, tempo, fx) are missing from toolbar / bubble menu

**Design direction:**
KidPix-like playful drawing-tool feel. Nodes should feel "alive" with micro-interactions.
This is the last major UI improvement before beta release.

## Decision

### Phase 1: Naked Icon Nodes with Satellite Attachment

#### 1a. Naked SVG Icon Nodes

Function nodes are rendered as **bare SVG icons on the canvas** — no background box, no border.
Each type has a distinctive icon that doubles as the node's entire visual identity:

```
Current:               After:
┌──────┐
│ T+5  │    →          ↕     (up/down arrows)
└──────┘

┌──────┐
│ RPT2 │    →          ⟳     (circular arrows)
└──────┘

┌──────┐
│ ×140 │    →          ⏖     (metronome)
└──────┘

┌──────┐
│FX VD │    →          ✦     (sparkle)
└──────┘
```

- **No background/border** — icon floats directly on canvas
- Icon size: 20×20px SVG in a 36×36 hit area
- Value shown via `data-tip` tooltip on hover, editing in DockPanel
- Selected state: dashed outline + subtle background tint
- `drop-shadow` for depth against canvas

#### 1b. Satellite Attachment Model

Function nodes attach to pattern nodes as **satellites** — no manual edge wiring needed.

**Attach**: Click fn tool in toolbar, then click a pattern node → fn icon appears
attached to that pattern (auto-wired via `sceneAddFnNode(type, patternNodeId)`).

**Detach**: Drag the attached fn icon away from its parent pattern → edge removed,
fn node becomes free-floating. Drop onto another pattern → re-attach.

**Delete**: Delete key or DockPanel ✕ button.

```
Attached:              Drag away:           Re-attach:
  ↕ ⟳                    ↕ ~~>                  ↕
┌──────┐              ┌──────┐             ┌──────┐
│GLINT │              │GLINT │             │VERSE │
└──────┘              └──────┘             └──────┘
```

- Satellites position themselves around the parent node (top edge, spaced evenly)
- Satellites follow parent when parent is dragged
- Edge handle hidden for fn nodes (attachment is the connection)
- Click on empty canvas in placement mode → free-floating fn node (legacy behavior)

#### 1c. Parameter-driven Micro-interactions

During playback, fn nodes animate with parameters influencing the animation:

- **Transpose**: bounce up/down (amplitude scales with `|semitones|`)
- **Repeat**: circular arrow rotates (duration = `beat × count`)
- **Tempo**: metronome sway (speed = `60 / node.bpm`)
- **FX**: drop-shadow glow pulse (intensity scales with active effect count)

All CSS-only via custom properties: `--fn-semi`, `--fn-count`, `--fn-bpm`, `--fn-fx-n`.

#### 1d. Toolbar & Creation UI

```
[TM] [Q] [Tn] | [↕] [⟳] [⏖] [✦] | [T]
  generative   │    function      │util
```

- `BubblePickType` extended: `'fn-transpose' | 'fn-repeat' | 'fn-tempo' | 'fn-fx'`
- Separators between generative / function / utility groups
- Placement mode: click pattern → attach, click canvas → free placement

#### 1e. DockPanel Parameter Editing

Show editing UI in DockPanel when a function node is selected:

- **Transpose**: REL/ABS mode toggle, semitone ±stepper, key selector (ABS mode)
- **Repeat**: count ±stepper
- **Tempo**: BPM ±stepper (step 5)
- **FX**: per-effect ON/OFF toggles (verb, delay, glitch, granular)

Values updated through `sceneUpdateFnParams()`. Undo via `pushUndo`.

### Phase 2: Live Visualization of Generative Nodes

#### 2a. Turing Machine — Bit Register Animation

- On GEN button press: bits shift left-to-right animation
- During playback: random bits blink based on probability
- Lock parameter visualized: higher lock = more stable bits (lower blink frequency)

#### 2b. Quantizer — Keyboard Highlight

- Current scale notes shown as active (existing `.quant-key.active`)
- During playback: currently sounding note's key pulses
- On scale change: active keys transition smoothly

#### 2c. Tonnetz — Hexagonal Lattice Visualization

Replace the current text display (`T P·L·R`) with a hexagonal lattice UI:

```
┌─ Tonnetz Node (120×72) ──────┐
│  ╱╲╱╲╱╲                      │
│ ╱ E╲B ╲F#╲    hex lattice    │
│╱╲╱╲╱╲╱╲╱╲   (Tonnetz)       │
│ C ╲G ╲D ╲A                   │
│╱╲╱╲╱╲╱╲╱╲                   │
│ Ab╲Eb╲Bb╲F                   │
│  T P·L·R        operations   │
└──────────────────────────────┘
```

- Lattice represents third and fifth relationships
- Highlighted cell moves with chord progression animation
- P/L/R operations intuitively map to lattice directions
- Rendered with SVG (Canvas unnecessary given low element count)

### Phase 3: Toolbar Redesign

#### 3a. Unified Single-bar Layout

Replace current split layout (center add-bar + absolute-positioned right buttons) with
one flexbox toolbar bar. Left-to-right by frequency of use:

```
┌─────────────────────────────────────────────────────────────┐
│ [↕][⟳][⏖][✦] │ [TM][Q][Tn] │ [T] ║ [→][↓] │ [◎] │ 129% │
│   fn (frequent) │ generative  │util ║ layout  │focus│ zoom │
│   ← add nodes →                     ← view controls →      │
└─────────────────────────────────────────────────────────────┘
```

- Fn nodes first (most commonly added), generative next, label last
- `║` thicker separator between "add" and "view" sections
- All buttons same height, same style — no more `position: absolute` for right-side buttons
- Consistent border/background treatment across all groups

#### 3b. Hover Preview

- Toolbar buttons show a mini preview (48×32) on hover, not just a tooltip
- Preview is a miniature version of the actual node (icon + color)
- Placement mode ghost node made richer (currently just a semi-transparent rectangle)

## Implementation

### Changed Files

| File | Changes |
|------|---------|
| `icons.ts` | Redesigned icons: transpose→arrows, tempo→metronome, fx→sparkle |
| `sceneGeometry.ts` | `FN_HALF_W/H` = 18×18, `fnNodeIcon()`, `fnNodeValue()` helpers |
| `SceneView.svelte` | Naked icon template, satellite positioning, drag-detach, parameter CSS vars, micro-interactions |
| `SceneToolbar.svelte` | Fn types in ADD_ITEMS with separators |
| `SceneBubbleMenu.svelte` | `BubblePickType` extended with fn types |
| `DockPanel.svelte` | Fn node parameter editing UI (stepper/toggle) |
| `sceneActions.ts` | `sceneAddFnNode()` with x/y params, satellite positioning helpers |

### Phasing

- **Phase 1** (pre-beta): naked icons + satellite attachment + DockPanel editing + micro-interactions
- **Phase 2** (post-beta): generative node live visualization — experience enhancement
- **Phase 3** (post-beta): toolbar redesign — overall consistency

### Implementation Checklist

Only Phase 1 detailed here — Phase 2/3 checklists to be added when work begins.

#### Phase 1a: Naked Icon Nodes ✅
- [x] Redesign SVG icons: transpose→up/down arrows, tempo→metronome, fx→sparkle
- [x] `fnNodeIcon()` helper in `sceneGeometry.ts`
- [x] Naked icon template in SceneView (no background/border, 20×20 icon, 36×36 hit area)
- [x] Value in `data-tip` tooltip
- [x] `FN_HALF_W/H` = 18×18 for edge computation
- [x] Selected state: dashed outline + background tint

#### Phase 1b: Toolbar & Creation UI ✅
- [x] `BubblePickType` extended with `'fn-transpose' | 'fn-repeat' | 'fn-tempo' | 'fn-fx'`
- [x] ADD_ITEMS with separators between generative / function / utility groups
- [x] Placement mode: `sceneAddFnNode()` with x/y coordinates
- [x] Ghost preview matches naked icon style

#### Phase 1c: DockPanel Parameter Editing ✅
- [x] Fn node detection via `selectedFnNode` derived state
- [x] Transpose: REL/ABS toggle, semitone ±stepper, key selector (ABS)
- [x] Repeat: count ±stepper
- [x] Tempo: BPM ±stepper (step 5)
- [x] FX: per-effect ON/OFF toggles
- [x] Wired through `sceneUpdateFnParams()` with undo

#### Phase 1d: Parameter-driven Micro-interactions ✅
- [x] CSS custom properties: `--fn-semi`, `--fn-count`, `--fn-bpm`, `--fn-fx-n`
- [x] Transpose: bounce (±3px)
- [x] Repeat: rotate (duration = beat × count)
- [x] Tempo: sway ±8° (duration = 60/bpm)
- [x] FX: drop-shadow glow pulse

#### Phase 1e: Satellite Attachment
- [ ] Placement on pattern node → auto-attach (call `sceneAddFnNode(type, patternNodeId)`)
- [ ] Satellite positioning: fn icons arranged around parent node top edge
- [ ] Parent drag → satellites follow
- [ ] Drag fn away from parent → detach (remove edge, become free-floating)
- [ ] Drop fn onto different pattern → re-attach (rewire edge)
- [ ] Hide edge handle for fn nodes
- [ ] Canvas click in placement mode → free-floating (existing behavior)

## Considerations

- **Performance**: Animations are CSS-only via CSS custom properties. No JS timers
- **Satellite positioning**: Multiple fn nodes on one pattern need even spacing. Max ~4 satellites before visual clutter
- **Naked icon legibility**: 20×20px icons remain legible at zoom levels ≥ 50%. Below that, tooltip becomes essential
- **Drag-detach threshold**: Need sufficient drag distance before detaching to avoid accidental detachment
- **Tonnetz hex lattice** (Phase 2): Realistic to fit a small 3×3 lattice within generative node size (120×72)

## Future Extensions

- Direct on-node drag editing for generative node parameters (e.g. Turing probability slider)
- Chain display for consecutive function nodes (render as a single group)
- Custom node skins / themes
