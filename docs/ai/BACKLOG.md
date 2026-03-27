# Technical Backlog

Known improvements that don't require design decisions (no ADR needed).
Items are not prioritized — pick based on what you're already touching.

## Scaling Concerns

Known architectural limits that are fine at current scale but need attention when expanding.

- [ ] **Undo stack memory** — 50 full song snapshots (~200–400KB each, up to ~20MB). Consider delta snapshots if patterns exceed 100+ or tracks exceed 16
- [ ] **WorkletPattern full serialization** — Every reactive change sends the entire pattern+FX state to the AudioWorklet (~20–40KB). Add change detection or delta messaging if tracks go beyond 16 or steps beyond 64
- [ ] **state.svelte.ts cohesion** — Single 1100+ line reactive state module with 50+ `pushUndo()` call sites across 21 files. Extract action creators or domain-specific mutation modules if mutation surface keeps growing
- [ ] **Scene O(n) traversal** — Node/edge lookups use `.filter()`/`.find()` per operation. Introduce `Map<id, Node/Edge>` index if scenes regularly exceed 50 nodes
- [ ] **Mobile rendering** — StepGrid re-renders all 128 cells on playhead advance. No virtual scrolling for long patterns. Add memo keys or virtual scroll if patterns expand to 64+ steps
- [ ] **P-Lock storage density** — `paramLocks` is unbounded `Record<string, number>` per step. At 64 steps × 24 tracks × 20 params, a single pattern could reach 500KB. Monitor in dogfooding

## Security

Hardening tasks for signaling server (see ADR 019 §Security Hardening for design rationale).

- [x] **Room TTL** — Durable Object alarm() to self-destruct after 1h inactivity
- [x] **IP rate limiting** — 5 failed joins per IP / 10s → temporary block
- [x] **Room code 8-char** — Extend from 6 to 8 characters (30-bit → 40-bit entropy)

## Refactoring

- [x] **VoicePicker shared component** — Extracted to `VoicePicker.svelte` with `variant` prop for dock/mobile styling

## Ideas

Someday/maybe items — no commitment, just interesting directions.

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
- [ ] **Multi-pattern layering** — Simultaneous playback of multiple patterns. Approach A: merge cells from multiple patterns into one (OR merge for same-track triggers). Approach B: each pattern "owns" specific tracks, layered patterns play their respective tracks concurrently. Would enable drum/bass/melody split across patterns. Major architectural change to engine (currently single-pattern playback via `sendPatternByIndex`). Polyrhythmic potential: patterns with different step counts (16 vs 12) create shifting phase relationships when layered — cycles never repeat the same way. Inspired by Ryuichi Sakamoto's concept of independent simultaneous compositions occupying the same space (related: Cage's chance music). Even outside inboil, the idea of "non-synchronous layered loops with shared timbral space" is worth exploring
