/**
 * Host-side message handler (ADR 019).
 *
 * Receives guest control messages and applies them to local state.
 * Play/stop transport is delegated to App.svelte via callbacks.
 */

import { song, playback, selectPattern, activeCell } from '../state.svelte.ts'
import { toggleTrig, setTrigVelocity, setTrigChance, toggleSolo, setVoiceParam, setTrackSend } from '../stepActions.ts'
import { getParamDefs } from '../paramDefs.ts'
import type { GuestMessage, PlaybackSnapshot } from './protocol.ts'
import { sendToGuest, setOnGuestMessage } from './connection.ts'
import type { Song } from '../types.ts'

// ── Input validation helpers ─────────────────────────────────

const MAX_TRACKS = 16
const MAX_STEPS = 64

function validTrack(t: number): boolean {
  return Number.isInteger(t) && t >= 0 && t < MAX_TRACKS && t < song.tracks.length
}

function validStep(s: number): boolean {
  return Number.isInteger(s) && s >= 0 && s < MAX_STEPS
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
}

/** Track properties a guest is allowed to set via 'param' messages. */
const PARAM_WHITELIST = new Set<string>(['volume', 'pan'])

// ── Transport callbacks (set by App.svelte) ───────────────────

let onPlay: (() => void) | null = null
let onStop: (() => void) | null = null

export function setHostTransportCallbacks(play: () => void, stop: () => void) {
  onPlay = play
  onStop = stop
}

// ── Rate limiting ────────────────────────────────────────────

const RATE_LIMIT = 200       // max messages per window
const RATE_WINDOW = 1000     // ms
let msgCount = 0
let windowStart = 0

function rateLimited(): boolean {
  const now = Date.now()
  if (now - windowStart > RATE_WINDOW) {
    windowStart = now
    msgCount = 0
  }
  return ++msgCount > RATE_LIMIT
}

// ── Initialize host message handling ──────────────────────────

export function initHostHandlers() {
  setOnGuestMessage(handleGuestMessage)
}

function handleGuestMessage(msg: GuestMessage) {
  if (rateLimited()) return
  switch (msg.t) {
    case 'trig':
      if (!validTrack(msg.track) || !validStep(msg.step)) return
      toggleTrig(msg.track, msg.step)
      break

    case 'vel':
      if (!validTrack(msg.track) || !validStep(msg.step)) return
      setTrigVelocity(msg.track, msg.step, clamp01(msg.v))
      break

    case 'chance':
      if (!validTrack(msg.track) || !validStep(msg.step)) return
      setTrigChance(msg.track, msg.step, clamp01(msg.v))
      break

    case 'param': {
      if (!validTrack(msg.track) || !PARAM_WHITELIST.has(msg.key)) return
      const track = song.tracks[msg.track]
      if (track) {
        ;(track as unknown as Record<string, unknown>)[msg.key] = clamp01(msg.v)
      }
      break
    }

    case 'perf':
      // Validate action is one of the allowed values (already typed, but verify at runtime)
      if (!['fill', 'reverse', 'break'].includes(msg.action)) return
      if (typeof msg.on !== 'boolean') return
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
      if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= song.patterns.length) return
      selectPattern(msg.index)
      break

    case 'mute':
      if (!validTrack(msg.track)) return
      song.tracks[msg.track].muted = !!msg.muted
      break

    case 'solo':
      if (!validTrack(msg.track)) return
      toggleSolo(msg.track)
      break

    case 'fxpad':
      window.dispatchEvent(new CustomEvent('inboil:fxpad', {
        detail: { x: clamp01(msg.x), y: clamp01(msg.y) },
      }))
      break

    case 'vparam': {
      if (!validTrack(msg.track)) return
      if (typeof msg.key !== 'string' || !Number.isFinite(msg.v)) return
      const cell = activeCell(msg.track)
      if (!cell.voiceId) return
      // Validate key exists in this voice's param definitions
      const defs = getParamDefs(cell.voiceId)
      const def = defs.find(d => d.key === msg.key)
      if (!def) return
      // Clamp to defined range
      const clamped = Math.max(def.min, Math.min(def.max, msg.v))
      setVoiceParam(msg.track, msg.key, clamped)
      break
    }

    case 'send': {
      if (!validTrack(msg.track)) return
      if (!['reverbSend', 'delaySend', 'glitchSend', 'granularSend'].includes(msg.key)) return
      setTrackSend(msg.track, msg.key, clamp01(msg.v))
      break
    }
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
