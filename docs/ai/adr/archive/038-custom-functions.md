# ADR 038: Custom Functions (User-Defined Performance Macros)

## Status: Proposed

## Context

### Current Performance Controls

Performance actions are currently hardcoded:

**PerfBar (desktop) / PerfBubble (mobile):**
- FILL — random drum fills (momentary, hold to activate)
- REV — reverse playback (momentary)
- BRK — rhythmic break gate (momentary)

**FxPad nodes** (each with `on/off` + `x,y` position):
- VERB, DLY, GLT, GRN — tap to toggle, drag to adjust

**FilterView nodes:**
- FILTER — cutoff + LP/HP sweep
- EQ LOW, MID, HIGH — frequency + gain

**Keyboard shortcuts** (`App.svelte:91-95`):
- Space — play/stop
- Ctrl+Z — undo

### Problems

1. **No way to save FX combinations**: A user who finds a good combination (e.g., "reverb at high wetness + delay with long feedback + filter in HP mode") must manually recreate it every time
2. **Limited keyboard control**: Only 2 shortcuts exist. No way to trigger FX or performance actions from keyboard
3. **PerfBubble has only 3 buttons**: Mobile users can only access FILL/REV/BRK — no quick access to FX combinations
4. **No recall**: During live performance, switching between different FX states requires multiple taps across different views (FxPad → FilterView → back)

### Use Cases

- **DJ-style transitions**: "Wash" preset = VERB on (x:0.8, y:0.9) + filter HP sweep → triggered with one key for smooth transitions
- **Build-ups**: "Tension" = DLY on (high feedback) + GLT on (fast stutter) + EQ boost highs → one button to build energy
- **Drops**: "Drop" = all FX off + filter reset to flat + BRK for 1 beat → instant impact
- **Sound design**: "Ambient" = VERB + GRN at specific positions → recall a texture instantly

## Decision

### Custom Function = Snapshot of FX/Filter/Perf State

A **function** is a named, user-defined snapshot that captures a subset of the current FX, filter, and performance state. When triggered, it applies the captured values instantly.

```typescript
interface CustomFunction {
  id: string              // uuid
  name: string            // max 6 chars, e.g. "WASH", "DROP", "BUILD"
  color: string           // one of theme colors (olive, blue, salmon, purple, teal)
  trigger: FunctionTrigger
  actions: FunctionAction[]
  mode: 'toggle' | 'momentary'  // toggle = on/off, momentary = active while held
}

type FunctionTrigger =
  | { type: 'key', key: string }       // e.g. "KeyA", "Digit1"
  | { type: 'bubble', slot: number }   // PerfBubble slot index (0-5)
  | { type: 'none' }                   // no trigger, manual only

interface FunctionAction {
  target: ActionTarget
  value: any
}

type ActionTarget =
  | { type: 'fx', node: 'verb' | 'delay' | 'glitch' | 'granular', prop: 'on' | 'x' | 'y' }
  | { type: 'filter', prop: 'on' | 'x' | 'y' }
  | { type: 'eq', band: 'low' | 'mid' | 'high', prop: 'on' | 'x' | 'y' }
  | { type: 'perf', prop: 'filling' | 'breaking' | 'reversing' }
```

### Recording a Function

**"Capture current" workflow:**

1. User sets up desired FX/filter state by dragging nodes in FxPad / FilterView
2. User opens function editor (via dockable panel or dedicated view)
3. Taps "CAPTURE" — the current state of all FX/filter/perf is snapshot
4. User selects which parameters to include (checkboxes — e.g., only VERB and FILTER, ignore EQ)
5. Names the function (6-char max), picks a color, assigns a trigger
6. Save

**Alternative: manual construction** — user can also build a function from scratch by adding actions one by one (advanced use case, lower priority).

### Trigger Methods

#### Keyboard Shortcuts

```
Desktop — keyboard triggers:
┌────────────────────────────────────────────┐
│  1:WASH  2:DROP  3:BUILD  4:AMBIENT  ...   │  ← number keys
│  Q:FILL  W:REV   E:BRK                    │  ← letter keys
│  Space: Play/Stop                          │
└────────────────────────────────────────────┘
```

