# UI Design

## Direction: Warm Brutalist + Geometric Graphic Design — DECIDED

Inspired by Swiss International Style and New Brutalism, adapted with a warm cream/navy color palette.
Treats the UI as graphic design first — geometric shapes, bold typography, and high-contrast zones are compositional elements.

### Principles

1. **Geometry drives composition** — Large geometric shapes anchor the visual hierarchy.
2. **Zone inversion** — Dark zones (navy bg / cream fg) and light zones (cream bg / navy fg) create separation without borders.
3. **Bold numbers as visual anchors** — BPM, step count, pattern number displayed at display scale.
4. **No gradients, no shadows** — Depth through border weight, whitespace, and zone contrast only.
5. **Two font roles** — Display font (bold grotesque) for numbers/headings; monospace for all functional data.
6. **Color is reserved for state** — Olive for active trigs, blue for playhead, salmon for alerts.
7. **Geometric elements as texture** — Decorative shapes in zones for visual rhythm.

The landing page (`site/`) extends this direction to a marketing context — see ADR 072 for LP-specific design decisions (palette rationale, typography, geometric boundary decorations, differentiation intent).

## Button Border System — DECIDED

Two tiers based on function:

### Olive tier (1.5px solid `--color-olive`)
Tool and function buttons: TMPL, RND, KBD, Loop, brush (pen/eraser), OCT ▲▼.
- Default: olive border + olive text/icon, transparent background.
- Active/on: olive background + cream text/icon (filled).
- Toggle buttons use **flip-card** animation (`rotateY(180deg)`, 180ms ease-out, `perspective: 60px`). Press-down: `scale(0.85)`.

### FG tier (1px solid `--color-fg`)
Track-level controls: Solo, Mute, Steps, Scale, RST.
- Default: fg border + fg text, transparent background.
- Active/on: Solo → olive fill (flip-card), Mute → fg fill (flip-card).

### Muted tier (1px solid `rgba(30,32,40,0.15)`)
Vel-row mode tabs: VEL, CHNC, MIX, FX.
- Default: muted border + muted text, transparent background.
- Active: `--tab-color` border + text, subtle bg `rgba(30,32,40,0.06)`.
- Fixed width (36px) to prevent layout shift on label change.

### Performance tier (1.5px, distinct colors)
Press-hold buttons with semantic colors:
- FILL, REV: `--color-blue`
- BRK: `--color-salmon`

### Rules
- **No hover states** on rapid-fire buttons (steps, solo, mute) — flicker during fast interaction is distracting.
- **No gradients, no shadows** — consistent with Principle 4.
- SVG icon stroke weight should visually match the button border weight (e.g. `stroke-width="1.5"` for olive-tier icon buttons).
- **No arbitrary colors** — every `border`, `color`, `background` must use an existing CSS variable (`--color-fg`, `--color-olive`, `--color-muted`, etc.) or a value already used by a peer element in the same region. Never invent `rgba()` values.
- **Border-radius: 0 by default** — all buttons, inputs, tabs, panels, and containers use `border-radius: 0`. Exceptions: Track label (4px), circles/dots (50%), toast/snackbar overlays (6px). This is a brutalist design decision — no 2px/3px "soft" rounding.

## StepGrid Element Spec — DECIDED

Strict specifications for every interactive element in StepGrid. All new elements must reference this table.

### Dimensions

| Element | Width | Height | border-radius | Notes |
|---|---|---|---|---|
| Step cell | 24px | 24px | 0 | Square — never change aspect ratio |
| Vel cell | 24px | stretch | 0 | Fills vel-bars height (40px) |
| Track label | 112px | auto | 4px | `padding: 4px 8px` |
| Solo / Mute | 20px | 20px | 0 | Flip-card host, `perspective: 60px` |
| Steps (count) | 20px | 20px | 0 | Flip-card host |
| Scale | 28px | 20px | 0 | Olive tier |
| RST | auto | auto | 0 | `padding: 2px 5px`, FG tier |
| Vel tab | 36px | auto | 0 | `padding: 3px 0`, fixed width |
| Page btn | 20px | 16px | 0 | Olive tier |
| Add track btn | 24px | 24px | 0 | Dashed border |
| Head-sep | 1px | 16px | 0 | Vertical separator within head |
| Track-mix column | 128px | auto | 0 | Fixed width, right of track-seq |
| Mix/Send knob | 24px | 24px | — | Light, compact Knob in track-mix |
| Chevron | 10px | 6px | 0 | Track label expand arrow |
| Lock dot | 4px | 4px | 50% | P-lock indicator on step |
| Chance dot | 4px | 4px | 0 | Rotated 45° diamond |

### Font sizes

| Element | Size | Weight | Letter-spacing |
|---|---|---|---|
| Track name | 11px | 700 | 0.04em |
| Solo / Mute / Steps | 9px | 700 | — |
| Scale label | 7px | 700 | -0.02em |
| Vel tab | 9px | 700 | 0.06em |
| RST | 9px | 700 | 0.04em |
| Page btn | 8px | 700 | — |
| Step-set num | 8px | 700 | — |
| Add track btn | 14px | 400 | — |
| Remove label | 12px | 700 | 0.04em |
| Remove btn | 10px | 700 | 0.06em |
| **Minimum font-size** | **7px** | — | — |

### Colors by tier

| Tier | `color` | `border` | `background` | Used by |
|---|---|---|---|---|
| FG | `--color-fg` | `1px solid var(--color-fg)` | `transparent` | S, M, Steps, RST |
| Olive | `--color-olive` | `1px solid var(--color-olive)` | `transparent` / `--color-olive` (active) | Scale, Page btn, Steps flip-on |
| Muted tab | `--color-muted` | `1px solid --lz-border-strong` | `transparent` | VEL, CHNC, MIX, FX |
| Step off | — | `1px solid --lz-step-border` | `--color-bg` | Inactive step |
| Step on | — | `1px solid var(--color-olive)` | `--color-olive` | Active step |
| Chance | `--color-chance` | — | `--color-chance` | Chance vel bars, chance dot |
| Danger | `--color-danger` | `--danger-border` | `--danger-bg-hover` (hover) | Remove confirm buttons |

### Structural borders

| Border | Token | Value | Purpose |
|---|---|---|---|
| track-controls right | `--lz-border` | `1px solid rgba(30,32,40,0.10)` | Separates controls from steps |
| track-group bottom | `--lz-border-subtle` | `1px solid rgba(30,32,40,0.08)` | Separates track rows |
| track-group left | — | `3px solid transparent` / `--color-olive` | Selected indicator |
| head-sep | `--lz-border-mid` | `1px, rgba(30,32,40,0.12)` | Separator within head |
| track-mix left | `--lz-border` | `1px solid rgba(30,32,40,0.10)` | Separates seq from mix column |

### Spacing

| Area | Property | Value | Notes |
|---|---|---|---|
| track-cols | padding | `0 8px` | Horizontal padding |
| track-controls | padding-right | `8px` | Gap before vertical border |
| track-content | padding-left | `4px` | Gap after vertical border (flex row) |
| track-mix | padding-left / margin-left | `4px` / `4px` | Gap around mix border |
| mix-knobs / send-knobs | height / gap | `40px` / `4px` | Fixed height, centered |
| ctrl-main | height / gap | `40px` / `4px` | Fixed height row |
| ctrl-vel | height / gap | `40px` / `4px` | Fixed height row |
| steps row | padding / gap | `6px 0` / `2px` | Vertical padding, cell gap |
| vel-bars | padding / gap | `4px 0` / `2px` | Vertical padding, cell gap |
| page-bar | padding / gap | `2px 8px 0` / `4px` | Page navigation |
| head-sep margin | margin | `0 4px` | Space around separator |
| add-track btn | margin | `4px 8px` | Below last track |
| --head-w | — | `237px` | label(112) + gaps + buttons |
| page-head width | — | `calc(var(--head-w) + 3px)` | Accounts for left border |

