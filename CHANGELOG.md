# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.2.0] - 2026-03-31

### Performance
- Eliminate heap allocations in AudioWorklet process() hot path (ShimmerReverb, FormantFilter, arpeggiator, FMVoice, postMessage, PRNG)

### Changed
- Add /pr skill for branch + commit + PR workflow
- Add PreToolUse hook for git commit/push confirmation

### Documentation
- ADR 101: feature branch workflow (implemented and archived)
