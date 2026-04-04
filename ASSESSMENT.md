# inboil Quality Assessment

Last updated: 2026-04-04

This document summarizes quality findings from a review of the current codebase.
The assessment is based on local code inspection plus the results of `pnpm test` and `pnpm check`.

## Overall

- `pnpm test`: 29 files, 644 tests passed
- `pnpm check`: 0 errors, 0 warnings
- Passing tests and static checks does not mean there are no quality weaknesses
- The current codebase is held together well by test density, but several design boundaries and safety rails are still weak

## High Priority

### 1. `audioPool` dedupe can collide on different files

- Target: [src/lib/audioPool.ts](src/lib/audioPool.ts)
- Relevant area: `contentHash()`
- Current behavior: computes SHA-256 from only the first 64KB plus file size
- Problem: two distinct files with the same prefix and size can be treated as the same sample
- Impact: incorrect dedupe in the sample library can lead to data corruption or unexpected sample references
- Suggested action:
  - Prefer full-file hashing
  - If full hashing is too expensive, use a much lower-collision scheme such as head + tail + size
  - Add tests that cover realistic collision scenarios

### 2. Project reset clears all `localStorage`

- Target: [src/lib/state.svelte.ts](src/lib/state.svelte.ts)
- Relevant area: `localStorage.clear()`
- Problem: this removes unrelated data for the same origin, not just inboil-owned keys
- Impact:
  - Future app/site coexistence on the same origin can cause accidental data loss
  - The reset action has broader side effects than its name suggests
- Suggested action:
  - Remove only explicitly owned keys
  - Centralize persistent key names in one place and delete from that allowlist

### 3. Guest-side JSON Patch application lacks value validation

- Target: [src/lib/multiDevice/guestHandler.ts](src/lib/multiDevice/guestHandler.ts)
- Relevant area: `applyJsonPatch()`
- Current behavior: blocks dangerous keys and validates path existence, but does not validate the shape of `patch.value`
- Problem: protocol drift or a host-side bug can push invalid state directly into the guest
- Impact:
  - guest UI corruption
  - invalid local state
  - harder-to-debug sync failures
- Suggested action:
  - restrict writable patch paths and expected value types
  - add a decode/validation layer for snapshot and delta messages
  - add tests for contract violations

## Medium Priority

### 4. `state.svelte.ts` still carries too much responsibility

- Target: [src/lib/state.svelte.ts](src/lib/state.svelte.ts)
- Current scope includes:
  - undo / redo
  - autosave
  - `localStorage` restore
  - preferences persistence
  - reset flow
  - exported runtime state
- Important Svelte-specific constraint:
  - this project uses Svelte 5 runes and shared `$state` from `.svelte.ts` modules
  - in that model, exported shared state naturally tends toward stable object singletons that are mutated in place rather than frequently reassigned
  - that part is not inherently a design mistake
- Problem: file splitting has improved, but the responsibility surface is still broad
- Impact:
  - wider regression risk on edits
  - higher reading and change cost
  - state transition ownership remains blurry
- Suggested action:
  - keep the current shared-state model if it is serving the reactive architecture well
  - split persistence, prefs, undo, and runtime state further without changing the exported state contracts
  - move initialization side effects out of module top level where possible
  - prefer behavior-preserving extraction into `.svelte.ts` domain modules over state model replacement

### 5. Development quality gates are thin

- Target: [package.json](package.json)
- Current state:
  - `test` and `check` exist
  - no `lint` script
  - no ESLint config or CI config was found in the repo
- Problem:
  - `any`
  - `eslint-disable`
  - loosely typed shortcuts
  are not being continuously constrained
- Impact: code quality drift becomes review-dependent
- Suggested action:
  - add ESLint
  - make `check`, `test`, and `lint` required in CI
  - adopt stricter rules gradually if needed

### 6. Profiling log flush drops data on failure

- Target: [src/lib/transitionProfile.ts](src/lib/transitionProfile.ts)
- Relevant area: `flushLog()`
- Current behavior: fires `fetch('/api/log')` and clears the buffer immediately without failure handling
- Problem: observability code silently drops logs when the write fails
- Impact: profiling output becomes less trustworthy
- Suggested action:
  - clear the buffer only on success
  - add `catch` handling and optionally retry or log failure explicitly

