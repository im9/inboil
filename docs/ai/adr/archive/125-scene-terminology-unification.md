# ADR 125: Scene Terminology Unification

## Status: Implemented

## Context

The scene graph terminology has grown organically through multiple ADRs (024, 038, 044, 050, 062, 066, 078, 093, 116) and is now inconsistent across code, docs, and UI. The same concept has different names depending on where you look:

### Current terminology chaos

| Concept | Code (`types.ts`) | Code (functions) | Site docs URL | Site docs title | UI labels |
|---------|-------------------|-----------------|---------------|-----------------|-----------|
| Transpose/Tempo/Repeat/FX | `FnNodeType` | `sceneAddFnNode()`, `findAttachedFnNodes()` | `/docs/scene/decorators/` | "Function Node Modifiers" | (type name only) |
| Sweep | `FnNodeType` (same union) | `sceneAddFnNode()` | `/docs/scene/function/sweep/` | "Sweep" (under "Function Nodes") | (type name only) |
| Turing/Quantizer/Tonnetz | `GenerativeEngine` | `sceneAddGenerativeNode()` | `/docs/scene/function/` | "Function Nodes" | (engine name only) |
| Legacy attachment model | `SceneDecorator` | `migrateDecoratorsToFnNodes()` | — | — | — |

Problems:
1. **"Function Node"** means generators in docs (`/docs/scene/function/`) but modifiers in code (`FnNodeType`)
2. **"Decorator"** is the URL slug for modifiers (`/docs/scene/decorators/`) but deprecated in code
3. Users see neither "Function" nor "Decorator" in the UI — just the specific type names
4. Developers searching code for "modifier" find nothing; searching for "fn" conflates with JS `fn` abbreviations
5. The `/docs/scene/function/` page groups generators and sweep under one umbrella, but sweep is neither a generator nor a modifier — it has unique UI (faceplate + edge connection) and unique behavior (automation curves)

### Modular synth analogy

The scene graph was designed with Eurorack modular synth philosophy. In that world:
- **Generator** = module that creates signal (oscillator, noise, sequencer)
- **Modifier** = module that transforms signal (filter, VCA, quantizer, transposer)
- **Sweep** doesn't map cleanly to either — it's closest to a modulation source (LFO/envelope) that shapes parameters over time

This informs the terminology: three distinct categories rather than forcing everything into two.

## Decision

### 1. User-facing terminology (4 categories)

| Category | Definition | Members | Visual / connection |
|----------|-----------|---------|---------------------|
| **Pattern** | Plays a matrix pattern | — | Pill shape node |
| **Generator** | Creates musical material algorithmically | Turing Machine, Quantizer, Tonnetz | Faceplate node, colored accent ring. Connected to patterns via edges |
| **Modifier** | Transforms how a pattern plays (satellite) | Transpose, Tempo, Repeat, FX | Small satellite, auto-positioned above parent pattern |
| **Sweep** | Automation curves applied to a pattern's playback | (standalone) | Faceplate node (like generators). Connected to patterns via edges, not satellite |

Sweep is its own category because it's architecturally distinct from both generators and modifiers:
- Unlike **modifiers**: uses faceplate UI and manual edge connection (not satellite auto-attach)
- Unlike **generators**: doesn't create note data — it modifies parameter curves over a pattern's duration
- Has significant **future extension potential** (see Future Extensions)

"Function Node" is retired as a user-facing term. It was an implementation-era umbrella that no longer helps users.

### 2. Code rename map

#### Types (`src/lib/types.ts`)

| Old | New |
|-----|-----|
| `FnNodeType` | `ModifierType` |
| `FnParams` | `ModifierParams` |
| `SceneNode.fnParams` | `SceneNode.modifierParams` |
| `SceneNode.type` union: `FnNodeType` member | `ModifierType` member (same values) |
| `LegacyFnType` | `LegacyModifierType` |

`SceneDecorator` — keep as-is (deprecated, migration-only). Add comment: `/** @deprecated Use ModifierType nodes instead (ADR 093) */`.

`GenerativeEngine`, `GenerativeConfig` — keep as-is. The code name `generative` is close enough to `Generator`; renaming 190 occurrences for one word difference isn't worth it.

#### Functions

| File | Old | New |
|------|-----|-----|
| `sceneActions.ts` | `sceneAddFnNode()` | `sceneAddModifier()` |
| `sceneActions.ts` | `sceneUpdateFnParams()` | `sceneUpdateModifierParams()` |
| `sceneActions.ts` | `findAttachedFnNodes()` | `findAttachedModifiers()` |
| `sceneActions.ts` | `FN_DEFAULTS` | `MODIFIER_DEFAULTS` |
| `sceneGeometry.ts` | `fnNodeLabel()` | `modifierLabel()` |
| `sceneGeometry.ts` | `fnNodeIcon()` | `modifierIcon()` |
| `sceneGeometry.ts` | `fnNodeValue()` | `modifierValue()` |
| `sceneData.ts` | `purgeOrphanFnNodes()` | `purgeOrphanModifiers()` |
| `sceneData.ts` | `migrateDecoratorsToFnNodes()` | `migrateDecoratorsToModifiers()` |

