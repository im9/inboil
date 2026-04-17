# ADR 132: Offline WAV Export

## Status: Proposed

**Created**: 2026-04-08

## Context

inboil currently has one path to WAV: the header REC button, which uses
`MediaRecorder` + `MediaStreamAudioDestinationNode` to capture the live
master output in realtime ([wavExport.ts](src/lib/wavExport.ts), ADR 030
Phase 2 / ADR 085). This works, but it is a **live capture**, not an
**export**:

- The user must press play, wait for the song to finish, then press stop
- Output is non-deterministic — system load, garbage collection, and
  MediaRecorder's WebM intermediate codec all affect the result
- One mistake (a fat-fingered knob, a clipped peak) means recording the
  whole song again
- A long scene takes its full duration to export

ADR 030 originally proposed an `OfflineAudioContext` bounce path as
"Phase 1" but only the realtime capture path (Phase 2) was implemented.
Offline bounce was deferred indefinitely.

### Why now

Two pressures:

1. **Naming collision with sequencer REC arm** (ADR 131 future scope).
   The header REC button is already labeled "REC". When ADR 131 adds a
   step-recording arm for realtime pad input, both surfaces will be
   competing for the word "record". A clean separation now —
   **EXPORT WAV** for file output, **REC** for live capture, **ARM** for
   sequencer recording — avoids ambiguity at the source.

2. **User workflow has matured.** Demo songs, scenes, and longer
   compositions are real now. Re-recording a 2-minute scene every time
   a knob slips is friction that didn't matter when patterns were 16
   bars. Faster-than-realtime offline rendering removes this entirely.

## Decision

Add an **offline WAV export** path that renders patterns or scenes through
an `OfflineAudioContext` running the same `inboil-processor` worklet. The
existing realtime REC button stays unchanged for live performance capture.

### Two coexisting paths

| Path | Trigger | Use case | Determinism |
|---|---|---|---|
| **EXPORT WAV** (new) | PROJECT tab → button | Final mixdown, sharing, archiving | Deterministic, faster-than-realtime |
| **REC** (existing) | Header sub-bar button | Live performance, manual FX/perf tweaks, jam session capture | Realtime, captures user input |

These are intentionally separate features. Live capture will never go
away — it captures performance nuance that offline rendering cannot. But
offline export becomes the default for "I want a WAV of this song".

### Scope options

The export dialog offers:

- **Pattern** — render the currently selected pattern, N loops (1/2/4/8)
- **Scene** — render the full scene chain end-to-end
- **Selection** — (future) render a chain selection / N bars

Sample rate: 44.1 kHz (default) / 48 kHz. Bit depth: 16-bit PCM (matches
existing encoder). Normalize to -0.5 dBFS: on by default, toggleable.

### Offline rendering flow

```
User clicks EXPORT WAV
  → Dialog: scope, loops, sample rate, normalize
  → Calculate duration from BPM × steps × loops (or scene total)
  → Create OfflineAudioContext(2, duration * sampleRate, sampleRate)
    → addModule('/worklet-processor.js') — same module as live engine
      → new AudioWorkletNode(ctx, 'inboil-processor')
        → Replay engine setup messages (loadSample, setPattern, setBpm…)
          → Send 'play' → ctx.startRendering()
            → Resulting AudioBuffer → encodeWav() → download
```

### Engine refactor required

The current engine ([engine.ts](src/lib/audio/engine.ts)) tightly couples
`AudioContext` creation with worklet instantiation, sample loading, and
state restoration. For offline export, we need to:

1. Extract a `setupWorklet(ctx, node)` helper that takes any
   `BaseAudioContext` (live or offline) and replays the full setup
   sequence: sample loads, current pattern, BPM, scene state, master
   params, FX state, decorators
2. Ensure `loadSample` messages complete before `play` in offline mode
   (cannot rely on async sample fetches landing during rendering — must
   pre-warm sample IDB cache)
3. Confirm worklet `process()` runs identically in
   `OfflineAudioContext` (no realtime-only assumptions like
   `currentTime` drift, AudioContext.outputLatency, etc.)
4. Generative engines (Turing, Tonnetz, Quantizer) must produce the
   same output offline — verify random seeding is deterministic or
   accept that generative scenes will differ between exports

### UI placement

PROJECT tab in SYSTEM sidebar gains a new button next to **EXPORT MIDI**:

```
┌─ PROJECT ──────────────────┐
│  [NEW PROJECT] [SAVE AS]   │
│  Project name: …            │
│  ───────────────────────    │
│  [EXPORT MIDI]              │
│  [EXPORT WAV]   ← new       │
│  ───────────────────────    │
│  Examples / saved projects  │
└─────────────────────────────┘
```

EXPORT WAV opens a small modal:

