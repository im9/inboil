# ADR 049 — Pattern Identity: Rename & Color

| field   | value                              |
| ------- | ---------------------------------- |
| status  | implemented                        |
| date    | 2026-03-05                         |
| parent  | ADR 043 (Matrix View), ADR 044 (Scene) |

## Context

Patterns currently lack visual identity beyond their name. When a project grows
to 20+ patterns, the Matrix View grid and Scene become hard to navigate:

1. **No rename UI** — `patternRename()` exists in state but is never called.
   The header in MatrixView shows the name read-only. Users cannot rename
   patterns after creation.

2. **No color** — Every pattern uses the same olive scheme in Matrix View cells
   and Scene nodes. There is no way to visually group or distinguish patterns
   (e.g. drums vs. melody vs. fills).

Hardware grooveboxes (Elektron, Roland SP-404) assign colors to patterns/banks
for quick visual identification during live performance.

### Current data model

```ts
export interface Pattern {
  id: string        // 'pat_00'
  name: string      // max 8 chars, uppercase
  cells: Cell[]     // 8 tracks
}
```

No `color` field exists. Scene nodes (`SceneNode`) inherit a fixed olive color
via CSS.

## Decision

### 1. Add `color` field to Pattern

```ts
export interface Pattern {
  id: string
  name: string
  color: number       // ← new: index into PATTERN_COLORS palette (0–7)
  cells: Cell[]
}
```

A fixed palette of 8 colors avoids free-form hex input and maintains visual
consistency. The palette uses existing theme colors plus a few additions:

```ts
// constants.ts
export const PATTERN_COLORS = [
  '#787845',  // 0: olive (default)
  '#4472B4',  // 1: blue
  '#E8A090',  // 2: salmon
  '#9B6BA0',  // 3: purple
  '#4A9B9B',  // 4: teal
  '#B8860B',  // 5: gold
  '#6B8E6B',  // 6: sage
  '#CD5C5C',  // 7: brick
] as const
```

Default: `color: 0` (olive). Factory patterns keep `color: 0`.

### 2. Rename UI in MatrixView header

The existing `.head-name` span becomes an inline-editable field:

- **Click** the pattern name → enters edit mode (text input)
- **Enter** or **blur** → commits rename via `patternRename()`
- **Escape** → cancels edit
- Max 8 characters, auto-uppercase (enforced by existing `patternRename()`)
- Input styled to match existing `.head-name` (8px monospace, same dimensions)

### 3. Color picker in MatrixView header

A small color dot/button next to the pattern name:

- **Click** → opens a minimal 8-swatch popup (single row)
- **Click swatch** → sets `song.patterns[i].color = index`
- Popup closes on selection or outside click
- Dot shows current pattern color

### 4. Color reflected in Matrix View cells

`pat-cell` background tint uses the pattern's color:

```css
.pat-cell.has-data {
  background: rgba(var(--pat-r), var(--pat-g), var(--pat-b),
    calc(0.08 + var(--d) * 0.25));
}
```

The cell's `style` attribute sets `--pat-r/g/b` from `PATTERN_COLORS[pat.color]`.
Empty patterns (no data) remain neutral gray.

### 5. Color reflected in Scene nodes

`SceneView.svelte` reads the linked pattern's color for node styling:

```ts
function nodeColor(node: SceneNode): string {
  if (node.type !== 'pattern') return 'var(--color-olive)'
  const pat = song.patterns.find(p => p.id === node.patternId)
  return PATTERN_COLORS[pat?.color ?? 0]
}
```

Node border, background (when active), and glow use this color instead of
hard-coded olive.

## Changes

### constants.ts
- Add `PATTERN_COLORS` array

### state.svelte.ts
- `Pattern` interface: add `color: number`
- `patternSetColor(index: number, color: number)`: new function with undo
- `clonePattern()`: include `color` in clone

### factory.ts
- `makeEmptyPattern()`: add `color: 0` default
- Factory presets: add `color: 0`

### MatrixView.svelte
- Header: replace static `<span>` with click-to-edit `<input>`
- Header: add color dot + 8-swatch popup
- Cell: set `--pat-r/g/b` CSS vars from pattern color

### SceneView.svelte
- `nodeColor()` function: resolve pattern color
- Node elements: use dynamic color instead of `var(--color-olive)`

## Migration

Existing saved data (if persistence is added later) will have patterns without
`color`. Default to `0` when field is missing:

```ts
color: pat.color ?? 0
```
