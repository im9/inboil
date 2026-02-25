# UI Design

## Direction: Brutalist Minimal + Geometric Graphic Design — DECIDED

Inspired by Swiss International Style and New Brutalism.
Treats the UI as graphic design first — geometric shapes, bold typography, and high-contrast zones are compositional elements, not decoration added on top of a functional layout.

### Principles

1. **Geometry drives composition** — Large geometric shapes (rectangles, circles, triangles) anchor the visual hierarchy before any content is placed.
2. **Black zones and white zones** — Large areas can flip to inverted (black bg / white fg). This is a compositional tool, not theming.
3. **Bold numbers as visual anchors** — BPM, step count, pattern number are displayed at display scale, dominating their zone.
4. **No gradients, no shadows** — Depth through border weight, whitespace, and zone contrast only.
5. **Two font roles** — Display font (bold grotesque) for large numbers and headings; monospace for all functional data and labels.
6. **Color is reserved for state** — Only the accent color carries meaning (playing, active, record).
7. **Geometric patterns as texture** — Stripe and grid patterns can fill muted/inactive areas to add visual rhythm without color.

## Color Palette

```
--color-bg:       #ffffff   /* page background */
--color-fg:       #000000   /* primary text, borders */
--color-muted:    #888888   /* inactive steps, disabled controls */
--color-accent:   #ff3300   /* active trig, playhead, record state */
--color-surface:  #f0f0f0   /* subtle panel differentiation (use sparingly) */
```

> Only `--color-accent` is vivid. Everything else is black, white, or gray.

## Typography

Two font roles. Never mix them within the same element.

### Display font — bold grotesque
Used for: BPM number, pattern number, large step counter, section headings.

```css
font-family: "Bebas Neue", "Anton", sans-serif;  /* condensed bold grotesque */
```

Sizes: 48px / 32px / 24px only. Always uppercase. No letter-spacing (condensed fonts tighten naturally).

### Data font — monospace
Used for: parameter values, labels, step numbers, all interactive controls.

```css
font-family: "JetBrains Mono", "Fira Code", monospace;
font-size-base: 12px;
line-height: 1.4;
```

- All sizes are multiples of 4px.
- Labels are ALL CAPS with `letter-spacing: 0.08em`.
- No italic. Bold only for emphasis, never decoration.

## Graphic Design Language

### Zone Inversion

The UI is divided into zones. Any zone can be inverted (black bg / white fg).
Inversion is a compositional choice — it creates visual separation without borders.

```
White zone:  background #ffffff, text/border #000000
Black zone:  background #000000, text/border #ffffff
```

Typical usage:
- Header bar → **black zone** (anchors the top edge strongly)
- Step grid → **white zone** (content area, maximum readability)
- Selected track param panel → **black zone** (visually separates from grid)
- Muted track row → subtle stripe texture (see below)

### Geometric Decorative Elements

Large geometric SVG shapes are placed in compositional positions — not as icons, but as visual mass.
They are always flat, monochrome, and belong to the zone color (white on black, black on white).

**Permitted shapes:**
- Filled rectangle (any aspect ratio)
- Circle / semicircle
- Right triangle (45° or 30/60°)
- Horizontal or vertical line (1px–8px weight)

**Placement rules:**
- Decorative shapes live in their own layer behind content (z-index below interactive elements).
- Never obscure interactive elements.
- Anchor to corners or edges of their containing zone — not floating in the middle.
- Max 2 decorative shapes per zone to avoid visual clutter.

**Example placements:**
```
Header (black zone):
  ┌────────────────────────────────────────┐
  │ ●  INBOIL   120   [▶][■]    PAT: 01   │
  │ (large filled circle, top-left corner) │
  └────────────────────────────────────────┘

Param panel (black zone):
  ┌────────────────────────────────────────┐
  │ CUTOFF  RESO  DECAY          ▐▐▐▐      │
  │                  (right-aligned rect cluster as graphic mass)
  └────────────────────────────────────────┘
```

### Geometric Pattern Textures

Stripe and grid patterns (SVG `<pattern>`) are used as fills for inactive states.
They replace solid color fills in contexts where "dimmed but present" needs to be communicated.

**Patterns:**
```
stripe-h:  horizontal lines, 2px stroke, 4px gap, 45° rotation  →  muted track rows
stripe-v:  vertical lines, same spec  →  empty pattern slots
dot-grid:  2×2px dots on 8px grid  →  background of inactive zones (PROPOSED)
```

