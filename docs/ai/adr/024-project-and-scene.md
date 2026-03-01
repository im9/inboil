# ADR 024: Project & Scene Hierarchy

## Status: PROPOSED

## Context

The current data model is a flat 100-pattern bank with no higher-level organization. Introducing an Octatrack-inspired Project → Bank → Pattern hierarchy, along with Scene (parameter snapshot) crossfader morphing, would enable richer live performance and project management.

### Octatrack Structure (Reference)

```
Set (storage)
  └── Project
        ├── 16 Banks (A–P)
        │     ├── 16 Patterns / bank (256 total)
        │     └── 4 Parts / bank (sound presets)
        │           └── 16 Scenes (crossfader snapshots)
        └── 8 Arrangements (song mode)
```

- **Bank**: Container for patterns. Bank A = patterns A01–A16
- **Part**: Sound configuration (machine assignments, effects, parameters). Patterns reference a Part
- **Scene**: Parameter value snapshots stored within a Part. Crossfader morphs between Scene A ↔ Scene B

**Scene ≠ Bank**: Scenes are not structural containers — they are performance tools for parameter morphing.

## Proposal

### Phase 1: Project Introduction

```typescript
interface Project {
  id: string
  name: string         // max 8 characters
  bpm: number          // project default BPM
  patterns: Pattern[]  // 0–99 slots (same as current)
  settings: ProjectSettings
}
```

- 1 Project = 100 patterns (wraps the existing patternBank)
- Multiple projects stored in localStorage / IndexedDB
- Project switching UI added to SYSTEM panel
- Import / Export (JSON)

### Phase 2: Scene (Crossfader Morphing)

```typescript
interface Scene {
  id: number           // 0–15
  name: string
  overrides: Record<number, Record<string, number>>
  // trackIdx → { paramKey: value }
  fxOverrides?: Partial<Effects>
}
```

- Up to 16 Scenes per project
- Select Scene A / Scene B and morph with a slider (0.0–1.0) via linear interpolation
- voiceParams + effect parameters overridden by Scene
- Crossfader added to FxPad or as a dedicated UI element

### Phase 3: Part (Sound Presets) — Future Consideration

Octatrack Parts are full sound presets. Since INBOIL currently has a fixed track layout (KICK/SNARE/...), Parts are not essential yet. Revisit after instrument selection (ADR 009) is implemented.

## Changed Files

| Phase | File | Changes |
|-------|------|---------|
| 1 | `state.svelte.ts` | Add Project type, move patternBank inside Project |
| 1 | `App.svelte` | Project load / switch logic |
| 1 | SYSTEM panel | Project management UI |
| 2 | `state.svelte.ts` | Scene type, crossfader state |
| 2 | `engine.ts` / `worklet-processor.ts` | Send Scene interpolation to worklet |
| 2 | New component | Scene selector + crossfader UI |

## Consequences

- **Positive**: Manage multiple live sets. Scene morphing adds expressive performance
- **Positive**: Familiar concept for Octatrack / Digitakt users
- **Negative**: Significant data model change. Requires localStorage migration
- **Negative**: Sample-level Scene interpolation increases CPU cost

## Open Questions

- Keep 100 patterns per project? Or introduce Bank subdivision?
- Scene crossfader UI placement (inside FxPad, header bar, or dedicated view?)
