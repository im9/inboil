/**
 * Cloudflare Workers signaling server for inboil multi-device (ADR 019).
 *
 * In-memory WebSocket relay — no Durable Objects, runs on free tier.
 * Rooms are ephemeral (lost on worker restart), which is fine since
 * signaling is only needed for the few seconds of WebRTC handshake.
 */

// ── In-memory room state ─────────────────────────────────────

interface Peer {
  ws: WebSocket
  id: string
  name: string
}

const rooms = new Map<string, Map<string, Peer>>()
let peerIdCounter = 0

function getOrCreateRoom(code: string): Map<string, Peer> {
  const key = code.toUpperCase()
  let room = rooms.get(key)
  if (!room) {
    room = new Map()
    rooms.set(key, room)
  }
  return room
}

function cleanupRoom(code: string) {
  const key = code.toUpperCase()
  const room = rooms.get(key)
  if (room && room.size === 0) {
    rooms.delete(key)
  }
}

function broadcast(room: Map<string, Peer>, senderId: string, data: string) {
  for (const [id, peer] of room) {
    if (id !== senderId) {
      try {
        peer.ws.send(data)
      } catch {
        room.delete(id)
      }
    }
  }
}

// ── Worker entry ─────────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    // WebSocket upgrade at /ws
    if (url.pathname === '/ws') {
      const upgrade = request.headers.get('Upgrade')
      if (upgrade !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 })
      }

      const [client, server] = Object.values(new WebSocketPair())
      server.accept()

      let roomCode: string | null = null
      let peerId: string | null = null

      server.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data as string)

          // First message must be 'join' with room code
          if (!roomCode) {
            if (msg.t !== 'join' || !msg.room) {
              server.close(4000, 'First message must be join with room code')
              return
            }

            roomCode = msg.room.toUpperCase()
            peerId = `p${++peerIdCounter}`
            const peerName = msg.name || 'Guest'
            const room = getOrCreateRoom(roomCode)

            // Notify existing peers about the new peer
            broadcast(room, peerId, JSON.stringify({
              t: 'peer-joined',
              id: peerId,
              name: peerName,
            }))

            // Add to room
            room.set(peerId, { ws: server, id: peerId, name: peerName })
            return
          }

          // Forward signaling messages (offer/answer/ice) to other peers
          const room = rooms.get(roomCode)
          if (room && peerId) {
            broadcast(room, peerId, ev.data as string)
          }
        } catch {
          // Ignore malformed messages
        }
      })

      server.addEventListener('close', () => {
        if (roomCode && peerId) {
          const room = rooms.get(roomCode)
          if (room) {
            room.delete(peerId)
            broadcast(room, peerId, JSON.stringify({
              t: 'peer-left',
              id: peerId,
            }))
            cleanupRoom(roomCode)
          }
        }
      })

      server.addEventListener('error', () => {
        if (roomCode && peerId) {
          const room = rooms.get(roomCode)
          if (room) {
            room.delete(peerId)
            cleanupRoom(roomCode)
          }
        }
      })

      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: corsHeaders(),
      })
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
