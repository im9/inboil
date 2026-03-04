# ADR 043: Matrix View — Section × Track Grid Above Step Sequencer

## Status: Proposed

## Context

### Current Layout

ADR 042 established a flat Section/Cell data model with a compact SectionNav strip (1D slot row) between PerfBar and the step editor. The step editor (StepGrid or TrackerView) shows one section at a time.

```
┌──────────────────────────────────────────┐
│ AppHeader                                │
│ PerfBar: ▶ STOP  BPM  KEY  [GRID|TRKR]  │
│ SectionNav: [00][01][02]...  LP 0-3      │
├──────────────────────────────────────────┤
│ StepGrid (single section, 8 tracks)      │
│ KICK  ░░█░ ░░█░ ...                      │
│ SNARE ░░░░ █░░░ ...                      │
│ ...8 tracks × steps                      │
└──────────────────────────────────────────┘
```

### Problem

1. **SectionNav is 1D**: A horizontal slot strip cannot express the section × track matrix structure. No way to see at a glance which tracks have data in which sections.
2. **No arrangement overview**: Switching between sections via SectionNav is blind navigation — you can't see inter-section relationships or the overall song structure.
3. **No scene concept**: No way to visually compare sections or launch them Ableton Session View style.

### Insight

Place a Matrix View (rows = sections, columns = tracks) above the step editor. This provides a bird's-eye arrangement overview while the step editor below shows the selected cell's detail. Hybrid of FL Studio's Pattern Matrix and Ableton Session View.

## Decision

### Layout: Matrix View + Step Editor (Vertical Split)

```
┌──────────────────────────────────────────────────────┐
│ AppHeader                                            │
│ PerfBar: ▶ STOP  BPM  KEY  [GRID|TRKR]              │
├──────────────────────────────────────────────────────┤
│ Matrix View (top, resizable)                         │
│                                                      │
│      KICK  SNR  CLAP  HH   BASS  PAD  LEAD  FX      │
│  00  [██] [░░] [██]  [██] [██]  [░░] [░░]  [░░]     │
│  01  [██] [██] [░░]  [██] [██]  [██] [░░]  [░░]     │
│  02  [██] [██] [██]  [██] [██]  [██] [██]  [░░]     │
│  03  [░░] [░░] [░░]  [░░] [░░]  [░░] [░░]  [░░]     │
│  ...                                                 │
│                                                      │
│  LP ━━━━━━━━━━━━━━━━━━━━━━  (loop range bar)         │
├──────── resize handle ───────────────────────────────┤
│ Step Editor (bottom)                                 │
│                                                      │
│ KICK  [steps]: ░░█░ ░░█░ ░░█░ ░░█░                  │
│ (or TrackerView for selected section/track)          │
│                                                      │
│ DockPanel (right or bottom)                          │
└──────────────────────────────────────────────────────┘
```

### Matrix View Component

```
MatrixView.svelte
├── Track header row (8 track names, horizontal)
├── Section rows (visibleCount, vertical scroll)
│   ├── Row header: section # + repeats + key/oct
│   └── 8 cells (one per track)
└── Loop range bar (below matrix)
```

**Matrix cell states:**
- `empty`: transparent/dark — no active trigs
- `has-data`: filled — at least 1 active trig
- `selected`: olive border — `ui.currentSection === si && ui.selectedTrack === trackId`
- `playing`: blue pulse — `playback.currentSection === si`
- `in-loop`: subtle border — within `loopStart..loopEnd`

**Cell density visualization:**
- Cell opacity or fill intensity reflects trig density (active trigs / total steps)
- Density is normalized per-cell: a 16-step cell with 4 trigs and a 32-step cell with 8 trigs both show 25% density. Variable step counts per track are handled naturally.
- Optional: miniature rhythm visualization (4px dots for each beat)

### Interaction

| Action | Result |
|--------|--------|
| Click matrix cell | `selectSection(si)`, `ui.selectedTrack = trackId` → Step Editor shows that cell |
| Double-click cell | Enter step-edit focus (scroll step editor to that cell) |
| Drag vertical on row headers | Set loop range |
| Right-click cell | Context menu: copy/paste/clear cell |
| Drag cell → cell | Copy cell data |
| Click row header | Select entire section (all 8 tracks) |
| Arrow keys in matrix | Navigate between cells |

