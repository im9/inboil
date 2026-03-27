/**
 * EQ DSP pure functions — biquad frequency response calculations.
 * Extracted from FilterView.svelte for testability and reuse.
 */

const SR = 44100

/** Logarithmic frequency mapping: t ∈ [0,1] → freq ∈ [20, 20000] */
export function tToFreq(t: number): number { return 20 * Math.pow(1000, t) }
export function freqToT(f: number): number { return Math.log(f / 20) / Math.log(1000) }

/** Compute biquad magnitude response from coefficients */
export function biquadMagnitude(freq: number, b0: number, b1: number, b2: number, a1: number, a2: number): number {
  const w = 2 * Math.PI * freq / SR
  const cw = Math.cos(w); const c2w = Math.cos(2 * w)
  const sw = Math.sin(w); const s2w = Math.sin(2 * w)
  const numR = b0 + b1 * cw + b2 * c2w
  const numI = -(b1 * sw + b2 * s2w)
  const denR = 1 + a1 * cw + a2 * c2w
  const denI = -(a1 * sw + a2 * s2w)
  return Math.sqrt((numR * numR + numI * numI) / (denR * denR + denI * denI))
}

/** Peaking EQ band response */
export function peakingResponse(freq: number, centerFreq: number, dBgain: number, Q: number): number {
  if (dBgain === 0) return 1
  const fc = Math.max(1, Math.min(centerFreq, SR * 0.49))
  const A = Math.pow(10, dBgain / 40)
  const w0 = 2 * Math.PI * fc / SR
  const sinw = Math.sin(w0)
  const cosw = Math.cos(w0)
  const alpha = sinw / (2 * Math.max(0.1, Q))
  const a0 = 1 + alpha / A
  const b0 = (1 + alpha * A) / a0
  const b1 = (-2 * cosw) / a0
  const b2 = (1 - alpha * A) / a0
  const a1r = b1
  const a2r = (1 - alpha / A) / a0
  return biquadMagnitude(freq, b0, b1, b2, a1r, a2r)
}

/** Low/high shelf response */
export function shelfResponse(freq: number, centerFreq: number, dBgain: number, Q: number, low: boolean): number {
  if (dBgain === 0) return 1
  const fc = Math.max(1, Math.min(centerFreq, SR * 0.49))
  const A = Math.pow(10, dBgain / 40)
  const w0 = 2 * Math.PI * fc / SR
  const sinw = Math.sin(w0)
  const cosw = Math.cos(w0)
  const alpha = sinw / (2 * Math.max(0.1, Q))
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha
  let b0: number, b1: number, b2: number, a1: number, a2: number
  if (low) {
    const a0 = (A + 1) + (A - 1) * cosw + twoSqrtAAlpha
    b0 = A * ((A + 1) - (A - 1) * cosw + twoSqrtAAlpha) / a0
    b1 = 2 * A * ((A - 1) - (A + 1) * cosw) / a0
    b2 = A * ((A + 1) - (A - 1) * cosw - twoSqrtAAlpha) / a0
    a1 = -2 * ((A - 1) + (A + 1) * cosw) / a0
    a2 = ((A + 1) + (A - 1) * cosw - twoSqrtAAlpha) / a0
  } else {
    const a0 = (A + 1) - (A - 1) * cosw + twoSqrtAAlpha
    b0 = A * ((A + 1) + (A - 1) * cosw + twoSqrtAAlpha) / a0
    b1 = -2 * A * ((A - 1) + (A + 1) * cosw) / a0
    b2 = A * ((A + 1) + (A - 1) * cosw - twoSqrtAAlpha) / a0
    a1 = 2 * ((A - 1) - (A + 1) * cosw) / a0
    a2 = ((A + 1) - (A - 1) * cosw - twoSqrtAAlpha) / a0
  }
  return biquadMagnitude(freq, b0, b1, b2, a1, a2)
}
