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

#### First View (Hero)

The hero section has three jobs in under 3 seconds:
1. **Brand recognition** — logo + "inboil" name, prominent and animated
2. **Concept** — one-line catchphrase that says what this is and why it's exciting
3. **It's alive** — something is already moving when the page loads

```
┌──────────────────────────────────────────┐
│  [logo] inboil           Docs [OPEN →]  │  ← dark header
├──────────────────────────────────────────┤
│                                          │
│  tagline (left, 2fr)  │ sequencer (3fr) │
│  + [sound] button      │ 4×16 step grid │
│                        │ + playhead      │
│                                          │
└──────────────────────────────────────────┘
```

**Layout**: 2fr (text) : 3fr (sequencer) grid to fill the hero width.

**Logo**: 4-cell grid with rotateY flap animation on load, re-trigger on hover.

**Step sequencer**: 4-track × 16-step DOM grid with Othello-flip toggle cells, animated playhead, Web Audio preview. Pre-populated with a basic pattern. Sound button triggers audio playback.

**Tagline**: "No install. No signup. Just play." + sub-line "A groove box that lives in your browser."

#### Page Flow

```
┌──────────────────────────────────┐
│  Hero                            │  ← brand + tagline + interactive step sequencer
├──────────────────────────────────┤
│  Sound Engines (2-col 2:3)       │  ← voice chips + engine viewer with SVG graphs
├──────────────────────────────────┤
│  Scene Graph (2-col 3:2 reversed)│  ← draggable nodes, bezier edges, arrowheads
├──────────────────────────────────┤
│  FX Pad (full-width centered)    │  ← draggable effect nodes with constellation lines
├──────────────────────────────────┤
│  Story + Support                 │  ← personal dev story → Ko-fi donate link
├──────────────────────────────────┤
│  Specs                           │  ← technical spec grid (tracks, voices, effects, etc.)
├──────────────────────────────────┤
│  Final CTA                       │  ← "Ready to make some noise?" + app/tutorial links
└──────────────────────────────────┘
```

Feature sections are grouped together, followed by Story + CTA. Sections use mixed layouts (2-col, 2-col reversed, full-width) to break visual monotony. Sections fade-in on scroll (subtle, not distracting).

#### Micro-interactions

The LP should feel like the app itself — playful, responsive, musical.

| Element | Interaction |
|---|---|
| Logo grid | 4-cell rotateY flap animation on load, re-trigger on hover |
| Step sequencer | Othello-flip cells, playhead animation, Web Audio preview |
| Engine viewer | SVG graphs update in real-time per voice selection |
| Arc knobs | Draggable, update graphs + live audio (filter, FM, wavetable) |
| Scene graph nodes | Draggable (hidden discovery, no hint text) |
| Feature titles | Hover bounce + accent-line pulse |
| CTA "Open App" | Hover glow sweep |
| FX Pad nodes | Draggable, constellation lines between active nodes |
| Scroll | Per-section fade-in (once, not repeating) |

**Guideline**: micro-interactions respond to user actions (hover, click, scroll arrival). Nothing chases attention or interrupts.

#### Demo approach

- Primary: Interactive DOM step sequencer in hero (4-track × 16-step, Web Audio preview on click)
- Sound Engines section: 19 voice chips with audio preview, engine viewer with live SVG graphs and draggable arc knobs
- Scene Graph section: draggable nodes with dynamic bezier edges (ray-box intersection)
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
├── scene/               Scene graph
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
- SceneCanvas-style grid background (cream #EDE8DC + 40px lines)
- Dark header with nav (Docs link + olive "Open App" CTA button)
- Hero: asymmetric layout (text top-left, sequencer bottom-right) with 2fr:3fr grid
- Hero: interactive 4-track × 16-step DOM sequencer with Othello-flip cells, playhead, Web Audio preview
- Hero: tagline "Make music anywhere, right now" + sub-line "No install. No signup. Just play."
- Hero: larger logo (80px), larger tagline (2.2rem), larger sequencer cells (48px)
- Sound Engines section: 2:3 grid, 19 voice chips with audio preview, voice ↔ engine viewer param sync
- Engine viewer: dark panel showing real-time SVG graphs (waveform, ADSR, FM routing) with draggable arc knobs
- Audio params matched to app presets (paramDefs.ts / DRUM_PRESETS)
- Scene Graph section: 3:2 reversed grid, draggable nodes with dynamic bezier edges, ray-box intersection
- Scene nodes match app style (height:32, no border-radius, root border, playing pulse, decorator pills)
- FX Pad section: full-width, draggable effect nodes on canvas with constellation lines
- FX node colors match app exactly (VERB=#787845, DLY=#4472B4, GLT=#E8A090, GRN=#9B6BA0)
- Story + Support section with Ko-fi donate link (after all feature sections)
- Specs section: grid of technical specs (tracks, voices, sequencer, effects, export, MIDI, browser, etc.)
- Final CTA section: "Ready to make some noise?" + app/tutorial links
- OGP image: og.svg source + og.png 1200×630 (logo + tagline + step sequencer pattern)
- Logo flap animation: 4-cell rotateY keyframes on load, re-trigger on hover
- Feature titles: large (7rem max), white-space:nowrap, hover bounce + accent-line pulse
- CTA primary button glow sweep on hover
- Alternating section backgrounds (rgba(30,32,40,0.03)) for visual rhythm
- Asymmetric vertical offsets between text and visual columns (120px / 200px)
- Bilingual i18n for all sections (EN/JA auto-detect)
- Typography: JetBrains Mono for headings, system-ui sans-serif for body text
- Text color opacity tuned for readability (tagline 0.8, descriptions 0.7, labels 0.55)
- Responsive breakpoints at 768px (2-col → 1-col, CTA/chip sizing)

**TODO (LP):**
- Desktop download links → ADR 073

## Future Extensions

- Blog / changelog section: release notes and dev diary
- Community: Discord link, user creation gallery
- SEO / OGP: embed demo song audio preview in OGP tags for rich social sharing
- **Social sharing (TikTok / Instagram / X)**: export a short video clip (pattern loop + visualizer) directly from the app, ready to post to social media. This is probably the strongest organic growth channel — users show off what they made, viewers tap through to try it. Implementation options: MediaRecorder API capturing canvas + Web Audio, or server-side rendering for higher quality. Share link with OGP preview should accompany the video so viewers can open the project directly
