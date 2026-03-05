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
│█ [KEY] [OCT▼▲] | [DUC][CMP] | [GAIN][SWG] | GRID TRKR SCENE | [FILL][REV][BRK] █│ ← PerfBar
├░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┤
│░ MatrixView │░ StepGrid / TrackerView / SceneView       ░│█ DockPanel █│
│░ (pattern   │░ (center view, switches via PerfBar)      ░│█ (PARAM/  █│
│░  pool      │░ KICK [V][P] M [■][ ][ ][■][ ]...        ░│█  FX/EQ/  █│
│░  browser)  │░ SNARE[V][P] M [ ][ ][ ][ ][■]...        ░│█  HELP/   █│
│░            │░ ...                                       ░│█  SYS)    █│
│░            │░ (PianoRoll — shown for melodic in Grid)   ░│█          █│
└░░░░░░░░░░░░┴░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┴████████████┘
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
[KEY piano] | [OCT ▼ 0 ▲] | [DUC] [CMP] | [GAIN] [SWG] | GRID TRKR SCENE | [FILL] [REV] [BRK]
```

- **KEY**: 12-key piano keyboard. Active key shown in olive.
- **OCT**: Octave shift −/+ buttons with display font value (-2 to +2). Pending changes shown with 400ms blink.
- **DUC / CMP knobs**: Sidechain ducker depth and compressor makeup gain (36px).
- **GAIN / SWG knobs**: Master volume and swing amount (36px).
- **View toggle**: Segmented button group `GRID | TRKR | SCENE` switching between StepGrid, TrackerView, and SceneView (`ui.phraseView = 'grid' | 'tracker' | 'scene'`). Active button has lighter background + brighter text. Clicking SCENE again toggles back to GRID.
- **Virtual keyboard toggle** (desktop only): Piano icon button toggles `vkbd.enabled`. When active, shows `C{octave}` label. See ADR 031.
- **Performance buttons**: Press-hold (pointer down/up/leave). Each button has a distinct border color:
  - FILL, REV: `--color-blue` border/active
  - BRK: `--color-salmon` border/active

On mobile (`< 640px`):
- DUC, CMP, GAIN, SWG, separators, and labels hidden.
- **Keyboard → Fan-out bubble menu**: Full piano keyboard replaced by a circular trigger button (shows current root note, e.g. "C") + compact stacked octave ▲/▼. Tapping the trigger opens a **fan-arc keyboard overlay**: 12 rectangular piano keys arranged in a quarter-circle arc (0°–90°). White keys on outer ring (R=130), black keys on inner ring (R=78). Keys are rotated radially with counter-rotated labels. Semi-transparent backdrop (rgba(0,0,0,0.25)) dims the background. Animation: 150ms scale+rotate with 15ms stagger per key.
- Key trigger + octave share a row with FILL/REV/BRK (3 rows → 2 rows, saving vertical space).
- View toggle (GRID/TRKR/SCENE) is a full-width tab bar with bottom border indicator.

### FxPad — DECIDED

XY performance surface (dark zone). Rendered inside DockPanel when `ui.dockTab === 'fx'`.

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
- RAF loop only when `ui.dockTab === 'fx'`

**Sends bar** (compact dark footer):
- Track dots (8, olive active), track name label
- VERB, DLY, GLT, GRN send knobs (28px) for selected track
- This is the sole location for per-track FX send controls

### FilterView — DECIDED

XY filter/EQ surface (dark zone). Rendered inside DockPanel when `ui.dockTab === 'eq'`.

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

### TrackerView — DECIDED

M8-style vertical single-track step editor (`ui.phraseView === 'tracker'`). Shows columns: NOTE/VEL/DUR/SLD/CHN. Keyboard-navigable with arrow keys. Uses `activeCell(trackId)` — edits the same data as StepGrid. Track selector bar at the top.

### SceneView — DECIDED

Node-based directed graph canvas (`ui.phraseView === 'scene'`). Full arrangement editor.

- Canvas rendering with `requestAnimationFrame` for edges, arrowheads, edge order badges, playback highlights
- HTML overlay for nodes (positioned absolutely via CSS `calc()`)
- Zoom/pan (pinch, scroll wheel, middle-click/Ctrl+click pan)
- Node drag to reposition
- Edge creation: drag from right side of node (port area) to another node
- Node click: selects pattern and syncs `ui.currentPattern` to Grid/Tracker
- Double-click node: set as root (playback entry point)
- Delete/Backspace: delete selected node or edge
- `+` button opens picker: all patterns + function node types (transpose, tempo, repeat, probability)
- Copy/paste (Ctrl+C, Ctrl+Shift+C for subgraph, Ctrl+V)

### MatrixView — DECIDED

Compact left sidebar (desktop only) showing the pattern pool as a grid of 24×24px square cells. Shows density via opacity, selection (olive border), playing state (blue), solo (blue inset shadow), and scene usage (small olive dot). Clicking a cell calls `selectPattern()`. In scene mode, shows an arrow button to add selected pattern to the scene.

### SectionNav — DECIDED

Two-row navigator strip. Row 1: horizontally scrollable section slot strip (sections 00–N) with drag-to-set loop range, plus SCENE toggle button. Row 2: detail strip showing selected section's metadata (SEC number, PAT dropdown picker, repeats, key, oct, perf mode, FX toggles, clear button).

### Sidebar — DECIDED

Right-side overlay panel (280px width, dark zone) sharing a single slot for both help and settings content. Positioned absolutely inside `.view-area`.

**Structure:**
- Header: title (HELP / SYSTEM), language toggle (help only), close button
- Body: scrollable content area
- Footer: hover guide (help, desktop only) or factory reset (system)

**Help mode:**
- Collapsible accordion sections (12 sections: About, Basics, Tracks, Velocity & Steps, Piano Roll, Performance, Patterns, Synth Params, Grid, FX Pad, EQ, Chain)
- GUIDE footer: shows contextual description when user hovers over `data-tip` elements (desktop only)

**System mode:**
- Scale Mode toggle (ON/OFF)
- Language toggle (JP/EN)
- About section (version info)
- Factory Reset with two-step confirmation (footer)

See ADR 017 and ADR 018 for details.

### DockPanel — DECIDED

Unified right-side or bottom dock panel. Five tabs switched via tab bar (`ui.dockTab`):

1. **PARAM** (default): Track selector bar (2-letter abbreviations: KK, SN, CP, CH, OH, CY, BS, LD) + synth knob grid from `paramDefs.ts`. Lock toolbar (LOCK/STEP/CLR) + SOLO/MUTE. Dock position toggle (⇩/⇨) persisted in localStorage.
2. **FX**: FxPad XY surface with 4 FX nodes, audio visualizer, and sends bar.
3. **EQ**: FilterView XY surface with FILTER + 3-band EQ nodes.
4. **HELP**: Collapsible accordion help content. Triggered by `?` in AppHeader.
5. **SYS**: System settings (scale mode, language, factory reset). Triggered by `⚙` in AppHeader.

HELP/SYS are temporary — switching back to PARAM mode automatically when closing or re-pressing the trigger button.

Right dock: `width: 320px; border-left`. Bottom dock: `width: 100%; max-height: 200px; border-top; flex-direction: row`.

### PianoRoll — DECIDED

DAW-style note bar editor for melodic tracks (6–7). Always visible for melodic tracks (no toggle). Positioned between StepGrid and ParamPanel.
24-note range (C3–B4). Click empty cell to place note, drag right to extend duration (note bar).
Click head to delete, click continuation to delete parent note. Resize handle on head's right edge for post-placement adjustment.
Connected bars = auto-legato, gaps = retrigger. Playhead column shown when playing.

**Scale mode** (`prefs.scaleMode`): Out-of-scale rows (non-white-key positions) are disabled with salmon tint (`rgba(232,160,144,0.06)`), dimmed opacity (0.3 for keys, 0.12 for cells), and `pointer-events: none`.

On mobile: Piano spacer narrowed (26px oct-keys only), cells shrunk to 18px with 1px gap, rows use `flex: 1; min-height: 10px` to fill available vertical space for better touch targets.

### AppHeader — DECIDED

Dark zone. Contains:
- Logo ("INBOIL")
- BPM display (SplitFlap, editable)
- Transport: Play/Stop/Random buttons
- Pattern navigation: `◄ PAT:01 ►` (SplitFlap display)
- ⚙ system button (top-right, opens SYSTEM sidebar)
- Pending pattern: when queued switch is active, shows target PAT with blinking animation (400ms pulse)

On mobile (`compact` mode):
- Transport (▶ ■ RAND) centered in header via absolute positioning.
- BPM display (left) and pattern display (right) side-by-side in sub-header row.
- **Pattern actions → Radial bubble menu**: CPY/PST/CLR buttons replaced by a ⋯ trigger that fans out 3 circular action buttons in a left-down arc. Animation: 150ms with 30ms stagger, `cubic-bezier(0.2, 0, 0.4, 1.3)`. Semi-transparent backdrop for dismissal.
- ? help button opens help sidebar (hover guide footer hidden on mobile).

### MobileTrackView — DECIDED

Calculator-style step grid for mobile. Steps displayed as a grid of buttons (4 columns × N rows). Track navigation via ◄ ► buttons. Same Othello flip and playhead glow animations as desktop. Melodic tracks can switch between STEPS and NOTES (piano roll) tabs.

**Edit mode tabs (STEP / VEL / CHNC):** Animated tab bar with sliding pill indicator above the calculator grid. STEP mode = tap toggles on/off + paint-drag. VEL mode = drag up/down to edit velocity, tap to reset to 1.0. CHNC mode = drag up/down to edit chance. Active steps show velocity/chance gauge as gradient fill. See ADR 033.

**PerfBubble:** Floating draggable FILL/REV/BRK bubble trigger (position: fixed, bottom-right). Tap to toggle radial menu. Snaps to nearest horizontal edge on release.

**Track header:** Track name (button, taps to open overlay) + synth type label + step count (−/+ buttons with "step" suffix).

**MobileParamOverlay** (bottom-sheet, opened by tapping track name):
- Fixed backdrop overlay (`position: fixed; inset: 0; z-index: 50`). Tap backdrop or swipe down (dy > 50px) to dismiss.
- Drag handle pill at top.
- Lock toolbar: LOCK button + step label + CLR + SOLO + MUTE.
- Param category tabs: MIX | synth param groups (e.g. PITC, AMP) | FX — switches displayed knobs.
- Params bar: Knobs for selected category (VOL/PAN in MIX, synth params per group, sends in FX).
- Track dots selector at bottom.

## Interaction Model — DECIDED

| Action | Gesture |
|---|---|
| Toggle trig | Click/tap step button (immediate on pointerdown) |
| Select track | Click track name or track dot |
| Adjust parameter | Drag knob vertically |
| Play / Stop | Spacebar or transport button |
| Change BPM | Drag BPM display vertically, or double-click to type |
| Mute track | Click M button on track row |
| Switch pattern | Click ◄ ► in header |
| Performance controls | Press-hold buttons (FILL, REV, BRK) |
| Key change | Click piano key in PerfBar |
| Octave shift | Click −/+ in PerfBar OCT controls |
| Switch view | Click GRID/TRKR/SCENE in PerfBar view toggle |
| Toggle FX node | Tap FxPad node (no drag) |
| Move FX node | Drag FxPad node (pointer capture) |
| Select track (FxPad) | Click track dot in FxPad sends bar |
| Open help | Click ? in AppHeader |
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
- View switching (GRID/TRKR/SCENE)

## Responsive Behavior — DECIDED

### Breakpoints

```
sm:  < 640px   (smartphone portrait) → MobileTrackView
md:  640–1023px (tablet / landscape) → StepGrid with compact layout
lg:  ≥ 1024px  (desktop)            → Full StepGrid layout
```

### Mobile (sm)

Uses MobileTrackView: calculator-style step buttons, track navigation via ◄ ►, STEPS/NOTES tab toggle for melodic tracks.

Bubble menus (keyboard fan-out, pattern actions) use radial/arc animations with semi-transparent backdrop overlay (`rgba(0,0,0,0.25)`) for visual separation and dismissal.

### Scrolling

`overscroll-behavior: none` applied at every level of the scroll chain (html → body → #app → .app → .step-grid → .track-row → .steps) to prevent Mac trackpad rubber banding.

All native scrollbars hidden via `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`.

## Accessibility — DEFERRED

WCAG compliance is not a v1 goal but the warm palette naturally provides good contrast.
