# ADR 021: Note Duration, Slide & Lead ADSR

## Status: Implemented

## Context

The step sequencer has several limitations:

1. **Fixed note length** — All trigs sound for exactly 1 step. Legato phrases and sustained notes are impossible.
2. **No slide/glide** — Bass (TB303Voice) lacks acid-style portamento. Lead (MoogVoice) has no pitch bend expression.
3. **Fixed Lead ADSR** — MoogVoice amp/filter envelopes are hardcoded with no user control.

Additionally, the current `ADSR` class has no `noteOff()` method — Release only triggers on `reset()`. Note duration requires a proper noteOff mechanism.

### Related ADRs

- **ADR 011** (Synth Engines): Future synth architecture (separate amp ADSR + filter ADSR)
- **ADR 014** (Parameter Locks): Per-step parameter override mechanism

### Future Directions (Out of Scope)

- Synth separation (dedicated Bass synth / Lead mono synth / poly synth)
- Gate length % (sub-step resolution)
- ADSR expansion to other synths

## Design

### A. Note Duration

#### Data Model

Add a step-count-based `duration` field to `Trig`:

```typescript
// state.svelte.ts
export interface Trig {
  active: boolean
  note: number        // MIDI note
  velocity: number    // 0.0–1.0
  duration: number    // step count (1–16, default 1)
  slide: boolean      // slide flag (see below)
}
```

Default is `1` (same behavior as before). Maximum is the track's step count.

**Why step-based units:**
- Naturally aligns with the step grid UI
- Drag-to-extend in piano roll is intuitive
- Matches hardware sequencer paradigms (Elektron, Roland)
- Sub-step resolution would dilute the step sequencer's character

#### Worklet Side

Extend `WorkletTrig`:

```typescript
// types.ts
export interface WorkletTrig {
  active: boolean; note: number; velocity: number
  duration: number   // step count
  slide: boolean
}
```

Schedule `noteOff()` based on duration in the worklet step processing:

```typescript
// worklet-processor.ts — _advanceStep()
// Set gate counter on note-on
if (trig?.active && !track.muted) {
  voice.noteOn(note, trig.velocity)
  this.gateCounters[t] = trig.duration  // remaining steps
}

// Every step: decrement gate counters
for (let t = 0; t < this.tracks.length; t++) {
  if (this.gateCounters[t] > 0) {
    this.gateCounters[t]--
    if (this.gateCounters[t] === 0) {
      this.voices[t]?.noteOff()  // enter Release stage
    }
  }
}
```

`gateCounters` is a `number[]` (`new Array(8).fill(0)`) added to the processor.

#### ADSR.noteOff()

```typescript
// filters.ts — add to ADSR class
noteOff() {
  if (this.stage !== Stage.Idle) {
    this.stage = Stage.Release
  }
}
```

Add `noteOff()` to the Voice interface:

```typescript
export interface Voice {
  noteOn(note: number, velocity: number): void
  noteOff(): void    // transition to Release stage
  tick(): number
  reset(): void
  setParam(key: string, value: number): void
}
```

Each voice implementation adds `noteOff()` — calls internal ADSR (both amp and filter) `noteOff()`. Drum voices: no-op (natural decay).

#### Piano Roll UI (DAW-Style Note Bars)

Visualize and edit note duration in the piano roll:

```
  C4 │ ■ ■ ─ ─ │ . . . . │ ■ . . . │ . . . . │
  B3 │ . . . . │ ■ ─ ─ . │ . . . . │ . . ■ . │
  A3 │ . . . . │ . . . . │ . ■ ─ ─ │ ─ . . . │
      ■ = note head   ─ = duration continuation
```

- **Place**: Click empty cell → note with duration=1. Drag right → bar extends
- **Delete**: Click head → remove note. Click continuation → remove parent note
- **Resize**: After placement, drag resize handle on right edge to adjust duration
- **Pitch lock during draw**: Horizontal only while dragging (no pitch change)
- **Display**: Head = `--color-olive`, continuation = `rgba(108,119,68,0.3)` (semi-transparent)
- **State helpers**: `placeNoteBar()` (place + clear covered steps), `findNoteHead()` (continuation → parent lookup)

