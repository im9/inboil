# ADR 065: Sampler Chop & Timestretch

## Status: Implemented

## Context

The `SamplerVoice` implemented in ADR 012 supports basic sample playback (start/end, reverse, pitch shift) but lacks chop (slice playback) and timestretch (tempo sync) — essential features for working with breakbeats and loop material.

Current `SamplerVoice` (`voices.ts:1034`):
- `start` / `end` params for manual playback range
- `rate` is pitch shift + sample rate compensation only (speed and pitch are coupled)
- No loop playback (cursor stops at end)

Breakbeat chopping and BPM-synced loop playback are fundamental groovebox features, implemented in three phases.

## Decision

### Phase 1: Chop (Slice Playback)

Auto-map slice positions to note numbers so breakbeats can be played from the keyboard/sequencer.

**DSP changes (`SamplerVoice`):**

```
New params:
  chopSlices: 0 (= OFF), 8, 16, 32   // step: 8
  chopMode:   0 = NOTE-MAP, 1 = SEQ   // step: 1
```

- When `chopSlices > 0`, the buffer is equally divided and slice boundaries are computed
- **NOTE-MAP mode**: `noteOn(note)` → `sliceIndex = (note - rootNote) % chopSlices` → auto-set start/end for the corresponding slice
- **SEQ mode**: each `noteOn` advances to the next slice sequentially (retrigger style). Each pattern step plays slices in order
- Manual `start` / `end` params serve as offset within the slice range (fine-tuning)

**UI changes (`DockPanel`):**

```
┌─────────────────────────────┐
│ [LOAD]  breakbeat.wav       │
│ ┌─────────────────────────┐ │
│ │▁▂▅█▇▃▁▂▄█▆▃▁▃▆█▅▂▁▂▅█▇│ │  ← waveform + slice lines
│ └─────────────────────────┘ │
│ CHOP [8] [16] [32] [OFF]   │  ← slice count selector
│ MODE [MAP] [SEQ]            │  ← chop mode toggle
└─────────────────────────────┘
```

- Slice divider lines drawn on the waveform canvas (extended `drawWaveform`)
- Slice count buttons reuse existing `btn-toggle` style

**paramDefs additions:**

```typescript
{ key: 'chopSlices', label: 'CHOP', group: 'chop', tip: 'Slice count: OFF/8/16/32', min: 0, max: 32, step: 8, default: 0 },
{ key: 'chopMode',   label: 'MODE', group: 'chop', tip: 'Chop: NOTE-MAP / SEQ',     min: 0, max: 1,  step: 1, default: 0 },
```

### Phase 2: Repitch BPM Sync

Change pitch to match tempo (equivalent to Ableton's Repitch mode). The simplest form of timestretch.

**DSP changes:**

```
New params:
  sampleBPM:  0 (= OFF), 1–200    // original BPM of the sample
  loopMode:   0 = ONE-SHOT, 1 = LOOP
```

- When `sampleBPM > 0`, `rate = (currentBPM / sampleBPM) * srRatio` auto-calculates playback speed
- Pitch changes with speed (faster = higher) — sounds natural for drum loops
- `loopMode = LOOP` wraps cursor back to start when reaching end
- BPM is delivered from worklet to `SamplerVoice` via existing `setParam('bpm', value)` path

**BPM detection (stretch goal):**

- Onset detection on sample load → tempo estimation (main thread), sent to worklet
- Falls back to manual BPM input when detection accuracy is low

### Phase 3: WSOLA Timestretch

Pitch-preserving tempo sync using proper timestretch.

**Algorithm: WSOLA (Waveform Similarity Overlap-Add)**

```
Input buffer → Analysis frames (hop = N samples)
                ↓
          Cross-correlation to find optimal overlap position
                ↓
          Overlap-add output synthesis
                ↓
Output buffer (different length, same pitch)
```

- Lower computational cost than Phase Vocoder (FFT-based) and fewer artifacts (phasing) on drum material
- Separate implementation from existing `GranularProcessor` (`effects.ts:167`) — different purpose (effect vs accurate tempo sync)
- Parameters: window size 2048 samples (~46ms @44.1kHz), hop ratio 0.5
- Real-time processing: WSOLA frames generated incrementally in `tick()` using a ring buffer

**New param:**

```
stretchMode: 0 = REPITCH, 1 = WSOLA   // switches between Phase 2 repitch and WSOLA
```

**Implementation details:**
- Ring buffer (`wsolaOut[2048]`) holds overlap-add synthesized output
- `_wsolaFindBest`: cross-correlation search within ±512 samples to find best alignment with previous window tail
- `_wsolaHop`: reads one hop from source buffer, crossfade overlap-add into ring. Input cursor advances at original speed (SR-compensated)
- `tick()` in WSOLA mode reads one sample per call from ring buffer, triggers next hop when running low

## Considerations

- **Phase 1 chop is powerful combined with P-Lock**: P-Lock `chopSlices` or `start` per step to create complex breakbeat patterns on a single track
- **Equal division vs transient detection**: Phase 1 uses equal division only. Transient detection is deferred due to algorithm complexity vs accuracy trade-offs
- **WSOLA computational cost**: cross-correlation runs per hop in the AudioWorklet. Fixed window size (2048 samples) keeps it lightweight
- **Memory**: WSOLA requires an output ring buffer but only ~8KB per voice — negligible
- **Phase 2 repitch remains after Phase 3**: repitch often sounds more natural on drum loops

## Future Extensions

- Smart slicing via transient detection (split at attack positions instead of equal division)
- Manual slice position editing (drag divider lines on waveform UI)
- Sample pool integration (ADR 012 Option B) — share samples across tracks
- Slice-to-MIDI: auto-generate patterns from chopped slices
- Formant preservation (for vocal material — WSOLA + pitch shift combination)
