import { describe, it, expect } from 'vitest'
import { tickCycle, type CycleState } from './cycle-detect'

function makeState(overrides: Partial<CycleState> = {}): CycleState {
  return {
    patternPos: 0,
    patternLen: 32, // 16 steps × divisor 2
    reversing: false,
    pendingReversing: null,
    pendingCycle: false,
    ...overrides,
  }
}

/** Run N base-ticks and return the state */
function runTicks(s: CycleState, n: number): CycleState {
  for (let i = 0; i < n; i++) tickCycle(s)
  return s
}

describe('cycle-detect', () => {
  it('fires cycle after patternLen ticks', () => {
    const s = makeState()
    runTicks(s, 31)
    expect(s.pendingCycle).toBe(false)
    expect(s.patternPos).toBe(31)
    tickCycle(s) // tick 32
    expect(s.pendingCycle).toBe(true)
    expect(s.patternPos).toBe(0)
  })

  it('rev decrements patternPos — no cycle while reversing', () => {
    const s = makeState({ patternPos: 28, reversing: true })
    runTicks(s, 10)
    // 28 - 10 = 18
    expect(s.patternPos).toBe(18)
    expect(s.pendingCycle).toBe(false)
  })

  it('rev clamps patternPos at 0', () => {
    const s = makeState({ patternPos: 3, reversing: true })
    runTicks(s, 10)
    expect(s.patternPos).toBe(0)
    expect(s.pendingCycle).toBe(false)
  })

  it('rev accounts for rewound steps: cycle fires only after full pattern', () => {
    // The core bug: at step 10/16 (pos=20/32), rev for 10 ticks,
    // playhead goes 10→5. After release, need FULL remaining distance.
    const s = makeState({ patternPos: 20 })
    s.pendingReversing = true
    runTicks(s, 10) // rev for 10 ticks: pos 20 → 10
    expect(s.patternPos).toBe(10)

    s.pendingReversing = false // release
    // Now need 32 - 10 = 22 ticks to cycle
    // That matches: playhead at step 5 needs 11 more steps (22 ticks) to wrap
    runTicks(s, 21)
    expect(s.pendingCycle).toBe(false)
    expect(s.patternPos).toBe(31)
    tickCycle(s) // 22nd tick
    expect(s.pendingCycle).toBe(true)
    expect(s.patternPos).toBe(0)
  })

  it('RACE: pendingReversing=true at patternLen-1 must NOT fire cycle', () => {
    const s = makeState({ patternPos: 31 })
    s.pendingReversing = true
    tickCycle(s)
    expect(s.reversing).toBe(true)
    expect(s.pendingCycle).toBe(false)
    expect(s.patternPos).toBe(30) // decremented, not incremented
  })

  it('repeat scenario: rev mid-pattern extends cycle correctly', () => {
    const s = makeState()
    // 1st cycle: normal
    runTicks(s, 32)
    expect(s.pendingCycle).toBe(true)
    s.pendingCycle = false

    // 2nd cycle: rev at pos 20 for 10 ticks
    runTicks(s, 20) // pos → 20
    s.pendingReversing = true
    runTicks(s, 10) // pos 20 → 10
    expect(s.patternPos).toBe(10)
    expect(s.pendingCycle).toBe(false)

    // release rev — need 22 ticks (32-10) for cycle
    s.pendingReversing = false
    runTicks(s, 21)
    expect(s.pendingCycle).toBe(false)
    tickCycle(s)
    expect(s.pendingCycle).toBe(true)
    s.pendingCycle = false

    // 3rd cycle: normal
    runTicks(s, 32)
    expect(s.pendingCycle).toBe(true)
  })

  it('rev release: pendingReversing=false always commits (no deadlock)', () => {
    // The deadlock bug: if pending commit is gated by patternPos parity,
    // and patternPos is stuck, pendingReversing=false never commits.
    // pendingReversing must commit unconditionally every base tick.
    const s = makeState({ patternPos: 15, reversing: true })
    // Rev active, patternPos decrementing
    runTicks(s, 3) // pos 15 → 12
    expect(s.reversing).toBe(true)
    expect(s.patternPos).toBe(12)

    // Release rev
    s.pendingReversing = false
    tickCycle(s) // MUST commit on the very next tick
    expect(s.reversing).toBe(false)
    // patternPos should have INCREMENTED (reversing resolved before advance)
    expect(s.patternPos).toBe(13)
  })

  it('rev ON→OFF round trip: patternPos decrements then resumes forward', () => {
    const s = makeState({ patternPos: 20 })
    // Activate rev
    s.pendingReversing = true
    runTicks(s, 6) // pos 20 → 14
    expect(s.reversing).toBe(true)
    expect(s.patternPos).toBe(14)

    // Release rev
    s.pendingReversing = false
    tickCycle(s) // commit + forward
    expect(s.reversing).toBe(false)
    expect(s.patternPos).toBe(15) // 14 + 1

    // Continue forward — should reach cycle in 32 - 15 = 17 more ticks
    runTicks(s, 16)
    expect(s.pendingCycle).toBe(false)
    tickCycle(s) // 17th tick
    expect(s.pendingCycle).toBe(true)
  })

  it('long rev from start clamps at 0, then needs full pattern', () => {
    const s = makeState({ patternPos: 5, reversing: true })
    runTicks(s, 20) // 5 → 0, then clamped for 15 more ticks
    expect(s.patternPos).toBe(0)

    s.pendingReversing = false
    // Need full 32 ticks from pos=0
    runTicks(s, 31)
    expect(s.pendingCycle).toBe(false)
    tickCycle(s)
    expect(s.pendingCycle).toBe(true)
  })
})
