# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
