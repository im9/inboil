# ADR 108 — Collaboration Server & Media Processing

## Status: Proposed

## Context

ADR 019 implements multi-device jam via WebRTC P2P with Cloudflare Durable Objects for signaling. This works for 1:1 sessions but has limitations: NAT traversal failures, no persistence, no media processing. A server-side collaboration layer and audio processing API extends backend skills to WebSocket real-time communication and job queues.

## Decision

### Phase 1 — WebSocket Room Server (real-time fundamentals)

Replace or supplement the current DO signaling with a proper room server.

**Tech Stack:**
| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Cloudflare Workers + Durable Objects | Already in use, natural extension |
| Protocol | WebSocket | Persistent bidirectional connection |
| State | DO in-memory + D1 for history | Room state ephemeral, session logs persistent |

**Features:**
- Room creation with 4-letter code (existing UX)
- WebSocket upgrade on join — server relays messages between participants
- Room state: participant list, current pattern index, transport state (play/stop/BPM)
- Heartbeat / disconnect detection (30s timeout)
- Room capacity: up to 4 participants (1 host + 3 guests)
- Optional: chat messages within room

**Why server relay instead of pure P2P:**
- NAT traversal works without TURN server
- Server can validate and log state changes
- Foundation for spectator mode (read-only WebSocket)

**App integration:**
- Toggle in jam settings: "P2P" (current) vs "Server" mode
- Server mode: all messages route through DO WebSocket
- Host authority unchanged — server relays but doesn't override

### Phase 2 — Audio Processing API (job queues)

Server-side audio conversion and processing.

**Tech Stack:**
| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Fly.io or Railway | Need FFmpeg binary — not available on Workers |
| Queue | BullMQ + Redis | Industry-standard job queue, good learning material |
| Storage | R2 (upload/download) | Presigned URLs for direct browser upload |

**Endpoints:**

**POST `/api/jobs/convert`**
- Input: R2 object key (WAV uploaded by client)
- Options: format (mp3/ogg/flac), bitrate, normalize
- Returns: job ID

**GET `/api/jobs/:id`**
- Poll job status: queued → processing → done → expired
- On done: returns R2 download URL (signed, 1h TTL)

**POST `/api/jobs/stem-split`** (stretch goal)
- Input: mixed audio file
- Process: Demucs or similar ML model for stem separation
- Returns: individual stems (drums, bass, vocals, other)

**Flow:**
1. Client uploads WAV to R2 via presigned URL
2. Client POST `/api/jobs/convert` with R2 key
3. Worker picks job from BullMQ, runs FFmpeg
4. Result stored in R2, job marked done
5. Client polls or receives WebSocket notification

**App integration:**
- Export dialog: "Download as MP3" → upload → convert → download
- Optional: stem import for remix/sampling workflows

## Learning Outcomes

- WebSocket protocol and connection lifecycle
- Durable Objects stateful coordination
- Job queue patterns (BullMQ, retry, TTL, dead-letter)
- Presigned URL upload/download flow
- FFmpeg CLI for audio processing
- Multi-service architecture (Workers ↔ Fly.io ↔ R2)

## Constraints

- Phase 1 is Workers-only (no additional infra cost)
- Phase 2 requires a container runtime (Fly.io free tier sufficient for learning)
- Audio file size limit: 50MB per job
- Job TTL: 1 hour (auto-cleanup)
- No long-running processes on Workers — heavy work must go to container runtime