All patterns use `--color-fg` at `opacity: 0.15` on a white background.
On a black zone: white at `opacity: 0.12`.

### Large Number Display

BPM and pattern number are displayed at display scale as visual anchors.

```
BPM:     48px Bebas Neue, white on black
PAT:     32px Bebas Neue, white on black, right-aligned in header
Step counter (mobile):  32px Bebas Neue, "01 / 16"
```

These numbers are not just labels — they are the dominant visual element of their zone.

## Layout

### Main Screen (desktop, 1280px+)

Zone breakdown:
- **Header**: black zone — large BPM number (display font), geometric circle anchor left
- **Step grid**: white zone — maximum readability, no decoration
- **Param panel**: black zone — creates clear separation from grid above

```
█ = black zone   ░ = white zone

┌█████████████████████████████████████████████████┐
│█ ●  INBOIL        120    [▶][■][●]    PAT: 01  █│  ← Header (56px, black zone)
│█    (circle)   (48px BN)              (32px BN)█│
├░░░░░░░░░░┬░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┤
│░ KICK  ▶ │░ [■][ ][ ][■][ ][ ][■][ ][ ][ ]...  │  ← Step grid (white zone)
│░ SNARE   │░ [ ][ ][ ][ ][■][ ][ ][ ][ ][ ]...  │    Track label left, steps right
│░ HATS    │░ [■][■][ ][■][■][■][ ][■][ ][ ]...  │
│░ ░░░░░░░░│░ (muted row: stripe-h texture)       │
│░ ░░░░░░░░│░ ...                                 │
├█████████████████████████████████████████████████┤
│█  CUTOFF        RESONANCE       DECAY        ████│  ← Param panel (black zone)
│█  [knob]          [knob]        [knob]       ████│    rect cluster right as graphic mass
│█  880 Hz           0.4          120ms        ████│
└─────────────────────────────────────────────────┘
```

### Responsive Behavior — DECIDED

Responsive design is required. The UI must be usable on smartphones without feeling broken.

#### Breakpoints

```
sm:  < 640px   (smartphone portrait)
md:  640–1023px (tablet / smartphone landscape)
lg:  ≥ 1024px  (desktop — primary design target)
```

#### Desktop (lg) — Primary layout
See ASCII diagram above.

#### Tablet (md)

```
┌─────────────────────────────────┐
│  INBOIL   BPM:120  [▶][■]  P:01 │  ← Header (40px)
├─────────────────────────────────┤
│  T1 KICK  [■][ ][ ][■][ ][ ]…  │  ← Track list fills full width
│  T2 SNARE [ ][ ][ ][ ][■][ ]…  │    Track label + steps in one row
│  T3 HATS  [■][■][ ][■][■][■]…  │    Steps may scroll horizontally
│  ...                            │
├─────────────────────────────────┤
│  SYNTH PARAMS (selected track)  │  ← Param panel below grid
└─────────────────────────────────┘
```

#### Smartphone (sm)

```
┌───────────────────┐
│ INBOIL  [▶][■] »  │  ← Minimal header; BPM hidden, tap » to expand
├───────────────────┤
│ T1 KICK     [SEL] │  ← Track list: name + select only (no inline steps)
│ T2 SNARE    [SEL] │
│ T3 HATS     [SEL] │
│ ...               │
├───────────────────┤
│ [■][■][ ][■][ ]…  │  ← Selected track steps (horizontal scroll)
│ Step 1–16 of 16   │
├───────────────────┤
│ CUTOFF  RESO  DEC │  ← Params: 3 knobs visible at a time, swipe for more
└───────────────────┘
```

#### Touch Interaction

- Step buttons must be at least **44×44px** on mobile (tap target, may be larger than the visual square).
- Knob drag remains vertical drag; pinch is not used.
- No hover states on mobile — active state triggers on `touchstart`.
- BPM tap-tempo: double-tap the BPM display to set tempo by tapping rhythm (PROPOSED for mobile only).

## Component Conventions

### Step Button (Trig)

A step button has four persistent states and two transient states.

**Persistent states:**

```
State                      Background        Border
─────────────────────────────────────────────────────
Empty, not playing         #ffffff           1px solid #000
Active trig, not playing   #000000           1px solid #000
Empty, playhead here       var(--color-accent)   1px solid #000
Active trig, playhead here var(--color-accent) + inner white 4×4px square
```

