# ADR 130: Pads View & Sample Pack Expansion

## Status: Implemented (Phase 1 UI) / Proposed (Phase 2–3, Sample Expansion)

## Context

The sampler DSP is surprisingly capable — 8-voice poly, WSOLA time-stretch,
chop (8/16/32 slices with NOTE-MAP and SEQ modes), reverse, BPM sync, and
multi-sample zone support (ADR 012, ADR 106). But the UI is cramped into the
280px DockPanel alongside every other voice type.

**Current pain points:**

1. **Waveform too small** — chop slice markers are barely visible, no zoom/scroll
2. **No pad UI** — chop slices exist in DSP but there's no MPC-style interaction
3. **Start/end editing is knob-only** — should be draggable on waveform
4. **Sample browser is a dropdown** — constrained within DockPanel width
5. **Factory samples lack genre coverage** — 111 files / 1.9 MB total; only 2 claps,
   zero bass oneshots, zero chord/stab, zero FX/risers. Hip-hop, DnB, and
   dariacore are unplayable without user imports
6. **Sampler Sheet hierarchy is too deep** — reaching the sampler editing UI
   requires voice selection, double-tap, or a dock button. Multiple layers
   of navigation make it feel disconnected from the pattern workflow

The sampler is fundamentally different from synth voices — it needs visual space
for waveforms, spatial interaction for chop editing, and a pad grid for slice
triggering. Synth knobs fit fine in 280px; sampler does not.

### Key Insight: Pads as a Pattern View

The 4×4 pad grid (16 pads) maps naturally to track selection (max 16 tracks).
The step row is already a single-track step sequencer. The waveform area can
display tone/ADSR/algorithm visualizations for non-sampler voices. This means
the "Pads view" is not sampler-specific — it is a **third pattern editing
mode** alongside Grid and Tracker, offering a pad-centric workflow for any
voice type.

### Inspiration

- **AKAI MPC Sample**: immediate pad workflow, visual chop, transient detection
- **Elektron Octatrack**: real-time sample mangling via start/end manipulation,
  per-slice parameter locks, crossfader performance

The goal is not to clone either device, but to bring their most satisfying
interactions into the browser within inboil's existing architecture.

## Decision

### Phase 1: Pads View (Tab) + Sample Expansion

#### 1.1 Round Out Tabs — Grid / Pads / Tracker

Promote the pattern editor mode from a hidden system toggle to a first-class
**round out tab bar** at the top of the pattern sheet. Three tabs:

```
┌──────────┐╭──────────╮╭──────────╮
│   Grid   ││   Pads   ││ Tracker  │
└──────────┘╰──────────╯╰──────────╯
┌──────────────────────────────────────────────┐
│  (pattern content area)                      │
│                                              │
└──────────────────────────────────────────────┘
```

The active tab has a light background (`--color-bg`) with rounded top corners
that merge smoothly into the content area below via inverse border-radius
("round out" or "cutout" corners). Inactive tabs use the dark zone
(`--color-fg`) with `--dz-text-mid` text.

**State change:**
```typescript
// Before
prefs.patternEditor: 'grid' | 'tracker'

// After
prefs.patternEditor: 'grid' | 'pads' | 'tracker'
```

The existing `togglePatternEditor()` becomes unnecessary — tab clicks set
`prefs.patternEditor` directly. The system sidebar toggle can be removed.

**Tab renders:**
| Tab       | Content                                         |
|-----------|-------------------------------------------------|
| Grid      | Existing `StepGrid` (all tracks, horizontal)    |
| Pads      | Pads + Waveform/Viz + StepRow + Params (new)    |
| Tracker   | Existing `TrackerView` (vertical scroll)         |

Grid and Tracker remain **exactly as they are** — no changes to their UX.

#### 1.2 Pads View Layout

The Pads tab is a full-pattern editing view, not a single-voice tool.
It always operates on the **selected track** and adapts its display based
on the track's `voiceId`.