### Step Editor (Below Matrix)

The step editor shows **one section at a time** (the selected section from the matrix):

- **GRID mode**: StepGrid shows 8 tracks × steps for `ui.currentSection` only
- **TRKR mode**: TrackerView shows steps for `ui.selectedTrack` in `ui.currentSection`

The Matrix View above provides the arrangement overview. The step editor stays focused on single-section editing.

### State Changes

```typescript
// NEW
ui: {
  matrixHeight: number   // resizable split position (px or %)
  // existing:
  currentSection: number
  selectedTrack: number
  phraseView: 'grid' | 'tracker'
}

// SectionNav → replaced by MatrixView (desktop)
```

### Replace SectionNav (Desktop Only)

MatrixView absorbs all SectionNav functionality on desktop:
- Section selection → matrix cell click
- Loop range → drag on row headers or dedicated loop bar
- Section detail (repeats, key, FX) → row header or tooltip
- Presets → move to AppHeader or menu

### Mobile Layout

Mobile keeps the compact SectionNav strip (1D) + single-section editor. Matrix View is desktop-only due to space constraints:

```
Mobile:
┌────────────────────────┐
│ AppHeader (compact)     │
│ PerfBar                 │
│ SectionNav [00][01]...  │  ← keep for mobile
│ MobileTrackView         │
│ Sidebar                 │
└────────────────────────┘

Desktop:
┌────────────────────────┐
│ AppHeader               │
│ PerfBar                 │
│ MatrixView              │  ← replaces SectionNav
│ ─── resize handle ───  │
│ StepGrid / TrackerView  │
│ DockPanel               │
└────────────────────────┘
```

## Implementation Phases

### Phase 1: MatrixView Component (View Only)

1. Create `MatrixView.svelte` — read-only matrix grid
2. Track header row (reuse track name styling from StepGrid)
3. Section rows with cell density visualization
4. Click cell → `selectSection(si)` + `ui.selectedTrack = trackId`
5. Visual states: empty, has-data, selected, playing, in-loop
6. Place above StepGrid in desktop layout (App.svelte)
7. Keep SectionNav for mobile, use MatrixView for desktop
8. `visibleCount` logic shared (same as SectionNav/StepGrid)

### Phase 2: Replace SectionNav on Desktop

1. Remove SectionNav from desktop layout (kept for mobile)
2. Move loop range / section detail controls into MatrixView
3. Resizable split (drag handle between MatrixView and StepGrid)
4. `ui.matrixHeight` persisted

### Phase 3: Matrix Interactions

1. Loop range selection (drag on row headers)
2. Cell copy/paste (drag or context menu)
3. Arrow key navigation in matrix (with Escape to return to step editor)
4. Row header click to select entire section

### Phase 4: Cell Density Visualization

1. Mini rhythm preview in each cell (tiny dot grid showing active trigs)
2. Trig density as cell fill opacity
3. Playing section animation (pulse or highlight sweep)
4. Optional: per-cell color coding by track instrument type

## Considerations

- **Variable step counts**: Each Cell has its own `steps` (1–64). Matrix cells use normalized density (active trigs / total steps), so variable step counts across tracks are handled naturally. A cell's visual weight reflects musical density, not absolute trig count.
- **Vertical space**: Matrix View occupies the top portion, reducing step editor area. The resize handle lets users adjust the split. Consider a collapse option to fully hide the matrix.
- **Performance**: Up to 64 sections × 8 tracks = 512 cells. Density calculation is cached via `$derived`. DOM only renders `visibleCount × 8` (trailing empty sections collapsed).
- **Relationship to SectionNav**: Desktop replaces SectionNav with MatrixView entirely. Mobile keeps SectionNav. Shared logic (visibleCount, loop range) lives in state.

## Future Extensions

- **Scene launch**: Click row header to immediately play that section (Ableton Session View)
- **Cell automation**: Draw automation (volume/filter sweep) within matrix cells
- **Pattern follow**: Highlight playing section in matrix + auto-scroll step editor
- **Multi-select**: Shift+click to select multiple cells → bulk copy/paste/clear
- **Color coding**: Per-track cell colors for arrangement visibility
- **Minimap mode**: Shrink matrix to minimal size to maximize step editor
