# ADR 030: Audio & MIDI Export

## Status: Implemented

## Context

INBOIL currently has no way to export work. Patterns exist only in-memory (and eventually in localStorage/IndexedDB). Users need to:

1. **Record audio** — bounce a pattern or chain to WAV/MP3 for sharing or further production
2. **Export MIDI** — export pattern trigger data as Standard MIDI File (.mid) for use in external DAWs
3. **Audio capture** — real-time recording of a live performance session

Without export, INBOIL is a playground but not a production tool. This is one of the most impactful missing features.

## Design

### A. Offline Audio Bounce (Pattern/Chain → WAV)

Render a pattern (or full chain) to audio without real-time playback. Uses `OfflineAudioContext` to process audio faster than real-time.

#### Flow

```
User taps "EXPORT" → select scope (pattern / chain / N bars)
  → Create OfflineAudioContext(channels=2, sampleRate=44100, length)
    → Instantiate AudioWorkletProcessor in offline context
      → Feed pattern data → process() runs to completion
        → getRenderedBuffer() → encode WAV → download blob
```

#### Implementation

```typescript
interface ExportConfig {
  scope: 'pattern' | 'chain'    // what to render
  bars: number                   // override: render N bars (pattern loops)
  format: 'wav' | 'mp3'         // wav = lossless, mp3 = smaller
  sampleRate: 44100 | 48000
  normalize: boolean             // peak normalize to -0.5 dBFS
}

async function exportAudio(config: ExportConfig): Promise<Blob> {
  const duration = calculateDuration(config)
  const ctx = new OfflineAudioContext(2, duration * config.sampleRate, config.sampleRate)

  // Register and instantiate worklet in offline context
  await ctx.audioWorklet.addModule('/worklet-processor.js')
  const node = new AudioWorkletNode(ctx, 'inboil-processor')
  node.connect(ctx.destination)

  // Send pattern/chain data
  node.port.postMessage({ type: 'setPattern', pattern: gatherExportData(config) })
  node.port.postMessage({ type: 'play' })

  const buffer = await ctx.startRendering()
  return encodeWav(buffer, config.normalize)
}
```

#### WAV Encoding

Use a lightweight encoder (no dependencies):

```typescript
function encodeWav(buffer: AudioBuffer, normalize: boolean): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const samples = interleave(buffer, normalize)
  const dataView = createWavHeader(samples.length, numChannels, sampleRate)
  return new Blob([dataView, samples], { type: 'audio/wav' })
}
```

For MP3: use `lamejs` (LGPL, ~150KB) or omit initially — WAV is sufficient for v1.

#### Duration Calculation

```typescript
function calculateDuration(config: ExportConfig): number {
  const bpm = pattern.bpm
  const stepsPerBar = 16  // assuming 4/4
  const stepDuration = 60 / bpm / 4

  if (config.scope === 'pattern') {
    const maxSteps = Math.max(...pattern.tracks.map(t => t.steps))
    return maxSteps * stepDuration * config.bars
  }
  if (config.scope === 'chain') {
    let totalSteps = 0
    for (const entry of chain.entries) {
      const pat = getPatternData(entry.patternId)
      const maxSteps = Math.max(...pat.tracks.map(t => t.steps))
      totalSteps += maxSteps * entry.repeats
    }
    return totalSteps * stepDuration
  }
}
```

### B. Real-Time Audio Recording

Record the live output (including manual FX/perf changes) using `MediaRecorder` + `MediaStreamDestination`.

```typescript
let mediaRecorder: MediaRecorder | null = null
let chunks: Blob[] = []

function startRecording() {
  const dest = audioContext.createMediaStreamDestination()
  masterGainNode.connect(dest)  // tap the master output

  mediaRecorder = new MediaRecorder(dest.stream, {
    mimeType: 'audio/webm;codecs=opus'  // or 'audio/wav' if supported
  })
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' })
    downloadBlob(blob, `inboil-${Date.now()}.webm`)
    chunks = []
  }
  mediaRecorder.start()
}

function stopRecording() {
  mediaRecorder?.stop()
  mediaRecorder = null
}
```

