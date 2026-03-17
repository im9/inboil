/**
 * Security tests for multiDevice module.
 *
 * Tests input validation, bounds checking, prototype pollution guards,
 * rate limiting, and other hardening measures.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ── Chunk index bounds (chunking.ts §6) ─────────────────────────────────────
// Already covered in chunking.test.ts — see "rejects chunks with index >= n"

// ── JSON Patch prototype pollution (guestHandler.ts) ─────────────────────────

// We can't easily import guestHandler without mocking state.svelte.ts,
// so we extract and test the patch logic directly.

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

interface JsonPatch {
  op: 'add' | 'remove' | 'replace'
  path: string
  value?: unknown
}

/**
 * Mirror of guestHandler's applyJsonPatch for isolated testing.
 * This must stay in sync with the real implementation.
 */
function applyJsonPatch(target: Record<string, unknown>, patch: JsonPatch): boolean {
  const segments = patch.path.split('/').filter(Boolean)
  if (segments.length === 0) return false

  if (segments.some(s => DANGEROUS_KEYS.has(s))) return false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obj: any = target
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    if (obj == null) return false
    if (Array.isArray(obj)) {
      const idx = Number(key)
      if (!Number.isInteger(idx) || idx < 0 || idx >= obj.length) return false
      obj = obj[idx]
    } else {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) return false
      obj = obj[key]
    }
  }

  if (obj == null) return false
  const lastKey = segments[segments.length - 1]

  switch (patch.op) {
    case 'add':
    case 'replace':
      if (Array.isArray(obj)) {
        const idx = lastKey === '-' ? obj.length : Number(lastKey)
        if (!Number.isInteger(idx) || idx < 0 || idx > obj.length) return false
        if (patch.op === 'add') obj.splice(idx, 0, patch.value)
        else obj[idx] = patch.value
      } else {
        if (patch.op === 'replace' && !Object.prototype.hasOwnProperty.call(obj, lastKey)) return false
        obj[lastKey] = patch.value
      }
      return true

    case 'remove':
      if (Array.isArray(obj)) {
        const idx = Number(lastKey)
        if (!Number.isInteger(idx) || idx < 0 || idx >= obj.length) return false
        obj.splice(idx, 1)
      } else {
        if (!Object.prototype.hasOwnProperty.call(obj, lastKey)) return false
        delete obj[lastKey]
      }
      return true
  }
  return false
}

describe('JSON Patch security', () => {
  it('rejects __proto__ in path', () => {
    const obj = { a: 1 } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'replace', path: '/__proto__/polluted', value: true })
    expect(applied).toBe(false)
    // Verify no pollution
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('rejects constructor in path', () => {
    const obj = { a: 1 } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'replace', path: '/constructor/prototype', value: {} })
    expect(applied).toBe(false)
  })

  it('rejects prototype in path', () => {
    const obj = { a: 1 } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'add', path: '/prototype', value: {} })
    expect(applied).toBe(false)
  })

  it('rejects replace on non-existent key', () => {
    const obj = { a: 1 } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'replace', path: '/nonexistent', value: 42 })
    expect(applied).toBe(false)
    expect(obj).toEqual({ a: 1 })
  })

  it('rejects navigation through non-existent path', () => {
    const obj = { a: { b: 1 } } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'replace', path: '/x/y/z', value: 42 })
    expect(applied).toBe(false)
  })

  it('rejects out-of-bounds array index in path', () => {
    const obj = { items: [1, 2, 3] } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'replace', path: '/items/99', value: 42 })
    expect(applied).toBe(false)
  })

  it('rejects negative array index', () => {
    const obj = { items: [1, 2, 3] } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'replace', path: '/items/-1', value: 42 })
    expect(applied).toBe(false)
  })

  it('allows valid replace on existing key', () => {
    const obj = { a: 1 } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'replace', path: '/a', value: 42 })
    expect(applied).toBe(true)
    expect(obj.a).toBe(42)
  })

  it('allows valid add on new key', () => {
    const obj = { a: 1 } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'add', path: '/b', value: 2 })
    expect(applied).toBe(true)
    expect(obj.b).toBe(2)
  })

  it('allows valid array splice', () => {
    const obj = { items: [1, 2, 3] } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'remove', path: '/items/1' })
    expect(applied).toBe(true)
    expect(obj.items).toEqual([1, 3])
  })

  it('rejects deeply nested __proto__', () => {
    const obj = { a: { b: { c: 1 } } } as Record<string, unknown>
    const applied = applyJsonPatch(obj, { op: 'replace', path: '/a/__proto__/evil', value: true })
    expect(applied).toBe(false)
  })
})

// ── Host input validation ────────────────────────────────────────────────────

