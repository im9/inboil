# ADR 020: Data Persistence & Storage Design

## Status: In Progress (local persistence done, cloud sync pending)

## Context

inboil currently holds all state in memory — a page reload loses all pattern edits. As the project grows (pattern saving, settings persistence, preset management), a consistent storage design is needed to prevent ad-hoc persistence approaches from scattering across features.

### Current State

| Data | Storage | Method |
|------|---------|--------|
| Language + first-visit flag | `localStorage['inboil']` | JSON (v1) |
| Pattern bank (100 slots) | Memory only | Lost on reload |
| Effects settings | Memory only | Lost on reload |
| FX pad state | Memory only | Lost on reload |
| Performance settings | Memory only | Lost on reload |

## Proposed Design

### A. Storage Layers

Three tiers based on data characteristics:

```
┌─────────────────────────────────────────┐
│         localStorage['inboil']          │  ← Lightweight settings (< 5KB)
│  { v, lang, visited, settings, ... }    │
├─────────────────────────────────────────┤
│              IndexedDB                  │  ← Patterns & presets (several MB)
│  Database: 'inboil'                     │  ← Offline-first, always available
│  ├── Store: 'patterns'                  │
│  ├── Store: 'presets'                   │
│  └── Store: 'projects'                 │
├─────────────────────────────────────────┤
│        Cloudflare Workers KV            │  ← Cloud backup & cross-device sync
│  Namespace: 'inboil-projects'           │  ← Requires authentication (ADR 061)
│  Key: 'user:{uid}:project:{id}'         │
│  Value: Full project JSON (gzip)        │
└─────────────────────────────────────────┘
```

**localStorage** — Small settings data:
- Language, first visit, SYSTEM settings (ADR 018)
- Single key `inboil` with unified JSON
- Version field (`v`) for schema migration

**IndexedDB** — Large structured data (local):
- Pattern bank (100 slots x 8 tracks x up to 64 steps)
- User presets (future)
- Project-level data
- Always the primary read/write target (offline-first)

**Cloudflare Workers KV** — Cloud persistence (authenticated users only):
- Project-level snapshots synced from IndexedDB
- Cross-device access and backup
- Authentication required — see ADR 061
- Unauthenticated users work in demo mode (local-only, feature-limited)

### B. localStorage Schema

```typescript
// Current v1
interface StoredPrefs {
  v: number         // schema version
  lang: 'ja' | 'en'
  visited: boolean
}

// After ADR 018 implementation: v2
interface StoredPrefsV2 {
  v: 2
  lang: 'ja' | 'en'
  visited: boolean
  settings: {
    randScope: 'trigs' | 'all'
    audioLatency: 'low' | 'balanced'
  }
}
```

**Migration policy:**
- If `v` doesn't match current version, reset to defaults
- Write migration functions only when backward compatibility is needed
- Breaking changes bump version and reset (settings are small — low cost to reconfigure)

### C. IndexedDB Schema

```typescript
// Database: 'inboil', version: 1
const DB_NAME = 'inboil'
const DB_VERSION = 1

// Object Stores:

// 'patterns' — Pattern bank
// Key: pattern.id (1–100)
interface StoredPattern {
  id: number
  name: string
  bpm: number
  tracks: Track[]       // Existing Track type as-is
  updatedAt: number     // Date.now() — last update timestamp
  isFactory: boolean    // true = factory preset (ID 1–20)
}

// 'presets' — Synth presets (future: ADR 015)
// Key: auto-increment
interface StoredPreset {
  id?: number
  name: string
  synthType: SynthType
  voiceParams: Record<string, number>
  createdAt: number
}

// 'projects' — Project-level data (future: export/import)
// Key: auto-increment
interface StoredProject {
  id?: number
  name: string
  patterns: StoredPattern[]
  effects: Effects
  createdAt: number
}
```

### D. Access Layer

A thin wrapper to absorb IndexedDB's async nature:

```typescript
// src/lib/storage.ts

class InboilDB {
  private db: IDBDatabase | null = null

  async open(): Promise<void> {
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('patterns')) {
          db.createObjectStore('patterns', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('presets')) {
          db.createObjectStore('presets', { keyPath: 'id', autoIncrement: true })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async savePattern(pattern: StoredPattern): Promise<void> { ... }
  async loadPattern(id: number): Promise<StoredPattern | null> { ... }
  async loadAllPatterns(): Promise<StoredPattern[]> { ... }
  async savePreset(preset: StoredPreset): Promise<number> { ... }
  async loadPresets(synthType?: SynthType): Promise<StoredPreset[]> { ... }
}

export const db = new InboilDB()
```

### E. Save Timing

| Trigger | Data | Method |
|---------|------|--------|
| Pattern switch (`switchPattern`) | Current pattern | IndexedDB |
| Playback stop (`stop`) | Current pattern | IndexedDB |
| Settings change | Prefs | localStorage (immediate) |
| Language switch | Prefs | localStorage (immediate) |
| Browser close (`beforeunload`) | Current pattern | IndexedDB (best-effort) |

