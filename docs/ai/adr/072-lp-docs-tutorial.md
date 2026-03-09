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
├── src/              ← app (existing Svelte + Vite)
├── site/
│   ├── astro.config.mjs
│   ├── src/
│   │   ├── pages/
│   │   │   └── index.astro     ← Landing Page
│   │   └── content/
│   │       └── docs/           ← Starlight docs (Markdown)
│   └── package.json            ← separate dependencies
├── dist/             ← app build output
└── package.json      ← root (workspaces)
```

### URL Structure

```
inboil.app/           ← Landing Page
inboil.app/app/       ← Main app (current build output)
inboil.app/docs/      ← Docs + Tutorial
```

### 1. Landing Page (LP)

First impression page. Demo showcase + call to action.

```
┌──────────────────────────────────┐
│  inboil                          │
│  Browser-based groove box        │
│                                  │
│  [▶ DEMO]          [OPEN APP →]  │  ← hero section
├──────────────────────────────────┤
│  ♫ ♫ ♫   Demo area    ♫ ♫ ♫     │  ← one-click demo or visual
│  (visualizer / sequencer embed)  │
├──────────────────────────────────┤
│  Features                        │
│  • Synth & Drum Machine          │
│  • Scene Graph Sequencer         │
│  • Zero Dependencies, 130KB gz   │
├──────────────────────────────────┤
│  Download Desktop (future)       │
│  [macOS]  [Windows]  [Linux]     │
├──────────────────────────────────┤
│  Docs & Tutorial →               │
│  ♡ Support This Project →        │
│  GitHub →                        │
└──────────────────────────────────┘
```

**Demo approach:**
- One-click playback of a built-in demo song (Web Audio API) — reuse app's Svelte audio components via Astro
- Fallback: GIF / video showing sequencer in action (lighter)
- No autoplay (browser policy + UX)

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

## Considerations

- **Custom domain**: acquire a custom domain (e.g. `inboil.app`) before public launch. A `.pages.dev` URL looks like a hobby project and undermines trust — especially when asking for donations (ADR 071). Custom domain is ~$10–15/year and significantly improves perceived credibility. Use `.pages.dev` during development, switch to custom domain for launch
- **Domain structure** (with custom domain):
  - `inboil.app` → LP
  - `app.inboil.app` → Main app
  - `docs.inboil.app` → Docs
- **Demo weight**: a Web Audio demo is compelling but increases LP load time. Astro's partial hydration (`client:visible`) helps — only load the audio engine when the demo section scrolls into view
- **Bilingual docs**: doubles the writing effort. Start with one language, expand based on demand
- **Hosting**: Cloudflare Pages for all three (LP, app, docs). Can be separate Pages projects with custom subdomains, or a single project with subpath routing during development
- **Component reuse boundary**: LP demo can import Svelte components from `../src/lib/`, but should only pull UI — not the entire state management layer

## Future Extensions

- Interactive tutorial: embed a mini sequencer in docs pages for hands-on experience
- Blog / changelog section: release notes and dev diary
- Community: Discord link, user creation gallery
- SEO / OGP: embed demo song audio preview in OGP tags for rich social sharing
