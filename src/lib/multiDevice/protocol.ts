/**
 * Multi-device collaboration message protocol (ADR 019).
 *
 * Guest → Host: fire-and-forget control inputs (short keys for minimal payload).
 * Host → Guest: state sync (snapshot on connect, then deltas + playhead).
 */

import type { Song } from '../types.ts'

// ── Guest → Host ──────────────────────────────────────────────

export type GuestMessage =
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
  | { t: 'vparam'; track: number; key: string; v: number }
  | { t: 'send'; track: number; key: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend'; v: number }

// ── Host → Guest ──────────────────────────────────────────────

/** Serialisable subset of playback state sent in snapshots. */
export interface PlaybackSnapshot {
  playing: boolean
  mode: 'loop' | 'scene'
  playingPattern: number | null
  playheads: number[]
}

export type HostMessage =
  | { t: 'snapshot'; song: Song; playback: PlaybackSnapshot }
  | { t: 'delta'; patches: JsonPatch[] }
  | { t: 'playhead'; heads: number[]; playing: boolean; pattern: number | null }

// ── JSON Patch (RFC 6902 subset) ──────────────────────────────

export interface JsonPatch {
  op: 'add' | 'remove' | 'replace'
  path: string
  value?: unknown
}

// ── Signaling ─────────────────────────────────────────────────

export type SignalMessage =
  | { t: 'join'; room: string; name: string }
  | { t: 'offer'; sdp: string }
  | { t: 'answer'; sdp: string }
  | { t: 'ice'; candidate: RTCIceCandidateInit }
  | { t: 'peer-joined'; id: string; name: string }
  | { t: 'peer-left'; id: string }

// ── Helpers ───────────────────────────────────────────────────

export function encodeMsg(msg: GuestMessage | HostMessage): string {
  return JSON.stringify(msg)
}

export function decodeGuestMsg(data: string): GuestMessage | null {
  try {
    return JSON.parse(data) as GuestMessage
  } catch {
    return null
  }
}

export function decodeHostMsg(data: string): HostMessage | null {
  try {
    return JSON.parse(data) as HostMessage
  } catch {
    return null
  }
}
