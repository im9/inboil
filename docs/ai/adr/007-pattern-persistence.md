# ADR 007: Pattern Persistence (Save / Load)

## Status: PROPOSED

## Context

Patterns are currently in-memory only — refreshing the page loses all work. For a creative tool, persistence is essential. Users need to save work, recall sessions, and share patterns.

## Proposed Design

### Storage Backend

**localStorage** for v1. Simple, no server needed, works offline.

Each pattern bank (8 patterns) is serialized as JSON and stored under a key like `inboil:bank:0`. A project manifest stores metadata (name, BPM, last-opened pattern).

### Data to Persist

Per pattern:
- Track data (steps, trigs with notes/velocities, synthType, muted)
- Per-track mixer (volume, pan, sends)
- Per-track voice params
- BPM

Global (per project):
- Effects settings (reverb, delay, ducker, comp)
- FxPad node positions and on/off state

### Save Triggers

- **Auto-save** on pattern switch (save current before loading next)
- **Auto-save** on stop (debounced, 500ms after last change)
- **Manual save** not needed if auto-save covers all cases

### Export / Import

Future: JSON export/import for sharing. Could also support URL-encoded patterns (base64 compressed JSON in URL hash) for link sharing.

## Consequences

- **Positive:** Work survives page refresh.
- **Positive:** localStorage is synchronous and fast — no async complexity.
- **Negative:** localStorage has a ~5MB limit. 8 patterns with full data is well under this (~50KB estimated).
- **Negative:** No cross-device sync. Future: could add cloud storage or WebDAV.
