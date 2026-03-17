---
name: sync-docs
description: Check docs/ai/ spec files and ADRs for inconsistencies with the codebase, then fix all discrepancies.
allowed-tools: Read, Glob, Grep, Agent, Edit, Write, Bash(ls *)
---

# Sync Docs with Codebase

Scan all documentation in `docs/ai/` for inconsistencies with the actual codebase, then **fix all discrepancies** so docs match the implementation.

## Scope

Check and fix these doc files:

1. `CLAUDE.md` — project description, build commands, conventions, key architecture notes
2. `docs/ai/BACKLOG.md` — check completed items against code, remove if done
3. `docs/ai/architecture.md` — ADR statuses, component list, directory structure, commands
2. `docs/ai/overview.md` — current state, non-goals
3. `docs/ai/sequencer-spec.md` — Pattern/Track/Trig interfaces, playback behavior
4. `docs/ai/audio-interface.md` — WorkletCommand, WorkletPattern, WorkletTrig, Engine API
5. `docs/ai/sound-design.md` — voice params, paramDefs ranges/defaults
6. `docs/ai/ui-design.md` — component descriptions, layout, mobile views
7. `docs/ai/glossary.md` — term accuracy, missing terms
8. `docs/ai/adr/INDEX.md` — ADR statuses (Implemented vs actual state)
9. All ADR files marked as "Implemented" in INDEX.md — check against code

## Process

### Phase 1: Discover inconsistencies

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

### Phase 2: Fix all issues

4. **Use TodoWrite** to create a task list of all fixes needed.

5. **Apply fixes** using Edit tool for each doc file. Rules:
   - Always update docs to match the code (code is the source of truth)
   - Keep the existing doc style and structure
   - Write docs in English (matching CLAUDE.md convention)
   - Don't add unnecessary content — only fix what's wrong or missing
   - For ADR status changes, also update `docs/ai/adr/INDEX.md`

6. **Output a summary** of all changes made:

```
## Docs Sync Summary

### [filename]
- [description of fix applied]

### No changes needed
- [filename] — already consistent
```

## Guidelines

- Use parallel Agent tools to speed up codebase exploration
- Be thorough — check every interface field, every param range, every component reference
- Code is always the source of truth; docs adapt to match code
- Preserve existing doc formatting and structure where possible
