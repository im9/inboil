/**
 * WebRTC connection manager for multi-device collaboration (ADR 019).
 *
 * 1:1 model — one host, one guest per room.
 * Host: creates a room, accepts a single peer connection, sends state.
 * Guest: joins a room, sends control messages, receives state mirror.
 */

import { session } from '../state.svelte.ts'
import type { GuestMessage, HostMessage, SignalMessage } from './protocol.ts'
import { encodeMsg, decodeGuestMsg, decodeHostMsg } from './protocol.ts'
import { ChunkReassembler, sendChunked } from './chunking.ts'

// ── Configuration ─────────────────────────────────────────────

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const CHANNEL_LABEL = 'inboil'
const RECONNECT_DELAY = 2000
const MAX_RECONNECT_ATTEMPTS = 5

// ── Room code generation ──────────────────────────────────────

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 to avoid confusion
  let code = ''
  const arr = crypto.getRandomValues(new Uint8Array(8)) // 8 chars = ~40-bit entropy (ADR 019 §Security)
  for (let i = 0; i < 8; i++) code += chars[arr[i] % chars.length]
  return code
}

// ── Signaling WebSocket ───────────────────────────────────────

let signalingWs: WebSocket | null = null
let signalingUrl = '' // set by init or env
let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let intentionalDisconnect = false

export function setSignalingUrl(url: string) {
  signalingUrl = url
}

function connectSignaling(room: string, name: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (!signalingUrl) {
      reject(new Error('Signaling URL not configured'))
      return
    }
    const wsUrl = `${signalingUrl}?room=${encodeURIComponent(room.toUpperCase())}`
    const ws = new WebSocket(wsUrl)
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Signaling connection timeout'))
    }, 10000)
    ws.onopen = () => {
      clearTimeout(timeout)
      const msg: SignalMessage = { t: 'join', room, name }
      ws.send(JSON.stringify(msg))
      reconnectAttempts = 0
      resolve(ws)
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('Signaling connection failed'))
    }
  })
}

function sendSignal(msg: SignalMessage) {
  if (signalingWs?.readyState === WebSocket.OPEN) {
    signalingWs.send(JSON.stringify(msg))
  }
}

// ── Signaling reconnection ────────────────────────────────────

function scheduleReconnect() {
  if (intentionalDisconnect || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      session.connected = false
      emitError('Signaling server unreachable')
    }
    return
  }
  reconnectAttempts++
  reconnectTimer = setTimeout(async () => {
    if (intentionalDisconnect || !session.roomCode) return
    try {
      signalingWs = await connectSignaling(session.roomCode, session.role === 'host' ? 'host' : 'guest')
      if (session.role === 'host') {
        setupHostSignaling()
      } else {
        setupGuestSignaling()
      }
    } catch {
      scheduleReconnect()
    }
  }, RECONNECT_DELAY * reconnectAttempts)
}

// ── Error event ───────────────────────────────────────────────

let onError: ((msg: string) => void) | null = null

export function setOnError(handler: (msg: string) => void) {
  onError = handler
}

function emitError(msg: string) {
  onError?.(msg)
}

// ── Host ──────────────────────────────────────────────────────

interface PeerConnection {
  id: string
  name: string
  pc: RTCPeerConnection
  channel: RTCDataChannel | null
}

let hostPeer: PeerConnection | null = null
let onGuestMessage: ((msg: GuestMessage) => void) | null = null
let onGuestConnected: (() => void) | null = null

export function setOnGuestMessage(handler: (msg: GuestMessage) => void) {
  onGuestMessage = handler
}

export function setOnGuestConnected(handler: () => void) {
  onGuestConnected = handler
}

function setupHostSignaling() {
  if (!signalingWs) return
  signalingWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as SignalMessage

      if (msg.t === 'peer-joined') {
        handlePeerJoined(msg.id, msg.name).catch(e => emitError(`Peer join failed: ${e}`))
      } else if (msg.t === 'answer') {
        handleAnswer(msg.sdp).catch(e => emitError(`Answer failed: ${e}`))
      } else if (msg.t === 'ice') {
        handleRemoteIce(msg.candidate).catch(e => emitError(`ICE failed: ${e}`))
      } else if (msg.t === 'peer-left') {
        handlePeerLeft()
      }
    } catch {
      // Ignore malformed signaling messages
    }
  }
  signalingWs.onclose = () => {
    if (!intentionalDisconnect) scheduleReconnect()
  }
}

export async function startHost(): Promise<string> {
  intentionalDisconnect = false
  const roomCode = generateRoomCode()

  session.role = 'host'
  session.roomCode = roomCode
  session.connected = true
  hostPeer = null

  signalingWs = await connectSignaling(roomCode, 'host')
  setupHostSignaling()

  return roomCode
}

