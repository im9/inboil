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

function applyJsonPatch(patch: JsonPatch) {
  const segments = patch.path.split('/').filter(Boolean)
  if (segments.length === 0) return

  // Navigate to the parent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let target: any = song
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    if (target == null) return
    target = Array.isArray(target) ? target[Number(key)] : target[key]
  }

  if (target == null) return
  const lastKey = segments[segments.length - 1]

  switch (patch.op) {
    case 'add':
    case 'replace':
      if (Array.isArray(target)) {
        const idx = lastKey === '-' ? target.length : Number(lastKey)
        if (patch.op === 'add') target.splice(idx, 0, patch.value)
        else target[idx] = patch.value
      } else {
        target[lastKey] = patch.value
      }
      break

    case 'remove':
      if (Array.isArray(target)) {
        target.splice(Number(lastKey), 1)
      } else {
        delete target[lastKey]
      }
      break
  }
}
