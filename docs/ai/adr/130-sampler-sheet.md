# ADR 130: Sampler Sheet & Sample Pack Expansion

## Status: Proposed

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

The sampler is fundamentally different from synth voices — it needs visual space
for waveforms, spatial interaction for chop editing, and a pad grid for slice
triggering. Synth knobs fit fine in 280px; sampler does not.

### Inspiration

- **AKAI MPC Sample**: immediate pad workflow, visual chop, transient detection
- **Elektron Octatrack**: real-time sample mangling via start/end manipulation,
  per-slice parameter locks, crossfader performance

The goal is not to clone either device, but to bring their most satisfying
interactions into the browser within inboil's existing architecture.

## Decision

### Phase 1: Sampler Sheet + Pads + Sample Expansion

#### 1.1 Sampler Sheet (Overlay)

Add `'sampler'` to `ui.phraseView` and open a full-width overlay sheet
following the ADR 054 pattern (SceneView always visible underneath).

**Triggers (A+B+C, three entry points):**
- **(A) Voice selection** — when `voiceId` is changed to `'Sampler'` in DockPanel,
  `ui.phraseView` automatically switches to `'sampler'` and the DockPanel
  transitions to Pool Browser mode (see 1.4). This is the primary entry point.
- **(B) StepGrid track label double-tap** — when the track's voiceId is `'Sampler'`,
  double-tapping the track label in StepGrid opens the SamplerSheet.
  Consistent with MatrixView double-tap → PatternSheet pattern.
  Non-sampler tracks: no action (or existing behaviour).
- **(C) DockTrackEditor button** — dedicated [PAD] button in the sampler
  section, visible when `voiceId === 'Sampler'`.
  Follows existing `openPatternSheet` button pattern in DockPanel.

Voice selection (A) gives zero-friction entry — sampler-specific layout
appears immediately. Double-tap (B) is the fast path once learned.
DockPanel button (C) is the discoverable fallback.

**Dismiss:** Escape, backdrop tap, handle bar (standard sheet behaviour).

**Relationship to PatternSheet:**
SamplerSheet and PatternSheet are mutually exclusive (`ui.phraseView`
can be `'sampler'` or `'pattern'`, not both). The SamplerSheet includes
a **single-track StepGrid row** for the selected sampler track, so the
user can chop → audition → place steps without leaving the sheet.
Tracker and PianoRoll views are not available within the SamplerSheet —
return to PatternSheet for melodic note editing.

**Multi-track sampler handling:**
The sheet always operates on **one selected track**. When multiple tracks
use the Sampler voice, a track selector (tabs) appears in the sheet header:

```
 DockPanel (280px)              SamplerSheet (overlay)
┌─────────────────┐  ┌──────────────────────────────────────────┐
│ SMPL ▼          │  │ [TR3: break] [TR7: vocal] [TR12: bass]   │
│                 │  │ ◂ SMPL  Track 3: "break"        [AUTO]   │
│ ┌─ Pool ──────┐ │  ├──────────────────────────────────────────┤
│ │ [🔍 search ]│ │  │                                          │
│ │             │ │  │  ┌─ Waveform ─────────────────────────┐  │
│ │ ▸ kicks     │ │  │  │ ▏  ▕│▕    ▕│▕    ▕│▕    ▕│▕    ▕│ │  │
│ │   kick-808  │ │  │  │ ▏██▕│▕██  ▕│▕ ██ ▕│▕████▕│▕ ██ ▕│ │  │
│ │   kick-909  │ │  │  │ S                  markers        E  │
│ │   kick-lo…  │ │  │  └────────────────────────────────────┘  │
│ │ ▸ snares    │ │  │  [zoom ────●──────] [scroll ───●──────]  │
│ │ ▸ claps     │ │  │                                          │
│ │ ▸ hats      │ │  │  ┌─ Pads ────────┐  ┌─ Params ───────┐  │
│ │ ▸ loops     │ │  │  │ [1] [2] [3] [4]│  │ DCY STRT END   │  │
│ │ ▸ vocal     │ │  │  │ [5] [6] [7] [8]│  │ PTCH REV CHOP  │  │
│ │ ▸ user      │ │  │  │ [9] [10][11][12]│  │ MODE BPM LOOP  │  │
│ │             │ │  │  │ [13][14][15][16]│  │ STRC           │  │
│ │  [LOAD]     │ │  │  └────────────────┘  └────────────────┘  │
│ └─────────────┘ │  │                                          │
│                 │  │  ┌─ Step Sequencer (1 track) ──────────┐  │
└─────────────────┘  │  │ [■][□][■][□] [■][■][□][□] [□][■]…  │  │
                     │  └─────────────────────────────────────┘  │
                     └──────────────────────────────────────────┘
```

