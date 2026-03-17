# Technical Backlog

Known improvements that don't require design decisions (no ADR needed).
Items are not prioritized — pick based on what you're already touching.

## DSP / Audio

- [x] **Sampler loop crossfade** — 96-sample (~2ms) Hann crossfade at loop boundary in SamplerVoice (forward + reverse).
- [ ] **FM/WT anti-aliasing** — High-frequency operators (4×, 8× ratio) can exceed Nyquist. Consider PolyBLEP or 2× oversampling on carriers.
- [ ] **Glitch-free track add/remove during playback** — Current resize preserves voices but main→worklet async latency causes ~1 step audio gap. Investigate pre-allocating spare voice slots or deferred resize at next cycle boundary.
- [x] **Denormal flushing** — Added `1e-18` DC offset to all biquad filters (ResonantLP, BiquadHP, DJFilter, PeakingEQ, ShelfEQ), reverb (CombFilter, AllpassFilter), and TapeDelay feedback paths.

## Code Organization

- [x] **Split voices.ts** (1,991 LOC) — Extract by category: `drums.ts`, `bass.ts`, `melodic.ts`, `sampler.ts`. Keep `voices.ts` as registry + re-export.
- [ ] **Split SceneView.svelte** (1,465 LOC) — Extract gesture handling, edge drawing, selection logic into composable modules.
- [ ] **Split DockPanel.svelte** (1,240 LOC) — Extract navigator, EQ section, global param tabs into child components.
- [ ] **Split PianoRoll.svelte** (1,124 LOC) — Extract key column, octave controls, chord shape logic.

## Accessibility

- [ ] **`:focus-visible` on all interactive elements** — Currently partial. Add to buttons, chips, toggles.
- [ ] **`aria-pressed` on toggle buttons** — State exists in code but not announced to assistive tech.
- [ ] **Keyboard navigation for StepGrid** — Arrow keys to move between steps, Enter/Space to toggle.

## Cleanup

- [ ] **Archive C++ WASM headers** — `src/dsp/` contains 12 header files + Engine.cpp that are not compiled or used. Move to `src/dsp/_archive/` or delete. If WASM is still planned, note in ADR 001.