```
 DockPanel (280px)             Pads View (pattern content area)
┌─────────────────┐  ┌──────────────────────────────────────────────┐
│ (track params   │  │ ┌─Grid──┐┌──Pads──────────────┐┌Tracker┐   │
│  or Pool when   │  │ └───────┘│  (active, light bg) │└───────┘   │
│  sampler voice) │  │ ─────────────────────────────────────────────│
│                 │  │                                              │
│ ┌─ Pool ──────┐ │  │  ┌─ Waveform / Voice Viz ────────────────┐  │
│ │ [🔍 search ]│ │  │  │                                        │  │
│ │ ▸ kicks     │ │  │  │  (sampler: waveform + chop markers)    │  │
│ │ ▸ snares    │ │  │  │  (synth: tone / ADSR / algorithm)      │  │
│ │ ▸ claps     │ │  │  │                                        │  │
│ │             │ │  │  └────────────────────────────────────────┘  │
│ └─────────────┘ │  │                                              │
│                 │  │  ┌─ Pads ────────┐  ┌─ Params ───────────┐  │
│                 │  │  │ [1] [2] [3] [4]│  │ DCY STRT END       │  │
│                 │  │  │ [5] [6] [7] [8]│  │ PTCH REV CHOP      │  │
│                 │  │  │ [9] [10][11][12]│  │ MODE BPM LOOP      │  │
│                 │  │  │ [13][14][15][16]│  │ STRC               │  │
│                 │  │  └────────────────┘  └────────────────────┘  │
│                 │  │                                              │
│                 │  │  ┌─ Step Sequencer (selected track) ──────┐  │
│                 │  │  │ [■][□][■][□] [■][■][□][□] [□][■]…      │  │
│                 │  │  └────────────────────────────────────────┘  │
└─────────────────┘  └──────────────────────────────────────────────┘
```

#### 1.3 Pad Modes (tri-mode)

The 4×4 pad grid has three modes, selected by a **mode switch** above
the pad area:

```
  [TRACK]  [SLICE]  [NOTE]    ← mode switch (olive tier, 3-way)
 ┌────┬────┬────┬────┐
 │KCK │SNR │HAT │CLP │        TRACK mode: instrument labels
 ├────┼────┼────┼────┤
 │BAS │PAD │WT  │FM  │
 ├────┼────┼────┼────┤
 │    │    │    │    │
 ├────┼────┼────┼────┤
 │    │    │    │    │
 └────┴────┴────┴────┘

  [TRACK]  [SLICE]  [NOTE]
 ┌────┬────┬────┬────┐
 │  1 │  2 │  3 │  4 │        SLICE mode: slice numbers
 ├────┼────┼────┼────┤
 │  5 │  6 │  7 │  8 │
 ├────┼────┼────┼────┤
 │  9 │ 10 │ 11 │ 12 │
 ├────┼────┼────┼────┤
 │ 13 │ 14 │ 15 │ 16 │
 └────┴────┴────┴────┘

  [TRACK]  [SLICE]  [NOTE]   OCT [▲][▼] 3
 ┌────┬────┬────┬────┐
 │ C3 │ C#3│ D3 │ D#3│        NOTE mode: note names + octave
 ├────┼────┼────┼────┤
 │ E3 │ F3 │ F#3│ G3 │
 ├────┼────┼────┼────┤
 │ G#3│ A3 │ A#3│ B3 │
 ├────┼────┼────┼────┤
 │ C4 │ C#4│ D4 │ D#4│
 └────┴────┴────┴────┘
```

**TRACK mode:**
- Each pad = **track selector** — label shows instrument name
- Color-coded by voice type
- Active track highlighted (olive)
- Empty pads (beyond track count) are dimmed/inactive
- Tap to switch the selected track — waveform/viz, params, and
  step row all update to reflect the newly selected track

**SLICE mode (sampler voice only):**
- Each pad = chop slice (pad N → `rootNote + N` noteOn)
- Tap to audition slice
- Visual feedback on active slice during playback
- Velocity from `PointerEvent.pressure` when available
- Step input: tap pad while holding step → write note/slice

**NOTE mode (non-sampler voices):**
- Each pad = chromatic note, 16 consecutive semitones
- Label shows note name (`C3`, `D#3`, etc.)
- OCT ▲▼ buttons shift the base octave (reuses PatternToolbar logic)
- Tap to audition note via `noteOn`
- Step input: tap pad while holding step → write note into sequencer
- Velocity from `PointerEvent.pressure` when available

