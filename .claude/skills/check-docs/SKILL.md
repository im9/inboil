---
name: check-docs
description: Check docs/ai/ spec files and ADRs for inconsistencies with the actual codebase. Report only, no modifications.
allowed-tools: Read, Glob, Grep, Agent, Bash(ls *)
---

# Check Docs Consistency

Scan all documentation in `docs/ai/` and report inconsistencies with the actual codebase. **Do not modify any files.**

## Scope

Check these doc files against implementation:

1. `docs/ai/architecture.md` — ADR statuses, component list, directory structure, commands
2. `docs/ai/overview.md` — current state, non-goals
3. `docs/ai/sequencer-spec.md` — Pattern/Track/Trig interfaces, playback behavior
4. `docs/ai/audio-interface.md` — WorkletCommand, WorkletPattern, WorkletTrig, Engine API
5. `docs/ai/sound-design.md` — voice params, paramDefs ranges/defaults
6. `docs/ai/ui-design.md` — component descriptions, layout, mobile views
7. `docs/ai/glossary.md` — term accuracy, missing terms
8. `docs/ai/adr/INDEX.md` — ADR statuses (Implemented vs actual state)
9. All ADR files marked as "Implemented" in INDEX.md — check against code

## Process

1. **Read all doc files** listed above.

2. **Cross-reference with codebase** by reading/grepping these key source files:
   - `src/lib/state.svelte.ts` — Pattern, Track, Trig types, state shape
   - `src/lib/audio/engine.ts` — Engine API, patternToWorklet serialization
   - `src/lib/audio/worklet-processor.ts` — WorkletCommand handling, WorkletPattern/WorkletTrig usage
   - `src/lib/audio/paramDefs.ts` — voice parameter definitions (names, ranges, defaults)
   - `src/lib/components/*.svelte` — component names and existence
   - `src/lib/audio/voices/*.ts` — voice implementations

3. **Check for these types of inconsistencies**:
   - Type/interface field mismatches (missing fields, wrong field names, wrong types)
   - Wrong parameter ranges or defaults in docs vs paramDefs.ts
   - Components mentioned in docs that don't exist, or existing components not documented
   - ADR status mismatches (doc says PROPOSED but feature is implemented, or vice versa)
   - Removed/renamed features still documented
   - Missing documentation for implemented features

4. **Output a report** in this format:

```
## Docs Consistency Report

### [filename]
- **[section]**: [description of inconsistency]
  - Doc says: [what the doc states]
  - Code says: [what the code actually does]

### No issues found
- [filename] — OK
```

## Guidelines

- Use parallel Agent tools to speed up codebase exploration
- Be thorough — check every interface field, every param range, every component reference
- Only report confirmed inconsistencies, not stylistic preferences
- Group findings by file for easy reference
- This is a READ-ONLY operation — do not edit any files
