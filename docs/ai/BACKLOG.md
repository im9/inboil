# Technical Backlog

Known improvements that don't require design decisions (no ADR needed).
Items are not prioritized — pick based on what you're already touching.

## DSP / Audio

- [ ] **Sampler loop crossfade** — SamplerVoice loop boundary wraps without crossfade, can click on short loops. Add 2ms Hann crossfade at loop point.
- [ ] **FM/WT anti-aliasing** — High-frequency operators (4×, 8× ratio) can exceed Nyquist. Consider PolyBLEP or 2× oversampling on carriers.
- [ ] **Denormal flushing** — No explicit flush-to-zero. Chrome handles via DAZ but Safari may accumulate subnormals in filter feedback paths.

## Code Organization

- [ ] **Split voices.ts** (1,779 LOC) — Extract by category: `drums.ts`, `bass.ts`, `melodic.ts`, `sampler.ts`. Keep `voices.ts` as registry + re-export.
- [ ] **Split SceneView.svelte** (1,465 LOC) — Extract gesture handling, edge drawing, selection logic into composable modules.
- [ ] **Split DockPanel.svelte** (1,240 LOC) — Extract navigator, EQ section, global param tabs into child components.
- [ ] **Split PianoRoll.svelte** (1,124 LOC) — Extract key column, octave controls, chord shape logic.

## Accessibility

- [ ] **`:focus-visible` on all interactive elements** — Currently partial. Add to buttons, chips, toggles.
- [ ] **`aria-pressed` on toggle buttons** — State exists in code but not announced to assistive tech.
- [ ] **Keyboard navigation for StepGrid** — Arrow keys to move between steps, Enter/Space to toggle.

## Cleanup

- [ ] **Archive C++ WASM headers** — `src/dsp/` contains 12 header files + Engine.cpp that are not compiled or used. Move to `src/dsp/_archive/` or delete. If WASM is still planned, note in ADR 001.
