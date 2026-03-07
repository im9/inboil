# inboil

Browser-based groove box / DAW. Svelte 5 + TypeScript + C++ WASM AudioWorklet. Zero npm dependencies.

## Build

```bash
pnpm dev       # Vite dev server
pnpm build     # production build
pnpm check     # svelte-check
pnpm deploy    # build + Cloudflare Pages
```

## Conventions

- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props()`). No stores or legacy `$:`
- Deep copy via `clonePattern()` (`structuredClone` fails on Svelte proxies)
- Undo is snapshot-based: insert `pushUndo(label)` before mutations
- Parameters are normalized (0.0–1.0); denormalized on the DSP side
- Bilingual tooltips (`data-tip` / `data-tip-ja`)
- ADRs are in `docs/ai/adr/` (001–059). Review before implementation
- Docs, code, and commit messages in English (conversation in Japanese is OK)
