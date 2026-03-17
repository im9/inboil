# ADR 091: Release Readiness Assessment & Pre-Launch Checklist

## Status: Proposed

## Context

As of 2026-03-12, the core feature set is mature (67 ADRs implemented). However, development has been feature-focused — error handling, browser compatibility, and onboarding have been deferred. This ADR captures an objective assessment and a prioritized checklist for public beta launch.

## Feature Assessment

### Strengths (Ready for Release)

| Category | Detail |
|----------|--------|
| **Instruments** | 19 voices: 11 drum, 4 synth (Bass303, Moog, FM, WT), sampler (chop/stretch) |
| **Sequencer** | Polymetric (1–64 steps/track), p-locks, chance, velocity, slide, piano roll, chord brush |
| **Scene Graph** | Node-based arrangement with generative nodes (Turing/Quantizer/Tonnetz) + decorators — unique differentiator |
| **Effects** | Full chain: reverb/delay/glitch/granular (3 flavours each), 3-band EQ, compressor, sidechain ducker, per-track insert FX |
| **Performance** | KEY/OCT/FILL/REV/BRK, FX pad XY, swing, arpeggiator |
| **I/O** | MIDI hardware input (USB+BLE), WAV recording, MIDI export, JSON project export/import |
| **Size** | Zero npm dependencies, ~130KB gzip — exceptional for this feature set |
| **UI** | Responsive (desktop/tablet/mobile), bilingual (EN/JA), 39 components, micro-interactions |
| **Testing** | 138 unit tests + 18 E2E tests, round-trip serialization coverage |

### Competitive Position

| App | Comparison |
|-----|-----------|
| Roland Aira Compact | Similar sequencing depth, but inboil has scene graph + generative |
| Ableton Note (Web) | Simpler sequencer, better onboarding — inboil wins on depth |
| Strudel | Code-based (different audience), no visual sequencer |
| Elektron Digitakt | Closest in sequencer philosophy (p-locks, chance), but inboil adds scene graph |

**Unique axis: scene graph + generative nodes. No direct competitor combines visual node arrangement with step-sequencing at this depth.**

## Decision: Pre-Launch Checklist

### P0 — Must Do (Blocks Launch)

#### 1. ~~Error Handling UI~~ ✅ Done (2026-03-12, upgraded 2026-03-17)

**Two-tier system:**

| Level | Component | Behavior | Use |
|-------|-----------|----------|-----|
| warn/info | `ErrorToast` + `showToast()` | Auto-dismiss 5s | Non-critical (sample decode, pool, MIDI) |
| fatal | `ErrorDialog` + `showFatalError(code)` | Modal, user must dismiss | Engine init, auto-save, unhandled errors |

**Error code registry** (`src/lib/fatalError.svelte.ts`): Each fatal error has a unique code (e.g. `AUD-001`, `STG-002`, `DAT-001`) with bilingual messages and optional action (reload / export). Dialog shows code, message, copy-detail button for bug reports.

**Global boundary** (`src/main.ts`): `unhandledrejection` + `error` events caught and shown as `UNK-001`.

- `src/lib/toast.svelte.ts` — toast store (warn/info)
- `src/lib/components/ErrorToast.svelte` — toast component (5s auto-dismiss)
- `src/lib/fatalError.svelte.ts` — fatal error store + code registry
- `src/lib/components/ErrorDialog.svelte` — modal dialog (persistent until dismissed)
- Catch blocks in `engine.ts` (`AUD-001`), `state.svelte.ts` (`DAT-002`), global (`UNK-001`)

#### 2. ~~Browser Capability Detection~~ ✅ Done (2026-03-12)

`src/lib/compat.ts` checks AudioContext, AudioWorkletNode, indexedDB (including Safari constructor check). `main.ts` shows fallback page on failure; App is lazy-loaded via dynamic import so unsupported browsers never download the app bundle.

#### 3. ~~Landing Page & Minimal Tutorial (ADR 072)~~ ✅ Done

ADR 072 Implemented. LP with interactive demos (step sequencer, voice engine viewer, scene graph, FX pad), specs section, bilingual i18n. Starlight docs with getting-started tutorial. In-app Help → Docs links wired.

#### 4. ~~Explicit Storage Scope Notice~~ ✅ Done (2026-03-12)

- Help PROJECTS section: ⚠ local storage warning (EN/JA) as first line
- Sidebar PROJECTS list: `(local)` badge with bilingual tooltip

### P1 — Should Do (First Week Post-Launch)

| Item | Rationale | Scope |
|------|-----------|-------|
| PWA manifest + service worker | Offline re-access, "Add to Home Screen" | Small |
| Safari audio unlock | iOS requires user gesture before AudioContext.resume() | Small |
| Donate button (ADR 071) | Revenue for sustainability | Small |
| Loading indicator | Pattern/sample load can lag on slow devices | Small |
| Focus trap for overlay sheets | Accessibility: Tab key escapes sheet modals | Small |

### P2 — Nice to Have (v1.1+)

| Item | ADR | Rationale |
|------|-----|-----------|
| MIDI Learn & Pitch Bend | 083 | Hardware controller integration |
| MIDI Step & Live Record | 084 | Step input from MIDI keyboard |
| Looper / Tape Node | 087 | OP-1-style overdub loop |
| Worklet Generative | 090 | Move generative to audio thread |
| Cloud backup (Dropbox/GDrive) | 020 | Cross-device persistence |
| Desktop app Phase 2 | 073 | CI, auto-update, code signing |
| iOS native app | 074 | Long-term |

### Defer Indefinitely

| Item | ADR | Reason |
|------|-----|--------|
| C++ WASM DSP | 001 | TS worklet performs well; only needed for iOS/VST port |
| VST Plugin | 016 | Requires WASM DSP (001) first |
| Multi-device collab | 019 | Premature; focus on single-user experience |

## Browser Support Targets

| Browser | Min Version | AudioWorklet | Notes |
|---------|-------------|-------------|-------|
| Chrome | 66+ | ✅ | Primary target |
| Firefox | 76+ | ✅ | |
| Safari | 14.1+ | ✅ | Requires user-gesture audio unlock |
| Mobile Chrome | 66+ | ✅ | |
| Mobile Safari | 14.5+ | ⚠️ | AudioWorklet support varies; test thoroughly |

## Success Criteria for Launch

- [x] All P0 items complete
- [x] No `console.warn` / `console.error` for user-recoverable situations (all surfaced in UI)
- [x] Landing page live at root URL
- [x] Getting-started tutorial accessible from LP and in-app Help
- [x] Tested in Chrome, Firefox, Safari (desktop + mobile)
- [ ] Custom domain active (ADR 072 consideration)

## Considerations

- **Launch as "beta"**: Use "beta" label to set expectations. Removes pressure to have everything polished.
- **Analytics**: Consider privacy-respecting analytics (e.g. Plausible, self-hosted) to understand which features are used and where users drop off. Not a launch blocker.
- **Social sharing (ADR 072 future)**: Video export + OGP preview is probably the strongest organic growth channel — prioritize post-launch.
