import { describe, it, expect } from 'vitest'
import { HalfBandDown } from './filters.ts'

// HalfBandDown is a 6-tap symmetric FIR for 2× → 1× decimation.
// Coefficients: h = [-1/16, 0, 9/16, 9/16, 0, -1/16]
// Each call to process(even, odd) consumes one pair of samples at 2× SR.
// Frequency response (derivation):
//   H(e^jω) = e^(-j5ω/2) · [9/8·cos(ω/2) - 1/8·cos(5ω/2)]
//   |H(0)| = 1, |H(π)| = 0, |H(π/2)| = 10√2/16 ≈ 0.8839
// (ω is at the 2× rate, so π = 2× Nyquist, π/2 = base-rate Nyquist.)

function steadyState(hbd: HalfBandDown, pairs: Array<[number, number]>, cycles: number): number[] {
  // Run several cycles to flush the delay line, then capture one cycle.
  for (let c = 0; c < cycles; c++) for (const [e, o] of pairs) hbd.process(e, o)
  return pairs.map(([e, o]) => hbd.process(e, o))
}

describe('HalfBandDown', () => {
  it('passes DC with unit gain', () => {
    const hbd = new HalfBandDown()
    // Feed constant 1 at 2× rate: (even=1, odd=1) repeatedly.
    const out = steadyState(hbd, [[1, 1]], 20)
    expect(out[0]).toBeCloseTo(1, 6)
  })

  it('fully rejects 2×-rate Nyquist (ω=π)', () => {
    // x[n] alternates +1, -1, +1, -1, ... → each pair = (+1, -1).
    // True half-band FIR has a zero at ω=π, so output must be ~0.
    // Buggy implementation produces gain = 1.125 here (see issue).
    const hbd = new HalfBandDown()
    const out = steadyState(hbd, [[1, -1]], 20)
    expect(Math.abs(out[0])).toBeLessThan(1e-6)
  })

  it('impulse on an even sample reproduces h[0], h[2]', () => {
    // x[0] = 1, x[else] = 0. Decimated outputs y[k] = Σ h[i]·x[2k-i] should be
    //   y[0] = h[0] = -1/16, y[1] = h[2] = 9/16, y[k>1] = 0.
    const hbd = new HalfBandDown()
    const y0 = hbd.process(1, 0)
    const y1 = hbd.process(0, 0)
    const y2 = hbd.process(0, 0)
    const y3 = hbd.process(0, 0)
    expect(y0).toBeCloseTo(-1 / 16, 8)
    expect(y1).toBeCloseTo(9 / 16, 8)
    expect(y2).toBeCloseTo(0, 8)
    expect(y3).toBeCloseTo(0, 8)
  })

  it('impulse on an odd sample reproduces h[3], h[5]', () => {
    // x[1] = 1, x[else] = 0. y[0]=0, y[1]=h[1]=0, y[2]=h[3]=9/16, y[3]=h[5]=-1/16.
    const hbd = new HalfBandDown()
    const y0 = hbd.process(0, 1)
    const y1 = hbd.process(0, 0)
    const y2 = hbd.process(0, 0)
    const y3 = hbd.process(0, 0)
    const y4 = hbd.process(0, 0)
    expect(y0).toBeCloseTo(0, 8)
    expect(y1).toBeCloseTo(0, 8)
    expect(y2).toBeCloseTo(9 / 16, 8)
    expect(y3).toBeCloseTo(-1 / 16, 8)
    expect(y4).toBeCloseTo(0, 8)
  })

  it('reset() clears the delay line', () => {
    const hbd = new HalfBandDown()
    for (let i = 0; i < 10; i++) hbd.process(1, 1)
    hbd.reset()
    // After reset, first output equals h[0]·even₀ = -1/16 (only newest sample contributes).
    const first = hbd.process(1, 1)
    expect(first).toBeCloseTo(-1 / 16, 6)
  })
})
