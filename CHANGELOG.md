# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.4.0] - 2026-04-18

### Added
- **Pads view**: new third pattern editor tab alongside Grid and Tracker (ADR 130)
  - 4×4 MPC-style pads with tri-mode (TRACK / SLICE / NOTE)
  - Single-track deep editor: step cells, velocity/chance/param bars, PianoRoll
  - SamplerWaveform with zoom, start/end handles, chop slice markers
  - DockPanel PARAMS/POOL tab switch for sampler voices
- **Voice visualizations** in PadsView canvas area (ADR 131 Phase 2)
  - Drum: amplitude decay + pitch sweep curves
  - WT: wavetable waveform + ADSR envelope
  - FM: algorithm routing diagram with operator levels
  - Analog: ADSR envelope
- Waveform display for Crash/Ride (audio pool) and pack samples (Grand Piano)
- Pad audition without requiring playback
- Playhead highlighting on pads for all modes

### Fixed
- SamplerWaveform fallback to pre-computed waveform when rawBuffer decode fails

### Changed
- Bump svelte 5.55.4, gsap 3.15.0, astro 6.1.7, @astrojs/starlight 0.38.3, @astrojs/svelte 8.0.5

## [0.3.1] - 2026-04-03

### Performance
- Voice idle early-out: skip full DSP for inactive poly cores in WTSynth (POLY16) and FMVoice (POLY12)
- Deduplicate sendPattern calls triggered by sweep automation reactivity (-42%)
- Cache sweep lookup and pattern ref per pattern transition

### Fixed
- Rev perf effect no longer causes premature pattern transition in scene play
- Display project name in original case instead of uppercase
- Factory reset now wipes all persistent storage
- Stop stripping empty patterns on project export
- Clear solo/mute state when removing a track

### Changed
- Dev-only profiling tools for AudioWorklet performance investigation
- Bump svelte 5.55.1, svelte-check 4.4.6, astro 6.1.3, @playwright/test 1.59.1

## [0.3.0] - 2026-04-01

### Added
- FM synth per-operator detune and feedback parameters

### Fixed
- Fix track visibility broken after loading templates (removed orphan pruning)
- Add per-voice soft clipping (tanh) to FMVoice to prevent digital distortion

### Performance
- Eliminate remaining audio-thread allocations (postMessage pre-allocation, indexed loops in reverb DSP, for-loop in setPattern)

## [0.2.0] - 2026-03-31

### Performance
- Eliminate heap allocations in AudioWorklet process() hot path (ShimmerReverb, FormantFilter, arpeggiator, FMVoice, postMessage, PRNG)

### Changed
- Add /pr skill for branch + commit + PR workflow
- Add PreToolUse hook for git commit/push confirmation

### Documentation
- ADR 101: feature branch workflow (implemented and archived)
