# ADR 119: Scene Stamps

## Status: Implemented

## Context

inboil's scene is functional but visually sterile. Nodes and edges convey structure, but the canvas lacks personality. The app's philosophy — "building for self first, fun and game-like" — calls for expressive elements that make the workspace feel like your own.

kidpix.app demonstrates that purely decorative elements (stamps, doodles) make a creative tool more engaging. Users stamp fun graphics that serve no functional purpose but transform a blank canvas into a personal creation.

Scene labels (ADR 052) already provide free-floating text on the scene canvas with drag, resize, and multi-select. Stamps follow the same architectural pattern but use SVG graphics instead of text, with per-stamp beat-synced animations and ambient effects during playback.

### Design direction

Stamps have **character** — pictogram-style figures (like the emergency exit sign man dancing), expressive faces, and objects with personality. Each stamp has its own signature animation/effect during playback, making the canvas come alive when music plays.

Inspiration: emergency exit pictograms (非常口ピクトさん), Tokyo Olympics pictograms, acid smiley culture. Not geometric shapes — things with personality.

## Decision

### Scene Stamps: decorative SVGs with per-stamp beat-synced effects

Free-floating SVG graphics placed anywhere on the scene canvas. No effect on audio or playback — pure visual decoration. During playback, each stamp performs its own characteristic animation synced to the beat.

### 1. Data model

```typescript
/** Decorative stamp on the scene canvas (ADR 119) */
export interface SceneStamp {
  id: string
  stampId: string         // key into STAMP_LIBRARY
  x: number              // normalized 0–1
  y: number
  scale?: number         // size multiplier (default 1.0)
}

/** Built-in stamp definition */
interface StampDef {
  /** SVG path content (inside viewBox 0 0 24 24) */
  svg: string
  name: string
  nameJa: string
  /** CSS animation class applied during playback */
  animation: 'bounce' | 'spin' | 'wiggle' | 'pulse' | 'sway' | 'none'
  /** Optional ambient effect (radial glow/shadow around stamp) */
  ambient?: 'glow' | 'shadow' | 'flash'
}
```

Animation is defined per stamp in the library, not per instance — each stamp has a fixed personality. `scale` is the only user-adjustable visual property.

Added to `Scene`:

```typescript
interface Scene {
  nodes: SceneNode[]
  edges: SceneEdge[]
  labels: SceneLabel[]
  stamps: SceneStamp[]   // new
}
```

### 2. Stamp library (~10 stamps)

Each stamp is a single SVG path (viewBox 0 0 24 24). Stamps are characters or objects with personality, not abstract shapes.

| Stamp | Description | Play animation | Ambient |
|-------|------------|----------------|---------|
| dancer | Pictogram man dancing | Pose swap (2-frame step) | — |
| dj | Pictogram man at turntable | Arm wiggle | — |
| headbang | Pictogram man headbanging | Head bob (rotate) | — |
| jumper | Pictogram man jumping | Bounce up/down | — |
| smiley | Acid smiley face | SVG feTurbulence warp | — |
| moon | Crescent moon | Gentle sway | shadow |
| sun | Sun with rays | Spin (slow) | glow |
| heart | Heart | Pulse (heartbeat) | — |
| flame | Flame | Wiggle + scale | glow |
| ghost | Ghost | Float up/down + opacity | — |

Library is intentionally small (~10). Easy to add more later — each stamp is just a path + animation assignment.

### 3. Placement & interaction

Same interaction model as scene labels:

- **Place**: BubbleMenu → stamp picker (flat grid, no categories needed for 10), or toolbar button
- **Move**: Drag to reposition (pointer capture, no undo for moves)
- **Resize**: Drag resize handle (top-right circle, like labels)
- **Delete**: Delete/Backspace when selected
- **Multi-select**: Rectangle selection includes stamps alongside nodes and labels

### 4. Stamp picker

Simple grid popup — all stamps visible at once (no categories needed for ~10):

```
┌─ STAMPS ──────────────────┐
│  🕺  🎧  🤘  🦘  😊      │
│  🌙  ☀️  ❤️  🔥  👻      │
└───────────────────────────┘
```

Tap to select, then tap canvas to place. Picker shows actual SVG thumbnails.

### 5. Per-stamp animations

Each stamp type has a fixed animation. During playback (`playback.playing === true`), CSS animations sync to `--beat`:

