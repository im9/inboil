# Technical Backlog

Known improvements that don't require design decisions (no ADR needed).
Items are not prioritized — pick based on what you're already touching.

## Code Organization

- [ ] **Split SceneView.svelte** (~1,370 LOC) — Extract gesture handling, edge drawing, selection logic into composable modules.
- [ ] **Split PianoRoll.svelte** (1,124 LOC) — Extract key column, octave controls, chord shape logic.

## UI

- [x] **Dock panel UX improvements (phase 1)** — Panel widened to 340px, font scale bumped, knobs 32→36px, voice/pool pickers as floating dropdowns, track-bar removed, label visibility improved (0.38→0.55 opacity), group dividers strengthened, preset INIT/SAVE always visible with matched height, olive rgba tokenized. VOICE_LIST reordered (FMDrum last in drum).
- [ ] **Dock panel UX improvements (phase 2)** — Scroll/overflow: param-heavy voices (WT, FM) push SEND/MIX off-screen. Consider: collapsible SEND/MIX section (default closed), compact knob size for sends (28px), sticky section headers, or tabbed param/send/fx sub-views.
- [ ] **Scene toolbar node placement UX** — Adding nodes from the toolbar is not intuitive. Improve discoverability — e.g. clearer affordance, drag-to-place, or contextual hints.
- [ ] **Node function UX** — Function nodes are hard to understand on first use and lack visual feedback/polish. Improve onboarding (hints, animation) and presentation. May overlap with dock panel improvements.

## Ideas

Someday/maybe items — no commitment, just interesting directions.

- [ ] **Particle oscillator** — Granular cloud from wavetable. MONO or low grain count (8–16) to stay within CPU budget (ref: ADR 113)
- [ ] **Wavetable editor** — Draw waveforms on Canvas → 2048 samples → `_bandLimit` → inject into table cache (ref: ADR 113)
- [ ] **User wavetable import** — Load .wav single-cycle files as custom shapes (ref: ADR 113)
- [ ] **Per-oscillator filter** — Filter before osc combine, not just after (ref: ADR 113)
- [ ] **Audio-rate FM mod source** — oscB as mod matrix source for audio-rate modulation (ref: ADR 113)
- [ ] **More filter types** — Phaser, vocal resonator, analog-modeled ladder (ref: ADR 113)
- [ ] **Slide/glide parameter** — Explicit per-step slide flag and glide time param, instead of relying solely on auto-legato
