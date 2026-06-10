# ADR 133: Instrument-Pattern Decoupling

## Status: Proposed

**Created**: 2026-06-10

## Context

inboil's current data model entangles voice (instrument), pattern, and track. This
entanglement was inherited from Elektron-style groove boxes where "1 row = 1 voice"
is a natural fit for hand-placed trigs. The scene graph layered on top
([ADR 044](archive/044-scene-graph.md)) extended this with non-linear arrangement,
generative engines ([ADR 078](archive/078-generative-scene-nodes.md)), modifier nodes
([ADR 116](archive/116-node-function-ux.md)), and sweep automation
([ADR 118](archive/118-repeat-sweep.md)) — but **voice itself never became a
scene node**. Tracks live in `Song.tracks` outside the graph; pattern cells carry
voice via `Cell.voiceId` ([types.ts:42](../../../src/lib/types.ts#L42)); generative
nodes reach into a target track via the awkward `targetTrack` field
([ADR 117](archive/117-generative-ux-simplification.md), [types.ts:152](../../../src/lib/types.ts#L152)).

### What the current model couples

| Concept | Currently carries |
|---|---|
| `Pattern` | Per-track Cells, each with its own voice, trigs, voice params, sends, insert FX, samples |
| `Cell` | trackId + voiceId + steps + trigs + voiceParams + sends + insertFx + sampleRef + per-pattern scale |
| `Track` | id + muted + volume + pan (mixer channel only — voice/name moved to Cell per ADR 062/080) |
| `Generative node` | engine + mergeMode + **targetTrack** + params |

The triple-coupling causes:

1. **Generative engines produce pure sequences, but must declare which track they target.**
   This is a workaround for the voice-pattern coupling. A Turing machine outputs a
   shift-register sequence; nothing about it is intrinsically a "kick" or "bass" line.
   The `targetTrack` field exists because the cell can't be voice-agnostic.

2. **Patterns can't be reused with different voices.** A beat that sounds great as
   a kick cannot be re-routed to a snare voice without duplicating the pattern.
   Sound design and composition cannot be varied independently.

3. **Same-pattern-multiple-voices (unison, layer, chord stab) is structurally impossible.**
   [ADR 117](archive/117-generative-ux-simplification.md) removed `layer` mergeMode because
   the data model couldn't express it cleanly — but layering is a fundamental
   compositional move (octave doubling, brass-stack chord pads, drum-layer fattening).

4. **Polymetric arrangement is constrained by per-track divisors.** [ADR 112](archive/112-per-track-step-scale.md)
   adds per-track step scale (1/8 – 1/32), but every track in a pattern shares the
   same pattern boundary. True polymetric (pattern A = 16 steps, pattern B = 12 steps,
   played simultaneously) requires a per-pattern time origin that the current model
   doesn't support.

5. **Scene graph inconsistency.** The graph has pattern nodes, modifier satellites,
   generative nodes, sweep nodes, label/stamp nodes — but no instrument node.
   The voice that actually produces sound is global, indexed by `trackId`,
   silently bound through the pattern's cells.

6. **Mobile UI has no natural primary surface.** The current mobile UI ([ADR 095](archive/095-mobile-ui-redesign.md))
   replicates the desktop step-grid model at smaller scale, which the user has
   described as "a degraded PC version" (see conversation 2026-06-10). The grid
   demands precision pointing that thumbs cannot deliver. Without a different data
   model, no UI polish escapes this trap.

### Why now

- **Beta stage, small user base.** Save-data migration is feasible without
  large-scale user disruption.
- **inboil's generative direction.** The user has stated the design vision is
  "generative music beyond linear timelines" — the current data model fights this
  direction by binding generators to specific tracks.
- **Mobile-first push.** Considering a paid v1.0 with mobile as a first-class
  surface (not a PC-port). Mobile demands a different primary interaction model;
  this ADR is the structural prerequisite.
- **Effort cost explicitly deprioritized for this design exploration** (per user
  direction 2026-06-10). The ADR captures the design without committing to a
  phasing plan.

## Decision

Promote **Instrument** to a first-class scene node. Decouple voice/voice-params
from `Pattern.Cell`. Patterns become voice-agnostic note/trig sequences. Scene edges
explicitly route patterns to instruments.

### New scene node types

```
existing                  | new / changed
──────────────────────────┼──────────────────────────────────────────
pattern                   | pattern (voice-agnostic — no more voiceId)
generative                | generative (no more targetTrack field)
modifier (transpose,      | modifier — split routing target:
  tempo, repeat, fx,      |   - pattern-side: transpose, tempo, repeat
  sweep)                  |   - instrument-side: fx
                          | instrument (NEW — voice + voice params)
```

### New edge semantics

```
existing                       | new / changed
───────────────────────────────┼─────────────────────────────────────
Pattern → Pattern (arrangement)| same
Modifier → Pattern (satellite) | same
Generative → Pattern (write)   | same (generative writes the pattern)
                               | Pattern → Instrument (NEW — routing)
                               | Generative → Instrument (NEW —
                               |   direct real-time playback, no
                               |   pattern intermediary)
                               | Instrument → Instrument (NEW —
                               |   layer/unison via fan-out routing)
```

### Source abstraction

Multiple node types feed instruments. They share a common protocol — **produce
trig events on a time axis** — and the instrument doesn't care which kind drives
it.

| Source type | What it is | Editing surfaces |
|---|---|---|
| **Pattern** | hand-authored or recorded trig sequence | step grid / pads view / piano roll |
| **Generative** | rule-based sequence producer (Turing/Tonnetz/Quantizer) | per-engine config sheets |
| **Live** (future) | external MIDI, AI composer, sibling-app clock | passthrough |

All sources connect to instruments via `Source → Instrument` edges. This is the
unifying abstraction behind the seemingly separate "pattern node" and "generative
node" types: they're both sources, distinguished only by how their output is
authored.

Implications:

- The existing StepGrid, PadsView ([ADR 130](130-sampler-sheet.md)), and
  PianoRoll are **not discarded** — they become editing surfaces on Pattern
  source nodes. The user picks which surface to open per context (mobile default:
  pads; desktop default: step grid). Pattern node stores last-opened surface for
  continuity.
- Generative engines (`turing` / `tonnetz` / `quantizer`) are sibling source
  types with rule-based editing surfaces. They are first-class sources, not
  modifiers — the `targetTrack` concept is replaced by an outgoing edge to an
  Instrument (or to a Pattern that is then routed to an Instrument).
- Future source types (external MIDI clip player, AI composer node, sample-pack
  player) plug in via the same protocol; no model change required to add them.

### Topology examples

**Single instrument, single pattern (equivalent to current model):**

```
┌─────────┐      ┌──────────┐
│ Pattern │ ───▶ │ KICK     │
│  beat-A │      │ (drumset)│
└─────────┘      └──────────┘
```

**Pattern reused on two instruments (unison/layer — was structurally impossible):**

```
                 ┌──────────┐
            ┌──▶ │ KICK     │
┌─────────┐ │    │ (drumset)│
│ Pattern │ │    └──────────┘
│  beat-A │─┤
└─────────┘ │    ┌──────────┐
            └──▶ │ KICK_LO  │
                 │ (sub-808)│
                 └──────────┘
```

**Generative drives a pattern, multiple instruments listen:**

```
┌──────────┐    ┌─────────┐      ┌──────────┐
│ Turing   │───▶│ Pattern │ ───▶ │ BASS     │
│ (engine) │    │  bass-A │ │    │ (TB-303) │
└──────────┘    └─────────┘ │    └──────────┘
                            │    ┌──────────┐
                            └──▶ │ BASS_HI  │
                                 │ (FM lead)│
                                 └──────────┘
```

**Generative plays an instrument directly (no pattern — pure real-time generation):**

```
┌──────────┐         ┌──────────┐
│ Tonnetz  │ ──────▶ │ PAD      │
│ (engine) │         │ (analog) │
└──────────┘         └──────────┘
```

**Multi-source fan-in into one instrument (simultaneous layering — was structurally impossible):**

```
┌───────────┐
│ Pattern   │───┐
│ backbone  │   │
└───────────┘   │
                │    ┌──────────┐
┌───────────┐   ├──▶ │ DRUMS    │
│ Pattern   │───┤    │ (kit)    │
│ fills     │   │    └──────────┘
└───────────┘   │
                │
┌───────────┐   │
│ Drift     │───┘
│ (Turing)  │
└───────────┘
```

Each source fires note-ons into the instrument independently. The user authors a
backbone by hand, generates fills with a Pattern, lets a generative engine add
ornament — all into one voice. Mute/solo per edge enables A/B-ing layers.

**Polymetric — two patterns, different lengths, played at once:**

```
┌─────────┐    ┌──────────┐
│ Pattern │───▶│ KICK     │     ◀── 16 steps
│ 16-step │    └──────────┘
└─────────┘
┌─────────┐    ┌──────────┐
│ Pattern │───▶│ HAT      │     ◀── 12 steps
│ 12-step │    └──────────┘
└─────────┘
```

### Data model changes

#### `Pattern` and `Cell`

`Cell` is no longer "pattern's row for a specific track". It becomes a single trig
sequence with no voice binding:

```typescript
// Before:
interface Cell {
  trackId: number
  voiceId: VoiceId | null
  voiceParams: Record<string, number>
  steps: number
  trigs: Trig[]
  reverbSend: number
  delaySend: number
  // ... sends, insertFx, sampleRef, scale
}

interface Pattern {
  cells: Cell[]   // one per track (up to 16)
}

// After:
interface Pattern {
  id: string
  name: string
  color: number
  steps: number          // pattern-level step count (was per-cell)
  scale: number          // pattern-level divisor (was per-cell)
  trigs: Trig[]          // single voice-agnostic sequence
  // sends/insertFx removed — now on Instrument
}
```

A pattern carries only what the **sequence** needs to know: when notes fire, what
pitch, velocity, duration, slide, chance, and per-step pattern-side P-Locks (note,
velocity, probability — the sequencer's responsibility).

#### `Instrument` (new)

```typescript
interface Instrument {
  id: string             // referenced by SceneNode of type 'instrument'
  name: string           // user-editable display name (e.g. "KICK", "LEAD")
  voiceId: VoiceId | null
  voiceParams: Record<string, number>
  presetName?: string
  // Mixer channel (was on Track):
  volume: number
  pan: number
  muted: boolean
  // Sends (was on Cell):
  reverbSend: number
  delaySend: number
  glitchSend: number
  granularSend: number
  insertFx?: [CellInsertFx | null, CellInsertFx | null]
  // Sample (was on Cell):
  sampleRef?: CellSampleRef
  // Instrument-side per-step P-Locks need a new home — see "P-Lock destination split"
}
```

#### `Track` (deprecated)

`Track` collapses into `Instrument`. The "mixer channel" role moves to the
Instrument. The `Song.tracks` array is removed; instruments live as scene nodes,
accessed in mixer view by listing all instrument-type nodes.

#### `SceneNode` (extended)

```typescript
interface SceneNode {
  id: string
  type: 'pattern' | 'generative' | 'instrument' | ModifierType
  x: number
  y: number
  root: boolean
  patternId?: string         // for type === 'pattern'
  instrumentId?: string      // for type === 'instrument' (NEW)
  modifierParams?: ModifierParams
  generative?: GenerativeConfig  // targetTrack field removed
}
```

#### `Song`

```typescript
interface Song {
  name: string
  bpm: number
  rootNote: number
  patterns: Pattern[]         // voice-agnostic sequences
  instruments: Instrument[]   // NEW — flat pool, referenced by scene instrument nodes
  scene: Scene
  effects: Effects
  flavours?: FxFlavours
  fxPadState?: ...
  masterPadState?: ...
  masterGain?: number
  swing?: number
  // tracks: Track[]          ← removed
  // sections: Section[]      ← removed (already deprecated)
}
```

### P-Lock destination split

Currently `Trig.paramLocks: Record<string, number>` stores **all** per-step
overrides on the cell — note value, velocity, voice params, even FX sends.
The decoupled model must separate:

| Lock kind | Lives on | Examples |
|---|---|---|
| Pattern-side (sequence intent) | `Trig.paramLocks` | note pitch, velocity, slide, duration, chance |
| Instrument-side (sound shape) | NEW: per-edge "lock map" on `Pattern → Instrument` edge | cutoff, resonance, env decay, voice params |
| FX/send-side | (same edge, or instrument node-level) | reverbSend, delaySend, insertFx mix |

The cleanest model: when a Pattern routes to an Instrument, the edge holds an
optional `Record<stepIndex, Record<paramName, number>>` for instrument-side locks.
This makes the same pattern produce different sounds on different instruments —
each instrument can override per-step. (Default: no overrides; the instrument plays
the pattern at its own static params.)

### Multi-source fan-in semantics

When N sources connect to one instrument:

- **Note-on events stack.** Each source fires note-ons independently; the
  instrument's voice handles polyphony per its own rules (poly voice voices all
  notes; mono voice applies note priority / steal).
- **Pattern-side P-Locks (note, velocity, slide, duration, chance)** travel with
  the trig from its source pattern — no conflict arises across sources.
- **Instrument-side P-Locks (cutoff, resonance, decay)** become **last-write-wins**:
  whichever source fired most recently sets the instrument param. User mental
  model — "the last note that hit determines the current sound" — matches how
  real polyphonic synths behave under per-note modulation.
- **Edge merge mode** defaults to `union` (all sources play). Future options
  deferred until demand is observed:
  - `union` (default): polyphony-driven; all sources contribute
  - `fill`: source fires only when no other source has fired at this step
  - `priority`: lower-priority sources are muted while higher-priority sources
    are active (symbolic-layer sidechain)
- **Mute / solo per edge**: each `Source → Instrument` edge has its own mute and
  solo toggle, surfaced on the instrument tile's detail view. Independent A/B
  of layers.

Phase 1 ships `union` only.

### Polymetric time origin

Patterns can be different step counts and route to different instruments.
Playback must define:

- **Pattern length in time** = `steps × (1/divisor) × beat_ms`.
- **Scene segment boundary**: when does the segment end?
  - Option A: longest pattern wins (others loop).
  - Option B: explicit segment duration on a "frame" scene node (overrides pattern
    lengths).
  - Option C: pattern-LCM (least common multiple of pattern lengths in steps).
- **Phase reset on scene transition**: do all patterns start at step 0 when the
  segment begins, or do they preserve phase across transitions?

Recommended default: **all patterns reset to step 0 on segment entry; segment
length = longest connected pattern; shorter patterns loop within segment**. This
matches the current single-pattern semantics for the simple case and degrades
gracefully when polymetric.

### Modifier routing

The modifier types split by where they apply:

| Modifier | Routes to | Reason |
|---|---|---|
| transpose | Pattern (in chain) or Pattern→Instrument edge | Note transformation |
| repeat | Pattern (in chain) | Sequence-level repeat |
| tempo | Pattern (in chain) or scene segment | Sequence-level time |
| fx | Instrument | Audio post-processing |
| sweep | (scope-dependent: target on master, fx, eq, instrument) | Continuous parameter automation |

The "satellite attachment" UI from [ADR 116](archive/116-node-function-ux.md) extends:
transpose can attach to a pattern OR to a Pattern→Instrument edge; fx attaches to
an instrument.

### Mobile UI: instrument-shelf primary surface

The data model gives mobile its first non-degraded surface:

```
┌─────────────────────────────────────────┐
│  ▶ ❚❚ ⏺          BPM 124         ⫶ menu │  ← Header (transport, BPM, menu)
├─────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  │ Pat A   │ │ Pat B   │ │ Turing  │    │  ← Pattern + generative source shelf
│  │ 16 step │ │ 12 step │ │ engine  │    │     (scroll horizontally)
│  └─────────┘ └─────────┘ └─────────┘    │
│                                          │
│      ╲╱  connect by tap/drag  ╲╱        │  ← Connection canvas (lightweight)
│                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐        │
│  │ KICK   │ │ BASS   │ │ LEAD   │ ─►    │  ← Instrument shelf (always visible)
│  │ vol ▮  │ │ vol ▮▮ │ │ vol ▮▮▮│       │     (the conductor's row)
│  └────────┘ └────────┘ └────────┘        │
├─────────────────────────────────────────┤
│  Step grid (only when drilling a pattern)│  ← Bottom sheet, dismissable
└─────────────────────────────────────────┘
```

Primary mobile gestures:

- **Tap instrument tile** → focus mixer/voice params for that instrument
- **Tap pattern tile** → focus pattern (open bottom-sheet step view)
- **Drag pattern → instrument** → create routing edge (or auto-connect when there's
  one obvious target)
- **Long-press instrument** → attach a fresh generative as direct driver (no
  pattern needed)
- **Two-finger swipe** between pattern shelves to switch scene segments

The connection canvas in the middle is **simplified** vs desktop scene canvas —
no free placement, edges are tap-to-connect, layout is auto. Full scene editing
remains a desktop / landscape-tablet surface.

### Pads as instrument tile interaction (not a separate source node)

The MPC-style realtime pad triggering ([ADR 098](archive/098-mobile-landscape.md)
"Realtime Pads" idea memo) lives as an **interaction property on the instrument
tile**, not a separate scene node. Long-press an instrument tile in the primary
surface → full-screen pad view appears, allowing real-time triggering of the
voice. Optional record-arm captures taps into the pattern routed to that
instrument.

Reasons not to model pads as a source node:
- Pads carries no independent data (the voice lives on the Instrument; recorded
  notes go to the Pattern). A node with no data is conceptual clutter.
- The "tap pad → record into adjacent pattern" flow is naturally expressed by
  the existing instrument + pattern edge.

Revisit if [ADR 130](130-sampler-sheet.md) Phase 2/3 introduces "pads with
independent sample groups" (pads owning sound data) — that would justify a
SamplePack source node type. Until then, pads = instrument interaction.

### Mobile UX principles

The decoupled data model is necessary but not sufficient for mobile to escape
"PC degraded version". The mobile design must also embody a set of UX principles
captured in [`../v1/mobile.md`](../v1/mobile.md): touch-native scene canvas,
live-tile nodes, "touch = sound" universal feedback, smart defaults, randomizer
evolution beyond all-or-nothing, generative engines reframed as musical
personalities, intent dials. Those principles operate atop this ADR's data model
but are documented separately because they apply across desktop/mobile and are
not strictly architectural.

### Save data migration

Per `feedback_backward_compat` memory: save data must never break. Migration runs
at `restoreSong` boundary:

1. For each `Song.tracks[i]`: create an `Instrument` with id `inst_{trackId}`,
   carrying volume/pan/muted from Track.
2. For each `Pattern.cells[i]`:
   - Create a new pattern (or split) per cell. The old pattern's cells become
     N new patterns, each routing to the instrument created in step 1.
   - Migrate `Cell.voiceId/voiceParams/presetName/sends/insertFx/sampleRef` to the
     instrument.
   - Migrate `Cell.trigs/steps/scale` to the new pattern.
   - Insert scene nodes: one instrument node per voice, one pattern node per
     migrated pattern, with auto edges Pattern → Instrument.
3. For each generative node: `targetTrack` becomes an edge from the generative
   node to the pattern node corresponding to that track's cell.
4. P-Locks on old cells split: pattern-side keys (`note`, `velocity`, `slide`)
   stay on `Trig.paramLocks`; instrument-side keys (everything else) move to a
   new edge-level lock map.

The migration produces a scene graph that is **structurally equivalent** to the
old single-pattern multi-track playback. Existing songs play unchanged. New songs
can use the decoupled features (pattern reuse, polymetric, direct generative
routing).

## Considerations

### Cost: this is a foundational rewrite

- `Cell.trackId`-centric code touches every action module:
  [stepActions.ts](../../../src/lib/stepActions.ts),
  [sceneActions.ts](../../../src/lib/sceneActions.ts),
  [sweepRecorder.svelte.ts](../../../src/lib/sweepRecorder.svelte.ts),
  [scenePlayback.ts](../../../src/lib/scenePlayback.ts),
  [generative.ts](../../../src/lib/generative.ts),
  the AudioWorklet message format ([dsp/types.ts](../../../src/lib/audio/dsp/types.ts)),
  the WorkletPattern build path ([worklet-processor.ts](../../../src/lib/audio/worklet-processor.ts)).
- UI: `StepGrid`, `MobileTrackView`, `MobileMatrixView`, `DockPanel`,
  `SceneView`, `PadsView`, `PatternToolbar` all assume `cells[track]` indexing.
- Documentation: DATA_MODEL.md, MESSAGE_FLOW.md, architecture.md all describe
  the current entanglement and need rewriting.
- Test coverage: most tests instantiate the old shape; clone-roundtrip,
  scene-graph, and sweep tests all need new fixtures.

### Beginner cognitive load

The current model has a clear ramp: pick a voice on the track, hit play, place
trigs. The decoupled model adds a step: place an instrument, create a pattern,
connect them. Mitigations:

- **Starting template**: new project creates 4 default instrument nodes (KICK /
  SNARE / BASS / LEAD) auto-connected to a starter pattern each. The user
  initially sees something close to the current model — they just don't have to
  understand the routing to use it.
- **Auto-connect on instrument creation**: dropping a new instrument onto the
  canvas, when the selected pattern has a free routing slot, auto-creates the
  edge. The user "adds instruments" without thinking about edges.
- **Hide the graph by default**: the primary mobile surface (instrument shelf
  + pattern shelf, p.UI above) hides edges entirely. Edges are inferred from
  shelves; the underlying graph is editing detail only surfaced on demand.

### What dies, and is that OK?

- **`Cell.trackId` and the "one row per track" mental model.** This was inboil's
  Elektron-derived ground floor. Removing it changes the product's character
  from "browser groove box" toward "modular generative DAW". The user has
  signaled this direction is desired ("scene arrangement is experimental — aiming
  for generative music beyond linear timelines").
- **Per-pattern voice assignment ([ADR 062](archive/062-per-pattern-voice.md)).**
  This ADR put voiceId on Cell so that different patterns could use different
  voices on the same track. The new model expresses this differently: connect the
  pattern to a different instrument. No expressiveness lost; routing replaces
  per-pattern voice assignment.
- **Per-track Section parameters** (already deprecated post-ADR 044).
- **Per-track FX automation targets** (sweep, automation) — these now target
  instruments, which is semantically clearer.

### Alternatives considered

1. **Surface-only mobile rebuild** (keep current data model, rewrite Mobile* components).
   Rejected: the user diagnosed "mobile is a degraded PC version" as a
   *structural* problem, not a polish problem. No amount of mobile UI polish
   relocates the primary editing concept away from the cells-by-track grid.

2. **Layer-stack model** (Endlesss-style: each layer = voice + generator + freeze,
   no patterns or scene graph). Rejected: discards inboil's scene graph
   identity and the "generative arrangement beyond linear timelines" goal.
   Effectively requires building a different product.

3. **Generator-primary model** (Cell.trigs becomes generator-output freeze overlay,
   every track has built-in generator). Considered. This is a meaning-shift on
   the same data, not a structural change. It addresses "generative is everywhere"
   but doesn't solve the core problem that voice and sequence are coupled.
   Compared to the proposed decoupling, it solves less for similar work; rejected
   as not going far enough.

4. **Keep current model, add Instrument node as an opt-in alias.** Rejected:
   doubles the implementation surface, fragments the data model, postpones the
   underlying inconsistency rather than resolving it.

### Open design questions

- **Edge multiplicity on Pattern → Instrument**: should a single pattern route to
  multiple instruments cleanly (fan-out), or should layering be expressed via
  Instrument → Instrument edges (chain)? Fan-out is simpler; chain enables
  per-link processing.
- **Pattern reuse model**: are patterns shared by reference (edit once, affects
  all routings) or copied per routing? Reference is cleaner; copy is safer for
  users who want isolated variants. Default: reference, with explicit "duplicate"
  action.
- **Where does the genre-aware randomizer ([ADR 129](archive/129-genre-aware-randomizer.md))
  live?** Currently it operates on all cells of a pattern. In the new model it
  must either (a) randomize a single pattern (single voice context lost — random
  beat with no idea what plays it) or (b) randomize a pattern + auto-assign
  instruments. (b) is closer to current behavior but couples randomizer to
  instrument creation.
- **Per-track step scale ([ADR 112](archive/112-per-track-step-scale.md))** becomes
  per-pattern step scale. The "polymetric within a pattern" case (track A at 1/16,
  track B at 1/12, both in pattern X) requires the user to split into two
  patterns. Acceptable simplification?
- **Mobile FX/EQ/Master sheets** — these target the global bus and don't change
  semantically. Confirm they still surface naturally in the instrument-shelf
  layout.
- **Conflict with [ADR 130](130-sampler-sheet.md) Pads view and [ADR 131](131-pattern-editor-integration.md)
  Pattern Editor** — both assume cell-per-track addressing. They need rework
  under the new model or explicit deprecation.

### Conflict with prior roadmap

Per memory, inboil's focus was shifting to iDEATH/VST work after the beta polish.
This ADR represents a counter-proposal: redirect that effort into a mobile-first
v1.0 of inboil based on the decoupled model. Whether to adopt this ADR
implementation-wise is a roadmap question separate from this design's correctness.

## Future Extensions

- **Instrument groups / racks**: a node type that wraps multiple instruments,
  presenting one Pattern-input edge that fans out internally. Useful for drum
  groups, layered pads.
- **Pattern library / sharing**: voice-agnostic patterns are portable across songs
  and shareable ([ADR 107](107-pattern-sharing-api.md) gains expressive power —
  share a beat, the receiver routes to their own instruments).
- **Cross-pattern modulation**: a generative node could subscribe to multiple
  patterns or instruments, enabling true band-like coordinated playing.
- **MIDI export per pattern**: voice-agnostic patterns → MIDI tracks are clean
  one-to-one (currently MIDI export must reverse-engineer voice mapping).
- **External instrument routing**: a `MidiOut` instrument node sends pattern
  output to external MIDI gear. The decoupled model makes this trivial — the
  pattern doesn't care what plays it.
- **AI-assisted composition**: an LLM/AI driver ([ADR 109](109-ai-composer-api.md))
  becomes a pattern source (generative) or an instrument curator (suggesting
  voices to route patterns to), aligning with the user's "AI as composing
  partner" vision.
