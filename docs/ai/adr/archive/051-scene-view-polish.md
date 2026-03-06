# ADR 051 — Scene View Polish: Playback Integration & Micro-interactions

| field   | value                              |
| ------- | ---------------------------------- |
| status  | implemented                        |
| date    | 2026-03-06                         |
| parent  | ADR 050 (Scene Function Nodes)     |

## Context

ADR 050 improved scene node visuals (SVG icons, root marker, FX node, transpose absolute mode). The scene view is now functional but lacks feedback during playback and has discoverability issues:

1. **Root node is still unclear**: The small play-triangle marker on the root node is easy to miss. Meanwhile, the Scene playback on/off toggle lives in PerfBar — spatially disconnected from the scene graph it controls.

2. **Solo pattern icon is cryptic**: The solo button next to a selected node shows a plain `>` symbol. It's not obvious this means "loop this pattern". There's no visual feedback while soloing.

3. **No edge animation during playback**: When the scene graph is playing and traversing edges, the active edge is highlighted with a static color change. There's no sense of motion or flow direction.

4. **No pattern progress indication**: When a pattern is playing, users can't tell how far through it they are or when the next pattern will start. The only feedback is in the step sequencer view (playhead position), which is invisible from the scene view.

## Decision

### 1. Root node + Scene playback button integration

Remove the scene playback toggle (`btn-scene-mode`) from PerfBar. Place a dedicated play/stop button adjacent to the root node on the scene canvas.

```
  [>] [ROOT-PAT] ----> [PAT-B] ----> ...
  ^ scene play button
```

- Button renders at a fixed offset to the left of the root node (follows pan/zoom)
- Click toggles `playback.mode` between `'scene'` and `'loop'` (same as current PerfBar button)
- Visual states:
  - Stopped: outlined play triangle, muted color
  - Playing: filled play triangle, accent color, subtle pulse animation
- The existing root marker (small triangle on the node border) is removed — the play button itself signals "this is where playback starts"

### 2. Solo pattern icon — repeat symbol with spin animation

Replace the solo button icon with a loop/repeat SVG icon (two curved arrows forming a cycle, similar to the repeat/recycle symbol).

```
  [PAT-A] [loop-icon]
           ^ solo button
```

- **Idle**: Static repeat icon, muted color
- **Active (soloing)**: Icon continuously rotates (CSS `animation: spin`) synced to a comfortable speed (not BPM-synced — just a visual indicator of "looping")
- **Color**: Blue tint when active (matching current `.active` style)

SVG path: Two semicircular arrows forming a closed loop (similar to Unicode `U+1F501` but as a clean SVG).

### 3. Active edge — animated dashed line

When a pattern is playing via scene mode, the edge leading to the current node gets an animated dash pattern that flows in the direction of traversal.

- **Implementation**: `ctx.setLineDash([6, 4])` with `ctx.lineDashOffset` animated per frame
  - Dash offset decreases over time so dashes flow from source to target
  - Speed is BPM-synced: dashes complete one full cycle (dash + gap = 10px) per beat
  - `dashOffset -= (10 * deltaTime * bps)` where `bps = bpm / 60`
- **Stroke**: Use accent color (blue) with higher opacity than static edges
- **Line width**: Slightly thicker than normal edges (2.5px vs 1.5px)
- **Non-active edges**: Remain solid and muted as before

```
  [ROOT] ====>>>> [PLAYING] -----> [NEXT]
         animated    ^         static
         dashes     current node
```

### 4. Pattern remaining gauge — hourglass drain

Each pattern node in the scene shows a progress gauge while it's the active pattern. The gauge visualizes how many steps remain before the pattern completes and the graph advances.

- **Visual**: An hourglass SVG icon overlaid on (or adjacent to) the active pattern node
  - The hourglass has a "fill level" that drains from top to bottom as steps progress
  - Fill is calculated as `1 - (currentStep / totalSteps)` using `playback.playheads` max value vs pattern length
  - When fill reaches 0, the scene advances to the next node
- **Position**: Small icon (16x16) at the bottom-right corner of the active pattern node
- **Animation**: Smooth interpolation between steps (CSS transition or lerped in canvas draw)
- **Inactive nodes**: No hourglass shown

```
  [ROOT  ] ----> [PLAYING ] ----> [NEXT]
                  [........]
                   ^^^ hourglass draining
```

Progress calculation:
```typescript
const maxHead = Math.max(...playback.playheads)
const patLen  = patterns[currentPatIdx].length  // steps per pattern
const progress = maxHead / patLen               // 0..1
// hourglass fill = 1 - progress (full at start, empty at end)
```

## Implementation Phases

### Phase 1: Root node + Scene playback integration
1. Add scene play/stop button rendered on canvas near root node
2. Remove `btn-scene-mode` from PerfBar
3. Add pulse animation for playing state
4. Remove old root marker triangle (play button replaces it)

### Phase 2: Solo icon redesign
1. Replace solo button icon with repeat/loop SVG
2. Add CSS spin animation when `playback.soloPattern` is active
3. Update tooltip text

### Phase 3: Animated edge flow
1. Track `lineDashOffset` in animation loop, advancing by BPM-synced delta
2. Apply dashed stroke to edge where `edge.id === playback.sceneEdgeId`
3. Keep solid stroke for all other edges

### Phase 4: Hourglass progress gauge
1. Draw hourglass SVG icon on canvas at active pattern node
2. Calculate fill level from `playback.playheads` vs pattern length
3. Animate fill drain with smooth interpolation
4. Clear gauge on pattern switch or stop

## Considerations

- **Canvas vs DOM**: The scene view uses `<canvas>` for edges and DOM overlays for nodes. The play button (Phase 1) and solo icon (Phase 2) are DOM elements. The edge animation (Phase 3) is canvas-based. The hourglass (Phase 4) can be either — canvas is simpler since it needs per-frame updates for smooth drain.
- **Performance**: Edge dash animation requires continuous canvas redraws during playback. This is acceptable since the canvas already redraws for playback highlights. Use `requestAnimationFrame` gated on `playback.playing`.
- **BPM sync precision**: The dash flow doesn't need sample-accurate sync — visual approximation from `playback.bpm` is sufficient. The hourglass gauge similarly uses step-level granularity from `playback.playheads`.
- **Mobile**: All animations should respect `prefers-reduced-motion`. The hourglass and dash animations are subtle enough for mobile performance.

## Extends

| ADR | Impact |
|-----|--------|
| 050 (Scene Function Nodes) | Builds on Phase 1-3 visual improvements. Replaces root marker with integrated play button. |
| 048 (Scene Playback) | Leverages `playback.sceneEdgeId` for edge animation, `playback.sceneNodeId` for active node gauge. |
| 044 (Scene Graph) | No data model changes. All additions are visual/interaction layer. |
