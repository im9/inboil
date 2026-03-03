# inboil

ブラウザベースのグルーブボックス / DAW。Svelte 5 + TypeScript + C++ WASM AudioWorklet。npm 依存ゼロ。

## Build

```bash
pnpm dev       # Vite dev server
pnpm build     # production build
pnpm check     # svelte-check
pnpm deploy    # build + Cloudflare Pages
```

## Conventions

- Svelte 5 runes のみ (`$state`, `$derived`, `$effect`, `$props()`)。stores / 旧 `$:` 不使用
- deep copy は `clonePattern()` (`structuredClone` は Svelte proxy で不可)
- undo は snapshot ベース: mutation 先頭に `pushUndo(label)` を挿入
- パラメータは正規化 (0.0–1.0)、DSP 側でデノーマライズ
- 日英二言語 (`data-tip` / `data-tip-ja`)
- ADR は `docs/ai/adr/` に記録 (001–038)。実装前に参照すること
- docs / コード / コミットメッセージは英語で書く (会話は日本語OK)
