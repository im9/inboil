/**
 * Host-side message handler (ADR 019).
 *
 * Receives guest control messages and applies them to local state.
 * Play/stop transport is delegated to App.svelte via callbacks.
 */

import { song, playback, selectPattern } from '../state.svelte.ts'
import { toggleTrig, setTrigVelocity, setTrigChance, toggleSolo } from '../stepActions.ts'
import type { GuestMessage, PlaybackSnapshot } from './protocol.ts'
import { sendToGuest, setOnGuestMessage } from './connection.ts'
import type { Song } from '../types.ts'

// ── Transport callbacks (set by App.svelte) ───────────────────

let onPlay: (() => void) | null = null
let onStop: (() => void) | null = null

export function setHostTransportCallbacks(play: () => void, stop: () => void) {
  onPlay = play
  onStop = stop
}

// ── Initialize host message handling ──────────────────────────

export function initHostHandlers() {
  setOnGuestMessage(handleGuestMessage)
}

function handleGuestMessage(msg: GuestMessage) {
  switch (msg.t) {
    case 'trig':
      toggleTrig(msg.track, msg.step)
      break

    case 'vel':
      setTrigVelocity(msg.track, msg.step, msg.v)
      break

    case 'chance':
      setTrigChance(msg.track, msg.step, msg.v)
      break

    case 'param': {
      const track = song.tracks[msg.track]
      if (track && msg.key in track) {
        ;(track as unknown as Record<string, unknown>)[msg.key] = msg.v
      }
      break
    }

    case 'perf':
      // Perf state is in App.svelte's local `perf` — handled via event
      window.dispatchEvent(new CustomEvent('inboil:perf', {
        detail: { action: msg.action, on: msg.on },
      }))
      break

    case 'transport':
      if (msg.action === 'play' || msg.action === 'scene-play') {
        if (msg.action === 'scene-play') {
          playback.mode = 'scene'
        }
        onPlay?.()
      } else {
        onStop?.()
      }
      break

    case 'pattern':
      selectPattern(msg.index)
      break

    case 'mute':
      if (song.tracks[msg.track]) {
        song.tracks[msg.track].muted = msg.muted
      }
      break

    case 'solo':
      toggleSolo(msg.track)
      break

    case 'fxpad':
      window.dispatchEvent(new CustomEvent('inboil:fxpad', {
        detail: { x: msg.x, y: msg.y },
      }))
      break
  }
}

// ── State broadcast helpers ───────────────────────────────────

/** Send a full snapshot to the connected guest. */
export function sendSnapshot() {
  const snap: PlaybackSnapshot = {
    playing: playback.playing,
    mode: playback.mode,
    playingPattern: playback.playingPattern,
    playheads: [...playback.playheads],
  }
  sendToGuest({
    t: 'snapshot',
    song: JSON.parse(JSON.stringify(song)) as Song,
    playback: snap,
  })
}

/** Send playhead position to the connected guest. */
export function sendPlayhead() {
  sendToGuest({
    t: 'playhead',
    heads: [...playback.playheads],
    playing: playback.playing,
    pattern: playback.playingPattern,
  })
}
