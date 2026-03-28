# ADR 127: Quantizer & Turing Machine — Dedicated Views + Generator Chaining

## Status: Proposed

## Context

The Quantizer and Turing Machine generators are functional but lack visual feedback and expressiveness compared to the Tonnetz lattice view (ADR 126). Both suffer from:

1. **Invisible state** — Turing Machine's shift register and Quantizer's note mapping are invisible. Users can't see what's happening.
2. **Limited Quantizer** — currently only snaps to a scale. No chord-awareness, no harmony voices. Far behind hardware equivalents like O_C Acid Curds or Intellijel Scales.
3. **Generator chaining potential is hidden** — `executeGenChain` already supports Turing → Quantizer chains, but there's no way for Quantizer to reference Tonnetz's chord walk. The most musical combination (Tonnetz defines chords, Turing generates melody, Quantizer snaps to chord tones) is architecturally close but not connected.

### Hardware inspiration

- **O_C Acid Curds**: Quantizes input CV to chord tones (root, 3rd, 5th, 7th), not just scale degrees. Each step knows which chord is active.
- **Intellijel Scales**: Visual keyboard showing active notes. Generates parallel harmony voices (diatonic 3rds, 5ths above input).
- **Music Thing Turing Machine**: The shift register is inherently visual — bits flowing through a ring, mutations visible as flashes. The pattern either locks or evolves.

### Current architecture

```typescript
// Quantizer — scale-only snap
interface QuantizerParams {
  engine: 'quantizer'
  scale: string         // 'major', 'minor', 'dorian', etc.
  root: number          // 0–11
  octaveRange: [number, number]
}

// Turing — shift register RNG
interface TuringParams {
  engine: 'turing'
  length: number        // 2–32
  lock: number          // 0.0–1.0
  range: [number, number]
  mode: 'note' | 'gate' | 'velocity'
  density: number       // 0.0–1.0
}

// Chain execution (sceneActions.ts)
// Generators execute left-to-right: each node's output feeds the next.
// Quantizer takes trigs from upstream (or cell.trigs if first in chain).
// Turing → Quantizer chaining already works.
```

## Decision

### 1. Quantizer: Chord Mode + Harmony Voices

Extend Quantizer beyond scale snapping with two new modes:

```typescript
interface QuantizerParams {
  engine: 'quantizer'
  scale: string
  root: number
  octaveRange: [number, number]
  mode?: 'scale' | 'chord' | 'harmony'  // default: 'scale' (backward compat)

  // Chord mode: snap to chord tones with scale fallback
  chords?: QuantizerChord[]
  chordSource?: { nodeId: string }        // reference a Tonnetz node's walk

  // Harmony mode: add parallel diatonic voices
  harmonyVoices?: HarmonyVoice[]
}

interface QuantizerChord {
  step: number                            // step position where this chord starts
  notes: number[]                         // chord tones (pitch classes 0–11)
}

interface HarmonyVoice {
  interval: number                        // diatonic interval: 3 = 3rd, 5 = 5th, etc.
  direction: 'above' | 'below'           // parallel above or below
}
```

**Scale mode** (current behavior): snap notes to nearest scale degree. No changes.

**Chord mode**:
- Each step has an "active chord" from either manual `chords[]` or Tonnetz `chordSource`
- Chord tones get priority snapping (nearest chord tone)
- Non-chord scale tones are still valid but only used when the chord tone would be >2 semitones away
- This creates melodies that follow the chord progression without being rigidly locked

**Harmony mode**:
- Input notes are kept as-is (optionally scale-snapped first)
- Additional voices are generated at diatonic intervals above/below
- e.g., `{ interval: 3, direction: 'above' }` adds a diatonic 3rd above each note
- Output trigs get `notes[]` with the original + harmony notes
- Up to 3 harmony voices (original + 3 = 4-note chords max)

**Chord source from Tonnetz**:
- When `chordSource: { nodeId }` is set, Quantizer reads the walk path from the referenced Tonnetz node
- At each step, the current Tonnetz chord becomes the active chord for snapping
- This connects Tonnetz (chord progression) → Quantizer (melody following) without new edge types
- If the Tonnetz node doesn't exist or has no walk, falls back to scale-only

**Generation pseudocode (chord mode)**:

```
function quantizeChord(trigs, params, tonnetzWalk?):
  chordMap = buildChordMap(params.chords ?? tonnetzWalk)
  scaleNotes = buildScaleNotes(params)

  for each trig:
    chord = chordMap.getActiveChord(trig.step)
    chordNotes = expandChordToRange(chord, params.octaveRange)

    // Try chord tone first
    nearest = snapToNearest(trig.note, chordNotes)
    if abs(nearest - trig.note) <= 2:
      trig.note = nearest
    else:
      // Fallback to scale
      trig.note = snapToNearest(trig.note, scaleNotes)
```

### 2. Quantizer Sheet (overlay view)

