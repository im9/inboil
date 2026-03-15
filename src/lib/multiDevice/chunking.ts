/**
 * Chunked message send/receive for WebRTC DataChannel (ADR 100).
 *
 * Hardened with: MAX_CHUNKS limit, TTL timeout, duplicate guard,
 * channel cleanup, and memory budget.
 */

export const CHUNK_SIZE = 60_000     // bytes, well under 64KB SCTP limit
export const MAX_CHUNKS = 100        // reject envelopes with n > MAX_CHUNKS (§1)
export const CHUNK_TTL = 30_000      // ms — incomplete reassembly expires (§2)
export const MEMORY_BUDGET = 5_242_880  // 5MB total pending reassembly (§5)

export interface ChunkEnvelope {
  _c: number  // chunk group id (timestamp)
  i: number   // chunk index
  n: number   // total chunks
  d: string   // chunk data
}

interface ChunkBuffer {
  parts: string[]
  received: number
  total: number
  bytes: number
  timer: ReturnType<typeof setTimeout>
}

/** Manages chunked reassembly state. One instance per app. */
export class ChunkReassembler {
  private buffers = new Map<unknown, Map<number, ChunkBuffer>>()
  private pendingBytes = 0

  /** Remove a single reassembly entry and reclaim its memory budget. */
  private deleteEntry(bufMap: Map<number, ChunkBuffer>, id: number) {
    const buf = bufMap.get(id)
    if (!buf) return
    clearTimeout(buf.timer)
    this.pendingBytes -= buf.bytes
    bufMap.delete(id)
  }

  /** Clean up all reassembly buffers for a channel (§4). */
  cleanup(channel: unknown): void {
    const bufMap = this.buffers.get(channel)
    if (!bufMap) return
    for (const [id] of bufMap) this.deleteEntry(bufMap, id)
    this.buffers.delete(channel)
  }

  /** Process a raw incoming message. Calls onComplete when full message is ready. */
  receive(channel: unknown, raw: string, onComplete: (data: string) => void): void {
    if (raw.startsWith('{"_c":')) {
      try {
        const envelope = JSON.parse(raw) as ChunkEnvelope
        if (typeof envelope._c === 'number' && typeof envelope.i === 'number') {
          // §1: reject oversized chunk counts
          if (envelope.n > MAX_CHUNKS || envelope.n < 1) {
            console.warn(`[chunk] rejected: n=${envelope.n} exceeds MAX_CHUNKS=${MAX_CHUNKS}`)
            return
          }
          // §5: memory budget check
          const chunkBytes = envelope.d.length
          if (this.pendingBytes + chunkBytes > MEMORY_BUDGET) {
            console.warn(`[chunk] rejected: pending ${this.pendingBytes}+${chunkBytes} exceeds budget ${MEMORY_BUDGET}`)
            return
          }

          let bufMap = this.buffers.get(channel)
          if (!bufMap) {
            bufMap = new Map()
            this.buffers.set(channel, bufMap)
          }

          let buf = bufMap.get(envelope._c)
          if (!buf) {
            buf = {
              parts: new Array(envelope.n),
              received: 0,
              total: envelope.n,
              bytes: 0,
              timer: setTimeout(() => {
                // §2: TTL expiry
                console.warn(`[chunk] TTL expired for id=${envelope._c}, received ${buf!.received}/${buf!.total}`)
                this.deleteEntry(bufMap!, envelope._c)
                if (bufMap!.size === 0) this.buffers.delete(channel)
              }, CHUNK_TTL),
            }
            bufMap.set(envelope._c, buf)
          }

          // §3: duplicate chunk guard
          if (buf.parts[envelope.i] != null) {
            return
          }

          buf.parts[envelope.i] = envelope.d
          buf.received++
          buf.bytes += chunkBytes
          this.pendingBytes += chunkBytes

          if (buf.received === buf.total) {
            const joined = buf.parts.join('')
            this.deleteEntry(bufMap, envelope._c)
            if (bufMap.size === 0) this.buffers.delete(channel)
            onComplete(joined)
          }
          return
        }
      } catch { /* not a chunk, fall through */ }
    }
    onComplete(raw)
  }

  /** Current pending bytes (for testing). */
  get pendingSize(): number { return this.pendingBytes }

  /** Number of channels with pending buffers (for testing). */
  get channelCount(): number { return this.buffers.size }
}

/** Encode data into chunks and send via channel. */
export function sendChunked(channel: { send: (data: string) => void }, data: string): void {
  if (data.length <= CHUNK_SIZE) {
    channel.send(data)
    return
  }
  const total = Math.ceil(data.length / CHUNK_SIZE)
  const id = Date.now()
  for (let i = 0; i < total; i++) {
    const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    channel.send(JSON.stringify({ _c: id, i, n: total, d: chunk }))
  }
}
