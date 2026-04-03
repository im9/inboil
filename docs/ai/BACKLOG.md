# Technical Backlog

Known improvements that don't require design decisions (no ADR needed).
Items are not prioritized — pick based on what you're already touching.

## Scaling Concerns

Known architectural limits that are fine at current scale but need attention when expanding.

- [ ] **Undo stack memory** — 50 full song snapshots (~200–400KB each, up to ~20MB). Consider delta snapshots if patterns exceed 100+ or tracks exceed 16
- [ ] **WorkletPattern full serialization** — Every reactive change sends the entire pattern+FX state to the AudioWorklet (~20–40KB). Add change detection or delta messaging if tracks go beyond 16 or steps beyond 64
- [x] **state.svelte.ts cohesion** — Split from 1156→581 lines. Extracted sampleActions, poolActions, projectActions, importExport as domain modules. pushUndo call sites already in action modules (stepActions, sceneActions, sectionActions)
- [ ] **Scene O(n) traversal** — Node/edge lookups use `.filter()`/`.find()` per operation. Introduce `Map<id, Node/Edge>` index if scenes regularly exceed 50 nodes
- [ ] **Mobile rendering** — StepGrid re-renders all 128 cells on playhead advance. No virtual scrolling for long patterns. Add memo keys or virtual scroll if patterns expand to 64+ steps
- [ ] **P-Lock storage density** — `paramLocks` is unbounded `Record<string, number>` per step. At 64 steps × 24 tracks × 20 params, a single pattern could reach 500KB. Monitor in dogfooding

## Security

Hardening tasks for signaling server (see ADR 019 §Security Hardening for design rationale).

- [x] **Room TTL** — Durable Object alarm() to self-destruct after 1h inactivity
- [x] **IP rate limiting** — 5 failed joins per IP / 10s → temporary block
- [x] **Room code 8-char** — Extend from 6 to 8 characters (30-bit → 40-bit entropy)

## Performance: Audio Glitch (process() Budget Overrun)

Chrome trace profiling (2026-04-03) revealed the root cause: **AudioWorklet process() p50=5.06ms consistently exceeds the 2.9ms budget** (128 samples @ 44.1kHz). 58.8% of calls overrun. The issue is not pattern-transition-specific — it is constant DSP weight.

### Profiled & ruled out (main thread)
- [x] **Profile transition path** — Transition logic total: 0.4-1.5ms. Not the cause
- [x] **`snapshotAutomationTargets()` cost** — 0.3-0.5ms (JSON deep clone). Top cost within transition but not the bottleneck
- [x] **`applyLiveGenerative()` reactive mutation storm** — 0-0.8ms (first call only). Not significant
- [x] **`structuredClone` for WorkletPattern** — `buildWorkletPattern` 0.3-0.6ms + postMessage 0.1-0.2ms. Not the cause
- [x] **UI re-render contention** — onStep total 0.3-1.1ms. Not the cause
- [x] **$effect double sendPattern** — Sweep mutations triggered redundant $effect→sendPattern. Fixed with timestamp dedup (sendPattern calls -42%)
- [ ] **Edge adjacency pre-index** — Not profiled; negligible at current scale (<20 edges)

### AudioWorklet optimizations needed
- [x] **Zero-alloc FX returns** — Already implemented: every stereo FX uses `private out = new Float64Array(2)` pre-allocated at construction. Mono FX return primitives. No per-sample allocation
- [x] **FX bypass optimization** — Send reverb/delay skip `.process()` when input is zero and engine reports idle (output peak < 1e-5 for 256 samples). Insert FX skip when `slot.mix < 1e-6`. EQ/filter already had smooth bypass
- [x] **Voice early-out** — Already implemented: all voices (MoogVoice, TB303Voice, AnalogVoice, DrumMachine, FMCore) have `isIdle()` / amplitude-threshold early-return in `tick()`. Muted tracks skip after smooth fade completes
- [ ] **Reduce per-sample overhead** — The 128-sample inner loop contains conditional branches (flavour routing, insert FX chains, stutter) evaluated per sample. Hoist invariants outside the loop where possible

## Bug Fixes

