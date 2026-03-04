# ADR 042: Section-Based Arrangement — Flatten Chain/Phrase into Inline Cells

## Status: Proposed

## Context

### Problem

ADR 032 introduced a 3-tier M8-style hierarchy: **Song → Chain → Phrase**. While structurally clean, it creates UX problems:

1. **Hierarchy too deep**: 3 levels of drill-down navigation (ADR 040) just to reach the step editor
2. **Step sequencer feels disconnected**: The 8-track StepGrid — the core editing experience — sits at the bottom of a deep hierarchy
3. **Chain/Phrase indirection rarely needed**: Phrase reuse is uncommon; copy-paste achieves the same result without shared-pool cognitive overhead
4. **Two separate views**: Song View (arrangement) and StepGrid (editing) require context-switching

### Insight

The 8-track StepGrid already represents one "section" of a song. Rather than layering a separate Song View on top, **extend the StepGrid vertically with section dividers**. The StepGrid becomes both the arrangement and the editor in one unified view.

### Goals

- One view, two zoom levels: navigator (macro) + StepGrid (micro), always visible together
- No drill-down: flat — scroll vertically between sections
- Preserve StepGrid UX: 8-track horizontal layout unchanged
- Simpler data model: no Chain, no Phrase pool, inline cell data

## Decision

### Flatten the Hierarchy

```
Before: Song → SongRow → chainIds → Chain → entries → Phrase → trigs
After:  Song → Section → Cell → trigs
```

Each **Section** holds inline step data for all 8 tracks. No shared pools, no indirection.

### Data Model

```typescript
/** Step data for one track in one section (replaces Phrase) */
interface Cell {
  steps: number                        // 1–64
  trigs: Trig[]                        // length === steps
  voiceParams: Record<string, number>  // per-cell timbre (inherits from ADR 032)
  reverbSend: number                   // 0.0–1.0
  delaySend: number
  glitchSend: number
  granularSend: number
}

/** One arrangement section (replaces SongRow + Chain) */
interface Section {
  cells: Cell[]          // 8 fixed (one per track)
  repeats: number        // 1–16
  key?: number           // root note override (0–11)
  oct?: number           // octave override
  perf?: number          // 0=NONE, 1=FILL, 2=BRK, 3=REV
  perfLen?: number       // 1/4/8/16 steps
  verb?: ChainFx         // per-section FX overrides
  delay?: ChainFx
  glitch?: ChainFx
  granular?: ChainFx
}

/** Track = instrument config only */
interface Track {
  id: number
  name: string
  synthType: SynthType
  volume: number
  pan: number
  muted: boolean
  // REMOVED: phrases[], chains[]
}

/** Song = flat arrangement of sections */
interface Song {
  name: string
  bpm: number
  rootNote: number
  tracks: Track[]        // 8 fixed
  sections: Section[]    // 64 fixed (always exist)
}
```

Trig type is unchanged.

### Fixed 64 Sections

All 64 sections always exist. No add/delete. Empty sections (all trigs inactive) are available for editing at any time.

- 64 sections × 64 max steps ≈ 8.5 min without repeats
- With repeats (×16 each) → well over an hour
- Memory: ~320 KB at 16 default steps — negligible

### UI: Navigator + Extended StepGrid

```
┌──────────────────────────────────────────────┐
│ PerfBar: ▶ STOP  BPM  KEY  [GRID|TRKR]      │
├──────────────────────────────────────────────┤
│ Navigator: [00][01][02][03]...[63]  LP 0-3   │
├──────────────────────────────────────────────┤
│ ═══ Section 00 (×2) ════════════════════════ │
│ KICK  ░░█░ ░░█░ ░░█░ ░░█░                   │
│ SNARE ░░░░ █░░░ ░░░░ █░░░                   │
│ CLAP  ░░░░ ░░░░ ░█░░ ░░░░                   │
│ ...8 tracks...                               │
│ ═══ Section 01 (×1) ════════════════════════ │
│ KICK  █░░░ █░░░ █░░░ █░░░                   │
│ SNARE ░░█░ ░░░█ ░░█░ ░░░█                   │
│ ...                                          │
│ (vertically scrollable)                      │
└──────────────────────────────────────────────┘
```

**Navigator** (compact strip):
- 64 slots, horizontally scrollable on mobile
- Visual state: has-data (filled), playing (bright), in-loop-range (border)
- Click slot → StepGrid scrolls to that section
- Drag to set loop range

