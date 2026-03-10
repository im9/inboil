# ADR 078: Generative Scene Nodes

## Status: Proposed

## Context

### Function Node Evolution

Scene function nodes (transpose, tempo, repeat, fx, automation) were originally standalone graph nodes connected via edges (ADR 044/050). ADR 066 introduced decorators — the same functions attached directly to pattern nodes — and ADR 069 moved decorator editing to the DockPanel with full-size knobs.

This evolution made standalone function nodes largely redundant:

- **Decorators cover all use cases**: transpose, tempo, repeat, fx, automation all work as decorators with a better UX (DockPanel knobs vs tiny node popup)
- **Standalone nodes add clutter**: they occupy canvas space and require edge management for what is essentially pattern-local configuration
- **Probability node is the exception**: it controls edge branching (a graph-level concern), not pattern parameters

Meanwhile, ADR 038 (Custom Functions) proposed FX snapshot macros triggered from function nodes — but this too is better served by decorators (fx decorator with flavourOverrides already does this).

### Opportunity: Generative Nodes

The scene graph's directed-graph topology is uniquely suited for something step sequencers cannot do: **generative music**. Modular synth modules like Ornament & Crime demonstrate how quantizers, Tonnetz transforms, and shift-register sequences create musically interesting results that go beyond manually programmed patterns.

The scene graph already supports probabilistic branching (ADR 048). Extending it with dedicated generative nodes turns the canvas from a static arrangement view into a **visible composition engine** — where nodes generate, transform, and route musical data.

### Design Principles

- **Optional complexity**: standard patterns + decorators remain the default workflow. Generative nodes are opt-in for users who want unpredictability
- **Modular synth philosophy**: patch nothing and it works; patch things together and surprising results emerge
- **Two output modes**: generate-then-freeze for composition, live for performance

## Decision

### 1. Node Type Consolidation

**Remove standalone function nodes.** All existing function types become decorator-only:

| Current Node Type | Change | Rationale |
|---|---|---|
| `pattern` | Keep as-is | Core node, unchanged |
| `transpose` | **Decorator only** | Pattern-local concern |
| `tempo` | **Decorator only** | Pattern-local concern |
| `repeat` | **Decorator only** | Pattern-local concern |
| `fx` | **Decorator only** | Pattern-local concern (incl. flavourOverrides) |
| `automation` | **Decorator only** | Pattern-local concern |
| `probability` | **Remove** | Already implicit — multiple outgoing edges = probabilistic branching (ADR 048) |

After consolidation, `SceneNode.type` is simplified to two categories:

```typescript
type SceneNodeType = 'pattern' | 'generative'
```

Generative nodes use a nested structure for engine-specific configuration:

```typescript
interface GenerativeConfig {
  engine: GenerativeEngine
  outputMode: 'write' | 'live'
  mergeMode: 'replace' | 'merge' | 'layer'
  seed?: number              // deterministic seed (write mode)
  params: GenerativeParams
}

type GenerativeEngine =
  | 'quantizer'
  | 'tonnetz'
  | 'turing'        // Turing Machine / shift register
  | 'euclidean'     // future
  | 'chaos'         // future

type GenerativeParams = QuantizerParams | TonnetzParams | TuringParams
```

This two-level design (`type` → `engine`) keeps SceneNode.type stable as new engines are added. Common generative behavior (write/live mode, Freeze, merge mode) is handled uniformly by checking `type === 'generative'`, while engine-specific logic dispatches on `engine`.

Existing scenes with standalone function nodes are migrated: `migrateFnToDecorators()` (sceneData.ts) already handles this. Orphan function nodes with no connected pattern are removed with a console warning.

### 2. Generative Engines

#### Quantizer

Forces note values to a specific scale. Connects between a source (pattern or another generative node) and a target pattern.

```typescript
interface QuantizerParams {
  engine: 'quantizer'
  scale: ScaleType          // 'major' | 'minor' | 'dorian' | 'pentatonic' | ...
  root: number              // 0–11 (C=0)
  octaveRange: [number, number]  // e.g. [3, 5] — clamp to octave range
}
```

**Use cases:**
- Constrain a Turing Machine's output to a musical scale
- Mid-song key change: two quantizer nodes on different branches, different scales
- Force an existing pattern into a new key (scale-aware — snaps to nearest scale degree instead of fixed semitone shift)

#### Tonnetz (Neo-Riemannian Transform)

Generates chord progressions by traversing the Tonnetz lattice. Each step applies a transform operation (P, L, R) to the current triad.

```typescript
interface TonnetzParams {
  engine: 'tonnetz'
  startChord: [number, number, number]  // initial triad as MIDI notes, e.g. [60, 64, 67] = C major
  sequence: TonnetzOp[]                 // transform sequence per step
  stepsPerChord: number                 // how many sequencer steps each chord occupies (1–16)
  voicing: 'close' | 'spread' | 'drop2' // voice spreading
}

type TonnetzOp = 'P' | 'L' | 'R' | 'PL' | 'PR' | 'LR' | 'PLR'
```

