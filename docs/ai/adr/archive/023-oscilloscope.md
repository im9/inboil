# ADR 023 — Oscilloscope Display

## Status: Implemented

## Context

inboil has no real-time waveform display. FilterView (EQ) shows a frequency spectrum as a dot matrix, but a time-domain waveform (oscilloscope) is not implemented.

An oscilloscope provides visual feedback on timbre changes and is invaluable for parameter tuning. Standard feature in hardware grooveboxes (Elektron Digitakt II, Teenage Engineering OP-1).

## Decision

### Data Source

Use the existing `AnalyserNode` (already created in engine.ts) for time-domain data.

```typescript
// Existing: engine.ts
this.analyser = this.ctx.createAnalyser()
this.analyser.fftSize = 1024
this.node.connect(this.analyser)
this.analyser.connect(this.ctx.destination)
```

For the oscilloscope:
```typescript
const buf = new Uint8Array(analyser.fftSize)
analyser.getByteTimeDomainData(buf)
// buf[i] = 0–255, 128 = 0V (silence)
```

Master output only (per-track is a future extension).

### UI Placement: app-header Background

Overlay the waveform on the app-header (INBOIL logo bar) background using `position: absolute`. Replaces the decorative geo-circle with a functional visual background.

```
┌─────────────────────────────────┐
│  INBOIL ～～wave～～        ⚙   │  ← app-header (40px / compact 32px)
├─────────────────────────────────┤
│  120 BPM  ▶ ■ RAND  PAT 00    │  ← sub-header
├─────────────────────────────────┤
│  (grid / fx / eq)               │
└─────────────────────────────────┘
```

- Place `<Oscilloscope />` as absolute overlay inside app-header
- `pointer-events: none` so logo and buttons remain interactive
- Waveform color `rgba(237,232,220,0.2)` blends as UI background
- Shared across mobile and desktop (AppHeader is used in both)

### Drawing Implementation

Canvas 2D with a simple waveform line (same pattern as FxPad).

```typescript
function drawScope(ctx: CanvasRenderingContext2D, data: Uint8Array, w: number, h: number) {
  ctx.clearRect(0, 0, w, h)
  ctx.beginPath()
  const sliceW = w / data.length
  for (let i = 0; i < data.length; i++) {
    const v = data[i] / 128.0   // 0–2, center = 1
    const y = (v * h) / 2
    if (i === 0) ctx.moveTo(0, y)
    else ctx.lineTo(i * sliceW, y)
  }
  ctx.strokeStyle = 'rgba(237, 232, 220, 0.6)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}
```

Updated every frame via `requestAnimationFrame`. Shows flatline (128 = 0V) when stopped.

### Visual Style

- Waveform line: cream color (`rgba(237, 232, 220, 0.2)`) — blends as subtle background
- Zero-crossing detection for stable waveform display
- DPR-aware canvas (Retina support)

### Changed Files

| File | Changes |
|------|---------|
| `src/lib/components/Oscilloscope.svelte` | **New** — Canvas-based scope component (absolute overlay) |
| `src/lib/components/AppHeader.svelte` | Add scope inside app-header, remove geo-circle, expand height 28→40px |

- `engine.ts` — No changes (existing `getAnalyser()` used as-is)
- `worklet-processor.ts` — No changes (AnalyserNode is on the AudioContext side)
- `MobileTrackView.svelte` — No changes
- `StepGrid.svelte` — No changes

### Performance Considerations

- `getByteTimeDomainData` is lightweight (no FFT, buffer copy only)
- Canvas drawing is a single `lineTo` pass — lower cost than FxPad
- rAF loop already exists for FxPad / FilterView — minimal additional cost
- Skip drawing when stopped to save CPU

## Verification

1. Playing → master output waveform displayed in real-time
2. Kick solo → clear transient waveform
3. Parameter changes → waveform reflects changes immediately
4. Playback stopped → flatline
5. Smooth 60fps on mobile

## Future Extensions

- **Per-track scope**: Display selected track's output only
- **Lissajous (X-Y) mode**: Map stereo L/R to X/Y axes
- **Freeze/Hold**: Tap to pause waveform for inspection
- **Trigger sync**: Zero-crossing trigger for stable display