**Role separation:** DockPanel becomes the sample browser (Pool list with
search and categories). SamplerSheet owns waveform, pads, params, and
step sequencer. Selecting a sample in Pool immediately loads it into the
sheet's waveform display. This avoids duplicating the browser UI and
gives Pool more vertical space than either a dropdown or in-sheet panel.

Tab switching swaps waveform, pads, params, and step row together.

#### 1.2 Waveform Display

Full-width `<canvas>` with:
- **Zoom/scroll** — pinch or slider; horizontal drag to scroll
- **Start/End handles** — draggable markers on waveform, update `voiceParams.start` / `voiceParams.end`
- **Chop slice markers** — vertical lines at slice boundaries; draggable for manual placement (future: Phase 2 auto-chop adds transient-based markers)
- **Playback position** — real-time cursor showing current sample playhead (driven by worklet step message or `requestAnimationFrame` interpolation)
- **Active slice highlight** — shaded region for currently triggered slice

Implementation: extend existing `drawWaveform()` in `domHelpers.ts` or create
a dedicated `SamplerWaveform.svelte` component with its own canvas logic.
The existing 128-point waveform overview (`SampleMeta.waveform`) is too low-res
for a full-width display; decode the raw buffer to a higher-res peak array
(e.g. 2048 points) on sheet open.

#### 1.3 Pad UI

4×4 grid (16 pads), MPC-style:

- **Chop mapping**: when `chopSlices > 0`, each pad maps to a slice.
  Pad count adapts to slice count (8 slices = 2×4, 16 = 4×4, 32 = scrollable or 4×8)
- **Tap to audition**: sends `noteOn` for the corresponding note offset
  (chopMode=MAP: pad N triggers `rootNote + N`)
- **Visual feedback**: pad lights up on playback when its slice is active
- **Step input mode**: tap pad while holding a step → writes the note/slice
  into the sequencer (same as existing piano-roll note input pattern)
- **Velocity**: if `PointerEvent.pressure` is available (pen/touch), map to velocity

Pads sit alongside a compact param section so the sheet is self-contained —
user doesn't need to switch back to DockPanel.

#### 1.4 DockPanel Pool Browser (expanded mode)

When `voiceId === 'Sampler'` and SamplerSheet is open, DockPanel switches
from the usual track-param knobs to an expanded Pool Browser view. This
replaces the cramped dropdown with a full-height list that leverages the
entire Dock height.

- **Full-height scrollable list** with waveform thumbnails per sample
- **Category filter** — collapsible groups (kicks, snares, claps, hats,
  loops, vocal, FX, user) with expand/collapse
- **Search bar** at top — filters across all categories
- **Tap to audition** — sends preview noteOn
- **Double-tap or Enter to assign** — loads into current track's cell
- **[LOAD] button** — file import from disk (existing `loadSample` flow)
- **Factory pack support preserved** (multi-zone instruments)

This keeps browsing in the Dock (where list UIs belong) and editing in
the Sheet (where spatial UIs belong). No browser duplication needed.

#### 1.5 Factory Sample Expansion

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

#### Step 1: Sheet skeleton + state wiring
- [x] Add `'sampler'` to `ui.phraseView` union type (`state.svelte.ts`)
- [x] Add `ui.samplerTrackId: number` state field (which sampler track is open)
- [x] Reset `samplerTrackId` in `factoryReset()` and `closeAllSheets()`
- [x] Create `SamplerSheet.svelte` — empty shell with `onclose` prop
- [x] Mount in `App.svelte` with backdrop + fly transition (ADR 054 pattern)
- [x] Wire trigger (C): [PAD] button in `DockTrackEditor` sampler section
- [x] Wire trigger (B): double-tap on StepGrid track label (`voiceId === 'Sampler'`)
- [x] Wire trigger (A): auto-open sheet when voice changes to Sampler
- [x] Verify open/close/Escape/backdrop-tap all work

