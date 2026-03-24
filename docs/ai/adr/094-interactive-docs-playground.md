# ADR 094: Interactive Docs & Playground

## Status: Proposed

## Context

ADR 072 (LP, Docs & Tutorial) covered the full scope from landing page to interactive docs playground. Phase 1 (LP + static docs) and Phase 2 (embedded Svelte components in docs) are now complete. The remaining items — tutorial JSON snapshots, full playground sandbox, and in-app onboarding — are independent features that warrant their own ADR.

This ADR captures the work split out from ADR 072 Phase 2 (remaining) and Phase 3.

## Decision

### 1. Tutorial Step Snapshots (from ADR 072 Phase 2)

Each tutorial step provides a JSON snapshot (ADR 020 export format) that users can copy-paste into the real app to follow along.

- Tutorial pages include a "Copy to clipboard" button with the JSON state
- JSON matches the app's import format so users can paste directly
- Snapshots are minimal (1 pattern, few tracks) to keep payload small

### 2. Function Node Playground (from ADR 072 Phase 3)

A live sandbox in docs where users can experiment with scene features:

- SceneCanvas + DockDecoratorEditor embedded in docs pages
- Lightweight `PlaygroundState` context (1-pattern, few-track sandbox with audio)
- Props-only mode or mini-state injection — cannot depend on app's global state
- Copy-paste from playground to app via ADR 020 JSON export

### 3. In-App Onboarding (from ADR 072 Phase 3)

- First-launch onboarding banner ("New here? Try the tutorial →")
- Contextual feature hints: one-time tooltips linking to relevant docs pages when users first encounter complex features (e.g. adding a function node)
- Help sidebar: permanent "Full Tutorial →" link at the top

## Considerations

- **PlaygroundState isolation** is the main technical cost — interactive embeds cannot depend on `song`, `ui`, `playback` global state. Options: (a) props-only mode on existing components, (b) lightweight context providing a 1-pattern sandbox
- **Onboarding fatigue** — hints should be one-time and dismissible, never blocking
- **Maintenance** — JSON snapshots must be updated when the export format changes

## Phases

### Phase 1 — Tutorial JSON Snapshots
- [ ] Define snapshot format (minimal ADR 020 JSON subset)
- [ ] Add "Copy JSON" buttons to getting-started tutorial pages
- [ ] Verify import works in app

### Phase 2 — Playground Sandbox
- [ ] PlaygroundState context (1-pattern sandbox with audio)
- [ ] SceneCanvas + DockDecoratorEditor embedded in docs
- [ ] Copy-paste from playground to app

### Phase 3 — In-App Onboarding
- [ ] First-launch banner in app
- [ ] Contextual feature hints (one-time tooltips → docs links)