## Medium / Long-Term

### 7. Several components are still very large

- Examples:
  - [src/lib/components/SceneView.svelte](src/lib/components/SceneView.svelte)
  - [src/lib/components/SweepCanvas.svelte](src/lib/components/SweepCanvas.svelte)
  - [src/lib/components/StepGrid.svelte](src/lib/components/StepGrid.svelte)
  - [src/lib/components/PianoRoll.svelte](src/lib/components/PianoRoll.svelte)
- Important Svelte-specific constraint:
  - in Svelte, large components can arise naturally when template, event handling, and local reactive orchestration all need to stay in one compile unit
  - this is especially true when `$effect` dependencies, bindings, and direct state mutations are tightly coupled to a specific view
  - large size alone is not automatically a code smell
- Problem: UI, input handling, rendering, and state mutation remain tightly coupled beyond what seems strictly necessary
- Impact:
  - edits are harder to reason about
  - localized tests are harder to write
  - design safety is weaker, so changes rely more on attention and regression coverage
- Suggested action:
  - keep extracting pure functions
  - separate input control, rendering, and state changes where that can be done without weakening Svelte's reactive correctness
  - prioritize responsibility reduction over abstract “reusability” when splitting large files
  - avoid forced decomposition of logic that is genuinely coupled by lifecycle or dependency tracking

### 7a. Some current size appears to come from Svelte 5 reactive mechanics, but not all of it

- Relevant references:
  - [src/App.svelte](src/App.svelte)
  - [src/lib/state.svelte.ts](src/lib/state.svelte.ts)
- Findings:
  - Svelte 5 explicitly supports shared reactive state via `.svelte.ts` modules, which makes module-level state objects a normal pattern rather than an anti-pattern by itself
  - shared `$state` also encourages stable-object, mutate-in-place usage because exported reassigned state is constrained by the compiler model
  - `$effect` tracks synchronous reads, which can encourage orchestration code to stay close to the view or integration point that owns those dependencies
- Practical conclusion:
  - the existence of centralized state modules and some large orchestration components is partially explained by framework mechanics
  - however, the current degree of concentration in `App.svelte` and `state.svelte.ts` still exceeds what appears strictly necessary
- Low-risk direction:
  - preserve current state shape and behavior
  - extract behavior around the edges first: persistence, autosave, engine sync, multi-device sync, and pure computation helpers
  - avoid rewrites that replace the reactive model just to reduce file size

## UI / UX

### 8. Header density is high and primary actions compete with status noise

- Target: [src/lib/components/AppHeader.svelte](src/lib/components/AppHeader.svelte)
- Current layout includes:
  - logo
  - session state
  - CPU meter
  - BPM
  - transport
  - REC
  - view tabs
  - performance controls
- Problem:
  - primary actions such as play, tempo, and current mode compete visually with secondary status and auxiliary controls
  - first-time users have to work to understand what to touch first
- Impact:
  - higher learning cost
  - more visual scanning, especially on narrow layouts
- Suggested action:
  - keep transport, tempo, and current mode in a clear first layer
  - demote CPU/session status into a secondary layer
  - separate always-visible controls from mode-specific controls

### 9. Top-level navigation mixes different conceptual layers

- Targets:
  - [src/lib/components/AppHeader.svelte](src/lib/components/AppHeader.svelte)
  - [src/App.svelte](src/App.svelte)
- Current labels: `SCENE / FX / EQ / MST / PERF`
- Problem:
  - `SCENE` is the primary composition/playback canvas
  - `FX / EQ / MST` are processing or editing views
  - `PERF` is a performance layer
  These are not the same conceptual level
- Impact:
  - information architecture is harder to parse
  - users get weaker cues about what level of the app they are currently in
- Suggested action:
  - keep Scene as the primary mode
  - restructure editing views as subordinate layers rather than equal siblings

### 10. First-run flow is clean but does not strongly activate the core value quickly

