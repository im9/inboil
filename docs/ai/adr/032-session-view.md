# ADR 032: Phrase/Chain/Song — M8-Style Data Model Restructure

## Status: PROPOSED

## Context

### Problems with Current Structure

```
PatternBank[100]
  └── Pattern { id, bpm, rootNote, name }
        └── Track[8]  { synthType, volume, pan, muted, voiceParams, sends }
              └── trigs: Trig[steps]

Chain (global, linear)
  └── ChainEntry[]  { patternId, repeats, key, oct, perf, fx }
```

**Pain points:**
1. **Pattern = all 8 tracks bundled** — changing just the KICK pattern requires duplicating the entire pattern
2. **Chain is a single global list** — all tracks advance in lockstep, no per-track independence
3. **Sequence data and instrument config are merged on Track** — voiceParams and trigs are coupled, preventing phrase reuse with different timbres

### Reference: M8 Tracker

The Dirtywave M8 uses a three-tier hierarchy:

```
Song (8 columns × up to 256 rows, played top to bottom)
  └── Chain (per track, ordered list of phrase refs)
        └── Phrase (single-track step sequence)
```

Key properties:
- **Phrase** = step sequence for one track (pure data, no playback logic)
- **Chain** = ordered list of phrase refs for one track (pure data)
- **Song** = linear arrangement of per-track chain assignments
- Same phrase reusable across chains; same chain reusable across song rows

### Design Principles

1. **Phrase and Chain are pure data** — no playback state, no ordering logic
2. **Playback controller is a separate layer** — only the controller knows about sequential vs non-linear advancement
3. **Linear first, non-linear possible later** — Song rows play top-to-bottom (M8-style). Non-linear scene launch can be added later by replacing the playback controller without changing Phrase/Chain/Track

This separation ensures:
- Linear → non-linear migration touches only the playback layer + UI
- Phrase/Chain data model is stable across both modes
- Pattern Mode (current behavior) is a degenerate case: 1 phrase per track, no chains

## Data Model

### Core Types

```typescript
/** Single-track step sequence (extracted from current Track) */
interface Phrase {
  id: number              // 0-based, scoped per track
  name: string            // max 6 chars, e.g. "INTRO", "DROP1"
  steps: number           // 1–64
  trigs: Trig[]
  voiceParams: Record<string, number>
  reverbSend: number      // 0.0–1.0
  delaySend: number       // 0.0–1.0
  glitchSend: number      // 0.0–1.0
  granularSend: number    // 0.0–1.0
}

/** Ordered list of phrase references for one track */
interface Chain {
  id: number              // 0-based, scoped per track
  entries: ChainPhraseRef[]  // max 16 entries
}

interface ChainPhraseRef {
  phraseId: number
  transpose: number       // semitone offset (-24 to +24), 0 = no change
}

/** Track = instrument config + phrase/chain pools */
interface Track {
  id: number
  name: string            // "KICK", "SNARE", etc.
  synthType: SynthType
  volume: number
  pan: number
  muted: boolean
  phrases: Phrase[]       // pool (max 128 per track)
  chains: Chain[]         // pool (max 128 per track)
  // NOTE: trigs, voiceParams, sends removed — now on Phrase
}

/** Song row = which chain to play per track at this position */
interface SongRow {
  chainIds: (number | null)[]  // 8 entries, one per track (null = skip)
  repeats: number              // 1–16
  key?: number                 // root note override (0–11)
  oct?: number                 // octave override
  perf?: number                // 0=NONE, 1=FILL, 2=BRK, 3=REV
  perfLen?: number             // steps (1/4/8/16)
  verb?: ChainFx
  delay?: ChainFx
  glitch?: ChainFx
  granular?: ChainFx
}

/** Song = top-level arrangement (linear sequence of rows) */
interface Song {
  name: string
  bpm: number
  rootNote: number        // 0–11
  tracks: Track[]         // 8 tracks
  rows: SongRow[]         // up to 256 rows
}
```

### Relationship to Current Model

| Current | New | Notes |
|---------|-----|-------|
| `Track.trigs[]` | `Phrase.trigs[]` | Sequence data moves to phrase |
| `Track.voiceParams` | `Phrase.voiceParams` | Per-phrase timbre (enables variation) |
| `Track.reverbSend` etc. | `Phrase.reverbSend` etc. | Per-phrase send levels |
| `Track.steps` | `Phrase.steps` | Step count is per-phrase |
| `Track.synthType/volume/pan/muted` | `Track.synthType/volume/pan/muted` | Instrument config stays on track |
| `Pattern { bpm, rootNote }` | `Song { bpm, rootNote }` | Song-level globals |
| `PatternBank[100]` | `Song.tracks[].phrases[]` | Flat bank → per-track phrase pools |
| `ChainEntry[]` (global) | `SongRow.chainIds[]` + per-track `Chain` | Per-track chain independence |

### Playback Controller (Separate Layer)

The playback controller owns all runtime state and advancement logic. Phrase/Chain/Track have no knowledge of playback.

```typescript
/** Runtime playback state — NOT part of the Song data model */
interface SongPlayback {
  mode: 'pattern' | 'song'
  currentRow: number
  rowRepeatCount: number
  trackPlayheads: number[]   // per-track step position within current phrase
  trackChainPos: number[]    // per-track position within current chain
}
```

**Pattern Mode** (default): Each track plays `phrases[0]` in a loop. No chains, no song rows. Equivalent to current behavior.

**Song Mode**: Row-by-row advancement. Within each row, each track plays through its assigned chain's phrase list. Song row advances when all tracks have completed their chains × repeats.