```
┌─ Export WAV ──────────────┐
│  Scope: ( ) Pattern        │
│         (•) Scene          │
│  Loops: [1] [2] [4] [8]    │
│  Sample rate: 44.1 / 48    │
│  ☑ Normalize to -0.5 dBFS  │
│  ───────────────────────   │
│  Duration: 2:34            │
│  [Cancel]    [Export]      │
└────────────────────────────┘
```

During rendering: progress bar (offline rendering reports progress via
`ctx.startRendering()` promise + a periodic `currentTime` poll, or just
"Rendering…" with cancel). On completion: auto-download with filename
`{projectName}-{scope}-{timestamp}.wav`.

### Header REC button — unchanged for now

The header REC button keeps its current behavior and label. However,
once ADR 131 step recording lands, the labels should be revisited:

- Header **REC** (●) — live audio capture
- Sequencer **ARM** (or similar) — pad-to-step recording
- PROJECT tab **EXPORT WAV** — offline file export

Tooltip clarification can ship with this ADR even before the relabel:
"Capture live performance to WAV — for file export, use Project ▸ Export WAV".

## Implementation Checklist

### Phase 1: Offline pattern bounce

- [ ] Extract `setupWorklet(ctx, node, songSnapshot)` from `engine.ts`
- [ ] Sample preload helper: `ensureSamplesLoaded(songSnapshot): Promise<void>`
- [ ] `exportPatternWav(patternId, loops, sampleRate, normalize): Promise<Blob>`
- [ ] Reuse existing `encodeWav()` from `wavExport.ts`
- [ ] EXPORT WAV button in PROJECT tab
- [ ] Export modal component (scope/loops/rate/normalize/duration display)
- [ ] Filename generation: `{projectName}-pattern-{timestamp}.wav`
- [ ] Header REC tooltip clarification
- [ ] Verify offline output matches realtime within ±0.1 dB peak

### Phase 2: Scene bounce

- [ ] `exportSceneWav(sampleRate, normalize): Promise<Blob>`
- [ ] Scene playback engine must drive offline context (replay scene
      events into the worklet rather than using wall-clock scheduling)
- [ ] Scene-level decorators applied identically
- [ ] FX tail: render extra silence after the last note (configurable,
      default 4 seconds for reverb decay)

### Phase 3: Stems / per-track export (optional, follow-up)

- [ ] Solo each track in turn, render N times, output `track-{name}.wav`
- [ ] Or: refactor master output to expose per-track taps in offline mode

## Considerations

### Determinism risks

- **Generative voices** (Turing, Tonnetz arpeggios, randomized sweeps)
  may use `Math.random()` without seeding. For deterministic export,
  either seed RNG before `play` or accept that generative content
  varies between exports (probably fine — that's their nature)
- **`currentTime` drift** — offline `currentTime` advances in fixed
  block increments, which is actually *more* stable than realtime, so
  sequencer scheduling should be cleaner offline
- **Sample loading races** — biggest risk. Must guarantee all
  `loadSample` messages have been processed before sending `play`.
  Solution: explicit message acknowledgement ("sampleLoaded" reply) or
  pre-decode samples to AudioBuffer in main thread and pass via
  transferable

### Worklet portability

`AudioWorkletProcessor` is part of the standard Web Audio API and
works in `OfflineAudioContext` per spec. Major browsers (Chromium,
Firefox, Safari 14.5+) support this. The risk is implementation bugs,
not API absence — needs cross-browser testing.

### Why not just speed up realtime capture?

Realtime capture is fundamentally bottlenecked by audio context
playback rate. Even at 1× speed it's the same length as the song.
`OfflineAudioContext` typically renders 5–20× faster than realtime
depending on DSP load — a 3-minute song exports in 10–30 seconds.

### Scope creep guards

This ADR is **WAV only**. MP3, FLAC, OGG, and stems are all out of
scope for Phase 1. MP3 in particular drags in lamejs (~150KB) and
licensing complexity for marginal benefit when WAV is universally
compatible with DAWs.

### Relationship to ADR 131

ADR 131 step recording (deferred memo) introduces a sequencer-level
"REC arm" concept that would otherwise collide with the header REC
button. By landing offline export *first*, we establish the naming
distinction:

- Export = file output (offline, deterministic)
- REC = live audio capture (realtime, performance)
- ARM = sequencer note recording (pads → steps, future)

This makes ADR 131's step recording UI naming uncontroversial when it
lands.

## Future Extensions

- **Stems export** — per-track WAVs for DAW import
- **Loop-friendly export** — first/last sample crossfade for seamless
  looping
- **Render queue** — batch-export multiple patterns or scenes overnight
- **Cloud rendering** — for very long generative pieces, render
  server-side via Cloudflare Workers + headless audio
- **Project archive** — `.inboil-project.zip` containing song JSON,
  loaded samples, and a rendered preview WAV
