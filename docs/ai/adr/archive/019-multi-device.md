# ADR 019: Multi-Device Collaboration

## Status: Implemented

## Context

inboil is a browser-based DAW accessible from any device via URL. This makes it a natural fit for multi-device collaboration — turn a friend's phone or a spare tablet into a live controller, all without installing anything.

With the mobile UI redesign (ADR 095), the mobile interface is now built around MobileTrackView (PO-style step sequencer), MobileMatrixView (pattern selector), MobileSceneRibbon (scene playback), PerfBubble (performance FX), and MobileParamOverlay (parameter knobs). These components map directly to guest controller functions, making mobile a natural controller device without any additional UI work.

### Use Cases

- **Self-jam**: Use your own phone as a controller while the desktop runs the full DAW — tap patterns, trigger FX, edit steps on the go
- **Live jam**: A friend opens the URL on their phone and joins as a guest controller
- **Multi-touch expansion**: Use a tablet as an FX pad controller while editing sequences on desktop
- **Live performance**: Multiple devices handle different parts for an improv session

## Proposed Design

### A. Connection Method: WebRTC

```
┌──────────────┐     WebRTC DataChannel     ┌──────────────┐
│   Host (PC)  │◄──────────────────────────►│  Guest (Phone)│
│  Full DAW UI │    low-latency P2P data    │  Controller   │
└──────────────┘                            └──────────────┘
```

- **Signaling**: Host generates a room code; guest enters it to connect
- **Data transport**: WebRTC DataChannel (low-latency, P2P, reliable/ordered)
- **Signaling server**: Cloudflare Workers WebSocket relay (used only during connection setup, stateless)
- **NAT traversal**: STUN servers (free public servers); TURN fallback only if needed

### B. Architecture

```
Host Device (Authority)
├── AudioContext + WASM Engine (audio generation)
├── Song State (authoritative)
├── Connection Manager
│   └── WebRTC peer connections
└── State Sync (snapshot + delta broadcast)

Guest Device (Controller)
├── Mobile UI (ADR 095 — already built)
│   ├── MobileTrackView  → trig/velocity/chance edits
│   ├── MobileMatrixView → pattern selection
│   ├── MobileSceneRibbon → scene play/stop
│   ├── PerfBubble       → fill/reverse/break
│   └── MobileParamOverlay → param knob edits
├── Connection Client
│   └── WebRTC data channel
└── Local State (mirror from host)
```

**Host-guest model:**
- **Host**: One device holds authority over the audio engine and song state
- **Guest**: Sends control inputs, receives state mirror
- Audio generation runs on host only — guests function as controllers
- Guest UI is the standard mobile UI (ADR 095) with a connection indicator

### C. Message Protocol

```typescript
// Guest → Host (control inputs — fire and forget)
type GuestMessage =
  | { t: 'trig'; track: number; step: number; on: boolean }
  | { t: 'vel'; track: number; step: number; v: number }
  | { t: 'chance'; track: number; step: number; v: number }
  | { t: 'param'; track: number; key: string; v: number }
  | { t: 'perf'; action: 'fill' | 'reverse' | 'break'; on: boolean }
  | { t: 'transport'; action: 'play' | 'stop' | 'scene-play' | 'scene-stop' }
  | { t: 'pattern'; index: number }
  | { t: 'mute'; track: number; muted: boolean }
  | { t: 'solo'; track: number }
  | { t: 'fxpad'; x: number; y: number }

// Host → Guest (state sync)
type HostMessage =
  | { t: 'snapshot'; song: Song; playback: PlaybackState }
  | { t: 'delta'; patches: JsonPatch[] }
  | { t: 'playhead'; heads: number[]; playing: boolean; pattern: number | null }
```

- **Control messages**: Minimal, short key names to reduce payload
- **Snapshot**: Full song state on initial connect
- **Delta**: JSON Patch (RFC 6902) for incremental updates — only changed fields
- **Playhead**: High frequency (per step, ~8–16 Hz at 120 BPM) but tiny payload (~50 bytes)

### D. Guest Mode Integration with Mobile UI

The mobile UI (ADR 095) serves double duty:

| Mobile Component | Solo Mode | Guest Mode |
|---|---|---|
| `MobileTrackView` | Edits local state directly | Sends trig/vel/chance messages to host |
| `MobileMatrixView` | Calls `selectPattern()` | Sends `pattern` message to host |
| `MobileSceneRibbon` | Controls local playback | Sends `transport` message to host |
| `PerfBubble` | Toggles local perf state | Sends `perf` message to host |
| `MobileParamOverlay` | Edits local params | Sends `param` messages to host |

Implementation: A thin abstraction layer intercepts state mutations when `session.role === 'guest'` and routes them as messages instead of local state changes.

```typescript
// lib/multiDevice.ts
export function guestAction(msg: GuestMessage): void {
  if (session.role !== 'guest' || !session.channel) return
  session.channel.send(JSON.stringify(msg))
}

// In components, wrap mutations:
function toggleTrigGuest(track: number, step: number, on: boolean) {
  if (session.role === 'guest') {
    guestAction({ t: 'trig', track, step, on })
  } else {
    toggleTrig(track, step)
  }
}
```

