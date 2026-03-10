# ADR 073: Desktop App

## Status: Proposed (Phase 1 — Tauri shell, macOS — implemented)

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

## Phase 2: Distribution & Auto-Update

### Release Workflow

```
git tag v0.0.2
  → GitHub Actions triggers
  → cargo tauri build (macOS arm64 + x86_64)
  → .dmg + update bundle uploaded to GitHub Releases
  → latest.json updated automatically
```

### GitHub Actions CI

- Trigger: push tag `v*`
- Runner: `macos-latest` (macOS only for now; Win/Linux when test environments available)
- Steps: checkout → setup Rust → setup pnpm → `pnpm install` → `cargo tauri build`
- Artifacts: `.dmg` installer + `.tar.gz` update bundle → GitHub Releases
- Universal binary: build both `aarch64-apple-darwin` and `x86_64-apple-darwin`

### Auto-Update (`tauri-plugin-updater`)

- Check GitHub Releases endpoint on app launch (non-blocking)
- Tauri generates signing key pair (`tauri signer generate`); public key in `tauri.conf.json`
- Update bundles are signed; app verifies signature before applying
- User sees a non-intrusive notification ("Update available") — not forced
- Fallback: manual download from GitHub Releases page

### Code Signing

- **Phase 2a (initial)**: unsigned — macOS Gatekeeper shows "open anyway" dialog
  - Users right-click → Open, or `xattr -d com.apple.quarantine inboil.app`
- **Phase 2b (future)**: Apple Developer ($99/year) for notarization
  - `APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD` as GitHub Actions secrets
  - Tauri's built-in notarization support via `tauri.conf.json` → `bundle.macOS.signing`

### Versioning

- Single source of truth: `tauri.conf.json` → `version`
- `package.json` version kept in sync manually (or via CI script)
- Semver: bump patch for fixes, minor for features, major for breaking changes

## Future Extensions

- MIDI device support via Tauri's native USB/MIDI access
- VST/AU plugin hosting (long-term, significant effort)
- Multi-window: detach scene view or mixer into separate windows
- Deep OS integration: file type association (`.inboil`), Spotlight/search indexing
- Windows / Linux builds when test environments become available