**No real-time saving needed** — saving on every step edit or knob tweak would hurt performance. Saving on pattern switch and stop is sufficient.

### F. Factory Preset Handling

| Policy | Details |
|--------|---------|
| First launch | Write 20 factory patterns to IndexedDB |
| Editing | Factory patterns can be overwritten (`isFactory` flag preserved) |
| Reset | Individual or bulk factory reset from SYSTEM settings |
| Source definition | `FACTORY` array remains in source code (master data for reset) |

### G. Data Size Estimate

```
1 pattern ≈ 8 tracks × 64 steps × ~40 bytes/step + metadata
          ≈ 20 KB (worst case, 64 steps all tracks)
          ≈ 5 KB (typical, 16 steps)

100 patterns ≈ 500 KB – 2 MB
Presets ×100 ≈ 50 KB

Total: < 5 MB — well within IndexedDB limits (50–100 MB)
```

### H. Cloud Sync (Cloudflare Workers KV)

#### KV Schema

```
Key:   "user:{uid}:project:{projectId}"
Value: gzip-compressed JSON (full project snapshot)

Key:   "user:{uid}:meta"
Value: { projects: [{ id, name, updatedAt }] }  ← project listing
```

#### Sync Strategy — Offline-First, Project-Level

1. **All reads/writes go to IndexedDB first** — the app works fully offline
2. **Cloud sync is async and debounced** — triggered on save events, not every edit
3. **Sync triggers:**
   - Project save (manual or auto) → debounced upload (30s cooldown)
   - App open (authenticated) → pull latest project list from KV
   - Explicit "Sync Now" action in UI
4. **Conflict resolution:** last-write-wins based on `updatedAt` timestamp
   - On pull: if remote `updatedAt` > local, overwrite local
   - On push: always overwrite remote (local is source of truth during a session)
5. **Granularity:** entire project (patterns + effects + metadata) as one KV value
   - Simpler than per-pattern sync, fewer write operations
   - Typical project < 500KB uncompressed, < 100KB gzipped

#### Free Tier Budget

| Resource | Free Limit | Estimated Usage |
|----------|-----------|-----------------|
| KV reads | 100,000/day | ~50/session (project list + pulls) |
| KV writes | 1,000/day | ~10–30/session (debounced saves) |
| Storage | 1 GB | ~100KB/project, supports ~10,000 projects |
| Worker requests | 100,000/day | Auth + sync combined |

30s debounce on writes keeps well within 1,000 writes/day for single-user development. At scale (multi-user), upgrade to Workers Paid plan ($5/mo → 1M writes/month).

#### API Endpoints (Cloudflare Worker)

```
POST   /api/sync/push     ← Upload project (gzipped JSON body)
GET    /api/sync/pull/:id  ← Download project
GET    /api/sync/list      ← Project listing for user
DELETE /api/sync/:id       ← Delete project from cloud
```

All endpoints require Bearer token (see ADR 061).

### I. Sample Storage

Persistence for user-uploaded samples (ADR 012, 065).

#### Tier 1: IndexedDB (local)

```
// Object Store: 'samples'
interface StoredSample {
  id?: number            // auto-increment
  name: string           // original filename
  trackId: number        // assigned track
  buffer: ArrayBuffer    // raw audio data (pre-decode)
  sampleRate: number
  duration: number       // seconds
  createdAt: number
}
```

- Save to IndexedDB on sample load, auto-restore on next launch
- Include in project save (samples are bound per-project)
- 1 sample ~ 1.7MB (10s@44.1kHz mono Float32) -> 8 tracks ~ 14MB
- Well within IndexedDB limits (browser cap 50-100MB+)

#### Tier 2: Cloudflare R2 (cloud)

```
┌─────────────────────────────────────────┐
│           Cloudflare R2                 │
│  Bucket: 'inboil-samples'              │
│  Key: 'user:{uid}/sample:{hash}.wav'   │
│  <- S3-compatible, zero egress fees    │
├─────────────────────────────────────────┤
│        Pages Function (Worker)          │
│  POST /api/sample/upload-url            │
│    -> Issue R2 signed PUT URL           │
│  GET  /api/sample/download-url/:key     │
│    -> Issue R2 signed GET URL           │
└─────────────────────────────────────────┘

Upload flow:
  Client -> Worker (auth + signed URL)
  Client -> R2 direct PUT (signed, max 10MB)

Download flow:
  Client -> Worker (signed URL)
  Client <- R2 direct GET
```

- KV is unsuitable for binary (25MB value limit, slow) -> R2 is optimal
- R2 free tier: 10GB storage, 1M Class B reads/mo, 100K Class A writes/mo
- Content-addressable key (`sha256(buffer)`) enables deduplication
- Project JSON stores only sample references (R2 key + metadata)
- Authentication required (ADR 061)

#### Tier 3: External Storage (Dropbox / Google Drive)

Directly reference the user's existing sample pool.

