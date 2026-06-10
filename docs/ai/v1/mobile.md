# v1 Mobile UI Design

Companion to [ADR 133](../adr/133-instrument-pattern-decoupling.md). The ADR
captures the data model; this document captures the mobile UX that the data
model exists to enable.

The design principles here apply across both desktop and mobile, but mobile is
where they are load-bearing. Desktop can fall back on familiar UI patterns;
mobile cannot.

## Design law: touch = sound

Every touch on a node produces audible feedback. Silent taps do not exist.

| Gesture | Effect | Audible result |
|---|---|---|
| Tap pattern node | Audition the pattern, 1 loop in-place | Heard immediately |
| Tap instrument node | Strike one note from that voice | Heard immediately |
| Tap generative node | Re-roll the engine, output flows downstream | Heard if connected |
| Tap edge | Toggle mute on that connection | Audible change |
| Long-press node | Isolation preview — others mute, this one solos | Heard solo |
| Drag knob / dial | Continuous parameter change | Heard live |

The rule has one purpose: **make the structure tangible by ear**. A user
exploring the scene canvas should be able to learn the graph by touching every
node and hearing what it does — no documentation, no labels-as-explanation.

## Primary surface: scene-centric

The mobile primary view is the scene canvas. It fills the screen. It is not a
shrunk desktop graph editor; it is built for touch from scratch.

```
┌─────────────────────────────────────────┐
│  ▶ ❚❚    BPM 124         ⫶ menu         │  ← compact header
├─────────────────────────────────────────┤
│                                          │
│      ┌────┐         ┌────┐               │
│      │Drum│ ──────▶ │KICK│               │
│      │pat │         │    │               │
│      └────┘         └────┘               │
│                       ▲                  │
│      ┌────┐           │                  │
│      │Drift│─┐        │                  │
│      └────┘ └────────┘                   │  ← scene canvas fills view
│                                          │
│      ┌────┐         ┌────┐               │
│      │Bass│ ──────▶ │BASS│               │
│      │pat │         │    │               │
│      └────┘         └────┘               │
│                                          │
│                              ┌─┐         │
│                              │+│ palette │  ← add-node corner
│                              └─┘         │
└─────────────────────────────────────────┘
```

Tapping any node opens its detail view (full-screen overlay, dismissable to
return to scene). Editing of pattern internals (step grid / pads / piano roll)
happens in the detail view. The scene canvas itself is for routing and overview.

## Touch-native scene canvas

The canvas is **not** the desktop scene canvas at smaller scale. Specifically:

### Auto-layout, no free placement

Node positions are computed from the graph topology. Users do not drag nodes to
position them. Layout strategy:

- Sources (Pattern, Generative) align on the left
- Instruments align on the right
- Edges flow left-to-right
- Vertical position groups related nodes (an instrument and its connected
  sources cluster together)

This avoids the precision-pointing tax of free placement. It also keeps the
graph readable as nodes are added — no "my scene became a tangle of crossed
edges" failure mode.

### Live tiles, not abstract icons

Each node is a **live tile** showing its current musical state, not an editor
icon:

- **Instrument tile**: voice name (e.g. "KICK"), level meter pulsing with output,
  current note pitch class if playing
- **Pattern tile**: mini step preview (16 cells at 4×4), playhead indicator
  highlighting the currently-playing step, density visualizable at a glance
