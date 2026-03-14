/**
 * Cloudflare Workers signaling server for inboil multi-device (ADR 019).
 *
 * Stateless WebSocket relay using Durable Objects for room isolation.
 * Only used during WebRTC connection setup — no media or data relay.
 */

export interface Env {
  ROOMS: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      })
    }

    // WebSocket upgrade at /ws
    if (url.pathname === '/ws') {
      const upgrade = request.headers.get('Upgrade')
      if (upgrade !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 })
      }

      // Create a temporary holding WebSocket pair.
      // The client connects here first, sends a 'join' message with the room code,
      // then we forward to the appropriate Durable Object.
      const [client, server] = Object.values(new WebSocketPair())

      server.accept()

      // Wait for the first message to determine the room
      server.addEventListener('message', async function handler(ev) {
        server.removeEventListener('message', handler)

        try {
          const msg = JSON.parse(ev.data as string)
          if (msg.t !== 'join' || !msg.room) {
            server.close(4000, 'First message must be join with room code')
            return
          }

          // Get or create the Durable Object for this room
          const roomId = env.ROOMS.idFromName(msg.room.toUpperCase())
          const room = env.ROOMS.get(roomId)

          // Forward to Durable Object — pass the join info as query params
          const doUrl = new URL(request.url)
          doUrl.searchParams.set('name', msg.name || 'Guest')

          const doRequest = new Request(doUrl.toString(), {
            headers: { Upgrade: 'websocket' },
          })

          const doResponse = await room.fetch(doRequest)
          const doWs = doResponse.webSocket
          if (!doWs) {
            server.close(4001, 'Failed to connect to room')
            return
          }

          doWs.accept()

          // Send the join message to the DO as well
          doWs.send(ev.data as string)

          // Bridge the two WebSockets
          server.addEventListener('message', (e) => {
            if (doWs.readyState === WebSocket.READY_STATE_OPEN) {
              doWs.send(e.data as string)
            }
          })
          doWs.addEventListener('message', (e) => {
            if (server.readyState === WebSocket.READY_STATE_OPEN) {
              server.send(e.data as string)
            }
          })
          server.addEventListener('close', () => doWs.close())
          doWs.addEventListener('close', () => server.close())

        } catch {
          server.close(4002, 'Invalid message')
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

// ── Durable Object: one per room ──────────────────────────────

interface Peer {
  ws: WebSocket
  id: string
  name: string
}

let peerIdCounter = 0

export class SignalingRoom {
  private peers: Map<string, Peer> = new Map()
  private state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade')
    if (upgrade !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const [client, server] = Object.values(new WebSocketPair())
    server.accept()

    const peerId = `p${++peerIdCounter}`
    let peerName = new URL(request.url).searchParams.get('name') || 'Guest'

    server.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)

        if (msg.t === 'join') {
          peerName = msg.name || peerName
          const peer: Peer = { ws: server, id: peerId, name: peerName }
          this.peers.set(peerId, peer)

          // Notify existing peers about the new peer
          this.broadcast(peerId, JSON.stringify({
            t: 'peer-joined',
            id: peerId,
            name: peerName,
          }))
          return
        }

        // Forward signaling messages (offer/answer/ice) to other peers
        this.broadcast(peerId, ev.data as string)

      } catch {
        // Ignore malformed messages
      }
    })

    server.addEventListener('close', () => {
      this.peers.delete(peerId)
      this.broadcast(peerId, JSON.stringify({
        t: 'peer-left',
        id: peerId,
      }))
    })

    server.addEventListener('error', () => {
      this.peers.delete(peerId)
    })

    return new Response(null, { status: 101, webSocket: client })
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
}

// ── CORS ──────────────────────────────────────────────────────

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Upgrade',
  }
}