```
┌───────────┐     OAuth2      ┌──────────────┐
│  inboil   │ <─────────────> │   Dropbox    │
│ (browser) │   Access Token   │  /samples/   │
└───────────┘                  └──────────────┘
     │                              │
     │  Dropbox JS SDK              │
     │  files/list_folder           │
     │  files/download              │
     └──────────────────────────────┘
```

**Dropbox:**
- Dropbox JavaScript SDK (`dropbox` npm package, or direct REST API calls)
- OAuth2 PKCE flow, browser-only authentication (no backend needed)
- `files/list_folder` for directory listing, `files/download` for sample fetch
- User selects a folder (e.g. `/Music/Samples/`) to browse
- Downloaded samples cached in IndexedDB (offline support)

**Google Drive:**
- Google Identity Services + Drive API v3
- OAuth2 PKCE, browser-only
- `files.list` + `files.get?alt=media` for sample fetch

**UI:**
```
┌─────────────────────────────┐
│ SAMPLE SOURCE               │
│ [LOCAL] [R2] [DROPBOX] [GD] │
│                             │
│   /Music/Samples/           │
│   breakbeat_170bpm.wav      │
│   kick_808.wav              │
│   snare_vinyl.wav           │
│   ...                       │
│                             │
│ [LOAD SELECTED]             │
└─────────────────────────────┘
```

**Constraints:**
- Dropbox API is free (personal apps, up to 500 users). Production requires App Review
- Choice between npm dependency or direct REST API calls (zero-dep policy favors REST)
- CORS: Dropbox Content API supports CORS via `dl.dropboxusercontent.com`
- File size limit enforced in UI (10MB / 10s cap, per ADR 012)

#### Implementation Priority

| Phase   | Task                              | Dependency              |
|---------|-----------------------------------|-------------------------|
| Phase A | Sample save/restore in IndexedDB  | None (can start now)    |
| Phase B | Cloud backup via R2               | ADR 061 (auth)          |
| Phase C | Dropbox / Google Drive integration | OAuth2 setup only      |

### J. Export / Import (File-Based)

```typescript
// Export as JSON file (works for all users, including demo)
async function exportProject(): Promise<string> {
  const patterns = await db.loadAllPatterns()
  return JSON.stringify({ v: 1, patterns, effects, exportedAt: Date.now() })
}

// Import from file
async function importProject(json: string): Promise<void> {
  const data = JSON.parse(json)
  // Version check + validation
  for (const p of data.patterns) await db.savePattern(p)
}
```

## Implementation Order

1. ~~localStorage unification (`inboil` single key + version)~~ Done
2. ~~`src/lib/storage.ts` — IndexedDB wrapper (`projects` store)~~ Done
3. ~~Project concept: `Song` includes `effects`, project = named song snapshot~~ Done
4. ~~Project CRUD: save/load/delete/list/rename in `state.svelte.ts`~~ Done
5. ~~Auto-save: immediate save on every `pushUndo`, auto-create project on first mutation~~ Done
6. ~~Save on `visibilitychange` (hidden) + `beforeunload` as fallback~~ Done
7. ~~Project name in header (editable, save status indicator)~~ Done
8. ~~Project management UI in system settings (NEW, SAVE AS, load, delete, Factory Demo)~~ Done
9. ~~Factory reset uses empty song (not factory patterns)~~ Done
10. ~~`lastProjectName` in localStorage for flash-free reload~~ Done
11. Sample persistence in IndexedDB (Section I, Phase A)
12. ~~Export/Import UI (file-based, works for all users)~~ Deferred — cloud sync is higher priority
13. Authentication (ADR 061) — Google/Apple OAuth via Cloudflare Workers
14. Cloud sync Worker + KV setup
15. R2 sample upload/download (Section I, Phase B)
16. Dropbox / Google Drive integration (Section I, Phase C)
17. Sync UI (status indicator, manual sync button, conflict notification)

## Consequences

- **Positive:** Data persists across reloads — edits are never lost
- **Positive:** Two-tier separation (localStorage / IndexedDB) matches data characteristics
- **Positive:** Single key + version prevents localStorage key sprawl
- **Positive:** IndexedDB handles async, large, structured data well
- **Positive:** Export/Import provides data portability
- **Negative:** IndexedDB async API is more complex than localStorage
- **Positive:** Immediate auto-save on every mutation eliminates data loss risk
- **Positive:** `visibilitychange` + `beforeunload` double-safety net for page close
- **Positive:** Cloud sync provides cross-device access and backup
- **Negative:** Cloud sync adds Cloudflare Worker infrastructure dependency
- **Negative:** KV free tier write limit (1,000/day) requires careful debouncing
- **Dependency:** ADR 018 (Settings Panel) — settings field localStorage persistence
- **Dependency:** ADR 015 (Presets) — presets store usage
- **Dependency:** ADR 061 (Authentication) — required for cloud sync
- **Dependency:** ADR 012/065 (Sampler) — sample buffer persistence
- **Positive:** Dropbox/GDrive integration lets users bring their own sample library without uploading
- **Negative:** External OAuth providers add API key management and app review process
