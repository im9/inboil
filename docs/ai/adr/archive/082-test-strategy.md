# ADR 082: Test Strategy — Persistence & State Integrity

## Status: Implemented

## Context

As features grow in complexity, state management bugs can no longer be caught by manual testing alone. Persistence issues in particular (FX/EQ/Master pad values not saving, data loss during project CRUD, etc.) would be critical after launch.

### Current Test Coverage

4 existing test files, all vitest unit tests:

| File | Coverage |
|------|----------|
| `generative.test.ts` | Quantizer / Tonnetz / Turing Machine logic |
| `sceneData.test.ts` | SceneNode clone / restore / decorator migration |
| `trackOps.test.ts` | Cell.trackId integrity, addTrack / removeTrack isolation |
| `state.test.ts` | TDZ guard (savePrefs initialization order static check) |

**High-risk areas with no coverage:**

- `cloneSong()` → `restoreSong()` round-trip (including FX/EQ/Master/insertFx/decorator/generative)
- Project CRUD (storage.ts ↔ state.svelte.ts integration)
- Data integrity after pattern operations (copy, delete, instrument change)
- Undo/Redo snapshot correctness
- Legacy JSON migration (e.g. Cell.trackId assignment)

### Tooling Status

- **vitest**: installed (`pnpm test` = `vitest run`)
- **Playwright**: not installed
- **Component testing**: not installed (Svelte 5 runes do not work in jsdom)

## Decision

### Three-Layer Test Strategy

```
┌────────────────────────────────────────────┐
│  Layer 3: E2E (Playwright)                 │  ← browser integration
│  Project CRUD, reload persistence,         │
│  scene, undo across reload           │
├────────────────────────────────────────────┤
│  Layer 2: Integration (vitest)             │  ← state logic integration
│  cloneSong→restoreSong round-trip,         │
│  undo/redo snapshots, migration            │
├────────────────────────────────────────────┤
│  Layer 1: Unit (vitest)                    │  ← pure functions
│  factory, sceneData, generative,           │
│  trackOps (existing)                       │
└────────────────────────────────────────────┘
```

Audio output verification is out of scope. AudioContext / AudioWorklet are mocked; only call verification (e.g. `triggerNote` was called) is tested.

---

### Layer 1 — Unit Tests (existing + expansion)

Existing tests are kept as-is. The following are added:

#### `src/lib/persistence.test.ts` — Round-Trip Tests

Verify that all fields survive `cloneSong()` → `restoreSong()`. Highest ROI.

```typescript
import { describe, it, expect } from 'vitest'
import { makeDefaultSong } from './factory.ts'

// cloneSong / restoreSong are closures inside state.svelte.ts
// that access global $state variables directly.
// → Extract core logic as pure functions into src/lib/songClone.ts.

describe('song round-trip', () => {
  it('preserves all pattern cells', () => {
    const original = makeDefaultSong()
    const cloned = cloneSongPure(original)
    const restored = {} as Song
    restoreSongPure(restored, cloned)

    for (let i = 0; i < original.patterns.length; i++) {
      expect(restored.patterns[i].cells.length)
        .toBe(original.patterns[i].cells.length)
      for (let j = 0; j < original.patterns[i].cells.length; j++) {
        expect(restored.patterns[i].cells[j].trackId)
          .toBe(original.patterns[i].cells[j].trackId)
      }
    }
  })

  it('preserves fxPadState', () => {
    const song = makeDefaultSong()
    song.fxPadState = { verb: { mix: 0.7, size: 0.4, on: true } }
    const cloned = cloneSongPure(song)
    expect(cloned.fxPadState!.verb.mix).toBe(0.7)
  })

  it('preserves masterPadState', () => { /* ... */ })
  it('preserves insertFx per cell', () => { /* ... */ })
  it('preserves scene decorators', () => { /* ... */ })
  it('preserves generative node config', () => { /* ... */ })
})
```

**Refactoring for testability:**

`cloneSong()` and `restoreSong()` currently live inside `state.svelte.ts` as closures that directly access global `song` / `fxPad` / `masterPad`. To make them testable:

1. Extract core logic into `src/lib/songClone.ts` as pure functions
2. Keep `state.svelte.ts` `cloneSong()` / `restoreSong()` as thin wrappers
3. Tests import the pure function versions directly

```typescript
// src/lib/songClone.ts
export function cloneSongPure(song: Song, fxPad: FxPad, masterPad: MasterPad): SongSnapshot { ... }
export function restoreSongPure(target: Song, snapshot: SongSnapshot, fxPad: FxPad, masterPad: MasterPad): void { ... }
```

#### `src/lib/migration.test.ts` — Legacy JSON Migration

```typescript
describe('legacy song migration', () => {
  it('assigns trackId when missing from cells', () => {
    const legacy = { patterns: [{ cells: [
      { name: 'BD', trigs: [] },  // no trackId
      { name: 'SD', trigs: [] },
    ]}]}
    const restored = migrateLegacy(legacy)
    expect(restored.patterns[0].cells[0].trackId).toBe(0)
    expect(restored.patterns[0].cells[1].trackId).toBe(1)
  })

  it('handles missing fxPadState gracefully', () => { /* ... */ })
  it('handles missing scene field gracefully', () => { /* ... */ })
})
```

#### `src/lib/undo.test.ts` — Undo/Redo Snapshot Integrity

```typescript
describe('undo/redo snapshots', () => {
  it('snapshot captures current fxPad values', () => { /* ... */ })
  it('undo restores previous pattern state', () => { /* ... */ })
  it('redo re-applies undone change', () => { /* ... */ })
  it('mutation after undo clears redo stack', () => { /* ... */ })
})
```

