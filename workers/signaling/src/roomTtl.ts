/**
 * Room TTL logic for signaling server (ADR 019 §Security).
 *
 * Pure functions — no Cloudflare runtime dependencies, fully testable.
 * The Durable Object calls these to decide when to schedule alarms
 * and whether to self-destruct.
 */

/** Room expires after 1 hour of inactivity */
export const ROOM_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Calculate when the next alarm should fire, given the last activity time.
 * Returns the absolute timestamp for the alarm.
 */
export function nextAlarmTime(lastActivity: number): number {
  return lastActivity + ROOM_TTL_MS
}

/**
 * Determine whether the room should be destroyed.
 * Returns true if `now` is at or past the TTL deadline.
 */
export function shouldDestroy(lastActivity: number, now: number): boolean {
  return now >= lastActivity + ROOM_TTL_MS
}
