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

### Phase 1: Function Node Icons and UI Addition

#### 1a. Icon-based Nodes

Replace text labels with SVG icon + value:

```
Current:                 After:
┌──────┐              ┌────────────┐
│ T+5  │    →         │ 🎹↑ +5    │  transpose
└──────┘              └────────────┘

┌──────┐              ┌────────────┐
│ RPT2 │    →         │ 🔄 ×2     │  repeat
└──────┘              └────────────┘

┌──────┐              ┌────────────┐
│ ×140 │    →         │ ⏱ 140     │  tempo
└──────┘              └────────────┘

┌──────┐              ┌────────────┐
│FX VD │    →         │ ✦ V·D     │  fx
└──────┘              └────────────┘
```

- Dedicated SVG icon (14×14) per type
- Two-element layout: icon + value
- Slightly larger node size: 56×28px (current 48×24px)

#### 1b. Function Node Micro-interactions

During playback, animate function nodes when they are applied:

- **Transpose**: icon bounces slightly in the semitone direction (up/down)
- **Repeat**: loop arrow icon rotates once (rotation speed varies with count)
- **Tempo**: metronome-like left/right sway (synced to BPM)
- **FX**: pulse glow (in active effect color)

Implemented with CSS animation. Triggered by adding a `playing` class.

#### 1c. Repeat / Tempo Creation UI

Add function node types to SceneToolbar's `ADD_ITEMS`:

```
Current toolbar:
[TM] [Q] [Tn] [Lbl]

Extended toolbar:
[TM] [Q] [Tn] | [T↕] [RPT] [BPM] [FX] | [Lbl]
                 ← function nodes →
```

- Separators visually divide generative / function / utility groups
- Add `'fn-transpose' | 'fn-repeat' | 'fn-tempo' | 'fn-fx'` to `BubblePickType`
- Placement reuses the existing placement mode
- Parameter editing in DockPanel (extending ADR 069's decorator editor)

#### 1d. DockPanel Parameter Editing

Show editing UI in DockPanel when a function node is selected:

```
┌─ DockPanel ──────────────┐
│ ♪ Transpose              │
│ ┌──────────────────────┐ │
│ │  Mode: [REL] [ABS]   │ │
│ │  Semitones: [-] 5 [+]│ │
│ │  Key: C  (ABS mode)  │ │
│ └──────────────────────┘ │
│                          │
│ 🔄 Repeat                │
│ ┌──────────────────────┐ │
│ │  Count: [-] 2 [+]    │ │
│ └──────────────────────┘ │
│                          │
│ ⏱ Tempo                  │
│ ┌──────────────────────┐ │
│ │  BPM: [-] 140 [+]    │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

Displayed when a function node is selected via existing `ui.selectedSceneNodes`.
Values updated through `sceneUpdateFnParams()`.

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

#### 3a. Hover Preview

- Toolbar buttons show a mini preview (48×32) on hover, not just a tooltip
- Preview is a miniature version of the actual node (icon + color)
- Placement mode ghost node made richer (currently just a semi-transparent rectangle)

#### 3b. Toolbar Grouping

```
┌─────────────────────────────────────────┐
│ [TM][Q][Tn] │ [T↕][RPT][BPM][FX] │[Lbl]│
│  generative  │     function        │util │
└─────────────────────────────────────────┘
```

- Separators (1px vertical line) for visual grouping
- Each group's purpose is immediately clear

## Implementation

### Changed Files

| File | Changes |
|------|---------|
| `sceneGeometry.ts` | Increase FN_HALF_W/H, add `fnNodeIcon()` function |
| `SceneView.svelte` | Update fn node template (icon + value), playback animation classes |
| `SceneToolbar.svelte` | Add fn types to ADD_ITEMS, separators, hover preview |
| `SceneBubbleMenu.svelte` | Add fn types to `BubblePickType` |
| `DockPanel.svelte` | Fn node parameter editing UI |
| `icons.ts` | Per-type SVG icons |
| `sceneActions.ts` | Make `sceneAddFnNode()` callable from toolbar |

### Phasing

- **Phase 1** (pre-beta): fn node icons + repeat/tempo UI + DockPanel editing — practical minimum
- **Phase 2** (post-beta): generative node live visualization — experience enhancement
- **Phase 3** (post-beta): toolbar redesign — overall consistency

## Considerations

- **Performance**: Animations are CSS-only (no JS timers). `will-change` only when needed
- **Tonnetz hex lattice**: Realistic to fit a small 3×3 lattice within the node size (120×72). Full Tonnetz better expanded in DockPanel
- **Function node size change**: Expanding to 56×28px may affect existing scene layouts. `sceneFormatNodes()` spacing adjustments needed
- **Icon legibility**: 14×14px SVG icons may become unreadable when zoomed out. Keep text fallback as minimum

## Future Extensions

- Direct on-node drag editing for generative node parameters (e.g. Turing probability slider)
- Chain display for consecutive function nodes (render as a single group)
- Custom node skins / themes