async function handlePeerJoined(peerId: string, peerName: string) {
  // 1:1 model: disconnect existing guest before accepting new one
  if (hostPeer) {
    hostPeer.channel?.close()
    hostPeer.pc.close()
    hostPeer = null
  }

  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS })

  const channel = pc.createDataChannel(CHANNEL_LABEL, {
    ordered: true,
  })

  hostPeer = { id: peerId, name: peerName, pc, channel }
  session.peers = [{ id: peerId, name: peerName }]

  channel.onopen = () => {
    onGuestConnected?.()
  }

  channel.onmessage = (ev) => {
    receiveChunked(channel, ev.data as string, (data) => {
      const msg = decodeGuestMsg(data)
      if (msg && onGuestMessage) {
        onGuestMessage(msg)
      }
    })
  }

  channel.onclose = () => {
    reassembler.cleanup(channel)  // ADR 100 §4
    handlePeerLeft()
  }

  // Monitor ICE connection state
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      emitError(`Connection to ${peerName} failed`)
      handlePeerLeft()
    }
  }

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      sendSignal({ t: 'ice', candidate: ev.candidate.toJSON() })
    }
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  sendSignal({ t: 'offer', sdp: offer.sdp! })
}

async function handleAnswer(sdp: string) {
  if (!hostPeer) return
  await hostPeer.pc.setRemoteDescription({ type: 'answer', sdp })
}

async function handleRemoteIce(candidate: RTCIceCandidateInit) {
  if (!hostPeer) return
  await hostPeer.pc.addIceCandidate(candidate)
}

function handlePeerLeft() {
  if (hostPeer) {
    hostPeer.pc.close()
    hostPeer = null
    session.peers = []
  }
}

// ── Chunked send/receive (ADR 100) ───────────────────────────
// Logic extracted to chunking.ts for testability

const reassembler = new ChunkReassembler()

function receiveChunked(channel: RTCDataChannel, raw: string, onComplete: (data: string) => void) {
  reassembler.receive(channel, raw, onComplete)
}

/** Send a host message to the connected guest. */
export function sendToGuest(msg: HostMessage) {
  if (hostPeer?.channel?.readyState === 'open') {
    sendChunked(hostPeer.channel, encodeMsg(msg))
  }
}

// ── Guest ─────────────────────────────────────────────────────

let guestPc: RTCPeerConnection | null = null
let guestChannel: RTCDataChannel | null = null
let onHostMessage: ((msg: HostMessage) => void) | null = null

export function setOnHostMessage(handler: (msg: HostMessage) => void) {
  onHostMessage = handler
}

function setupGuestSignaling() {
  if (!signalingWs) return
  signalingWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as SignalMessage
      if (msg.t === 'offer') {
        handleOffer(msg.sdp).catch(e => emitError(`Offer handling failed: ${e}`))
      } else if (msg.t === 'ice') {
        handleGuestIce(msg.candidate).catch(e => emitError(`ICE failed: ${e}`))
      }
    } catch {
      // Ignore malformed signaling messages
    }
  }
  signalingWs.onclose = () => {
    if (!intentionalDisconnect) scheduleReconnect()
  }
}

export async function joinAsGuest(roomCode: string, name: string): Promise<void> {
  intentionalDisconnect = false
  session.role = 'guest'
  session.roomCode = roomCode

  signalingWs = await connectSignaling(roomCode, name)
  setupGuestSignaling()
}

async function handleOffer(sdp: string) {
  guestPc = new RTCPeerConnection({ iceServers: STUN_SERVERS })

  guestPc.ondatachannel = (ev) => {
    guestChannel = ev.channel

    guestChannel.onopen = () => {
      session.connected = true
    }

    guestChannel.onmessage = (ev) => {
      receiveChunked(guestChannel!, ev.data as string, (data) => {
        const msg = decodeHostMsg(data)
        if (msg && onHostMessage) {
          onHostMessage(msg)
        }
      })
    }

    guestChannel.onclose = () => {
      reassembler.cleanup(guestChannel!)  // ADR 100 §4
      session.connected = false
    }
  }

  // Monitor ICE connection state
  guestPc.onconnectionstatechange = () => {
    if (guestPc?.connectionState === 'failed') {
      session.connected = false
      emitError('Connection to host lost')
    }
  }

  guestPc.onicecandidate = (ev) => {
    if (ev.candidate) {
      sendSignal({ t: 'ice', candidate: ev.candidate.toJSON() })
    }
  }

  await guestPc.setRemoteDescription({ type: 'offer', sdp })
  const answer = await guestPc.createAnswer()
  await guestPc.setLocalDescription(answer)
  sendSignal({ t: 'answer', sdp: answer.sdp! })
}

async function handleGuestIce(candidate: RTCIceCandidateInit) {
  if (guestPc) {
    await guestPc.addIceCandidate(candidate)
  }
}

/** Send a control message from guest to host. */
export function sendToHost(msg: GuestMessage) {
  if (guestChannel?.readyState === 'open') {
    guestChannel.send(encodeMsg(msg))
  }
}

// ── Cleanup ───────────────────────────────────────────────────

export function disconnect() {
  intentionalDisconnect = true

  // Cancel pending reconnect
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  reconnectAttempts = 0

  // Close host peer connection
  if (hostPeer) {
    if (hostPeer.channel) reassembler.cleanup(hostPeer.channel)
    hostPeer.channel?.close()
    hostPeer.pc.close()
    hostPeer = null
  }

  // Close guest connection
  if (guestChannel) reassembler.cleanup(guestChannel)
  guestChannel?.close()
  guestPc?.close()
  guestChannel = null
  guestPc = null

  // Close signaling
  signalingWs?.close()
  signalingWs = null

  // Reset session state
  session.role = 'solo'
  session.roomCode = null
  session.peers = []
  session.connected = false

  onGuestMessage = null
  onGuestConnected = null
  onHostMessage = null
  onError = null
}