- Number keys (1-9) and letter keys (Q,W,E,R,A,S,D,F,...) available for binding
- Existing bindings (Space, Ctrl+Z) are reserved
- `mode: 'momentary'` — active while key is held (like current FILL/REV/BRK)
- `mode: 'toggle'` — press to activate, press again to deactivate

#### PerfBubble Slots

Extend PerfBubble from 3 fixed buttons to configurable slots:

```
Current PerfBubble:        Proposed:
┌──────┐                   ┌──────┐
│ FILL │                   │ WASH │ ← custom
├──────┤                   ├──────┤
│ REV  │                   │ DROP │ ← custom
├──────┤                   ├──────┤
│ BRK  │                   │ BUILD│ ← custom
└──────┘                   ├──────┤
   +                       │ FILL │ ← built-in
                           ├──────┤
                           │ REV  │
                           ├──────┤
                           │ BRK  │
                           └──────┘
                              +
```

- Custom functions appear above the built-in FILL/REV/BRK buttons
- Max 3 custom slots in bubble (6 total buttons) to keep it manageable
- Same momentary/toggle behavior as configured

#### PerfBar Integration (Desktop)

Custom functions also appear in PerfBar as compact buttons alongside existing controls:

```
PerfBar:
[▶] [PAT ◀00▶] [KEY C] [FILL][REV][BRK] | [WASH][DROP][BUILD] | [GAIN○][SWG○]
                                             ↑ custom functions
```

### Deactivation Behavior

- **Toggle mode**: Press trigger again to deactivate. State reverts to what it was before activation (stored as "undo snapshot").
- **Momentary mode**: State reverts on key/pointer release.
- **Multiple functions**: Functions can stack. Deactivating one only reverts the parameters it controls, not parameters set by other active functions.

### Storage

- Functions stored in `localStorage` alongside other user preferences
- Exported/imported as JSON for sharing
- Factory preset functions provided as starting points

### Implementation Phases

**Phase 1**: Core data model + keyboard triggers
- `CustomFunction` interface and state management
- Capture workflow (snapshot current FX/filter state)
- Keyboard binding system (extend `App.svelte` `onKeydown`)
- Toggle/momentary mode with state revert

**Phase 2**: PerfBubble + PerfBar integration
- Extend PerfBubble with custom function slots
- Add custom function buttons to PerfBar
- Color-coded buttons matching function color

**Phase 3**: Function editor UI
- Dedicated editor in dockable panel (ADR 036) or overlay
- Parameter selection (checkboxes for which nodes to include)
- Trigger assignment UI (key picker, bubble slot selector)
- Name/color editing

**Phase 4**: Persistence + sharing
- localStorage save/load
- JSON export/import
- Factory preset functions

## Considerations

- **Conflict resolution**: Two functions controlling the same parameter (e.g., both set VERB.x to different values) — last-activated wins, revert follows activation order (stack)
- **Interaction with Chain FX**: Chain entries already set FX on/off per entry. Custom functions should override during live performance but not persist to chain data
- **Key binding conflicts**: Need a clear UI showing which keys are bound vs available. Prevent binding reserved keys (Space, Ctrl+Z)
- **Mobile keyboard**: Mobile devices rarely have physical keyboards — bubble slots are the primary trigger method on mobile. Consider also gesture-based triggers (swipe patterns on PerfBubble)
- **Function count limit**: Start with max 8-12 functions to keep the UI manageable. Can expand later.
- **Visual feedback**: When a function is active, its trigger button should clearly show the active state. On FxPad, the affected nodes should visually indicate they're being controlled by a function (e.g., pulsing border)

## Future Extensions

- **Function sequencing**: Chain functions together with timing (e.g., "WASH for 4 bars → DROP")
- **Parameter automation**: Functions with gradual parameter transitions instead of instant snapshots (e.g., filter sweep from LP to HP over 2 bars)
- **MIDI mapping**: Assign functions to MIDI CC or note messages for hardware controller integration
- **Community sharing**: Upload/download function presets from a shared library
- **Conditional functions**: Trigger based on beat position or playback state (e.g., activate only on bar 4)
