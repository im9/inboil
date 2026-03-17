# Technical Backlog

Known improvements that don't require design decisions (no ADR needed).
Items are not prioritized — pick based on what you're already touching.

## DSP / Audio

- [ ] **FM/WT anti-aliasing** — High-frequency operators (4×, 8× ratio) can exceed Nyquist. Consider PolyBLEP or 2× oversampling on carriers.

## Code Organization

- [ ] **Split SceneView.svelte** (1,465 LOC) — Extract gesture handling, edge drawing, selection logic into composable modules.
- [ ] **Split PianoRoll.svelte** (1,124 LOC) — Extract key column, octave controls, chord shape logic.


