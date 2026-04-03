/**
 * FX idle detection tests — verify that reverb/delay engines report idle
 * when their tail has fully decayed (output below threshold).
 *
 * This enables the worklet to skip .process() for inactive send FX.
 */
import { describe, it, expect } from 'vitest'
import { SimpleReverb, ModulatedReverb, ShimmerReverb, PingPongDelay, TapeDelay } from './effects.ts'

const SR = 44100

/** Feed N samples of input into a reverb and return final idle state */
function feedReverb(rev: { process(x: number): Float64Array; idle: boolean }, input: number, samples: number): boolean {
  for (let i = 0; i < samples; i++) rev.process(input)
  return rev.idle
}

/** Feed N samples into a delay */
function feedDelay(del: { process(iL: number, iR: number, fb: number): Float64Array; idle: boolean }, input: number, fb: number, samples: number): boolean {
  for (let i = 0; i < samples; i++) del.process(input, input, fb)
  return del.idle
}

describe('FX idle detection', () => {
  describe('SimpleReverb', () => {
    it('reports idle after tail decays', () => {
      const rev = new SimpleReverb(SR)
      rev.setSize(0.5)
      // Feed long enough for comb buffers to fill (longest comb ~1617 samples)
      feedReverb(rev, 0.8, SR * 0.5)
      expect(rev.idle).toBe(false)
      // Feed silence — tail at fb=0.78 decays within ~4s
      feedReverb(rev, 0, SR * 5)
      expect(rev.idle).toBe(true)
    })

    it('exits idle when input arrives', () => {
      const rev = new SimpleReverb(SR)
      // Start idle (zero input)
      feedReverb(rev, 0, 512)
      expect(rev.idle).toBe(true)
      // Feed signal — comb buffers fill, output rises above threshold
      feedReverb(rev, 0.5, SR * 0.1)
      expect(rev.idle).toBe(false)
    })
  })

  describe('ModulatedReverb', () => {
    it('reports idle after tail decays', () => {
      const rev = new ModulatedReverb(SR)
      rev.setSize(0.5)
      feedReverb(rev, 0.8, SR * 0.5)
      expect(rev.idle).toBe(false)
      feedReverb(rev, 0, SR * 5)
      expect(rev.idle).toBe(true)
    })
  })

  describe('ShimmerReverb', () => {
    it('reports idle after tail decays', () => {
      const rev = new ShimmerReverb(SR)
      rev.setSize(0.5)
      rev.setFeedback(0.2)
      rev.setShimmerAmount(0.3)
      // ShimmerReverb.process(inL, inR) — stereo input
      for (let i = 0; i < SR * 0.5; i++) rev.process(0.8, 0.8)
      expect(rev.idle).toBe(false)
      // Shimmer has complex feedback — allow longer decay
      for (let i = 0; i < SR * 8; i++) rev.process(0, 0)
      expect(rev.idle).toBe(true)
    })
  })

  describe('PingPongDelay', () => {
    it('reports idle after feedback decays', () => {
      const del = new PingPongDelay(1000, SR)
      del.setTime(200)
      // Feed long enough for delay to output (200ms latency)
      feedDelay(del, 0.8, 0.5, SR * 1)
      expect(del.idle).toBe(false)
      // fb=0.5, 200ms delay: 0.8 * 0.5^N < 1e-5 needs ~17 repeats = 3.4s
      feedDelay(del, 0, 0.5, SR * 5)
      expect(del.idle).toBe(true)
    })

    it('stays active with high feedback', () => {
      const del = new PingPongDelay(1000, SR)
      del.setTime(200)
      feedDelay(del, 0.8, 0.9, SR * 1)
      // fb=0.9: 0.8 * 0.9^N < 1e-5 needs ~90 repeats = 18s — still active at 2s
      feedDelay(del, 0, 0.9, SR * 2)
      expect(del.idle).toBe(false)
    })
  })

  describe('TapeDelay', () => {
    it('reports idle after feedback decays', () => {
      const del = new TapeDelay(1000, SR)
      del.setTime(200)
      feedDelay(del, 0.8, 0.5, SR * 1)
      expect(del.idle).toBe(false)
      // Tape LP filter attenuates faster than digital — 4s should suffice
      feedDelay(del, 0, 0.5, SR * 5)
      expect(del.idle).toBe(true)
    })
  })
})
