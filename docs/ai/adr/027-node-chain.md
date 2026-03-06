# ADR 027: Node Chain — Node-Based Song Builder

## Status: Superseded

## Context

Pattern chain (ADR 013) is a simple linear list. It cannot express more complex song structures such as conditional branching, loops, or FX routing. A node-based GUI inspired by Max/MSP and Nord Modular would allow users to connect patterns visually and build full song structures.

## Concept

### What is Node Chain?

Patterns are placed as nodes (boxes) on a canvas and connected with arrows to define playback order. Each node can have FX or conditions attached.

```
[INTRO] ──→ [VERSE] ──→ [BUILD] ──→ [DROP] ──┐
                ↑                              │
                └──────── [BRIDGE] ←───────────┘
```

### Node Types

| Node | Description |
|------|-------------|
| **Pattern** | Play a pattern slot (1–100). Configurable repeat count |
| **Chain** | Play multiple patterns in sequence (traditional pattern chain) |
| **Branch** | Conditional branching (loop count, probability, manual trigger) |
| **FX Send** | Override FX send amounts for the connected pattern |
| **Scene** | Set Scene A/B crossfader position (ADR 024) |
| **Perf** | Configure auto Fill/Break/Reverse (ADR 026) |
| **End** | Stop playback or loop back to the start node |

### Node Properties

```typescript
interface SongNode {
  id: string
  type: 'pattern' | 'chain' | 'branch' | 'fxSend' | 'scene' | 'perf' | 'end'
  x: number; y: number      // position on canvas
  // type-specific properties
  patternId?: number         // pattern node
  repeat?: number            // repeat count (0 = infinite)
  chainIds?: number[]        // chain node
  condition?: BranchCondition // branch node
  fxOverrides?: FxSendOverride  // fxSend node
  scenePos?: number          // scene node (0.0–1.0)
  perfFlags?: PerfFlags      // perf node
  outputs: string[]          // connected output node IDs
}

interface Song {
  id: string
  name: string
  nodes: SongNode[]
  startNodeId: string
}
```

### UI

- New view: `SONG` (alongside GRID / FX / EQ)
- Drag & drop nodes onto the canvas
- Drag between nodes to create connections (arrows)
- Highlight the currently active node during playback
- Double-tap a node to edit its properties

### Playback Engine

```typescript
class SongRunner {
  private current: SongNode
  private loopCount: number = 0

  advance(): string | null {
    // Determine next node when current node finishes playback
    if (this.current.type === 'branch') {
      return this.evaluateBranch(this.current)
    }
    // Default: transition to outputs[0]
    return this.current.outputs[0] ?? null
  }
}
```

- Worklet-side pattern playback remains unchanged
- Main thread SongRunner manages pattern transitions
- On node transition: `engine.sendPattern()` + `reset: true`

## Naming Candidates

- **Node Chain** — Simple, conveys extension of the existing chain concept
- **Node Tracker** — Nod to tracker culture
- **Song Graph** — Technically accurate (DAG / cyclic graph)

## Incremental Implementation

### Step 1: Linear Chain Extension
- Add repeat count to existing pattern chain (ADR 013)
- UI remains the traditional list format

### Step 2: Node Canvas
- Add SONG view
- Pattern nodes + connections only (no branching)

### Step 3: Conditional Branching + FX Nodes
- Branch node
- FX Send / Scene / Perf nodes

## Consequences

- **Positive**: Visualize and edit entire song structure at a glance
- **Positive**: Supports both live performance and composition workflows
- **Positive**: Visual programming fun à la Max/MSP
- **Negative**: High implementation cost (canvas UI, node editor, playback engine)
- **Negative**: Mobile UI is challenging (drag & drop + zoom on small screens)
- **Negative**: Learning curve — more complex than simple pattern chains

## Open Questions

- Are there real-time constraints on node transitions (gapless, zero-sample transition)?
- Should branch conditions include MIDI CC / external input?
- Final name: go with Node Chain, or consider alternatives?