The inner white square on the last state makes it unmistakable that both
"trig exists" and "it is currently being played" are true simultaneously.

**Transient states (animation):**

```
State                Duration   Visual
────────────────────────────────────────────────────────────────
Trig just fired      80ms       accent bg → returns to Active state
User pressing        60ms       scale(0.88) on press, scale(1) on release
```

- Size: 20×20px desktop, 44×44px tap target on mobile (visual remains 20px, touch area enlarged).
- No border-radius (square).
- Toggled on `mousedown` / `touchstart` (no waiting for release — immediate feedback).
- No drag-to-activate in v1.

### Knob / Parameter Control

- SVG-based rotary knob.
- Drag vertically to change value (up = increase).
- Double-click to enter numeric value.
- Displays current value as text below the knob in monospace, **updates live while dragging**.
- Cursor: `ns-resize` on hover.
- While dragging: show a floating tooltip directly above the knob with the exact value (`1px solid #000`, white bg, monospace). Disappears on release.
- No decorative chrome — just the arc indicator and label.

### Buttons (transport / action)

```css
border: 1px solid #000;
background: #fff;
padding: 4px 12px;
font-family: monospace;
font-size: 11px;
letter-spacing: 0.08em;
text-transform: uppercase;
cursor: pointer;

/* active / pressed */
background: #000;
color: #fff;
```

### Track List Item

- One row per track.
- Shows: track number, track name (ALL CAPS), mute button, volume bar.
- Selected track has a `1px solid #000` left border indicator (no fill change).

## Interaction Model

| Action | Gesture |
|---|---|
| Toggle trig | Click step button |
| Select track | Click track name |
| Adjust parameter | Drag knob vertically |
| Enter value | Double-click knob |
| Play / Stop | Spacebar or transport button |
| Change BPM | Drag BPM display vertically, or double-click to type |
| Mute track | Click M button on track |

## Animation & Feedback

Animation serves one purpose only: **communicating state**. Never used for aesthetics.

### Timing Rules

```
All durations:  ≤ 150ms
Easing:         linear or ease-out only (no spring / bounce)
Properties:     transform and background only (no layout-triggering properties)
```

### Playhead

The current step indicator moves **instantly** with the sequencer clock — no easing.
It is always the accent color (`#ff3300`), making the playhead immediately locatable at a glance.

### Trig Fire Flash

When the WASM engine fires a trig (audio plays), the UI receives a `TRIG_FIRED` event via MessagePort.

```css
/* Applied for 80ms then removed */
.step--fired {
  background: var(--color-accent);
  transform: scale(1.15);
  transition: transform 80ms linear, background 80ms linear;
}
```

This flash is distinct from the persistent playhead highlight — it scales slightly larger to draw the eye.

### Trig Toggle (user press)

Applied on `mousedown` / `touchstart`:

```css
.step:active {
  transform: scale(0.88);
  transition: transform 60ms linear;
}
```

State (active/empty) changes immediately on press — never wait for mouse-up.

### Track Selection

Left border indicator appears **instantly** on click (no transition).
Param panel below updates **instantly** to show the new track's parameters.
No sliding, fading, or crossfading panels.

### Transport Buttons

| State | Visual |
|---|---|
| Default | white bg, black border, black text |
| Pressed (active) | black bg, white text — stays while in that state |
| PLAYING | Play button stays inverted for the entire play session |
| RECORDING | Record button blinks: 500ms on / 500ms off at accent color |

### BPM Beat Indicator

The BPM display in the header flashes its border on each quarter note beat.

```css
/* Applied for 50ms on each beat */
.bpm--beat {
  border-width: 2px;  /* normally 1px */
  transition: border-width 50ms linear;
}
```

Gives a visual tempo pulse without using color or animation that distracts from the step grid.

### Error / Constraint Feedback

| Situation | Feedback |
|---|---|
| Invalid input (e.g. BPM out of range) | Input display flashes accent color for 150ms |
| Action blocked (e.g. max steps reached) | Horizontal shake: `translateX(±3px)` × 2, 120ms total |

### No Animation Zones

These transitions are **always instant**, no exceptions:
- Page or section transitions
- Opening / closing param panel
- Applying a pattern switch
- Mute toggle

## Accessibility — DEFERRED

WCAG compliance is not a v1 goal but the color contrast of the palette (black on white) naturally meets AA.