### Track-content layout

Each track row's `.track-content` is a two-column flex row:

```
┌─ track-seq (flex:1) ──────────────────┐│┌─ track-mix (128px fixed) ─┐
│  steps row (16 or 32 cells + page btns) │││  mix-knobs: VOL PAN       │
│  vel-bars / chance bars (if selected)  │││  send-knobs (selected):   │
│                                        │││  VERB DLY GLT GRN         │
└────────────────────────────────────────┘│└────────────────────────────┘
                                          │ ← border-left 1px --lz-border
```

- **track-mix width is fixed at 128px** so the vertical border aligns across all tracks regardless of content.
- VOL/PAN knobs appear on every track (24px, light, compact).
- VERB/DLY/GLT/GRN send knobs appear only on the selected track (24px, light, compact).
- P-Lock indicators (olive arc) shown only on the selected track where `trackPlkValue`/`isTrackPlkLocked` helpers apply.
- Non-selected tracks use raw baseline values directly (helpers use `ui.selectedTrack` internally).
- RST button resets both per-step automation and baseline mix/send values (VOL→0.8, PAN→0, sends→0).

### Responsive step paging

Step page size adapts to the available width of `.track-seq`:
- **≥ 832px** (32 × 26px): show 32 steps per page
- **< 832px**: show 16 steps per page (default)

Measured via `ResizeObserver` on a hidden `.seq-measure` div. The value is stored in `ui.stepPageSize` and shared across StepGrid, PianoRoll, and PatternToolbar.

## AppHeader Element Spec — DECIDED

### Dimensions

| Element | Width | Height | border-radius | Notes |
|---|---|---|---|---|
| Top bar | 100% | 40px (32px compact) | — | `padding: 0 12px` |
| Sub-header | 100% | 64px (52px compact) | — | `padding: 0 12px 0 8px` |
| Logo | 18px | 18px (14px compact) | — | SVG 4×4 grid |
| BPM adj btn | 24px | 24px (28px mobile) | 0 | +/− buttons |
| BPM input | 3.5ch | auto | 2px | Inline edit mode |
| Transport btn | auto | auto | 0 | `padding: 4px 10px` |
| REC btn | auto (28px mobile) | auto (28px mobile) | 0 | `padding: 4px 10px` |
| View btn | auto | auto | 0 | `padding: 4px 10px` |
| Nav btn | auto | auto | 0 | `padding: 4px 10px` |
| Separator | 1px | 28px | 0 | Vertical separator |
| CPU dot | 4px | 8px | 1px | 6 dots, 2px gap |
| Dirty dot | 6px | 6px | 50% | Unsaved indicator |
| Overflow btn (mobile) | 32px | 32px | 50% | ⋯ menu trigger |

### Font sizes

| Element | Size | Weight | Letter-spacing |
|---|---|---|---|
| App name | 10px | 700 | 0.14em |
| Version badge | 8px | 600 | 0.06em |
| CPU label | 9px | 700 | — |
| BPM value | 18px (16px compact) | 700 | 0.02em |
| BPM input | 24px (18px compact) | 700 | — |
| BPM label | 9px | 700 | — |
| BPM adj | 14px | 700 | — |
| Transport btn | 11px | 700 | — |
| REC btn | 9px | 700 | — |
| View btn | 9px | 700 | — |
| Nav btn | 9px | 700 | — |
| Overflow item | 12px | — | — |

### Colors (dark zone tokens)

| Element | State | color | border | background |
|---|---|---|---|---|
| Background | — | `--color-bg` | — | `--color-fg` |
| Sub-header | — | `--color-bg` | `1px solid --dz-divider` (top) | `--color-fg` |
| Nav/View btn | default | `--dz-text-mid` | `1.5px solid --dz-btn-border` | `--dz-bg-hover` (≈0.04) |
| Nav/View btn | hover | `--dz-text` | same | `--dz-bg-hover` |
| Nav/View btn | active | `--dz-text-bright` | `--dz-border-mid` (0.50) | `--dz-bg-press` (≈0.14) |
| Transport btn | default | `--color-bg` | `1px solid --dz-transport-border` | transparent |
| Transport btn | active | `--color-fg` | same | `--color-bg` |
| REC btn | armed | `--color-salmon` | `color-mix(salmon 50%, transparent)` | transparent |
| REC btn | recording | `--color-salmon` | same | `color-mix(salmon 10%, transparent)` |
| BPM adj | default | `--dz-text` (0.6) | `1px solid --dz-border-strong` | transparent |
| BPM adj | active | same | same | `--dz-bg-press` |
| Separator | — | — | — | `--dz-bg-active` (0.12) |
| CPU dots | off | — | — | `--dz-bg-active` |
| CPU dots | normal | — | — | olive (semantic) |
| CPU dots | warning | — | — | amber (semantic) |
| CPU dots | critical | — | — | red blink (semantic) |

### Spacing

| Area | Property | Value |
|---|---|---|
| Top bar padding | padding | `0 12px` |
| Sub-header padding | padding | `0 12px 0 8px` |
| Sub-header gap | gap | `16px` (10px compact) |
| BPM block gap | gap | `4px` |
| Transport gap | gap | `4px` (8px mobile) |
| View toggle gap | gap | `4px` (0 mobile) |
| Header nav gap | gap | `4px` |
| Perf buttons gap | gap | `4px` |
| CPU dots gap | gap | `2px` |
| Logo margin-right | margin-right | `5px` |

## PatternToolbar Element Spec — DECIDED

### Dimensions

| Element | Width | Height | border-radius | Notes |
|---|---|---|---|---|
| Toolbar | 100% | auto | — | `padding: 8px 12px 10px`, `gap: 12px` |
| Pat dot | 8px | 8px | 50% | Pattern color indicator |
| TMPL btn | auto | auto | 0 | `padding: 4px 8px`, olive tier |
| TMPL dropdown | min 100px | auto | 4px | `padding: 2px` |
| White key | 22px | 28px | 0 | 1px gap between keys |
| Black key | 16px | 28px | 0 | Over white keys |
| OCT adj btn | 20px | 20px | 0 | Olive tier 1.5px |
| OCT value | min 2ch | auto | — | Display font 22px |
| RND btn | auto | 24px | 0 | `padding: 4px 10px`, olive tier |
| GEN btn | auto | 24px | 0 | `padding: 4px 8px`, olive tier |
| Track select | max 72px | 24px | 0 | `padding: 2px 4px` |
| LOOP btn | 28px | 28px | 0 | Olive tier 1.5px |
| Close btn | 24px | 24px | 0 | FG tier 1.5px |
| Separator | 1px | 24px | 0 | `--lz-border` |
| Key trigger (mobile) | 34px | 34px | 50% | Circle |
| OCT adj mobile | 22px | 16px | 0 | Olive tier |

### Font sizes

| Element | Size | Weight | Letter-spacing |
|---|---|---|---|
| Pat label | 9px | 700 | — |
| TMPL btn | 8px | 700 | — |
| TMPL option | 9px | — | — |
| Piano key | 8px | 700 | — |
| Group label | 9px | 700 | — |
| OCT adj | 12px | 700 | — |
| OCT value | 22px | 700 | — |
| RND / GEN btn | 9px | 700 | — |
| Close btn | 12px | 700 | — |
| Track select | 8px | — | — |
| VKBD info | 9px | — | — |
| MIDI indicator | 8px | — | — |
| Key trigger (mobile) | 11px | 700 | — |
| Fan key label (mobile) | 7px | 700 | — |

