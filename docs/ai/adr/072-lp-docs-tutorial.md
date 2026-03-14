# ADR 072: Landing Page, Docs & Tutorial

## Status: Proposed

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
│                                          │
│  ┌─┬─┬─┐                                │
│  ├─┼─┼─┤  inboil         [OPEN APP →]   │
│  └─┴─┴─┘                                │
│  (logo with flap animation)             │
│                                          │
│  No install. No signup. Just play.       │  ← catchphrase
│  A groove box that lives in your browser │  ← sub-line
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ○──○──○     ○                     │  │
│  │     │  └──○──┘   (generative       │  │
│  │  ○──┘            scene canvas      │  │
│  │        ○──○──○    animation)       │  │
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

**Logo**: Grid cells flap-animate on page load, re-trigger on hover.

**Scene canvas animation**: Full-bleed background or hero-inset. Reuses SceneCanvas drawing logic to render floating nodes and Bezier edges in a generative loop. Purely visual (no audio). Nodes drift, connect, and pulse — communicates "graph-based music" without explanation. Click/tap on a node triggers a ripple. This is approach B (Canvas animation), chosen over live audio demo (too heavy for first load) or video loop (not interactive).

**Catchphrase candidates** (decide during implementation):
- "No install. No signup. Just play."
- "A groove box that lives in your browser."
- "Sequence everything."

#### Page Flow

```
┌──────────────────────────────────┐
│  Hero (above)                    │  ← 3 seconds: brand + concept + motion
├──────────────────────────────────┤
│  Features (3 cards, 1 line each) │  ← scannable, icons with hover bounce
│  • Synth & Drum Machine          │
│  • Scene Graph Sequencer         │
│  • Desktop & Browser             │
├──────────────────────────────────┤
│  Try It / Demo                   │  ← CTA to app, or embedded mini-demo
├──────────────────────────────────┤
│  Story + Support                 │  ← personal dev story → donate
│  (Knob-style amount selector,    │
│   particle + sound on complete)  │
├──────────────────────────────────┤
│  Download Desktop                │
│  [macOS]  [Windows]  [Linux]     │
├──────────────────────────────────┤
│  Footer: Docs, GitHub, SNS       │
└──────────────────────────────────┘
```

Each section is one viewport tall with generous whitespace. Sections fade-in on scroll (subtle, not distracting).

#### Micro-interactions

The LP should feel like the app itself — playful, responsive, musical.

| Element | Interaction |
|---|---|
| Logo grid | Flap animation on load + hover |
| Scene canvas background | Nodes drift, click → ripple |
| Feature icons | Hover bounce / pulse |
| CTA "Open App" | Hover glow sweep |
| Donate amount | Knob-style selector (reuse Knob.svelte) |
| Donate complete | Particle burst + short sound |
| Scroll | Per-section fade-in (once, not repeating) |

**Guideline**: micro-interactions respond to user actions (hover, click, scroll arrival). Nothing chases attention or interrupts. Donate animations celebrate the action, never guilt-trip.

#### Demo approach

- Primary: Canvas animation in hero (no audio, instant load)
- Secondary: "Try It" section links to app, optionally with an embedded MiniSequencer (`client:visible`)
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

### Phase 1 — LP + Static Docs (shippable independently)
- [x] Astro + Starlight setup in `site/`
- [ ] ~~Landing page with hero animation (SceneCanvas-based), logo flap, micro-interactions~~ → Hero is interactive DOM step sequencer instead (see Implementation Status)
- [ ] Donate section with Knob selector and celebration animation (ADR 071)
- [x] Docs: Markdown pages with screenshots / GIFs (EN/JA bilingual)
- [x] In-app Help `→ Docs` links
- [ ] Desktop download links (not yet applicable)

