# ADR 072: Landing Page, Docs & Tutorial

## Status: Implemented

## Context

Currently only the app itself is deployed to Cloudflare Pages. There is no external-facing introduction page, documentation, or tutorial.

- First-time users have no way to understand what the app does before opening it
- In-app Help is a concise reference (21 sections, 1–3 lines each) — insufficient as a learning guide
- No place to host desktop download links (future)
- No venue to showcase what the app can do via demo

These are all "external user touchpoints" and closely related, so they are combined into a single ADR.

## Decision

### Tech Stack

**Astro + Starlight** for both LP and docs, in a monorepo with the main app.

- Astro can import Svelte components directly via `@astrojs/svelte` — reuse app UI for LP demo embeds
- Starlight provides sidebar, search, and i18n out of the box for docs
- Static HTML output by default (zero runtime JS unless `client:load` is explicitly added)
- Separate build process and bundle from the main app — no impact on app bundle size
- Cloudflare Pages compatible (static output)

Alternatives rejected:
- **Remix / Next.js**: React-based, cannot reuse Svelte components
- **VitePress**: Vue-based, same Svelte incompatibility
- **Plain HTML**: fine for LP alone, but unmaintainable as docs pages grow

### Repository Structure

```
inboil/
├── src/              ← app source (existing Svelte + Vite)
├── dist/             ← app build output (Vite → here)
├── site/
│   ├── astro.config.mjs
│   ├── src/
│   │   ├── pages/
│   │   │   └── index.astro     ← Landing Page
│   │   └── content/
│   │       └── docs/           ← Starlight docs (Markdown)
│   ├── dist/                   ← site build output (Astro → here)
│   └── package.json            ← separate dependencies
└── package.json                ← root (pnpm workspaces)
```

Build outputs are strictly separated:
- `pnpm build` → `dist/` (app only)
- `pnpm --filter site build` → `site/dist/` (LP + docs only)
- Each output maps to a separate Cloudflare Pages project (see Hosting below)

### URL Structure

```
inboil.app/           ← Landing Page (Astro)
inboil.app/docs/      ← Docs + Tutorial (Starlight, same Astro build)
app.inboil.app/       ← Main app (separate CF Pages project)
```

### 1. Landing Page (LP)

Single-page design. The first view must immediately communicate brand, concept, and "this is alive."

#### Design Direction

The LP extends the app's **Warm Brutalist + Geometric Graphic Design** direction (see ui-design.md) to a marketing context.

**Visual identity:**
- **Cream/navy palette** — cream `#EDE8DC` background with navy `#1E2028` text, inverted in dark zones. Deliberately avoids the black-on-white or dark-neon clichés of typical music software. Warmth and sophistication over "pro audio."
- **Color is reserved for state** — olive `#787845` indicates active/interactive elements only. All other variation is opacity-based grayscale (`rgba(30,32,40, 0.8–0.04)`). No decorative color.
- **No gradients, no shadows** — depth through zone inversion and border weight only. One exception: engine viewer and FX pad canvas have subtle lift shadows.
- **Border-radius: 0** — consistent with app's brutalist decision. No soft rounding anywhere.

**Typography:**
- **JetBrains Mono 700** — all headings, feature titles, labels, specs. Uppercase with wide letter-spacing (`0.04–0.12em`). Feature titles scale large (`clamp(3.5rem, 8vw, 7rem)`) for graphic impact.
- **System UI sans-serif** — tagline, descriptions, story body. Sentence case, generous line-height (2.0) for readability. The contrast between monospace display and proportional body creates clear hierarchy.

**Geometric decorations:**
- SVG compositions placed at **section boundaries** to guide the eye between content zones. They are compositional texture, not illustration — they don't depict features.
- Each boundary has a unique composition (crescents, stars, crosshairs, dot grids, orbital rings, etc.) to create visual rhythm without repetition.
- Hero section has a larger decorative SVG composition on the right side as a visual counterweight to the text/sequencer on the left.
- Shapes that straddle dark/light zone boundaries render twice with inverted colors (via `<clipPath>`) for continuity.
- Olive accent dots/shapes are used sparingly within compositions to tie back to the interactive color.
- Mobile: simplified or hidden to preserve content density.

**Differentiation intent:** Most DAW/groovebox marketing pages use dark themes, neon accents, and product screenshots. The cream palette, geometric art direction, and interactive demos position inboil as something different — approachable, design-conscious, and alive.

