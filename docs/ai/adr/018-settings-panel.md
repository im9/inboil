# ADR 018: Settings Panel (SYSTEM)

## Status: Superseded by ADR 036

## Context

inboil has no user-configurable settings. Behaviors like scale mode, language, and audio preferences are hardcoded. As the app grows, users need control over global behavior — without adding complexity to the main performance UI.

### Naming: SYSTEM vs CONFIG

**SYSTEM** is preferred:
- Matches the hardware-instrument aesthetic (Elektron "SYSTEM", Roland "SYSTEM SETUP")
- Shorter, fits the uppercase label style used throughout (BPM, PAT, VEL, RAND)
- "Config" feels more like developer tooling

## Design

### A. Trigger

A `⚙` (gear) button in AppHeader top-right, replacing the `.geo-rects` decoration:

```
┌─────────────────────────────────────────────── [⚙] ─┐
│  BPM  ▶ ■  RAND              PAT ◀ 00 | PATTERN ▶  │
├─────────────────────────────────────────────────────┤
│  StepGrid                                            │
├─────────────────────────────────────────────── [?] ──┤
│  ParamPanel                                          │
└──────────────────────────────────────────────────────┘
```

- `⚙` lives with global controls (BPM, Transport, Pattern) — SYSTEM is a global concern
- `?` help is in ParamPanel bottom-right (see ADR 017)
- Clicking `⚙` sets `ui.sidebar = 'system'`, opening the shared sidebar (same slot as help)

### B. Settings Sidebar Layout

Uses the same `Sidebar.svelte` component as help (ADR 017). Content is rendered inline when `visibleMode === 'system'`:

```
┌──────────────────────────────────────────────── [⚙] ────┐
│ AppHeader                                                │
├──────────────────────────────────────┬───────────────────┤
│                                      │  SYSTEM       [✕] │
│  StepGrid                            │                   │
│                                      │  SCALE MODE       │
│                                      │  [ON]             │
│                                      │  ON の場合、ピア   │
│                                      │  ノロールでスケー  │
│                                      │  ル外のノートが    │
│                                      │  無効になります。   │
│                                      │                   │
│                                      │  LANGUAGE          │
│                                      │  [JP]             │
│                                      │                   │
│                                      │  ABOUT             │
│                                      │  inboil v0.1.0     │
│                                      │  ─────────────────│
│                                      │  RESET             │
│                                      │  [ファクトリーリセット] │
├──────────────────────────────────────┴──── [?] ──────────┤
│ ParamPanel                                               │
└──────────────────────────────────────────────────────────┘
```

### C. Settings State

Settings are stored as part of consolidated `StoredPrefs` in `state.svelte.ts`, persisted under the `inboil` localStorage key:

```typescript
const STORAGE_KEY = 'inboil'
const STORAGE_VERSION = 1

interface StoredPrefs {
  v: number
  lang: Lang
  visited: boolean
  scaleMode: boolean
}

export const lang = $state({ value: initialPrefs.lang })
export const prefs = $state({
  visited: initialPrefs.visited,
  scaleMode: initialPrefs.scaleMode,
})
```

Legacy `inboil-lang` key is automatically migrated on first load.

### D. Current Settings

#### SCALE MODE

Controls whether out-of-scale notes are disabled in the piano roll.

| Value | Behavior |
|-------|----------|
| `true` (default) | Out-of-scale rows are disabled (dimmed, salmon tint, pointer-events: none). `randomizePattern()` quantizes notes to grid scale positions. |
| `false` | All 24 rows are active, full chromatic range. |

```typescript
export function toggleScaleMode(): void {
  prefs.scaleMode = !prefs.scaleMode
  savePrefs()
}
```

UI: Simple toggle button showing `ON` / `OFF`, olive border when ON.

#### LANGUAGE

Toggle between Japanese and English. Affects help content, hover guide tips, and SYSTEM sidebar labels.

