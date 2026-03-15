# ADR 103: Orchestration Layer

## Status: Proposed

## Context

The current automation architecture has two layers:

1. **Layer 1 — Per-node decorators** (ADR 053/066): Single-node parameter changes (volume, filter, FX sends)
2. **Layer 2 — Cross-node automation** (ADR 093): Parameter curves spanning multiple nodes via `crossNode` spans

Both layers require the user to specify **exact parameters and values** — "delay feedback 0% → 80% over 4 nodes." This is powerful but demands deep knowledge of synthesis parameters and how they interact to create musical tension, release, energy, etc.

Most musicians think in terms of **mood and intensity**, not individual parameter values. A producer might say "build energy here" or "get darker and more sparse" — concepts that map to dozens of simultaneous parameter changes (filter opens, reverb widens, velocity increases, hi-hat density rises, etc.).

### The 佐村河内 figure score analogy

Samuragochi Mamoru (佐村河内守) famously communicated musical intent through hand-drawn "figure scores" — abstract shapes and mood annotations rather than traditional notation. His ghost-writer (新垣隆) interpreted these figures into fully orchestrated compositions. The shapes conveyed emotional arc, intensity, and texture without specifying individual notes or instruments.

This is the interaction model we want: **the user draws mood/intensity shapes, and AI interprets them into concrete multi-parameter automation.**

## Decision

### Layer 3: Orchestration figures

A new layer above cross-node automation. Users draw abstract shapes on the SceneView canvas over pattern node chains. AI interprets these figures into concrete parameter changes executed via Layer 2 (cross-node automation) and Layer 1 (per-node decorators).

```
Layer 3: Orchestration    ── mood/shape → AI → parameter plan
Layer 2: Cross-node auto  ── parameter curves spanning nodes (ADR 093)
Layer 1: Per-node decos   ── single-node parameter changes (ADR 053/066)
```

### Figure types

Figures are abstract visual elements drawn on the scene canvas, each carrying semantic meaning:

```
┌─────────────────────────────────────────────────┐
│  SceneView canvas                               │
│                                                 │
│     ╱╲                                          │
│    ╱  ╲         ← "intensity hill" figure       │
│   ╱    ╲                                        │
│  ╱      ╲                                       │
│ [A] ─→ [B] ─→ [C] ─→ [D] ─→ [E]               │
│                          ╲                      │
│                           ╲    ← "fade down"    │
│                            ╲                    │
└─────────────────────────────────────────────────┘
```

**Primitive figures:**

| Shape | Meaning | Parameter tendency |
|-------|---------|-------------------|
| Rising slope `╱` | Build / crescendo | Volume↑, filter open↑, density↑, reverb↑ |
| Falling slope `╲` | Decay / diminuendo | Volume↓, filter close↓, density↓ |
| Hill `╱╲` | Swell | Build then release |
| Valley `╲╱` | Dip | Strip back then restore |
| Plateau `▔` | Sustain intensity | Hold current energy level |
| Zigzag `╱╲╱╲` | Tension / agitation | LFO-like modulation, rhythmic variation |

### Figure placement

Figures are drawn with a dedicated tool (brush mode or overlay):

1. User selects the orchestration brush
2. Draws a freehand shape over a range of pattern nodes on the scene canvas
3. Shape is captured as a polyline (series of `{x, y}` points)
4. x-axis maps to node chain position (time), y-axis maps to intensity (0.0–1.0)
5. The spanned nodes are determined by the figure's horizontal extent

```typescript
interface OrchestrationFigure {
  id: string
  points: { x: number; y: number }[]  // normalized polyline
  nodeSpan: string[]                    // ordered node IDs covered
  mood?: string                         // optional user label: "epic", "intimate", "chaotic"
  generatedAutomations?: AutomationParams[]  // AI output (Layer 2/1 params)
}
```

### AI interpretation pipeline

When the user commits a figure (e.g., releases the draw gesture), the system sends context to the AI:

```
Input:
  - Figure shape (polyline)
  - Mood label (if provided)
  - Pattern content of spanned nodes (instruments, note density, velocity ranges)
  - Current parameter values (volumes, FX settings, filter states)
  - Available automation targets

Output:
  - Array of AutomationParams (cross-node or per-node)
  - Each with target, points, interpolation, crossNode span
```

The AI maps the abstract shape to concrete parameters based on:

- **Shape analysis**: Rising = increase, falling = decrease, steepness = rate of change
- **Musical context**: A build on sparse patterns might add hi-hat density and open filter; on dense patterns might focus on volume and reverb
- **Instrument awareness**: Knows which tracks exist and what parameters make sense for each
- **Taste model**: Learned preferences from user's existing decorators and parameter choices

### Preview and adjust

AI-generated automations are not applied blindly:

