# ADR 129: Genre-Aware Pattern Randomizer

## Status: Implemented

## Context

The current `randomizePattern()` (`src/lib/randomize.ts`) produces patterns that all sound acid-like — random scale notes scattered across steps with hardcoded probability tables. It uses its own chord progression list (`PROGRESSIONS`) and scale definitions, entirely disconnected from the generative engine (Tonnetz, Turing Machine, Quantizer) that already has sophisticated harmonic and rhythmic generation.

### Current problems

1. **One flavor** — Every randomized pattern sounds like an acid jam. No genre variety.
2. **Disconnected from generative engine** — Tonnetz can generate neo-Riemannian chord walks, Turing Machine can produce controlled-random rhythms, Quantizer can snap to chord tones — but `randomizePattern()` uses none of them.
3. **Hardcoded progressions** — 6 pop/rock/jazz progressions with diatonic triads. No house-style extended chords, no hip-hop swing, no ambient drones.

### What exists

- **Tonnetz** (`generative.ts`): `computeWalkPath()` returns pitch classes per step from neo-Riemannian transforms. Supports stepsPerTransform, voicing (close/spread/drop2), rhythm presets (all/legato/offbeat/onbeat/euclidean/turing), arpeggiation, 7th chords, anchors.
- **Turing Machine** (`generative.ts`): `turingGenerate()` produces trigs from a shift register. Lock parameter controls repetition vs randomness. Gate/note/velocity modes.
- **Quantizer** (`generative.ts`): `quantizeTrigs()` snaps notes to scale, chord tones (from Tonnetz walk), or generates harmony voices.
- **RND button**: Desktop in `PatternToolbar.svelte:272` (via `onRandom` prop from `App.svelte:500`), mobile in `MobileTrackView.svelte:294`.

## Decision

### 1. Genre presets

Each genre is a parameter profile that drives Tonnetz + Turing + Quantizer internally, plus drum probability tables.

```typescript
interface GenrePreset {
  id: string
  label: string
  bpmRange: [number, number]          // suggested BPM (applied on randomize)
  tonnetz: {
    startChord: [number, number, number]
    sequence: string[]                 // neo-Riemannian ops
    stepsPerTransform: number
    voicing: 'close' | 'spread' | 'drop2'
    chordQuality: 'triad' | '7th'
  }
  bass: {
    lock: number                       // Turing lock (0–1): higher = more repetitive
    density: number                    // Turing density
    octaveRange: [number, number]      // MIDI note bounds
    mode: 'root' | 'scale'            // root = chord root only, scale = scale tones
  }
  melody: {
    lock: number
    density: number
    octaveRange: [number, number]
    quantizeMode: 'chord' | 'scale'
  }
  drums: Record<string, number[]>     // voiceId → per-beat probability array (length 8)
  swing?: number                       // 0–1 swing amount
}
```

#### Initial genres

| Genre | Tonnetz | Bass | Melody | Drums | BPM |
|-------|---------|------|--------|-------|-----|
| **house** (default) | spread voicing, 7ths, spt=4, [P,L,R] walk | lock 0.7, root mode, C1–C2 | lock 0.3, chord mode, density 0.35 | 4-on-floor kick, offbeat hats, clap on 4 | 120–128 |
| **techno** | close voicing, triads, spt=8, minimal [P,''] | lock 0.9, root only, C1–C2 | lock 0.5, scale mode, density 0.2 | hard 4-on-floor, 16th hats, sparse snare | 128–140 |
| **hiphop** | drop2 voicing, 7ths, spt=4, [R,P,L] | lock 0.6, scale mode, C1–C3 | lock 0.2, chord mode, density 0.25 | boom-bap kick/snare, swing 0.6 | 80–95 |
| **ambient** | spread voicing, 7ths, spt=8, [L,'',P,''] | no bass track | lock 0.1, scale mode, density 0.15 | no drums or very sparse | 60–90 |
| **acid** | (legacy behavior) | Bass303, random scale notes | pentatonic scatter | current probability tables | 130–145 |

### 2. Generation pipeline

