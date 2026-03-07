# ADR 020: Data Persistence & Storage Design

## Status: Proposed

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

ユーザーがアップロードしたサンプル（ADR 012, 065）の永続化。

#### Tier 1: IndexedDB（ローカル）

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

- サンプル読み込み時に IndexedDB に保存、次回起動時に自動復元
- プロジェクト保存に含める（project 単位でサンプルを紐付け）
- 1サンプル ≈ 1.7MB (10s@44.1kHz mono Float32) → 8トラック分でも ~14MB
- IndexedDB 容量は十分（ブラウザ上限 50–100MB+）

#### Tier 2: Cloudflare R2（クラウド）

```
┌─────────────────────────────────────────┐
│           Cloudflare R2                 │
│  Bucket: 'inboil-samples'              │
│  Key: 'user:{uid}/sample:{hash}.wav'   │
│  ← S3 互換、egress 無料               │
├─────────────────────────────────────────┤
│        Pages Function (Worker)          │
│  POST /api/sample/upload-url            │
│    → R2 署名付き PUT URL 発行           │
│  GET  /api/sample/download-url/:key     │
│    → R2 署名付き GET URL 発行           │
└─────────────────────────────────────────┘

Upload flow:
  Client → Worker (認証+署名URL発行)
  Client → R2 直接 PUT (署名付き、max 10MB)

Download flow:
  Client → Worker (署名URL発行)
  Client ← R2 直接 GET
```

- KV はバイナリに不向き（value 上限 25MB だが遅い）→ R2 が最適
- R2 無料枠: 10GB storage, 1M Class B reads/mo, 100K Class A writes/mo
- Content-addressable key (`sha256(buffer)`) でデデュプ可能
- プロジェクト JSON にはサンプル参照（R2 key + metadata）のみ含める
- 認証必須（ADR 061）

#### Tier 3: 外部ストレージ連携（Dropbox / Google Drive）

ユーザーの既存サンプルプールを直接参照する。

```
┌───────────┐     OAuth2      ┌──────────────┐
│  inboil   │ ←─────────────→ │   Dropbox    │
│ (browser) │   Access Token   │  /samples/   │
└───────────┘                  └──────────────┘
     │                              │
     │  Dropbox JS SDK              │
     │  files/list_folder           │
     │  files/download              │
     └──────────────────────────────┘
```

**Dropbox:**
- Dropbox JavaScript SDK（`dropbox` npm パッケージ、または REST API 直接呼び出し）
- OAuth2 PKCE flow でブラウザから直接認証（バックエンド不要）
- `files/list_folder` でフォルダ一覧、`files/download` でサンプル取得
- ユーザーが指定したフォルダ（例: `/Music/Samples/`）をブラウズ
- ダウンロードしたサンプルは IndexedDB にキャッシュ（オフライン対応）

**Google Drive:**
- Google Identity Services + Drive API v3
- 同様に OAuth2 PKCE、ブラウザ完結
- `files.list` + `files.get?alt=media` でサンプル取得

**UI:**
```
┌─────────────────────────────┐
│ SAMPLE SOURCE               │
│ [LOCAL] [R2] [DROPBOX] [GD] │
│                             │
│ 📁 /Music/Samples/          │
│   breakbeat_170bpm.wav      │
│   kick_808.wav              │
│   snare_vinyl.wav           │
│   ...                       │
│                             │
│ [LOAD SELECTED]             │
└─────────────────────────────┘
```

**制約・注意点:**
- Dropbox API は無料（個人アプリ、500ユーザーまで）。Production は App Review が必要
- npm 依存を追加するか REST API 直叩きかの選択（zero-dep ポリシーなら REST 直叩き）
- CORS: Dropbox Content API は `dl.dropboxusercontent.com` で CORS 対応済み
- ファイルサイズ制限を UI 側で適用（10MB / 10s 上限、ADR 012 準拠）

#### 実装優先度

| 段階 | やること | 依存 |
|------|----------|------|
| Phase A | IndexedDB にサンプル保存・復元 | なし（今すぐ可能） |
| Phase B | R2 にクラウドバックアップ | ADR 061 (認証) |
| Phase C | Dropbox / Google Drive 連携 | OAuth2 設定のみ |

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
2. `src/lib/storage.ts` — IndexedDB wrapper
3. Pattern save/load — auto-save on `switchPattern`, `stop`
4. Factory pattern write on first launch
5. `beforeunload` best-effort save
6. Sample persistence in IndexedDB (Section I, Phase A)
7. Factory reset feature in SYSTEM settings
8. Export/Import UI (file-based, works for all users)
9. Authentication (ADR 061) — Google/Apple OAuth via Cloudflare Workers
10. Cloud sync Worker + KV setup
11. R2 sample upload/download (Section I, Phase B)
12. Dropbox / Google Drive integration (Section I, Phase C)
13. Sync UI (status indicator, manual sync button, conflict notification)

## Consequences

- **Positive:** Data persists across reloads — edits are never lost
- **Positive:** Two-tier separation (localStorage / IndexedDB) matches data characteristics
- **Positive:** Single key + version prevents localStorage key sprawl
- **Positive:** IndexedDB handles async, large, structured data well
- **Positive:** Export/Import provides data portability
- **Negative:** IndexedDB async API is more complex than localStorage
- **Negative:** Factory reset UX design needed
- **Negative:** `beforeunload` save is not guaranteed (browser-dependent)
- **Positive:** Cloud sync provides cross-device access and backup
- **Negative:** Cloud sync adds Cloudflare Worker infrastructure dependency
- **Negative:** KV free tier write limit (1,000/day) requires careful debouncing
- **Dependency:** ADR 018 (Settings Panel) — settings field localStorage persistence
- **Dependency:** ADR 015 (Presets) — presets store usage
- **Dependency:** ADR 061 (Authentication) — required for cloud sync
- **Dependency:** ADR 012/065 (Sampler) — sample buffer persistence
- **Positive:** Dropbox/GDrive integration lets users bring their own sample library without uploading
- **Negative:** External OAuth providers add API key management and app review process