```
┌──────────────────────────────────────┐
│ ORCHESTRATION PREVIEW                │
│                                      │
│ Figure: ╱╲ (swell) over A→B→C→D     │
│ Mood: "epic build"                   │
│                                      │
│ Generated changes:                   │
│  ☑ master volume    0.6 → 1.0 → 0.7 │
│  ☑ delay feedback   0.2 → 0.6 → 0.2 │
│  ☑ filter cutoff    0.4 → 0.9 → 0.5 │
│  ☐ reverb mix       0.3 → 0.7 → 0.3 │  ← user unchecked this
│                                      │
│ [Regenerate]  [Apply]  [Cancel]      │
└──────────────────────────────────────┘
```

The user can:
- Toggle individual parameter automations on/off
- Adjust generated values before applying
- Regenerate with a different mood label
- Cancel entirely

On "Apply", the figure's automations are written as standard Layer 2/1 decorators — the figure itself is metadata, the execution is always through existing automation infrastructure.

### Scene canvas rendering

Applied figures render as translucent overlays on the scene canvas:

```
┌──────────────────────────────────────┐
│  ░░░╱╲░░░░░░░░                      │  ← translucent figure overlay
│  ░╱░░░░╲░░░░░░                      │
│  ╱░░░░░░╲░░░░░                      │
│ [A]──[B]──[C]──[D] ─→ [E]          │
│                                      │
│  "epic build"   ← mood label        │
└──────────────────────────────────────┘
```

- Figures are a separate visual layer (z-index above edges, below popups)
- Color-coded by mood category (warm = red/orange, cool = blue/purple, neutral = gray)
- Clicking a figure opens the preview panel for editing
- Deleting a figure removes its generated automations (with undo)

### Data model

```typescript
// Added to SceneGraph
interface SceneGraph {
  nodes: SceneNode[]
  edges: SceneEdge[]
  figures: OrchestrationFigure[]  // new
}
```

Figures are stored in the scene graph alongside nodes and edges. They reference nodes by ID but are independent — deleting a node that a figure spans truncates the figure or removes it if only one node remains.

## Considerations

- **AI dependency**: This feature requires an AI backend (Claude API) for interpretation. Offline/local mode needs a fallback — could be rule-based heuristics (shape → preset parameter mappings) without the nuance of AI interpretation
- **Latency**: AI interpretation adds latency to the draw-commit-preview cycle. Mitigated by showing the preview panel immediately with a loading state, and caching interpretations for identical shapes
- **Determinism**: Same shape + same context should ideally produce similar results. Temperature=0 or seed-based generation helps, but exact reproducibility is not guaranteed. The preview step lets users catch unexpected outputs
- **Relationship to ADR 093**: Orchestration figures are a **consumer** of cross-node automation, not a replacement. ADR 093 must be implemented first — figures generate `AutomationParams` with `crossNode` spans that execute through the existing automation engine
- **Complexity budget**: This is a high-complexity feature. The figure drawing, AI pipeline, preview UI, and scene rendering each have significant implementation scope. Phased rollout is essential
- **Alternative: preset-based approach**: Instead of freehand drawing, offer preset shapes (build, decay, swell, dip) from a menu. Simpler but less expressive. Could serve as Phase 1 with freehand as Phase 2
- **Mobile**: Figure drawing on touch screens is natural (finger drawing). Preview panel works as a bottom sheet. Main risk is precision of small-screen drawing over tiny node chips

## Implementation Phases

### Phase 1: Rule-based presets (no AI)
- Add `figures[]` to scene graph data model
- Preset figure menu (build, decay, swell, dip) — select and drop onto node range
- Rule-based parameter mapping (hardcoded shape → parameter curves)
- Preview panel with toggle/adjust
- Apply as standard cross-node automations (requires ADR 093)

### Phase 2: Freehand drawing
- Orchestration brush tool in scene canvas
- Freehand polyline capture and simplification
- Shape analysis (classify drawn shape into figure type)
- Mood label input (optional text field or tag picker)
- Figure overlay rendering on canvas

### Phase 3: AI interpretation
- Claude API integration for figure → automation mapping
- Context packaging (pattern content, current params, available targets)
- Streaming preview (show parameters as AI generates them)
- Regenerate with alternate mood
- Taste model: learn from user's manual edits to AI suggestions

### Phase 4: Refinement
- Figure editing (reshape existing figures, extend/shrink span)
- Figure templates: save and reuse custom figures across songs
- Multi-figure interaction: overlapping figures on same nodes blend their effects
- Undo integration for figure apply/delete/edit

## Future Extensions

- **Collaborative orchestration**: In multi-device mode (ADR 074), host draws figures while guest sees the result in real-time
- **Figure-to-figure transitions**: Define how one figure's end connects to the next figure's start (crossfade, hard cut, overlap)
- **Generative figures**: AI proposes figure placements based on the song structure ("your intro→verse transition could use a build here")
- **Emotion timeline**: A dedicated lane showing the overall emotional arc of the song, derived from all active figures — a macro view of the arrangement's energy profile
