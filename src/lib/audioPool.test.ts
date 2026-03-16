/**
 * Audio Pool unit tests (ADR 104).
 * Tests pure functions (contentHash, generateWaveform) and IndexedDB pool-meta CRUD.
 * OPFS operations are not testable in Node — covered by e2e tests.
 */
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach } from 'vitest'
import { contentHash, generateWaveform, loadMeta, loadAllMeta, _resetPoolForTest } from './audioPool.ts'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetPoolForTest()
})

// ── contentHash ──

describe('contentHash', () => {
  it('produces a 64-char hex string', async () => {
    const buf = new ArrayBuffer(128)
    new Uint8Array(buf).fill(42)
    const hash = await contentHash(buf)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same content → same hash', async () => {
    const a = new Uint8Array([1, 2, 3, 4]).buffer
    const b = new Uint8Array([1, 2, 3, 4]).buffer
    expect(await contentHash(a)).toBe(await contentHash(b))
  })

  it('different content → different hash', async () => {
    const a = new Uint8Array([1, 2, 3, 4]).buffer
    const b = new Uint8Array([4, 3, 2, 1]).buffer
    expect(await contentHash(a)).not.toBe(await contentHash(b))
  })

  it('different sizes with same prefix → different hash', async () => {
    const a = new Uint8Array([1, 2, 3]).buffer
    const b = new Uint8Array([1, 2, 3, 4]).buffer
    expect(await contentHash(a)).not.toBe(await contentHash(b))
  })
})

// ── generateWaveform ──

describe('generateWaveform', () => {
  it('returns correct number of points', () => {
    const mono = new Float32Array(1000)
    const wf = generateWaveform(mono, 64)
    expect(wf.length).toBe(64)
  })

  it('default is 128 points', () => {
    const mono = new Float32Array(512)
    const wf = generateWaveform(mono)
    expect(wf.length).toBe(128)
  })

  it('captures peak values', () => {
    const mono = new Float32Array(256)
    // Set a spike in the first quarter
    mono[32] = 0.9
    const wf = generateWaveform(mono, 4)
    // First block should have peak near 0.9
    expect(wf[0]).toBeCloseTo(0.9, 1)
    // Other blocks should be 0
    expect(wf[1]).toBe(0)
    expect(wf[2]).toBe(0)
    expect(wf[3]).toBe(0)
  })

  it('uses absolute values for negative samples', () => {
    const mono = new Float32Array(128)
    mono[10] = -0.75
    const wf = generateWaveform(mono, 1)
    expect(wf[0]).toBeCloseTo(0.75, 2)
  })
})

// ── pool-meta IndexedDB CRUD (via public loadMeta/loadAllMeta) ──

describe('pool-meta store', () => {
  // Use the internal IDB directly for write tests since saveMeta is private.
  // We open the same DB that audioPool.ts uses.
  async function putRaw(entry: Record<string, unknown>) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('inboil-pool', 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('meta')) {
          req.result.createObjectStore('meta', { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction('meta', 'readwrite')
    const store = tx.objectStore('meta')
    await new Promise<void>((resolve, reject) => {
      const r = store.put(entry)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
    db.close()
    // Reset cached connection so audioPool opens fresh
    _resetPoolForTest()
  }

  it('loadMeta returns null for missing id', async () => {
    const result = await loadMeta('nonexistent')
    expect(result).toBeNull()
  })

  it('put → loadMeta round-trip', async () => {
    await putRaw({
      id: 'abc123',
      path: 'kicks/808.wav',
      name: '808',
      folder: 'kicks',
      duration: 0.5,
      sampleRate: 44100,
      size: 1024,
      waveform: [0.1, 0.5, 0.3],
      addedAt: Date.now(),
    })
    const loaded = await loadMeta('abc123')
    expect(loaded).not.toBeNull()
    expect(loaded!.name).toBe('808')
    expect(loaded!.folder).toBe('kicks')
    // loadMeta converts waveform back to Float32Array
    expect(loaded!.waveform).toBeInstanceOf(Float32Array)
    expect(loaded!.waveform[1]).toBeCloseTo(0.5)
  })

  it('loadAllMeta returns all entries', async () => {
    await putRaw({ id: 'a', path: 'a', name: 'a', folder: 'x', duration: 0, sampleRate: 44100, size: 0, waveform: [], addedAt: 0 })
    await putRaw({ id: 'b', path: 'b', name: 'b', folder: 'y', duration: 0, sampleRate: 44100, size: 0, waveform: [], addedAt: 0 })
    const all = await loadAllMeta()
    expect(all.length).toBe(2)
  })
})
