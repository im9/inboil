# v1 UI Mockups

Static HTML + CSS pictures of the v1 primary surfaces. No JavaScript, no
behavior — these are **pictures**, not prototypes. Resist the urge to wire up
interaction; it turns into a half-broken prototype with maintenance cost.

## How to view

Open `index.html` for the full storyboard — all mockups laid out with tap
transitions shown. Individual mockups can also be opened directly in a browser.

For mobile-targeted mockups, use the browser's mobile emulation mode
(DevTools → Toggle device toolbar → iPhone 14 Pro at 390×844). Or just view at
1:1 in any browser — the device frame is drawn into the mockup.

## Conventions (enforced — see commit history for prior failures)

- **All values trace to one of:**
  - a token from `tokens.css` (mirroring `src/app.css`)
  - the project spacing set `{4, 6, 8, 10, 12, 16}` px
  - a value marked with `/* display: ... */` matching inboil's mobile
    component conventions (see `MobileTrackView`, `AppHeader`)
- **Square corners** (`border-radius: 0`) everywhere except circular elements
  (knobs, dirty-dot). The inboil aesthetic is hard-edged.
- **BPM-synced animations** use `--beat` CSS variable (set to 0.25s for 120
  BPM). Same pattern as `MobileMatrixView`.
- **Dark zone for header** (`--color-fg` bg, `--dz-*` text), light zone for
  canvas (`--color-bg` bg, `--lz-*` text).
- **SVG edges** use `currentColor` for default + token vars for accents — no
  hardcoded rgba in stroke/fill.
- **One mockup per visual state** — separate files for "primary", "palette
  open", "instrument detail", etc. Don't combine. Don't add JS state toggles.

## Files

| File | What it shows |
|---|---|
| `index.html` | **Storyboard** — all mockups laid out with tap-transition arrows |
| `tokens.css` | Design tokens (mirror of `src/app.css`) |
| `mockups.css` | Shared base styles (phone frame, node tile, edges, sheet) |
| `mobile-primary.html` | Scene-centric primary surface — the home view |
| `mobile-instrument-detail.html` | Tap an instrument tile → full-screen detail |
| `mobile-pattern-detail.html` | Tap a pattern tile → step grid bottom sheet |
| `mobile-generative-detail.html` | Tap a generative tile (Drift) → engine sheet with 4-verb randomizer |
| `mobile-palette-open.html` | Tap `+` → add-node palette |
| `mobile-edge-config.html` | Long-press edge → mute/merge/disconnect popup |
| `mobile-fan-in.html` | Multiple sources → one instrument (v1 novelty) |
| `mobile-landscape.html` | Landscape orientation, denser layout |
| `desktop-scene.html` | Desktop equivalent (1440×900) with dock panel |

## Transitions captured (gesture → state)

| From | Gesture | To |
|---|---|---|
| primary | tap instrument tile | instrument-detail |
| primary | tap pattern tile | pattern-detail |
| primary | tap generative tile | generative-detail |
| primary | tap `+` | palette-open |
| primary | long-press edge | edge-config |
| primary | rotate device | landscape |
| (cross-cutting) | route N sources to 1 instrument | fan-in |

## Not yet mocked (deliberately)

- **Onboarding / first-run** — starting template + guided tap-through
  (defined in `../mobile.md`, mock when copy stabilizes)
- **Detail views for Cascade and Snap** — analogous to Drift, similar
  structure. Build when their faceplate spec firms up.
- **Mixer view (desktop)** — alternative arrangement of all instruments as
  channels. Build when needed.

## Workflow

Mockups are **disposable**. Once a layout stabilizes and moves into Svelte
components, the corresponding mockup gets retired or kept as visual reference.
Edit freely without backwards-compat concerns.

When token discipline lapses (off-scale font, arbitrary px), the mockup is not
a trustworthy design artifact — fix before iterating further.