#### First View (Hero)

The hero section has three jobs in under 3 seconds:
1. **Brand recognition** — logo + "inboil" name, prominent and animated
2. **Concept** — one-line catchphrase that says what this is and why it's exciting
3. **It's alive** — something is already moving when the page loads

```
┌───────────────────────────────────────────────────┐
│  [logo] inboil        [JA/EN] Docs GitHub [OPEN]  │  ← dark header
├───────────────────────────────────────────────────┤
│                                          │         │
│  logo (large, 80px)                      │  geo    │
│  tagline (JA primary / EN sub)           │  SVG    │
│  [Open App] [Tutorial →]                 │  comp   │
│  ┌─────────────────────────────────┐     │         │
│  │  4×16 step sequencer + playhead │     │         │
│  │  [▶ sound toggle]               │     │         │
│  └─────────────────────────────────┘     │         │
│                                          │         │
└───────────────────────────────────────────────────┘
```

**Layout**: Text, CTAs, and interactive sequencer stacked on the left; decorative geometric SVG composition on the right. The sequencer is part of the hero content, not a separate column.

**Logo**: 4-cell grid with rotateY flap animation on load, re-trigger on hover. 80px size.

**Step sequencer**: 4-track × 16-step DOM grid with Othello-flip toggle cells (48px), animated playhead, Web Audio preview. Pre-populated with a basic pattern. Sound toggle triggers audio playback.

**Tagline**: JA "いつでも、どこでも、すぐ作曲" (primary, 2.2rem) + EN sub-line "No install. No signup. Just play." Bilingual, auto-detected.

#### Page Flow

```
┌───────────────────────────────────┐
│  Hero                             │  ← brand + tagline + interactive step sequencer
│          ·bg0·                    │  ← section boundary geo decoration
├───────────────────────────────────┤
│  Sound Engines (2-col 2:3)        │  ← voice chips + engine viewer with SVG graphs
│          ·bg1·                    │
├───────────────────────────────────┤
│  Scene (2-col 3:2 reversed) │  ← draggable nodes, bezier edges, arrowheads
│          ·bg2·                    │
├───────────────────────────────────┤
│  FX Pad (full-width, dark bg)     │  ← draggable effect nodes with constellation lines
│          ·bg3·                    │
├───────────────────────────────────┤
│  Multi-Device Jam (full-width)    │  ← WebRTC jam session, host/guest SVG diagram
│          ·bg4·                    │
├───────────────────────────────────┤
│  Specs                            │  ← technical spec grid (tracks, voices, effects, etc.)
├───────────────────────────────────┤
│  Final CTA (dark bg)              │  ← "さっそく始めよう" + app/tutorial links
├───────────────────────────────────┤
│  Story + Support                  │  ← personal dev story → Ko-fi donate link
└───────────────────────────────────┘
```

Feature sections are grouped together, followed by Specs → CTA → Story. Sections use mixed layouts (2-col, 2-col reversed, full-width) to break visual monotony. Alternating subtle background tints (`rgba(30,32,40,0.03)`) create visual rhythm. Sections fade-in on scroll with `translateY(24px)` reveal (once, not repeating).

#### Micro-interactions

The LP should feel like the app itself — playful, responsive, musical.

| Element | Interaction |
|---|---|
| Logo grid | 4-cell rotateY flap animation on load, re-trigger on hover |
| Step sequencer | Othello-flip cells, playhead animation, Web Audio preview |
| Engine viewer | SVG graphs update in real-time per voice selection |
| Arc knobs | Draggable, update graphs + live audio (filter, FM, wavetable) |
| Scene nodes | Draggable (hidden discovery, no hint text) |
| Feature titles | Hover bounce + accent-line pulse |
| CTA "Open App" | Hover glow sweep |
| FX Pad nodes | Draggable, constellation lines between active nodes |
| Scroll | Per-section fade-in (once, not repeating) |

**Guideline**: micro-interactions respond to user actions (hover, click, scroll arrival). Nothing chases attention or interrupts.

#### Demo approach

- Primary: Interactive DOM step sequencer in hero (4-track × 16-step, Web Audio preview on click)
- Sound Engines section: 19 voice chips with audio preview, engine viewer with live SVG graphs and draggable arc knobs
- Scene section: draggable nodes with dynamic bezier edges (ray-box intersection)
- FX Pad section: draggable effect nodes with constellation lines
- No autoplay audio (browser policy + UX)

