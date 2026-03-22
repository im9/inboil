# ADR 119: Scene Stamps

## Status: Proposed

## Context

inboil's scene graph is functional but visually sterile. Nodes and edges convey structure, but the canvas lacks personality. The app's philosophy — "building for self first, fun and game-like" — calls for expressive elements that make the workspace feel like your own.

kidpix.app demonstrates that purely decorative elements (stamps, doodles) make a creative tool more engaging. Users stamp fun graphics that serve no functional purpose but transform a blank canvas into a personal creation.

Scene labels (ADR 052) already provide free-floating text on the scene canvas with drag, resize, and multi-select. Stamps follow the same architectural pattern but use SVG graphics instead of text, with the addition of beat-synced animations during playback.

## Decision

### Scene Stamps: decorative SVGs with beat-synced animation

Free-floating SVG graphics placed anywhere on the scene canvas. No effect on audio or playback — pure visual decoration. During playback, stamps animate in sync with the beat (bounce, spin, wiggle, pulse).

### 1. Data model

```typescript
/** Decorative stamp on the scene canvas (ADR 119) */
export interface SceneStamp {
  id: string
  stampId: string         // key into STAMP_LIBRARY
  x: number              // normalized 0–1
  y: number
  scale?: number         // size multiplier (default 1.0)
  animation?: StampAnimation  // animation style (default 'bounce')
}

type StampAnimation = 'bounce' | 'spin' | 'wiggle' | 'pulse' | 'none'
```

Added to `Scene`:

```typescript
interface Scene {
  nodes: SceneNode[]
  edges: SceneEdge[]
  labels: SceneLabel[]
  stamps: SceneStamp[]   // new
}
```

### 2. Stamp library

Built-in collection of SVG graphics. Each stamp is a small inline SVG (viewBox 0 0 24 24 or similar). Categories:

| Category | Examples |
|----------|----------|
| Shapes | circle, triangle, diamond, star, hexagon, cross |
| Music | note, double-note, rest, speaker, waveform |
| Nature | flower, leaf, sun, moon, cloud, lightning |
| Fun | heart, sparkle, spiral, squiggle, zigzag |

```typescript
const STAMP_LIBRARY: Record<string, { svg: string; category: string; name: string }> = {
  star: { svg: '<path d="M12 2 L14.5 9 L22 9 L16 14 L18 21 L12 17 L6 21 L8 14 L2 9 L9.5 9 Z"/>', category: 'shapes', name: 'Star' },
  note: { svg: '...', category: 'music', name: 'Note' },
  // ...
}
```

### 3. Placement & interaction

Stamps follow the same interaction model as scene labels:

- **Place**: BubbleMenu → stamp picker (category grid), or toolbar button
- **Move**: Drag to reposition (pointer capture, no undo for moves)
- **Resize**: Drag resize handle (top-right circle, like labels)
- **Animation cycle**: Tap a selected stamp to cycle animation style
- **Delete**: Delete/Backspace when selected
- **Multi-select**: Rectangle selection includes stamps alongside nodes and labels

### 4. Stamp picker

When "Stamp" is selected from BubbleMenu or toolbar, a category picker appears:

```
┌─ STAMPS ─────────────────────┐
│ Shapes   Music   Nature  Fun │
├──────────────────────────────┤
│  ○  △  ◇  ★  ⬡  ✕          │
│  ♥  ✿  ⚡  ☁  ☀  ☽          │
│  ♫  ♪  〰  ✧  ⌁  ∿          │
└──────────────────────────────┘
```

Grid of stamp icons, tap to select, then tap canvas to place.

### 5. Beat-synced animations

During playback (`playback.playing === true`), stamps animate using CSS animations synced to `--beat` (same timing variable used by node-pulse):

