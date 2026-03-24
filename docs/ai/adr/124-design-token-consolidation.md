# ADR 124: Design Token Consolidation

## Status: Proposed

## Context

The UI design spec (`docs/ai/ui-design.md`) defines a comprehensive opacity token system with `--lz-*` (light zone) and `--dz-*` (dark zone) tokens, but the actual codebase barely uses them. Instead, components hardcode raw `rgba()` values:

- `rgba(30,32,40,*)` (navy base) — **98 occurrences** across 19 components
- `rgba(237,232,220,*)` (cream base) — **277 occurrences** across 21 components
- Accent overlays (olive, blue, salmon) — scattered raw values

Only **6 tokens** are defined in `app.css :root` (4 olive + 2 danger). DockPanel defines `--dk-*` tokens locally (scoped to `.dock-panel`), but child components (DockTrackEditor, DockFxControls, etc.) duplicate raw rgba instead of inheriting them.

This creates three problems:
1. **Drift** — new components copy-paste rgba values, sometimes with wrong base RGB (e.g., `rgba(108,119,68,*)` instead of `120,120,69` for olive, `rgba(40,38,34,*)` instead of `30,32,40` for navy)
2. **No enforcement** — the `/audit-styles` skill catches violations manually, but nothing prevents them at write time
3. **Palette changes are impossible** — adjusting an opacity step requires find-and-replace across 40+ files

## Decision

### 1. Define all tokens in `:root`

Add the full token set from ui-design.md to `app.css :root`:

```css
:root {
  /* ── existing palette tokens ── */
  /* ... --color-bg, --color-fg, etc. ... */

  /* ── Light zone (base: 30,32,40 = --color-fg) ── */
  --lz-divider:       rgba(30,32,40, 0.06);
  --lz-bg-hover:      rgba(30,32,40, 0.06);
  --lz-border-subtle: rgba(30,32,40, 0.08);
  --lz-bg-active:     rgba(30,32,40, 0.08);
  --lz-border:        rgba(30,32,40, 0.10);
  --lz-border-mid:    rgba(30,32,40, 0.12);
  --lz-border-strong: rgba(30,32,40, 0.15);
  --lz-bg-press:      rgba(30,32,40, 0.14);
  --lz-text-hint:     rgba(30,32,40, 0.35);
  --lz-text-mid:      rgba(30,32,40, 0.50);
  --lz-step-border:   rgba(30,32,40, 0.50);
  --lz-text:          rgba(30,32,40, 0.55);
  --lz-text-strong:   rgba(30,32,40, 0.70);

  /* ── Dark zone (base: 237,232,220 = --color-bg) ── */
  --dz-divider:          rgba(237,232,220, 0.06);
  --dz-bg-hover:         rgba(237,232,220, 0.08);
  --dz-border-subtle:    rgba(237,232,220, 0.10);
  --dz-bg-active:        rgba(237,232,220, 0.12);
  --dz-bg-press:         rgba(237,232,220, 0.15);
  --dz-border:           rgba(237,232,220, 0.15);
  --dz-border-mid:       rgba(237,232,220, 0.25);
  --dz-border-strong:    rgba(237,232,220, 0.30);
  --dz-text-dim:         rgba(237,232,220, 0.35);
  --dz-btn-border:       rgba(237,232,220, 0.35);
  --dz-text-mid:         rgba(237,232,220, 0.55);
  --dz-transport-border: rgba(237,232,220, 0.45);
  --dz-text:             rgba(237,232,220, 0.70);
  --dz-text-strong:      rgba(237,232,220, 0.85);
  --dz-text-bright:      rgba(237,232,220, 0.90);

  /* ── Accent overlays ── */
  /* olive: already defined (--olive-bg-subtle, --olive-bg, --olive-border, --olive-border-strong) */
  --blue-bg-subtle:   rgba(68,114,180, 0.08);
  --blue-bg-playhead: rgba(68,114,180, 0.13);
  --salmon-bg-scale:  rgba(232,160,144, 0.06);
  --salmon-bg-key:    rgba(232,160,144, 0.08);
}
```

