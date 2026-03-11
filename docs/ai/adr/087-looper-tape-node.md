# ADR 087: Looper / Tape Node

## Status: Proposed

## Context

We want an OP-1 Field tape-mode style feature that captures pattern output in real-time for loop playback and overdubbing. The current recording feature (ADR 030 / WAV export) only captures master output as a one-shot bounce — there is no per-pattern or per-track recording, nor any loopback playback.

Implementing this as a scene graph function node allows it to attach to pattern nodes and loop only their output, functioning as a live music generation tool during scene playback — similar to generative nodes (ADR 078).

This also effectively allows unlimited track layering: once audio is recorded to tape, the sequencer tracks are freed up for new instruments. The 16-track sequencer limit becomes a composing window rather than a hard ceiling.

### Current constraints

- The AudioWorklet processes all tracks in a single `process()` call
- Tapping a specific pattern's output requires routing extensions at the insert FX insertion point (between voice output and pan)
- `WorkletPattern` is snapshot-based — loop buffer state management must live on the worklet thread

## Decision

### Node type

Add a new scene graph node type `'looper'`. Implemented as a standalone node rather than a decorator, since it requires persistent audio buffer state.

```
SceneNode.type = 'pattern' | 'generative' | 'looper'
```

### Tape metaphor (OP-1 Field inspired)

```
┌─────────────────────────────────────────┐
│  TAPE                                   │
│  ┌─────┬─────┬─────┬─────┐             │
│  │ TR1 │ TR2 │ TR3 │ TR4 │  4 tracks   │
│  └─────┴─────┴─────┴─────┘             │
│  ◄━━━━━━━━━━━━━━━━━━━━━━━►  loop len   │
│       ▲ playhead                        │
│                                         │
│  [●REC] [▶PLAY] [◼STOP] [OVERDUB]      │
│  LENGTH: 1/2/4/8 bars  FEEDBACK: 0-100% │
│  INPUT: pattern / master / mic          │
└─────────────────────────────────────────┘
```

### State model

```typescript
interface LooperConfig {
  trackCount: 4                          // Fixed 4 tracks (OP-1 style)
  lengthBars: 1 | 2 | 4 | 8             // BPM-synced loop length
  inputSource: 'pattern' | 'master'     // Capture target
  feedback: number                       // 0.0–1.0, existing audio retention on overdub
  activeTrack: number                    // 0–3, recording destination
}

interface LooperState {
  mode: 'idle' | 'recording' | 'playing' | 'overdubbing'
  position: number                       // Playhead position in samples
  buffers: Float32Array[][]              // [track][channel] circular buffer
}
```

### Audio architecture

```
Pattern Node output
       │
       ▼
  ┌─────────┐
  │  Tap     │  Capture at insert FX insertion point
  └────┬────┘
       │
       ▼
  ┌─────────────────┐
  │  Looper Worklet  │  Circular buffer × 4 tracks
  │                  │  Record / Overdub / Playback
  │  feedback mix    │  existing × feedback + new input
  └────────┬────────┘
           │
           ▼
     Mix back to master
```

**Worklet-side implementation approach:**

- Receive config via `looperState` command (lengthBars → sample count conversion)
- Mode switching via `looperRecord` / `looperStop` / `looperOverdub` commands
- Read/write circular buffers within `process()`
- On BPM change: recalculate loop length in real-time (no timestretch, position reset)

### Scene graph behavior

- Edge from pattern node → looper: captures that pattern's output
- Edge from looper → downstream pattern node: mixes loop audio into output
- Accepts input from multiple pattern nodes (layered recording)

```
[Drums] ──→ [Looper] ──→ [Bass Pattern]
[Synth] ──↗            (loop audio plays alongside Bass)
```

### DockPanel UI

```
┌─ LOOPER ──────────────────────┐
│                               │
│  Track: [1] [2] [3] [4]      │
│                               │
│  ┌──────────────────────┐     │
│  │ ▓▓▓▓░░░░▓▓░░▓▓▓▓░░░ │ T1  │
│  │ ░░░░░░░░░░░░░░░░░░░ │ T2  │
│  │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░ │ T3  │
│  │ ░░░░░░░░░░░░░░░░░░░ │ T4  │
│  └──────────────────────┘     │
│         ▲ playhead            │
│                               │
│  LENGTH ◎  FEEDBACK ◎         │
│  1 bar      75%               │
│                               │
│  [● REC] [⟳ OVDB] [✕ CLR]   │
└───────────────────────────────┘
```

### Implementation phases

**Phase 1: Basic loop playback**
- Add circular buffer + record/play/stop commands to worklet
- Add scene node type `'looper'`
- Master output capture only (`inputSource: 'master'`)
- Basic DockPanel UI

**Phase 2: Overdub + 4-track**
- Overdub via feedback parameter
- Independent record / mute / clear per track
- Waveform preview display

**Phase 3: Per-pattern tap**
- Per-pattern output capture at insert FX insertion point
- Scene edge-based routing
- Loop audio pan / volume control

**Phase 4: Tape effects**
- Tape speed change (pitch shift)
- Reverse playback
- Tape degradation effects (wow/flutter, saturation)
- OP-1 Portastudio-style character

## Considerations

- **Memory usage**: 44.1kHz × 2ch × 8bars × 4tracks ≈ 11MB. May need to cap `lengthBars` on mobile
- **Latency**: AudioWorklet process() runs in 128-sample blocks — ~2.9ms @44.1kHz. Acceptable for a looper
- **BPM changes**: Loop length changes. Discard existing buffer or timestretch? Phase 1: reset is sufficient
- **Undo**: Tape recording is not undoable (real-time operation). Only track clear supports undo
- **Persistence**: Store loop buffers in IndexedDB? Large size suggests opt-in on project save
- **Trade-offs**: Once audio is baked to tape, per-instrument parameter editing is lost. Mix flexibility is reduced to tape-track level (EQ/pan per tape track, not per instrument). This constraint-driven workflow is a feature, not a bug — as OP-1 demonstrates

## Future Extensions

- Microphone input (`getUserMedia`) → vocal looper
- MIDI looper (loop MIDI notes instead of audio)
- Loop export (WAV / stems)
- AI-assisted: auto-generate patterns from loop material (onset detection → trig conversion)