#### CSS classes (`DockPanel.svelte`)

| Old | New |
|-----|-----|
| `.fn-editor` | `.mod-editor` |
| `.fn-row` | `.mod-row` |
| `.fn-label` | `.mod-label` |
| `.fn-toggle` | `.mod-toggle` |
| `.fn-stepper` | `.mod-stepper` |
| `.fn-key-row` | `.mod-key-row` |
| `.fn-value` | `.mod-value` |

#### Component naming

No file renames. `DockGenerativeEditor.svelte` stays — internal component names don't leak to users.

### 3. Site docs restructure

| Old path | New path | New title |
|----------|----------|-----------|
| `/docs/scene/decorators/` | `/docs/scene/modifiers/` | "Modifiers" |
| `/docs/scene/function/` | `/docs/scene/generators/` | "Generators" |
| `/docs/scene/function/turing-machine/` | `/docs/scene/generators/turing-machine/` | (same) |
| `/docs/scene/function/quantizer/` | `/docs/scene/generators/quantizer/` | (same) |
| `/docs/scene/function/tonnetz/` | `/docs/scene/generators/tonnetz/` | (same) |
| `/docs/scene/function/sweep/` | `/docs/scene/sweep/` | "Sweep" (own section — distinct from both generators and modifiers) |

Sweep gets its own docs section, not nested under modifiers or generators.

`nodes.mdx`:
- Replace "Generative Node" → "Generator"
- Remove "Function Node" references
- Add Sweep as its own node type section
- Add Probability node section (currently undocumented)
- Add Stamp section (ADR 119 — implemented but undocumented in site docs)
- Fix all internal links

JA docs: mirror all changes.

### 4. Data migration

`SceneNode.fnParams` → `SceneNode.modifierParams` requires a migration in `restoreSong()`:

```ts
// In restoreSong() migration block:
if (node.fnParams && !node.modifierParams) {
  node.modifierParams = node.fnParams;
  delete node.fnParams;
}
```

This is the same pattern used for `decorators → fnParams` (ADR 093). Old saves get migrated on load; new saves use the new field name.

### 5. SidebarHelp updates

Update the scene section in SidebarHelp to use "Generator" and "Modifier" terminology consistently.

## Phasing

### Phase 1 — Code rename (types + functions)
- Rename types in `types.ts`
- Rename functions in `sceneActions.ts`, `sceneGeometry.ts`, `sceneData.ts`
- Update all call sites (11 files, ~138 `fn` occurrences + ~58 `decorator` comment updates)
- Add `fnParams` → `modifierParams` migration in `restoreSong()`
- Rename CSS classes in `DockPanel.svelte`
- `pnpm check` + `pnpm test`

### Phase 2 — Site docs
- Rename/restructure doc files and paths
- Move `sweep.mdx` to its own section (`/docs/scene/sweep/`)
- Update all cross-references and link paths
- Add Probability node documentation to `nodes.mdx`
- Add Sweep node type section to `nodes.mdx`
- Mirror all changes in JA docs

### Phase 3 — SidebarHelp + comments
- Update SidebarHelp scene section text
- Update code comments that reference old terms
- Update ADR INDEX.md notes for affected ADRs

### Phase 4 — Interactive docs (Playground embeds)
- Create `PlaygroundSceneNode.svelte` — renders actual node visuals (pattern pill, modifier satellite, generator faceplate, sweep faceplate) as a lightweight Svelte component
- Embed per-page: each doc page shows its node type rendered as it appears in the app
- Also add to nodes.mdx tool palette section alongside the icon table
- Depends on Phase 1 completion (use new API names)

**Status**: All phases complete. Phase 4 delivered PlaygroundSceneNode (static node visuals for nodes/modifiers/sweep pages) and PlaygroundGenerator (SceneView + DockPanel for each generator engine page, with Turing→Quantizer chain for quantizer).

## Considerations

- **`generative` not renamed to `generator`**: The code uses `generative` as an adjective (GenerativeEngine, GenerativeConfig) while docs will say "Generator" as a noun. This is a minor inconsistency but renaming 190 occurrences across 19 files for adjective→noun isn't worth the churn. The mapping is obvious.
- **Sweep as its own category**: Sweep shares `FnNodeType` and `FnParams` with modifiers in code, but its UI behavior (faceplate, edge connection) matches generators. Rather than forcing it into either category and adding caveats, it gets its own section. This also leaves room for sweep-specific extensions without polluting the modifier or generator docs.
- **No UI category labels needed**: Users never see "Modifier" or "Generator" as a label in the app — they see specific names (Transpose, Turing Machine). The terminology is for docs and developer comprehension, not UI chrome.
- **Backwards compat**: `fnParams` migration is trivial (same pattern as ADR 093 decorator migration). Old saves load fine.

## Future Extensions

- **Tooltip grouping**: Tool palette could show "Generators", "Modifiers", "Sweep" as group headers (currently just a flat row of icons)
- **Custom modifiers**: User-defined modifier chains (e.g., "transpose +5 then repeat 4x" as a reusable preset)
- **Sweep extensions**: Multi-pattern sweep (span across multiple nodes), sweep templates/presets, per-curve easing modes, sweep-as-generator (create note patterns from curves)