**StepGrid** (extended vertically):
- Current 8-track horizontal layout **unchanged**
- Section dividers between sections (show section#, repeats, key/oct)
- Vertical scrolling between sections
- Navigator ↔ StepGrid scroll positions synced

**TrackerView** also extends vertically with section dividers (natural tracker fit).

### Selection Model

```typescript
ui: {
  currentSection: number    // 0–63 (replaces activePhrases + songNav)
  selectedTrack: number     // 0–7 (existing)
  phraseView: 'grid' | 'tracker'  // kept
  // REMOVED: songNav, activePhrases
}
```

Click a step → sets currentSection + selectedTrack. DockPanel shows voiceParams for `sections[currentSection].cells[selectedTrack]`.

### Playback

Sequential playback with loop range:

```typescript
playback: {
  playing: boolean
  loopStart: number     // 0–63 (default 0)
  loopEnd: number       // 0–63 (default 0)
  currentSection: number
  repeatCount: number
  playheads: number[8]
}
```

- `loopStart=0, loopEnd=0` → loops section 0 only (= current phrase-mode UX)
- `loopEnd=3` → plays sections 0→1→2→3, loops back to 0
- Each section plays `section.repeats` times before advancing
- Section advancement: when track 0 completes its cycle (current behavior)
- **No "song mode" vs "phrase mode"** — it's always sections. Single section on loop IS phrase mode.

### Engine

`patternToWorklet()` reads directly from sections — no chain resolution, no phrase lookup:

```typescript
const cell = s.sections[currentSection].cells[i]
return {
  steps: cell.steps,
  trigs: cell.trigs.map(trig => mapTrig(trig)),
  voiceParams: { ...cell.voiceParams },
  reverbSend: cell.reverbSend, // ...
}
```

## Migration

### On Load (Saved Data)

```
song.rows[r] + track.chains[chainId].entries[0] → track.phrases[phraseId]
  ==> sections[r].cells[t] = copy of that Phrase's data
       + row metadata (repeats, key, perf, FX)

Remaining sections (beyond row count) → empty cells
Track.phrases[], Track.chains[] → removed
```

Multi-entry chains (rare): first entry only, or expand into consecutive sections.

### Factory Presets

Each factory preset → one section. Default song: 21 sections from factory presets, section 0 active.

## Implementation Phases

### Phase 1: Data Model Flatten

1. Add `Section`, `Cell` types
2. Replace `Song.rows` + `Track.phrases/chains` → `Song.sections`
3. `Track` = instrument config only
4. Replace `ui.activePhrases` → `ui.currentSection`
5. Update `patternToWorklet()` to read from sections
6. Update all UI: `phrase.trigs` → `sections[currentSection].cells[trackId].trigs`
7. Update `clonePattern()`/undo for new structure
8. Migration function for saved data
9. Factory preset builder updated
10. StepGrid shows **one section** at a time (identical UX — validation step)

### Phase 2: Section Navigator

1. `SectionNav.svelte` — compact strip, 64 slots
2. Click to switch `currentSection`, visual indicators
3. Loop range selection (drag or input)
4. Playback position indicator
5. Place between PerfBar and main view
6. Remove old SongView (absorbed into navigator)

### Phase 3: Multi-Section StepGrid

1. StepGrid renders multiple sections vertically with dividers
2. Section divider bars (section#, repeats, key/oct)
3. Vertical scrolling, navigator ↔ StepGrid scroll sync
4. TrackerView also gets section dividers
5. Playback position visible across sections

### Phase 4: Cleanup

1. Remove ChainView, ChainEditor, Breadcrumb drill-down
2. Remove `songNav.level`, `songNav.chainId`, `songNav.entryIndex`
3. Remove chain/phrase helpers from state
4. Update ADR index

## Considerations

- **Phase 1 is safe**: Data refactor, identical UX. Easy to verify.
- **voiceParams on Cell**: Per-cell timbre (from ADR 032). Duplication exists, but cells are self-contained and copy-paste works cleanly. If global timbre editing is needed, a "apply to all sections" action can be added later.
- **Per-track step counts**: Each Cell has its own `steps` — different tracks in the same section can have different lengths. Already supported by the worklet.
- **No phrase reuse**: Copy-paste between cells replaces shared pools.
- **Mobile**: Navigator scrolls horizontally, StepGrid vertically. Same layout, smaller.

## Supersedes

| ADR | Impact |
|-----|--------|
| 032 (Phrase/Chain/Song) | Data model replaced — Section/Cell instead of Chain/Phrase pools |
| 037 (Chain View Redesign) | ChainView removed entirely |
| 040 (Drill-down Navigation) | Flat navigation, no drill-down |
| 041 (Unified Navigation) | Further simplified — no breadcrumb levels, no mode toggle |

## Future Extensions

- **Collapsible sections**: Collapse empty sections for compact view
- **Section templates**: Save/load patterns (clipboard, not pool)
- **Live section launch**: Queue next section from navigator (Ableton-style)
- **Section automation**: Per-section BPM / time signature
- **Global voiceParams mode**: Edit Track-level params that apply to all sections at once