### Colors (light zone)

| Element | State | color | border | background |
|---|---|---|---|---|
| Toolbar | — | — | `1px solid --lz-border-subtle` (bottom) | `--color-bg` |
| Pat label | — | `--lz-text` | — | — |
| Group label | — | `--lz-text-hint` | — | — |
| Olive btn (TMPL, RND, GEN, LOOP, OCT) | default | `--color-olive` | `1.5px solid --color-olive` | transparent |
| Olive btn | active | `--color-bg` | same | `--color-olive` |
| LOOP btn | active | `--color-olive` | same | `--olive-bg-subtle` |
| LOOP btn | mismatch | `--lz-border-strong` (0.20) | `--lz-border` (0.10) | — |
| Close btn | default | `--color-fg` | `1.5px solid --color-fg` | transparent |
| White key | default | `--color-fg` | `1px solid --lz-border` | `rgba(255,255,255,0.7)` |
| White key | active | `#fff` | `--color-olive` | `--color-olive` |
| Black key | default | `--dz-text-mid` (0.50) | — | `--color-fg` |
| Black key | active | `#fff` | — | `--color-olive` |
| OCT value | — | `--lz-text-mid` (0.60) | — | — |
| Separator | — | — | — | `--lz-border` |
| Track select | — | `--lz-text` (0.65) | `1px solid --lz-border-strong` | transparent |
| TMPL dropdown | — | — | `1px solid rgba(30,32,40,0.20)` | `--color-bg` |
| TMPL option | default | `--lz-text-strong` | — | transparent |
| TMPL option | hover | `--color-fg` | — | `--lz-bg-active` |

### Spacing

| Area | Property | Value |
|---|---|---|
| Toolbar | padding | `8px 12px 10px` |
| Toolbar | gap | `12px` (8px mobile) |
| Pat indicator | gap | `5px` |
| OCT block | gap / margin-left | `3px` / `8px` |
| Toolbar group | gap | `8px` |
| Keyboard | gap | `1px` |
| Key padding-bottom | padding | `3px` |
| Key trigger mobile | gap | `4px` |
| TMPL dropdown | padding | `2px` |
| TMPL option | padding | `6px 10px` |

## MatrixView Element Spec — DECIDED

### Dimensions

| Element | Width | Height | border-radius | Notes |
|---|---|---|---|---|
| Panel | 120px | 100% | — | `border-right: 1px solid --lz-divider` |
| Grid cell | 24px | 24px | 0 | Square, matches step cell |
| Head dot | 8px | 8px | 50% | Pattern color dot |
| Scene btn (→) | 18px | 16px | 0 | Add-to-scene button |
| In-scene dot | 3px | 3px | 50% | Top-right of cell |

### Font sizes

| Element | Size | Weight | Letter-spacing |
|---|---|---|---|
| Head name | 8px | 700 | — |
| Scene btn | 9px | 700 | — |

### Colors (light zone)

| Element | State | color | border | background |
|---|---|---|---|---|
| Panel | — | — | `1px solid --lz-divider` (right) | `--color-bg` |
| Head | — | — | `1px solid --lz-border-subtle` (bottom) | — |
| Head name | — | `--lz-text` | — | — |
| Scene btn | default | `--lz-text-mid` (0.45) | `1px solid --lz-border-strong` | transparent |
| Scene btn | hover | `--color-fg` | same | `--lz-bg-hover` |
| Scene btn (has scene) | default | `--color-olive` | `--olive-border` | transparent |
| Scene btn (has scene) | hover | `--color-olive` | same | `--olive-bg-subtle` |
| Cell | default | — | `1px solid --lz-step-border` | `--color-bg` |
| Cell | has-data | — | same | `var(--pat-hex)` (pattern color) |
| Cell | selected | — | `2px solid --color-fg` | — |
| Cell | playing | — | `--color-olive` (animated) | — |
| Cell | queued | — | `2px dashed --color-olive` (animated) | — |
| Cell | solo | — | `inset 0 0 0 1px --color-blue` | — |
| In-scene dot | — | — | — | `--color-olive` at 0.7 opacity |

### Spacing

| Area | Property | Value |
|---|---|---|
| Matrix head | padding / gap | `6px 6px 4px` / `4px` |
| Head name | padding | `1px 3px` |
| Matrix grid | padding / gap | `6px` / `2px` |
| In-scene dot | top / right | `2px` / `2px` |

## PianoRoll Element Spec — DECIDED

### Dimensions

| Element | Width | Height | border-radius | Notes |
|---|---|---|---|---|
| Piano-roll | 100% | 244px | — | `padding: 0 8px`, `gap: 4px` |
| Piano spacer | `var(--head-w)` | auto | — | `border-right: 1px solid --lz-border` |
| Oct-keys | 28px (26px mobile) | auto | — | — |
| Key row | 28px (26px mobile) | `calc(216px/rows)` | — | — |
| Oct btn | 28px | 14px | 0 | ▲/▼ octave buttons |
| Note cell | 24px (18px mobile) | auto | 0 | Grid cell |
| Active note | — | — | 1px | 1px margin inset |
| Continuation note | — | — | 1px | 1px margin inset |
| Brush btn | 20px | 20px | 0 | `perspective: 60px`, flip-card |
| Chord select | 100% | auto | 3px | Dropdown |
| Resize handle | 5px | 100% | 0 1px 1px 0 | Note bar resize grip |
| Grid cap | — | 14px | — | Top cap area |

### Font sizes

| Element | Size | Weight | Letter-spacing |
|---|---|---|---|
| Oct btn | 8px | 700 | — |
| Key label | 7px (6px mobile) | 700 | — |
| Chord select | 9px | 700 | — |

### Colors (light zone)

| Element | State | color | border | background |
|---|---|---|---|---|
| Piano spacer | — | — | `1px solid --lz-border` (right) | — |
| Key (white) | — | — | `1px solid --lz-divider` (0.07→use 0.06) (bottom) | `--color-bg` |
| Key (black) | — | — | same | `--color-surface` |
| Key (disabled) | — | opacity 0.3 | — | `--salmon-bg-key` |
| Oct btn | default | `--color-muted` | — | `--color-surface` |
| Oct btn | hover | `--color-bg` | — | `--color-olive` |
| Row | — | — | `1px solid --lz-divider` (bottom) | transparent |
| Row (black) | — | — | same | `rgba(30,32,40,0.025)` → use `--lz-bg-hover` (0.06 closest) |
| Row (disabled) | — | — | — | `--salmon-bg-scale` |
| Cell | default | — | — | transparent |
| Cell | active | — | — | `--color-olive`, `margin: 1px` |
| Cell | continuation | — | — | `rgba(108,119,68,0.3)` = olive at 0.30 |
| Cell | selected | — | `1.5px solid --color-blue` (outline) | — |
| Select rect | — | — | `1.5px dashed --color-blue` | `--blue-bg-subtle` |
| Resize handle | — | — | — | `rgba(0,0,0,0.15)` |
| Playhead column | — | — | — | `--blue-bg-playhead` |

### Spacing

| Area | Property | Value |
|---|---|---|
| Piano-roll | padding / gap | `0 8px` / `4px` (2px left, 4px right mobile) |
| Brush bar | padding-top / gap | `8px` / `2px` |
| Row | gap | `2px` (1px mobile) |
| Key | padding-right | `3px` |

## Sidebar Element Spec — DECIDED

### Dimensions

