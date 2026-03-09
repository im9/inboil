# ADR 067: Piano Roll Drawing & Chord Brush Mode

## Status: Proposed

## Context

Currently the piano roll only supports tap-to-place individual notes. Creating melodies requires tedious one-by-one note entry, and building chords means placing each chord tone separately. Users want a more fluid, drawing-like interaction for creating melodies and chords quickly — especially for sketching ideas fast in a groove box context.

## Proposal

### Mode 1: Pen / Draw Mode

Drag horizontally across the piano roll grid to draw a melody line in a single stroke.

- Each column the pointer crosses gets a note at the current pitch (row)
- When `scaleMode` is on, pitches snap to the active scale
- Velocity is derived from vertical offset within the cell (top = high, bottom = low), or pointer pressure on supported devices
- Holding Shift constrains to a single pitch (horizontal line)
- A single `pushUndo("draw notes")` call before the stroke begins; one undo entry per complete drag

### Mode 2: Chord Brush

Tap a single cell and a diatonic chord is auto-placed based on the tapped note's scale degree.

- Chord type selector: **Triad**, **7th**, **Sus2**, **Sus4**
- Reuses existing `ARP_CHORD_DEGS` definitions from the arpeggiator (ADR 022) to derive chord intervals
- Respects `scaleMode` — chord tones are diatonic to the current key/scale
- If `scaleMode` is off, chords default to equal-tempered intervals (major/minor inferred from interval pattern)
- Works with iDEATH poly mode for simultaneous playback

### Mode 3: Strum Brush

Drag vertically to place chord tones with slight step offsets for a humanized strum feel.

- Dragging down from a root note places chord tones across consecutive steps (e.g., root at step 4, third at step 5, fifth at step 6)
- Offset amount configurable: 1 step (tight) or 2 steps (loose)
- Combined with chord brush logic for automatic voicing

### Mode 4: Eraser

Drag across the grid to clear notes.

- Any cell the pointer crosses during the drag has its note removed
- Single undo entry per erase stroke

## UI

- Toolbar in the piano roll header: small icon toggle group for **Pen** | **Chord** | **Strum** | **Eraser**
- Default mode remains tap-to-toggle (current behavior) — drawing modes are opt-in
- Modifier key shortcuts: hold `D` for draw, `C` for chord, `E` for eraser (temporary activation while held)
- Chord type selector appears inline when Chord or Strum mode is active
- Minimal footprint — icons only, no labels, tooltip on hover

## Interaction with Existing Features

| Feature | Integration |
|---------|-------------|
| `scaleMode` | Pen and Chord modes snap to active scale |
| Poly mode (iDEATH) | Chord brush places simultaneous notes on poly-capable voices |
| Undo (`pushUndo`) | One undo snapshot per drag stroke, taken before first mutation |
| Velocity editing | Draw mode sets initial velocity; VEL tab still available for fine-tuning |
| Step probability | Not affected — probability stays at default (100%) for drawn notes |

## Implementation Notes

- All brush logic lives in `PianoRoll.svelte` — pointer event handlers branch on active mode
- Chord generation needs scale degree → interval mapping; reuse `SCALE_TEMPLATES` from `worklet-processor.ts` (duplicate into a shared `constants.ts` or import from existing source)
- `ARP_CHORD_DEGS` already defines triad/7th shapes — extend with sus2/sus4 variants
- Track pointer movement via `pointermove` with `setPointerCapture` for reliable drag across cells
- Batch note mutations: collect all changes during drag, apply on `pointerup` (single state update, single undo entry)

## Phases

### Phase 1: Pen Draw + Eraser

- Implement draw and eraser modes in PianoRoll
- Toolbar toggle UI
- Modifier key shortcuts
- Undo integration

### Phase 2: Chord Brush + Strum

- Chord type selector UI
- Diatonic chord generation from scale templates
- Strum offset logic
- Poly mode integration

## Changed Files

| File | Changes |
|------|---------|
| `PianoRoll.svelte` | Brush mode state, pointer event handlers, toolbar UI |
| `constants.ts` (new or existing) | Shared `SCALE_TEMPLATES`, extended `ARP_CHORD_DEGS` |
| `state.svelte.ts` | `brushMode` UI state (pen/chord/strum/eraser/default) |
| `types.ts` | `BrushMode` type definition |

## Consequences

- **Positive**: Dramatically faster melody and chord entry — closer to a drawing/sketching feel
- **Positive**: Chord brush lowers music theory barrier for beginners
- **Positive**: Reuses existing scale and arpeggiator infrastructure
- **Negative**: Additional pointer event complexity in PianoRoll (already a dense component)
- **Negative**: Chord brush without scaleMode may produce unexpected voicings

## Pre-work: Chord Rhythm Templates (randomizer)

Before this ADR, `randomizePattern()` poly chord generation always placed sustained whole-note chords on downbeats — no rhythmic variation. This was fixed by introducing **chord rhythm templates** in `state.svelte.ts`:

| Template | Character | Pattern |
|----------|-----------|---------|
| Pad | Sustained whole notes | `[0, full]` |
| Comp | Syncopated comping | `[0,2] [3,1] [5,2]` |
| Stab | Short rhythmic hits | `[0,1] [2,1] [4,1] [6,1]` |
| Ska | Off-beat upstrokes | `[1,1] [3,1] [5,1] [7,1]` |
| Pulse | Dotted rhythm | `[0,3] [3,2] [6,2]` |

A template is randomly selected per randomization. Each entry is `[stepOffset, duration, velocityBase]`.

### Future improvements (this ADR)

- **Chord brush rhythm presets**: Let users pick a rhythm template when placing chords via brush mode (not just random)
- **Instrument-aware template selection**: Auto-select template based on voice character (pad preset → sustained, lead preset → stab)
- **Swing/shuffle**: Apply micro-timing offsets to even-numbered hits for groove feel
- **Velocity humanization curves**: More expressive velocity shaping (accent patterns, crescendo/decrescendo)

## Open Questions

- Should draw mode support note duration (drag length = note length) or always place minimum-length notes?
- Velocity-from-pressure: worth supporting for pen tablet / Apple Pencil users?
- Should chord brush allow custom voicings beyond the preset shapes?
