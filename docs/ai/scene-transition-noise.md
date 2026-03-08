# Scene Transition Noise — Investigation Notes

## Problem

1. **Pattern transition click**: Scene playback switching between patterns produces audible clip noise / click
2. **Terminal cutoff**: When scene reaches a terminal node (no outgoing edges), sound cuts abruptly instead of decaying naturally

Manual stop (user pressing stop) sounds acceptable — the issue is specific to scene-driven transitions.

## Root Cause Analysis

### Async round-trip gap

Pattern transitions are triggered by the main thread in response to a `cycle` event from the worklet:

```
Worklet: patternPos >= patternLen → cycle event → main thread
Main thread: advanceSceneNode() → sendPatternByIndex(reset=true)
Worklet: receives setPattern → applies change
```

Between the cycle event and the setPattern arriving back, **2-4 render quantums pass** (~5-11ms). During this gap, the old pattern loops back to step 0 and fires new notes. These notes are then abruptly cut when setPattern arrives.

### Drum voices ignore noteOff

Drum voices (Kick, Snare, HiHat, Cymbal) are one-shot — `noteOff()` has no effect. When `noteOff()` is called during a crossfade, drum sounds continue at full internal amplitude. After the fade completes and `playing = false`, the "not playing" branch ticks voices without fade gain, causing a volume discontinuity (fade ramped to ~0, then jumps to voice output level).

### Non-reset setPattern clears terminal flag

The `$effect` in App.svelte sends `sendPatternByIndex(reset=false)` every animation frame for perf/automation updates. The worklet handler set `this.terminal = !!cmd.terminal` unconditionally, so every non-reset update cleared the terminal flag before the cycle boundary could check it.

**Fix applied**: `if (cmd.reset) this.terminal = !!cmd.terminal` — only set terminal on pattern switch.

## Approaches Tried

### 1. Crossfade on pattern switch (5ms fade-out → reset → apply → fade-in)

- Extracted `_applyPattern()` to defer pattern data application until after fade-out
- Freeze step advancement during fade (no new notes while fading)
- **Result**: No audible improvement. 5ms may be too short, but longer fades (30ms) cause noticeable gaps in rhythm.

### 2. Terminal flag (worklet stops at cycle boundary)

- `terminal` flag sent with setPattern, checked at `patternPos >= patternLen`
- At terminal cycle: start fade-out, then stop
- **Bug found**: terminal flag was cleared by non-reset updates (fixed)
- **Result**: Terminal fade didn't produce audible improvement even at 50ms or 1s

### 3. Empty "silence" pattern at terminal

- Send an empty pattern (no triggers) when terminal is reached, stop after a delay
- **Problem**: The empty pattern is sent AFTER the cycle event, so the clip already occurred at the cycle boundary before the message arrives
- **Result**: Added an extra empty pattern playback after the clip — worse than before

### 4. Drain approach (suppress new notes)

- `draining` flag to suppress noteOn during terminal pattern
- **Problem**: Conflated with terminal — suppressed ALL notes during the terminal pattern, not just after it
- **Result**: Terminal pattern played silently, then stopped

### 5. Longer fade durations

- 5ms: no audible difference
- 30ms: causes noticeable gap/weirdness on pattern transitions
- 50ms: no audible improvement on terminal
- 1s: no audible improvement on terminal (suggesting the fade may not be executing at all, or the problem is elsewhere)

## Key Insight: 1s fade had no effect

If a 1-second fade-out produces no audible change, the fade mechanism itself may not be activating for the terminal case. Possible reasons:

- The `fadeOutRemain` is set but then overwritten by a subsequent setPattern (non-reset $effect update)
- The fade-out gain multiplier path in `process()` is not reached
- The `fadeOutStop` flag is being cleared
- The terminal check in `_advanceStep` never fires (patternPos never reaches patternLen for terminal patterns?)

**This should be the starting point for the next investigation**: add debug logging (e.g., `port.postMessage({ type: 'debug', ... })`) to verify the terminal fade actually executes.

## Architecture Notes

- `process()` has two branches: `playing=true` (full voice+FX processing) and `playing=false` (audition-only, simpler processing). Switching between them mid-stream can cause discontinuities due to different gain/send calculations.
- FX processors (reverb, delay, granular, glitch) run unconditionally after voice ticking — their internal buffers/tails ring out regardless of playing state.
- The fade gain multiplier is applied to dry signals and send inputs AFTER voice ticking, BEFORE FX processing.
- `voice.reset()` zeros output immediately. `voice.noteOff()` triggers ADSR release (synths) or is ignored (drums).

## Files Involved

| File | Role |
|------|------|
| `worklet-processor.ts` | Audio thread — step sequencing, voice ticking, fade logic |
| `engine.ts` | Main thread API — pattern serialization, message passing |
| `App.svelte` | Scene advance logic, onStep handler |
| `state.svelte.ts` | `advanceSceneNode()`, terminal detection |
| `dsp/types.ts` | WorkletCommand/WorkletEvent message types |

## Next Steps

1. **Verify fade execution**: Add temporary debug messages to confirm terminal fade actually runs
2. **Consider worklet-side double buffering**: Pre-send next pattern so worklet can switch at exact cycle boundary without async gap
3. **Consider per-voice fade**: Instead of multiplying the mixed output, fade individual voice gains to avoid the playing/not-playing branch discontinuity
4. **Check if voice.reset() causes waveform discontinuity**: Some voices might not zero-cross on reset