**Note:** `MediaRecorder` output formats are browser-dependent (WebM/Opus in Chrome, might need fallback). For WAV output, capture raw PCM via `ScriptProcessorNode` or a custom worklet tap.

### C. MIDI Export (Pattern → .mid)

Export trigger data as a Standard MIDI File (Type 0 or Type 1).

#### Data Mapping

```
Track[i].trigs → MIDI Track i
  trig.active + trig.note → Note On (ch=i, note, velocity*127)
  trig.duration → Note Off after N ticks
  trig.velocity → MIDI velocity (0–127)
  pattern.bpm → MIDI tempo meta event
```

#### MIDI File Structure

```
Type 1 MIDI file (multi-track):
  Track 0: Tempo map (meta events)
  Track 1–8: Note data per INBOIL track

Ticks per quarter note (PPQN): 96
  → 1 step = 24 ticks (16th note at PPQN=96)
```

#### Implementation

Encode MIDI binary manually (spec is well-defined, ~200 lines):

```typescript
function exportMidi(): Blob {
  const ppqn = 96
  const ticksPerStep = ppqn / 4  // 24 ticks per 16th note

  const tracks: Uint8Array[] = []

  // Track 0: tempo
  tracks.push(buildTempoTrack(pattern.bpm, ppqn))

  // Track 1–8: note data
  for (const track of pattern.tracks) {
    const events: MidiEvent[] = []
    for (let step = 0; step < track.steps; step++) {
      const trig = track.trigs[step]
      if (!trig.active) continue
      const tick = step * ticksPerStep
      const dur = (trig.duration ?? 1) * ticksPerStep
      events.push({ tick, type: 'noteOn', note: trig.note, velocity: Math.round(trig.velocity * 127) })
      events.push({ tick: tick + dur, type: 'noteOff', note: trig.note })
    }
    tracks.push(buildMidiTrack(events))
  }

  return new Blob([buildMidiFile(tracks, ppqn)], { type: 'audio/midi' })
}
```

No external dependency needed — MIDI file format is simple enough to encode inline.

### D. UI

#### Export Panel (in System sidebar or modal)

```
┌─────────────────────────┐
│  EXPORT                 │
├─────────────────────────┤
│  Audio                  │
│  [Pattern WAV] [Chain]  │
│  Bars: [1] [2] [4] [8] │
│  ───────────────────    │
│  MIDI                   │
│  [Pattern .mid]         │
│  ───────────────────    │
│  Live Recording         │
│  [● REC]  00:00         │
└─────────────────────────┘
```

#### REC indicator in AppHeader

When recording is active, show a red `● REC` badge and elapsed time in the header bar.

## Implementation Order

1. **Phase 1: MIDI Export** — simplest, no audio processing. Immediate value for DAW users.
2. **Phase 2: Offline WAV Bounce** — `OfflineAudioContext` + WAV encoder. Core export feature.
3. **Phase 3: Real-Time Recording** — `MediaRecorder` tap. Captures live performance.
4. **Phase 4: MP3 encode** (optional) — `lamejs` or Web Audio encoding API.

## Consequences

- **Positive:** Enables sharing and further production — critical for adoption
- **Positive:** MIDI export is lightweight (<200 lines, no deps)
- **Positive:** `OfflineAudioContext` renders faster than real-time
- **Positive:** Real-time recording captures live performance nuance
- **Negative:** `OfflineAudioContext` requires worklet to be instantiable in offline context (may need refactoring of engine.ts initialization)
- **Negative:** `MediaRecorder` format support varies by browser (WebM/Opus in Chrome, may need WAV fallback)
- **Risk:** Offline bounce must reproduce identical output to real-time playback — any divergence is a bug
- **Dependency:** Benefits from ADR 020 (data persistence) for saving export presets