**Neo-Riemannian transforms:**
- **P** (Parallel): C major → C minor (flip third)
- **L** (Leading tone): C major → E minor (move root down a semitone)
- **R** (Relative): C major → A minor (move fifth up a whole tone)
- Compound ops (PL, PR, LR, PLR) chain transforms for larger harmonic leaps

**Use cases:**
- Generative chord progressions with guaranteed smooth voice leading
- Vector sequencer: scene graph position on Tonnetz space determines current chord
- Cinematic harmonic movement without music theory knowledge

#### Turing Machine (Shift-Register Random)

Shift-register random sequence generator inspired by Music Thing Modular's Turing Machine.

```typescript
interface TuringParams {
  engine: 'turing'
  length: number           // register length (2–32 steps)
  lock: number             // 0.0 = fully random, 1.0 = fully locked loop
  range: [number, number]  // output note range (MIDI note numbers)
  mode: 'note' | 'gate' | 'velocity'  // what the random values control
  density: number          // 0.0–1.0 — probability of a step being active (gate mode)
}
```

**Behavior:**
- Maintains a shift register of N values
- Each cycle: last bit is flipped with probability `(1 - lock)`
- `lock = 0.5`: evolving patterns that gradually mutate
- `lock = 1.0`: frozen loop (equivalent to a fixed pattern)
- `lock = 0.0`: pure random (no repetition)

**Use cases:**
- Evolving bass lines that stay "in the zone" but never repeat exactly
- Random hi-hat patterns with density control
- Feed into quantizer for scale-locked random melodies

### 3. Signal Flow & Graph Connections

Generative nodes participate in the scene graph as first-class nodes with edges:

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│ turing       │────→│ quantizer    │────→│ Pattern 01 synth │
│ lock=0.6     │     │ C minor pent │     │ (receives notes)  │
│ len=8        │     │              │     │                    │
└─────────────┘     └──────────────┘     └──────────────────┘

┌─────────────┐     ┌──────────────────┐
│ tonnetz      │────→│ Pattern 02 pad  │
│ P,L,R,P seq │     │ (receives chords)│
└─────────────┘     └──────────────────┘
```

**Edge semantics for generative nodes:**
- **Generative → Pattern**: generated notes replace or merge with pattern content (based on mergeMode)
- **Generative → Generative**: chain processing (e.g. Turing → Quantizer)
- **Pattern → Pattern**: existing playback transition (unchanged)

**Merge modes** (configured on the receiving pattern node):

| Mode | Behavior |
|---|---|
| `replace` | Generated notes completely replace pattern content |
| `merge` | Generated notes fill empty steps only |
| `layer` | Generated notes add to existing pattern (polyphonic layering) |

### 4. Write Mode / Live Mode + Freeze

Each generative node carries `outputMode` in its `GenerativeConfig` (see Section 1).

**Write mode:**
- Node generates a note sequence and writes it into the target pattern's step data
- Result is visible in the step sequencer / piano roll
- Regenerate on demand (button or on each scene playback start)
- Deterministic seed option for reproducible results

**Live mode:**
- Node generates notes in real-time during playback
- Pattern data is untouched — generation happens in the playback engine
- Every playback cycle may produce different results (depending on lock/probability)
- Useful for performance, evolving arrangements

**Freeze:**
- One-click action: snapshot the current live output → write to pattern → switch to write mode
- "I like what just happened, keep it"
- Undo-able via standard undo system (`pushUndo('Freeze generative')`)

### 5. Node Add UI — Replacing the Bubble Menu

The current bubble menu (SceneBubbleMenu.svelte) lists 7 node types in a radial arc. With function nodes removed and generative nodes added, the total count changes but the composition shifts significantly:

**After consolidation:**

| Category | Nodes |
|---|---|
| Core | Pattern |
| Generative | Quantizer, Tonnetz, Turing Machine |
| Utility | Label |

5 items fit comfortably in a bubble menu. However, as generative node types grow in the future (Euclidean, Arp, Markov, etc.), a flat radial menu won't scale.

**Proposed: categorized bubble menu**

```
         ┌──────────┐
    ┌────│ PATTERN  │────┐
    │    └──────────┘    │
┌───┴───┐          ┌────┴────┐
│ LABEL │          │GENERATE │──→  submenu:
└───────┘          └─────────┘     ┌───────────┐
                                   │ Quantizer │
                                   │ Tonnetz   │
                                   │ Random    │
                                   └───────────┘