- Target: [src/lib/components/WelcomeOverlay.svelte](src/lib/components/WelcomeOverlay.svelte)
- Current behavior: offers `Load Demo`, `Start Empty`, and a tutorial link
- Problem:
  - the first 30 seconds do not strongly guide the user toward the most satisfying interaction loop
  - after demo load, the next best action is still largely implicit
- Impact:
  - weaker activation
  - feature complexity can arrive before delight does
- Suggested action:
  - add a short guided flow after demo load
  - explicitly guide users through play, touch a node, and touch FX

### 11. In-app Help is information-rich but heavy as a discovery tool

- Target: [src/lib/components/SidebarHelp.svelte](src/lib/components/SidebarHelp.svelte)
- Current behavior:
  - has category grouping
  - section bodies are dense and often mix shortcuts, concepts, and feature inventory
- Problem:
  - it reads more like feature reference than task-oriented help
  - it is weakly connected to the screen the user is currently on
- Impact:
  - users open Help but still need to translate the content into immediate action
- Suggested action:
  - add more context-sensitive help tied to the current view
  - separate FAQ, concepts, shortcuts, and action guidance
  - avoid mixing beginner and advanced information too aggressively

### 12. The interaction model still assumes hardware-native mental models

- Targets:
  - [src/lib/components/AppHeader.svelte](src/lib/components/AppHeader.svelte)
  - [src/lib/components/PatternToolbar.svelte](src/lib/components/PatternToolbar.svelte)
  - [src/lib/components/StepGrid.svelte](src/lib/components/StepGrid.svelte)
  - [src/lib/components/TrackerView.svelte](src/lib/components/TrackerView.svelte)
- Current behavior:
  - abbreviations
  - mode switches
  - long-press interactions
  - layered controls
  are used broadly
- Problem:
  - this is efficient for users familiar with groovebox/tracker conventions
  - it is less discoverable for users without that background
- Impact:
  - capability exists but is harder to reach
  - the app can feel harder than it needs to on first contact
- Suggested action:
  - reduce abbreviation load where possible
  - provide alternatives for long-press-only actions
  - make mode differences more explicit in the UI

### 13. There is some mismatch between marketing promise and app first-run feel

- Targets:
  - [site/src/pages/index.astro](site/src/pages/index.astro)
  - [src/lib/components/WelcomeOverlay.svelte](src/lib/components/WelcomeOverlay.svelte)
- Current behavior:
  - the site strongly sells “browser-native instrument”
  - the app’s first-run flow feels more like entering a capable tool than an immediate instrument experience
- Problem:
  - the brand message is emotionally strong
  - the app’s first interaction is comparatively static
- Impact:
  - user expectations set by the landing page can outrun the first-use experience
- Suggested action:
  - bring the landing page’s experiential promise into the app opening sequence
  - bias the first moments toward sound, motion, and satisfying interaction

## Product Design

### 14. Feature growth has outpaced surface simplification

- Targets:
  - [src/App.svelte](src/App.svelte)
  - [src/lib/components/DockPanel.svelte](src/lib/components/DockPanel.svelte)
  - [src/lib/components/PatternToolbar.svelte](src/lib/components/PatternToolbar.svelte)
- Current state: scene, generators, sweep, performance, multi-device, sampler, export, and more are all present
- Problem:
  - capability growth is strong
  - but the product surface still tends to accumulate features faster than it simplifies exposure
- Impact:
  - the app is powerful, but its identity as a coherent instrument becomes less sharp
- Suggested action:
  - backlog explicit hide/merge/remove work, not just feature addition
  - redesign exposure across three layers: first-time, habitual, advanced

## Notes

- The backlog already shows awareness of performance, scaling, and tooling risks
- The findings here focus on issues most likely to affect reliability, maintainability, and product clarity
- The highest-value short-term fixes are:
  - improve `audioPool` dedupe
  - remove `localStorage.clear()`
  - add validation to guest patch application
- The highest-value experience improvements are:
  - reduce header density
  - clarify navigation hierarchy
  - strengthen the guided first-run flow
