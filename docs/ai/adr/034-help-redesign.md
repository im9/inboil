# ADR 034: Help / Guide Redesign

## Status: Proposed

## Context

Current help is a flat list of text sections in the Sidebar. As content grows (KEY/scale reference, keyboard shortcuts, undo, mobile gestures, etc.), the single scrolling list becomes hard to navigate. Users need a way to quickly find specific information.

### Current Issues

- Flat structure: all topics in one long scrollable list, no hierarchy
- No search or filtering
- KEY section mentions transposition but doesn't list modes per root note
- No keyboard shortcut reference (Ctrl+Z undo, Space play/stop, etc.)
- No mobile gesture documentation (drag-to-paint, PerfBubble, drawer handle)
- Sidebar overlays the main view — can't reference help while editing

## Decision

### 1. Categorized Help with Tabs/Accordion

Replace the flat list with categorized sections:

| Category | Topics |
|----------|--------|
| **BASICS** | Play/stop, grid toggle, randomize, undo/redo |
| **TRACKS** | Track selection, mute, step count, velocity, drag-to-paint |
| **NOTES** | Piano roll, note duration, slide, KEY/scale reference |
| **SOUND** | Synth params, P-Locks, VOL/PAN, sends |
| **FX** | FX Pad, EQ/Filter, effect descriptions |
| **PERF** | FILL/REV/BRK, Chain, pattern management |
| **KEYS** | Keyboard shortcuts (desktop) |

### 2. KEY / Scale Reference Table

Add a reference section showing each root note's mode:

```
C  — Ionian (Major)
C# — Major
D  — Dorian (minor, bright)
Eb — Major
E  — Phrygian (minor, dark)
F  — Lydian (major, dreamy)
F# — Major
G  — Mixolydian (major, bluesy)
Ab — Major
A  — Aeolian (Natural Minor)
Bb — Major
B  — Locrian (diminished)
```

### 3. Keyboard Shortcuts Section

```
Space       — Play / Stop
Ctrl+Z      — Undo
Ctrl+Shift+Z — Redo (future)
```

### 4. UI Options to Explore

- **Accordion**: Each category expands/collapses independently. Compact, familiar.
- **Tabs within sidebar**: Category tabs at the top, content below. Quick switching.
- **Searchable**: A small text input at the top that filters topics by keyword.
- **Tooltip-linked**: Tapping `?` next to any UI element opens help directly to that topic (contextual help).
- **Detachable panel**: Help opens as a floating panel instead of sidebar overlay, so users can reference while editing.

### 5. Mobile Considerations

- Mobile currently has no help access (Sidebar overlays view-area)
- Consider a dedicated help view (accessible from view-toggle tabs or settings)
- Content should be concise with expandable details

## Future Extensions

- Interactive tutorial / onboarding flow
- Video/GIF demonstrations for complex interactions
- Community tips / user-contributed content