```typescript
export function toggleLang(): void {
  lang.value = lang.value === 'ja' ? 'en' : 'ja'
  savePrefs()
}
```

UI: Toggle button showing `EN` (when current is ja) / `JP` (when current is en). Also accessible from help sidebar header.

#### ABOUT

Static version info at bottom of settings body:

```
ABOUT
inboil v0.1.0
```

#### FACTORY RESET

Bottom footer of the SYSTEM sidebar. Two-step confirmation:

1. User taps "ファクトリーリセット" / "FACTORY RESET"
2. Warning appears: "すべてのパターン・設定が初期化されます。" / "All patterns and settings will be reset."
3. User confirms with "実行" / "OK" or cancels with "キャンセル" / "CANCEL"

```typescript
export function factoryReset(): void {
  // Reset pattern bank (factory presets + empty user slots)
  // Load pattern 1
  // Reset UI, effects, perf, fxPad to defaults
  // Reset prefs (keep lang)
  // Clear and re-save localStorage
}
```

Reset button uses `--color-salmon` for visual warning.

### E. Setting UI Components

Minimal, hardware-inspired controls:

**Toggle button:**
```svelte
<div class="setting-group">
  <span class="setting-label">SCALE MODE</span>
  <button class="btn-toggle" class:on={prefs.scaleMode} onpointerdown={toggleScaleMode}>
    {prefs.scaleMode ? 'ON' : 'OFF'}
  </button>
  <p class="setting-desc">...</p>
</div>
```

**Styling:**
```css
.setting-group {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(237,232,220,0.08);
}
.setting-label {
  font-size: 9px;
  letter-spacing: 0.1em;
  color: rgba(237,232,220,0.4);
  text-transform: uppercase;
}
.btn-toggle {
  border: 1px solid rgba(237,232,220,0.3);
  background: transparent;
  color: rgba(237,232,220,0.55);
  font-size: 10px;
  padding: 6px 16px;
}
.btn-toggle.on {
  border-color: var(--color-olive);
  color: var(--color-olive);
}
```

### F. Future Settings (not in v1)

These are not implemented initially but the architecture supports them:

| Setting | Type | Description |
|---------|------|-------------|
| Rand Scope | toggle | RAND: trigs only vs. trigs + voice params |
| Audio Latency | toggle | AudioContext latency hint (balanced / interactive) |
| Theme | toggle | Light / dark mode |
| MIDI Clock Out | toggle | Send MIDI clock |
| Auto-save | toggle | Persist patterns to localStorage |
| Default Swing | slider | Default swing % for new patterns |

## Implementation Order

1. ~~Add consolidated `StoredPrefs` with `scaleMode` to `state.svelte.ts`~~ ✅
2. ~~Add localStorage persistence under `inboil` key~~ ✅
3. ~~Legacy `inboil-lang` migration~~ ✅
4. ~~Create SYSTEM content in `Sidebar.svelte` (Scale Mode toggle, Language toggle, About)~~ ✅
5. ~~Wire into sidebar (shares slot with help per ADR 017)~~ ✅
6. ~~Factory Reset with two-step confirmation~~ ✅
7. ~~Update `randomizePattern()` to respect `prefs.scaleMode`~~ ✅

## Consequences

- **Positive:** Users can customize behavior without code changes.
- **Positive:** SYSTEM naming fits the hardware aesthetic.
- **Positive:** Shares sidebar with help — no extra UI chrome.
- **Positive:** Consolidated localStorage under single `inboil` key with version field for future migrations.
- **Positive:** Factory reset gives users confidence to experiment.
- **Positive:** Two-step reset confirmation prevents accidental data loss.
- **Positive:** Architecture extensible for future settings.
- **Negative:** Settings add state that must be migrated if schema changes (mitigated with `STORAGE_VERSION` field).
- **Dependency:** ADR 017 (help sidebar) for shared sidebar component.
