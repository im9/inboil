# UI Design

## Direction: Warm Brutalist + Geometric Graphic Design — DECIDED

Inspired by Swiss International Style and New Brutalism, adapted with a warm cream/navy color palette.
Treats the UI as graphic design first — geometric shapes, bold typography, and high-contrast zones are compositional elements.

### Principles

1. **Geometry drives composition** — Large geometric shapes anchor the visual hierarchy.
2. **Zone inversion** — Dark zones (navy bg / cream fg) and light zones (cream bg / navy fg) create separation without borders.
3. **Bold numbers as visual anchors** — BPM, step count, pattern number displayed at display scale.
4. **No gradients, no shadows** — Depth through border weight, whitespace, and zone contrast only.
5. **Two font roles** — Display font (bold grotesque) for numbers/headings; monospace for all functional data.
6. **Color is reserved for state** — Olive for active trigs, blue for playhead, salmon for alerts.
7. **Geometric elements as texture** — Decorative shapes in zones for visual rhythm.

## Color Palette — DECIDED

```css
--color-bg:      #EDE8DC;   /* warm cream — page background */
--color-fg:      #1E2028;   /* dark navy — primary text, borders, dark zones */
--color-surface: #E2DDD3;   /* slightly darker cream — subtle panel differentiation */
--color-muted:   #9A9680;   /* warm gray — inactive steps, disabled controls */
--color-olive:   #787845;   /* olive green — active trig, selected key */
--color-blue:    #4472B4;   /* steel blue — playhead, FILL/REV buttons */
--color-salmon:  #E8A090;   /* salmon — BRK button, record/alert, GLT node */
--color-purple:  #9B6BA0;   /* soft violet — granular FX node */
```

The palette is warm and restrained. Olive, blue, salmon, and purple are chromatic; everything else is cream/navy/gray.

## Typography — DECIDED

### Display font — bold grotesque
Used for: BPM number, pattern number, split-flap displays, section headings.

```css
font-family: "Bebas Neue", "Anton", sans-serif;
```

### Data font — monospace
Used for: parameter values, labels, step numbers, all interactive controls.

```css
font-family: "JetBrains Mono", "Fira Code", monospace;
font-size-base: 12px;
line-height: 1.4;
```

Labels are ALL CAPS with `letter-spacing: 0.08em`.

## Zone Layout — DECIDED

```
█ = dark zone (navy bg)   ░ = light zone (cream bg)

┌█████████████████████████████████████████████████┐
│█ ●  INBOIL   120   [▶][■][RND]      PAT: 01  █│  ← AppHeader (dark zone)
│█  (split-flap)                    (split-flap)█│
├█████████████████████████████████████████████████┤
│█ [KEY] [OCT▼▲] [LOW MID HIGH] [GAIN]          █│  ← PerfBar (dark zone)
│█                       [FILL REV GLT BRK] [FX] █│  ← FX button toggles view
├░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┤
│░ KICK [V][P] M [■][ ][ ][■][ ][ ][■][ ][ ]... ░│  ← StepGrid (light zone)
│░ SNARE[V][P] M [ ][ ][ ][ ][■][ ][ ][ ][ ]... ░│     VOL + PAN knobs per track
│░ C.HH [V][P] M [■][■][ ][■][■][■][ ][■][ ]... ░│
│░ ...                                           ░│
├░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┤
│░ (PianoRoll — shown conditionally for melodic) ░│  ← PianoRoll (light zone)
├█████████████████████████████████████████████████┤
│█ [KICK] [knob][knob][knob]       DUCK COMP    █│  ← ParamPanel (dark zone)
│█  (split-flap)   (synth params)   (global FX)  █│
└─────────────────────────────────────────────────┘

── FX View (ui.view === 'fx') ──────────────────────

┌█████████████████████████████████████████████████┐
│█        AppHeader + PerfBar (same as above)    █│
├█████████████████████████████████████████████████┤
│█                                               █│  ← FxPad (dark zone)
│█     (VERB)         ~~~3D wireframe terrain~~~  █│     XY pad + audio visualizer
│█              (DLY)                             █│     tap=toggle, drag=move
│█   (GLT)                          (GRN)        █│
│█                                               █│
├█████████████████████████████████████████████████┤
│█ [●●●○●●●●] KICK | VERB DLY GLT GRN [knobs]  █│  ← FxPad sends bar
├█████████████████████████████████████████████████┤
│█ [KICK] [knob][knob][knob]       DUCK COMP    █│  ← ParamPanel (desktop only)
└─────────────────────────────────────────────────┘
```