A full-screen overlay sheet like TonnetzSheet, triggered by double-tap on Quantizer node or EDIT button in DockPanel.

```
┌─ QUANTIZER ─ C major ──────────────────── [×] ──┐
│                                                   │
│  MODE [scale ▾ | chord | harmony]                │
│                                                   │
│  ┌─ KEYBOARD (2 octaves) ────────────────────┐  │
│  │  C  C# D  D# E  F  F# G  G# A  A# B  C  │  │
│  │  ██    ██    ██ ██    ██    ██    ██ ██   │  │
│  │  ●        ●     ●        ●     ●    ●    │  │  ← scale tones
│  │  ▲        ▲              ▲               │  │  ← chord tones (accent)
│  │  ■                                        │  │  ← playing note (pulse)
│  └────────────────────────────────────────────┘  │
│                                                   │
│  SCALE [C major ▾]  ROOT [C ▾]  OCT [3–5]       │
│                                                   │
│  ── CHORD PROGRESSION (chord mode) ──────────── │
│  [Cmaj|4] [Am|4] [F|4] [G|4]  [+]              │
│   or: SOURCE [Tonnetz: Walk & Reset ▾]           │
│                                                   │
│  ── HARMONY VOICES (harmony mode) ───────────── │
│  [+3rd above ×] [+5th above ×]  [+ voice]       │
│                                                   │
│  step 5/16  input: D#4 → output: E4 (chord: Am) │
└───────────────────────────────────────────────────┘
```

**Keyboard interaction:**
- Tap a key to toggle it in/out of the scale (custom scale editing)
- In chord mode: chord tones shown with accent color, scale tones dimmer
- During playback: input note shown (faded), output note pulses (solid)
- Current chord name displayed above keyboard

**Bottom strip:**
- Real-time input→output mapping display
- Shows which chord is active and why the note was snapped

### 3. Turing Machine Sheet (overlay view)

```
┌─ TURING MACHINE ──────────────────────── [×] ──┐
│                                                   │
│  ┌─ REGISTER RING ────────────────────────────┐ │
│  │           ●                                 │ │
│  │        ●     ○         ← circular bits     │ │
│  │      ●         ○          filled = 1       │ │
│  │        ●     ○            hollow = 0       │ │
│  │           ●             ← read head = top  │ │
│  │                                             │ │
│  │     [FREEZE ❄]   [ROLL 🎲]                │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  LEN ━━━●━━━━ 8     LOCK ━━━━━━●━ 0.7          │
│  DENS ━━━━●━━ 0.7   MODE [NOTE ▾]              │
│                                                   │
│  ┌─ OUTPUT HISTORY ────────────────────────────┐ │
│  │  ██ ▃▃ ██ ██ ▃▃ ██ ▃▃ ▃▃ ██ ██ ▃▃ ██ ... │ │
│  │  C4 ·· E4 D4 ·· G4 ·· ·· A4 B3 ·· F4     │ │
│  │  ▔▔ ▔▔ ▔▔ ▔▔ ▔▔ ▔▔ ▔▔ ▔▔ ▔▔ ▔▔ ▔▔ ▔▔     │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  step 7/16  value: 0.73  note: E4  gate: ON     │
└───────────────────────────────────────────────────┘
```

**Register Ring:**
- Shift register as a circular arrangement (SVG)
- Filled circles = 1, hollow = 0
- Read head always at top; bits rotate clockwise on each step
- Mutated bit flashes briefly (salmon color) to show where randomness enters
- LOCK controls mutation: high lock = ring stays stable, low = bits flash frequently

**FREEZE button**: Instantly sets lock to 1.0 (saves current register state). Tap again to restore previous lock value.

**ROLL button**: Re-randomize the seed (fresh register). Good for "try another pattern."

**Output History:**
- Horizontal bar graph of the last N steps (scrolling, like Tonnetz chord trail)
- Bar height = velocity (or note pitch in NOTE mode)
- Active steps colored, rests dimmed
- During playback, current step highlighted

**Interaction:**
- Tap a bit in the ring to manually flip it (direct register editing)
- Drag LOCK slider for real-time probability control while playing

### 4. Tonnetz → Quantizer connection

When a Quantizer node is in chord mode with `chordSource: { nodeId }`:

1. At generation time, Quantizer calls `computeWalkPath()` on the referenced Tonnetz node's params
2. Each step's chord is looked up from the walk path
3. Input notes (from Turing or cell) are snapped to chord tones first, scale tones as fallback

**Scene visual**: When connected, a subtle dashed line or badge shows the reference link in the scene view. This is not a scene edge — it's a parameter reference (like Tonnetz's `stepsPerTransform` referencing a number, this references a node).

**No new edge types needed**. The existing generator chain (Turing → Quantizer) works via edges. The Tonnetz reference is a param, not a routing connection.

### 5. Presets