- [ ] **Rev cycle ~1 step early on scene transition** — `patternPos--` during rev fixes the main bug (mid-pattern transition) but leaves ~1 step timing drift because `patternPos` runs at 1/32 rate while playheads advance at 1/16 (divisor-dependent). Fix: resync `patternPos` from longest track's playhead position on rev release. Needs careful handling of multi-track divisors and swing. See `cycle-detect.ts` for pure-function test harness
- [x] **Sweep absolute value curves** — Sweep curves stored offsets (`v = value * 2 - 1`, applied as `base + offset`) causing XY pad drift when snapshot baseline differed between recording and playback. Fixed: curves now store absolute values (0–1), applied directly without baseline. Legacy data auto-migrated via `migrateSweepCurvesToAbsolute()` in `restoreScene`
- [x] **Stop→play sweep state not reset** — On stop, `restoreAutomationSnapshot` used the carry-over snapshot (from last pattern transition) instead of the pre-playback state. FX on/off and parameter values leaked across play sessions. Fixed: `markScenePlayStart()` saves an initial snapshot; stop restores from it

## Refactoring

- [x] **VoicePicker shared component** — Extracted to `VoicePicker.svelte` with `variant` prop for dock/mobile styling
- [x] **AudioWorklet error propagation** — WorkletEvent `error` type added (WRK-001/DSP-001), engine shows toast on receive
- [x] **Clone roundtrip tests** — Add tests that create fully-populated objects (SweepData, Scene, ModifierParams), clone them, and deepEqual. Catches missing fields on type changes. Triggered by: globalSweep/durationMs/offsetMs lost on reload because cloneScene/cloneModifierParams didn't copy them
- [x] **SweepCanvas pure function extraction** — Extract label generators, hit-test calculations, and curve draw path builders from SweepCanvas.svelte (~1900 lines) into a separate `sweepCanvasHelpers.ts`. Improves testability without changing component structure

## FM Synth Enhancements

