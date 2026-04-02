/**
 * Pure cycle-detection logic extracted from worklet-processor (ADR 128 style).
 * Testable without AudioWorklet context.
 */

export interface CycleState {
  patternPos: number
  patternLen: number
  reversing: boolean
  pendingReversing: boolean | null
  pendingCycle: boolean
}

/**
 * One base-tick of the cycle detection + pending-state commit logic.
 * Mirrors the block inside `if (this.baseAccum >= this.baseSPS)` in the worklet.
 * Mutates in place for performance parity with worklet context.
 *
 * Rev makes patternPos run backwards (clamped at 0) so that rewound steps
 * are fully accounted for when computing cycle boundaries.
 */
export function tickCycle(s: CycleState): CycleState {
  // Commit reversing FIRST — must resolve before position advance
  // to prevent cycle firing on the same tick rev activates.
  if (s.pendingReversing !== null) {
    s.reversing = s.pendingReversing
    s.pendingReversing = null
  }
  // Rev: patternPos runs backward (clamped at 0) so rewound steps
  // create a proportional time debt before cycle fires.
  if (s.reversing) {
    if (s.patternPos > 0) s.patternPos--
  } else {
    s.patternPos++
  }
  if (s.patternPos >= s.patternLen) {
    s.patternPos = 0
    s.pendingCycle = true
  }
  return s
}