## Components

### SplitFlap (パタパタ) Display — DECIDED

Split-flap mechanical display for BPM, pattern number, and track name.
Each character flips independently with a 3D CSS animation:
- Top half: previous value → rotates down (`rotateX(-90deg)`)
- Bottom half: next value revealed

Uses `perspective`, `transform-style: preserve-3d`, `backface-visibility: hidden`.
Flip duration: 180ms ease-out.

### Step Button (Trig) — DECIDED

Steps use an **Othello-style flip** to toggle between active/empty states.

**Structure:**
```html
<button class="step">
  <span class="step-flip" class:flipped={trig.active}>
    <span class="face off"></span>   <!-- cream/empty face -->
    <span class="face on"></span>    <!-- olive/active face, rotateY(180deg) back -->
  </span>
</button>
```

**Toggle animation:** 3D `rotateY` flip (200ms ease-in-out) between faces.
- Empty → Active: flip from cream to olive face.
- Active → Empty: flip back.

**Playhead animation:** `filter: brightness(1.5→1)` glow pulse (180ms ease-out). Uses CSS `filter` rather than `transform` to avoid conflicting with the flip animation.

### Knob / Parameter Control — DECIDED

SVG-based rotary knob with 270° travel arc.
- Drag vertically to change value (up = increase).
- Shows arc indicator and ALL CAPS label below.
- Cursor: `ns-resize` on hover.
- Default size: 32px. PerfBar knobs: 36px. StepGrid inline knobs: 20px.
- Value is 0.0–1.0 normalized; actual value computed by `paramDefs.ts`.

Props:
- `light`: dark strokes for use on cream background (StepGrid track row).
- `compact`: hides the numeric value display, keeps label visible. Used for inline VOL/PAN knobs in track rows.

### PerfBar — DECIDED

Performance controls strip (dark zone). Layout:

```
[KEY piano] | [OCT ▼ 0 ▲] | [LOW MID HIGH] | [GAIN] | [FILL] [REV] [GLT] [BRK] | [FX]
```

- **KEY**: 12-key piano keyboard. Active key shown in olive.
- **OCT**: Octave shift ▼/▲ buttons with SplitFlap display (-2 to +2). Applied at cycle boundary (pending shown with blink).
- **EQ knobs**: LOW / MID / HIGH (0=kill, 0.5=unity, 1.0=boost).
- **GAIN knob**: Master volume.
- **Performance buttons**: Press-hold (pointer down/up/leave). Each button has a distinct border color:
  - FILL, REV: `--color-blue` border/active
  - GLT: `--color-olive` border/active
  - BRK: `--color-salmon` border/active
- **FX**: View toggle between grid view and FxPad view (`ui.view = 'grid' | 'fx'`).

On mobile (`< 640px`): EQ and GAIN hidden, elements shrunk to fit single row.

### FxPad — DECIDED

XY performance surface (dark zone). Switches with StepGrid via PerfBar FX button.

**Structure:**
- `fx-view` outer container (`flex: 1`, column layout)
- `fx-pad` inner area: XY touch surface with canvas visualizer + draggable nodes
- `sends-bar` footer: per-track send mixer

**4 FX nodes** (circle buttons, 48px):
- VERB (olive), DLY (blue), GLT (salmon), GRN (purple)
- Tap: toggle on/off. Drag: move position (XY 0–1).
- Active: filled with node color + glow shadow. Inactive: outline only.
- Dragging: scale(1.25) + larger glow.

**Audio visualizer** (Canvas 2D behind nodes):
- 3D wireframe terrain: 18 rows × 32 columns, frequency-displaced
- Colors: olive → blue → salmon → purple by depth
- Perspective projection, DPR-aware
- RAF loop only when `ui.view === 'fx'`

**Sends bar** (compact dark footer):
- Track dots (8, olive active), track name label
- VERB, DLY, GLT, GRN send knobs (28px) for selected track
- This is the sole location for per-track FX send controls

### ParamPanel — DECIDED

