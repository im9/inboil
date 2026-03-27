# ADR 126: Tonnetz Lattice View & Per-Step Transforms

## Status: Proposed

## Context

The Tonnetz generative engine (ADR 078) is inspired by Ornament & Crime's Tonnetz mode — neo-Riemannian transforms walking a chord lattice. However, the current implementation dilutes the generative character:

1. **`stepsPerChord` holds the same chord for N steps** — a 16-step slot means 16 identical steps. This turns a lattice walker into a slow chord sequencer.
2. **No lattice visualization** — the user edits a list of dropdown selectors with no spatial sense of where they are on the lattice or where transforms lead.
3. **Repetitive loops** — when slots cycle, explicit chords reset the position, producing identical repetitions instead of evolving walks.

### What O&C Tonnetz does right

- **1 clock = 1 transform** — every trigger advances the chord. With sequence [P, L, R], step 1 applies P, step 2 applies L, step 3 applies R, step 4 applies P again — but on the chord R produced. The harmony evolves continuously.
- The lattice position is the state. Transforms are relative moves, not absolute destinations.

### Current data model

```typescript
interface TonnetzParams {
  engine: 'tonnetz'
  startChord: [number, number, number]
  voicing: 'close' | 'spread' | 'drop2'
  sequence?: string[]       // legacy
  stepsPerChord?: number    // legacy
  slots?: TonnetzSlot[]     // ADR 126 v1 — being replaced
}
```

## Decision

### 1. Generation: 1 step = 1 transform

The core change: every pattern step applies the next transform in the sequence. The chord changes on every step.

```typescript
interface TonnetzParams {
  engine: 'tonnetz'
  startChord: [number, number, number]
  voicing: 'close' | 'spread' | 'drop2'
  sequence: string[]           // transform ops: 'P' | 'L' | 'R' | 'PL' | 'PR' | 'LR' | 'PLR' | '' (hold)
  stepsPerTransform?: number   // steps each chord is held before next transform (default: 1, range 1–64)
  rhythm?: TonnetzRhythm       // which steps are active trigs vs rests (default: 'all')
  anchors?: TonnetzAnchor[]    // explicit chord resets at specific step positions
}

/** Anchor: force a specific chord at a specific step position */
interface TonnetzAnchor {
  step: number                         // 0-based step index
  chord: [number, number, number]      // explicit triad
}

/** Rhythm pattern — controls which steps produce sound */
type TonnetzRhythm =
  | boolean[]
  | 'all'                              // every step active (default)
  | 'legato'                           // first step of each chord boundary, held for stepsPerTransform
  | 'offbeat'                          // . x . x . x . x
  | 'onbeat'                           // x . . . x . . .
  | 'syncopated'                       // x . x . . x . x
  | { preset: 'euclidean'; hits: number }
```

**Key differences from v1:**

- `sequence` is the transform list (cycles when exhausted). `''` = hold (no transform, chord sustains).
- `stepsPerTransform` controls how many steps each chord is held. 1 = O&C style (chord changes every step). 4+ = pad style (chord held, then next transform). This replaces the old `stepsPerChord`.
- `rhythm` controls which steps produce sound. `'legato'` triggers only at chord boundaries with full duration hold — classic pad behavior.
- `anchors` are optional reset points (e.g., "at step 32, jump to F major"). These replace v1's explicit chord slots.
- No `slots` — the slot duration concept is replaced by `stepsPerTransform` (uniform) and anchors (point resets).

**Generation pseudocode:**

```
function tonnetzGenerate(params, totalSteps):
  chord = params.startChord
  spt = params.stepsPerTransform ?? 1
  anchorMap = Map(params.anchors, a => a.step → a.chord)
  rhythm = resolveRhythm(params.rhythm ?? 'all', totalSteps)
  seqIdx = 0
  trigs = []

  for step in 0..totalSteps:
    // Check for anchor reset
    if anchorMap.has(step):
      chord = anchorMap.get(step)
    else if step > 0 and step % spt == 0:
      op = params.sequence[seqIdx % params.sequence.length]
      if op != '':
        chord = applyTonnetzOp(chord, op)
      seqIdx++

    isChordBoundary = step % spt == 0
    voiced = applyVoicing(chord, params.voicing)

    if rhythm == 'legato':
      if isChordBoundary:
        trigs.push(active trig with notes=voiced, duration=spt)
      else:
        trigs.push(inactive trig)
    else if rhythm[step]:
      trigs.push(active trig with notes=voiced)
    else:
      trigs.push(inactive trig)

  return trigs
```

