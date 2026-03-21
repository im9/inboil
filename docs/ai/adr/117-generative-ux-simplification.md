# ADR 117: Generative UX Simplification

## Status: Proposed

## Context

Generative nodes (Turing / Quantizer / Tonnetz) are powerful but the current UX makes it unclear what happens when you connect one.

**Problems:**

1. **Nothing happens on connect**: Edge creation is topology only. No result is visible until the GEN button is pressed — "why did I connect this?"
2. **Target track is opaque**: Each node targets a single track, but the faceplate doesn't show which one
3. **Merge mode is unintuitive**: The difference between replace / merge / layer is hard to grasp at first sight. "layer = chord stacking" is especially unpredictable
4. **Multiple nodes cause confusion**: Two Turing nodes on the same pattern overwrite the same track with unpredictable results
5. **Armed generation is hidden**: The sparkle button in PatternToolbar enables loop-head auto-generation, but discoverability is low

**Current flow:**
```
1. Create generative node
2. Connect to pattern node via edge
3. Configure target track / merge mode / parameters in DockPanel
4. Press GEN button → first time results are visible
5. Scene playback auto-applies live generation
```

Steps 3–4 are a wall for beginners.

## Decision

### Principle: Connect = Immediate Effect

Generative nodes should produce **visible results the moment they are connected**. Configuration comes after.

### Phase 1: Auto-generate on Connect ✅

#### Auto-generate on edge creation

When `sceneAddEdge()` creates an edge from a generative node to a pattern node, automatically run generation.

```
Before:
  connect → (nothing) → manual GEN → see result

After:
  connect → auto generate → see result immediately
```

- GEN button remains as "regenerate" (for manual re-rolls)
- Undo groups connect + generate as a single action

#### Auto-regenerate on parameter change

When generative parameters are changed in the DockPanel, auto-regenerate:

- Debounced 300ms (avoid regenerating on every knob drag frame)
- Immediate regenerate on merge mode, target track, seed, and preset changes

### Phase 2: Target Track Visibility

#### Show target track name on faceplate

Display the target track name on the generative node faceplate:

```
┌─ Turing Node ──────────┐
│ ■ □ ■ ■ □              │
│ TM 8×0.5    → KICK     │  ← target track name
│ [GEN]                   │
└─────────────────────────┘
```

#### Prefer one generative per pattern

- Multiple generative nodes on one pattern are allowed, but warn when target tracks overlap
- On first connect, auto-select the first unused track (currently defaults to `ui.selectedTrack`)

### Phase 3: Merge Mode Simplification

Reduce 3 modes to 2:

| Current | After | Reason |
|---------|-------|--------|
| replace | **replace** | Keep as-is. Default |
| merge | **fill** | Only fills empty steps |
| layer | removed | Chord stacking is achievable via P-Locks. Extremely low usage |

- Default is "replace" (most predictable)
- DockPanel toggle simplified to 2 buttons
- Existing song data with `mergeMode: 'layer'` falls back to `'replace'`

## Implementation

### Changed Files

| File | Changes |
|------|---------|
| `sceneActions.ts` | `autoGenerateFromNode()`, auto-generate in `sceneAddEdge()`, debounced regen in `sceneUpdateGenerativeParams()` |
| `DockGenerativeEditor.svelte` | Auto-regenerate on merge mode / target track / seed / preset changes, target track display, merge mode 2-button |
| `scenePlayback.ts` | No changes (live mode unchanged) |

### Phasing

- **Phase 1** ✅: Auto-generate on connect + parameter change regeneration
- **Phase 2**: Target track visibility on faceplate
- **Phase 3**: Merge mode simplification (remove layer)

## Considerations

- **Auto-generate performance**: Generation itself is lightweight (~ms). UI update cost dominates but a single generation is fine
- **Undo granularity**: Connect + generate grouped as one undo — disconnecting reverts both
- **Layer mode removal**: Existing songs with `mergeMode: 'layer'` fall back to `'replace'`
- **Quantizer specifics**: Quantizer transforms input trigs rather than generating from scratch. In a Turing → Quantizer → Pattern chain, auto-generate fires on the last edge connection

## Future Extensions

- Preview audio playback before connecting (audition what a generative node would produce)
- Drag-and-drop generative nodes directly onto patterns (no manual edge required)
- Real-time parameter modulation during scene playback (ADR 090 worklet integration)
