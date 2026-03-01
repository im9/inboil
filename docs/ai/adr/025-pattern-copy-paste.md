# ADR 025: Pattern Copy & Paste

## Status: PROPOSED

## Context

There is no pattern copy & paste functionality. Users have no way to duplicate an existing pattern as a starting point for creating variations.

## Proposal

### Features

1. **Pattern Copy**: Copy the current pattern to an internal clipboard
2. **Pattern Paste**: Paste the clipboard contents into a target pattern slot
3. **Pattern Clear**: Reset a selected slot to an empty pattern

### UI

Long-press on pattern selector or context menu:
- `COPY` — copy the currently active pattern
- `PASTE` — paste into the target slot (with overwrite confirmation)
- `CLR` — clear the slot

Mobile: long-press on pattern dot to show action sheet.

### Data Flow

```typescript
// state.svelte.ts
let clipboardPattern: Pattern | null = $state(null)

export function copyPattern(): void {
  clipboardPattern = structuredClone(pattern)
}

export function pastePattern(targetId: number): void {
  if (!clipboardPattern) return
  patternBank[targetId - 1] = {
    ...structuredClone(clipboardPattern),
    id: targetId,
  }
  if (targetId === pattern.id) loadFromBank(targetId - 1)
}

export function clearPattern(targetId: number): void {
  patternBank[targetId - 1] = makeEmptyPattern(targetId)
  if (targetId === pattern.id) loadFromBank(targetId - 1)
}
```

### Additional Consideration: Per-Track Copy

Beyond full-pattern copy, per-track copy & paste is also useful:
- Copy KICK pattern to another pattern's KICK
- Copy BASS triggers to LEAD (preserving notes, transferring rhythm only)

## Changed Files

| File | Changes |
|------|---------|
| `state.svelte.ts` | `clipboardPattern`, `copyPattern()`, `pastePattern()`, `clearPattern()` |
| `PatternSelector.svelte` | Add COPY/PASTE/CLR buttons |
| `MobileTrackView.svelte` | Long-press menu on pattern dots |

## Consequences

- **Positive**: Major workflow improvement. Creating pattern variations becomes easy
- **Positive**: Low implementation cost (structuredClone + UI only)
- **Negative**: Paste overwrite confirmation is critical for UX (prevent accidental overwrites)
- **Negative**: Clipboard is session-only (lost on browser reload)
