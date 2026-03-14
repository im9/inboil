/**
 * WebRTC connection manager for multi-device collaboration (ADR 019).
 *
 * Host: creates a room, accepts peer connections, broadcasts state.
 * Guest: joins a room, sends control messages, receives state mirror.
 */

import { session } from '../state.svelte.ts'
import type { GuestMessage, HostMessage, SignalMessage } from './protocol.ts'
import { encodeMsg, decodeGuestMsg, decodeHostMsg } from './protocol.ts'

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
  const arr = crypto.getRandomValues(new Uint8Array(4))
  for (let i = 0; i < 4; i++) code += chars[arr[i] % chars.length]
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
    const ws = new WebSocket(signalingUrl)
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

let hostPeers: PeerConnection[] = []
let onGuestMessage: ((peerId: string, msg: GuestMessage) => void) | null = null
let onGuestConnected: ((peerId: string) => void) | null = null

export function setOnGuestMessage(handler: (peerId: string, msg: GuestMessage) => void) {
  onGuestMessage = handler
}

export function setOnGuestConnected(handler: (peerId: string) => void) {
  onGuestConnected = handler
}

function setupHostSignaling() {
  if (!signalingWs) return
  signalingWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as SignalMessage
      if (msg.t === 'peer-joined') {
        handlePeerJoined(msg.id, msg.name)
      } else if (msg.t === 'answer') {
        handleAnswer(msg.sdp)
      } else if (msg.t === 'ice') {
        handleRemoteIce(msg.candidate)
      } else if (msg.t === 'peer-left') {
        handlePeerLeft(msg.id)
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
  hostPeers = []

  signalingWs = await connectSignaling(roomCode, 'host')
  setupHostSignaling()

  return roomCode
}

async function handlePeerJoined(peerId: string, peerName: string) {
  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS })

  const channel = pc.createDataChannel(CHANNEL_LABEL, {
    ordered: true,
  })

  const peer: PeerConnection = { id: peerId, name: peerName, pc, channel }
  hostPeers.push(peer)
  session.peers = hostPeers.map(p => ({ id: p.id, name: p.name }))

  channel.onopen = () => {
    onGuestConnected?.(peerId)
  }

  channel.onmessage = (ev) => {
    const msg = decodeGuestMsg(ev.data)
    if (msg && onGuestMessage) {
      onGuestMessage(peerId, msg)
    }
  }

  channel.onclose = () => {
    handlePeerLeft(peerId)
  }

  // Monitor ICE connection state
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      emitError(`Connection to ${peerName} failed`)
      handlePeerLeft(peerId)
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
  // Apply to the most recently created peer (signaling is sequential)
  const peer = hostPeers[hostPeers.length - 1]
  if (!peer) return
  await peer.pc.setRemoteDescription({ type: 'answer', sdp })
}

async function handleRemoteIce(candidate: RTCIceCandidateInit) {
  const peer = hostPeers[hostPeers.length - 1]
  if (!peer) return
  await peer.pc.addIceCandidate(candidate)
}

function handlePeerLeft(peerId: string) {
  const idx = hostPeers.findIndex(p => p.id === peerId)
  if (idx >= 0) {
    hostPeers[idx].pc.close()
    hostPeers.splice(idx, 1)
    session.peers = hostPeers.map(p => ({ id: p.id, name: p.name }))
  }
}

/** Send a host message to all connected guests. */
export function broadcastToGuests(msg: HostMessage) {
  const data = encodeMsg(msg)
  for (const peer of hostPeers) {
    if (peer.channel?.readyState === 'open') {
      peer.channel.send(data)
    }
  }
}

/** Send a host message to a specific guest. */
export function sendToGuest(peerId: string, msg: HostMessage) {
  const peer = hostPeers.find(p => p.id === peerId)
  if (peer?.channel?.readyState === 'open') {
    peer.channel.send(encodeMsg(msg))
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
        handleOffer(msg.sdp)
      } else if (msg.t === 'ice') {
        handleGuestIce(msg.candidate)
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
      const msg = decodeHostMsg(ev.data)
      if (msg && onHostMessage) {
        onHostMessage(msg)
      }
    }

    guestChannel.onclose = () => {
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

  // Close all host peer connections
  for (const peer of hostPeers) {
    peer.channel?.close()
    peer.pc.close()
  }
  hostPeers = []

  // Close guest connection
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
