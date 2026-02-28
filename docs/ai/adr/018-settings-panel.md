# ADR 018: Settings Panel (SYSTEM)

## Status: PROPOSED

## Context

inboil has no user-configurable settings. Behaviors like randomization scope, audio preferences, and display options are hardcoded. As the app grows, users need control over global behavior — without adding complexity to the main performance UI.

### Naming: SYSTEM vs CONFIG

**SYSTEM** is preferred:
- Matches the hardware-instrument aesthetic (Elektron "SYSTEM", Roland "SYSTEM SETUP")
- Shorter, fits the uppercase label style used throughout (BPM, PAT, VEL, RAND)
- "Config" feels more like developer tooling

## Proposed Design

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
- Clicking `⚙` sets `ui.sidebar = 'settings'`, opening the shared sidebar (same slot as help)

### B. Settings Sidebar Layout

Uses the same sidebar component as help (ADR 017). Content is a vertical list of labeled settings:

```
┌──────────────────────────────────────────────── [⚙] ────┐
│ AppHeader                                                │
├──────────────────────────────────────────┬───────────────┤
│                                          │  ✕   SYSTEM   │
│  StepGrid                                │               │
│                                          │  RAND SCOPE    │
│                                          │  ○ Trigs only  │
│                                          │  ● All params  │
│                                          │               │
│                                          │  AUDIO         │
│                                          │  Latency  [▾]  │
│                                          │               │
│                                          │  ABOUT         │
│                                          │  inboil v0.1   │
├──────────────────────────────────────────┴──── [?] ─────┤
│ ParamPanel                                               │
└──────────────────────────────────────────────────────────┘
```

### C. Settings Definition

```typescript
interface SettingsState {
  randScope: 'trigs' | 'all'          // RAND button: trigs only vs. trigs + voice params
  audioLatency: 'low' | 'balanced'    // AudioContext latency hint
  // Future settings:
  // theme: 'light' | 'dark'
  // midiClockOut: boolean
  // autoSave: boolean
  // swingDefault: number
}

// Persisted in localStorage
export const settings = $state<SettingsState>(
  loadSettings() ?? {
    randScope: 'trigs',
    audioLatency: 'balanced',
  }
)

function loadSettings(): SettingsState | null {
  try {
    const raw = localStorage.getItem('inboil-settings')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// Auto-persist on change
$effect(() => {
  localStorage.setItem('inboil-settings', JSON.stringify(settings))
})
```

### D. Initial Settings

#### RAND SCOPE

Controls what `randomizePattern()` touches:

| Value | Behavior |
|-------|----------|
| `trigs` (default) | Randomize trig patterns (on/off, velocity, notes) only. Voice params stay at defaults. |
| `all` | Randomize trigs + voice params (cutoff, decay, etc.) for more chaotic results. |

```typescript
export function randomizePattern() {
  // ... existing trig randomization ...
  if (settings.randScope === 'all') {
    for (const track of pattern.tracks) {
      for (const [key, def] of Object.entries(getParamDefs(...))) {
        track.voiceParams[key] = def.min + Math.random() * (def.max - def.min)
      }
    }
  }
}
```

#### AUDIO LATENCY

Maps to `AudioContext.latencyHint`:

| Value | `latencyHint` | Use case |
|-------|---------------|----------|
| `balanced` (default) | `'balanced'` | General use |
| `low` | `'interactive'` | Live performance, tighter response |

Changing this requires re-creating the AudioContext — show a warning that audio will restart.

### E. Setting UI Components

Minimal, hardware-inspired controls:

**Toggle (radio-style):**
```svelte
<div class="setting-group">
  <span class="setting-label">RAND SCOPE</span>
  <div class="setting-options">
    <button
      class="setting-opt"
      class:active={settings.randScope === 'trigs'}
      onclick={() => { settings.randScope = 'trigs' }}
    >TRIGS</button>
    <button
      class="setting-opt"
      class:active={settings.randScope === 'all'}
      onclick={() => { settings.randScope = 'all' }}
    >ALL</button>
  </div>
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
  display: block;
  margin-bottom: 8px;
}
.setting-opt {
  border: 1px solid rgba(237,232,220,0.25);
  background: transparent;
  color: rgba(237,232,220,0.5);
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 4px 10px;
}
.setting-opt.active {
  background: var(--color-olive);
  border-color: var(--color-olive);
  color: var(--color-bg);
}
```

### F. About Section

Bottom of the settings sidebar:

```
ABOUT
inboil v0.1.0
Built with Svelte + Web Audio + WASM
```

No external links — just version info for reference.

### G. Future Settings (not in v1)

These are not implemented initially but the architecture supports them:

| Setting | Type | Description |
|---------|------|-------------|
| Theme | toggle | Light / dark mode |
| MIDI Clock Out | toggle | Send MIDI clock (ADR 016) |
| Auto-save | toggle | Persist patterns to localStorage |
| Default Swing | slider | Default swing % for new patterns |
| Step Count Default | selector | Default steps for new tracks |

## Implementation Order

1. Add `settings` state with `randScope` to `state.svelte.ts`
2. Add localStorage persistence
3. Create `SettingsContent.svelte` with RAND SCOPE toggle
4. Wire into sidebar (shares slot with help per ADR 017)
5. Update `randomizePattern()` to respect `settings.randScope`
6. Add AUDIO LATENCY setting
7. Add ABOUT section

## Consequences

- **Positive:** Users can customize behavior without code changes.
- **Positive:** SYSTEM naming fits the hardware aesthetic.
- **Positive:** Shares sidebar with help — no extra UI chrome.
- **Positive:** localStorage persistence is simple and works offline.
- **Positive:** Architecture extensible for future settings.
- **Negative:** Settings add state that must be migrated if schema changes (mitigate with version field).
- **Negative:** Some settings (audio latency) require restart — UX must communicate this clearly.
- **Dependency:** ADR 017 (help sidebar) for shared sidebar component.