**Auto-switch:** When the selected track changes voice type, pad mode
auto-switches: sampler → SLICE, non-sampler → NOTE. TRACK mode is
always available regardless of voice type, and the user can manually
switch to any mode at any time.

**Mode availability:**
| Voice type | TRACK | SLICE | NOTE |
|------------|-------|-------|------|
| Sampler    | yes   | yes   | yes  |
| Synth/Drum | yes   | no    | yes  |

This tri-mode design means the Pads view works as a complete
pattern editing environment regardless of voice type.

#### 1.4 Waveform / Voice Visualization Area

Full-width display area that adapts to the selected track's voice:

**Sampler voice:**
- `<canvas>` waveform with zoom (wheel) + horizontal scroll (drag)
- Draggable start/end handles → update `voiceParams.start` / `voiceParams.end`
- Chop slice markers (vertical lines, equal-division from `chopSlices`)
- Playback position cursor
- Active slice highlight on playback
- High-res peak array (4096 points) decoded on track select

**Non-sampler voices (future — can be blank initially):**
- Tone/oscillator shape visualization
- ADSR envelope curve
- Algorithm routing diagram (FM synth)
- Can be implemented incrementally per voice type

Implementation: extend existing `SamplerWaveform.svelte` or create a generic
`VoiceViz.svelte` wrapper that delegates to voice-specific renderers.

#### 1.5 Params in View

> **Superseded by ADR 131.** `SamplerParams.svelte` was removed. All voice
> parameters are now accessed exclusively through DockPanel. The PadsView
> right column is a single-track StepGrid replica (header, steps, vel bars,
> mix/send knobs, PianoRoll) — see ADR 131 for details.

#### 1.6 Embedded Step Sequencer

> **Superseded by ADR 131.** `SamplerStepRow.svelte` was removed. The
> PadsView right column now contains a full single-track editor with
> step cells, drag-to-paint, velocity/chance/param bars, and all vel
> mode tabs (VEL/CHNC/MIX/FX/INS) — matching StepGrid's per-track UI.

#### 1.7 DockPanel Integration

When the Pads tab is active, DockPanel behavior adapts:

- **Sampler voice selected:** DockPanel switches to Pool Browser mode
  (full-height list with search, categories, tap-to-audition). Same as
  current design — the dock is for browsing, the view is for editing.
- **Non-sampler voice selected:** DockPanel shows normal track params
  (existing DockTrackEditor behavior, unchanged).

#### 1.8 Factory Sample Expansion

**Budget:** ≤ 5 MB total (current 1.9 MB, ~3 MB headroom).

**Sources:**
- CC0 (Freesound, archive.org) for oneshots
- Self-produced via Ableton synths / hardware for oneshots
- Commercial libraries (NI Battery etc.) permitted for loops only
  (loops are compositions, not sample redistribution)

**Priority additions:**

| Category       | Current | Add    | Notes                              |
|----------------|---------|--------|------------------------------------|
| clap           | 2       | +4–6   | Most underrepresented              |
| bass oneshot   | 0       | +6–8   | 808 sub, reese, FM bass            |
| chord / stab   | 0       | +4–6   | Future bass, dariacore, house      |
| FX / riser     | 0       | +4–6   | Transitions, impacts, sweeps       |
| loop (breaks)  | 19      | +5–8   | DnB, breakbeat, genre variety      |
| vocal chop     | 11      | +2–4   | Fills gaps                         |

**Format:** WebM (Opus), mono, consistent RMS normalization to match existing
library. Update `factory.json` manifest and pool category metadata.

**Licensing:** update `LICENSE-SAMPLES` with per-file attribution for CC0 sources.

### Phase 1 Implementation Checklist

#### Step 1: Round out tab component + state wiring
- [x] Extend `prefs.patternEditor` type to `'grid' | 'pads' | 'tracker'`
- [x] Create `PatternModeTabs.svelte` — round out tab bar component
- [x] Mount tabs at top of pattern sheet in `App.svelte`
- [x] Wire tab clicks to set `prefs.patternEditor` directly
- [x] Remove system sidebar toggle (`togglePatternEditor`)
- [x] Verify Grid and Tracker render unchanged under new tab bar

