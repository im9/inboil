# ADR 107 — Pattern Sharing API

## Status: Proposed

## Context

INBOIL is entirely client-side with no backend services. Adding a lightweight API for sharing patterns and presets is the simplest backend feature that delivers immediate user value — and serves as a backend learning project.

## Decision

Build a REST API for sharing patterns and community presets.

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Cloudflare Workers | Already used for WebRTC signaling (ADR 019), zero cold start |
| Framework | Hono | Lightweight, Workers-native, familiar middleware model |
| Database | Cloudflare D1 (SQLite) | Serverless, zero config, SQL fundamentals |
| Storage | R2 (if needed) | For large payloads exceeding D1 row limits |

### Phase 1 — Pattern Sharing (CRUD basics)

**POST `/api/patterns`**
- Accept: pattern JSON (single pattern from Song.patterns pool)
- Validate structure (track count, step count, voiceIds)
- Store in D1, return short ID (nanoid, 8 chars)
- No auth required

**GET `/api/patterns/:id`**
- Return pattern JSON
- Include metadata: created_at, view_count

**GET `/api/patterns`**
- List recent shared patterns
- Pagination (cursor-based)
- Optional filter by voice type

**App integration:**
- "Share" button in pattern sheet → POST → copy short URL to clipboard
- "Import from URL" in sidebar PROJECT tab → GET → merge into Song.patterns pool

### Phase 2 — Preset Gallery (auth introduction)

**POST `/api/presets`**
- Accept: voice preset JSON (voiceParams + voiceId + name + category)
- Requires simple auth (see below)

**GET `/api/presets`**
- Browse community presets by voice type and category
- Sort by recent / popular (like count)

**POST `/api/presets/:id/like`**
- Increment like count
- Rate-limited by IP or simple token

**Auth (minimal):**
- Anonymous persistent token stored in localStorage
- No signup — token auto-generated on first share
- Optional: nickname attached to token (editable, not unique)

### Database Schema (D1)

```sql
-- Phase 1
CREATE TABLE patterns (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,          -- JSON blob
  created_at TEXT NOT NULL,
  view_count INTEGER DEFAULT 0
);

-- Phase 2
CREATE TABLE presets (
  id TEXT PRIMARY KEY,
  voice_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  data TEXT NOT NULL,
  author_token TEXT,
  author_name TEXT,
  likes INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE preset_likes (
  preset_id TEXT NOT NULL,
  liker_token TEXT NOT NULL,
  PRIMARY KEY (preset_id, liker_token)
);
```

## Learning Outcomes

- REST API design (CRUD, status codes, validation)
- SQL fundamentals (schema, queries, indexes)
- Cloudflare Workers / D1 deployment
- Input validation and rate limiting
- Cursor-based pagination

## Constraints

- No user accounts or OAuth (keep scope minimal)
- Pattern JSON size limit: 100KB (covers 16 tracks × 64 steps with p-locks)
- Rate limit: 10 shares/hour per IP
- No moderation system in v1 — revisit if abuse occurs
