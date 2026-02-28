# ADR 017: Help Sidebar

## Status: PROPOSED

## Context

inboil has no in-app help or documentation. New users must figure out the interface by experimentation. Geometric decorations exist in both AppHeader (`.geo-rects`, top-right) and ParamPanel (`.geo`, bottom-right) — these serve no functional purpose and can be repurposed for help and settings triggers respectively.

### Goals

- Provide in-app guide explaining all features and interactions
- Support Japanese and English
- Desktop: contextual tooltips on hover
- Minimal UI footprint — sidebar overlays the step grid area, not a separate page

## Proposed Design

### A. Icon Placement — Top/Bottom Split

Each trigger replaces a decorative element in its respective location:

```
┌─────────────────────────────────────────────── [⚙] ─┐  ← AppHeader (top-right, replaces .geo-rects)
│  BPM  ▶ ■  RAND              PAT ◀ 00 | PATTERN ▶  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  StepGrid (view-area)                                │
│                                                      │
├─────────────────────────────────────────────── [?] ──┤  ← ParamPanel (bottom-right, replaces .geo)
│  [SNARE] [♪ NOTES]  [knobs...]                       │
└──────────────────────────────────────────────────────┘
```

- **`⚙` SYSTEM** → AppHeader top-right (replaces `.geo-rects` decoration)
  - Global settings belong with global controls (BPM, Transport, Pattern)
  - Hardware convention: SYSTEM button is on the main panel
  - Rarely used — appropriate for less prominent position
- **`?` HELP** → ParamPanel bottom-right (replaces `.geo` decoration)
  - Contextual: user asks "what does this knob do?" while looking at ParamPanel
  - Matches existing visual weight of the decoration it replaces
- Both styled consistently — small, bordered, subtle (same style as `.btn-notes`)

```typescript
// UI state extension
export const ui = $state({
  // existing fields...
  sidebar: 'none' as 'none' | 'help' | 'settings',
})
```

### B. Help Sidebar

A right-side panel that overlays the step grid area. Both `?` (bottom) and `⚙` (top) open the same sidebar — only the content differs:

```
┌──────────────────────────────────────────────── [⚙] ────┐
│ AppHeader                                                │
├──────────────────────────────────────────┬───────────────┤
│                                          │  ✕    JP|EN  │
│  StepGrid                                │              │
│  (partially obscured)                    │  HELP         │
│                                          │              │
│                                          │  ▸ STEPS      │
│                                          │    Tap to     │
│                                          │    toggle...  │
│                                          │              │
│                                          │  ▸ VELOCITY   │
│                                          │    Drag bars  │
│                                          │    to set...  │
│                                          │              │
│                                          │  ▸ PIANO ROLL │
│                                          │    ...        │
├──────────────────────────────────────────┴──── [?] ─────┤
│ ParamPanel                                               │
└──────────────────────────────────────────────────────────┘
```

#### Layout

```svelte
<!-- In App.svelte view-area -->
<div class="view-area">
  <StepGrid />
  {#if ui.sidebar !== 'none'}
    <div class="sidebar">
      <div class="sidebar-header">
        <button class="sidebar-close" onclick={() => { ui.sidebar = 'none' }}>✕</button>
        <button class="lang-toggle" onclick={toggleLang}>{lang === 'ja' ? 'EN' : 'JP'}</button>
      </div>
      {#if ui.sidebar === 'help'}
        <HelpContent {lang} />
      {:else if ui.sidebar === 'settings'}
        <SettingsContent />
      {/if}
    </div>
  {/if}
</div>
```

#### Sidebar CSS

```css
.sidebar {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: var(--color-fg);
  color: var(--color-bg);
  overflow-y: auto;
  z-index: 20;
  animation: slide-in 200ms ease-out;
  border-left: 1px solid rgba(237,232,220,0.1);
}

@keyframes slide-in {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
```

### C. Help Content Structure

Content organized by feature, with collapsible sections:

