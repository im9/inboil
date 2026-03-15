/**
 * Guest action helper (ADR 019).
 *
 * Wraps state mutations so that in guest mode, they are sent as messages
 * to the host instead of modifying local state.
 */

import { session } from '../state.svelte.ts'
import type { GuestMessage } from './protocol.ts'
import { sendToHost } from './connection.ts'

/** Returns true if the current device is a connected guest. */
export function isGuest(): boolean {
  return session.role === 'guest' && session.connected
}

/** Send a control message to the host. No-op if not a guest. */
export function guestAction(msg: GuestMessage): void {
  if (!isGuest()) return
  sendToHost(msg)
}

// ── Convenience wrappers for common actions ───────────────────

export function guestToggleTrig(track: number, step: number, on: boolean) {
  guestAction({ t: 'trig', track, step, on })
}

export function guestSetVelocity(track: number, step: number, v: number) {
  guestAction({ t: 'vel', track, step, v })
}

export function guestSetChance(track: number, step: number, v: number) {
  guestAction({ t: 'chance', track, step, v })
}

export function guestSetParam(track: number, key: string, v: number) {
  guestAction({ t: 'param', track, key, v })
}

export function guestPerf(action: 'fill' | 'reverse' | 'break', on: boolean) {
  guestAction({ t: 'perf', action, on })
}

export function guestTransport(action: 'play' | 'stop' | 'scene-play' | 'scene-stop') {
  guestAction({ t: 'transport', action })
}

export function guestSelectPattern(index: number) {
  guestAction({ t: 'pattern', index })
}

export function guestMute(track: number, muted: boolean) {
  guestAction({ t: 'mute', track, muted })
}

export function guestSolo(track: number) {
  guestAction({ t: 'solo', track })
}

export function guestFxPad(x: number, y: number) {
  guestAction({ t: 'fxpad', x, y })
}

export function guestSetVoiceParam(track: number, key: string, v: number) {
  guestAction({ t: 'vparam', track, key, v })
}

export function guestSetSend(track: number, key: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend', v: number) {
  guestAction({ t: 'send', track, key, v })
}
