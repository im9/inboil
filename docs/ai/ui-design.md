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
--color-teal:    #508080;   /* teal — filter node */
```

The palette is warm and restrained. Olive, blue, salmon, purple, and teal are chromatic; everything else is cream/navy/gray.

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

┌█████████████████████████████████████████████████████┐
│█ ●  INBOIL   120   [▶][■][RND]      PAT ◀ 00 ▶ [⚙]█│  ← AppHeader (dark zone)
│█  (split-flap)                    (split-flap)     █│
├█████████████████████████████████████████████████████┤
│█ [KEY] [OCT▼▲] | [DUC][CMP] | [GAIN][SWG] | GRID FX EQ | [FILL][REV][BRK] █│ ← PerfBar
├░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┤
│░ KICK [V][P] M [■][ ][ ][■][ ][ ][■][ ][ ]...   ░│  ← StepGrid (light zone)
│░ SNARE[V][P] M [ ][ ][ ][ ][■][ ][ ][ ][ ]...   ░│     VOL + PAN knobs per track
│░ C.HH [V][P] M [■][■][ ][■][■][■][ ][■][ ]...   ░│
│░ ...                                               ░│
├░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┤
│░ (PianoRoll — shown conditionally for melodic)     ░│  ← PianoRoll (light zone)
├█████████████████████████████████████████████████████┤
│█ [KICK] [knob][knob][knob]                     [?] █│  ← ParamPanel (dark zone)
│█  (split-flap)   (synth params)                    █│
└─────────────────────────────────────────────────────┘

── FX View (ui.view === 'fx') ──────────────────────────

┌█████████████████████████████████████████████████████┐
│█        AppHeader + PerfBar (same as above)        █│
├█████████████████████████████████████████████████████┤
│█                                                   █│  ← FxPad (dark zone)
│█     (VERB)         ~~~3D wireframe terrain~~~     █│     XY pad + audio visualizer
│█              (DLY)                                █│     tap=toggle, drag=move
│█   (GLT)                          (GRN)           █│
│█                                                   █│
├█████████████████████████████████████████████████████┤
│█ [●●●○●●●●] KICK | VERB DLY GLT GRN [knobs]     █│  ← FxPad sends bar
├█████████████████████████████████████████████████████┤
│█ [KICK] [knob][knob][knob]                     [?] █│  ← ParamPanel (desktop only)
└─────────────────────────────────────────────────────┘

── EQ View (ui.view === 'eq') ──────────────────────────

┌█████████████████████████████████████████████████████┐
│█        AppHeader + PerfBar (same as above)        █│
├█████████████████████████████████████████████████████┤
│█                                                   █│  ← FilterView (dark zone)
│█  (FILTER)                                         █│     XY pad, tap=toggle, drag=move
│█           (LOW)                                   █│     Filter + 3-band EQ nodes
│█                     (MID)                         █│
│█                              (HIGH)               █│
├█████████████████████████████████████████████████████┤
│█ [KICK] [knob][knob][knob]                     [?] █│  ← ParamPanel (desktop only)
└─────────────────────────────────────────────────────┘
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
[KEY piano] | [OCT ▼ 0 ▲] | [DUC] [CMP] | [GAIN] [SWG] | GRID FX EQ | [FILL] [REV] [BRK]
```

- **KEY**: 12-key piano keyboard. Active key shown in olive.
- **OCT**: Octave shift −/+ buttons with display font value (-2 to +2). Pending changes shown with 400ms blink.
- **DUC / CMP knobs**: Sidechain ducker depth and compressor makeup gain (36px).
- **GAIN / SWG knobs**: Master volume and swing amount (36px).
- **View toggle**: Segmented button group `GRID | FX | EQ` switching between StepGrid, FxPad, and FilterView (`ui.view = 'grid' | 'fx' | 'eq'`). Active button has lighter background + brighter text.
- **Performance buttons**: Press-hold (pointer down/up/leave). Each button has a distinct border color:
  - FILL, REV: `--color-blue` border/active
  - BRK: `--color-salmon` border/active

On mobile (`< 640px`): DUC, CMP, GAIN, SWG, separators, and labels hidden. Elements shrunk to fit single row.

### FxPad — DECIDED

XY performance surface (dark zone). Switches with StepGrid via PerfBar view toggle (`ui.view = 'fx'`).

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

### FilterView — DECIDED

XY filter/EQ surface (dark zone). Switches with StepGrid via PerfBar view toggle (`ui.view = 'eq'`).

**Structure:**
- `.filt-pad` inner area: touch/drag surface with 4 nodes
- No sends bar — nodes directly control master filter and 3-band EQ