### 2. Unify DockPanel `--dk-*` → global `--dz-*`

Remove local `--dk-*` declarations from DockPanel's `.dock-panel` rule. Replace all `--dk-*` references in DockPanel and its children with the equivalent `--dz-*` token:

| `--dk-*` (local) | `--dz-*` (global) |
|---|---|
| `--dk-text` (0.85) | `--dz-text-strong` |
| `--dk-text-mid` (0.55) | `--dz-text-mid` |
| `--dk-text-dim` (0.55) | `--dz-text-mid` (note: dk-text-dim was 0.55, same as dk-text-mid — likely a bug, should be 0.35 = `--dz-text-dim`) |
| `--dk-border` (0.15) | `--dz-border` |
| `--dk-border-mid` (0.3) | `--dz-border-strong` |
| `--dk-bg-hover` (0.08) | `--dz-bg-hover` |
| `--dk-bg-faint` (0.06) | `--dz-divider` |
| `--dk-bg-active` (0.12) | `--dz-bg-active` |

Font-size tokens (`--dk-fs-xs` etc.) stay as DockPanel-local — they are component-specific, not part of the opacity system.

### 3. Replace raw rgba in all components

Map each raw `rgba()` to the correct semantic token based on context:

**Light zone** (cream bg components: StepGrid, MatrixView, PianoRoll, PatternToolbar, MobileTrackView, etc.):

| Raw value | Border context | Background context | Text context |
|---|---|---|---|
| `rgba(30,32,40, 0.06)` | `--lz-divider` | `--lz-bg-hover` | — |
| `rgba(30,32,40, 0.08)` | `--lz-border-subtle` | `--lz-bg-active` | — |
| `rgba(30,32,40, 0.10)` | `--lz-border` | — | — |
| `rgba(30,32,40, 0.12)` | `--lz-border-mid` | — | — |
| `rgba(30,32,40, 0.15)` | `--lz-border-strong` | — | — |
| `rgba(30,32,40, 0.35)` | — | — | `--lz-text-hint` |
| `rgba(30,32,40, 0.50)` | `--lz-step-border` | — | `--lz-text-mid` |
| `rgba(30,32,40, 0.55)` | — | — | `--lz-text` |
| `rgba(30,32,40, 0.70)` | — | — | `--lz-text-strong` |

**Dark zone** (navy bg components: AppHeader, Sidebar*, TrackerView, FxPad, FilterView, MasterView, PerfButtons, etc.):

| Raw value | Border context | Background context | Text context |
|---|---|---|---|
| `rgba(237,232,220, 0.06)` | `--dz-divider` | `--dz-divider` | — |
| `rgba(237,232,220, 0.08)` | — | `--dz-bg-hover` | — |
| `rgba(237,232,220, 0.10)` | `--dz-border-subtle` | — | — |
| `rgba(237,232,220, 0.12)` | — | `--dz-bg-active` | — |
| `rgba(237,232,220, 0.15)` | `--dz-border` | `--dz-bg-press` | — |
| `rgba(237,232,220, 0.25)` | `--dz-border-mid` | — | — |
| `rgba(237,232,220, 0.30)` | `--dz-border-strong` | — | — |
| `rgba(237,232,220, 0.35)` | `--dz-btn-border` | — | `--dz-text-dim` |
| `rgba(237,232,220, 0.45)` | `--dz-transport-border` | — | `--dz-transport-border` |
| `rgba(237,232,220, 0.55)` | — | — | `--dz-text-mid` |
| `rgba(237,232,220, 0.70)` | — | — | `--dz-text` |
| `rgba(237,232,220, 0.85)` | — | — | `--dz-text-strong` |
| `rgba(237,232,220, 0.90)` | — | — | `--dz-text-bright` |

### 4. Olive token naming — keep current names

The existing `app.css` names diverge from the spec but better reflect actual usage:

| app.css (keep) | ui-design.md spec (update to match) | Value |
|---|---|---|
| `--olive-bg-subtle` | `--olive-bg-subtle` | 0.08 |
| `--olive-bg` | ~~`--olive-bg-mid`~~ → `--olive-bg` | 0.15 |
| `--olive-border` | ~~`--olive-bg-hover`~~ → `--olive-border` | 0.30 |
| `--olive-border-strong` | ~~`--olive-border`~~ → `--olive-border-strong` | 0.40 |

Update ui-design.md to match app.css, not the other way around — the code is already shipped and names are used in multiple components.

### 5. Enforcement — Claude Code hook

Add a PostToolUse hook (in `.claude/settings.json`) that runs after `Edit` or `Write` on `.svelte` files. The hook script checks the written file for:

**Color violations:**
```bash
# Flag raw rgba with navy/cream/olive/blue/salmon base colors
grep -nE 'rgba\((30,32,40|237,232,220|120,120,69|68,114,180|232,160,144|248,113,113)' "$FILE"
```

**Spacing violations:**
```bash
# Flag gap/padding/margin values not in {2,4,6,8,10,12,16}px
# Only within <style> blocks, skip calc(), var(), %, vh/vw, auto, 0
grep -nE '(gap|padding|margin).*[0-9]+(px|rem)' "$FILE" | grep -vE '(2|4|6|8|10|12|16)px'
```

The hook prints warnings but does **not** block the edit — it's advisory, not a gate. This gives Claude immediate feedback to self-correct without interrupting flow.

### 6. CLAUDE.md update

Add to Conventions section:
```
- Colors: use `--lz-*` tokens (light zone) or `--dz-*` tokens (dark zone), never raw `rgba(30,32,40,*)` or `rgba(237,232,220,*)`
- Accent overlays: use `--olive-*`, `--blue-*`, `--salmon-*`, `--danger-*` tokens
- Spacing: gap/padding/margin values must be from {2, 4, 8, 12, 16}px (6, 10 allowed for documented asymmetric padding)
```

## Phasing

### Phase 1 — Token infrastructure
- Add all `--lz-*`, `--dz-*`, accent tokens to `app.css :root`
- Update ui-design.md olive token names to match app.css
- Update CLAUDE.md conventions
- Set up enforcement hook

### Phase 2 — Light zone migration
Replace raw `rgba(30,32,40,*)` in light-zone components:
StepGrid, MatrixView, PianoRoll, PatternToolbar, MobileTrackView, MobileMatrixView, MobileSceneRibbon, SceneView, SceneBubbleMenu

### Phase 3 — Dark zone migration
Replace raw `rgba(237,232,220,*)` in dark-zone components + unify DockPanel `--dk-*`:
AppHeader, Sidebar, SidebarHelp, SidebarSettings, SidebarProject, TrackerView, DockPanel, DockTrackEditor, DockFxControls, DockEqControls, DockMasterControls, DockNavigator, DockPoolBrowser, DockPresetBrowser, DockGenerativeEditor, MobilePerfSheet, MasterView, PerfButtons, FxPad, FilterView

### Phase 4 — Accent + remaining
Replace remaining accent rgba (blue, salmon) and edge cases:
Knob, VFader, ErrorDialog, ErrorToast, MobileParamOverlay, StepGrid accent values

Each phase: replace → `pnpm check` → visual spot-check → commit.

### Phase 5 — Font-size tokens

#### Design: two-tier font-size system

Hardware-inspired constraint: like a fixed-resolution LCD, the app has a **finite set of allowed sizes**. Two tiers:

**Data tier** (monospace, controls) — 5 steps, 1px increments, covers 95% of all declarations:

```css
:root {
  --fs-min:   8px;  /* badges, scale labels, key labels */
  --fs-sm:    9px;  /* button labels, tabs, group labels */
  --fs-md:   10px;  /* settings, guides, footer */
  --fs-lg:   11px;  /* track names, inputs, primary labels */
  --fs-base: 12px;  /* body default */
}
```