| Element | Width | Height | border-radius | Notes |
|---|---|---|---|---|
| Sidebar | 280px | auto | — | `position: fixed`, `top: 104px`, z-index 110 |
| Close btn | 24px | 24px | 0 | — |
| Lang btn | auto | auto | 0 | `padding: 2px 6px` |
| System tab | auto | auto | 0 | `padding: 8px 0`, 2px bottom border |
| Reset btn | auto | auto | 0 | `padding: 6px 12px` |
| Guide float | calc(100%-32px) | auto | 6px | max-width 480px, bottom 8px |

### Font sizes

| Element | Size | Weight | Letter-spacing |
|---|---|---|---|
| Sidebar title | 10px | 700 | 0.14em |
| Lang btn | 9px | 700 | 0.06em |
| Close btn | 16px | — | — |
| System tab | 9px | 700 | 0.10em |
| Guide label | 7px | 700 | 0.10em |
| Guide text | 10px | — | — |
| Setting label | 10px | 700 | 0.10em |
| Footer link | 10px | — | 0.04em |
| Reset btn | 10px | 700 | 0.06em |
| Reset warn | 11px | — | — |

### Colors (dark zone tokens)

Sidebar should adopt `--dz-*` tokens. Current values map to:

| Element | State | color | border | background |
|---|---|---|---|---|
| Panel | — | `--color-bg` | — | `--color-fg` |
| Title | — | `--dz-text-mid` (0.50) | — | — |
| Head border | — | — | `1px solid --dz-border-subtle` (0.10) | — |
| Lang / Close btn | default | `--dz-text-mid` | `1px solid --dz-border-strong` | transparent |
| Lang / Close btn | active | same | same | `--dz-bg-press` |
| System tab | default | `--dz-text-dim` | `2px solid transparent` (bottom) | transparent |
| System tab | hover | `--dz-text-mid` | same | — |
| System tab | active | `--dz-text-bright` | `--color-olive` (bottom) | — |
| Footer border | — | — | `1px solid --dz-bg-hover` (0.08) | — |
| Footer link | default | `--dz-text-dim` (0.40) | — | — |
| Footer link | hover | `--dz-text` (0.70) | — | — |
| Setting label | — | `--dz-text-mid` (0.50) | — | — |
| Reset btn | — | `--color-salmon` | `1px solid --color-salmon` | transparent |
| Cancel btn | — | `--dz-text-mid` | `1px solid --dz-border-strong` | transparent |
| Guide float | — | — | `1px solid --dz-border-subtle` | `rgba(30,32,40,0.92)` |
| Guide label | — | `--color-olive` | — | — |
| Guide text | — | `--dz-text` (0.70) | — | — |

### Spacing

| Area | Property | Value |
|---|---|---|
| Sidebar head | padding | `10px 12px` |
| Head right buttons | gap | `6px` |
| Sidebar body | padding | `8px 0` |
| Footer | padding / margin-top | `12px 16px` / `auto` |
| Footer links | padding-bottom / margin-bottom | `12px` / `8px` |
| Setting label | margin-bottom | `8px` |
| Reset actions | gap | `8px` |
| Guide float | padding / gap | `6px 12px` / `8px` |

## Color Palette — DECIDED

```css
--color-bg:      #EDE8DC;   /* warm cream — page background */
--color-fg:      #1E2028;   /* dark navy — primary text, borders, dark zones */
--color-surface: #E2DDD3;   /* slightly darker cream — subtle panel differentiation */
--color-muted:   #9A9680;   /* warm gray — inactive steps, disabled controls */
--color-olive:   #787845;   /* olive green — active trig, selected key */
--color-blue:    #4472B4;   /* steel blue — playhead, FILL/REV buttons */
--color-salmon:  #E8A090;   /* salmon — BRK button, record/alert, GLT node */
--color-purple:  #9B6BA0;   /* soft violet — granular FX node */
--color-teal:    #508080;   /* teal — filter node */
```

The palette is warm and restrained. Olive, blue, salmon, purple, and teal are chromatic; everything else is cream/navy/gray.

### Derived semantic colors

```css
--color-chance:  #5b7dba;   /* chance mode bars — distinct from --color-blue playhead */
--color-danger:  #f87171;   /* destructive actions (remove track, delete node) */
```

## Opacity Token System — DECIDED

Every translucent color in the app is built from **one of two base RGB values** at a fixed set of opacity steps. Never invent a new `rgba()` value — pick the closest step below.

### Light zone (cream bg) — base `30,32,40` (≈ `--color-fg`)

Used for borders, text, backgrounds on cream/surface backgrounds.

| Token | Opacity | Use |
|---|---|---|
| `--lz-divider` | 0.06 | Row dividers, faintest borders |
| `--lz-border-subtle` | 0.08 | Track-group bottom, section borders |
| `--lz-border` | 0.10 | Control separators, piano-spacer border |
| `--lz-border-mid` | 0.12 | head-sep, slightly stronger separators |
| `--lz-border-strong` | 0.15 | Vel-tab border, inactive button borders |
| `--lz-bg-hover` | 0.06 | Track-label hover, active tab bg |
| `--lz-bg-active` | 0.08 | Track-label expanded |
| `--lz-bg-press` | 0.14 | Button :active state |
| `--lz-text-hint` | 0.35 | Group labels, muted indicators |
| `--lz-text-mid` | 0.50 | Step-set numbers, secondary text |
| `--lz-text` | 0.55 | Pattern name, inactive button text |
| `--lz-text-strong` | 0.70 | Dropdown options, hover text |
| `--lz-step-border` | 0.50 | Inactive step cell border |

### Dark zone (navy bg) — base `237,232,220` (≈ `--color-bg`)

Used for borders, text, backgrounds on navy/fg backgrounds. DockPanel already defines `--dk-*` tokens; AppHeader and Sidebar should adopt the same system.

| Token | Opacity | Use |
|---|---|---|
| `--dz-divider` | 0.06 | Sub-header top border, faintest borders |
| `--dz-bg-hover` | 0.08 | Button hover bg |
| `--dz-border-subtle` | 0.10 | Sidebar head/footer borders |
| `--dz-bg-active` | 0.12 | Separator lines |
| `--dz-bg-press` | 0.15 | Button :active bg |
| `--dz-border` | 0.15 | Default borders (= `--dk-border`) |
| `--dz-border-mid` | 0.25 | Badge borders, strong borders |
| `--dz-border-strong` | 0.30 | Input borders, BPM adj borders |
| `--dz-text-dim` | 0.35 | CPU label, BPM label, muted text |
| `--dz-text-mid` | 0.55 | Inactive buttons, secondary text |
| `--dz-text` | 0.70 | Dropdown options, hover text |
| `--dz-text-strong` | 0.85 | Primary text (= `--dk-text`) |
| `--dz-text-bright` | 0.90 | Active state text |
| `--dz-btn-border` | 0.35 | Nav/view button borders (1.5px) |
| `--dz-transport-border` | 0.45 | Transport/REC button borders (1px) |

### Accent overlays

Translucent versions of accent colors for backgrounds/borders:

| Token | Value | Use |
|---|---|---|
| `--olive-bg-subtle` | `rgba(120,120,69,0.08)` | Loop active bg |
| `--olive-bg-mid` | `rgba(120,120,69,0.15)` | Step-set active cell |
| `--olive-bg-hover` | `rgba(120,120,69,0.30)` | Step-set hover |
| `--olive-border` | `rgba(120,120,69,0.40)` | Step-set active border |
| `--blue-bg-subtle` | `rgba(68,114,180,0.08)` | Select rect bg |
| `--blue-bg-playhead` | `rgba(68,114,180,0.13)` | Piano-roll playhead column |
| `--salmon-bg-scale` | `rgba(232,160,144,0.06)` | Disabled scale-mode rows |
| `--salmon-bg-key` | `rgba(232,160,144,0.08)` | Disabled scale-mode keys |
| `--danger-border` | `rgba(248,113,113,0.40)` | Delete confirm border |
| `--danger-bg-hover` | `rgba(248,113,113,0.15)` | Delete hover bg |

