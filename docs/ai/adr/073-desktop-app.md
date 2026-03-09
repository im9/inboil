# ADR 073: Desktop App

## Status: Proposed

## Context

inboil currently runs as a web app on Cloudflare Pages. A desktop version would provide:

- Offline usage without a browser
- Native file system access (drag & drop audio files, project export)
- Desktop-grade performance and lower latency audio
- A venue for the donation dialog (ADR 071 — Sublime Text model)
- Distribution via download links on the landing page (ADR 072)

## Decision

### Approach: WebView Wrapper

Use **Tauri** to wrap the existing web app in a native WebView.

- The app is already a fully client-side SPA — no server required
- Tauri bundles are small (~5–10 MB vs Electron's ~100 MB+)
- Rust backend for native APIs (file system, system tray, auto-update)
- Web codebase stays as the single source of truth — no UI fork

### Architecture

```
┌─────────────────────────────────┐
│  Tauri Shell (Rust)             │
│  ┌───────────────────────────┐  │
│  │  WebView                  │  │
│  │  ┌─────────────────────┐  │  │
│  │  │  inboil SPA          │  │  │
│  │  │  (Svelte + WASM)     │  │  │
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
│  Native APIs:                   │
│  • File system (project I/O)    │
│  • Audio (system default)       │
│  • Auto-update (Tauri updater)  │
│  • Donation dialog trigger      │
└─────────────────────────────────┘
```

### Desktop-Specific Features

- **Donation dialog** (ADR 071): periodic gentle prompt, dismiss to close, frequency-controlled
- **Native file dialogs**: save/load projects as `.inboil` files, import audio samples
- **System tray**: minimize to tray for background playback
- **Auto-update**: Tauri's built-in updater for seamless version delivery
- **Menu bar**: standard OS menu (File, Edit, Help) mapped to existing app actions

### What Stays the Same

- All UI rendering — same Svelte components, same CSS
- Audio engine — same AudioWorklet + WASM pipeline (WebView supports Web Audio API)
- State management — same `state.svelte.ts`
- IndexedDB storage — works identically in WebView

### Build & Distribution

- Build: `pnpm tauri build` → platform-specific installers
- Platforms: macOS (.dmg), Windows (.msi / .exe), Linux (.AppImage / .deb)
- Distribution: download links on LP (ADR 072), GitHub Releases
- Code signing: required for macOS (Apple Developer), optional for Windows

### Repository Structure

```
inboil/
├── src/              ← web app (shared)
├── src-tauri/        ← Tauri Rust backend
│   ├── src/
│   │   └── main.rs
│   ├── tauri.conf.json
│   └── Cargo.toml
├── site/             ← LP + docs (ADR 072)
└── package.json
```

## Considerations

- **WebView audio latency**: WebView's Web Audio API may have slightly higher latency than native audio. Acceptable for a groove box; if problematic, Tauri commands can bridge to native audio APIs (CPAL/CoreAudio) in the future
- **Platform testing**: need CI for macOS, Windows, Linux builds. GitHub Actions supports all three
- **Code signing costs**: Apple Developer Program is $99/year. Can distribute unsigned initially with "open anyway" instructions
- **Tauri v2 vs v1**: Tauri v2 has mobile support (iOS/Android) but the mobile story is handled separately in ADR 074 with a native approach

## Future Extensions

- MIDI device support via Tauri's native USB/MIDI access
- VST/AU plugin hosting (long-term, significant effort)
- Multi-window: detach scene view or mixer into separate windows
- Deep OS integration: file type association (`.inboil`), Spotlight/search indexing
