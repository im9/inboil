# inboil v1 — Mobile-First Generative DAW Redesign

This folder holds the architecture and design work for **inboil v1.0** — the
shift from "browser groove box (beta)" to "mobile-first generative DAW (paid
release)".

The redesign starts from [ADR 133: Instrument-Pattern Decoupling](../adr/133-instrument-pattern-decoupling.md):
promote instruments to first-class scene nodes and decouple voice from pattern.
The data model change unlocks polymetric arrangement, pattern reuse across
instruments, generative-as-pattern-source, and — crucially — a mobile primary
surface that isn't a degraded version of the desktop step grid.

## Status: Exploring

Not committed to implementation. The redesign is a counter-proposal to the
previously planned focus shift toward iDEATH/VST work; whether to adopt v1 is a
roadmap decision separate from the design's correctness.

## Current artifacts

- [vision.md](vision.md) — Product direction, target audience, success criteria
- [mobile.md](mobile.md) — Mobile primary surface design, UX principles, touch-native scene canvas
- [ADR 133: Instrument-Pattern Decoupling](../adr/133-instrument-pattern-decoupling.md) — Proposed (core data model)

## Planned documents

| Doc | Purpose |
|---|---|
| `architecture.md` | New data model in full (Pattern, Instrument, Scene graph), beyond ADR 133's decision scope |
| `migration.md` | Save data backward compat strategy, beta-to-v1 migration sequencing |
| `desktop.md` | Desktop implications (mixer view, modular patch editor, fallback for non-mobile flows) |
| `roadmap.md` | Phasing, dependencies, milestones, mockups checklist |
| `mockups/` | Static HTML/CSS UI mockups for visual iteration |

Sub-decisions stay in ADR form (numbered, indexed in [`../adr/INDEX.md`](../adr/INDEX.md))
and are cross-linked here as they land.

## Out of scope for v1

- Native iOS app ([ADR 074](../adr/074-mobile-app.md)) — separate track
- Tauri desktop shell ([ADR 073](../adr/073-desktop-app.md)) — separate track
- VST / iDEATH — separate products

## Why this folder, not just ADRs

ADRs capture single design decisions. v1 is a coordinated product redesign: the
core data model change ripples into mobile UI, desktop UI, migration, save
format, generative engine internals, and the roadmap. Individual sub-decisions
stay in ADR form; the connective tissue — vision, full data model, migration
strategy, phased rollout — lives here.
