/**
 * Tests for signaling server security hardening (ADR 019 §Security).
 *
 * Tests pure logic extracted from the Cloudflare Worker:
 * - Room TTL (alarm-based expiry)
 * - IP-based rate limiting
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ROOM_TTL_MS,
  nextAlarmTime,
  shouldDestroy,
} from '../../../workers/signaling/src/roomTtl.ts'
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW,
  isRateLimited,
  recordFailedJoin,
  pruneExpired,
  type RateLimitEntry,
} from '../../../workers/signaling/src/rateLimit.ts'

// ── Room TTL ──────────────────────────────────────────────────────────────────

describe('Room TTL', () => {
  it('TTL is 1 hour', () => {
    expect(ROOM_TTL_MS).toBe(60 * 60 * 1000)
  })

  it('nextAlarmTime returns lastActivity + 1h', () => {
    const t = 1000000
    expect(nextAlarmTime(t)).toBe(t + ROOM_TTL_MS)
  })

  it('shouldDestroy returns false before TTL', () => {
    const lastActivity = 1000000
    expect(shouldDestroy(lastActivity, lastActivity + ROOM_TTL_MS - 1)).toBe(false)
  })

  it('shouldDestroy returns true at exactly TTL', () => {
    const lastActivity = 1000000
    expect(shouldDestroy(lastActivity, lastActivity + ROOM_TTL_MS)).toBe(true)
  })

  it('shouldDestroy returns true after TTL', () => {
    const lastActivity = 1000000
    expect(shouldDestroy(lastActivity, lastActivity + ROOM_TTL_MS + 60000)).toBe(true)
  })

  it('activity reset pushes TTL forward', () => {
    const t0 = 1000000
    const t1 = t0 + 30 * 60 * 1000 // 30 min later
    // After activity at t1, alarm should be t1 + 1h, not t0 + 1h
    expect(nextAlarmTime(t1)).toBe(t1 + ROOM_TTL_MS)
    expect(shouldDestroy(t1, t0 + ROOM_TTL_MS)).toBe(false)
  })
})

// ── IP Rate Limiting ──────────────────────────────────────────────────────────

describe('IP rate limiting', () => {
  let store: Map<string, RateLimitEntry>
  const IP = '192.168.1.100'
  const T0 = 1000000

  beforeEach(() => {
    store = new Map()
  })

  it('allows first request from unknown IP', () => {
    expect(isRateLimited(store, IP, T0)).toBe(false)
  })

  it('allows requests within limit', () => {
    for (let i = 0; i < RATE_LIMIT_MAX - 1; i++) {
      recordFailedJoin(store, IP, T0)
    }
    expect(isRateLimited(store, IP, T0)).toBe(false)
  })

  it('blocks after reaching limit', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      recordFailedJoin(store, IP, T0)
    }
    expect(isRateLimited(store, IP, T0)).toBe(true)
  })

  it('resets after window expires', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      recordFailedJoin(store, IP, T0)
    }
    expect(isRateLimited(store, IP, T0)).toBe(true)
    // After window
    expect(isRateLimited(store, IP, T0 + RATE_LIMIT_WINDOW)).toBe(false)
  })

  it('tracks IPs independently', () => {
    const IP2 = '10.0.0.1'
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      recordFailedJoin(store, IP, T0)
    }
    expect(isRateLimited(store, IP, T0)).toBe(true)
    expect(isRateLimited(store, IP2, T0)).toBe(false)
  })

  it('starts new window after expiry', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      recordFailedJoin(store, IP, T0)
    }
    // Window expires, record new failure
    const t1 = T0 + RATE_LIMIT_WINDOW
    recordFailedJoin(store, IP, t1)
    expect(isRateLimited(store, IP, t1)).toBe(false)
    expect(store.get(IP)!.count).toBe(1)
  })

  it('window boundary: exactly at expiry clears', () => {
    recordFailedJoin(store, IP, T0)
    // Exactly at window boundary
    expect(isRateLimited(store, IP, T0 + RATE_LIMIT_WINDOW)).toBe(false)
  })

  describe('pruneExpired', () => {
    it('removes expired entries', () => {
      recordFailedJoin(store, '1.1.1.1', T0)
      recordFailedJoin(store, '2.2.2.2', T0)
      recordFailedJoin(store, '3.3.3.3', T0 + RATE_LIMIT_WINDOW) // still fresh
      pruneExpired(store, T0 + RATE_LIMIT_WINDOW)
      expect(store.has('1.1.1.1')).toBe(false)
      expect(store.has('2.2.2.2')).toBe(false)
      expect(store.has('3.3.3.3')).toBe(true)
    })

    it('handles empty store', () => {
      pruneExpired(store, T0)
      expect(store.size).toBe(0)
    })
  })
})
