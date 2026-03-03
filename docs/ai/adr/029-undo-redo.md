# ADR 029: Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)

## Status: Implemented

## Context

There is no way to revert accidental edits. A single misclick on CLR or an unintended RAND can destroy a pattern with no recovery path. Undo/redo is essential for a creative tool where experimentation should be risk-free.

## Decision

### Scope

Track pattern-level mutations only — trig edits, voice param changes, step count changes, mute toggles, copy/paste/clear, randomize. Exclude transient state (playback position, UI view, perf knobs, FX pad XY).

### Architecture

Snapshot-based undo stack on the main thread:

```typescript
interface UndoEntry {
  pattern: Pattern   // deep copy of full pattern state
  label: string      // human-readable action name (e.g. "Toggle step", "Randomize")
}

const undoStack: UndoEntry[] = []  // max ~50 entries
const redoStack: UndoEntry[] = []
```

### Capture Points

Push a snapshot **before** any mutation:
- `toggleTrig`, `setTrigNote`, `setTrigVelocity`, `setTrigDuration`, `setTrigSlide`
- `placeNoteBar`
- `setVoiceParam`, `setParamLock`, `clearParamLock`, `clearAllParamLocks`
- `setTrackSteps`, `toggleMute`, `setTrackSend`
- `randomizePattern`, `clearPattern`, `pastePattern`
- `loadFromBank` (pattern switch)

### Debouncing

Continuous edits (e.g. dragging a knob) should not push one entry per frame. Debounce: if the previous entry has the same `label` and was pushed within ~500ms, replace it instead of pushing a new one.

### Keyboard Shortcuts

- `Ctrl+Z` / `Cmd+Z` → undo
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` → redo

### Constraints

- Max stack depth: ~50 entries (older entries dropped)
- Deep copy uses manual field-by-field copy (same as `saveToBank` pattern — no `structuredClone` due to Svelte proxy)
- Undo stack is session-only (cleared on reload)

## Future Extensions

- Visual undo history list (sidebar or modal)
- Per-track undo (independent undo stacks per track)
- Persistent undo across sessions (IndexedDB)
