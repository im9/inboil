# ADR 032: Song View — M8-Style Phrase/Chain/Song Structure

## Status: PROPOSED (Discussion)

## Context

### Problems with Current Structure

Current INBOIL data model:

```
PatternBank[100]
  └── Pattern
        ├── bpm, rootNote, name
        └── Track[8]  (KICK, SNARE, ..., LEAD)
              └── Trig[steps]

Chain
  └── ChainEntry[]  (global, linear)
        ├── patternId
        ├── repeats, key, oct
        └── perf, fx overrides
```

**Pain points:**
1. **Pattern = all 8 tracks bundled** — changing just the KICK requires copying the entire pattern
2. **Chain is a single global list** — all tracks advance in lockstep, no per-track independence
3. **Limited live flexibility** — chain is a fixed sequence with no branching or per-track variation
4. **Flat 100-pattern list** — no structural grouping, hard to manage at scale

### Reference: M8 Tracker

The Dirtywave M8 uses a three-tier hierarchy:

```
Song (8 columns = 8 tracks, up to 256 rows)
  └── Chain (per track, ordered list of phrases, max 256)
        └── Phrase (16-step sequence, max 256 per track)

Song row 00:  Track 1:[C00]  Track 2:[C10]  Track 3:[C20]  ...
Song row 01:  Track 1:[C01]  Track 2:[C10]  Track 3:[C21]  ...
Song row 02:  Track 1:[C02]  Track 2:[C11]  Track 3:[C22]  ...
```

Key properties:
- **Phrase** = step sequence for a single track (note, instrument, volume, FX per step)
- **Chain** = ordered list of phrase references for a single track
- **Song** = 8 parallel chain columns, one per track — each track advances independently
- Tracks can have different chain lengths → natural polyrhythm
- Same phrase can appear in multiple chains → reuse without copying

### Why M8 Over Ableton Session View

Ableton's Session View introduces Clips and Scenes with independent launch/stop per clip. While powerful, it adds complexity that conflicts with INBOIL's step-sequencer-first approach:

- Scene = row-based launch (all tracks switch simultaneously) — useful but adds an extra abstraction layer
- Per-clip launch with independent loop points — complex playhead management
- Clip ≠ fixed step count — Ableton clips can be any length with loop markers