```typescript
interface HelpSection {
  id: string
  title: { ja: string; en: string }
  body: { ja: string; en: string }
}

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'steps',
    title: { ja: 'ステップ', en: 'Steps' },
    body: {
      ja: 'タップでトリガーをON/OFF。選択したトラックのステップ数はVELレーンの数字をタップして変更。',
      en: 'Tap to toggle triggers. Change step count by tapping the number in the VEL lane.'
    }
  },
  {
    id: 'velocity',
    title: { ja: 'ベロシティ', en: 'Velocity' },
    body: {
      ja: '選択トラックの下に表示されるバーを上下ドラッグで音量を調整。',
      en: 'Drag bars up/down below the selected track to adjust note volume.'
    }
  },
  {
    id: 'piano-roll',
    title: { ja: 'ピアノロール', en: 'Piano Roll' },
    body: {
      ja: 'メロディトラック選択時に「♪ NOTES」を押すと表示。グリッドをタップしてノートを配置。',
      en: 'Press "♪ NOTES" on melodic tracks. Tap the grid to place notes.'
    }
  },
  {
    id: 'transport',
    title: { ja: 'トランスポート', en: 'Transport' },
    body: {
      ja: '▶ 再生、■ 停止、スペースキーでトグル。RANDでパターンをランダム生成。',
      en: '▶ play, ■ stop, Space to toggle. RAND generates a random pattern.'
    }
  },
  {
    id: 'params',
    title: { ja: 'パラメータ', en: 'Parameters' },
    body: {
      ja: '下部パネルのノブをドラッグして音色を調整。各トラックのシンセタイプに応じたパラメータが表示される。',
      en: 'Drag knobs in the bottom panel to shape the sound. Parameters change based on each track\'s synth type.'
    }
  },
  {
    id: 'performance',
    title: { ja: 'パフォーマンス', en: 'Performance' },
    body: {
      ja: 'FILLでフィルイン、REVで逆再生、BRKでブレイク。Root Noteでキーを変更。',
      en: 'FILL for fills, REV for reverse, BRK for break. Root Note changes the key.'
    }
  },
  {
    id: 'patterns',
    title: { ja: 'パターン', en: 'Patterns' },
    body: {
      ja: 'PAT ◀▶ でパターンを切り替え。再生中は次のバー頭で切り替わる。',
      en: 'PAT ◀▶ to switch patterns. During playback, switch happens at the next bar start.'
    }
  },
  // ... FX Pad, Filter, mobile-specific sections
]
```

### D. Language

```typescript
// Persisted in localStorage
let lang = $state<'ja' | 'en'>(
  localStorage.getItem('inboil-lang') as 'ja' | 'en' || 'ja'
)

function toggleLang() {
  lang = lang === 'ja' ? 'en' : 'ja'
  localStorage.setItem('inboil-lang', lang)
}
```

Default: Japanese (primary user base). Toggle shows `EN` / `JP` label.

### E. Desktop Contextual Tooltips

On desktop (`!isMobile`), hovering over interactive elements shows a brief tooltip:

```css
[data-tip]:hover::after {
  content: attr(data-tip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-fg);
  color: var(--color-bg);
  font-size: 10px;
  padding: 3px 8px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 30;
}
```

```svelte
<button data-tip={lang === 'ja' ? 'ランダム生成' : 'Randomize'}>RAND</button>
```

Tooltips are only shown when the help sidebar is open (opt-in learning mode), to avoid cluttering the normal workflow.

### F. Mobile

On mobile, the `?` icon is placed in the sub-header (or MobileTrackView header). The sidebar becomes a full-screen overlay with a back button instead of `✕`.

## Implementation Order

1. Add `sidebar` to `ui` state
2. Replace `.geo` decoration in ParamPanel with `?` button (bottom-right)
3. Replace `.geo-rects` decoration in AppHeader with `⚙` button (top-right)
4. Create `Sidebar.svelte` shell (slide-in, close button, lang toggle)
5. Create `HelpContent.svelte` with collapsible sections
6. Wire up in App.svelte (overlay in view-area)
7. Add language persistence
8. Desktop tooltips (optional, lower priority)
9. Mobile overlay variant

## Consequences

- **Positive:** Users can learn the app without external documentation.
- **Positive:** JP/EN toggle supports international audience.
- **Positive:** Sidebar reuses the same slot for help and settings — minimal UI surface.
- **Positive:** Replaces purely decorative element with functional UI.
- **Negative:** Help content must be maintained as features change.
- **Negative:** Sidebar partially obscures step grid — acceptable for a reference panel.
- **Risk:** Tooltip system could become noisy if not gated behind help mode.
