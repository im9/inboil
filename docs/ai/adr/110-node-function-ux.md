# ADR 110: Node Function UX — Playful Visual Redesign

## Status: Implemented

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

#### 3a. Tool Palette vs UI Controls

Creative tools and UI controls have **different visual identities**:

```
  center (tool palette)                      right (UI controls)
  ○ ○ ○ ○   ◉ ◉ ◉   ○                      [→][↓] [◎] 129%
  fn         gen      label                  layout  focus zoom
  (round, inviting)                          (flat, recessive)
```

- **Tool palette**: 34px circular buttons, drop-shadow, hover scale(1.1) — "objects you pick up"
- **UI controls**: 28px square buttons, flat, subtle — "settings you adjust"
- Spatial separation communicates the role difference

#### 3b. Category Differentiation

Three tool categories distinguished by visual style:

- **FN tools**: white circles, neutral color (most common, lowest friction)
- **GEN tools**: colored border ring matching engine accent (olive/teal/purple) — instantly recognizable as generative
- **Label**: white circle, standalone (utility)

Active state: FN fills dark, GEN fills with its accent color

#### 3c. Layout

- Tool palette centered, fn-first ordering (transpose, repeat, tempo, fx → turing, quantizer, tonnetz → label)
- Groups separated by 4px spacing (no labels needed — icon style + color communicates)
- Right controls bottom-aligned with tool palette buttons

## Implementation

### Changed Files

| File | Changes |
|------|---------|
| `icons.ts` | Redesigned icons: transpose→♪↕, tempo→metronome, fx→sparkle, repeat→stroke arrows |
| `sceneGeometry.ts` | `FN_HALF_W/H` = 18×18, `fnNodeIcon()`, `fnNodeValue()` helpers |
| `SceneView.svelte` | Naked icon template, satellite positioning, drag-detach, parameter CSS vars, micro-interactions, generative live viz |
| `SceneToolbar.svelte` | Tool palette (circular buttons), fn-first ordering, GEN accent colors |
| `SceneBubbleMenu.svelte` | `BubblePickType` extended with fn types |
| `SceneCanvas.svelte` | Hide edge rendering for fn satellite nodes |
| `DockPanel.svelte` | Fn + generative node editing in both scene view and SCENE tab |
| `sceneActions.ts` | `sceneAddFnNode()` with x/y, `repositionSatellites()`, `findAttachedFnNodes()` |
| `scenePlayback.ts` | `applySatelliteFnNodes()` — apply fn effects via pattern lookup |

### Implementation Checklist

#### Phase 1a: Naked Icon Nodes ✅
- [x] Redesign SVG icons: transpose→♪+arrow, tempo→metronome (filled body), fx→sparkle
- [x] `fnNodeIcon()` helper in `sceneGeometry.ts`
- [x] Naked icon template (no background/border, 20×20 icon, 36×36 hit area)
- [x] Value labels below icons, repeat countdown during playback
- [x] FX: stacked colored sparkles per active effect
- [x] Selected state: dashed outline + background tint

#### Phase 1b: Satellite Attachment ✅
- [x] Placement on pattern node → auto-attach (`sceneAddFnNode(type, patternNodeId)`)
- [x] Satellite positioning: fn icons arranged above parent, sorted by type
- [x] Parent drag → satellites follow (`repositionSatellites()`)
- [x] Drag fn away → detach, drop on other pattern → reattach
- [x] Hide edge rendering and handles for fn nodes
- [x] Canvas click → free-floating (existing behavior preserved)

#### Phase 1c: DockPanel Parameter Editing ✅
- [x] Fn node editor in scene view (selected fn node) and SCENE tab (connected fn nodes)
- [x] Generative node editor in scene view (selected gen node)
- [x] Transpose: REL/ABS toggle, semitone ±stepper, key selector
- [x] Repeat: count ±stepper / Tempo: BPM ±stepper / FX: per-effect toggles
- [x] Section dividers between nodes in SCENE tab

#### Phase 1d: Parameter-driven Micro-interactions ✅
- [x] CSS custom properties: `--fn-semi`, `--fn-count`, `--fn-bpm`, `--fn-fx-n`
- [x] Transpose: icon-only bounce (label stays) / Repeat: icon rotate
- [x] Tempo: metronome needle sway (duration = 60/bpm)
- [x] FX: per-layer colored glow with staggered delay
- [x] Fn plays when parent pattern plays (satellite lookup, not graph traversal)

#### Phase 1e: Satellite Runtime ✅
- [x] `applySatelliteFnNodes()` in scenePlayback — apply fn effects on pattern entry
- [x] Both `startSceneNode` and `walkToNode` call satellite lookup

#### Phase 2: Generative Live Visualization ✅
- [x] Turing: live bit register from actual trigs, current step glow
- [x] Quantizer: playing note pitch class highlights on mini keyboard
- [x] Tonnetz: current operation highlights based on stepsPerChord

#### Phase 3: Toolbar Redesign ✅
- [x] Tool palette: 34px circular buttons with drop-shadow, hover scale(1.1)
- [x] UI controls: 28px square, flat — visually distinct role
- [x] GEN tools: accent color border ring (olive/teal/purple), active fills accent
- [x] FN tools: neutral white circles
- [x] Fn-first ordering, groups separated by spacing (no labels needed)
- [x] Bottom-aligned with right-side controls

## Considerations

- **Performance**: All animations are CSS-only via custom properties. No JS timers
- **Satellite positioning**: Multiple fn nodes on one pattern spaced evenly, sorted by type. Max ~4 satellites before visual clutter
- **Naked icon legibility**: 20×20px icons remain legible at zoom ≥ 50%. Tooltip + value label below icon for detail
- **Tool palette vs UI controls**: Shape difference (circle vs square) communicates role at a glance — tools are "objects", controls are "settings"
- **GEN accent colors**: Match the generative node faceplate colors, creating visual consistency between toolbar and canvas

## Future Extensions

- Direct on-node drag editing for generative node parameters (e.g. Turing probability slider)
- Chain display for consecutive function nodes (render as a single group)
- Custom node skins / themes
