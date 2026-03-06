# ADR 019: Multi-Device Collaboration

## Status: Proposed

## Context

inboil is a browser-based DAW accessible from any device via URL. This makes it a natural fit for multi-device collaboration — turn a friend's phone or a spare tablet into a live controller, all without installing anything.

### Use Cases

- **Live jam**: A friend plays drum pads on their phone while you sequence synths on PC
- **Multi-touch expansion**: Use a tablet as an FX pad controller while editing sequences on desktop
- **Live performance**: Multiple devices handle different parts for an improv session

## Proposed Design

### A. Connection Methods

Two connection methods supported:

#### 1. WebRTC (LAN / Internet)

```
┌──────────────┐     WebRTC DataChannel     ┌──────────────┐
│   Host (PC)  │◄──────────────────────────►│  Guest (Phone)│
│  Full DAW UI │    low-latency P2P data    │  Controller   │
└──────────────┘                            └──────────────┘
```

- **Signaling**: Host generates a room code; guest enters it to connect
- **Data transport**: WebRTC DataChannel (low-latency, P2P)
- **Pros**: NAT traversal, works over internet
- **Signaling server**: Lightweight WebSocket server or serverless (used only during connection setup)

#### 2. Web Bluetooth (Short Range)

```
┌──────────────┐     BLE GATT      ┌──────────────┐
│   Host (PC)  │◄─────────────────►│  Guest (Phone)│
│  Full DAW UI │   MIDI-like msgs  │  Controller   │
└──────────────┘                   └──────────────┘
```

- **Protocol**: Web Bluetooth API (BLE GATT)
- **Pros**: No network required, ultra-low latency
- **Limitations**: Browser support is limited (Chrome-based only), range-limited

### B. Architecture

```
Host Device (Authority)
├── AudioContext + WASM Engine (audio generation)
├── Pattern State (authoritative state)
├── Connection Manager
│   ├── WebRTC peer connections
│   └── BLE GATT server
└── State Sync (delta broadcast)

Guest Device (Controller)
├── Controller UI (touch-optimized)
├── Connection Client
│   ├── WebRTC data channel
│   └── BLE GATT client
└── Local State (mirror from host)
```

**Host-guest model:**
- **Host**: One device holds authority over the audio engine and pattern state
- **Guest**: Sends control inputs, receives state mirror
- Audio generation runs on host only — guests function as controllers

### C. Message Protocol

```typescript
// Guest → Host (control)
type GuestMessage =
  | { type: 'trig'; track: number; step: number; on: boolean }
  | { type: 'velocity'; track: number; step: number; value: number }
  | { type: 'param'; track: number; key: string; value: number }
  | { type: 'perf'; action: 'fill' | 'reverse' | 'break'; active: boolean }
  | { type: 'transport'; action: 'play' | 'stop' }
  | { type: 'fxpad'; nodeId: string; x: number; y: number }

// Host → Guest (state sync)
type HostMessage =
  | { type: 'state'; pattern: Pattern; playheads: number[] }
  | { type: 'delta'; path: string; value: unknown }
  | { type: 'playhead'; heads: number[] }
```

- **Control messages**: Minimal data (events only)
- **State sync**: Full state on initial connect, deltas thereafter (JSON Patch or custom delta)
- **Playhead sync**: High frequency (per step) but tiny payload

### D. Guest UI (Controller Mode)

Guest devices show a touch-optimized controller UI instead of the full DAW:

```
┌─────────────────────────────┐
│  inboil  GUEST  ●connected  │
├─────────────────────────────┤
│                             │
│   ┌─────┐ ┌─────┐ ┌─────┐  │
│   │KICK │ │SNARE│ │CLAP │  │
│   └─────┘ └─────┘ └─────┘  │
│   ┌─────┐ ┌─────┐ ┌─────┐  │
│   │C.HH │ │O.HH │ │ CYM │  │
│   └─────┘ └─────┘ └─────┘  │
│                             │
│   ┌───────────────────────┐ │
│   │      FX PAD           │ │
│   │                       │ │
│   └───────────────────────┘ │
│                             │
│   [FILL] [REV] [BRK]       │
└─────────────────────────────┘
```

Guest view modes (switchable):
- **Drum Pad**: Per-track pads for real-time triggering
- **FX Controller**: Touch-based FX pad
- **Step Editor**: Edit steps for a specific track
- **Performance**: FILL / REV / BRK buttons

### E. Connection Flow

```
Host                              Guest
  │                                 │
  ├─ [SYSTEM] → "HOST SESSION" ──► │
  │  Display room code: "A3F7"     │
  │                                 │
  │                Enter room code ◄─┤
  │                or scan QR code   │
  │                                 │
  ├─ WebRTC signaling ────────────► │
  │◄──────────────── signaling ─────┤
  │                                 │
  ├─ P2P DataChannel established ──►│
  │                                 │
  ├─ Full state sync ─────────────►│
  │                                 │
  │◄──────── control messages ──────┤
  ├─── state deltas ──────────────►│
```

- Host starts "HOST SESSION" from SYSTEM settings
- Connect via 4-character room code or QR code
- After connection, host syncs full state to guest

### F. State Extension

```typescript
// Addition to state.svelte.ts
interface SessionState {
  role: 'solo' | 'host' | 'guest'
  roomCode: string | null
  peers: { id: string; name: string }[]
  connected: boolean
}

export const session = $state<SessionState>({
  role: 'solo',
  roomCode: null,
  peers: [],
  connected: false,
})
```

### G. Latency Considerations

| Connection | Expected Latency | Use Case |
|-----------|-----------------|----------|
| WebRTC (LAN) | 1–5ms | Real-time jam |
| WebRTC (Internet) | 20–100ms | Remote collaboration |
| Web Bluetooth | 5–20ms | Close-range performance |

- Real-time drum pad input: LAN or BLE recommended
- Step editing and param changes: Any connection method works
- Audio runs on host only, so guest audio latency is not a concern

## Implementation Order

1. **Connection foundation**: WebRTC DataChannel P2P (including signaling server)
2. **Message protocol**: Define and implement control/sync messages
3. **Host mode**: Start session from SYSTEM settings, room code generation
4. **Guest mode**: Room code entry, connection, controller UI
5. **State sync**: Full initial sync + delta broadcast
6. **Guest UI**: Drum pad, FX controller views
7. **Web Bluetooth**: Add BLE connection support
8. **QR code**: QR generation/scanning for easy connect

## Consequences

- **Positive:** Multi-device collaboration with just a browser — no install needed
- **Positive:** Turn any friend's phone into an instrument — extremely low barrier to jam
- **Positive:** Host-guest model keeps state management simple
- **Positive:** WebRTC P2P provides low latency with minimal server cost
- **Negative:** Signaling server required (connection setup only)
- **Negative:** Web Bluetooth browser support is limited
- **Negative:** Network quality affects real-time responsiveness
- **Negative:** Concurrent edits from multiple guests require conflict resolution
- **Dependency:** ADR 018 (Settings Panel) — UI for host/guest settings
