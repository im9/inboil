# inboil

Browser-based groove box / DAW. Svelte 5 + TypeScript AudioWorklet. Zero npm runtime dependencies.

## Setup

```bash
pnpm install
git config core.hooksPath .githooks   # enable pre-push check+test hook
```

## Build & Test

```bash
pnpm dev       # Vite dev server
pnpm dev:jam   # Vite + local signaling server (for jam session testing)
pnpm build     # production build
pnpm check     # svelte-check (strict, 0 errors required — enforced by CI)
pnpm test      # vitest unit tests
pnpm test:e2e  # Playwright (chromium/firefox/webkit)
pnpm deploy          # build + Cloudflare Pages (production)
pnpm deploy:preview  # build + Cloudflare Pages preview (current branch)
```

### Jam Session Local Testing

`pnpm dev:jam` starts both Vite and a local Cloudflare Workers signaling server (`workers/signaling/`). The Vite dev server is configured with `VITE_SIGNALING_URL=ws://localhost:8787/ws` so WebRTC signaling goes through the local server.

1. Stop any running `pnpm dev` first (port 5173 conflict)
2. Run `pnpm dev:jam`
3. Open two browser tabs at `http://localhost:5173`
4. Tab 1: SYSTEM → JAM SESSION → HOST (get room code)
5. Tab 2: SYSTEM → JAM SESSION → enter code → JOIN

## Conventions

- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props()`). No stores or legacy `$:`
- Deep copy via `clonePattern()` (`structuredClone` fails on Svelte proxies)
- Undo is snapshot-based: insert `pushUndo(label)` before mutations
- Parameters are normalized (0.0–1.0); denormalized on the DSP side
- Bilingual tooltips (`data-tip` / `data-tip-ja`)
- Colors: use `--lz-*` tokens (light zone) or `--dz-*` tokens (dark zone), never raw `rgba(30,32,40,*)` or `rgba(237,232,220,*)`
- Accent overlays: use `--olive-*`, `--blue-*`, `--salmon-*`, `--danger-*` tokens from app.css
- Spacing: gap/padding/margin values from {2, 4, 8, 12, 16}px (6, 10 for documented asymmetric padding)
- ADRs in `docs/ai/adr/` — review INDEX.md before implementation
- Technical backlog in `docs/ai/BACKLOG.md` — for items that don't need an ADR
- Docs, code, and commit messages in English (conversation in Japanese is OK)

## Workflow

### Feature development
1. Brainstorm in conversation → `/adr` when design solidifies
2. Add Implementation Checklist to ADR (current phase only)
3. Implement checklist items
4. `/audit-styles` after UI changes
5. `/commit`
6. `/adr-done` only after user confirms phase complete

### Maintenance
- `/refactor` — after a feature lands, not during
- `/check-docs` — before beta release or after large changes
- `/sync-docs` — when check-docs finds drift
- `/simplify` — after PR-sized chunk of work

## Data Validation

- Use `validateSongData()` / `validateRecoverySnapshot()` from `src/lib/validate.ts` when loading Song data from external sources (JSON import, localStorage recovery, IDB)
- Never cast raw JSON to Song directly — always validate first

## Key Architecture

- Track lookups: use `cellForTrack(pat, trackId)` not `cells[index]` (ADR 079)
- Auto-save: debounced 500ms with concurrency guard — do not bypass
- Engine init: local variables committed to `this.*` only after all steps succeed
- `src/lib/constants.ts` has zero imports — safe to use from AudioWorklet scope

## Doc Sync

When changing these source files, review and update the corresponding doc:

| Source file | Doc to update |
|---|---|
| `src/lib/types.ts`, `src/lib/state.svelte.ts`, `src/lib/constants.ts` | `docs/ai/DATA_MODEL.md` |
| `src/lib/audio/dsp/types.ts`, `src/lib/audio/worklet-processor.ts` | `docs/ai/MESSAGE_FLOW.md` |
| `src/lib/sweepRecorder.svelte.ts`, `src/lib/scenePlayback.ts`, `src/lib/sweepEval.ts` | `docs/ai/SWEEP_AUTOMATION.md` |
