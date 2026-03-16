# ADR 104: Audio Pool (OPFS-Based Sample Library)

## Status: Proposed

## Context

inboil's current sampler (ADR 012/065) supports loading one sample per track via file picker or drag-and-drop. Samples are stored in IndexedDB per project. This works for basic use but lacks a **browsable, persistent sample library** — the kind of audio pool found in hardware like the Elektron Octatrack, where users manage a reusable collection of samples across projects.

### Problems with the Current Model

1. **No reuse** — the same kick sample loaded into 5 projects is stored 5 times in IndexedDB
2. **No browsing** — users must re-import from disk every time; no persistent library to browse
3. **No organization** — samples are bound to track slots, not categorized or taggable
4. **No preview** — can't audition a sample before assigning it to a track

### Why Not Cloud Storage (Dropbox/Google Drive)?

Evaluated and rejected (ADR 020, 2026-03):
- OAuth adds external dependency, app review burden, API key management
- File System Access API (folder picker) is Chromium-only
- Users who want cloud sync can use desktop clients (Dropbox/iCloud/OneDrive) to sync their local export folder

### Why OPFS?

**Origin Private File System** is a browser-native file system API:
- Available in Chrome 86+, Firefox 111+, Safari 15.2+ (covers inboil's target browsers)
- Persistent across sessions (same lifecycle as IndexedDB)
- Supports directory structure, file read/write, and iteration
- Sandboxed to origin (no access to user's actual filesystem — this is a feature for privacy)
- No permissions prompt required
- Works in Web Workers for non-blocking I/O

## Proposed Design

### A. Architecture

```
┌──────────────────────────────────────────────┐
│              OPFS (Audio Pool)                │
│  navigator.storage.getDirectory()            │
│  └── inboil-pool/                            │
│      ├── kicks/                              │
│      │   ├── 808_kick.wav                    │
│      │   └── vinyl_kick.wav                  │
│      ├── snares/                             │
│      │   └── tight_snare.wav                 │
│      ├── loops/                              │
│      │   └── breakbeat_170.wav               │
│      └── unsorted/                           │
│          └── my_sample.wav                   │
├──────────────────────────────────────────────┤
│              IndexedDB                        │
│  Store: 'pool-meta'                          │
│  { path, name, duration, sampleRate,         │
│    size, waveform, tags, addedAt }           │
│  (metadata index — fast search/browse)       │
├──────────────────────────────────────────────┤
│              IndexedDB (existing)             │
│  Store: 'samples'                            │
│  (per-project track assignments — unchanged) │
└──────────────────────────────────────────────┘
```

**OPFS stores the raw audio data.** Deduplication by content hash (SHA-256 of first 64KB + file size) avoids storing the same file twice.

**IndexedDB stores metadata** for fast browsing without reading OPFS files. Includes pre-computed waveform (Float32Array downsampled to 128 points) for instant visual preview.

**Existing per-project sample store is unchanged.** Track assignments still copy the buffer into IndexedDB per project (simple, no cross-project dependency issues). The pool is a *source* to pick from, not a shared reference.

### B. Pool Metadata Schema

```typescript
interface PoolEntry {
  id: string              // content hash (dedup key)
  path: string            // OPFS path: "kicks/808_kick.wav"
  name: string            // display name (filename without extension)
  folder: string          // "kicks", "snares", "loops", "unsorted"
  duration: number        // seconds
  sampleRate: number
  size: number            // bytes
  waveform: Float32Array  // 128-point overview for visual preview
  tags: string[]          // user tags (future)
  addedAt: number         // Date.now()
}
```

### C. Import Flow

```
User action                    Processing
─────────────                  ──────────
Drag files/folder onto pool    1. Read File objects
  — or —                       2. Decode audio (AudioContext.decodeAudioData)
Click "Add to Pool"            3. Compute content hash (dedup check)
                               4. Write raw buffer to OPFS (folder/filename)
                               5. Generate 128-point waveform overview
                               6. Store PoolEntry in IndexedDB 'pool-meta'
```

**Folder drop support:** When a user drops a folder, preserve the directory structure in OPFS. The top-level folder name becomes the category.

**Deduplication:** If hash matches an existing entry, skip the write and show a notice.

**Size limit:** 10MB per file, 10s duration cap (per ADR 012). Total pool soft limit: 200MB (warn at 80%).

### D. Browse & Assign Flow

```
Pool Browser (Dock panel)      Assignment
─────────────────────          ──────────
Browse by folder/search        1. User taps sample in pool
Preview (tap = audition)       2. Read buffer from OPFS
Waveform shown from metadata   3. Assign to current track (existing setSample flow)
                               4. Copy to per-project IndexedDB store
```

### E. UI

Pool browser as a new Dock panel mode (alongside track params, FX, EQ, decorators):

```
┌─────────────────────────────────┐
│ POOL          [+ ADD]  [▼ SORT] │
│ ┌─────┬─────┬─────┬─────┐      │
│ │ ALL │KICK │SNRE │LOOP │ ...  │
│ └─────┴─────┴─────┴─────┘      │
│                                 │
│ ▸ 808_kick          0.4s  ~~~  │
│   vinyl_kick        0.3s  ~~~  │
│   tight_snare       0.2s  ~~~  │
│   breakbeat_170     2.1s  ~~~  │
│                                 │
│ [LOAD TO TRACK]                 │
│                                 │
│ Pool: 12 samples (4.2 MB)      │
└─────────────────────────────────┘
```

- `~~~` = mini waveform from cached PoolEntry.waveform
- Tap row = audition (play through master bus)
- "LOAD TO TRACK" = assign selected sample to current track
- "+ ADD" = file picker or folder picker
- Drag from desktop onto the pool area = bulk import
- Folder tabs derived from OPFS directory listing

### F. Storage Budget

```
OPFS:
  Per sample (typical): 50KB–2MB (short one-shots to 10s loops)
  Soft limit: 200MB (~100–400 samples)
  Browser quota: shared with IndexedDB, typically 50%+ of disk

IndexedDB pool-meta:
  Per entry: ~1KB (metadata + 128-point waveform)
  400 entries ≈ 400KB (negligible)
```

### G. Progressive Enhancement (Future Phases)

| Phase | Feature | Browser | Notes |
|-------|---------|---------|-------|
| Phase 1 | OPFS audio pool + browse/assign | All modern | Core feature |
| Phase 2 | File System Access API folder link | Chromium | Direct browse of external folder without import |
| Phase 3 | Tauri native FS access | Desktop app | Full filesystem browsing, watch folder for changes |

Phase 2/3 would allow *referencing* samples in-place without copying to OPFS. Phase 1 always copies (import model).

## Implementation Order

1. `src/lib/audioPool.ts` — OPFS read/write helpers, hash function, PoolEntry CRUD
2. IndexedDB `pool-meta` store (bump DB_VERSION)
3. Import flow: file/folder drop → decode → hash → OPFS write → metadata save
4. Pool browser UI in DockPanel (folder tabs, waveform list, audition, assign)
5. Dedup check on import
6. Storage budget tracking + warning toast at 80%
7. Pool management: delete, rename, move between folders

## Consequences

- **Positive:** Persistent, browsable sample library across all projects
- **Positive:** No external service dependency — fully local, works offline
- **Positive:** Cross-browser support (Chrome, Firefox, Safari)
- **Positive:** Deduplication saves storage when same sample used across projects
- **Positive:** Pre-computed waveforms enable instant visual browsing
- **Negative:** Import model (copy into OPFS) means samples exist in two places (source + pool)
- **Negative:** OPFS is sandboxed — users can't directly see/manage files outside the browser
- **Negative:** Storage quota shared with IndexedDB — large pools may compete with project data
- **Dependency:** ADR 012/065 (Sampler) — existing sample load/assign infrastructure
- **Dependency:** ADR 020 (Data Persistence) — IndexedDB storage layer
