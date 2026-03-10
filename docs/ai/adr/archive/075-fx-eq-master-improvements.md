# ADR 075: FX / EQ / Master Improvements

## Status: Implemented

## Context

The current FX, EQ, and Master chains are functional but offer limited tonal variety. Each effect has a fixed algorithm with only XY parameter control. Users cannot quickly switch between distinct sonic characters (e.g., a room reverb vs shimmer reverb) without manually tweaking parameters — and some characters require DSP changes beyond parameter ranges.

EQ and Master have minor usability gaps: fixed Q, no gain-reduction visibility, and fixed compressor dynamics.

## Decision

### 1. FX Flavours (Priority: High)

Add selectable flavours (algorithm variants) per effect. Each flavour is a combination of parameter presets and, where needed, DSP algorithm changes.

#### Reverb

| Flavour | Description | DSP Change |
|---------|-------------|------------|
| Room | Short, tight (default) | Current Freeverb, size≈0.60, damp≈0.4 |
| Hall | Large, diffuse | Freeverb, size≈0.92, damp≈0.15 |
| Shimmer | Pitch-shifted feedback (+12st) | New: pitch shifter in feedback path |

Shimmer requires a new DSP block (granular pitch shift or FFT-based) inserted into the Freeverb feedback loop. This is the only flavour that needs significant new code.

#### Delay

| Flavour | Description | DSP Change |
|---------|-------------|------------|
| Digital | Clean ping-pong (default) | Current PingPongDelay |
| Tape | Warm, wobbly | Add LP filter (2kHz) + LFO wow/flutter (±2–5 cent, 0.5–2Hz) in feedback path |
| Dotted | Dotted-eighth sync | Tempo-sync time to dotted 8th (3/16 of beat) |

#### Glitch

| Flavour | Description | DSP Change |
|---------|-------------|------------|
| Bitcrush | Current S&H + quantize (default) | Current algorithm |
| Stutter | Repeat-buffer slice | New: capture N ms, loop playback with crossfade |
| Redux | Aggressive downsample only | S&H with fixed bit depth (no quantize Y) |

#### Granular

| Flavour | Description | DSP Change |
|---------|-------------|------------|
| Cloud | Default grain shower | Current algorithm |
| Freeze | Instant freeze on tap | Current freeze mode, auto-engage |
| Stretch | Time-stretch feel | Large grains (100–400ms), low density, no scatter |

#### UI: Flavour Selection

- **Long-press** an FX node on the FxPad → radial bubble menu with flavour options (consistent with existing bubble menu pattern)
- Current flavour shown as small label below the node name
- Flavour state stored in `song.effects[effectId].flavour` (string, default = first option)
- Flavour change triggers DSP reconfiguration via worklet message

### 2. EQ Enhancements (Priority: Medium)

#### Adjustable Q

- **Current**: All 3 bands fixed at Q=1.5
- **Proposal**: Allow Q adjustment per band (range 0.3–8.0)
- **Interaction**: Pinch gesture on touch / scroll wheel on node in FilterView
- **Visual**: Narrower/wider bell curve on the EQ response overlay

#### Shelf Mode for Low/High Bands

- Low band: toggle between peaking (bell) and low-shelf
- High band: toggle between peaking and high-shelf
- **Interaction**: Double-tap the node to cycle mode
- **Visual**: Shelf curve shape on the response overlay
- **DSP**: Biquad shelf coefficients (RBJ cookbook, already familiar pattern)

### 3. Master Enhancements (Priority: Low)

#### Gain Reduction Meter

- Show compressor GR alongside existing VU meter
- Inverted bar (top-down) in a distinct colour (e.g., orange)
- Reads from compressor envelope: `GR_dB = 20 * log10(envelope / threshold) * (1 - 1/ratio)`
- Helps users see how hard the compressor is working

#### Compressor Attack/Release Control

- **Current**: Fixed attack=0.8ms, release=60ms
- **Proposal**: Expose as a secondary XY on the COMP pad (e.g., hold mode like Granular's mode 2)
  - X = Attack (0.1–30ms)
  - Y = Release (10–300ms)
- Enables punchy drum bus (fast attack, medium release) vs glue compression (slow attack, long release)

## Implementation Order

1. **FX flavours (parameter-only)**: Room/Hall, Digital/Dotted, Cloud/Freeze/Stretch — no new DSP needed, just preset switching + bubble menu UI
2. **FX flavours (new DSP)**: Tape delay (LP+LFO in feedback), Stutter glitch (repeat buffer), Shimmer reverb (pitch shift feedback)
3. **EQ Q adjustment + shelf toggle**
4. **Master GR meter + compressor attack/release**

Phase 1 can ship independently and already adds significant variety.

## Considerations

- **State serialization**: Flavour strings must be added to the song save format. Default to first flavour for backwards compatibility with existing saves
- **Bundle size**: New DSP for shimmer/stutter adds code to the worklet. Keep each algorithm small (<200 lines)
- **CPU budget**: Shimmer pitch-shift is the most expensive addition. Profile on low-end devices before committing
- **Preset interaction**: FX flavours are global (per song), not per-track. Track sends just control amount
- **Bubble menu reuse**: The radial bubble menu component from SceneView can be extracted and reused for FxPad flavour selection
