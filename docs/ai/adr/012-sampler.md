# ADR 012: Sampler Implementation

## Status: Proposed

## Context

`Sampler` is declared in `SynthType` but has no implementation. Sample playback is essential for real-world production — vocals, one-shots, breaks, foley, and any sound that can't be synthesized. The AudioWorklet runs at sample-rate, so playback must happen inside the worklet thread.

## Proposed Design

### Audio Loading Pipeline

```
User drops/selects file
  → Main thread: decode to AudioBuffer (Web Audio API)
  → Transfer Float32Array to worklet via port.postMessage(buffer, [buffer])
  → Worklet stores sample data per-track
```

### SamplerVoice

A new voice class implementing the `Voice` interface:

- **Sample buffer**: Float32Array (mono, resampled to worklet SR if needed)
- **Playback cursor**: advances on each `tick()`, outputs `buffer[cursor]`
- **Pitch shifting**: playback rate derived from note vs root note (e.g. root=C4, trig note=D4 → rate = 2^(2/12))
- **Amplitude envelope**: simple decay/release to avoid clicks
- **Reverse mode**: play buffer backwards
- **Start/end points**: trim sample playback range (0.0–1.0 normalized)

Params: `rootNote`, `start`, `end`, `decay`, `reverse`, `pitchShift`

### Sample Management

**Option A: Inline per-track**
- Each sampler track holds one sample buffer
- Simple, direct, no library management
- Load via drag-and-drop onto track or file picker button

**Option B: Sample pool + slot assignment**
- Global sample pool (up to N slots)
- Tracks reference pool by index
- Allows reuse across tracks, easier memory management

**Recommendation: Option A** for v1 simplicity. Pool can be added later.

### WorkletCommand Extension

```typescript
// New command type
{ type: 'loadSample', trackId: number, buffer: Float32Array, sampleRate: number }
```

The worklet stores the buffer on the corresponding track's voice. If the voice is a SamplerVoice, it accepts the buffer; otherwise the command is ignored.

### UI Integration

- **File picker button** in ParamPanel when track synthType is 'Sampler'
- **Drag-and-drop** zone on the track row (optional, v2)
- **Waveform display**: mini waveform in StepLane or ParamPanel showing loaded sample
- **Start/End markers**: draggable on waveform display

### Supported Formats

Leverage `AudioContext.decodeAudioData()` — supports WAV, MP3, OGG, FLAC, AAC (browser-dependent). Convert stereo to mono (sum L+R / 2) before transfer.

### Memory Budget

- Limit per-sample to ~10 seconds at 44.1kHz = ~441K floats = ~1.7MB
- Total budget: ~8 samples × 1.7MB = ~14MB (comfortable for worklet)
- Reject files exceeding limit with user feedback

## Consequences

- **Positive:** Unlocks sample-based music — breaks, vocals, one-shots, foley.
- **Positive:** Pitch shifting from note enables melodic sample playback.
- **Negative:** Memory management in worklet — must handle buffer lifecycle.
- **Negative:** File I/O adds complexity (permissions, format handling, error states).
- **Negative:** No streaming — entire sample must fit in memory.
- **Dependency:** Requires ADR 009 (instrument selection) to assign Sampler type to a track.
