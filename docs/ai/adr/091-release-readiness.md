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
| **Testing** | 129 unit tests + 18 E2E tests, round-trip serialization coverage |

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

#### 1. Error Handling UI

Currently all errors (IndexedDB, AudioContext, MIDI, sample decode) are `console.warn` only. Users see silent failures.

**Required:**
- Toast / banner component for user-facing error messages
- IndexedDB quota exceeded → "Storage full. Export your project to free space."
- AudioContext creation failure → "Audio not available. Check browser permissions."
- Sample decode failure → "Could not load sample: [filename]"
- MIDI device error → "MIDI device disconnected"

**Scope:** ~1 new component (ErrorToast), ~10 `catch` blocks across storage.ts, engine.ts, midiInput.ts

#### 2. Browser Capability Detection

App assumes AudioWorklet + IndexedDB + Web Audio. No fallback if missing.

**Required:**
- On startup, check: `AudioContext`, `AudioWorkletNode`, `indexedDB`
- If missing → show a static fallback page: "inboil requires a modern browser (Chrome 66+, Firefox 76+, Safari 14.1+)"
- Safari-specific: test `AudioWorkletNode` constructor (not just `window.AudioWorklet`)

**Scope:** ~30 lines in App.svelte or a `compat.ts` utility

#### 3. Landing Page & Minimal Tutorial (ADR 072)

First-time users currently land directly in the app with no explanation.

**Required (minimum viable):**
- Landing page: hero + feature list + "Open App" CTA + demo GIF/video
- Getting-started: 3-page tutorial in Starlight docs ("First beat", "Change sounds", "Build a scene")
- In-app: each Help section gets a "→ Docs" link

**See ADR 072 for full spec.** This is the largest P0 item.

#### 4. Explicit Storage Scope Notice

Users may expect cloud sync. Currently local-only (IndexedDB).

**Required:**
- First-launch notice or Help entry: "Your projects are saved locally in this browser. Use Export to back up."
- Sidebar PROJECT section: subtle "(local)" label or tooltip

**Scope:** ~5 lines of UI text

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

- [ ] All P0 items complete
- [ ] No `console.warn` / `console.error` for user-recoverable situations (all surfaced in UI)
- [ ] Landing page live at root URL
- [ ] Getting-started tutorial accessible from LP and in-app Help
- [ ] Tested in Chrome, Firefox, Safari (desktop + mobile)
- [ ] Custom domain active (ADR 072 consideration)

## Considerations

- **Launch as "beta"**: Use "beta" label to set expectations. Removes pressure to have everything polished.
- **Analytics**: Consider privacy-respecting analytics (e.g. Plausible, self-hosted) to understand which features are used and where users drop off. Not a launch blocker.
- **Social sharing (ADR 072 future)**: Video export + OGP preview is probably the strongest organic growth channel — prioritize post-launch.