**Display tier** (Bebas Neue, display numbers) — NOT tokenized. These are rare, contextual, and vary per component. Use raw px with a mandatory comment explaining the choice:

```css
font-size: 18px; /* display: BPM value */
font-size: 22px; /* display: OCT value */
font-size: 24px; /* display: BPM input */
```

Current usage distribution:
```
 8px ████████████████████  44   → --fs-min
 9px ██████████████████████████  66   → --fs-sm
10px ████████████████████████  54   → --fs-md
11px ████████████████████  39   → --fs-lg
12px ████████  14   → --fs-base
14px+ (sparse)               → raw px + comment
```

#### 5a. Define font-size scale in `:root`

Add the 5 data-tier tokens to `app.css :root` alongside the existing color tokens.

#### 5b. Raise minimum font-size from 7px to 8px

Current spec allows 7px. All 11 occurrences are marginal legibility:
- PianoRoll key labels, StepGrid scale label, SceneView tooltips, FilterView node labels, PatternToolbar fan keys, etc.

Raise all to `var(--fs-min)` (8px). 1px increase improves readability with negligible layout impact.

#### 5c. Replace raw px values in all components

~258 raw `font-size` declarations → CSS variable tokens. Map:
- `7px` → `var(--fs-min)` (raised from 7 to 8)
- `8px` → `var(--fs-min)`
- `9px` → `var(--fs-sm)`
- `10px` → `var(--fs-md)`
- `11px` → `var(--fs-lg)`
- `12px` → `var(--fs-base)`
- `13px` → `var(--fs-base)` or `var(--fs-lg)` (2 occurrences, decide per context)
- `14px+` → keep raw px, add `/* display: purpose */` comment

DockPanel's `--dk-fs-*` references also migrate to global `--fs-*`:
- `--dk-fs-xs` (10px) → `var(--fs-md)`
- `--dk-fs-sm` (11px) → `var(--fs-lg)`
- `--dk-fs-md` (12px) → `var(--fs-base)`
- `--dk-fs-lg` (13px) → `var(--fs-base)` + comment

Remove `--dk-fs-*` declarations from DockPanel after migration.

#### 5d. Update ui-design.md

- Change minimum font-size from 7px to 8px in all component spec tables
- Add font-size scale reference to the Typography section
- Update component spec tables to reference tokens instead of raw px

#### 5e. Add enforcement

Extend the PostToolUse hook to flag raw `font-size: Npx` values in `<style>` blocks (excluding display-tier with `/* display: */` comment).

## Considerations

- **DockPanel `--dk-text-dim` bug**: Currently 0.55, identical to `--dk-text-mid`. Should be 0.35 (= `--dz-text-dim`). Fix during Phase 3.
- **Same-value semantic tokens**: `--lz-divider` and `--lz-bg-hover` are both 0.06 but serve different roles. Keep both — if we later want dividers at 0.05 and hover at 0.07, only the token definition changes.
- **SVG inline attributes** (AlgoGraph, EnvGraph, WaveGraph): These use raw rgba in template markup, not `<style>` blocks. CSS variables work in SVG `fill`/`stroke` attributes, so they can be migrated too, but are lower priority.
- **Spacing exceptions**: Component widths (112px, 128px, 280px, 340px), transform values, and animation values are not part of the spacing system. The hook must only check gap/padding/margin properties.
- **`box-shadow` rgba**: Values inside `box-shadow` can use tokens too, but some combine multiple shadows with different opacities. Migrate where straightforward, skip complex cases.

## Future Extensions

- **Stylelint plugin**: If the team grows beyond solo dev, a proper stylelint rule (`no-raw-rgba`) would catch violations in CI, not just in Claude sessions.
- **Theme switching**: With all colors tokenized, a dark/light theme toggle becomes a `:root` override — no component changes needed.
- **Design token export**: Tokens could be exported as JSON for use in documentation or design tools.
