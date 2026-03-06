# ADR 022 — Lead Arpeggiator

## Status: Implemented

## Context

Melodic tracks (BASS / LEAD) currently play only one note per step. Subdividing steps with arpeggiation lets a single placed note generate automatic arpeggio patterns, significantly improving live performance feel.

Arpeggiators are standard in hardware grooveboxes (Elektron Digitone, Roland MC-101, Novation Circuit) and pair especially well with synthwave / house / trance patterns.

## Decision

### Parameter Design

Four voiceParams added, controllable via existing ParamPanel knobs. Target track: **MoogLead (LEAD) only**.

| key | label | min | max | default | description |
|-----|-------|-----|-----|---------|-------------|
| arpMode | ARP | 0 | 4 | 0 | 0=OFF, 1=UP, 2=DOWN, 3=UP-DOWN, 4=RANDOM |
| arpRate | RATE | 1 | 4 | 2 | Subdivisions per step (1=1/4, 2=1/8, 3=triplet, 4=1/16) |
| arpChord | CHRD | 0 | 4 | 0 | 0=OCT, 1=5TH, 2=TRD, 3=SUS, 4=7TH |
| arpOct | AOCT | 1 | 4 | 1 | Arpeggio octave range |

All four are continuous knobs but rounded to integers (`Math.round()`) in the worklet. UI snaps to discrete positions.

### Chord Interval Table

`arpChord` determines the note list chord tones (scale-degree based, resolved via `SCALE_TEMPLATES`):

| arpChord | Name | Scale Degrees | Example from C3 (C major) |
|----------|------|---------------|---------------------------|
| 0 | OCT | [0] | C3 (octave unison) |
| 1 | 5TH | [0, 4] | C3, G3 |
| 2 | TRD | [0, 2, 4] | C3, E3, G3 (diatonic triad) |
| 3 | SUS | [0, 3, 4] | C3, F3, G3 (root + 4th + 5th) |
| 4 | 7TH | [0, 2, 4, 6] | C3, E3, G3, B3 (diatonic 7th) |

### Arpeggio Note Generation Logic

```
Input: baseNote, mode, chord, octaves, root
Output: notes[] (note list for cyclic playback)
```

1. Resolve chord degrees through `SCALE_TEMPLATES[root]` for diatonic intervals
2. Expand across `octaves` octave range:
   - chord=TRD, oct=1: `[C3, E3, G3]`
   - chord=TRD, oct=2: `[C3, E3, G3, C4, E4, G4]`
   - chord=OCT, oct=2: `[C3, C4]` (legacy behavior)

3. `mode` determines traversal order:
   - UP: as-is
   - DOWN: reversed
   - UP-DOWN: ping-pong (no duplicate at endpoints)
   - RANDOM: LCG pseudo-random for deterministic pick

### Activation Condition

`arpMode > 0 && (arpChord > 0 || arpOct >= 2)`

- chord=OCT + oct=1 → single note → arp inactive (normal playback)
- chord=TRD + oct=1 → triad (3 notes) → arp active
- chord=OCT + oct=2 → octave expansion → arp active

### Worklet Implementation

Arp starts when a trig fires in `_advanceStep()`:

```typescript
// Per-track arp state (in worklet)
private arpNotes:    number[][] = []   // note list per track
private arpIndex:    number[]   = []   // current position in note list
private arpCounter:  number[]   = []   // sub-step sample counter
private arpTickSize: number[]   = []   // samples per arp tick
```

**On step trigger** (`_advanceStep`):
1. `arpMode > 0` and `trig.active` → generate note list
2. Play first note via `noteOn()` / `slideNote()`
3. `arpCounter = 0`, `arpTickSize = samplesPerStep / arpRate`

**Every sample** (`process` loop):
1. `arpCounter++`
2. When `arpCounter >= arpTickSize`:
   - Advance `arpIndex`, play next note via `slideNote()` (smooth connection)
   - `arpCounter -= arpTickSize`

**On gate end** (`gateCounter === 0`):
- `arpNotes[t] = []` to stop arpeggio

### Data Flow

```
ParamPanel knobs → voiceParams.arpMode/arpRate/arpChord/arpOct
    ↓
state.svelte.ts → engine.ts → worklet postMessage (existing pipeline)
    ↓
worklet setPattern → voices[t].setParam('arpMode', val)
    ↓
worklet _advanceStep → arp note list generation → noteOn/slideNote
worklet process loop → sub-step tick → slideNote
```

### Changed Files

| File | Changes |
|------|---------|
| `src/lib/paramDefs.ts` | Add `arpMode`, `arpRate`, `arpChord`, `arpOct` to MoogLead |
| `src/lib/audio/worklet-processor.ts` | `ARP_CHORD_DEGS` table, arp state, `_advanceStep` arp start, `process` sub-step tick |

- `state.svelte.ts` — No changes (voiceParams is dynamic `Record<string, number>`)
- `engine.ts` — No changes (voiceParams forwarded as-is)
- `ParamPanel.svelte` — No changes (auto-generated from paramDefs)

### Unchanged

- AnalogSynth.h / voices.ts Voice interface — Arpeggio handled at worklet step-control layer. Voices just receive normal noteOn/slideNote
- PianoRoll — Note display unchanged (arpeggio is a playback-only effect)
- Trig interface — Not stored per-step (track-level setting)

## Verification

1. LEAD track: ARP=UP, CHRD=TRD, AOCT=1 → C-E-G triad arpeggio
2. AOCT=2 → 2-octave expansion (C3-E3-G3-C4-E4-G4)
3. CHRD=7TH → diatonic 7th arpeggio (C-E-G-B)
4. CHRD=OCT, AOCT=2 → octave unison (legacy behavior)
5. ARP=DOWN → descending pattern
6. ARP=UP-DOWN → ping-pong pattern
7. ARP=RANDOM → random pick
8. RATE 1→4 → subdivisions increase
9. ARP=OFF → normal single-note playback
10. CHRD=OCT, AOCT=1 → arp inactive (normal playback)
11. duration=4 long note → arpeggio sustains for 4 steps
12. P-Lock: CHRD=TRD on specific step only → that step gets chord arpeggio

## Future Extensions

- **ARP patterns**: Gate-length patterns (long-short-long-short, etc.)
- **ARP hold**: Hold note to continue arpeggio beyond gate
- **Custom chords**: P-Lock arbitrary chord tones per step
