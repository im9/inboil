# ADR 097: Mobile Punch-In Effects

## Status: Implemented

## Context

Mobile currently has 3 performance effects (FILL / REV / BRK) accessed via PerfBubble — a draggable FAB that expands to show 3 stacked buttons. The hold-down interaction (press = on, release = off) mirrors Teenage Engineering's punch-in pattern and works well.

However:

1. **Only 3 effects** — The PerfBubble maxes out at 3 items. Adding more would make the vertical stack unwieldy
2. **Scene features removed on mobile** — ADR 095 stripped desktop-only features (decorators, edge editing, function nodes). Mobile needs its own identity beyond "desktop minus features"
3. **Mobile hardware is underutilized** — Phones have accelerometers, gyroscopes, and multi-touch that desktops don't. These should drive performance interactions, not replicate mouse patterns
4. **TE precedent** — Pocket Operator and OP-1 prove that constrained hardware + creative effects = addictive live performance

### Current mobile perf architecture

```
PerfBubble (FAB, bottom-right)
  └─ PerfButtons (bubble variant)
       ├─ FILL  → perf.filling (drum random hits)
       ├─ REV   → perf.reversing (playhead backward)
       └─ BRK   → perf.breaking (50% duty gate)
```

DSP side: all 3 are boolean flags in `worklet-processor.ts`. Simple on/off, no parameters.

## Decision

### Design principle

**Mobile as a performance instrument, not a miniature DAW.**

Replace PerfBubble with a dedicated bottom-sheet overlay ("Perf Sheet") containing tabbed categories of punch-in effects. Each effect uses the same hold-down pattern but adds sensor-driven modulation.

### Perf Sheet layout

```
┌─────────────────────────────────────────┐
│  PERF    GLITCH    FILTER    MOTION     │  ← tab bar
├─────────────────────────────────────────┤
│                                         │
│   ┌──────┐  ┌──────┐  ┌──────┐         │
│   │ FILL │  │ REV  │  │ BRK  │         │  ← hold-down pads
│   └──────┘  └──────┘  └──────┘         │
│                                         │
└─────────────────────────────────────────┘
```

### Effect categories

#### PERF (existing, enhanced)

| Effect | Trigger | Behavior |
|--------|---------|----------|
| FILL | Hold | Random drum hits (existing) |
| REV | Hold | Reverse playback (existing) |
| BRK | Hold | Rhythmic gate (existing) |

#### GLITCH (new)

| Effect | Trigger | Behavior |
|--------|---------|----------|
| STTR | Hold | Retrigger / stutter — repeats current step at subdivisions (1/8 → 1/16 → 1/32 based on hold duration) |
| HALF | Hold | Half-speed playback (BPM ÷ 2) |
| TAPE | Hold + release | Tape stop on hold (pitch ramp down), tape start on release (pitch ramp up) |

#### FILTER (new)

| Effect | Trigger | Behavior |
|--------|---------|----------|
| LPF | Hold + Y-axis | Low-pass sweep — finger vertical position controls cutoff |
| HPF | Hold + Y-axis | High-pass sweep — finger vertical position controls cutoff |
| DJ | Hold + Y-axis | Combined LP/HP — center = open, up = HPF, down = LPF (like DJ filter knob) |

#### MOTION (new, sensor-driven)

| Effect | Trigger | Behavior |
|--------|---------|----------|
| TILT | Hold + accelerometer | Map phone tilt angle to filter cutoff + resonance |
| SHAKE | Shake gesture | Trigger random fill burst (auto-releases after 1 bar) |
| CHOP | Hold + chop gesture | Quick downward flick = momentary mute (beat repeat feel) |

### Sensor integration

```
DeviceMotionEvent / DeviceOrientationEvent
  ├─ accelerometer.x → pan / stereo width
  ├─ accelerometer.y → filter cutoff
  ├─ accelerometer.z → unused (reserved)
  ├─ rotationRate → resonance / feedback amount
  └─ shake detection → threshold-based (acceleration magnitude > N)
```

- iOS requires user permission for motion events (`DeviceMotionEvent.requestPermission()`)
- Graceful fallback: MOTION tab hidden on devices without sensor support
- Sensor data sent at ~30Hz, smoothed with exponential moving average

### Desktop isolation

- Perf Sheet is **mobile-only**. Desktop retains PerfBar in AppHeader sub-header
- New effects added to `worklet-processor.ts` are available on both platforms via `perf` state, but the sensor-driven modulation is mobile-only UI
- Guest mode: new effects extend `guestPerf()` message types — host processes them identically

### State additions

```ts
// state.svelte.ts — perf object extensions
export const perf = $state({
  // existing
  filling: false,
  reversing: false,
  breaking: false,
  // new — glitch
  stuttering: false,
  stutterRate: 0,      // 0.0–1.0, maps to subdivision
  halfSpeed: false,
  tapeStop: false,
  // new — filter
  filterType: null as 'lpf' | 'hpf' | 'dj' | null,
  filterCutoff: 0.5,   // 0.0–1.0, normalized
  // new — motion
  tiltActive: false,
  tiltX: 0,            // -1.0 to 1.0
  tiltY: 0,            // -1.0 to 1.0
})
```

### Worklet commands

New commands for worklet-processor:

| Command | Params | DSP behavior |
|---------|--------|-------------|
| `perf_stutter` | `{on, rate}` | Re-trigger sample buffer at rate subdivision |
| `perf_half` | `{on}` | Halve accumulator increment |
| `perf_tape` | `{on}` | Exponential pitch ramp (down on press, up on release) |
| `perf_filter` | `{type, cutoff}` | Apply SVF filter to master bus pre-FX |

## Implementation Phases

### Phase 1: Perf Sheet + existing effects

- Create `MobilePerfSheet.svelte` (bottom sheet with tab bar)
- Move FILL/REV/BRK from PerfBubble to PERF tab
- Hold-down interaction on pad-style buttons
- PerfBubble becomes a trigger to open/close the sheet
- Desktop: no changes

### Phase 2: Glitch effects

- Implement STTR/HALF/TAPE in worklet-processor
- Add to GLITCH tab
- Extend `guestPerf()` for multi-device support

### Phase 3: Filter effects

- Add SVF filter to master bus path in worklet
- Y-axis touch position → cutoff mapping
- DJ filter mode (combined LP/HP)

### Phase 4: Motion effects

- DeviceMotion/Orientation integration with permission flow
- TILT/SHAKE/CHOP gesture detection
- MOTION tab (hidden without sensor support)
- Smoothing and calibration

## Considerations

- **Permission UX**: iOS 13+ requires explicit permission for motion events. Show a one-time prompt when MOTION tab is first tapped, not on page load
- **Battery**: Sensor polling at 30Hz is lightweight. Throttle further if backgrounded
- **Latency**: Sensor → state → worklet path adds ~1 frame of latency (~16ms). Acceptable for modulation, not for triggers — SHAKE uses threshold detection to fire immediately
- **Tab count**: 4 tabs may feel crowded on small screens. Consider swipeable tabs without labels (icon-only) if space is tight
- **PerfBubble fate**: Repurpose as sheet trigger (tap to open). Keep draggable positioning. Show active effect count as badge
- **Relation to ADR 095**: This extends Phase 3 (touch interaction optimization) with a concrete feature set

## Future Extensions

- User-assignable effect slots (drag effects between tabs)
- Effect parameter presets (e.g., "aggressive stutter" vs "subtle stutter")
- Multi-touch: hold two effects simultaneously for combined processing
- Recording: capture perf automation as scene decorators
- Visualizer: screen flash / color shift synced to active effects
