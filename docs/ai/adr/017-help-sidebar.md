# ADR 017: Help Sidebar

## Status: IMPLEMENTED (mobile overlay pending)

## Context

inboil has no in-app help or documentation. New users must figure out the interface by experimentation. Geometric decorations exist in both AppHeader (`.geo-rects`, top-right) and ParamPanel (`.geo`, bottom-right) — these serve no functional purpose and can be repurposed for help and settings triggers respectively.

### Goals

- Provide in-app guide explaining all features and interactions
- Support Japanese and English
- Desktop: contextual hover guide in help mode
- Minimal UI footprint — sidebar overlays the step grid area, not a separate page

## Design

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
  - **Othello-style flip animation** (180ms ease-out, `rotateY(180deg)`, matching step/mute buttons)
  - Off state: bordered outline, dim text. On state: blue filled background, white text
- Both styled consistently — small, bordered, subtle (same style as `.btn-notes`)

```typescript
// UI state
export const ui = $state({
  // existing fields...
  sidebar: null as 'help' | 'system' | null,
})
```

### B. Help Sidebar

A right-side panel that overlays the step grid area. Both `?` (bottom) and `⚙` (top) open the same sidebar — only the content differs:

```
┌──────────────────────────────────────────────── [⚙] ────┐
│ AppHeader                                                │
├──────────────────────────────────────┬───────────────────┤
│                                      │  HELP    [EN] [✕] │
│  StepGrid                            │                   │
│  (partially obscured)                │  ▸ ABOUT          │
│                                      │    inboil とは...  │
│                                      │                   │
│                                      │  ▸ BASICS         │
│                                      │                   │
│                                      │  ▸ TRACKS         │
│                                      │    8トラック...     │
│                                      │                   │
│                                      │  ────────────────  │
│                                      │  GUIDE             │
│                                      │  UI要素にカーソルを │
│                                      │  合わせると説明が   │
│                                      │  表示されます       │
├──────────────────────────────────────┴──── [?] ──────────┤
│ ParamPanel                                               │
└──────────────────────────────────────────────────────────┘
```

#### Implementation

The sidebar is a single `Sidebar.svelte` component placed inside `.view-area` in App.svelte:

```svelte
<!-- In App.svelte view-area -->
<div class="view-area">
  <StepGrid />
  <Sidebar />
</div>
```

`Sidebar.svelte` handles both help and system modes internally, using `ui.sidebar` state.

#### Open/Close Animation

50ms fade + slide (translateX 24px), with deferred DOM removal for exit animation:

```typescript
// Sidebar.svelte — animation state
let closing = $state(false)
let visibleMode = $state<'help' | 'system' | null>(null)

$effect(() => {
  if (mode) {
    closing = false
    visibleMode = mode  // show immediately
  } else if (visibleMode) {
    closing = true      // trigger exit animation, keep DOM alive
  }
})

function onAnimEnd() {
  if (closing) {
    closing = false
    visibleMode = null  // now remove from DOM
  }
}
```

```css
.sidebar {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 280px;
  z-index: 20;
  background: var(--color-fg);
  color: var(--color-bg);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 16px rgba(0,0,0,0.3);
  animation: sidebar-in 50ms ease-out;
}
.sidebar.closing {
  animation: sidebar-out 50ms ease-in forwards;
}
@keyframes sidebar-in {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes sidebar-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(24px); }
}
```

### C. Help Content Structure

Content is organized by feature, with collapsible accordion sections. Sections are defined inline in `Sidebar.svelte` as a `$derived` array using the current language:

```typescript
const helpSections = $derived([
  { title: L === 'ja' ? 'inboil とは' : 'ABOUT', body: '...' },
  { title: L === 'ja' ? '基本操作' : 'BASICS', body: '...' },
  { title: L === 'ja' ? 'トラック' : 'TRACKS', body: '...' },
  { title: L === 'ja' ? 'ベロシティ & ステップ数' : 'VELOCITY & STEPS', body: '...' },
  { title: L === 'ja' ? 'ピアノロール' : 'PIANO ROLL', body: '...' },
  { title: L === 'ja' ? 'パフォーマンス' : 'PERFORMANCE', body: '...' },
  { title: L === 'ja' ? 'パターン' : 'PATTERNS', body: '...' },
  { title: L === 'ja' ? 'シンセパラメータ' : 'SYNTH PARAMS', body: '...' },
  { title: 'GRID', body: '...' },
  { title: L === 'ja' ? 'FX パッド' : 'FX PAD', body: '...' },
  { title: 'EQ', body: '...' },
])
```

Section 0 is open by default. Toggle via `openSections` Set.