### Rules

- **Pick the closest step** — do not interpolate (e.g., use 0.08 not 0.07).
- **Dark zone components** must use `--dk-*` or `--dz-*` tokens, never raw `rgba(237,…)`.
- **Light zone components** must use `--lz-*` tokens, never raw `rgba(30,…)`.
- **Accent overlays** use the named token (e.g., `--olive-bg-subtle`), never raw olive/blue rgba.
- CPU meter colors are **semantic exceptions** (amber warning, red critical) — kept as-is.

## Spacing System — DECIDED

### Gap scale

| Step | Value | Use |
|---|---|---|
| xs | 2px | Steps between cells (step grid, vel bars, piano-roll rows) |
| sm | 4px | Between controls in a row (ctrl-main, ctrl-vel, page-bar) |
| md | 8px | Standard section spacing (toolbar groups, dock sections) |
| lg | 12px | Panel padding horizontal, toolbar padding |
| xl | 16px | Dock panel content padding, large section spacing |

### Padding patterns

| Context | Value | Examples |
|---|---|---|
| Panel horizontal | 12px | AppHeader, PatternToolbar, Sidebar head |
| Panel vertical | 8–10px | PatternToolbar (8px top, 10px bottom), Sidebar body |
| Dock content | 12px–16px | DockPanel param-content |
| Compact row | 0 8px | track-cols horizontal padding |
| Button internal | 4px 8–10px | Transport, view, nav buttons |
| Compact button | 2px 5–6px | RST, CLR, scale, lang buttons |
| Cell padding | 6px 0 | Steps row, vel-bars row (vertical only) |

## Typography — DECIDED

### Display font — bold grotesque
Used for: BPM number, pattern number, split-flap displays, section headings.

```css
font-family: "Bebas Neue", "Anton", sans-serif;
```

### Data font — monospace
Used for: parameter values, labels, step numbers, all interactive controls.

```css
font-family: "JetBrains Mono", "Fira Code", monospace;
font-size-base: 12px;
line-height: 1.4;
```

Labels are ALL CAPS with `letter-spacing: 0.08em`.

## Zone Layout — DECIDED

```
█ = dark zone (navy bg)   ░ = light zone (cream bg)

┌█████████████████████████████████████████████████████┐
│█ ● INBOIL  [oscilloscope]        CPU ●●●○○○  [⚙] █│  ← AppHeader top bar
│█ [−120+] [▶][■][●REC] | SCENE FX EQ MST | [FILL][REV][BRK] | [?][SYS] █│  ← sub-header
├█████████████████████████████████████████████████████┤
│█ PatternToolbar: [color●name] [TMPL] [KEY][OCT▼▲] [RND] [GEN] [VKBD] [LOOP] [✕] █│
├░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┤
│░ MatrixView │░ SceneView (always main)                  ░│█ DockPanel █│
│░ (pattern   │░ ┌─ overlay sheets (pattern/FX/EQ) ─┐    ░│█ (PARAM   █│
│░  pool      │░ │  StepGrid / TrackerView           │    ░│█  knobs,  █│
│░  browser)  │░ │  FxPad / FilterView               │    ░│█  minimi- █│
│░            │░ └───────────────────────────────────┘    ░│█  zable)  █│
│░            │░                                          ░│█          █│
└░░░░░░░░░░░░┴░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┴████████████┘
```

## Components

### SplitFlap (パタパタ) Display — DECIDED

Split-flap mechanical display for BPM, pattern number, and track name.
Each character flips independently with a 3D CSS animation:
- Top half: previous value → rotates down (`rotateX(-90deg)`)
- Bottom half: next value revealed

Uses `perspective`, `transform-style: preserve-3d`, `backface-visibility: hidden`.
Flip duration: 180ms ease-out.

### Step Button (Trig) — DECIDED

Steps use an **Othello-style flip** to toggle between active/empty states.

**Structure:**
```html
<button class="step">
  <span class="step-flip" class:flipped={trig.active}>
    <span class="face off"></span>   <!-- cream/empty face -->
    <span class="face on"></span>    <!-- olive/active face, rotateY(180deg) back -->
  </span>
</button>
```

**Toggle animation:** 3D `rotateY` flip (200ms ease-in-out) between faces.
- Empty → Active: flip from cream to olive face.
- Active → Empty: flip back.

**Playhead animation:** `filter: brightness(1.5→1)` glow pulse (180ms ease-out). Uses CSS `filter` rather than `transform` to avoid conflicting with the flip animation.

### Knob / Parameter Control — DECIDED

SVG-based rotary knob with 270° travel arc.
- Drag vertically to change value (up = increase).
- Shows arc indicator and ALL CAPS label below.
- Cursor: `ns-resize` on hover.
- Default size: 32px. DockPanel knobs: 36px. PerfBar knobs: 36px. StepGrid inline knobs: 24px. TrackerView sidebar knobs: 20px.
- Value is 0.0–1.0 normalized; actual value computed by `paramDefs.ts`.

Props:
- `light`: dark strokes for use on cream background (StepGrid track row).
- `compact`: hides the numeric value display, keeps label visible. Used for inline mix/send knobs in StepGrid and TrackerView.

### PatternToolbar (formerly PerfBar) — DECIDED

Pattern editing controls strip (dark zone). Shown when a pattern sheet is open. Layout:

```
[color● name] [TMPL] | [KEY piano] [OCT ▼ 0 ▲] | [RND] [GEN] [VKBD] | [LOOP]  [✕]
```

- **Pattern indicator**: Colored dot + pattern name label (left-aligned).
- **TMPL**: Template dropdown (Standard, Techno, House, Ambient, HipHop, Drum Kit, Synth, Breaks, Minimal).
- **KEY**: 12-key piano keyboard. Active key shown in olive.
- **OCT**: Octave shift −/+ buttons with display font value (-2 to +2). Pending changes shown with 400ms blink (`isPendingOct`).
- **RND**: Randomize pattern button.
- **GEN** (conditional): Generate/sparkle button + target track selector. Only appears when upstream generative nodes exist in scene.
- **VKBD** (desktop only): Virtual keyboard toggle. When active, shows `C{octave}` label. See ADR 031.
- **MIDI indicator** (desktop only): Shows "MIDI" when MIDI input is active.
- **LOOP**: Loop current pattern button (right-aligned).
- **CLOSE** (✕): Close pattern editor sheet.

Note: Master mixing controls (DUC, CMP, GAIN, SWG) are in the **MasterView** overlay sheet, not in the toolbar. View switching (SCENE/FX/EQ/MST) and performance buttons (FILL/REV/BRK) are in **AppHeader**.

On mobile (`< 640px`):
- **Keyboard → Fan-out bubble menu**: Full piano keyboard replaced by a circular trigger button (shows current root note, e.g. "C") + compact stacked octave ▲/▼. Tapping the trigger opens a **fan-arc keyboard overlay**: 12 rectangular piano keys arranged in a quarter-circle arc (0°–90°). White keys on outer ring (R=130), black keys on inner ring (R=78). Keys are rotated radially with counter-rotated labels. Semi-transparent backdrop (rgba(0,0,0,0.25)) dims the background. Animation: 150ms scale+rotate with 15ms stagger per key.
- TMPL, RND remain. VKBD hidden. Separators hidden.

### FxPad — DECIDED

