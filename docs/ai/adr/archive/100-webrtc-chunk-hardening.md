# ADR 100: WebRTC Chunk Buffer Hardening

## Status: Implemented

## Context

Multi-device jam mode (ADR 096) uses chunked message reassembly in `connection.ts` to send large payloads (song state, pattern data) over WebRTC data channels. The current implementation has several robustness gaps:

1. **No timeout**: Partial messages from network glitches remain in the reassembly buffer indefinitely, leaking memory.
2. **No size validation**: There is no limit on `envelope.n` (total chunk count), allowing a malformed or malicious message to trigger allocation of an arbitrarily large array.
3. **Duplicate chunk handling**: If a duplicate chunk arrives, `parts[i]` is overwritten silently and the `received` counter is incremented again, potentially triggering premature reassembly with missing parts.
4. **No cleanup on channel close**: When a data channel closes, its pending reassembly buffers are never cleared.
5. **No memory budget**: A peer could flood the channel with partial messages, each allocating a buffer, with no upper bound on total memory usage.

## Decision

Harden the chunked message reassembly with the following fixes:

### 1. MAX_CHUNKS Limit

Add a `MAX_CHUNKS` constant (100). Reject any incoming envelope where `envelope.n > MAX_CHUNKS`. Log a warning and discard the chunk.

### 2. Reassembly TTL

Each reassembly buffer entry gets a `setTimeout` (30 seconds). If all chunks have not arrived within the TTL, delete the entry from the buffer map and log a warning. Clear the timeout when reassembly completes successfully.

### 3. Duplicate Chunk Guard

Before writing `parts[i]`, check if the slot is already populated. If it is, skip the write and do not increment the `received` counter. This prevents premature reassembly from inflated counts.

### 4. Channel Close Cleanup

Add an `onclose` handler to each `RTCDataChannel` that iterates and deletes all reassembly buffer entries associated with that channel. Cancel any pending TTL timeouts during cleanup.

### 5. Memory Budget

Track the total byte size of all pending reassembly buffers across all channels. Before accepting a new chunk, check if the total exceeds a budget (5MB). If it does, reject the chunk and log a warning. Completed reassemblies decrement the total.

## Risks

- **Legitimate large messages rejected**: If a valid payload requires more than 100 chunks or exceeds 5MB pending, it will be dropped. Mitigation: size constants should be calibrated against actual song payload sizes (current max is ~200KB).
- **TTL too aggressive**: On very slow connections, 30 seconds may not be enough for all chunks to arrive. Mitigation: make TTL configurable or scale with chunk count.
- **Concurrency edge cases**: Multiple channels reassembling simultaneously share the memory budget — a large transfer on one channel could starve another. Mitigation: per-channel budgets if this becomes a problem.

## Consequences

- **Positive**: Eliminates memory leaks from orphaned partial messages
- **Positive**: Prevents oversized allocation from malformed envelopes
- **Positive**: Correct reassembly — duplicate chunks no longer corrupt the received count
- **Positive**: Clean shutdown — no dangling buffers after channel close
- **Negative**: Adds complexity to the reassembly path (timeouts, size tracking)
- **Negative**: Constants (MAX_CHUNKS, TTL, budget) may need tuning per deployment