```css
/* Self-animations */
.scene-stamp.playing .anim-bounce  { animation: stamp-bounce var(--beat) ease-out infinite alternate; }
.scene-stamp.playing .anim-spin    { animation: stamp-spin calc(var(--beat) * 4) linear infinite; }
.scene-stamp.playing .anim-wiggle  { animation: stamp-wiggle var(--beat) ease-in-out infinite alternate; }
.scene-stamp.playing .anim-pulse   { animation: stamp-pulse var(--beat) ease-out infinite alternate; }
.scene-stamp.playing .anim-sway    { animation: stamp-sway calc(var(--beat) * 2) ease-in-out infinite alternate; }

/* Ambient effects (pseudo-element behind stamp) */
.scene-stamp.playing .ambient-glow::after {
  content: '';
  position: absolute; inset: -20px; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,200,50,0.15), transparent 70%);
  animation: stamp-pulse var(--beat) ease-out infinite alternate;
}
.scene-stamp.playing .ambient-shadow::after {
  content: '';
  position: absolute; inset: -20px; border-radius: 50%;
  background: radial-gradient(circle, rgba(0,0,20,0.12), transparent 70%);
}

/* Dancer: 2-frame pose swap via path morph */
.scene-stamp.playing .anim-dancer svg path {
  animation: stamp-dancer var(--beat) steps(1) infinite;
}
```

Acid smiley uses SVG `<feTurbulence>` filter with `baseFrequency` animated on beat — tested in Chrome/Safari/Firefox.

### 6. Rendering

Stamps render in `SceneStamps.svelte`, same z-layer as labels (between edges and node buttons):

```svelte
{#each (song.scene.stamps ?? []) as stamp (stamp.id)}
  {@const def = STAMP_LIBRARY[stamp.stampId]}
  {@const size = 24 * (stamp.scale ?? 1)}
  {#if def}
    <div
      class="scene-stamp"
      class:selected={ui.selectedSceneStamps[stamp.id]}
      class:playing={playback.playing}
      style="
        left: {PAD_INSET + stamp.x * (WORLD_W - PAD_INSET * 2)}px;
        top: {PAD_INSET + stamp.y * (WORLD_H - PAD_INSET * 2)}px;
        --beat: {30 / song.bpm}s;
      "
    >
      <div class="stamp-inner anim-{def.animation}" class:ambient-glow={def.ambient === 'glow'} class:ambient-shadow={def.ambient === 'shadow'}>
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
          {@html def.svg}
        </svg>
      </div>
    </div>
  {/if}
{/each}
```

### 7. Color

Stamps use `currentColor` inheriting from parent. Default: `rgba(30, 32, 40, 0.35)` (same as labels — faint). Selected stamps become more opaque. Ambient effects use semi-transparent radial gradients.

## Considerations

- **Performance**: CSS animations are GPU-composited. Ambient effects are pseudo-elements with `border-radius: 50%` — GPU-friendly. Even 10+ stamps with ambient effects should have no measurable impact.
- **SVG feTurbulence** (acid smiley): One filter instance is fine. Multiple smileys share the same `<filter>` via `<defs>`. Tested performant up to ~5 instances.
- **Serialization**: Stamps are 5 fields of JSON. Animation/ambient are library-side, not stored per instance.
- **Library expansion**: Adding a stamp = one object in `STAMP_LIBRARY`. No schema changes needed.
- **Why fixed animation per stamp?**: Each stamp has a personality. "The dancer dances, the ghost floats" — it's more characterful than user-assigned generic animations. Reduces UI complexity (no animation picker).

## Implementation Phases

### Phase 1: Data model + CRUD
- Add `SceneStamp` type and `stamps[]` to `Scene`
- CRUD functions in `sceneActions.ts` (add, delete, move, resize)
- Migration: existing songs get empty `stamps: []`
- Add `selectedSceneStamps` to UI state
- Stamp library with ~10 entries (SVG paths)

### Phase 2: Rendering + placement
- `SceneStamps.svelte` component (positioned divs with inline SVG)
- Stamp picker UI (flat grid popup)
- BubbleMenu + toolbar integration
- Drag to move, resize handle
- Rectangle selection hit-test
- Delete/Backspace for removal

### Phase 3: Animations + ambient effects
- Per-stamp CSS keyframe animations
- Beat-sync via `--beat` CSS variable
- Ambient glow/shadow pseudo-elements
- Acid smiley feTurbulence filter
- Dancer pose-swap (2-frame SVG path morph or dual-path toggle)

## Future Extensions

- **Custom stamps**: Upload SVG files as user stamps (stored in IDB)
- **Color picker**: Per-stamp color override (from pattern color palette)
- **Stamp trails**: Drag to "paint" multiple stamps along a path
- **Reactive stamps**: Stamps that respond to audio (size pulses with kick, color shifts with filter)
- **Stamp packs**: Themed collections (retro, nature, abstract, emoji-style)
- **Export**: Include stamps in screenshot/video export of scene