XY performance surface (dark zone). Rendered as an overlay sheet over SceneView (ADR 054).

**Structure:**
- `fx-view` outer container (`flex: 1`, column layout)
- `fx-pad` inner area: XY touch surface with canvas visualizer + draggable nodes
- `sends-bar` footer: per-track send mixer

**4 FX nodes** (circle buttons, 48px):
- VERB (olive), DLY (blue), GLT (salmon), GRN (purple)
- Tap: toggle on/off. Drag: move position (XY 0–1).
- Active: filled with node color + glow shadow. Inactive: outline only.
- Dragging: scale(1.25) + larger glow.

**Audio visualizer** (Canvas 2D behind nodes):
- 3D wireframe terrain: 18 rows × 32 columns, frequency-displaced
- Colors: olive → blue → salmon → purple by depth
- Perspective projection, DPR-aware
- RAF loop only when FxPad sheet is open (`ui.phraseView === 'fx'`)

**Sends bar** (compact dark footer):
- Track dots (8, olive active), track name label
- VERB, DLY, GLT, GRN send knobs (28px) for selected track
- Per-track FX send baselines are also editable inline in StepGrid and TrackerView

### FilterView — DECIDED

XY filter/EQ surface (dark zone). Rendered as an overlay sheet over SceneView (ADR 054).

**Structure:**
- `.filt-pad` inner area: touch/drag surface with 4 nodes
- No sends bar — nodes directly control master filter and 3-band EQ

**4 nodes** (circle buttons, 44px):
- **FILTER** (teal): Master filter sweep. X = LP ← 0.5 → HP, Y = resonance. Tap toggles on/off.
- **LOW** (olive): Low-band EQ. X = frequency, Y = gain (center = 0dB). Tap toggles on/off.
- **MID** (blue): Mid-band EQ. Same as LOW.
- **HIGH** (salmon): High-band EQ. Same as LOW.
- Active: filled with node color. Inactive: outline only, shows "OFF" label.

**Node positioning:** X/Y mapped to 0–1 range within padded area (20px inset). Nodes clamped to pad bounds. Drag with pointer capture.

### TrackerView — DECIDED

M8-style vertical single-track step editor (`ui.phraseView === 'tracker'`). Shows columns: NOTE/VEL/DUR/SLD/CHN. Keyboard-navigable with arrow keys. Uses `activeCell(trackId)` — edits the same data as StepGrid. Track selector bar at the top.

**Sidebar mix/send**: Bottom of the track sidebar, pushed down with `margin-top: auto`. Baseline-only knobs (20px, compact, dark theme) for VOL/PAN (MIX section) and VERB/DLY/GLT/GRN (SEND section). Per-step P-Lock editing uses the tracker columns instead.

### VoicePicker (in DockPanel) — DECIDED

Voice selection is integrated into DockPanel as category tabs + voice list (moved from separate bubble menu). Category tabs: DRUM / BASS / LEAD / SAMPLER. Clicking a voice calls `changeVoice(trackIdx, voiceId)` (resets cell voiceParams to new voice defaults).

### SceneView — DECIDED

Node-based directed graph canvas. Always the main view (ADR 054). Full arrangement editor.

- Canvas rendering with `requestAnimationFrame` for edges, arrowheads, edge order badges, playback highlights
- HTML overlay for nodes (positioned absolutely via CSS `calc()`)
- Zoom/pan (pinch, scroll wheel, Space+drag pan)
- Node drag to reposition; group drag for multi-selected nodes
- Edge creation: drag from blue connection handle (dot) on node to another node; long-press node on mobile
- Node click: selects pattern and syncs `ui.currentPattern` to Grid/Tracker
- Double-tap pattern node: open pattern sheet; double-tap function node: set as root
- Satellite attach: fn nodes (transpose/repeat/tempo/fx) attach to pattern nodes as satellites — click pattern in placement mode to attach, drag to detach/reattach (ADR 116)
- Rectangle select: background drag to select multiple nodes
- Delete/Backspace: delete selected node or edge
- Tool palette (center): 34px circular buttons for adding nodes, grouped by category — FN tools (neutral), GEN tools (accent-colored border: olive/teal/purple), Label. Distinct from UI controls (ADR 116)
- View controls (right): 28px square buttons — auto-layout (horizontal/vertical), focus root, focus playing, zoom reset. Flat style, visually recessive
- Long-press background: opens bubble menu for adding nodes/labels (mobile)
- Drag from MatrixView: drop pattern onto canvas to add pattern node
- Copy/paste (Ctrl+C, Ctrl+Shift+C for subgraph, Ctrl+V)

### MatrixView — DECIDED

Compact left sidebar (desktop only) showing the pattern pool as a grid of 24×24px square cells. Shows density via opacity, selection (olive border), playing state (olive pulse animation, BPM-synced), solo (blue inset shadow), and scene usage (small olive dot). Single-tap calls `selectPattern()`. Double-tap opens pattern editor sheet (overlay). Header includes arrow (→) button to add selected pattern to scene.

### SectionNav — REMOVED

Legacy linear-section navigator. Fully removed (ADR 095). Superseded by Scene graph (ADR 044) + MobileMatrixView for pattern selection. Component file retained but unused.

### Sidebar — DECIDED

App-level fixed right drawer (280px width, dark zone, z-index 110) for help and settings content. Independent of DockPanel and view area (ADR 055).

**Structure:**
- Header: title (HELP / SYSTEM), language toggle (help only), close button
- Body: scrollable content area
- Footer: hover guide (help, desktop only) or factory reset (system)

**Help mode:**
- 6 collapsible categories: GETTING STARTED, SEQUENCER, SOUND, MIXER & FX, ARRANGEMENT, PERFORMANCE (17+ sections total)
- Search filter for finding help sections
- Language toggle (EN/JP)
- Link to full tutorial docs (Astro Starlight site)
- GUIDE footer: shows contextual description when user hovers over `data-tip` elements (desktop only)

**System mode** (ADR 085):
Two sub-tabs: PROJECT / SETTINGS.

PROJECT tab:
- NEW PROJECT / SAVE AS buttons
- Project name with inline edit
- Demo project (Factory Demo)
- Project list (tap to load, rename, delete)
- EXPORT/IMPORT section: Export JSON, Import JSON, Export MIDI

SETTINGS tab:
- Scale Mode toggle (ON/OFF)
- Language toggle (JP/EN)
- MIDI Input: device selection and connection status (ADR 081)
- About section (version info)
- Factory Reset with two-step confirmation (footer)

**REC button** (in AppHeader sub-header): Armed-then-record WAV capture via MediaRecorder (ADR 085).

See ADR 017, ADR 018, ADR 081, and ADR 085 for details.

### DockPanel — DECIDED

Right-side param dock (340px, dark zone). Minimizable to 16px thin strip via left-edge handle grip (ADR 055). State persisted as `ui.dockMinimized` in localStorage.

Contents (multi-mode, context-dependent):

**Default mode** (pattern sheet open):
- **Selected track name**: Shows current track's voice name above voice picker
- **Voice category tabs**: DRUM/BASS/LEAD/SAMPLER for voice selection
- **Voice list**: Voices in selected category, click to change
- **Preset browser** (WT only): Collapsible section with category filter pills (ALL/LEAD/BASS/PAD/PLCK/KEYS/FX) and scrollable preset list. Shows selected preset name in toggle button. Applies all voiceParams via `applyPreset()`.
- **Sample loader** (Sampler/Crash/Ride): LOAD button for file input, POOL button for inline Audio Pool browser (ADR 104). Uploaded samples auto-added to pool. Pool browser provides folder drill-down, search, audition (▸), and one-tap assign. User samples support rename, move, and delete.
- **Lock toolbar**: LOCK/STEP/CLR for parameter lock mode
- **Synth knob grid**: Voice parameters from `paramDefs.ts`
- ~~Send/Mixer knobs~~ — moved to StepGrid inline (VOL/PAN for all tracks, VERB/DLY/GLT/GRN for selected track) and TrackerView sidebar