- Step 0 always plays `startChord` (no transform applied).
- Transforms applied at every `stepsPerTransform` boundary (step 0, spt, 2*spt, ...).
- `stepsPerTransform=1`: O&C style, chord changes every step.
- `stepsPerTransform=4`: pad style, chord held for 4 steps before next transform.
- `rhythm='legato'`: only chord boundaries trigger, held for full `stepsPerTransform` duration.
- Sequence cycles: transform N uses `sequence[N % sequence.length]`.
- Anchors override the chord at specific steps — the lattice "jumps" to a new position.
- After an anchor, transforms continue from the new chord.

### 2. Tonnetz Lattice View (overlay sheet)

A dedicated full-screen overlay sheet (same model as PatternSheet — ADR 054) showing an interactive Tonnetz lattice.

**Visual design:**

```
┌─────────────────────────────────────────────────────────┐
│  TONNETZ ─ Classic P·L·R                    [×]  close  │
│─────────────────────────────────────────────────────────│
│                                                         │
│         ╱╲    ╱╲    ╱╲    ╱╲    ╱╲    ╱╲               │
│        ╱Eb╲  ╱Bb╲  ╱ F╲  ╱ C╲  ╱ G╲  ╱ D╲              │
│       ╱ m  ╲╱ m  ╲╱ m  ╲╱ m  ╲╱ m  ╲╱ m  ╲             │
│      ╱╲────╱╲────╱╲────╱╲────╱╲────╱╲────╱╲            │
│     ╱Ab╲  ╱Eb╲  ╱Bb╲  ╱ F╲  ╱ C╲  ╱ G╲  ╱D ╲          │
│    ╱ M  ╲╱ M  ╲╱ M  ╲╱ M  ╲╱ M★╲╱ M  ╲╱ M  ╲         │
│   ╱╲────╱╲────╱╲────╱╲────╱╲────╱╲────╱╲────╱╲        │
│  ╱ C╲  ╱ G╲  ╱ D╲  ╱ A╲  ╱ E╲  ╱ B╲  ╱F# ╲  ╲       │
│ ╱ m  ╲╱ m  ╲╱ m  ╲╱ m  ╲╱ m  ╲╱ m  ╲╱ m   ╲         │
│ ╲────╱╲────╱╲────╱╲────╱╲────╱╲────╱╲────╱            │
│                                                         │
│  ★ = current chord    ● = walk path                     │
│                                                         │
│  SEQ: [P] [L] [R] [+]           VOICE [close ▾]        │
│  RHYTHM [all ▾]                  ANCHORS: 0             │
│─────────────────────────────────────────────────────────│
│  ▶ step 12/64  Am → P → Fm → L → Db → R → Bbm         │
│  ◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼◼  │
└─────────────────────────────────────────────────────────┘
```

**Lattice interaction:**