### B. Slide (Glide)

#### Data Model

`Trig.slide: boolean` — Slide flag. Pitch smoothly transitions from this note to the next active note.

#### Auto-Legato (Melodic Tracks)

Melodic tracks (t >= 6) use auto-legato: consecutive active notes (connected by duration or adjacent) are automatically legato-connected. Explicit slide flag is not needed.

- **Consecutive notes**: `wasGated && isMelodic` → call `slideNote()` (envelope continues)
- **With rest**: gate counter = 0 → `noteOff()` → next `noteOn()` retriggers

#### Per-Synth Behavior

| Synth | slideNote() Behavior | Details |
|-------|---------------------|---------|
| **TB303Voice** (Bass) | Portamento glide | 303-style. Only `targetFreq` changes, exponential slide ~60ms. `filterEnv.noteOn()` for acid squelch |
| **MoogVoice** (Lead) | Clean legato | Both `freq` and `targetFreq` set immediately (no glide). Envelope continues only |
| Drums / Other | Same as noteOn() | Retrigger (legato not needed for drums) |

#### Voice Interface Extension

```typescript
export interface Voice {
  noteOn(note: number, velocity: number): void
  noteOff(): void
  slideNote(note: number, velocity: number): void  // added
  tick(): number
  reset(): void
  setParam(key: string, value: number): void
}
```

`slideNote()` transitions pitch without retriggering envelopes.

#### TB303Voice Glide Implementation

```typescript
// voices.ts — TB303Voice
private slideRate = 1 - Math.exp(-1 / (0.060 * sr))  // ~60ms exponential glide

slideNote(note: number, v: number) {
  this.targetFreq = midiToHz(note)
  this.vel = v
  this.filterEnv.noteOn()  // acid squelch: retrigger filter, NOT amp (legato)
}

// In tick(): update pitch
tick(): number {
  this.freq += (this.targetFreq - this.freq) * this.slideRate
  // ... oscillator → drive → filter → ampEnv
}
```

#### MoogVoice Legato Implementation

```typescript
// voices.ts — MoogVoice: clean legato (no glide)
slideNote(note: number, v: number) {
  const f = midiToHz(note)
  this.freq = f; this.targetFreq = f  // instant pitch change
  this.vel = v
  // envelope continues (no noteOn/noteOff) → clean legato
}
```

#### Worklet Slide Processing

```typescript
// _advanceStep()
const wasGated = this.gateCounters[t] > 0
const isMelodic = t >= 6
const isLegato = trig?.active && (isMelodic || trig.slide)

// Gate counter: suppress noteOff during legato
if (this.gateCounters[t] > 0) {
  this.gateCounters[t]--
  if (this.gateCounters[t] === 0 && !isLegato) {
    this.voices[t]?.noteOff()
  }
}

// Note-on / slide decision
if (trig?.active && !track.muted) {
  if (wasGated && (isMelodic || trig.slide)) {
    voice.slideNote(note, trig.velocity)  // legato
  } else {
    voice.noteOn(note, trig.velocity)     // retrigger
  }
  this.gateCounters[t] = trig.duration
}
```