Dark zone footer. Shows:
1. **Track name** (SplitFlap display)
2. **♪ NOTES button** (melodic tracks only, toggles PianoRoll)
3. **Synth params** (knobs from `paramDefs.ts`, scrollable)
4. **Global FX**: DUCK, COMP

Per-track sends (VERB, DLY, GLT, GRN) are in the FxPad sends bar only. PAN and VOL are in the StepGrid track row.

Decorative geometric elements (circle + rect, olive/blue, 20% opacity) anchored right.

### PianoRoll — DECIDED

Note editor grid for melodic tracks (6–7). Positioned between StepGrid and ParamPanel.
24-note range (C3–B4). Click cell to set note + activate; click same note to deactivate.
Playhead column shown when playing.

### AppHeader — DECIDED

Dark zone. Contains:
- Logo ("INBOIL")
- BPM display (SplitFlap, editable)
- Transport: Play/Stop/Random buttons
- Pattern navigation: `◄ PAT:01 ►` (SplitFlap display)
- Pending pattern: when queued switch is active, shows target PAT with blinking animation (400ms pulse)

### MobileTrackView — DECIDED

Calculator-style step grid for mobile. Steps displayed as a grid of buttons (4 columns × 4 rows for 16 steps).
Track navigation via ◄ ► buttons. Same Othello flip and playhead glow animations as desktop.

Track meta area includes compact VOL + PAN knobs (light theme, 28px) left of the mute button. Global FX (DUCK, COMP) in params bar.

## Interaction Model — DECIDED

| Action | Gesture |
|---|---|
| Toggle trig | Click/tap step button (immediate on pointerdown) |
| Select track | Click track name or track dot |
| Adjust parameter | Drag knob vertically |
| Play / Stop | Spacebar or transport button |
| Change BPM | Drag BPM display vertically, or double-click to type |
| Mute track | Click M button on track row |
| Toggle piano roll | Click ♪ NOTES in ParamPanel |
| Switch pattern | Click ◄ ► in header |
| Performance controls | Press-hold buttons (FILL, REV, GLT, BRK) |
| Key change | Click piano key in PerfBar |
| Octave shift | Click ▼/▲ in PerfBar OCT controls |
| Toggle FX view | Click FX button in PerfBar |
| Toggle FX node | Tap FxPad node (no drag) |
| Move FX node | Drag FxPad node (pointer capture) |
| Select track (FxPad) | Click track dot in FxPad sends bar |

## Animation & Feedback — DECIDED

### Timing Rules

```
All durations:  ≤ 200ms
Easing:         ease-out or ease-in-out (no spring/bounce)
Properties:     transform, filter, opacity only (no layout-triggering)
```

### Step Toggle (Othello Flip)

```css
.step-flip {
  transition: transform 200ms ease-in-out;
  transform-style: preserve-3d;
}
.step-flip.flipped { transform: rotateY(180deg); }
```

### Playhead Glow

```css
.step.playhead { animation: ph-glow 180ms ease-out; }
@keyframes ph-glow {
  0%   { filter: brightness(1.5); }
  100% { filter: brightness(1); }
}
```

### SplitFlap Flip

Per-character 3D flip animation (180ms ease-out) triggered on value change.

### Pending Pattern Blink

```css
.pat-value.pending {
  animation: pat-blink 400ms ease-in-out infinite;
}
@keyframes pat-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.3; }
}
```

### No Animation Zones

Always instant, no transition:
- Page or section transitions
- Opening/closing PianoRoll
- Pattern switch application
- Mute toggle (visual — audio uses smooth fade)

## Responsive Behavior — DECIDED

### Breakpoints

```
sm:  < 640px   (smartphone portrait) → MobileTrackView
md:  640–1023px (tablet / landscape) → StepGrid with compact layout
lg:  ≥ 1024px  (desktop)            → Full StepGrid layout
```

### Mobile (sm)

Uses MobileTrackView: calculator-style step buttons, track navigation via ◄ ►, ♪ NOTES toggle for melodic tracks.

### Scrolling

`overscroll-behavior: none` applied at every level of the scroll chain (html → body → #app → .app → .step-grid → .track-row → .steps) to prevent Mac trackpad rubber banding.

All native scrollbars hidden via `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`.

## Accessibility — DEFERRED

WCAG compliance is not a v1 goal but the warm palette naturally provides good contrast.