M8's model is simpler and more natural for a step sequencer:
- Phrase is always a fixed-length step sequence (like INBOIL's current per-track data)
- Chains provide per-track sequencing without a separate "scene" concept
- Song rows align chains across tracks — launching a row is equivalent to Ableton's scene launch
- No need for independent clip launch/stop — chains auto-advance

**"All tracks switch together"** is just a special case: set all chains to advance at the same song row. Per-track independence is free without extra abstractions.

## Proposed Design

### Data Model

```
Song
  └── SongRow[]                  (up to 256 rows)
        └── chainId per track    (8 columns)

Track[8]
  ├── name, synthType, volume, pan, muted   (instrument config)
  ├── phrases: Phrase[]          (up to 128 per track)
  └── chains: Chain[]            (up to 128 per track)

Chain
  └── entries: PhraseRef[]       (ordered list, max 16 entries)
        └── phraseId, transpose

Phrase
  ├── steps: number              (1–64)
  ├── trigs: Trig[]
  ├── voiceParams: Record<string, number>
  └── sends: { reverb, delay, glitch, granular }
```

#### Interfaces

```typescript
/** Single-track step sequence (formerly the sequence data inside Track) */
interface Phrase {
  id: number
  name: string            // max 6 chars, e.g. "INTRO", "DROP1"
  steps: number           // 1–64
  trigs: Trig[]
  voiceParams: Record<string, number>
  reverbSend: number
  delaySend: number
  glitchSend: number
  granularSend: number
}

/** Ordered list of phrase references for one track */
interface Chain {
  id: number
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
  phrases: Phrase[]       // pool of phrases for this track (max 128)
  chains: Chain[]         // pool of chains for this track (max 128)
}

/** Song row = which chain to play per track */
interface SongRow {
  chainIds: (number | null)[]  // 8 entries, one per track (null = silence/skip)
  repeats: number              // how many times this row loops (1–16)
}

/** Song = top-level arrangement */
interface Song {
  name: string
  bpm: number
  rootNote: number
  rows: SongRow[]              // up to 256 rows
}
```

### Relationship to Current Model

| Current | New (M8-style) | Notes |
|---------|----------------|-------|
| `Pattern` | `Song` + per-track `Phrase` pool | Pattern's 8 tracks split into independent phrases |
| `Track.trigs[]` | `Phrase.trigs[]` | Sequence data moves from track to phrase |
| `Track.voiceParams` | `Phrase.voiceParams` | Voice params become per-phrase (allows timbral variation) |
| `Track.synthType/volume/pan` | `Track.synthType/volume/pan` | Instrument config stays on track (unchanged) |
| `ChainEntry` | `SongRow` + `Chain` | Global chain splits into song rows referencing per-track chains |
| `ChainEntry.perf/fx` | `SongRow` metadata or separate automation | Performance FX tied to song position, not chain entry |

### Dual View: Step Grid + Tracker

The step grid and tracker are two views editing the same Phrase data.

```typescript
type EditView = 'grid' | 'tracker' | 'piano'
```

#### Step Grid (current UI, unchanged)

```
KICK  Phrase 00
[■][·][·][·][■][·][·][·][■][·][■][·][■][·][·][·]
```

Horizontal layout. Each cell = one trig. Tap to toggle. Same as today.

#### Tracker View (new)

```
KICK  Phr.00
────────────────────────
 ST │ NOTE │ VEL │ DUR │ FX1  │ FX2
 00 │ C-2  │ .80 │ 01  │ ---  │ ---
 01 │ ---  │ --- │ --  │ ---  │ ---
 02 │ ---  │ --- │ --  │ ---  │ ---
 03 │ C-2  │ .64 │ 01  │ ---  │ ---
 04 │ ---  │ --- │ --  │ ---  │ ---
 05 │ ---  │ --- │ --  │ ---  │ ---
 06 │ E-2  │ .80 │ 02  │ SLD  │ ---
 07 │ ---  │ --- │ --  │ ---  │ ---
 08 │ C-2  │ .80 │ 01  │ ---  │ CUT:45
 09 │ ---  │ --- │ --  │ ---  │ ---
 0A │ ---  │ --- │ --  │ ---  │ ---
 0B │ G-2  │ .7F │ 01  │ ---  │ ---
 0C │ ---  │ --- │ --  │ ---  │ ---
 0D │ ---  │ --- │ --  │ ---  │ ---
 0E │ C-2  │ .80 │ 01  │ ARP:3│ ---
 0F │ ---  │ --- │ --  │ ---  │ ---
────────────────────────
```

Vertical layout. Columns:
- **ST**: step number (hex, M8-style)
- **NOTE**: note name + octave (C-2, D#4, etc.) or `---` for empty
- **VEL**: velocity as hex (00–FF) or decimal (.00–1.0)
- **DUR**: duration in steps
- **FX1/FX2**: parameter lock shorthand (SLD=slide, CUT=cutoff, ARP=arpMode, etc.)

Navigation: arrow keys (up/down = step, left/right = column). Virtual keyboard (ADR 031) for note entry.

Both views read/write the same `Phrase.trigs[]` array — switching views is purely cosmetic.

### Song View UI

New top-level view (`ui.view = 'song'`), inspired by M8's Song screen.

#### Desktop Layout

```
SONG VIEW                                    BPM: 128
──────────────────────────────────────────────────────────────
 ROW │ KICK   │ SNARE  │ CLAP   │ C.HH   │ O.HH   │ BASS   │ LEAD   │ CHORD  │ ×RPT
──────────────────────────────────────────────────────────────
►00  │ C:00   │ C:00   │ C:00   │ C:00   │ C:00   │ C:00   │ C:00   │ C:00   │ ×04
 01  │ C:00   │ C:00   │ C:01   │ C:00   │ C:01   │ C:01   │ C:01   │ C:00   │ ×04
 02  │ C:01   │ C:01   │ C:00   │ C:01   │ C:00   │ C:02   │ C:02   │ C:01   │ ×02
 03  │ C:02   │ C:00   │ C:01   │ C:00   │ C:01   │ C:00   │ C:03   │ C:00   │ ×01
 --  │ --     │ --     │ --     │ --     │ --     │ --     │ --     │ --     │
──────────────────────────────────────────────────────────────
                                                            [+ ROW]  [CLR]
```

- **C:NN** = Chain ID (hex). Tap cell to cycle through available chains for that track.
- **►** = current playback position
- **×RPT** = repeat count for the row
- **--** = empty row (end of song, loops back to row 00)
- Tap a chain cell to select it → lower panel shows that chain's phrase list

#### Chain Editor (sub-panel, shown when chain cell is selected)

```
KICK Chain 00: [P:00][P:01][P:00][P:02]  [+ ADD] [×]
               ↑ transpose: +0  +0   +0   +12
```

- Tap phrase slot to select → step grid / tracker / piano roll edits that phrase
- Transpose per phrase entry (semitone offset)

#### Mobile Layout

```
┌──────────────────────────────┐
│ SONG  Row:00  ×04            │  ← current row info
│ KCK:C00 SNR:C00 BAS:C01 ... │  ← chain IDs per track (compact)
│ [00] [01] [02] [03] [--]    │  ← row list (horizontal scroll)
├──────────────────────────────┤
│  Chain 00: P00 → P01 → P00  │  ← selected chain
├──────────────────────────────┤
│  [Step Grid / Tracker]       │  ← editing selected phrase
├──────────────────────────────┤
│  [Param Panel]               │
└──────────────────────────────┘
```

### Playback

#### Song Playback

```typescript
interface SongPlayback {
  playing: boolean
  currentRow: number         // current song row index
  rowRepeatCount: number     // repeats completed for current row
  trackPlayheads: number[]   // per-track step position within current phrase
  trackChainPos: number[]    // per-track position within current chain
}
```

Song advances row-by-row. Within each row, each track plays through its chain's phrase list independently:

```typescript
function advanceSongStep() {
  for (let t = 0; t < 8; t++) {
    trackPlayheads[t]++
    const chain = getChainForTrackAtRow(t, currentRow)
    const phrase = chain.entries[trackChainPos[t]]

    if (trackPlayheads[t] >= phrase.steps) {
      // Phrase complete → advance to next phrase in chain
      trackPlayheads[t] = 0
      trackChainPos[t]++

      if (trackChainPos[t] >= chain.entries.length) {
        // Chain complete for this track
        trackChainPos[t] = 0
        // Check if ALL tracks have completed their chains
        if (allTracksChainComplete()) {
          rowRepeatCount++
          if (rowRepeatCount >= song.rows[currentRow].repeats) {
            // Advance to next song row
            currentRow++
            rowRepeatCount = 0
            if (currentRow >= song.rows.length || !song.rows[currentRow]) {
              currentRow = 0  // loop song
            }
            loadRowChains(currentRow)
          }
        }
      }
    }
  }
}
```

**Key rule:** Song row advances only when **all tracks** have completed their chains for the required number of repeats. Tracks with shorter chains wait (loop their chain) until the longest track finishes.

#### Compatibility: Pattern Mode

For quick sketching without the full song structure, keep a "Pattern Mode" that works like today:

```typescript
type PlayMode = 'pattern' | 'song'
```

- **Pattern Mode**: Single phrase per track, loops forever. Equivalent to current behavior. No chains, no song rows.
- **Song Mode**: Full Phrase → Chain → Song hierarchy.

Pattern Mode is the default. Song Mode is activated via the Song View.

### Performance FX Integration

Current chain FX (perf, verb, delay, glitch, granular) move to song-row-level metadata:

```typescript
interface SongRow {
  chainIds: (number | null)[]
  repeats: number
  key: number | null         // root note override
  oct: number | null         // octave override
  perf: number               // 0=NONE, 1=FILL, 2=BRK, 3=REV
  perfLen: number            // steps (1/4/8/16)
  verb: ChainFx
  delay: ChainFx
  glitch: ChainFx
  granular: ChainFx
}
```

This preserves the existing chain FX workflow — just attached to song rows instead of chain entries.

### Migration from Current Model

Automatic migration path:

```
Current Pattern[i] → creates:
  1. One Phrase per track (8 phrases)
     Phrase[i*8+t] = { trigs, voiceParams, sends from Pattern[i].Track[t] }
  2. One Chain per track referencing that single phrase
     Track[t].chains[i] = { entries: [{ phraseId: i*8+t, transpose: 0 }] }
  3. One SongRow per pattern
     SongRow[i] = { chainIds: [i, i, i, i, i, i, i, i], repeats: 1 }

Current Chain → becomes Song.rows:
  ChainEntry[j].patternId → SongRow[j].chainIds (all tracks point to same-index chain)
  ChainEntry[j].repeats/key/perf/fx → SongRow[j].repeats/key/perf/fx
```

Result: identical behavior, but data is now in Phrase/Chain/Song structure.

## Implementation Phases

### Phase 1: Phrase Extraction (Internal Refactor)

Extract sequence data from Track into Phrase. No UI changes.

**Changed files:**
- `state.svelte.ts`: Add Phrase/Chain interfaces. Track holds `phrases[]` and `chains[]`. Current editing state references a phrase instead of a track's trigs directly.
- All components that read `track.trigs` → read `selectedPhrase.trigs` instead
- `engine.ts` / worklet: No change (still receives flat trig arrays per track)

**Verification:** Existing UI works identically. No visual difference.

### Phase 2: Tracker View

New `TrackerView.svelte` component as an alternative phrase editor.

**New files:**
- `src/lib/components/TrackerView.svelte`

**Changed files:**
- `PerfBar.svelte` or view toggle: Add 'tracker' option
- `App.svelte`: Route `ui.view = 'tracker'` to TrackerView

**Features:**
- Vertical step list with note/vel/dur/fx columns
- Arrow key navigation (up/down = step, left/right = column)
- Virtual keyboard input (ADR 031) for note entry
- Hex step numbers (M8 style)
- Playhead indicator

### Phase 3: Song View + Chain Editor

New `SongView.svelte` component for the M8-style song screen.

**New files:**
- `src/lib/components/SongView.svelte`
- `src/lib/components/ChainEditor.svelte`

**Changed files:**
- `state.svelte.ts`: Add Song, SongRow, SongPlayback state
- `PerfBar.svelte`: Add 'song' view toggle
- `App.svelte`: Route `ui.view = 'song'` to SongView
- Playback logic: Add song mode advancement

**Features:**
- 8-column song grid (one per track)
- Chain cell editing (tap to cycle chain ID)
- Song row repeat count
- Chain editor sub-panel (phrase list within selected chain)
- Song playback with per-track chain advancement
- Song row FX/perf metadata

### Phase 4: Polish + Advanced Features

- Per-phrase transpose in chain entries
- Phrase copy/paste between tracks
- Chain copy/paste
- Song row insert/delete/reorder
- Song presets (factory songs using factory phrases)
- Mobile-optimized song view

## Open Questions

1. **Phrase pool size** — 128 per track? 64? Balance between memory and usability.
2. **Chain entries limit** — 16 phrases per chain? M8 uses 16. Sufficient for most musical structures.
3. **Song row limit** — 256 like M8? 64 is probably enough for INBOIL's scope.
4. **Voice params per-phrase vs per-track** — M8 has "instrument" separate from phrase. Should INBOIL allow different voiceParams per phrase (timbral variation) or keep them on track (simpler)?
5. **BPM per song row?** — M8 allows tempo changes. Adds complexity to clock management.
6. **Tracker view on mobile** — Vertical scrolling list could work on mobile with large touch targets. Worth pursuing or desktop-only?

## Consequences

- **Positive:** M8-familiar structure for tracker users
- **Positive:** Per-track independence — change one track's sequence without affecting others
- **Positive:** Phrase reuse across chains reduces duplication
- **Positive:** Tracker view provides efficient keyboard-driven editing
- **Positive:** Step grid and tracker coexist as equal views of the same data
- **Positive:** Pattern Mode preserved for quick sketching without song complexity
- **Positive:** Phase 1 is invisible to users — pure internal refactor
- **Negative:** Significant data model restructure touching all components
- **Negative:** Song playback logic more complex (per-track chain advancement, synchronization)
- **Negative:** Tracker view requires keyboard navigation system (new input paradigm)
- **Risk:** Over-engineering for casual users — must keep Pattern Mode as the default, low-friction entry point
- **Trade-off:** M8's simplicity (no scene launch, no clip independence) means less live flexibility than Ableton — but matches INBOIL's step sequencer DNA better
- **Dependency:** Benefits from ADR 031 (Virtual Keyboard) for tracker note input
- **Dependency:** Benefits from ADR 029 (Undo/Redo) — destructive edits in tracker need undo
- **Supersedes:** ADR 013 (Pattern Chain) — chain concept is preserved but restructured
- **Complements:** ADR 024 (Project & Scene) — Project wraps Songs; Scene concept replaced by Song Rows

## References

- [Dirtywave M8 Tracker](https://dirtywave.com/pages/m8-tracker) — primary inspiration
- [M8 Headless Manual (Song/Chain/Phrase)](https://github.com/Dirtywave/M8HeadlessFirmware)
- [LSDJ (Gameboy tracker)](https://www.littlesounddj.com/) — similar Phrase/Chain/Song hierarchy
- [Renoise](https://www.renoise.com/) — modern tracker with pattern matrix
- ADR 013: Pattern Chain (current implementation, to be superseded)
- ADR 024: Project & Scene Hierarchy (complementary)
- ADR 031: Virtual MIDI Keyboard (tracker note input)
