/**
 * Guest-side message handler (ADR 019).
 *
 * Receives state sync from the host and mirrors it locally.
 * The guest never runs audio — it only displays state and sends controls.
 */

import { song, playback } from '../state.svelte.ts'
import type { HostMessage, JsonPatch } from './protocol.ts'
import { setOnHostMessage } from './connection.ts'
import type { Song } from '../types.ts'

// ── Initialize guest message handling ─────────────────────────

export function initGuestHandlers() {
  setOnHostMessage(handleHostMessage)
}

function handleHostMessage(msg: HostMessage) {
  switch (msg.t) {
    case 'snapshot':
      applySnapshot(msg.song, msg.playback)
      break

    case 'delta':
      for (const patch of msg.patches) {
        applyJsonPatch(patch)
      }
      break

    case 'playhead':
      playback.playheads = msg.heads
      playback.playing = msg.playing
      playback.playingPattern = msg.pattern
      break
  }
}

// ── Snapshot application ──────────────────────────────────────

function applySnapshot(
  remoteSong: Song,
  remotePlayback: { playing: boolean; mode: 'loop' | 'scene'; playingPattern: number | null; playheads: number[] },
) {
  // Deep-copy remote song into local reactive state
  Object.assign(song, JSON.parse(JSON.stringify(remoteSong)))

  playback.playing = remotePlayback.playing
  playback.mode = remotePlayback.mode
  playback.playingPattern = remotePlayback.playingPattern
  playback.playheads = [...remotePlayback.playheads]
}

// ── JSON Patch (RFC 6902 subset) ──────────────────────────────

/** Keys that must never be written via patch (prototype pollution guard). */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function applyJsonPatch(patch: JsonPatch) {
  const segments = patch.path.split('/').filter(Boolean)
  if (segments.length === 0) return

  // Reject dangerous property names anywhere in the path
  if (segments.some(s => DANGEROUS_KEYS.has(s))) return

  // Navigate to the parent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let target: any = song
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    if (target == null) return
    if (Array.isArray(target)) {
      const idx = Number(key)
      if (!Number.isInteger(idx) || idx < 0 || idx >= target.length) return
      target = target[idx]
    } else {
      if (!Object.prototype.hasOwnProperty.call(target, key)) return
      target = target[key]
    }
  }

  if (target == null) return
  const lastKey = segments[segments.length - 1]

  switch (patch.op) {
    case 'add':
    case 'replace':
      if (Array.isArray(target)) {
        const idx = lastKey === '-' ? target.length : Number(lastKey)
        if (!Number.isInteger(idx) || idx < 0 || idx > target.length) return
        if (patch.op === 'add') target.splice(idx, 0, patch.value)
        else target[idx] = patch.value
      } else {
        // Only allow replacing existing keys (no arbitrary injection)
        if (patch.op === 'replace' && !Object.prototype.hasOwnProperty.call(target, lastKey)) return
        target[lastKey] = patch.value
      }
      break

    case 'remove':
      if (Array.isArray(target)) {
        const idx = Number(lastKey)
        if (!Number.isInteger(idx) || idx < 0 || idx >= target.length) return
        target.splice(idx, 1)
      } else {
        if (!Object.prototype.hasOwnProperty.call(target, lastKey)) return
        delete target[lastKey]
      }
      break
  }
}