**Track editor tabs** (ADR 092): DockTrackEditor with TRACKS / SCENE tabs when pattern sheet is open.

**Function node editor** (ADR 093): When a scene function node is selected, DockPanel shows its parameters with full-size knobs. SceneNodePopup shows read-only labels only.

**Generative node editor** (ADR 078): DockGenerativeEditor for Turing Machine, Quantizer, Tonnetz node parameters.

**Automation editor** (ADR 026): Inline automation curves for global/track/FX/EQ targets.

**Scene navigator** (ADR 070): BFS tree view of placed scene nodes with depth indentation, decorator labels, and playing-node pulse animation.

**Split layout for overlay sheets**: When FX/EQ/MST sheets are open, DockPanel splits into upper (scene navigator) + lower (sheet-specific controls).

FX/EQ/Master are rendered as overlay sheets (ADR 054). Help/System are in the Sidebar (ADR 055).

#### DockPanel Styling Rules

DockPanel and its sub-components (DockGenerativeEditor, DockPresetBrowser) share CSS custom properties defined on the `.dock` root element. **All new Dock sub-components must use these tokens — never hardcode font sizes, colors, or opacities.**

**Font size tokens** (minimum 10px for readability):
```
--dk-fs-xs: 10px   — category tags, secondary labels
--dk-fs-sm: 11px   — button text, param values
--dk-fs-md: 12px   — list items, input fields
--dk-fs-lg: 13px   — section headers
```

**Color tokens** (cream-on-dark context):
```
--dk-text:      rgba(var(--dk-cream), 0.85)   — primary text
--dk-text-mid:  rgba(var(--dk-cream), 0.65)   — secondary text, inactive buttons
--dk-text-dim:  rgba(var(--dk-cream), 0.45)   — labels, hints
--dk-border:    rgba(var(--dk-cream), 0.15)    — default borders
--dk-border-mid: rgba(var(--dk-cream), 0.3)   — hover/active borders
--dk-bg-hover:  rgba(var(--dk-cream), 0.08)   — hover background
--dk-bg-active: rgba(var(--dk-cream), 0.12)   — active/selected background
```

**Button classes** — use one of these, never create one-off button styles:

| Class | Use case | Style |
|---|---|---|
| `.btn-toggle` | Mode switches (WRITE/LIVE, REP/MER/LAY, NOT/GAT/VEL) | `--dk-border` border, `--dk-text-mid` text. `.active`: `--dk-bg-active` bg, bright text |
| `.voice-current` | Expandable section toggle (preset browser, voice picker) | Full-width, `--dk-border` border, arrow indicator |
| `.btn-save-preset` | Accent action (SAVE) | `--color-olive` border+text, transparent bg |
| `.btn-gen-run` | Primary action (Generate, Freeze) | Full-width, `--color-olive` border, olive-tinted bg |
| `.cat-btn` | Category filter pills (ALL/LEAD/BASS...) | `flex:1`, olive fill when `.active` |
| `.btn-icon` | Small icon buttons (seed ⟳/✕, tonnetz +/−) | 22×22px, `--dk-border`, `--dk-text-mid`. Prefer inline SVG (12×12, `stroke-width="1.5"`) over Unicode glyphs |

**Rules:**
- Never use `opacity` on buttons for dimming — use the `--dk-text-*` color tokens instead
- Never use raw `rgba()` colors — use `var(--dk-*)` tokens or `var(--color-*)` palette
- Minimum touch target: 22px height for buttons
- All labels: `text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700`

### PianoRoll — DECIDED

DAW-style note bar editor for melodic tracks (6–7). Always visible for melodic tracks (no toggle). Positioned between StepGrid and DockPanel.
24-note range (C3–B4). Four brush modes (ADR 067): **pen** (draw + drag legato), **eraser** (delete with continuation support), **chord** (triad/7th/sus2/sus4 shapes), **strum** (chord with velocity decay).
Click empty cell to place note, drag right to extend duration (note bar).
Click head to delete, click continuation to delete parent note. Resize handle on head's right edge for post-placement adjustment.
Connected bars = auto-legato, gaps = retrigger. Playhead column shown when playing.

**Scale mode** (`prefs.scaleMode`): Out-of-scale rows (non-white-key positions) are disabled with salmon tint (`rgba(232,160,144,0.06)`), dimmed opacity (0.3 for keys, 0.12 for cells), and `pointer-events: none`.

On mobile: Piano spacer narrowed (26px oct-keys only), cells shrunk to 18px with 1px gap, rows use `flex: 1; min-height: 10px` to fill available vertical space for better touch targets.

### AppHeader — DECIDED

Dark zone. Two rows:

**Top bar** (40px, 32px compact):
- Logo: SVG icon (4×4 grid) + "INBOIL" text
- Oscilloscope: real-time waveform canvas (animated)
- CPU meter (right-aligned): "CPU" label + 6 dots. Olive (<60%), amber (60–85%), red blink (>85%). Hover tooltip shows percentage + warning.

**Sub-header** (64px, 52px compact):
- **BPM block**: −/+ buttons (long-press auto-repeat 80ms) + SplitFlap display. Click display to inline-edit (validates 40–240).
- **Transport**: ▶ Play, ■ Stop, ● REC (arm → blink → recording pulse, salmon color).
- **View toggle**: SCENE / FX / EQ / MST buttons. Switches `ui.phraseView`. SCENE returns to main view; FX/EQ/MST open overlay sheets.
- **Performance buttons**: FILL (blue), REV (blue), BRK (salmon). Press-hold. Disabled when stopped.
- **Navigation**: ? help toggle, SYSTEM button (shows dirty-indicator dot when unsaved).

Pattern switching is **not** in AppHeader — it happens via MatrixView cell tap or SceneView node tap.

On mobile (`compact` mode, 2-row layout):
- **Row 1**: BPM (plain text, no SplitFlap) + transport (▶ ■ ● REC icon-only, 28×28px, gap 8px) + ⋯ overflow menu (borderless 32px circle, contains Help and System).
- **Row 2**: Full-width tab bar (FX / EQ / MST / PERF) with 3px underline indicator, padding 8px 0.
- BPM adj buttons: 28×28px, font-size 14px.
- Performance buttons hidden — PERF tab opens MobilePerfSheet (Kaoss Pad overlay).
- Help/System buttons hidden from header, accessible via ⋯ overflow menu with backdrop dismiss.

### MobileTrackView — DECIDED

Calculator-style step grid for mobile. Steps displayed as a grid of buttons (4 columns × N rows, `align-content: center`). Melodic tracks can switch between STEPS and NOTES (piano roll) tabs.

**Track navigation:** Swipe left/right on track-nav area (40px threshold) or tap ◄ ► buttons (borderless 32px circles) to switch tracks. Track name displayed as plain text (no SplitFlap on mobile).

**Voice bar:** Subtle background bar with SVG fader icon. Tap to open MobileParamOverlay for full param editing.

**Step / Solo / Mute buttons:** Othello flip-card animation (180ms rotateY) matching desktop. `class:flipped` toggles between front/back faces. Steps use same playhead glow as desktop.

**PO-style step picker:** Integrated into calculator grid. Tap cycles through STEP_OPTIONS (2–16, 24, 32, 48, 64), long-press (300ms) opens grid picker overlay. Step picker button uses flip-card animation when active. CSS: `.calc-btn.sp-cell` and `.calc-btn.sp-cell.sp-ext` for specificity over `.calc-btn` base styles.

