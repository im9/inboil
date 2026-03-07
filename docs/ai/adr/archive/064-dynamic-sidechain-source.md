# ADR 064: Dynamic Sidechain Source

## Status: Implemented

## Context

The sidechain ducker is hardcoded to track 0 (kick). It assumes:

1. Track 0 always holds a kick voice
2. Only one kick exists in the pattern
3. Track 0 audio should bypass the ducker (`kickDry`)

ADR 062 (per-pattern voice assignment) broke these assumptions — any voice can live on any track. A user may place a kick on track 5, have two kicks across tracks 0 and 3, or have no kick at all. The current hardcoded `t === 0` checks in the worklet and C++ engine produce incorrect ducking in all these cases.

## Decision

### A. Voice Registry: `sidechainSource` Tag

Add a `sidechainSource: boolean` flag to the voice definition registry. Kick-family voices default to `true`:

| VoiceId | sidechainSource |
|---------|-----------------|
| `kick` | `true` |
| `kick808` | `true` |
| `snare` | `false` |
| `bass` | `false` |
| ... | `false` |

This flag is **read-only metadata** — not user-configurable per voice, just part of the voice definition.

### B. Worklet / Engine Changes

Replace all `t === 0` checks with a per-track `isSidechainSource` boolean array, computed at pattern load time:

```
for each track t:
  isSidechainSource[t] = voiceRegistry[track.voiceId].sidechainSource
```

**Signal flow becomes:**

```
Source tracks ──► sourceDry  (no ducking, replaces kickDry)
Other tracks  ──► rest       (ducked)

trigger: any source track note-on fires ducker
mix: sourceDry + (rest + FX returns) * duck_gain
```

When multiple source tracks exist, each note-on independently triggers the ducker. The ducker envelope is a single shared instance — whichever fires last resets the envelope. This naturally produces the tightest pumping from the most recent hit.

### C. UI

No new UI required. The existing Master Pad DUCK node (depth / release) remains the only control. Sidechain source detection is fully automatic based on voice assignment.

## Consequences

- **Positive:** Sidechain works correctly with per-pattern voice assignment (ADR 062)
- **Positive:** Multiple kicks duck correctly — each hit re-triggers the envelope
- **Positive:** Zero migration — voice registry flags reproduce current behavior for standard layouts
- **Negative:** Slight complexity increase in worklet sample loop (boolean array lookup vs hardcoded index)
- **Risk:** Patterns with no voice metadata would lose ducking — mitigated by defaulting to `false` which is safe (no ducking > wrong ducking)
- **Dependency:** Voice registry (ADR 009) must support the `sidechainSource` field

## Implementation

1. Add `sidechainSource` flag to voice registry entries
2. Compute `isSidechainSource[]` boolean array at pattern load in worklet
3. Replace `t === 0` with `isSidechainSource[t]` in both TS worklet and C++ engine
4. Replace `kickDry` with `sourceDry` accumulator