- **Triangle grid**: major triads (upward △) and minor triads (downward ▽) arranged in the standard Tonnetz layout. Edges shared between adjacent triangles represent P, L, R transforms.
- **Current chord highlight** (★): shows where the lattice walker is now. Animates during playback.
- **Walk path** (●): traces the path the walker has taken — fades over time to show directionality.
- **Tap a triangle**: set as `startChord` (if stopped) or add as anchor (if playing/editing).
- **Drag across triangles**: define a walk path → auto-generates the sequence of transforms needed to traverse that path.
- **Pinch/scroll**: pan the lattice (it's infinite in theory, but render 5–7 rows centered on startChord).

**Bottom controls:**

- **SEQ row**: editable sequence of transform ops. Tap to change, [+] to add, swipe to remove. Visually compact pills.
- **RHYTHM**: single selector for the whole sequence.
- **VOICE**: voicing selector.
- **ANCHORS**: count badge; tap to manage anchor list.
- **Playback strip**: mini step indicator showing current position, with chord name trail.

**Trigger:**

- Tonnetz node double-tap in SceneView (same as PatternSheet trigger for pattern nodes).
- "EDIT" button in DockPanel generative editor (DockPanel keeps compact summary: voicing, sequence preview, preset selector).

### 3. DockPanel summary (compact)

DockPanel no longer hosts the full editor. It shows:

```
┌─ TONNETZ ─────────────────────┐
│  SEQ  P · L · R               │
│  VOICE close    RHYTHM all    │
│  [EDIT]  [GEN]                │
│  MERGE [REPLACE] [FILL]       │
│  TARGET [1: KICK]             │
│  PRESET [Classic P·L·R ▾]    │
└───────────────────────────────┘
```

The [EDIT] button opens the Tonnetz sheet.

### 4. Backward compatibility & migration

- Legacy saves with `sequence` + `stepsPerChord`: migrate by expanding — if `stepsPerChord` is 4 and `sequence` is `['P','L','R']`, the new sequence is `['P','L','R']` (same) and rhythm becomes `'all'`. The old `stepsPerChord` concept is gone; instead the chord changes every step.
- v1 saves with `slots`: migrate by flattening — each slot's `op` is repeated for `slot.steps` times in the new sequence. Explicit chord slots become anchors at the corresponding step position.
- `startChord`, `voicing` are unchanged.

### 5. Presets

```typescript
// O&C-style generative walks
{ name: 'Classic P·L·R', sequence: ['P', 'L', 'R'] }
{ name: 'Cinematic Walk', sequence: ['L', 'P', 'R', 'L'], voicing: 'spread' }
{ name: 'Jazz Drift', sequence: ['PL', 'R', 'L', 'PR'], voicing: 'drop2' }
{ name: 'Minimal P', sequence: ['P'] }
{ name: 'Dark Walk', sequence: ['R', 'L', 'P'], startChord: [48, 51, 55], voicing: 'spread' }

// Chord progressions with anchors + rhythm
{ name: 'House Stabs', rhythm: 'offbeat', anchors: [
  { step: 0, chord: [60,64,67] }, { step: 16, chord: [55,60,64] },
  { step: 32, chord: [57,60,64] }, { step: 48, chord: [53,57,60] },
], sequence: [''] }  // hold between anchors

{ name: 'Pad Progression', anchors: [
  { step: 0, chord: [60,64,67] }, { step: 32, chord: [53,57,60] },
  { step: 48, chord: [55,59,62] },
], sequence: [''] }

// Hybrid: walk + anchor reset
{ name: 'Walk & Reset', sequence: ['P', 'L', 'R'],
  anchors: [{ step: 32, chord: [60, 64, 67] }] }  // reset to C at bar 3
```

## Implementation Checklist

### Phase 1: Generation engine rewrite + DockPanel
- [x] Rewrite `tonnetzGenerate()` — transforms applied every `stepsPerTransform` steps
- [x] Add `stepsPerTransform` param (1–64, default 1 for O&C style, 4 for default node)
- [x] Add `TonnetzAnchor` type and anchor support in generation
- [x] Replace `TonnetzSlot` with new `TonnetzParams` shape (sequence + rhythm + anchors + stepsPerTransform)
- [x] Update `TonnetzRhythm` — add `'all'`, restore `'legato'` (first of each chord boundary)
- [x] Migrate v1 slots → new format in `restoreScene()`
- [x] Migrate legacy `stepsPerChord` → new format
- [x] Update validation in `validate.ts` (anchors, sequence)
- [x] Replace DockPanel slot editor with compact summary (RATE knob, SEQ, VOICE, RHYTHM)
- [x] Update SceneView faceplate + sceneGeometry label for new params
- [x] Update presets to new format (O&C walks + anchor-based progressions)
- [x] Update default Tonnetz config in sceneActions
- [x] Update Playground generator component
- [x] Unit tests: per-step transforms, anchors, rhythm, stepsPerTransform, legato, evolution (477 passing)

### Phase 2: Tonnetz Lattice View
- [x] Create `TonnetzSheet.svelte` overlay component (ADR 054 sheet model)
- [x] SVG triangle lattice rendering (7×5 vertex grid, △ major / ▽ minor)
- [x] Tap triangle → set startChord + auto-regenerate
- [x] Current chord highlight (olive = start, blue = playing)
- [x] Walk path trail (olive polyline connecting visited chords on lattice)
- [x] Walk-visited triangles highlighted (faded olive)
- [x] Playback chord name trail (bottom strip: chord history with → arrows)
- [x] Drag across triangles → auto-detect transforms, set sequence from path
- [x] SEQ pills now editable (per-op select dropdowns)
- [x] Bottom controls: SEQ pills (+/−/edit), RATE input, VOICE select, RHYTHM select
- [x] Sheet trigger: Tonnetz node double-tap in SceneView + DockPanel [EDIT] button
- [x] Anchor management: right-click triangle to add, × to remove, badge display with step positions

### Phase 3: Polish & UX (priority order)

#### P0: Lattice geometry correctness
- [ ] Verify `noteAt()` produces correct Tonnetz adjacency — P/L/R transforms must connect geometrically adjacent triangles
- [ ] Test: for every triangle, applying P/L/R should land on a neighboring triangle in the SVG grid
- [ ] Fix any misalignment between mathematical transforms and visual adjacency

#### P1: Real-time playback feedback
- [ ] Animate current chord highlight moving across lattice during playback (blue dot/triangle follows the walk in real-time)
- [ ] Walk trail grows incrementally as playback advances (not pre-computed full path)
- [ ] Chord name trail scrolls smoothly, current chord prominent

#### P2: Onboarding via presets
- [ ] Selecting a preset should immediately show its walk on the lattice (visual "aha" moment)
- [ ] Consider auto-play on preset select so user hears + sees the result instantly
- [ ] Tooltip or brief label showing what each transform does ("P = flip major/minor")

#### P3: stepsPerTransform UX
- [ ] Allow adjusting RATE while playing — hear the change in real-time
- [ ] Consider a slider or drag gesture instead of number input for more tactile control
- [ ] Visual feedback: lattice walk speed changes visibly when RATE changes

#### P4: Anchor UX
- [ ] Replace right-click (not discoverable, no mobile support) with explicit mode toggle or long-press
- [ ] Show anchor positions on the lattice as distinct markers (e.g. pinned dots with step number)
- [ ] Allow dragging anchor step position or editing inline
- [ ] Validate anchor step doesn't exceed track length

### Phase 4: Docs
- [ ] Update tonnetz.mdx (EN + JA)

## Known Issues

- **Lattice geometry may not match real Tonnetz** — `noteAt()` uses fifths (horizontal) and major thirds (vertical) but the triangle construction may not correctly represent P/L/R adjacency. Drag-to-sequence relies on this being correct; misalignment means some drags silently fail to detect transforms.
- **stepsPerTransform feels binary** — 1 is too fast (every step changes chord), 4+ is slow. The sweet spot depends on tempo and genre. No visual guidance for what value to use.
- **Anchors are not discoverable** — right-click only, no mobile support, auto-placed step positions are often wrong. Users need to know step numbers which requires mental math.
- **No audio preview on lattice interaction** — tapping a triangle changes startChord but gives no immediate auditory feedback. The regeneration + playback loop is indirect.

- **Why remove slots?** The slot model (hold chord for N steps) conflicts with O&C-style per-step transforms. Anchors achieve the same "explicit chord at a point" goal without imposing duration-based thinking. The sequence is purely about transforms; anchors are purely about position resets.

- **Performance**: SVG lattice with ~50–100 triangles is lightweight. Walk path animation uses CSS transitions, not per-frame rendering.

- **Mobile**: The lattice view works well with touch — tap triangles, drag paths. The sheet model already handles mobile viewport.

- **Lattice bounds**: The Tonnetz is theoretically infinite but enharmonically wraps after ~30 fifths. Render 5–7 rows centered on startChord; pan to follow the walk if it drifts far.

## Future Extensions

- **Chord quality beyond triads**: 7th, sus2/sus4, add9 — extend `chord` from `[n,n,n]` to `number[]`
- **Roman numeral input**: key-aware I, IV, V, vi → MIDI conversion for anchors
- **Strum / arpeggio**: per-step note spread timing
- **Generative rhythm via Turing Machine**: feed Turing gate output into Tonnetz rhythm
- **Lattice zoom levels**: overview (full lattice) vs detail (single neighborhood with voice-leading arrows)
- **Path recording**: play a MIDI keyboard → record the lattice walk as a sequence