**Edit mode tabs (STEP / VEL / CHNC):** Animated tab bar with sliding pill indicator above the calculator grid. STEP mode = tap toggles on/off + paint-drag. VEL mode = drag up/down to edit velocity, tap to reset to 1.0. CHNC mode = drag up/down to edit chance. Active steps show velocity/chance gauge as gradient fill. See ADR 033.

**MobilePerfSheet:** Kaoss Pad XY controller with 4 tabs (PERF/GLITCH/FILTER/MOTION). Canvas visualizer shows touch trails. Supports accelerometer/gyroscope for hands-free modulation. Opened via PERF tab button in AppHeader on mobile.

**MobileParamOverlay** (near-full-screen panel, opened via voice bar):
- Fixed backdrop overlay (`position: fixed; inset: 0; z-index: 50`). Tap backdrop or swipe down (dy > 50px) to dismiss.
- Entry/exit animation: `transition:fade={{ duration: 120 }}` on backdrop, `transition:fly={{ y: 60, duration: 120 }}` on card (uses internal `{#if}` for proper outro).
- Drag handle pill at top.
- Voice picker, all synth params, insert FX, send/mix, sample loader.
- Lock toolbar: LOCK button + step label + CLR + SOLO + MUTE.
- Param category tabs: MIX | synth param groups (e.g. PITC, AMP) | FX — switches displayed knobs.
- Params bar: Knobs for selected category (VOL/PAN in MIX, synth params per group, sends in FX).
- Track dots selector at bottom.

## Interaction Model — DECIDED

| Action | Gesture |
|---|---|
| Toggle trig | Click/tap step button (immediate on pointerdown) |
| Select track | Click track name or track dot |
| Adjust parameter | Drag knob vertically |
| Play / Stop | Spacebar or transport button |
| Change BPM | Drag BPM display vertically, or double-click to type |
| Mute track | Click M button on track row |
| Switch pattern | Click pattern cell in MatrixView |
| Performance controls | Press-hold buttons (FILL, REV, BRK) |
| Key change | Click piano key in PerfBar |
| Octave shift | Click −/+ in PerfBar OCT controls |
| Open FX/EQ sheet | Click FX/EQ in PerfBar |
| Toggle FX node | Tap FxPad node (no drag) |
| Move FX node | Drag FxPad node (pointer capture) |
| Select track (FxPad) | Click track dot in FxPad sends bar |
| Open help | Click ? in AppHeader |
| Open settings | Click ⚙ in AppHeader |
| Close sidebar | Click ✕ or re-press trigger button |

## Animation & Feedback — DECIDED

### Timing Rules

```
All durations:  ≤ 200ms
Easing:         ease-out or ease-in-out (no spring/bounce)
Properties:     transform, filter, opacity only (no layout-triggering)
```

### Step Toggle (Othello Flip)

```css
.step-flip {
  transition: transform 200ms ease-in-out;
  transform-style: preserve-3d;
}
.step-flip.flipped { transform: rotateY(180deg); }
```

### Help Button Flip

Same Othello-style 3D flip as step/mute buttons. `?` icon flips between off (bordered outline) and on (blue filled) states:

```css
.help-flip {
  transition: transform 180ms ease-out;
  transform-style: preserve-3d;
  perspective: 80px;
}
.help-flip.flipped { transform: rotateY(180deg); }
```

### Playhead Glow

```css
.step.playhead { animation: ph-glow 180ms ease-out; }
@keyframes ph-glow {
  0%   { filter: brightness(1.5); }
  100% { filter: brightness(1); }
}
```

### SplitFlap Flip

Per-character 3D flip animation (180ms ease-out) triggered on value change.

### Pending Octave Blink

Octave value in PatternToolbar blinks when user changes octave mid-playback (`isPendingOct`):

```css
.oct-value.pending {
  animation: oct-blink 400ms ease-in-out infinite;
}
@keyframes oct-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.3; }
}
```

### Sidebar Open/Close

50ms fade + subtle slide. Uses deferred DOM removal (`visibleMode` + `closing` state) to keep DOM alive during exit animation:

```css
.sidebar { animation: sidebar-in 50ms ease-out; }
.sidebar.closing { animation: sidebar-out 50ms ease-in forwards; }

@keyframes sidebar-in {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes sidebar-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(24px); }
}
```

### No Animation Zones

Always instant, no transition:
- Page or section transitions
- Opening/closing PianoRoll
- Pattern switch application
- Mute toggle (visual — audio uses smooth fade)
- View switching (SCENE/FX/EQ/MST)

## Layout & Alignment Rules — DECIDED

### Flex Container Alignment

- **Action buttons inside flex rows**: Always `align-self: center` for vertical centering. Never rely on `align-items: stretch` (the default) for buttons — stretched buttons look broken.
- **Labels and text alongside controls**: Use `align-items: center` on the parent, or `align-self: center` on text elements.
- **Variable-height content (vel-bars, piano-roll cells)**: Parent uses `align-items: stretch`; fixed-size siblings (buttons, labels) override with `align-self: center`.

### Spacing

- **Minimum touch target**: 22px height for interactive elements (buttons, knobs, picker items).
- **Minimum gap between interactive elements**: 4px (prevents mis-taps).
- **Section dividers**: Use `border-top` or `border-bottom` with `--dk-border` (dock) or `rgba(30,32,40,0.08)` (light zones). No margin-only separation between unrelated groups.
- **Content padding**: 12px horizontal minimum in panels. 8px in compact rows (track heads, vel rows).

### Component-Local Design Tokens

Each UI region defines its own CSS custom properties scoped to the component root. This avoids global `:root` variables while keeping values consistent within a region. Regions have different density needs (e.g., DockPanel is spacious for knob interaction, StepGrid is compact for overview).

**Pattern:**
```css
/* Component root defines tokens */
.dock {
  --dk-fs-xs: 10px;
  --dk-fs-sm: 11px;
  /* ... */
}
/* Children reference tokens */
.dock .section-label {
  font-size: var(--dk-fs-xs);
}
```

**Current regions with local tokens:**

| Region | Prefix | Font range | Notes |
|---|---|---|---|
| DockPanel | `--dk-` | 10–13px | Spacious — knob grids, voice pickers |
| StepGrid | (none yet) | 9–11px hardcoded | Compact — 16-step overview density |
| AppHeader | (none yet) | 10–14px hardcoded | Mixed — display + functional |

When adding a new component region, consider whether it needs its own token set based on density requirements. Small leaf components (Knob, single buttons) should accept size via props, not define their own tokens.

## Responsive Behavior — DECIDED

### Breakpoints

```
sm:  < 640px   (smartphone portrait) → MobileTrackView
md:  640–1023px (tablet / landscape) → StepGrid with compact layout
lg:  ≥ 1024px  (desktop)            → Full StepGrid layout
```

### Mobile (sm)

Uses MobileTrackView: calculator-style step buttons, track navigation via ◄ ►, STEPS/NOTES tab toggle for melodic tracks.

Bubble menus (keyboard fan-out, pattern actions) use radial/arc animations with semi-transparent backdrop overlay (`rgba(0,0,0,0.25)`) for visual separation and dismissal.

### Scrolling

`overscroll-behavior: none` applied at every level of the scroll chain (html → body → #app → .app → .step-grid → .track-row → .steps) to prevent Mac trackpad rubber banding.

All native scrollbars hidden via `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`.

## Accessibility — DEFERRED

WCAG compliance is not a v1 goal but the warm palette naturally provides good contrast.
