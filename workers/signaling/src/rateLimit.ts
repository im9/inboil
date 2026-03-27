/**
 * IP-based rate limiting for signaling server (ADR 019 §Security).
 *
 * Pure functions — no Cloudflare runtime dependencies, fully testable.
 */

/** Rate limit configuration */
export const RATE_LIMIT_MAX = 5       // max failed joins per IP
export const RATE_LIMIT_WINDOW = 10_000 // 10 second window

export interface RateLimitEntry {
  count: number
  windowStart: number
}

/**
 * Check whether an IP should be blocked due to excessive failed join attempts.
 * Returns true if the request should be blocked.
 *
 * Call `recordFailedJoin()` separately when a join actually fails (room full, invalid code, etc.).
 */
export function isRateLimited(
  store: Map<string, RateLimitEntry>,
  ip: string,
  now: number,
): boolean {
  const entry = store.get(ip)
  if (!entry) return false
  // Window expired — clean up
  if (now - entry.windowStart >= RATE_LIMIT_WINDOW) {
    store.delete(ip)
    return false
  }
  return entry.count >= RATE_LIMIT_MAX
}

/**
 * Record a failed join attempt for an IP.
 */
export function recordFailedJoin(
  store: Map<string, RateLimitEntry>,
  ip: string,
  now: number,
): void {
  const entry = store.get(ip)
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW) {
    store.set(ip, { count: 1, windowStart: now })
  } else {
    entry.count++
  }
}

/**
 * Prune expired entries from the store to prevent memory growth.
 * Call periodically (e.g. every 60s via alarm or on each request).
 */
export function pruneExpired(
  store: Map<string, RateLimitEntry>,
  now: number,
): void {
  for (const [ip, entry] of store) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW) {
      store.delete(ip)
    }
  }
}