**Legato condition:** `wasGated` (previous note's gate was open) AND `isMelodic || trig.slide`. Melodic tracks are automatic; drums need an explicit slide flag.

#### Piano Roll / Step Grid UI

- Melodic tracks use auto-legato, so no explicit SLD lane is shown
- Consecutive notes = legato, gaps = retrigger — directly visible in piano roll
- StepGrid SLD lane hidden with `{#if false}` (code preserved for future use)

### C. Lead ADSR

#### Parameter Definitions

Add amp ADSR parameters to MoogLead's paramDefs:

```typescript
// paramDefs.ts
MoogLead: [
  { key: 'cutoffBase',  label: 'CUT',   group: 'filter', min: 100,   max: 2000, default: 400   },
  { key: 'envMod',      label: 'MOD',   group: 'filter', min: 1000,  max: 10000,default: 5500  },
  { key: 'resonance',   label: 'RESO',  group: 'filter', min: 0.5,   max: 3.5,  default: 1.8   },
  { key: 'filterDecay', label: 'FDCY',  group: 'filter', min: 0.1,   max: 1.0,  default: 0.35  },
  { key: 'ampAttack',   label: 'ATCK',  group: 'env',    min: 0.001, max: 0.5,  default: 0.005 },
  { key: 'ampDecay',    label: 'ADCY',  group: 'env',    min: 0.01,  max: 1.0,  default: 0.3   },
  { key: 'ampSustain',  label: 'SUST',  group: 'env',    min: 0.0,   max: 1.0,  default: 0.8   },
  { key: 'ampRelease',  label: 'RLS',   group: 'env',    min: 0.01,  max: 2.0,  default: 0.25  },
]
```

`filterDecay` (previously `decay`) is the filter envelope decay (label `FDCY`). `MoogVoice.setParam()` accepts both `decay` and `filterDecay` for backward compatibility.

**8 knobs total** — fits the current ParamPanel 2×4 layout.

#### MoogVoice DSP Changes

```typescript
// voices.ts — MoogVoice
private filterEnv = new ADSR()   // existing (filter)
private ampEnv = new ADSR()      // new (amp)

constructor(private sr: number) {
  this.filterEnv.setSampleRate(sr)
  this.ampEnv.setSampleRate(sr)
  // filter envelope defaults
  this.filterEnv.attack = 0.002; this.filterEnv.decay = 0.35
  this.filterEnv.sustain = 0.0;  this.filterEnv.release = 0.1
  // amp envelope defaults
  this.ampEnv.attack = 0.005; this.ampEnv.decay = 0.3
  this.ampEnv.sustain = 0.8; this.ampEnv.release = 0.25
}

noteOn(note: number, v: number) {
  this.freq = midiToHz(note); this.vel = v
  this.filterEnv.noteOn()
  this.ampEnv.noteOn()
}

noteOff() {
  this.filterEnv.noteOff()
  this.ampEnv.noteOff()
}

tick(): number {
  if (this.ampEnv.isIdle()) return 0
  const fEnv = this.filterEnv.tick()
  const aEnv = this.ampEnv.tick()
  // ... oscillator + filter processing ...
  return filtered * aEnv * this.vel * 0.55
}

setParam(key: string, value: number) {
  switch (key) {
    case 'cutoffBase': this.cutoffBase = value; break
    case 'envMod':     this.envMod     = value; break
    case 'resonance':  this.resonance  = value; break
    case 'decay':        // backward compat
    case 'filterDecay': this.filterEnv.decay = value; break
    case 'ampAttack':  this.ampEnv.attack   = value; break
    case 'ampDecay':   this.ampEnv.decay    = value; break
    case 'ampSustain': this.ampEnv.sustain  = value; break
    case 'ampRelease': this.ampEnv.release  = value; break
  }
}
```

## Implementation Order

1. **ADSR.noteOff()** — Add `noteOff()` method to `filters.ts`
2. **Voice.noteOff() + Voice.slideNote()** — Interface extension, implement in all voices (drums: no-op)
3. **Trig extension** — Add `duration` + `slide` fields (`state.svelte.ts`, `types.ts`)
4. **Worklet gateCounter** — Note-off scheduling + slide logic in `_advanceStep()`
5. **TB303Voice glide** — Exponential portamento in `slideNote()`
6. **MoogVoice legato** — Instant pitch change in `slideNote()`
7. **MoogVoice amp ADSR** — Separate filter/amp envelopes, add paramDefs
8. **Piano roll duration UI** — Note width display + right-edge drag for duration editing
9. **Slide UI** — Slide indicator + toggle in piano roll / step grid

## Consequences

- **Positive:** Legato phrases and acid basslines become possible
- **Positive:** Lead sound design range expands significantly (pads → plucks → leads)
- **Positive:** `noteOff()` creates foundation for future poly synths and sustain pedal
- **Positive:** Step-based duration integrates naturally with the grid UI
- **Positive:** Delegating slide behavior to synths prepares for future synth separation
- **Negative:** `Trig` data size increases (larger pattern save data)
- **Negative:** Piano roll UI complexity increases (duration drag + slide toggle)
- **Negative:** Drum voices need no-op `noteOff()` / `slideNote()` (minor cost)