---

### Layer 2 — Integration Tests (vitest + fake-indexeddb)

Storage layer tests. `fake-indexeddb` emulates IDB in memory.

```typescript
// src/lib/storage.test.ts
import 'fake-indexeddb/auto'  // polyfill globalThis.indexedDB

describe('project CRUD', () => {
  it('save → load round-trip preserves song', async () => {
    const song = makeDefaultSong()
    await saveProject('test-id', 'Test', song)
    const loaded = await loadProject('test-id')
    expect(loaded.song.patterns.length).toBe(song.patterns.length)
  })

  it('delete removes project', async () => {
    await saveProject('del-id', 'Delete Me', makeEmptySong())
    await deleteProject('del-id')
    const list = await listProjects()
    expect(list.find(p => p.id === 'del-id')).toBeUndefined()
  })

  it('overwrite updates existing project', async () => { /* ... */ })
  it('listProjects returns sorted by updatedAt', async () => { /* ... */ })
})
```

**Dependency:** `fake-indexeddb` (devDependency, ~30KB) — the only test-specific npm dependency for this project.

---

### Layer 3 — E2E Tests (Playwright)

Verify integrated browser flows. Run against dev server (`pnpm dev`).

#### Setup

```bash
pnpm add -D @playwright/test
npx playwright install chromium  # Chrome only (ADR scope)
```

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: true,
  },
  use: {
    browserName: 'chromium',
  },
})
```

#### Test Cases

```typescript
// e2e/persistence.spec.ts

test('pattern edit survives reload', async ({ page }) => {
  await page.goto('/')
  // Click step 0 of track 0 to toggle
  await page.locator('[data-step="0"][data-track="0"]').click()
  // Reload
  await page.reload()
  // Verify step is still active
  await expect(page.locator('[data-step="0"][data-track="0"]'))
    .toHaveClass(/active/)
})

test('project create → rename → delete', async ({ page }) => {
  await page.goto('/')
  // Open sidebar
  await page.locator('[aria-label="System"]').click()
  // Save as new project
  await page.locator('text=SAVE AS').click()
  // ... fill name, confirm
  // Verify project appears in list
  // Delete project
  // Verify project removed from list
})

test('FX pad values persist across reload', async ({ page }) => {
  await page.goto('/')
  // Open FX sheet
  // Drag XY pad to specific position
  // Reload
  // Re-open FX sheet
  // Verify XY pad position matches
})

test('scene nodes persist', async ({ page }) => {
  await page.goto('/')
  // Switch to scene view
  // Add a node
  // Connect nodes
  // Reload
  // Verify node count and connections
})

test('undo/redo works across pattern operations', async ({ page }) => {
  await page.goto('/')
  // Edit pattern
  // Ctrl+Z → verify reverted
  // Ctrl+Shift+Z → verify re-applied
})
```

#### AudioContext Handling

AudioContext works in Playwright but audio output is not needed. Simulate a user gesture before tests to resume AudioContext:

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Dismiss any audio context prompt by clicking
  await page.locator('body').click()
})
```

---

### npm Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "test:all": "vitest run && playwright test"
}
```

Future CI: run `pnpm test:all` in GitHub Actions.

---

### data-testid Strategy

Add `data-testid` to key UI elements for stable E2E selectors:

```svelte
<!-- StepGrid.svelte -->
<div data-testid="step-{step}-track-{trackId}" ...>

<!-- Sidebar.svelte -->
<button data-testid="btn-save-as" ...>

<!-- SceneView.svelte -->
<g data-testid="scene-node-{node.id}" ...>
```

Reuse existing `data-step` / `data-track` attributes where available. Minimize new additions.

## Implementation Phases

1. **Phase 1: Persistence Round-Trip** (highest ROI)
   - Extract pure functions into `songClone.ts`
   - `persistence.test.ts`: verify all fields survive cloneSong → restoreSong
   - `migration.test.ts`: verify legacy JSON migration
   - Additional dependencies: none

2. **Phase 2: Storage Integration**
   - Add `fake-indexeddb`
   - `storage.test.ts`: project CRUD round-trip
   - Additional dependencies: `fake-indexeddb` (devDependency)

3. **Phase 3: E2E Setup + Core Flows**
   - Add Playwright, create `e2e/` directory
   - Tests for pattern persistence, project CRUD, FX pad persistence
   - Add `data-testid` attributes (minimal)
   - Additional dependencies: `@playwright/test` (devDependency)

4. **Phase 4: Extended E2E**
   - Scene persistence
   - Undo/Redo flows
   - Instrument change & parameter lock persistence

## Considerations

- **Svelte 5 runes testability**: `$state` / `$derived` do not work in vitest's jsdom environment. Strategy: extract testable logic as pure functions. UI component testing is delegated to E2E
- **Test speed**: Unit/Integration target < 5 seconds. E2E target < 30 seconds including dev server startup (Chrome only)
- **Zero-dependency alignment**: `fake-indexeddb` and `@playwright/test` are devDependencies only — no impact on production bundle
- **Maintenance cost**: E2E tests are fragile against UI changes. Mitigated by `data-testid`-based selectors, but avoid over-testing

## Future Extensions

- GitHub Actions CI running `pnpm test:all` automatically
- Visual regression testing (Playwright screenshot comparison)
- Performance testing (operation speed with 100+ patterns)
- Mobile viewport E2E (touch interaction simulation)