### Phase 2 — Interactive Docs
- [x] Embed lightweight Svelte components in docs pages (PlaygroundSceneView, PlaygroundAlgoGraph, PlaygroundWaveGraph, PlaygroundEnvGraph)
- [x] Props-only mode or mini-state injection for embedded components (`tutorialSetup.ts`)
- [ ] Tutorial step snapshots as copy-pasteable JSON

### Phase 3 — Function Node Playground + Onboarding
- [ ] SceneCanvas + DockDecoratorEditor sandbox in docs
- [ ] Full PlaygroundState context (1-pattern sandbox with audio)
- [ ] Copy-paste from playground to app via ADR 020 JSON export
- [ ] First-launch onboarding banner in app
- [ ] Contextual feature hints (one-time tooltips → docs links)

## Implementation Status

### LP (`site/src/pages/index.astro`)

**Done:**
- 2-column grid layout (text left, interactive right) with scroll-reveal animations
- SceneCanvas-style grid background (cream #EDE8DC + 40px lines)
- Dark header with nav (Docs link + olive "Open App" CTA button)
- Hero: interactive 4-track × 16-step DOM sequencer with Othello-flip cells, playhead, Web Audio preview
- Sound Engines section: 19 voice chips with audio preview (legato for synths, one-shot with proper envelopes for drums)
- Engine viewer: dark panel showing real-time SVG graphs (waveform interpolation, ADSR envelope, FM algorithm routing) that switch per voice
- Draggable SVG arc knobs that update graphs + live audio (filter freq/Q, FM ratio/depth, wavetable position)
- Audio params matched to app presets (paramDefs.ts / DRUM_PRESETS)
- Scene Graph section: draggable nodes with dynamic bezier edges, chevron arrowheads, edge-order labels
- Scene nodes match app style (height:32, no border-radius, root border, playing pulse, edge handles, decorator pills)
- Root node with play button (playing state, ⏸ icon) overlapping left edge
- Responsive breakpoints at 768px (2-col → 1-col)
- OGP / meta description / Twitter Card tags (og.png image asset still needed)
- FX Pad section: draggable effect nodes on canvas with constellation lines between active nodes
- Performance section: hold-to-engage FILL / REV / BRK buttons with visual feedback
- Generative section: decorator pills on pattern nodes (transpose, turing, tonnetz, etc.)
- Final CTA section: "Ready to make some noise?" + app/tutorial links
- Story + Support section with Ko-fi donate link
- Scene graph: hint text ("drag the nodes") + nudge animation on scroll-in, hides on first drag
- Logo flap animation: 4-cell rotateY keyframes on load, re-trigger on hover
- Feature title hover bounce + accent-line pulse
- CTA primary button glow sweep on hover
- Bilingual i18n for all new sections (EN/JA auto-detect)

**TODO (LP):**
- [x] OGP / meta description / social sharing tags
- [x] Additional feature sections (Effects/FX Pad, Performance mode, Generative/function nodes)
- [x] Final CTA section at page bottom ("Try it now" with app link)
- [x] Donate section (ADR 071) — Ko-fi link in Story + Support section
- [x] Scene graph: hint text or intro animation so users discover drag interaction
- [x] Mobile UX verification (voice grid + knobs on small screens)
- [x] Logo flap animation (original ADR spec)
- [x] Feature icon hover bounce / pulse micro-interactions
- [x] Story + Support section
- [ ] OGP image (og.png 1200×630) — placeholder tag added, image asset needed
- [ ] Desktop download links (not yet applicable)

## Future Extensions

- Blog / changelog section: release notes and dev diary
- Community: Discord link, user creation gallery
- SEO / OGP: embed demo song audio preview in OGP tags for rich social sharing
- **Social sharing (TikTok / Instagram / X)**: export a short video clip (pattern loop + visualizer) directly from the app, ready to post to social media. This is probably the strongest organic growth channel — users show off what they made, viewers tap through to try it. Implementation options: MediaRecorder API capturing canvas + Web Audio, or server-side rendering for higher quality. Share link with OGP preview should accompany the video so viewers can open the project directly