- **Generative tile**: engine-specific real-time visualization
  ([ADR 117](../adr/archive/117-generative-ux-simplification.md) already started
  this — Turing's register bits, Quantizer's keyboard, Tonnetz's lattice)
- **Modifier tile**: micro-animation tied to its parameter
  ([ADR 116](../adr/archive/116-node-function-ux.md) parameter-driven
  micro-interactions)

The whole canvas behaves like a dashboard of the running music. Glance = see
what is happening; tap = drill in.

### Tap behaviors

| Gesture | On node | On edge | On empty canvas |
|---|---|---|---|
| Tap | Audition + focus (open detail view) | Toggle mute on connection | Deselect |
| Long-press | Isolation preview (solo this) | Show edge menu (delete, label, merge-mode) | Open palette |
| Double-tap | Re-roll (for generative); jump to top of detail (for pattern/instrument) | — | — |

### Edge creation

No drag-to-connect. Sequence:

1. Tap source node → it highlights as "selected source"
2. Tap target node → edge auto-created
3. Optionally tap edge to label / configure / mute

This eliminates two-finger drag, makes edge creation thumb-only, and reduces
mis-taps. Equivalent to the desktop satellite-attach model from
[ADR 116](../adr/archive/116-node-function-ux.md).

### Add-node palette

Corner `+` button opens a small palette:

```
┌──────────────────────┐
│  + PATTERN           │
│  + INSTRUMENT        │
│  + DRIFT (Turing)    │
│  + CASCADE (Tonnetz) │
│  + SNAP (Quantizer)  │
│  + SWEEP             │
│  more ▾              │
└──────────────────────┘
```

Most-used types surface first. New nodes auto-position into the layout.

## Mobile scene scale: 6-8 node soft ceiling

The mobile-editable scene size has a practical upper bound. Beyond ~6-8 nodes,
the canvas becomes hard to read on a phone screen, even with auto-layout. This
is acknowledged as a design constraint:

- Mobile-composed scenes typically fit in this scale
- Larger scenes (full songs with verse / chorus / bridge / breakdowns and
  ornament generators) require desktop or landscape-tablet editing
- This is not a limitation on rendering / playback — large scenes play fine on
  mobile, they're just hard to edit in portrait

Mitigation later: **scene zoom + grouping** (collapse a sub-graph into a single
tile, expand by tap). Defer until users hit the ceiling.

## Usability moves

### Smart defaults — new project is already playing

A brand-new project does **not** start empty. It loads a starting template:

```
Sources                Instruments
┌──────────┐          ┌──────────┐
│ Pat-A    │ ───────▶ │ KICK     │
└──────────┘          └──────────┘
┌──────────┐          ┌──────────┐
│ Pat-B    │ ───────▶ │ BASS     │
└──────────┘          └──────────┘
┌──────────┐          ┌──────────┐
│ Pat-C    │ ───────▶ │ LEAD     │
└──────────┘          └──────────┘
```

Transport is playing on load. Patterns hold a viable starter rhythm /
bassline / lead. User's first interaction is "change something already playing",
not "figure out how to start playing". Genre templates ([ADR 129](../adr/archive/129-genre-aware-randomizer.md))
can be the source.

### Randomizer evolution — beyond all-or-nothing

The current RND button replaces the pattern wholesale, which is high-friction
("I liked some of what I had"). v1 splits randomization into four verbs,
applicable on any source or per-instrument:

- **Evolve**: small mutation. ~30% of trigs change. Repeated taps let the user
  walk through variation space without ever losing all context.
- **Variations**: show 3-5 alternative candidates inline; tap to commit, or
  dismiss to keep the original.
- **Lock & Roll**: lock the steps the user wants to preserve; RND only affects
  the unlocked rest.
- **Style transfer**: keep the rhythmic structure of the current pattern but
  re-flavor it (lo-fi, techno, ambient).

Each verb is also exposed on generative source nodes (re-rolling a Drift
applies the same vocabulary).

### Generative engines as musical personalities

Engineering names get replaced or supplemented with musical metaphors. Detail
view retains the engineering surface for users who want it; primary surface uses
the personality framing.

| Engine | Personality name | What it does, in plain words |
|---|---|---|
| Turing Machine | **Drift** | Walks slowly through a sequence space; loops with subtle variation |
| Tonnetz | **Cascade** | Chord progressions that move smoothly through related keys |
| Quantizer | **Snap** | Forces notes into a scale; useful as a glue layer for Drift / Cascade |
| Sweep | (keep "Sweep") | Continuous parameter automation |

Tile visuals reflect the personality:
- Drift tile shows drifting points
- Cascade tile shows a flowing chord lattice
- Snap tile shows a scale grid with a current note locked into place

Names are placeholders; final naming decision lives in a future review pass.

### Intent dials — musical macros, not parameters

At each scope (instrument, pattern, scene), expose a small number of **intent
dials** that map to musical outcomes, not DSP parameters:

| Scope | Dials |
|---|---|
| Per-instrument | busier ↔ sparser, brighter ↔ darker |
| Per-pattern | groovier ↔ straighter, ornate ↔ minimal |
| Per-scene | more energy ↔ less, more tension ↔ resolve |

Internally each dial composes multiple existing parameters (cutoff, reverb,
density, velocity distribution, generative output rate, etc.). The user thinks
in musical intent; the dial drives the underlying mechanics.

**Implementation note**: intent dials are **macro offsets** applied on top of
direct parameter values. If the user directly touches an underlying parameter,
the intent dial snaps to 0 (the user has taken manual control). No silent
fight between macros and direct knobs.

### Progressive disclosure

Complexity is hidden by default and surfaced on demand:

- Advanced edge options (merge mode, polymetric divisor, per-edge P-Locks)
  appear only when an edge is long-pressed
- Voice deep-edit (operators, envelopes, filter response curves) appears only
  inside instrument detail view's "more" tab
- Scene grouping / zoom appears only when the scene exceeds the ~6-8 node soft
  ceiling
- Generative engineering surface (shift register, lattice ops, scale notation)
  appears only in the generative detail view's "more" tab

The default surface should be navigable by a user with no inboil prior knowledge
and no music theory beyond "this sounds good".

## Open questions

- **Personality names**: Drift / Cascade / Snap are placeholders. Final naming
  needs bilingual review (per CLAUDE.md conventions, both EN and JA should feel
  natural). Need to validate against `feedback_lp_copy` memory tone guidance.
- **Intent dial defaults**: each dial needs a default position that means
  "as-currently-configured". The dial then represents a relative push from that
  baseline. Persistence question: does the baseline travel with the project, or
  is it always re-zeroed on load?
- **Touch = sound vs. accidental triggers**: tapping a node to "select" it also
  auditions it. This is intentional but loud. Mute defaults during palette open
  and during detail-view navigation may be needed.
- **Scene canvas zoom**: not yet specified. Pinch zoom is a candidate but
  conflicts with detail-view double-tap. Alternative: tap-to-zoom (single tap
  on background expands the area around the tap).
- **Mobile-only scene size limit interaction with desktop**: if a desktop-built
  scene with 30 nodes opens on mobile, what does mobile show? A "scene too
  large to edit on mobile, view-only" mode? Auto-collapse into groups?