### D. Language

Persisted as part of consolidated `StoredPrefs` under the `inboil` localStorage key (see ADR 018). Language state is `lang.value: 'ja' | 'en'`.

```typescript
export type Lang = 'ja' | 'en'
export const lang = $state({ value: initialPrefs.lang })

export function toggleLang(): void {
  lang.value = lang.value === 'ja' ? 'en' : 'ja'
  savePrefs()
}
```

Default: Japanese (primary user base). Toggle shows `EN` / `JP` label.

### E. First Visit Behavior

On first visit (`!prefs.visited`), the help sidebar opens automatically to onboard new users:

```typescript
if (!prefs.visited) {
  ui.sidebar = 'help'
  prefs.visited = true
  savePrefs()
}
```

### F. Desktop Hover Guide (Help Mode)

When `ui.sidebar === 'help'`, hovering over UI elements shows contextual descriptions in the sidebar's **GUIDE footer** area. This is a "learning mode" — the guide is invisible during normal operation.

**Approach:** Document-level `mouseover` event delegation + `data-tip` / `data-tip-ja` attributes:

```typescript
// Sidebar.svelte — hover guide
let guideText = $state('')

onMount(() => {
  function onOver(e: Event) {
    if (ui.sidebar !== 'help') return
    const el = (e.target as Element)?.closest?.('[data-tip]')
    if (!el) { guideText = ''; return }
    const tip = L === 'ja'
      ? (el.getAttribute('data-tip-ja') || el.getAttribute('data-tip'))
      : el.getAttribute('data-tip')
    guideText = tip || ''
  }
  document.addEventListener('mouseover', onOver)
  return () => document.removeEventListener('mouseover', onOver)
})
```

The guide footer is always visible at the bottom of the help sidebar:

```svelte
<div class="guide-footer" class:active={guideText}>
  <span class="guide-label">GUIDE</span>
  <p class="guide-text">{guideText || 'UI要素にカーソルを合わせると説明が表示されます'}</p>
</div>
```

**Why sidebar footer instead of CSS `::after` tooltips:**
- No z-index / positioning conflicts with complex nested components
- Bilingual support via `data-tip` (EN) + `data-tip-ja` (JP) attributes, selected by `lang.value`
- Works consistently across all components without per-element CSS adjustments
- Guide text area always visible as a gentle prompt to explore

**Target elements with `data-tip` / `data-tip-ja`:**

| Component | Element | EN | JP |
|-----------|---------|----|----|
| AppHeader | BPM − | Decrease tempo | テンポを下げる |
| AppHeader | BPM + | Increase tempo | テンポを上げる |
| AppHeader | ▶ Play | Play pattern | パターンを再生 |
| AppHeader | ■ Stop | Stop playback | 再生を停止 |
| AppHeader | RAND | Randomize pattern | パターンをランダム生成 |
| AppHeader | PAT ◀ | Previous pattern | 前のパターン |
| AppHeader | PAT ▶ | Next pattern | 次のパターン |
| AppHeader | ⚙ | System settings | システム設定 |
| StepGrid | Track name | Select track to edit | トラックを選択 |
| StepGrid | VOL knob | Track volume | トラック音量 |
| StepGrid | PAN knob | Stereo panning | ステレオパン |
| StepGrid | M button | Mute/unmute track | トラックをミュート |
| StepGrid | Steps area | Tap or drag to toggle steps | タップ/ドラッグでステップを切り替え |
| StepGrid | VEL label | Velocity — per-step volume | ベロシティ (各ステップの音量) |
| StepGrid | Step count | Change step count | ステップ数を変更 |
| StepGrid | VEL lane | Drag up/down to adjust velocity | 上下ドラッグでベロシティを調整 |
| PerfBar | KEY piano | Set root note for scale transposition | スケール移調のルートノートを設定 |
| PerfBar | OCT −/+ | Lower/Raise octave | オクターブを下げる/上げる |
| PerfBar | DUC knob | Sidechain ducker depth | サイドチェインダッカーの深さ |
| PerfBar | CMP knob | Compressor makeup gain | コンプレッサーのメイクアップゲイン |
| PerfBar | GAIN knob | Master output volume | マスター出力音量 |
| PerfBar | SWG knob | Swing amount (shuffle feel) | スウィング量 (シャッフル感) |
| PerfBar | GRID/FX/EQ | View toggle descriptions | 画面切替の説明 |
| PerfBar | FILL/REV/BRK | Performance button descriptions | パフォーマンスボタンの説明 |
| ParamPanel | ? button | Show help | ヘルプを表示 |
| ParamPanel | ♪ NOTES | Toggle piano roll | ピアノロールを表示/非表示 |
| ParamPanel | Synth knobs | Synth parameters — drag to adjust | シンセパラメータ — ドラッグで調整 |
| PianoRoll | Keys area | Note reference — shows transposed pitch | 音程リファレンス (移調後のピッチ) |
| PianoRoll | Note grid | Tap or drag to place/erase notes | タップ/ドラッグでノートを配置/消去 |
| FxPad | FX pad | Tap node to toggle, drag to adjust | ノードをタップでON/OFF、ドラッグで調整 |
| FxPad | FX nodes | Per-node descriptions | 各ノードの説明 |
| FilterView | Filter pad | Tap node to toggle, drag to adjust frequency & gain | ノードをタップでON/OFF、ドラッグで周波数&ゲインを調整 |
| FilterView | EQ nodes | Per-node descriptions | 各ノードの説明 |