### 2. Docs

Detailed usage documentation, more thorough than in-app Help.

```
docs/
├── getting-started/     Tutorial (step-by-step)
│   ├── first-beat        Make your first beat
│   ├── adding-sounds     Change voices & presets
│   └── arrangement       Build a scene
├── sequencer/           Sequencer details
│   ├── grid-mode         Grid mode
│   ├── tracker-mode      Tracker mode
│   ├── piano-roll        Piano roll
│   └── velocity-chance   Velocity & probability
├── sound/               Sound design
│   ├── voices            Synth & drums
│   ├── sampler           Sampler
│   └── fx                Effects (FX Pad, EQ)
├── scene/               Scene
│   ├── nodes             Node types
│   ├── decorators        Decorators
│   └── playback          Playback flow
└── reference/           Reference
    ├── shortcuts          Keyboard shortcuts
    └── faq                FAQ
```

**Tutorial is integrated into docs:**
- `getting-started/` section serves as the tutorial
- Step-by-step format with screenshots or short GIFs
- No standalone tutorial screen (reduces maintenance cost)

**Interactive embeds (Phase 2+):**
- Docs pages embed live Svelte components via `client:visible` — not just static screenshots
- Reusable candidates: MiniSequencer, SceneCanvas, Knob, SceneRibbon
- Each tutorial step provides a JSON snapshot that can be copy-pasted into the real app (ADR 020 export format)
- Function node playground: SceneCanvas + DockDecoratorEditor sandbox for hands-on experimentation (Phase 3)
- Components need a props-only mode or mini-state injection to work outside the app's global state (see Considerations)

### 3. Relationship with In-App Help

```
In-App Help (Sidebar)           Docs Site
─────────────────────           ─────────
Concise reference               Detailed guide + tutorial
1–3 lines per section           Diagrams, GIFs, examples
Quick lookup during use         Sit down and learn
```

- In-app Help stays concise as-is
- Each Help section gets a `→ Docs` link pointing to the detailed page
- Minimize content duplication (Help = what, Docs = how & why)

**App → Docs onboarding:**
- First launch: optional banner or tooltip suggesting the tutorial ("New here? Try the tutorial →")
- Contextual hints: when a user first encounters a complex feature (e.g. adding a function node), show a one-time tooltip linking to the relevant docs page
- Help sidebar: permanent "Full Tutorial →" link at the top

## Considerations

- **Custom domain**: acquire a custom domain (e.g. `inboil.app`) before public launch. A `.pages.dev` URL looks like a hobby project and undermines trust — especially when asking for donations (ADR 071). Custom domain is ~$10–15/year and significantly improves perceived credibility. Use `.pages.dev` during development, switch to custom domain for launch
- **Domain structure** (with custom domain):
  - `inboil.app` → LP + Docs (single Astro project, path-based routing)
  - `inboil.app/docs/` → Docs (Starlight, same build output as LP)
  - `app.inboil.app` → Main app (separate CF Pages project)
  - Docs use path-based routing, not a subdomain — keeps SEO domain authority unified with LP and avoids splitting the Astro build
- **Demo weight**: a Web Audio demo is compelling but increases LP load time. Astro's partial hydration (`client:visible`) helps — only load the audio engine when the demo section scrolls into view
- **Bilingual docs**: doubles the writing effort. Start with one language, expand based on demand
- **Hosting**: Two Cloudflare Pages projects:
  - `inboil-app` → deploys `dist/` → `app.inboil.app`
  - `inboil-site` → deploys `site/dist/` → `inboil.app` (LP at `/`, docs at `/docs/`)
  - Separate projects keep build caches independent. During development, use `.pages.dev` URLs
- **Component reuse boundary**: LP demo can import Svelte components from `../src/lib/`, but should only pull UI — not the entire state management layer
- **Playground state isolation**: Interactive embeds (Phase 2–3) cannot depend on the app's global state (`song`, `ui`, `playback`). Options: (a) props-only mode on existing components, (b) a lightweight `PlaygroundState` context that provides a 1-pattern / few-track sandbox. This is the main technical cost of interactive docs
- **Docs offline caching**: not in scope. Docs are an online learning resource; offline reference needs are served by in-app Help. Revisit only if PWA scope expands to include the docs subdomain