```
randomizePattern(genre)
  │
  ├─ Drums: genre.drums probability table → per-step coin flip (same approach as current)
  │
  ├─ Chords/Pads (poly tracks):
  │    tonnetzGenerate(genre.tonnetz, steps) → trigs with chord voicings
  │
  ├─ Bass:
  │    turingGenerate({mode:'gate', lock, density}, steps) → rhythm
  │    computeWalkPath(genre.tonnetz, steps) → chord context
  │    quantizeTrigs(rhythm, {mode:'chord', root-priority}, walkPath) → bass line
  │
  └─ Melody (melodic non-bass, non-poly tracks):
       turingGenerate({mode:'note', lock, density}, steps) → raw notes
       quantizeTrigs(raw, {mode: genre.melody.quantizeMode}, walkPath) → melody
```

The key insight: **Tonnetz defines the harmonic center**, Turing provides controlled randomness, Quantizer ensures everything stays in key. This reuses existing generative functions as a pipeline without creating scene graph nodes.

### 3. UI: Long-press genre selector

**Desktop** (`PatternToolbar.svelte`):
- Short press RND → randomize with current genre (default: house)
- Long press RND (300ms) → show genre popup menu

```
┌──────────┐
│ ● HOUSE  │  ← current selection indicated
│   TECHNO │
│   HIPHOP │
│   AMBIENT│
│   ACID   │
└──────────┘
     RND
```

**Mobile** (`MobileTrackView.svelte`):
- Same interaction: tap = randomize, long-press = genre menu

Selected genre is stored in `prefs` (persisted across sessions):
```typescript
// state.svelte.ts
prefs.randomGenre: string  // default: 'house'
```

### 4. Implementation

#### Phase 1: Genre presets + pipeline

1. Add `GenrePreset` type and preset definitions to `randomize.ts`
2. Refactor `randomizePattern()` to accept optional genre parameter
3. Wire Tonnetz/Turing/Quantizer functions for chord/bass/melody generation
4. Keep `acid` genre as wrapper around current logic (backward compat)
5. Add `prefs.randomGenre` to state

#### Phase 2: Long-press UI

6. Add long-press handler + popup to `PatternToolbar.svelte`
7. Add long-press handler + popup to `MobileTrackView.svelte`
8. Store selected genre in prefs

#### Phase 3: Tuning

9. Ear-test each genre, adjust probability tables and Turing/Tonnetz params
10. Add/refine genres based on results

### 5. Track assignment strategy

`randomizePattern()` iterates `currentPat.cells` and assigns generation by voice type:

| Voice category | Generation |
|---|---|
| Drum voices (`DRUM_VOICES`) | Genre drum probability table |
| Poly WT/FM (`polyMode >= 0.5`) | `tonnetzGenerate()` → chord pads |
| Bass303, Analog | Turing rhythm → Quantizer chord-root snap |
| Other melodic | Turing notes → Quantizer scale/chord snap |
| Sampler | Genre drum table if drum-mapped, skip otherwise |

This matches the current `randomizePattern()` dispatch logic but replaces the internals.

## Considerations

- **BPM change on randomize**: Genre presets include BPM ranges. Applying BPM on randomize could be surprising if the user has set a specific tempo. Decision: randomize BPM only if current BPM is outside the genre's range, or add a "Set BPM" checkbox in the genre popup.
- **No scene graph nodes created**: This feature uses generative functions directly, not through scene nodes. Users who want persistent generative behavior should use actual Tonnetz/Turing/Quantizer nodes in the scene graph.
- **Tonnetz startChord transposition**: Should respect `song.rootNote` / `perf.rootNote`. Generate in C, then transpose to current key.
- **Genre extensibility**: The preset structure is simple enough that user-defined genres could be added later (BACKLOG, not this ADR).

## Future Extensions

- User-defined genre presets (save current randomizer settings as a genre)
- Genre-aware demo song generation (combine with demo song initiative)
- Per-track genre override (e.g., house drums + ambient melody)
- Integration with AI Composer API (ADR 109) — LLM selects genre + tweaks params based on text prompt