#### Step 2: Pads view skeleton
- [x] Refactor `SamplerSheet.svelte` → `PadsView.svelte` (remove overlay shell, keep layout)
- [x] Mount in pattern sheet when `prefs.patternEditor === 'pads'`
- [x] Track selection state: use `ui.selectedTrack` (existing)
- [x] Layout: flex column — viz top, pads+params middle, step row bottom

#### Step 3: Pad tri-mode (TRACK / SLICE / NOTE)
- [x] Add 3-way mode switch above pad area (olive tier)
- [x] Refactor `SamplerPads.svelte` → tri-mode pad component
- [x] TRACK mode: pads show instrument labels, tap to select track
- [x] SLICE mode: pads trigger slices (existing behavior, sampler only)
- [x] NOTE mode: chromatic pads with note labels + OCT ▲▼ (non-sampler)
- [x] Auto-switch: sampler → SLICE, non-sampler → NOTE
- [x] Mode availability: TRACK always, SLICE/NOTE by voice type
- [x] Active track / active slice / active note highlight

#### Step 4: Waveform / voice viz area
- [x] Mount `SamplerWaveform.svelte` for sampler voice tracks
- [x] Blank/placeholder for non-sampler voices (future viz)
- [x] Draggable start/end handles (existing)
- [x] Chop markers (existing)
- [x] Active slice highlight on playback

#### Step 5: Params + step row for any voice
- [x] ~~Mount `SamplerParams.svelte` for sampler voice~~ → removed by ADR 131 (params in DockPanel only)
- [x] ~~Mount `SamplerStepRow.svelte` for selected track~~ → replaced by ADR 131 single-track editor
- [x] P-Lock mode integration

#### Step 6: DockPanel pool browser integration
- [x] DockPanel auto-switches to Pool Browser when Pads tab active
  AND selected track is sampler voice
- [x] Normal track params shown for non-sampler voices
- [x] Search, tap-to-audition, double-tap-to-assign (existing)

#### Step 7: Cleanup + mobile
- [x] Remove SamplerSheet overlay code from App.svelte
- [x] Remove `ui.phraseView === 'sampler'` overlay path
- [x] Remove `ui.samplerTrackId` (use `ui.selectedTrack` instead)
- [x] Remove sampler-specific triggers (A/B/C entry points)
- [x] Verify Escape/backdrop still works for other overlay sheets
- Mobile layout deferred to ADR 131 (Pattern Editor integration)

### Phase 2: Auto-Chop + Sample Mangling

#### 2.1 Transient Detection Auto-Chop

[AUTO] button in waveform area runs transient detection on the loaded sample:

- **Algorithm:** energy-based onset detection (spectral flux or simple
  amplitude-envelope threshold with adaptive sensitivity)
- Runs on main thread (not worklet) — one-time analysis on button press
- Places chop markers at detected transient positions
- User can adjust sensitivity via a slider
- Detected slices replace the equal-division chop markers
- Requires DSP extension: variable-length slices instead of current equal-division
  (`chopSlices` count → `slicePoints: number[]` normalized 0–1 array)

**Chop modes after this phase:**
| Mode     | Source                    |
|----------|---------------------------|
| EQUAL    | Divide region into N parts (existing) |
| BEAT     | Divide by BPM grid (sampleBPM-aware)  |
| TRANSIENT| Onset detection results   |
| MANUAL   | User-placed markers       |

#### 2.2 Sweep-Driven Sample Mangling

Expose `start` and `end` as sweep automation targets:

- Register in `paramDefs.ts` sweep target list (existing mechanism)
- XY pad mapping: X = start, Y = end (or user-assignable)
- Real-time start/end manipulation via sweep curves during scene playback
- Combined with reverse + chop + BPM sync = Octatrack-style mangling
  without Octatrack-level complexity

#### 2.3 Per-Slice P-Lock Visibility

The DSP already supports per-step parameter locks + chopMode=MAP, which
effectively gives per-slice P-Locks. What's missing is UI:

- In the view, show which steps target which slices
- Colour-code pads by whether their slice has P-Lock overrides
- Tap pad + tap param knob = set P-Lock for all steps using that slice

#### 2.4 Voice Visualizations (non-sampler)

Incrementally add visualization renderers for the waveform/viz area:

| Voice      | Visualization                                |
|------------|----------------------------------------------|
| WT (Wavetable) | Wavetable frame shape, morph position    |
| FM         | Algorithm routing diagram, operator levels    |
| Analog     | Oscillator shape + filter curve              |
| Drum voices| Tone shape + decay envelope                  |

Each renderer is a standalone Svelte component mounted by `VoiceViz.svelte`
based on `voiceId`.

### Phase 3: Granular Playback Mode (Torso S4-inspired)

#### 3.1 Granular as a Voice Playback Mode

Add a granular playback mode to PolySampler — not a send FX, but a way of
*reading* the sample buffer itself. The existing GranularProcessor (ADR 008)
operates on a real-time ring buffer (send FX input); this is different — it
spawns grains from the loaded sample at arbitrary positions.

```
Current send FX:   Voice → audio out → [Send Bus] → GranularProcessor(ring buffer)
Phase 3 mode:      PolySampler → GranularEngine(sample buffer) → audio out
```

New `playbackMode` parameter on Sampler voice:
| Value | Label  | Behaviour                                     |
|-------|--------|-----------------------------------------------|
| 0     | NORMAL | Current sample playback (one-shot/loop)        |
| 1     | GRAIN  | Granular cloud from sample buffer              |

#### 3.2 Granular Parameters

Exposed via paramDefs (Sampler group `'granular'`), sequenceable with P-Locks:

| Param      | Range     | Description                                    |
|------------|-----------|------------------------------------------------|
| `grainPos` | 0.0–1.0   | Scan position within sample (replaces cursor)  |
| `grainSize`| 5–500 ms  | Window size per grain                          |
| `density`  | 1–32      | Grains per second (or overlap factor)          |
| `grSpread` | 0.0–1.0   | Random scatter around grainPos                 |
| `grPitch`  | -12–+12   | Per-grain pitch shift (semitones)              |
| `grReverse`| 0.0–1.0   | Probability of reverse grain                   |

`grainPos` is the key parameter — it determines *where* in the sample the
grains are sourced from. Sweeping it with automation scans through the sample.
Freezing it on one position creates sustained textures from that moment.

#### 3.3 Grain Engine (worklet-side)

New `GrainCloud` class within sampler DSP (not reusing send FX GranularProcessor
— different buffer model):

- **Source buffer:** borrows PolySampler's loaded `Float32Array` (zero-copy)
- **Grain pool:** fixed 16–32 pre-allocated grains (zero-alloc, fits process() budget)
- **Grain lifecycle:** spawn at interval = 1/density, Hann window envelope,
  read from `buffer[pos ± scatter]` at pitch-shifted rate
- **Polyphony:** grain cloud replaces normal voice tick when `playbackMode === GRAIN`;
  `noteOn` sets base `grainPos` from note (like chopMode=MAP), `noteOff` fades cloud

#### 3.4 UI in Pads View

When `playbackMode === GRAIN`, the waveform/viz area changes:

```
┌─ Waveform (Granular Mode) ──────────────────────────┐
│                                                      │
│  ░░░░░░░▓▓▓▓▓▓▒▒▒▒▒░░░░░░░░░░░░░░░▓▓▓▓░░░░░░░░░  │
│         ◄─spread─►                                   │
│              ▲ grainPos                              │
│         ╌╌╌╌╌╌╌╌╌╌  grain size indicator             │
│  · · ·  · ·  · · ·  grain spawn dots (animated)     │
│                                                      │
└──────────────────────────────────────────────────────┘

┌─ Pads (Granular) ─┐  ┌─ Grain Params ─────────────┐
│ Each pad = position │  │ POS  SIZE  DENS  SPRD      │
│ in sample (evenly   │  │ PTCH  REV                   │
│ spaced or slice-    │  │                              │
│ mapped)             │  │ [NORMAL] [GRAIN] mode toggle │
└─────────────────────┘  └──────────────────────────────┘
```