## Phases

### Phase 1 — LP + Static Docs
- [x] Astro + Starlight setup in `site/`
- [x] Landing page with hero (interactive DOM step sequencer), logo flap, micro-interactions
- [x] Donate section — Ko-fi link in Story + Support section (knob selector deferred)
- [x] Docs: Markdown pages with screenshots / GIFs (EN/JA bilingual)
- [x] In-app Help `→ Docs` links
- Desktop download links → ADR 073 (requires Apple Developer account)

### Phase 2 — Interactive Docs
- [x] Embed lightweight Svelte components in docs pages (PlaygroundSceneView, PlaygroundAlgoGraph, PlaygroundWaveGraph, PlaygroundEnvGraph)
- [x] Props-only mode or mini-state injection for embedded components (`tutorialSetup.ts`)
- Tutorial step snapshots, playground, onboarding → split to ADR 094

## Implementation Status

### LP (`site/src/pages/index.astro`)

**Done:**
- Cream `#EDE8DC` background with SceneCanvas-style 40px grid lines
- Dark header with nav (language toggle, Docs, GitHub, olive "Open App" CTA)
- Hero: logo + tagline + CTAs + sequencer stacked left, geometric SVG composition right
- Hero: interactive 4-track × 16-step DOM sequencer with Othello-flip cells (48px), playhead, Web Audio preview
- Hero: JA tagline "いつでも、どこでも、すぐ作曲" (2.2rem) + EN sub-line, bilingual auto-detect
- Hero: logo 80px, flap animation on load + hover
- Sound Engines section: 2:3 grid, 19 voice chips with audio preview, voice ↔ engine viewer param sync
- Engine viewer: dark panel with real-time SVG graphs (waveform, ADSR, FM routing) + draggable arc knobs
- Audio params matched to app presets (paramDefs.ts / DRUM_PRESETS)
- Scene section: 3:2 reversed grid, draggable nodes with dynamic bezier edges, ray-box intersection
- Scene nodes match app style (height:32, no border-radius, root border, playing pulse, decorator pills)
- FX Pad section: full-width dark bg, draggable effect nodes on canvas with constellation lines
- FX node colors match app exactly (VERB=#787845, DLY=#4472B4, GLT=#E8A090, GRN=#9B6BA0)
- Multi-Device Jam section: full-width, host/guest WebRTC SVG diagram
- Specs section: responsive grid of technical specs (tracks, voices, sequencer, effects, export, MIDI, browser, etc.)
- Final CTA section: dark bg, "さっそく始めよう" + app/tutorial links
- Story + Support section with Ko-fi donate link (after CTA)
- OGP image: og.svg source + og.png 1200×630 (logo + tagline + step sequencer pattern)
- Geometric section boundary decorations: unique SVG compositions at each section transition (B0–B4), hero geo, CTA geo with dark/light zone straddling via clipPath
- Feature titles: large (`clamp(3.5rem, 8vw, 7rem)`), uppercase, hover bounce + accent-line pulse
- CTA primary button glow sweep on hover
- Alternating section backgrounds (`rgba(30,32,40,0.03)`) for visual rhythm
- Bilingual i18n for all sections (EN/JA auto-detect via `navigator.language`)
- Typography: JetBrains Mono 700 for headings, system-ui sans-serif for body
- Text color: opacity-based hierarchy (tagline 0.8, descriptions 0.7, labels 0.55)
- Scroll reveal: `translateY(24px)` fade-in via IntersectionObserver (once per section)
- `prefers-reduced-motion: reduce` disables all animations
- Responsive breakpoints at 768px (2-col → 1-col, geo simplified/hidden)

**TODO (LP):**
- Desktop download links → ADR 073

## Future Extensions

- Blog / changelog section: release notes and dev diary
- Community: Discord link, user creation gallery
- SEO / OGP: embed demo song audio preview in OGP tags for rich social sharing
- **Social sharing (TikTok / Instagram / X)**: export a short video clip (pattern loop + visualizer) directly from the app, ready to post to social media. This is probably the strongest organic growth channel — users show off what they made, viewers tap through to try it. Implementation options: MediaRecorder API capturing canvas + Web Audio, or server-side rendering for higher quality. Share link with OGP preview should accompany the video so viewers can open the project directly
