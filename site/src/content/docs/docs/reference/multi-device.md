---
title: Multi-Device Jam
description: Use your phone as a live controller via WebRTC.
sidebar:
  order: 3
---

Turn any phone or tablet into a real-time controller for INBOIL. No app install — just open the URL and enter a room code.

## How It Works

INBOIL uses **WebRTC DataChannel** for peer-to-peer communication between two devices. One device acts as the **host** (runs audio and holds state), and the other joins as a **guest** (controller-only, no audio).

```
┌──────────────┐     WebRTC P2P      ┌──────────────┐
│   Host (PC)  │◄───────────────────►│ Guest (Phone) │
│  Audio + DAW │   low-latency data  │  Controller   │
└──────────────┘                     └──────────────┘
```

## Starting a Session

### Host (PC)

1. Open **SYSTEM** panel (sidebar)
2. Under **JAM SESSION**, tap **HOST**
3. A 4-character room code appears (e.g. `A3F7`)
4. Share the code with your jam partner

### Guest (Phone/Tablet)

1. Open INBOIL in your mobile browser
2. Open **SYSTEM** → **JAM SESSION**
3. Enter the room code and tap **JOIN**
4. The connection establishes via WebRTC — your screen mirrors the host's state

## What the Guest Can Do

| Action | How |
|--------|-----|
| Toggle steps | Tap on the step grid |
| Change velocity / chance | Switch to VEL/CHNC mode and drag |
| Mute / Solo tracks | Tap M or S buttons |
| Switch patterns | Use the pattern selector |
| FILL / REV / BRK | Hold performance buttons |
| Tweak parameters | Turn knobs in the dock |
| Play / Stop | Transport controls |

All changes are sent to the host instantly and reflected on both screens.

## Architecture

- **Audio only plays on the host** — the guest device is a controller
- The host sends a full **state snapshot** when the guest connects
- Ongoing changes are synced as **JSON Patch deltas** (minimal bandwidth)
- **Playhead position** is broadcast every step for visual sync
- **1:1 model** — one host, one guest per room

## Network Requirements

| Scenario | Latency | Suitability |
|----------|---------|-------------|
| Same WiFi | 1–5 ms | All controls, real-time |
| LAN (wired + WiFi) | 2–10 ms | All controls |
| Internet (same region) | 20–80 ms | Step editing, pattern switching |
| Internet (cross-region) | 50–200 ms | Non-realtime edits |

The connection uses public STUN servers for NAT traversal. Both devices must be able to establish a WebRTC peer connection.

## Tips

- For the best experience, use the **same WiFi network**
- The guest UI automatically uses the mobile layout — optimized for touch
- If the connection drops, the guest can rejoin with the same room code
- Tap **DISCONNECT** in the SYSTEM panel to end the session
