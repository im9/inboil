# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