#### Step 2: Waveform display
- [x] Create `SamplerWaveform.svelte` with dedicated canvas
- [x] Generate high-res peak array (4096 points) from `rawBuffer` on sheet open
- [x] Render waveform with zoom (wheel) + horizontal scroll (drag)
- [x] Draggable start/end handles → update `voiceParams.start` / `voiceParams.end`
- [x] Chop slice markers (vertical lines, equal-division from `chopSlices`)
- [ ] Active slice highlight on playback

#### Step 3: Pad UI
- [x] Create `SamplerPads.svelte` — 4×4 grid (adapts to slice count)
- [x] Tap → `noteOn` audition (pad N → `rootNote + N`)
- [ ] Visual feedback on active slice during playback
- [x] Velocity from `PointerEvent.pressure` when available

#### Step 4: Params in sheet
- [x] Create `SamplerParams.svelte` — compact knob layout (light mode)
- [x] Knobs: DCY, STRT, END, PTCH, REV, CHOP, MODE, BPM, LOOP, STRC
- [x] Reuse existing `Knob.svelte` component
- [ ] Two-way binding: knob ↔ voiceParams ↔ waveform handles

#### Step 5: DockPanel Pool Browser
- [x] Expand `DockPoolBrowser` to full-height list mode when sheet is open
- [x] Search bar filtering (existing)
- [x] Tap-to-audition, double-tap-to-assign (existing)
- [x] Hide track param knobs in Dock while sampler sheet is open
- [ ] Category groups (collapsible) with waveform thumbnails

#### Step 6: Embedded step sequencer
- [x] Single-track `SamplerStepRow.svelte` inside SamplerSheet
- [x] 16-step paging with page indicator (Octatrack-style)
- [ ] Pad tap while holding step → write note/slice into sequencer

#### Step 7: Mobile layout
- [x] SamplerSheet mounts as mobile overlay with handle bar
- [x] Pads + params stacked vertically, scrollable
- [ ] Pool browser as full-height dock or bottom sheet

### Phase 2: Auto-Chop + Sample Mangling

#### 2.1 Transient Detection Auto-Chop

[AUTO] button in sheet header runs transient detection on the loaded sample:

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

- In the sheet, show which steps target which slices
- Colour-code pads by whether their slice has P-Lock overrides
- Tap pad + tap param knob = set P-Lock for all steps using that slice

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

#### 3.4 UI in Sampler Sheet

When `playbackMode === GRAIN`, the sheet waveform view changes:

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

### Why split DockPanel (browse) + Sheet (edit)?

DockPanel is 280px — too narrow for waveform editing and pads, but ideal for
scrollable lists. Rather than duplicating the browser inside the sheet or
cramming spatial UI into the dock, each surface does what it's good at:

- **DockPanel** → list-based browsing (Pool, categories, search)
- **SamplerSheet** → spatial editing (waveform, pads, knobs, step sequencer)

When `voiceId === 'Sampler'`, the dock automatically becomes the Pool Browser
and the sheet opens. Selecting a sample in the dock immediately reflects in
the sheet's waveform. This is a natural split that avoids both the "cramped
dropdown" problem and the "browser panel inside sheet" complexity.

### Why not a separate full view?

ADR 054 established that SceneView is always the main canvas. Adding another
top-level view would regress that decision. A sheet maintains the spatial
context of the scene while providing workspace for the sampler.

### Mobile layout

The sheet must work on mobile:
- Waveform spans full width, reduced height
- Pads below waveform in a scrollable region
- Params collapse into a row of mini-knobs or a swipeable param strip
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
- Other voice types stay in DockPanel
- Existing sample loading/pool/OPFS architecture unchanged
- Send FX GranularProcessor unchanged (Phase 3 adds a separate grain engine
  inside PolySampler, not a modification of the send FX)

## Future Extensions

- **Live resampling** — record master output or individual track into sampler
  (pickup machine concept, significant scope; see ADR 087 for looper design)
- **Velocity layers** — factory packs currently ignore velocity; add loVel/hiVel
  zone support for expressive multi-sample instruments
- **Sample pack marketplace/sharing** — export/import sample packs as .zip
- **Looper → granular feedback loop** — ADR 087 looper buffer as granular source
  (outlined in Phase 3.5, requires ADR 087 implementation first)