**Future non-linear mode**: Same Phrase/Chain data, different controller that responds to `launchScene(rowId)` or `launchClip(trackId, chainId)` with quantized triggering.

## Migration

Automatic, invisible to user:

```
Current Pattern[i] (8 tracks) →
  For each track t:
    phrases[i] = { trigs, voiceParams, sends from Pattern[i].Track[t] }
    chains[i]  = { entries: [{ phraseId: i, transpose: 0 }] }

  SongRow[i] = { chainIds: [i, i, i, ...], repeats: 1 }

Current global Chain.entries[j] →
  Song.rows[j] = { chainIds: [pattern_chain_id, ...], repeats, key, perf, fx }
```

Result: identical behavior, data now in Phrase/Chain/Song structure.

## Implementation Phases

### Phase 1: Phrase Extraction (Internal Refactor)

**Goal:** Extract sequence data from Track into Phrase. No UI changes. No new views. Everything works identically.

**Data changes in `state.svelte.ts`:**
- Add `Phrase` interface
- Add `phrases: Phrase[]` to Track
- Remove `trigs`, `voiceParams`, `steps`, `*Send` from Track interface
- Add accessor: `activePhrase(trackId)` → returns `track.phrases[activePhraseIndex]`
  - In Phase 1, `activePhraseIndex` is always 0

**UI component changes:**
- Every `track.trigs[i]` → `activePhrase(trackId).trigs[i]`
- Every `track.voiceParams` → `activePhrase(trackId).voiceParams`
- Every `track.steps` → `activePhrase(trackId).steps`
- Every `track.reverbSend` etc. → `activePhrase(trackId).reverbSend`
- Affected: StepGrid, MobileTrackView, DockPanel, MobileParamOverlay, PianoRoll, paramDefs/paramHelpers

**Engine/worklet:**
- `patternToWorklet()` flattens `activePhrase` back into flat track format for the worklet
- Worklet code unchanged (still receives flat WorkletTrack with trigs[])

**Undo:**
- `clonePattern()` → `cloneSong()` or extend to deep-clone phrases
- Snapshot format changes but undo behavior unchanged

**Verification:** `pnpm check` passes, all existing UI works identically, no visual difference.

### Phase 2: Song Model + Multi-Phrase

**Goal:** Enable multiple phrases per track. Add Chain and Song types. Pattern bank replaced by Song.

- Add `Chain`, `SongRow`, `Song` interfaces
- Replace `patternBank` with song-based storage
- Pattern switching → phrase/chain switching within a track
- Migrate existing `ChainEntry[]` → `Song.rows[]`
- Playback controller for song mode

### Phase 3: Song View UI

**Goal:** New view for song arrangement.

- `SongView.svelte` — 8-column grid (one per track), rows
- Chain editor sub-panel (phrase list within selected chain)
- Song row editing (chain IDs, repeats, perf/FX)
- View toggle in PerfBar: GRID | FX | EQ | CHN | SONG

### Phase 4: Tracker View (Optional)

**Goal:** M8-style vertical step editor as alternative to StepGrid.

- `TrackerView.svelte` — vertical list with NOTE/VEL/DUR/FX columns
- Keyboard navigation (arrow keys)
- Virtual keyboard (ADR 031) for note entry
- Both views edit the same `Phrase.trigs[]`

## Decided

- Linear song model (rows play sequentially, M8-style)
- Phrase/Chain as pure data, playback controller as separate layer
- voiceParams per-phrase (enables timbral variation)
- Pattern Mode preserved as default (quick sketching)
- Phase 1 first (invisible refactor) before any new UI

## Open Questions

1. **Phrase pool size** — 128 per track? More than enough or wasteful?
2. **Chain entries limit** — 16 phrases per chain (matches M8). Sufficient?
3. **Song row limit** — 256 like M8, or smaller (64)?
4. **BPM per song row?** — M8 allows tempo changes per row. Adds clock complexity.
5. **How to expose phrase switching in current UI before Song View?** — Phase 2 needs some UI for multi-phrase even without full Song View. Dropdown in DockPanel? Phrase ◄ ► in header?
6. **Persistence timing** — Implement ADR 020 after Phase 2 (new model settled) or after Phase 1 (still useful for single-phrase)?

## Consequences

- **Positive:** Per-track independence — change one track's pattern without duplicating everything
- **Positive:** Phrase reuse across chains reduces duplication
- **Positive:** Data model is future-proof for non-linear playback
- **Positive:** Phase 1 is invisible — pure refactor, zero user impact
- **Positive:** Pattern Mode preserved for casual use
- **Negative:** Phase 1 touches nearly every component (track.trigs → phrase.trigs)
- **Negative:** Song playback logic more complex (per-track chain advancement, synchronization)
- **Risk:** Phase 1 refactor is large — must be done carefully with thorough testing
- **Supersedes:** ADR 013 (Pattern Chain) — preserved but restructured
- **Dependency:** ADR 029 (Undo/Redo) — critical for destructive edits
- **Enables:** ADR 015 (Presets) on Phrase.voiceParams, ADR 020 (Persistence) on Song model

## References

- [Dirtywave M8 Tracker](https://dirtywave.com/pages/m8-tracker) — primary inspiration
- [LSDJ (Gameboy tracker)](https://www.littlesounddj.com/) — similar Phrase/Chain/Song hierarchy
- [Renoise](https://www.renoise.com/) — modern tracker with pattern matrix
- ADR 013: Pattern Chain (current, to be superseded)
- ADR 015: Named Instrument Presets (builds on Phrase.voiceParams)
- ADR 020: Data Persistence (builds on Song model)
- ADR 037: ChainView Redesign (UI evolves into Song View)
