# AI Documentation — Inboil Groovebox

This directory contains specification documents intended to give AI assistants a complete, unambiguous understanding of the project.
The user communicates in Japanese; all specs are written in English.

## Project in One Sentence

A web-based groovebox inspired by Elektron hardware and OP-XY, built with Svelte 5 on the frontend and TypeScript AudioWorklet DSP.

## Document Map

| File | Purpose |
|---|---|
| [overview.md](./overview.md) | Product vision, goals, non-goals, and constraints |
| [architecture.md](./architecture.md) | Technology stack, layer structure, state flow |
| [sequencer-spec.md](./sequencer-spec.md) | Step sequencer behavior, data model, pattern bank |
| [sound-design.md](./sound-design.md) | Synth voices, effects chain, performance features |
| [ui-design.md](./ui-design.md) | Design system, color palette, components, animations |
| [audio-interface.md](./audio-interface.md) | AudioWorklet ↔ Svelte 5 API contract (MessagePort) |
| [glossary.md](./glossary.md) | Domain terminology |
| [adr/](./adr/) | Architecture Decision Records |

### Architecture Decision Records

| ADR | Decision |
|---|---|
| [001-wasm-dsp.md](./adr/001-wasm-dsp.md) | C++/WASM as long-term DSP target |
| [002-ts-worklet.md](./adr/002-ts-worklet.md) | TypeScript AudioWorklet as current runtime |
| [003-bpm-synced-delay.md](./adr/003-bpm-synced-delay.md) | Delay time stored as beat fraction |
| [004-queued-pattern-switch.md](./adr/004-queued-pattern-switch.md) | Pattern changes queue to loop boundary |

### Deprecated Files

| File | Replaced by |
|---|---|
| [wasm-interface.md](./wasm-interface.md) | [audio-interface.md](./audio-interface.md) — SharedArrayBuffer spec replaced with MessagePort-based interface |

## How to Read These Docs

1. Start with `overview.md` to understand goals and constraints.
2. Read `architecture.md` to understand the layer boundaries and state flow.
3. Refer to `audio-interface.md` before touching the DSP ↔ UI boundary.
4. Consult `glossary.md` when encountering ambiguous domain terms.

## Status Legend Used Throughout Docs

- **DECIDED** — Finalized, implement as specified.
- **PROPOSED** — Recommended direction, not yet confirmed by the user.
- **OPEN** — Actively under discussion, do not implement without confirmation.
- **DEFERRED** — Intentionally postponed to a later milestone.