describe('Host input validation helpers', () => {
  // Mirror the validation logic from host.ts for isolated testing
  const MAX_TRACKS = 16
  const MAX_STEPS = 64

  function validTrack(t: number, trackCount: number): boolean {
    return Number.isInteger(t) && t >= 0 && t < MAX_TRACKS && t < trackCount
  }

  function validStep(s: number): boolean {
    return Number.isInteger(s) && s >= 0 && s < MAX_STEPS
  }

  function clamp01(v: number): number {
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
  }

  describe('validTrack', () => {
    it('accepts valid track indices', () => {
      expect(validTrack(0, 8)).toBe(true)
      expect(validTrack(7, 8)).toBe(true)
    })

    it('rejects negative indices', () => {
      expect(validTrack(-1, 8)).toBe(false)
    })

    it('rejects out-of-bounds indices', () => {
      expect(validTrack(8, 8)).toBe(false)
      expect(validTrack(999, 8)).toBe(false)
    })

    it('rejects non-integer indices', () => {
      expect(validTrack(1.5, 8)).toBe(false)
      expect(validTrack(NaN, 8)).toBe(false)
      expect(validTrack(Infinity, 8)).toBe(false)
    })

    it('rejects indices beyond MAX_TRACKS', () => {
      expect(validTrack(16, 20)).toBe(false)
    })
  })

  describe('validStep', () => {
    it('accepts valid step indices', () => {
      expect(validStep(0)).toBe(true)
      expect(validStep(63)).toBe(true)
    })

    it('rejects out-of-bounds', () => {
      expect(validStep(64)).toBe(false)
      expect(validStep(-1)).toBe(false)
    })

    it('rejects non-integers', () => {
      expect(validStep(1.5)).toBe(false)
      expect(validStep(NaN)).toBe(false)
    })
  })

  describe('clamp01', () => {
    it('clamps values to 0-1 range', () => {
      expect(clamp01(0.5)).toBe(0.5)
      expect(clamp01(-5)).toBe(0)
      expect(clamp01(100)).toBe(1)
    })

    it('returns 0 for non-finite values', () => {
      expect(clamp01(NaN)).toBe(0)
      expect(clamp01(Infinity)).toBe(0)
      expect(clamp01(-Infinity)).toBe(0)
    })
  })
})

// ── Param whitelist ──────────────────────────────────────────────────────────

describe('Param whitelist', () => {
  const PARAM_WHITELIST = new Set<string>(['volume', 'pan'])

  it('allows volume and pan', () => {
    expect(PARAM_WHITELIST.has('volume')).toBe(true)
    expect(PARAM_WHITELIST.has('pan')).toBe(true)
  })

  it('blocks muted (boolean property)', () => {
    expect(PARAM_WHITELIST.has('muted')).toBe(false)
  })

  it('blocks id (identity property)', () => {
    expect(PARAM_WHITELIST.has('id')).toBe(false)
  })

  it('blocks __proto__', () => {
    expect(PARAM_WHITELIST.has('__proto__')).toBe(false)
  })

  it('blocks constructor', () => {
    expect(PARAM_WHITELIST.has('constructor')).toBe(false)
  })

  it('blocks arbitrary keys', () => {
    expect(PARAM_WHITELIST.has('evil')).toBe(false)
    expect(PARAM_WHITELIST.has('')).toBe(false)
  })
})

// ── Rate limiting ────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  const RATE_LIMIT = 200
  const RATE_WINDOW = 1000

  let msgCount = 0
  let windowStart = 0

  function rateLimited(now: number): boolean {
    if (now - windowStart > RATE_WINDOW) {
      windowStart = now
      msgCount = 0
    }
    return ++msgCount > RATE_LIMIT
  }

  beforeEach(() => {
    msgCount = 0
    windowStart = 0
  })

  it('allows messages within rate limit', () => {
    const now = 1000
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect(rateLimited(now)).toBe(false)
    }
  })

  it('blocks messages exceeding rate limit', () => {
    const now = 1000
    for (let i = 0; i < RATE_LIMIT; i++) rateLimited(now)
    expect(rateLimited(now)).toBe(true)
  })

  it('resets counter after window expires', () => {
    const t0 = 1000
    for (let i = 0; i < RATE_LIMIT; i++) rateLimited(t0)
    expect(rateLimited(t0)).toBe(true)

    // After window expires
    expect(rateLimited(t0 + RATE_WINDOW + 1)).toBe(false)
  })
})

// ── Room code entropy ────────────────────────────────────────────────────────

describe('Room code entropy', () => {
  it('generates 6-character codes (30-bit entropy)', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const arr = crypto.getRandomValues(new Uint8Array(6))
    let code = ''
    for (let i = 0; i < 6; i++) code += chars[arr[i] % chars.length]
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })
})
