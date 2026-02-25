# AI Documentation — Inboil Groovebox

This directory contains specification documents intended to give AI assistants a complete, unambiguous understanding of the project.
The user communicates in Japanese; all specs are written in English.

## Project in One Sentence

A web-based groovebox inspired by Elektron hardware, built with Svelte 5 on the frontend and a C++/WebAssembly DSP core — designed from the start to be portable to iOS and VST plugins.

## Document Map

| File | Purpose |
|---|---|
| [overview.md](./overview.md) | Product vision, goals, non-goals, and constraints |
| [architecture.md](./architecture.md) | Technology stack and layer structure |
| [sequencer-spec.md](./sequencer-spec.md) | Step sequencer behavior and data model |
| [sound-design.md](./sound-design.md) | Sound engine, track types, and effects |
| [ui-design.md](./ui-design.md) | Design system, layout, and component guidelines |
| [wasm-interface.md](./wasm-interface.md) | C++/WASM ↔ Svelte 5 API contract |
| [glossary.md](./glossary.md) | Domain terminology |
| [adr/](./adr/) | Architecture Decision Records |

## How to Read These Docs

1. Start with `overview.md` to understand goals and constraints.
2. Read `architecture.md` to understand the layer boundaries.
3. Refer to `wasm-interface.md` before touching the DSP↔UI boundary.
4. Consult `glossary.md` when encountering ambiguous domain terms.

## Status Legend Used Throughout Docs

- **DECIDED** — Finalized, implement as specified.
- **PROPOSED** — Recommended direction, not yet confirmed by the user.
- **OPEN** — Actively under discussion, do not implement without confirmation.
- **DEFERRED** — Intentionally postponed to a later milestone.
