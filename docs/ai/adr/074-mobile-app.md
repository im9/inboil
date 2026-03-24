# ADR 074: Mobile App (iOS Native)

## Status: Proposed

## Context

The web app works on mobile browsers but is not optimized for touch-first interaction. A dedicated iOS app would provide:

- Native touch experience designed for small screens
- Core Audio for low-latency, reliable audio playback
- App Store distribution and discoverability
- Offline-first with no browser overhead

Unlike the desktop app (ADR 073) which wraps the web app in a WebView, the mobile app requires a fundamentally different UI due to screen size constraints. Only the DSP layer is portable.

## Decision

### Approach: Native iOS with DSP Port

Build a **native iOS app (Swift/SwiftUI)** with the C++ DSP engine ported to Core Audio.

```
┌─────────────────────────────────┐
│  iOS App (Swift / SwiftUI)      │
│  ┌───────────────────────────┐  │
│  │  UI Layer                 │  │
│  │  SwiftUI views            │  │
│  │  (designed for mobile)    │  │
│  └───────────┬───────────────┘  │
│              │ C interop        │
│  ┌───────────▼───────────────┐  │
│  │  DSP Engine (C++)         │  │
│  │  Ported from WASM         │  │
│  │  → Core Audio render      │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Phase 1: DSP Port

Port the existing C++ DSP code from WebAssembly to Core Audio.

- Current: C++ → Emscripten → WASM → AudioWorklet
- Target: C++ → Xcode build → AUAudioUnit render callback
- The C++ core (`worklet-processor` logic) is platform-agnostic — only the I/O binding changes
- Voices, effects, and sequencer logic remain identical

**Key changes:**
- Replace Emscripten bindings with C function exports callable from Swift
- Replace AudioWorklet message passing with Core Audio render callbacks
- Sample rate: match device default (typically 44.1kHz or 48kHz)
- Buffer size: target 128–256 frames for low latency

### Phase 2: UI Design (Separate Investigation)

Mobile UI requires a fresh design — the desktop layout does not translate to 4–6" screens.

**Open questions to explore:**
- How to fit 8+ tracks × 16+ steps on a phone screen
- Gesture vocabulary: swipe, pinch, long-press vs tap
- Navigation model: tab bar, swipe between views, or modal sheets
- Scene interaction on small screens
- Portrait vs landscape orientation

**Possible directions:**
- Single-track focus view with horizontal swipe between tracks
- Simplified scene view (list-based instead of node graph)
- Bottom sheet for voice/FX editing
- Landscape mode for full grid view

This phase is exploratory — a separate ADR will be created once the UI direction is established.

### What Is Shared

| Layer | Web / Desktop | iOS |
|-------|--------------|-----|
| DSP (C++) | WASM AudioWorklet | Core Audio AUAudioUnit |
| Sequencer logic | TypeScript (state.svelte.ts) | Swift (rewrite) |
| UI | Svelte | SwiftUI (new design) |
| Storage | IndexedDB | Core Data / files |
| State management | Svelte runes | SwiftUI @Observable |

Only the C++ DSP engine is directly portable. Sequencer logic (pattern/track/trig data model) will be reimplemented in Swift, keeping the same data structures.

### Project File Compatibility

- Define a portable `.inboil` project format (JSON + audio samples)
- Shared between web, desktop, and iOS versions
- Import/export via iCloud Drive, AirDrop, or file sharing

## Considerations

- **Effort**: a native iOS app is a substantial project — essentially a new frontend. Phase 1 (DSP port) is manageable; Phase 2 (UI) is the bulk of the work
- **Android**: not in scope for now. If pursued later, Kotlin + same C++ DSP via JNI/NDK
- **AUv3 plugin**: the Core Audio DSP engine could also be packaged as an AUv3 instrument plugin for use in GarageBand, AUM, etc. — significant added value on iOS
- **App Store costs**: Apple Developer Program $99/year (shared with desktop code signing)
- **Monetization**: App Store allows paid apps or IAP, which may be simpler than the donation model

## Future Extensions

- AUv3 instrument plugin (use inboil as a plugin in other iOS DAWs)
- Android version via Kotlin + C++ NDK
- Apple Watch companion (transport controls, BPM tap)
- Inter-app audio / Audiobus support
- iCloud sync for projects across devices