```

- Top level: Pattern, Generate, Label (3 bubbles — clean and fast)
- Generate expands to a submenu (same radial style, or a compact list)
- Future node types slot into the Generate submenu without cluttering the top level
- Alternatively: long-press on canvas shows the categorized menu; quick tap still creates a pattern node (the most common action)

### 6. Visual Design — "Eurorack on Canvas"

The scene view should feel like a virtual Eurorack case: each generative node is a **module with its own faceplate** — a unique, engine-specific mini UI that visualizes its state in real-time. This replaces the current generic icon+label approach.

#### Design Philosophy

- Each engine has a **dedicated Svelte component** rendered as an HTML/SVG overlay on the scene canvas
- Nodes are larger than current function nodes (~120×72px) to accommodate visual content
- Real-time animation during playback (live mode) — the canvas becomes something you watch and enjoy
- Interaction: click a node to select (DockPanel shows full params), double-tap to open detail editor

#### Engine Faceplates

**Turing Machine:**
```
┌───────────────────┐
│ ●●○●○○●○  lock    │  ← shift register bits, filled = on
│ ▮▮▯▮▯▯▮▯   0.6   │  ← current step highlighted
│ TM  len=8         │
└───────────────────┘
```
- Shift register visualized as a row of dots/blocks
- Current position highlighted, bits flip in real-time
- Lock knob value displayed

**Tonnetz:**
```
┌───────────────────┐
│   · C · ·         │  ← hex grid (Tonnetz lattice)
│  · a ·[E]·        │  ← current chord highlighted
│   · e · ·         │
│ T  P·L·R          │
└───────────────────┘
```
- Mini hexagonal grid showing nearby chord positions
- Current chord position glows/pulses
- Transform sequence shown as path trail on the lattice

**Quantizer:**
```
┌───────────────────┐
│ ┌┬┐┌┬┬┐┌┬┐┌┬┬┐   │  ← mini piano keyboard (1 octave)
│ │└┤│┤│└┤│└┤│┤│└┤  │  ← active scale degrees highlighted
│ └─┘└┘└─┘└─┘└┘└─┘  │
│ Q  C minor pent    │
└───────────────────┘
```
- One-octave piano keyboard with active scale notes highlighted
- Input notes flash briefly as they pass through
- Root note distinguished by accent color

#### Pattern Nodes (unchanged but enhanced)

Pattern nodes keep their current rectangle shape but gain a subtle **mini waveform or step preview** (optional, future) to maintain visual consistency with the richer generative nodes.

#### Implementation

- Each engine registers a `FaceplateComponent` in a map: `Record<GenerativeEngine, typeof SvelteComponent>`
- SceneView renders generative nodes via `<svelte:component this={faceplates[node.generative.engine]} />`
- Faceplates receive `params` + `playbackState` as props for real-time updates
- Canvas pan/zoom applies CSS `transform` to the faceplate container (same as current node rendering)
- Minimal bundle cost: each faceplate is ~50–100 lines of SVG + reactive logic

## Implementation Phases

### Phase 1: Consolidation + Turing Machine

- Remove standalone function node creation from bubble menu
- Migrate remaining standalone function nodes to decorators
- Remove probability node type (edge branching handles this)
- Implement `GenerativeConfig` data model on `SceneNode`
- Implement Turing Machine engine — simplest generative type
- Write mode only (generate → write to pattern)
- Update SceneBubbleMenu to Pattern / Turing Machine / Label

### Phase 2: Quantizer + Live Mode

- Implement Quantizer engine with scale library
- Add live mode to generative nodes (playback engine integration)
- Freeze action
- Generative → Generative chaining (Turing → Quantizer)

### Phase 3: Tonnetz + UI Polish

- Implement Tonnetz transform engine
- Chord voicing options
- Tonnetz visualization (optional: mini hex grid in DockPanel showing current position)
- Categorized bubble menu (Generate submenu)

### Phase 4: DockPanel Integration + Presets

- Full-size knob editing for generative node params in DockPanel
- Factory presets per node type (e.g. "Ambient Random", "Jazz Tonnetz", "Pentatonic Quantizer")
- Seed control for reproducible generation

## Considerations

- **Migration**: existing projects with standalone function nodes must auto-migrate. `migrateFnToDecorators()` already exists; extend to handle edge cases (orphan nodes, chains of multiple function nodes)
- **ADR 038 (Custom Functions)**: superseded by this ADR. FX snapshot macros are handled by fx decorators with flavourOverrides (ADR 076). Keyboard/bubble triggers for performance actions remain a separate concern
- **Performance**: live mode generation runs in the UI thread (JS). Keep algorithms O(n) where n = step count. Tonnetz transforms are pure arithmetic — no performance concern
- **Determinism**: write mode with a seed should produce identical results. Live mode is intentionally non-deterministic (seeded PRNG with time-based seed per cycle)
- **Undo**: write mode respects `pushUndo()`. Live mode has nothing to undo (pattern data is unmodified)
- **MIDI out**: generated notes should be included in MIDI export (ADR 030) — live mode would need a "render" pass

## Future Extensions

- **Euclidean rhythm node**: k-of-n Euclidean patterns with rotation
- **Arp node**: configurable arpeggiator (up/down/random/pattern) driven by Tonnetz or manual chord input
- **Markov chain node**: transition probability matrix for melody generation
- **Cellular automaton node**: 1D CA (Rule 30/110 etc.) mapped to note/gate sequences
- **Clock divider/multiplier node**: polyrhythmic generation
- **CV-style modulation**: one generative node modulating another's parameters (e.g. Turing → Tonnetz lock amount)
- **Visual Tonnetz map**: interactive hex grid showing transform paths, zoomable in a dedicated view