**Scope:** Desktop only (`!isMobile`). Mobile has no hover — help sidebar content serves as the reference.

### G. Sidebar Collapse (Guide-Only Mode)

When viewing FX or EQ, the full-height sidebar can obscure nodes. A collapse toggle minimizes it to just the header + GUIDE footer, anchored to the bottom-right:

```
Expanded:                        Collapsed:
┌──────── 280px ──────┐        ┌──────── 280px ──────┐
│ [▾] HELP   [EN] [✕] │        │ [▴] GUIDE            │
│ ──────────────────── │        │ ──────────────────── │
│ ▸ ABOUT              │        │ GUIDE                │
│ ▾ BASICS             │        │ (hover guide text)   │
│ ...                  │        └──────────────────────┘
│ ──────────────────── │
│ GUIDE                │
│ (hover guide text)   │
└──────────────────────┘
```

- **Toggle button** `▾`/`▴` at the left of the sidebar header (help mode only, not system)
- **Collapsed state:** `top: auto` (bottom-anchored, natural height), sidebar-body removed via `{#if !collapsed}`, header border-bottom removed to avoid double border with guide-footer border-top
- **Reset:** `collapsed = false` whenever the sidebar is opened (in the existing `$effect`)
- **Hover guide** continues to work in collapsed mode — the GUIDE footer remains visible

### H. Sidebar Dismiss Behavior

The sidebar does **not** close on outside click (no backdrop). Users often want to reference help while interacting with the grid. Close triggers are limited to:

1. **✕ button** — sidebar header
2. **⚙ re-press** — AppHeader (toggles SYSTEM off)
3. **? re-press** — ParamPanel (toggles HELP off)

No backdrop overlay — the grid remains fully interactive while the sidebar is open.

### I. Mobile

Not yet implemented. Plan: `?` icon in MobileTrackView header, sidebar becomes full-screen overlay with back button.

## Implementation Order

1. ~~Add `sidebar` to `ui` state~~ ✅
2. ~~Replace `.geo` decoration in ParamPanel with `?` button~~ ✅
3. ~~Replace `.geo-rects` decoration in AppHeader with `⚙` button~~ ✅
4. ~~Create `Sidebar.svelte` shell~~ ✅
5. ~~Help content with collapsible sections~~ ✅
6. ~~Wire up in App.svelte~~ ✅
7. ~~Language persistence~~ ✅
8. ~~No backdrop (grid stays interactive while sidebar open)~~ ✅
9. ~~Sidebar open/close animation (50ms fade+slide)~~ ✅
10. ~~Help button Othello flip animation~~ ✅
11. ~~Desktop hover guide (`data-tip` + sidebar footer)~~ ✅
12. ~~First visit auto-open~~ ✅
13. ~~Sidebar collapse (guide-only mode) for FX/EQ views~~ ✅
14. ~~Add GRID, EQ help sections; enrich FX PAD section~~ ✅
15. Mobile overlay variant

## Consequences

- **Positive:** Users can learn the app without external documentation.
- **Positive:** JP/EN toggle supports international audience.
- **Positive:** Sidebar reuses the same slot for help and settings — minimal UI surface.
- **Positive:** Replaces purely decorative element with functional UI.
- **Positive:** No backdrop — grid stays interactive while referencing help.
- **Positive:** Hover guide provides contextual learning without cluttering normal workflow.
- **Positive:** First visit auto-open gently onboards new users.
- **Negative:** Help content must be maintained as features change.
- **Positive:** Collapse mode lets users keep hover guide visible without obscuring FX/EQ nodes.
- **Negative:** Sidebar partially obscures step grid when expanded — acceptable for a reference panel; collapse mode mitigates for FX/EQ views.
- **Negative:** `data-tip` attributes add minor markup overhead across components.