### E. Connection Flow

```
Host                              Guest
  │                                 │
  ├─ [SYSTEM] → "HOST SESSION" ──► │
  │  Display room code: "A3F7KN2X" │
  │                                 │
  │                Enter room code ◄─┤
  │                or scan QR code   │
  │                                 │
  ├─ WebRTC signaling (via CF) ───►│
  │◄──────────────── signaling ─────┤
  │                                 │
  ├─ P2P DataChannel established ──►│
  │                                 │
  ├─ Snapshot (full song state) ──►│
  │                                 │
  │◄──────── control messages ──────┤
  ├─── delta patches ─────────────►│
  ├─── playhead updates ──────────►│
```

- Host starts session from System settings panel
- 8-character room code displayed (+ QR code)
- Guest enters code or scans QR → connects via signaling server
- After P2P established, host sends full snapshot
- Ongoing: guest sends control events, host broadcasts deltas + playheads

### F. State Extension

```typescript
// Addition to state.svelte.ts
interface SessionState {
  role: 'solo' | 'host' | 'guest'
  roomCode: string | null
  peers: { id: string; name: string }[]
  connected: boolean
  channel: RTCDataChannel | null
}

export const session = $state<SessionState>({
  role: 'solo',
  roomCode: null,
  peers: [],
  connected: false,
  channel: null,
})
```

### G. Signaling Server

Minimal Cloudflare Workers WebSocket relay:

```
Client A ──ws──► Worker ──ws──► Client B
                 (relay)
```

- Stateless relay: forwards signaling messages between peers in the same room
- Room management: in-memory Map (Durable Objects if persistence needed)
- No media relay — only SDP offer/answer/ICE candidates (~1KB each)
- Auto-cleanup: rooms expire after 1 hour of inactivity

### H. Latency Considerations

| Scenario | Expected Latency | Suitability |
|---|---|---|
| WebRTC (same WiFi) | 1–5ms | Real-time step/pad input |
| WebRTC (LAN, wired+WiFi) | 2–10ms | All use cases |
| WebRTC (Internet, same region) | 20–80ms | Step editing, pattern switching |
| WebRTC (Internet, cross-region) | 50–200ms | Non-realtime edits only |

- Audio runs on host only — guest latency only affects control input responsiveness
- Playhead sync is cosmetic (visual feedback) — slight drift is acceptable

## Implementation Order

1. **Signaling server**: Cloudflare Workers WebSocket relay with room codes
2. **WebRTC connection**: P2P DataChannel setup, connection/reconnection handling
3. **Host mode**: Start session from System settings, room code + QR display
4. **Snapshot sync**: Host sends full song state on connect
5. **Guest mode**: Mobile UI reads mirrored state, sends control messages
6. **Delta sync**: JSON Patch broadcast on host state changes
7. **Playhead sync**: Step position broadcast at beat boundaries
8. **Polish**: Connection status UI, reconnection, error handling

## Consequences

- **Positive**: Multi-device jam with just a URL — zero install barrier
- **Positive**: Mobile UI (ADR 095) doubles as controller UI — no extra UI work
- **Positive**: Host-guest model keeps state management simple (single authority)
- **Positive**: WebRTC P2P provides low latency with minimal server cost (signaling only)
- **Positive**: Makes the mobile version feel unique and purposeful, not just a shrunken desktop
- **Negative**: Signaling server required (but stateless, near-zero cost on CF Workers)
- **Negative**: NAT traversal can fail in restrictive networks (TURN fallback adds complexity)
- **Negative**: Concurrent edits from multiple guests need ordering (host applies in arrival order)
- **Dependency**: ADR 095 (Mobile UI Redesign) — guest UI is the mobile UI

## Security Hardening (2026-03)

### Decision: Public signaling with server-side rate limiting

Two approaches were evaluated to address the room code brute-force risk (6-char code = ~30-bit entropy, no rate limit):

**Option A — Local network only (mDNS / local candidates):**
Eliminate the public signaling server entirely by restricting discovery to the local network. Rejected because mDNS is not accessible from browser Web APIs — it requires native platform access (Electron/Tauri). As a pure web app, inboil cannot implement local device discovery without abandoning the zero-install browser model.

**Option B — Harden public signaling (adopted):**
Keep the existing Cloudflare Workers signaling server and add:

1. **Room code TTL** — Durable Object self-destructs after 1 hour of inactivity via `alarm()` API. Stale rooms are no longer connectable. (Spec'd in ADR 019 §G but was not implemented)
2. **IP-based rate limiting** — 5 failed join attempts per IP within 10 seconds triggers a temporary block. Prevents brute-force enumeration of room codes
3. **Code length extension** — 6 → 8 characters (30-bit → 40-bit entropy, ~1 trillion combinations). Combined with rate limiting, brute-force becomes computationally infeasible

### Rationale

The threat model is modest: rooms are 1:1 (host + guest), contain no secret data (just control messages), and are intended for same-network use (self-jam, local jam sessions). Option B provides defense-in-depth proportional to the risk without architectural disruption. Option A would require a fundamentally different technology stack for a marginal security gain in this context.