- Grain spawn visualized as animated dots on waveform
- Position + spread shown as highlighted region
- Pads map to evenly spaced positions (or chop slice positions if set)
- Existing sweep automation works: `grainPos` as sweep target = Torso S4-style
  position scanning

#### 3.5 Connection to ADR 087 (Looper)

If the looper (ADR 087) is implemented, its recorded buffer can be loaded
into PolySampler as a sample source → granular playback mode turns looped
audio into a grain cloud. Workflow:

```
Record loop (ADR 087) → Export buffer → Load into Sampler track → GRAIN mode
→ Sweep grainPos → Record result back to looper → Layer
```

This creates a feedback loop of capture → granular destruction → recapture
that echoes both Torso S4's sculpting workflow and Octatrack's real-time
sample mangling.

## Considerations

### Why a tab instead of an overlay sheet?

The original design (v1) used an ADR 054 overlay sheet. This created a deep
navigation hierarchy — three entry points (voice change, double-tap, dock
button) but all required multiple steps to reach. More importantly, the
sampler's 4×4 pad grid maps directly to track selection (max 16 tracks),
and its step row is a single-track step sequencer. This means the "pads
view" is naturally a **pattern editing mode**, not a voice-specific tool.

Promoting it to a tab alongside Grid and Tracker:
- **Zero hierarchy** — one click to switch, always available
- **All-voice utility** — pads as track selectors, viz area for any voice
- **Consistent mental model** — three ways to view the same pattern data

### Why split DockPanel (browse) + View (edit)?

DockPanel is 280px — too narrow for waveform editing and pads, but ideal for
scrollable lists. Rather than duplicating the browser inside the view or
cramming spatial UI into the dock, each surface does what it's good at:

- **DockPanel** → list-based browsing (Pool, categories, search)
- **Pads View** → spatial editing (waveform, pads, knobs, step sequencer)

When the selected track is a Sampler voice, the dock automatically becomes
the Pool Browser. Selecting a sample in the dock immediately reflects in
the view's waveform.

### Round out tab design

The round out tab style (active tab with inverse border-radius connecting
to content area) gives a physical "folder tab" feel that matches the
warm brutalist aesthetic. Implementation uses CSS `::before`/`::after`
pseudo-elements with `radial-gradient` or SVG for the cutout corners.

Active tab: `--color-bg` background, `--color-fg` text.
Inactive tabs: `--color-fg` background, `--dz-text-mid` text.
Border-radius on active tab top corners only (e.g. 8px).

### Mobile layout

- Tabs: horizontal scroll if needed, same round out style
- View: single column, vertically scrollable
- Pads + params stacked, waveform full-width reduced height
- Pool Browser in dock uses standard mobile dock behaviour

### Variable-length slices (Phase 2)

Current `chopSlices` assumes equal division. Transient detection and manual
placement require variable-length slices. This means:

- New field on Cell or voiceParams: `slicePoints: number[]` (sorted, 0–1)
- Worklet `SamplerVoice` updated to accept slice boundaries instead of count
- chopMode=MAP note offset indexes into `slicePoints` array
- Backward compatible: if `slicePoints` is absent, fall back to equal division

### What this ADR does NOT change

- Track = instrument 1:1 model (product direction decision)
- Other voice types stay in DockPanel for parameter editing
- Existing sample loading/pool/OPFS architecture unchanged
- Grid and Tracker views: completely unchanged
- Send FX GranularProcessor unchanged (Phase 3 adds a separate grain engine
  inside PolySampler, not a modification of the send FX)
- Overlay sheets for FX, EQ, Tonnetz, etc. remain as overlays

## Future Extensions

- **Live resampling** — record master output or individual track into sampler
  (pickup machine concept, significant scope; see ADR 087 for looper design)
- **Velocity layers** — factory packs currently ignore velocity; add loVel/hiVel
  zone support for expressive multi-sample instruments
- **Sample pack marketplace/sharing** — export/import sample packs as .zip
- **Looper → granular feedback loop** — ADR 087 looper buffer as granular source
  (outlined in Phase 3.5, requires ADR 087 implementation first)
