# ADR 099: Auto-Save and Undo Durability

## Status: Implemented

## Context

`pushUndo()` marks `project.dirty` and calls `scheduleAutoSave()` with a 500ms debounce. If the browser crashes or the tab is killed during that debounce window, all mutations since the last IDB write are lost. The undo stack may contain snapshots the user has never seen persisted — a crash discards work the user believed was saved.

This is especially problematic for critical mutations (pattern edits, track additions, voice changes) where losing even a single operation breaks the user's mental model of what was saved.

## Proposal

Four options were considered:

### Option 1: Eager Flush

Write to IDB immediately on `pushUndo()` for every mutation (no debounce).

- **Pro**: Zero data-loss window
- **Con**: Heavy IDB write pressure on rapid edits (e.g. knob tweaks fire dozens of pushUndo calls); potential UI jank from serialization on main thread

### Option 2: Write-Ahead Log

Persist a lightweight delta to `localStorage` synchronously on each `pushUndo()`, then consolidate into IDB when the debounce fires.

- **Pro**: Near-zero data-loss window; localStorage writes are fast and synchronous
- **Con**: localStorage has a ~5MB quota; delta format adds serialization complexity; must handle localStorage full gracefully

### Option 3: Reduced Debounce + beforeunload Flush (Recommended)

Keep the 500ms IDB debounce but add a synchronous `localStorage` snapshot on `beforeunload` as crash recovery. On next load, check localStorage for a recovery snapshot newer than the IDB version and offer to restore.

- **Pro**: Simplest implementation; no change to normal save path; covers the common crash/close scenario
- **Con**: Does not protect against hard kill (SIGKILL, OS force-quit) where `beforeunload` never fires; localStorage quota limits apply to the full snapshot

### Option 4: Hybrid

Critical mutations (pattern, track, voice changes) flush to IDB immediately. Minor mutations (parameter tweaks, UI state) stay debounced at 500ms.

- **Pro**: Protects the most important data without excessive writes
- **Con**: Requires classifying mutations by severity; boundary between "critical" and "minor" is subjective and must be maintained as features change

## Decision

Recommend **Option 3** as the simplest starting point. It covers the most common data-loss scenario (tab close, navigation, gentle crash) with minimal code changes. Option 4 can be layered on later if hard-kill resilience is needed.

### Implementation Sketch

1. Add a `beforeunload` listener in `project.ts` that writes the current song state to `localStorage` under a known key (e.g. `inboil_recovery`)
2. On app load, compare `localStorage` recovery timestamp against the IDB song's `lastSaved` timestamp
3. If recovery is newer, show a toast: "Unsaved changes recovered" with Restore / Discard actions
4. On successful IDB save, clear the `localStorage` recovery key

## Risks

- **localStorage quota**: A large project snapshot may exceed the ~5MB limit. Mitigation: compress with a lightweight codec or fall back silently if `setItem` throws.
- **beforeunload reliability**: Not fired on hard kill, mobile Safari background eviction, or `kill -9`. This is an inherent limitation of Option 3.
- **Stale recovery data**: If the user opens multiple tabs, the recovery key may be overwritten by a different project. Mitigation: include the project ID in the key.

## Consequences

- **Positive**: Recovers unsaved work in the most common crash scenarios with minimal implementation effort
- **Positive**: No change to the existing auto-save hot path — no performance regression
- **Negative**: Does not cover hard-kill or mobile eviction scenarios
- **Negative**: Adds a recovery flow that must be tested across browsers