```css
.scene-stamp.playing.anim-bounce {
  animation: stamp-bounce var(--beat) ease-out infinite alternate;
}
.scene-stamp.playing.anim-spin {
  animation: stamp-spin calc(var(--beat) * 4) linear infinite;
}
.scene-stamp.playing.anim-wiggle {
  animation: stamp-wiggle var(--beat) ease-in-out infinite alternate;
}
.scene-stamp.playing.anim-pulse {
  animation: stamp-pulse var(--beat) ease-out infinite alternate;
}

@keyframes stamp-bounce {
  from { transform: translate(-50%, -50%) translateY(0); }
  to   { transform: translate(-50%, -50%) translateY(-6px); }
}
@keyframes stamp-spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to   { transform: translate(-50%, -50%) rotate(360deg); }
}
@keyframes stamp-wiggle {
  from { transform: translate(-50%, -50%) rotate(-8deg); }
  to   { transform: translate(-50%, -50%) rotate(8deg); }
}
@keyframes stamp-pulse {
  from { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  to   { transform: translate(-50%, -50%) scale(1.2); opacity: 0.7; }
}
```

### 6. Rendering

Stamps render in a dedicated component (`SceneStamps.svelte`) layered between the canvas edges and the node buttons — same z-layer as labels:

```svelte
{#each (song.scene.stamps ?? []) as stamp (stamp.id)}
  {@const size = 24 * (stamp.scale ?? 1)}
  <div
    class="scene-stamp"
    class:selected={ui.selectedSceneStamps[stamp.id]}
    class:playing={playback.playing}
    class:anim-bounce={stamp.animation === 'bounce' || !stamp.animation}
    class:anim-spin={stamp.animation === 'spin'}
    class:anim-wiggle={stamp.animation === 'wiggle'}
    class:anim-pulse={stamp.animation === 'pulse'}
    style="
      left: {PAD_INSET + stamp.x * (WORLD_W - PAD_INSET * 2)}px;
      top: {PAD_INSET + stamp.y * (WORLD_H - PAD_INSET * 2)}px;
      --beat: {30 / song.bpm}s;
    "
  >
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      {@html STAMP_LIBRARY[stamp.stampId]?.svg ?? ''}
    </svg>
  </div>
{/each}
```

### 7. Color

Stamps use `currentColor` which inherits from the parent. Default color is `rgba(30, 32, 40, 0.35)` (same as labels — faint). Selected stamps become more opaque. During playback, stamps could tint with `--color-olive` for visual warmth.

## Considerations

- **Performance**: Stamps are pure CSS animations, not canvas-drawn. Even 20+ stamps should have no measurable impact since CSS animations are GPU-composited.
- **Serialization**: Stamps are plain JSON (id, stampId, x, y, scale, animation). Negligible storage cost.
- **Mobile**: Stamps are touch-friendly — same drag/tap interaction as labels. Picker grid works on small screens.
- **Scope control**: Starting with ~20 built-in stamps. User-created stamps (SVG upload) is a future extension.
- **Why not canvas-drawn?**: CSS animations are smoother and simpler than requestAnimationFrame. Stamps don't need per-frame control — they just dance.
- **Why not attach to nodes?**: Free placement is more expressive. Users can decorate empty space, cluster stamps around nodes, or create borders. Node-attached decorations would limit creativity.

## Implementation Phases

### Phase 1: Data model + CRUD
- Add `SceneStamp` type and `stamps[]` to `Scene`
- CRUD functions in `sceneActions.ts` (add, delete, move, resize, setAnimation)
- Migration: existing songs get empty `stamps: []`
- Add `selectedSceneStamps` to UI state

### Phase 2: Rendering + placement
- `SceneStamps.svelte` component (positioned divs with inline SVG)
- Stamp picker UI (category grid popup)
- BubbleMenu + toolbar integration
- Drag to move, resize handle
- Rectangle selection hit-test
- Delete/Backspace for removal

### Phase 3: Animations
- CSS keyframe animations (bounce, spin, wiggle, pulse)
- Beat-sync via `--beat` CSS variable
- Tap selected stamp to cycle animation style
- `animation: 'none'` option for static stamps

### Phase 4: Library expansion
- 20+ built-in stamps across 4 categories
- Stamp preview in picker with tooltips

## Future Extensions

- **Custom stamps**: Upload SVG files as user stamps (stored in IDB)
- **Color picker**: Per-stamp color override (from pattern color palette)
- **Stamp trails**: Drag to "paint" multiple stamps along a path
- **Reactive stamps**: Stamps that respond to audio (size pulses with kick, color shifts with filter)
- **Stamp packs**: Themed collections (retro, nature, abstract, emoji-style)
- **Export**: Include stamps in screenshot/video export of scene