**4 nodes** (circle buttons, 44px):
- **FILTER** (teal): Master filter sweep. X = LP ← 0.5 → HP, Y = resonance. Tap toggles on/off.
- **LOW** (olive): Low-band EQ. X = frequency, Y = gain (center = 0dB). Tap toggles on/off.
- **MID** (blue): Mid-band EQ. Same as LOW.
- **HIGH** (salmon): High-band EQ. Same as LOW.
- Active: filled with node color. Inactive: outline only, shows "OFF" label.

**Node positioning:** X/Y mapped to 0–1 range within padded area (20px inset). Nodes clamped to pad bounds. Drag with pointer capture.

### Sidebar — DECIDED

Right-side overlay panel (280px width, dark zone) sharing a single slot for both help and settings content. Positioned absolutely inside `.view-area`.

**Structure:**
- Header: title (HELP / SYSTEM), language toggle (help only), close button
- Body: scrollable content area
- Footer: hover guide (help) or factory reset (system)

**Help mode:**
- Collapsible accordion sections (9 sections: About, Basics, Tracks, Velocity & Steps, Piano Roll, Performance, Patterns, Synth Params, FX Pad)
- GUIDE footer: shows contextual description when user hovers over `data-tip` elements (desktop only)

**System mode:**
- Scale Mode toggle (ON/OFF)
- Language toggle (JP/EN)
- About section (version info)
- Factory Reset with two-step confirmation (footer)

See ADR 017 and ADR 018 for details.

### ParamPanel — DECIDED

Dark zone footer. Shows:
1. **Track name** (SplitFlap display)
2. **♪ NOTES button** (melodic tracks only, toggles PianoRoll)
3. **Synth params** (knobs from `paramDefs.ts`, horizontally scrollable)
4. **? help button** (right side, Othello-style flip animation matching step/mute buttons)

Per-track sends (VERB, DLY, GLT, GRN) are in the FxPad sends bar only. PAN and VOL are in the StepGrid track row.

### PianoRoll — DECIDED

DAW-style note bar editor for melodic tracks (6–7). Positioned between StepGrid and ParamPanel.
24-note range (C3–B4). Click empty cell to place note, drag right to extend duration (note bar).
Click head to delete, click continuation to delete parent note. Resize handle on head's right edge for post-placement adjustment.
Connected bars = auto-legato, gaps = retrigger. Playhead column shown when playing.

**Scale mode** (`prefs.scaleMode`): Out-of-scale rows (non-white-key positions) are disabled with salmon tint (`rgba(232,160,144,0.06)`), dimmed opacity (0.3 for keys, 0.12 for cells), and `pointer-events: none`.

### AppHeader — DECIDED

Dark zone. Contains:
- Logo ("INBOIL")
- BPM display (SplitFlap, editable)
- Transport: Play/Stop/Random buttons
- Pattern navigation: `◄ PAT:01 ►` (SplitFlap display)
- ⚙ system button (top-right, opens SYSTEM sidebar)
- Pending pattern: when queued switch is active, shows target PAT with blinking animation (400ms pulse)

### MobileTrackView — DECIDED

Calculator-style step grid for mobile. Steps displayed as a grid of buttons (4 columns × 4 rows for 16 steps).
Track navigation via ◄ ► buttons. Same Othello flip and playhead glow animations as desktop.

Track meta area includes compact VOL + PAN knobs (light theme, 28px) left of the mute button.

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
| Performance controls | Press-hold buttons (FILL, REV, BRK) |
| Key change | Click piano key in PerfBar |
| Octave shift | Click −/+ in PerfBar OCT controls |
| Switch view | Click GRID/FX/EQ in PerfBar view toggle |
| Toggle FX node | Tap FxPad node (no drag) |
| Move FX node | Drag FxPad node (pointer capture) |
| Select track (FxPad) | Click track dot in FxPad sends bar |
| Open help | Click ? in ParamPanel |
| Open settings | Click ⚙ in AppHeader |
| Close sidebar | Click ✕ or re-press trigger button |

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

### Help Button Flip

Same Othello-style 3D flip as step/mute buttons. `?` icon flips between off (bordered outline) and on (blue filled) states:

```css
.help-flip {
  transition: transform 180ms ease-out;
  transform-style: preserve-3d;
  perspective: 80px;
}
.help-flip.flipped { transform: rotateY(180deg); }
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

### Sidebar Open/Close

50ms fade + subtle slide. Uses deferred DOM removal (`visibleMode` + `closing` state) to keep DOM alive during exit animation:

```css
.sidebar { animation: sidebar-in 50ms ease-out; }
.sidebar.closing { animation: sidebar-out 50ms ease-in forwards; }

@keyframes sidebar-in {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes sidebar-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(24px); }
}
```

### No Animation Zones

Always instant, no transition:
- Page or section transitions
- Opening/closing PianoRoll
- Pattern switch application
- Mute toggle (visual — audio uses smooth fade)
- View switching (GRID/FX/EQ)

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
