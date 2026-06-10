# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.4.3] - 2026-06-10

### Fixed
- Mobile PadGrid chord input: tapping multiple pads on the same step now builds a chord instead of overwriting the previous note
- Mobile POLY/MONO toggle in MobileParamOverlay: cycle through MONO → POLY → WIDE → UNISON correctly (value passed to knobChange wasn't normalized, landing on invalid mode values)
- Mobile overlay sheets (FX / EQ / Master / Perf): tapping the XY pad area no longer dismisses the sheet — `.pattern-sheet.mobile` lost `position: absolute` / `z-index: 51` and was painted below the backdrop

### Changed
- Harden npm supply chain defenses
- Bump vite group, svelte, astro 6.3.7, @astrojs/mdx 5.0.6, @astrojs/starlight 0.39.2

## [0.4.2] - 2026-05-15

### Fixed
- FM synth oversampling artifacts: HalfBandDown FIR filter delay line was misaligned, causing aliasing/noise on FM voices
- Voice picker not scrollable on mobile (changed to onclick)
- Site build broken on starlight 0.38.4 (empty social array required)

### Changed
- Bump vite 8.0.13, vitest 4.1.6, svelte 5.55.7, @playwright/test 1.60.0
- Bump astro 6.3.3, @astrojs/svelte 8.1.1, @astrojs/starlight 0.39.1, @astrojs/mdx 5.0.4

## [0.4.1] - 2026-04-18

### Fixed
- Generative sheets (Tonnetz, Quantizer, Turing) not rendering as overlay — displayed in normal document flow instead of absolute-positioned over scene view
- Pattern mode tabs (GRID/PADS/TRACKER) showing when sweep canvas is active
- CI auto-tag condition not matching release branch name

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
