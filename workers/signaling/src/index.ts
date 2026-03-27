/**
 * Cloudflare Workers + Durable Objects signaling server (ADR 019).
 *
 * 1:1 model — each room supports exactly one host + one guest.
 * Each room code maps to one DO instance, guaranteeing shared in-memory
 * state for all WebSocket connections in the same room.
 * Uses server.accept() (not Hibernation API) so addEventListener works.
 *
 * Security hardening (ADR 019 §Security):
 * - Room TTL: alarm-based expiry after 1h inactivity
 * - IP rate limiting: 5 failed joins / 10s → temporary block
 */

import { DurableObject } from 'cloudflare:workers'
import { nextAlarmTime, shouldDestroy } from './roomTtl.ts'
import {
  isRateLimited,
  recordFailedJoin,
  pruneExpired,
  type RateLimitEntry,
} from './rateLimit.ts'

// ── Types ────────────────────────────────────────────────────

interface Env {
  SIGNALING_ROOM: DurableObjectNamespace<SignalingRoom>
}

interface Peer {
  ws: WebSocket
  id: string
  name: string
}

// ── Durable Object: one per room ─────────────────────────────

export class SignalingRoom extends DurableObject<Env> {
  private peers = new Map<string, Peer>()
  private peerIdCounter = 0
  private lastActivity = Date.now()

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade')
    if (upgrade !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    // Touch activity and schedule/reschedule TTL alarm
    this.touchActivity()

    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)

    // Use server.accept() instead of this.ctx.acceptWebSocket()
    // so that addEventListener works normally
    server.accept()

    let peerId: string | null = null

    server.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)

        // First message must be 'join'
        if (!peerId) {
          if (msg.t !== 'join' || !msg.room) {
            server.close(4000, 'First message must be join with room code')
            return
          }

          // 1:1 model: reject if room already has 2 peers (host + guest)
          if (this.peers.size >= 2) {
            server.close(4001, 'Room is full')
            return
          }

          peerId = `p${++this.peerIdCounter}`
          const peerName = msg.name || 'Guest'

          // Notify existing peer (host)
          this.broadcast(peerId, JSON.stringify({
            t: 'peer-joined',
            id: peerId,
            name: peerName,
          }))

          // Add to room
          this.peers.set(peerId, { ws: server, id: peerId, name: peerName })
          this.touchActivity()
          return
        }

        // Forward signaling messages to other peers
        this.touchActivity()
        this.broadcast(peerId, ev.data as string)
      } catch {
        // Ignore malformed messages
      }
    })

    server.addEventListener('close', () => {
      if (peerId) this.removePeer(peerId)
    })

    server.addEventListener('error', () => {
      if (peerId) this.removePeer(peerId)
    })

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: corsHeaders(),
    })
  }

  /** Alarm handler — destroy room if TTL expired */
  async alarm(): Promise<void> {
    const now = Date.now()
    if (shouldDestroy(this.lastActivity, now)) {
      // Close all peer connections
      for (const [, peer] of this.peers) {
        try {
          peer.ws.close(4002, 'Room expired')
        } catch { /* already closed */ }
      }
      this.peers.clear()
      // DO will be garbage-collected with no active connections
    } else {
      // Activity happened since alarm was scheduled — reschedule
      this.ctx.storage.setAlarm(nextAlarmTime(this.lastActivity))
    }
  }

  private touchActivity() {
    this.lastActivity = Date.now()
    this.ctx.storage.setAlarm(nextAlarmTime(this.lastActivity))
  }

  private broadcast(senderId: string, data: string) {
    for (const [id, peer] of this.peers) {
      if (id !== senderId) {
        try {
          peer.ws.send(data)
        } catch {
          this.peers.delete(id)
        }
      }
    }
  }

  private removePeer(peerId: string) {
    this.peers.delete(peerId)
    this.broadcast(peerId, JSON.stringify({
      t: 'peer-left',
      id: peerId,
    }))
  }
}

// ── Worker entry: route to DO by room code ───────────────────

/** In-memory rate limit store (per Worker isolate) */
const rateLimitStore = new Map<string, RateLimitEntry>()

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    // WebSocket upgrade at /ws?room=XXXX
    if (url.pathname === '/ws') {
      const upgrade = request.headers.get('Upgrade')
      if (upgrade !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 })
      }

      const room = url.searchParams.get('room')
      if (!room) {
        return new Response('Missing ?room= parameter', { status: 400 })
      }

      // IP rate limiting (ADR 019 §Security)
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const now = Date.now()
      pruneExpired(rateLimitStore, now)

      if (isRateLimited(rateLimitStore, ip, now)) {
        return new Response('Too many requests', { status: 429, headers: corsHeaders() })
      }

      // Record as potential failed attempt — DO will close with 4001 if room is full,
      // but we count all attempts to prevent enumeration
      recordFailedJoin(rateLimitStore, ip, now)

      const roomId = env.SIGNALING_ROOM.idFromName(room.toUpperCase())
      const stub = env.SIGNALING_ROOM.get(roomId)
      return stub.fetch(request)
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok', { headers: corsHeaders() })
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() })
  },
}

// ── CORS ──────────────────────────────────────────────────────

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade',
  }
}
