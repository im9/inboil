import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChunkReassembler, sendChunked, CHUNK_SIZE, MAX_CHUNKS, MEMORY_BUDGET } from './chunking.ts'

// ── sendChunked ───────────────────────────────────────────────────────────────

describe('sendChunked', () => {
  it('sends small messages without chunking', () => {
    const sent: string[] = []
    const ch = { send: (d: string) => sent.push(d) }
    sendChunked(ch, 'hello')
    expect(sent).toEqual(['hello'])
  })

  it('splits large messages into chunks', () => {
    const sent: string[] = []
    const ch = { send: (d: string) => sent.push(d) }
    const data = 'x'.repeat(CHUNK_SIZE + 100)
    sendChunked(ch, data)
    expect(sent).toHaveLength(2)
    const c0 = JSON.parse(sent[0])
    const c1 = JSON.parse(sent[1])
    expect(c0.i).toBe(0)
    expect(c0.n).toBe(2)
    expect(c1.i).toBe(1)
    expect(c0.d + c1.d).toBe(data)
  })
})

// ── ChunkReassembler ──────────────────────────────────────────────────────────

describe('ChunkReassembler', () => {
  let r: ChunkReassembler
  const ch = {} as unknown  // mock channel key

  beforeEach(() => {
    r = new ChunkReassembler()
    vi.useFakeTimers()
  })

  function envelope(id: number, i: number, n: number, d: string): string {
    return JSON.stringify({ _c: id, i, n, d })
  }

  it('passes non-chunk messages through', () => {
    const results: string[] = []
    r.receive(ch, '{"type":"hello"}', d => results.push(d))
    expect(results).toEqual(['{"type":"hello"}'])
  })

  it('reassembles chunked messages in order', () => {
    const results: string[] = []
    const cb = (d: string) => results.push(d)
    r.receive(ch, envelope(1, 0, 3, 'AAA'), cb)
    r.receive(ch, envelope(1, 1, 3, 'BBB'), cb)
    expect(results).toHaveLength(0)
    r.receive(ch, envelope(1, 2, 3, 'CCC'), cb)
    expect(results).toEqual(['AAABBBCCC'])
  })

  it('reassembles chunked messages out of order', () => {
    const results: string[] = []
    const cb = (d: string) => results.push(d)
    r.receive(ch, envelope(1, 2, 3, 'CCC'), cb)
    r.receive(ch, envelope(1, 0, 3, 'AAA'), cb)
    r.receive(ch, envelope(1, 1, 3, 'BBB'), cb)
    expect(results).toEqual(['AAABBBCCC'])
  })

  it('handles multiple concurrent chunk groups', () => {
    const results: string[] = []
    const cb = (d: string) => results.push(d)
    r.receive(ch, envelope(1, 0, 2, 'A1'), cb)
    r.receive(ch, envelope(2, 0, 2, 'B1'), cb)
    r.receive(ch, envelope(1, 1, 2, 'A2'), cb)
    expect(results).toEqual(['A1A2'])
    r.receive(ch, envelope(2, 1, 2, 'B2'), cb)
    expect(results).toEqual(['A1A2', 'B1B2'])
  })

  it('reclaims memory after reassembly', () => {
    const cb = () => {}
    r.receive(ch, envelope(1, 0, 2, 'AAAA'), cb)
    expect(r.pendingSize).toBe(4)
    r.receive(ch, envelope(1, 1, 2, 'BBBB'), cb)
    expect(r.pendingSize).toBe(0)
    expect(r.channelCount).toBe(0)
  })

  // ── ADR 100 §1: MAX_CHUNKS ──

  it('rejects envelopes with n > MAX_CHUNKS', () => {
    const results: string[] = []
    r.receive(ch, envelope(1, 0, MAX_CHUNKS + 1, 'x'), d => results.push(d))
    expect(results).toHaveLength(0)
    expect(r.pendingSize).toBe(0)
  })

  it('rejects envelopes with n < 1', () => {
    const results: string[] = []
    r.receive(ch, envelope(1, 0, 0, 'x'), d => results.push(d))
    expect(results).toHaveLength(0)
  })

  // ── ADR 100 §2: TTL ──

  it('expires incomplete reassembly after TTL', () => {
    const results: string[] = []
    r.receive(ch, envelope(1, 0, 3, 'AAA'), d => results.push(d))
    expect(r.pendingSize).toBe(3)
    vi.advanceTimersByTime(30_000)
    expect(r.pendingSize).toBe(0)
    expect(r.channelCount).toBe(0)
    // Late chunk after TTL should not crash
    r.receive(ch, envelope(1, 1, 3, 'BBB'), () => {})
    expect(r.pendingSize).toBe(3) // starts new buffer
  })

  // ── ADR 100 §3: Duplicate guard ──

  it('ignores duplicate chunks', () => {
    const results: string[] = []
    const cb = (d: string) => results.push(d)
    r.receive(ch, envelope(1, 0, 2, 'AAA'), cb)
    r.receive(ch, envelope(1, 0, 2, 'AAA'), cb) // duplicate
    expect(r.pendingSize).toBe(3) // not doubled
    r.receive(ch, envelope(1, 1, 2, 'BBB'), cb)
    expect(results).toEqual(['AAABBB'])
  })

  it('does not prematurely reassemble from duplicate-inflated count', () => {
    const results: string[] = []
    const cb = (d: string) => results.push(d)
    r.receive(ch, envelope(1, 0, 3, 'A'), cb)
    r.receive(ch, envelope(1, 0, 3, 'A'), cb) // duplicate
    r.receive(ch, envelope(1, 1, 3, 'B'), cb)
    expect(results).toHaveLength(0) // still waiting for chunk 2
    r.receive(ch, envelope(1, 2, 3, 'C'), cb)
    expect(results).toEqual(['ABC'])
  })

  // ── ADR 100 §4: Channel cleanup ──

  it('cleans up buffers on channel cleanup', () => {
    r.receive(ch, envelope(1, 0, 3, 'AAA'), () => {})
    r.receive(ch, envelope(2, 0, 2, 'BBB'), () => {})
    expect(r.pendingSize).toBe(6)
    r.cleanup(ch)
    expect(r.pendingSize).toBe(0)
    expect(r.channelCount).toBe(0)
  })

  it('cleanup on unknown channel is a no-op', () => {
    r.cleanup({}) // should not throw
  })

  // ── ADR 100 §5: Memory budget ──

  it('rejects chunks when memory budget is exceeded', () => {
    const results: string[] = []
    const bigChunk = 'x'.repeat(MEMORY_BUDGET - 10)
    r.receive(ch, envelope(1, 0, 2, bigChunk), d => results.push(d))
    expect(r.pendingSize).toBe(MEMORY_BUDGET - 10)
    // This chunk would exceed the budget
    r.receive(ch, envelope(1, 1, 2, 'x'.repeat(20)), d => results.push(d))
    expect(results).toHaveLength(0) // rejected, not assembled
    // Clean up
    r.cleanup(ch)
  })
})