- [x] **FM operator detune UI** — `op1Detune`–`op4Detune` exist in DSP (`setParam` routes in FMSynth) but are not registered in `paramDefs.ts`. Adding them to the FM paramDefs exposes per-operator cent detune knobs for beat frequencies and thicker timbres
- [x] **Multi-operator feedback** — Only `op1Fb` is exposed in paramDefs. DSP already accepts `op2Fb`–`op4Fb` (routes to `ops[n].feedback`). Exposing all four widens the timbral palette (cf. Dexed's per-OP feedback)
- [ ] **LFO to feedback / algorithm crossfade** — FM LFO destinations are limited to level (L1–L4) and ratio (R1–R4). Adding feedback amount and algorithm crossfade as modulation targets enables evolving FM textures
- [ ] **Exponential ADSR curves** — Shared `ADSR` class (`filters.ts`) uses linear ramps (`level += 1/time`). Exponential attack/decay curves (e.g. `level *= 1 - coeff`) give more natural response — affects FM, WT, Analog, and all voices using ADSR

## Developer Tooling

- [ ] **DSP A/B comparison CLI** — Offline render two branches' audio output and diff waveforms. Replaces manual browser ear-confirm for DSP changes. Needs headless AudioContext (or OfflineAudioContext wrapper) that can render a pattern to .wav
- [ ] **Visual regression screenshots** — Playwright script that captures key screens (matrix, scene, dock, sidebar) and diffs against baseline PNGs. Catches unintended CSS changes without manual visual checks
- [ ] **Save data migration test harness** — Archive historical save data snapshots and CI-test that `restoreSongPure` loads them without error. Protects backward compatibility invariant
- [ ] **ADR dashboard** — Simple page that parses `docs/ai/adr/` and displays status/checklist progress at a glance
- [ ] **Audio worklet playground** — Standalone browser tool for rapid DSP experimentation. Load inboil's worklet-processor directly, edit params, hear results instantly
- [ ] **Svelte 5 component catalog** — Lightweight Storybook alternative for viewing/interacting with inboil components in isolation. Could extend existing playground

## Ideas

Someday/maybe items — no commitment, just interesting directions.

- [ ] **Reduce header density** — AppHeader currently exposes BPM, transport, record, view mode, performance controls, CPU meter, and session status at once. Demote non-primary status/info (CPU, host/guest, secondary controls) so the top bar focuses on transport, tempo, and current mode
- [ ] **Clarify top-level navigation model** — `SCENE / FX / EQ / MST` mixes different conceptual layers (arrangement vs processing views). Rework labels and hierarchy so Scene reads as the primary canvas and other views read as subordinate edit modes, not equal top-level destinations
- [ ] **Strengthen first-run activation** — Welcome overlay is clean but does not immediately teach why inboil is special. After `Load Demo`, add a short guided flow that prompts the first satisfying actions (play, touch a node, open FX) within the first 30 seconds
- [ ] **Reduce dependence on hardware-native assumptions** — Current UI rewards users who already understand Elektron-style mental models. Audit labels, affordances, and always-visible controls to remove unnecessary implicit knowledge barriers for first-time users
- [ ] **Prune feature presentation, not just add features** — The product has accumulated a lot of capability and decision history. Do a pass that explicitly removes, hides, or defers low-signal options in primary surfaces so the app feels more like a cohesive instrument and less like an ever-growing control panel

- [ ] **Particle oscillator** — Granular cloud from wavetable. MONO or low grain count (8–16) to stay within CPU budget (ref: ADR 113)
- [ ] **Wavetable editor** — Draw waveforms on Canvas → 2048 samples → `_bandLimit` → inject into table cache (ref: ADR 113)
- [ ] **User wavetable import** — Load .wav single-cycle files as custom shapes (ref: ADR 113)
- [ ] **Per-oscillator filter** — Filter before osc combine, not just after (ref: ADR 113)
- [ ] **Audio-rate FM mod source** — oscB as mod matrix source for audio-rate modulation (ref: ADR 113)
- [ ] **More filter types** — Phaser, vocal resonator, analog-modeled ladder (ref: ADR 113)
- [ ] **Slide/glide parameter** — Explicit per-step slide flag and glide time param, instead of relying solely on auto-legato
- [ ] **Scene stamp sprite sheets** — Replace SVG pictogram stamps with CC0 animated sprite sheets for richer limb animation. Candidate: [rgsdev CC0 stick figure (itch.io)](https://rgsdev.itch.io/animated-stick-figure-character-2d-free-cc0). Use CSS `steps()` + `background-position` for frame-by-frame playback synced to `--beat` (ref: ADR 119)
- [ ] **Amp sim** — Guitar/bass amp modeling as insert FX (preamp + cabinet IR) (ref: ADR 122)
- [ ] **Chorus/phaser/flanger** — Classic modulation effects as insert types (ref: ADR 122)
- [ ] **Per-track EQ** — Parametric EQ as insert FX (currently only master bus) (ref: ADR 122)
- [ ] **Waveshaper** — Custom transfer curve editor for insert distortion (ref: ADR 122)
- [ ] **Fill intensity parameter** — Continuous sweep curve (not toggle) controlling fill density/velocity. Requires extending fill algorithm in worklet to accept intensity 0–1 (ref: ADR 128)

- [ ] **Hardware-feel keyboard shortcuts** — Reinforce the core product goal of turning the browser into an instrument. Make PC keyboard interaction feel like dedicated hardware: dense shortcut map so hands never leave the keyboard for transport, track select, mute/solo, pattern switch, step input, and param tweaks. Inspired by Elektron's muscle-memory workflow and Orca/Tidal's keyboard-native interaction. Needs inventory of current shortcuts, then design pass for gaps
- [ ] **Multi-pattern layering** — Simultaneous playback of multiple patterns. Approach A: merge cells from multiple patterns into one (OR merge for same-track triggers). Approach B: each pattern "owns" specific tracks, layered patterns play their respective tracks concurrently. Would enable drum/bass/melody split across patterns. Major architectural change to engine (currently single-pattern playback via `sendPatternByIndex`). Polyrhythmic potential: patterns with different step counts (16 vs 12) create shifting phase relationships when layered — cycles never repeat the same way. Inspired by Ryuichi Sakamoto's concept of independent simultaneous compositions occupying the same space (related: Cage's chance music). Even outside inboil, the idea of "non-synchronous layered loops with shared timbral space" is worth exploring