```typescript
// Quantizer chord mode presets
{ name: 'Pop Chords (C)', mode: 'chord', scale: 'major', root: 0,
  chords: [
    { step: 0, notes: [0, 4, 7] },      // C
    { step: 16, notes: [9, 0, 4] },     // Am
    { step: 32, notes: [5, 9, 0] },     // F
    { step: 48, notes: [7, 11, 2] },    // G
  ] }

{ name: 'Jazz ii-V-I', mode: 'chord', scale: 'major', root: 0,
  chords: [
    { step: 0, notes: [2, 5, 9, 0] },   // Dm7
    { step: 16, notes: [7, 11, 2, 5] }, // G7
    { step: 32, notes: [0, 4, 7, 11] }, // Cmaj7
  ] }

{ name: 'Follow Tonnetz', mode: 'chord', scale: 'major', root: 0,
  chordSource: { nodeId: '__auto__' } }  // auto-detect first connected Tonnetz

// Quantizer harmony presets
{ name: 'Parallel 3rds', mode: 'harmony', scale: 'major', root: 0,
  harmonyVoices: [{ interval: 3, direction: 'above' }] }

{ name: 'Power Chords', mode: 'harmony', scale: 'major', root: 0,
  harmonyVoices: [{ interval: 5, direction: 'above' }] }

{ name: 'Full Stack', mode: 'harmony', scale: 'major', root: 0,
  harmonyVoices: [
    { interval: 3, direction: 'above' },
    { interval: 5, direction: 'above' },
  ] }
```

### 6. Backward compatibility

- `mode` defaults to `'scale'` — existing Quantizer nodes work unchanged
- New fields (`chords`, `chordSource`, `harmonyVoices`) are optional
- No migration needed — old saves load as scale mode
- `chordSource.__auto__` is resolved at generation time (find connected Tonnetz via scene edges)

## Implementation Checklist

### Phase 1: Quantizer Expansion
- [x] Add `mode`, `chords`, `chordSource`, `harmonyVoices` to QuantizerParams
- [x] Implement chord-aware quantization in `quantizeTrigs()`
- [x] Implement harmony voice generation
- [x] Implement Tonnetz walk path lookup for `chordSource`
- [x] Update validation in `validate.ts`
- [x] Update `cloneSceneNode` for new nested objects
- [x] Add chord mode + harmony mode presets
- [x] Unit tests: chord snapping, harmony voices, Tonnetz reference, fallback behavior
- [x] Create `QuantizerSheet.svelte` overlay (ADR 054 sheet model)
- [x] Keyboard visualization (scale tones, chord tones, playing note)
- [x] Chord progression editor (manual + Tonnetz source selector)
- [x] Harmony voice editor
- [x] Sheet trigger: node double-tap + DockPanel EDIT button
- [x] Update DockPanel compact summary

### Phase 2: Turing Machine View
- [x] Create `TuringSheet.svelte` overlay
- [x] SVG register ring visualization (circular bit display)
- [x] Bit mutation animation (flash on flip)
- [x] Tap bit to toggle (direct register editing)
- [x] FREEZE button (lock=1.0 toggle with previous value restore)
- [x] ROLL button (re-randomize seed)
- [x] Output history bar graph (scrolling, like Tonnetz chord trail)
- [x] Real-time playback feedback (current step, value, note, gate)
- [x] Sheet trigger: node double-tap + DockPanel EDIT button

### Phase 3: Cross-Generator Polish
- [ ] Real-time input→output display during playback (Quantizer + Turing)
- [ ] Scene visual indicator for Tonnetz→Quantizer reference link
- [ ] `__auto__` chordSource resolution (find connected Tonnetz)
- [ ] Preset: "Follow Tonnetz" auto-connects to upstream Tonnetz
- [ ] Update docs: quantizer.mdx, turing-machine.mdx (EN + JA)
- [ ] Update generators index page

## Known Issues

- **Chord source is a soft reference**: If the referenced Tonnetz node is deleted, Quantizer silently falls back to scale-only mode. No dangling pointer error, but the user might not notice.

- **Harmony voice + arp interaction**: If Tonnetz arp is active (mono notes) and feeds into a Quantizer with harmony voices, the Quantizer will add harmony to each mono note — creating chords from arp notes. This might be desirable or confusing. Document it.

- **Performance**: `computeWalkPath` for Tonnetz is called each time Quantizer regenerates. For typical step counts (16–64), this is negligible.

## Future Extensions

- **Custom scale via keyboard tap**: Let users build arbitrary scales by tapping keys on the keyboard view
- **Weighted chord tones**: Some chord tones (root, 5th) attract more strongly than others (7th, extensions)
- **Turing register presets**: Save/load specific register states as "rhythm seeds"
- **Cross-generator modulation**: Turing output controls Tonnetz transform selection (not just rhythm)
- **Visual chain flow**: Show data flowing through the generator chain in scene view during playback
