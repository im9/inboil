# ADR 025: Pattern Copy & Paste

## Status: Implemented

## Context

There is no pattern copy & paste functionality. Users have no way to duplicate an existing pattern as a starting point for creating variations.

## Decision

### Features

1. **Pattern Copy (CPY)**: Copy the current pattern to an internal clipboard
2. **Pattern Paste (PST)**: Paste the clipboard contents into the current pattern slot
3. **Pattern Clear (CLR)**: Reset the current slot to an empty pattern

### UI

Three small buttons (CPY / PST / CLR) placed inline next to the PAT label in AppHeader's sub-header:

```
PAT  CPY PST CLR
◀ 00 | 4FLOOR ▶
```

- PST is visually disabled (`opacity: 0.25`, `pointer-events: none`) until a pattern has been copied
- No overwrite confirmation — operations are immediate (undo via factory reset for factory patterns)

### Data Flow

```typescript
// state.svelte.ts
let clipboardPattern: Pattern | null = null
export const clipboard = $state({ hasData: false })  // reactive flag for UI

export function copyPattern(): void {
  clipboard.hasData = true
  clipboardPattern = { /* manual deep copy (Svelte $state proxies cannot use structuredClone) */ }
}

export function pastePattern(targetId: number): void {
  if (!clipboardPattern) return
  patternBank[targetId - 1] = { /* deep copy from clipboard, override id */ }
  if (targetId === pattern.id) loadFromBank(targetId - 1)
}

export function clearPattern(targetId: number): void {
  patternBank[targetId - 1] = makeEmptyPattern(targetId)
  if (targetId === pattern.id) loadFromBank(targetId - 1)
}
```

### Implementation Notes

- **No `structuredClone`**: Svelte 5 `$state` proxies throw `DataCloneError` with `structuredClone`. Manual deep copy is used (same approach as `saveToBank()`).
- **Reactive clipboard flag**: `hasClipboard()` as a plain function is not tracked by Svelte's reactivity. `clipboard.hasData` as a `$state` object ensures the PST button updates when CPY is pressed.
- **Clipboard is session-only**: Lost on browser reload. Persistent clipboard is deferred to ADR 020 (Data Persistence).

### Changed Files

| File | Changes |
|------|---------|
| `src/lib/state.svelte.ts` | `clipboardPattern`, `clipboard` state, `copyPattern()`, `pastePattern()`, `clearPattern()` |
| `src/lib/components/AppHeader.svelte` | CPY/PST/CLR buttons in pat-block, import clipboard state |
| `src/lib/components/Sidebar.svelte` | Help text updated to mention CPY/PST/CLR |

## Verification

1. CPY → PST button becomes active (no longer disabled)
2. CPY on pattern 00 → navigate to pattern 20 → PST → pattern 20 has same content as original 00
3. CLR → current pattern reset to empty (INIT)
4. CPY → edit pattern → PST → reverts to the copied snapshot (not current state)
5. PST without prior CPY → no effect (button disabled)

## Future Extensions

- **Per-track copy**: Copy KICK pattern to another pattern's KICK
- **Cross-track paste**: Copy BASS triggers to LEAD (rhythm transfer)
- **Persistent clipboard**: Survive page reload via IndexedDB (ADR 020)
