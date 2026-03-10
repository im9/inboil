import { describe, it, expect } from 'vitest'
import { toPixel, bezierEdge, bezierDist, bezierAt, PAT_HALF_W, FN_HALF_W } from './sceneGeometry.ts'

describe('toPixel', () => {
  // PAD_INSET = 32
  it('maps (0,0) to top-left inset', () => {
    const p = toPixel(0, 0, 400, 300)
    expect(p.x).toBe(32)
    expect(p.y).toBe(32)
  })

  it('maps (1,1) to bottom-right inset', () => {
    const p = toPixel(1, 1, 400, 300)
    expect(p.x).toBe(400 - 32)
    expect(p.y).toBe(300 - 32)
  })

  it('maps (0.5,0.5) to center', () => {
    const p = toPixel(0.5, 0.5, 400, 300)
    expect(p.x).toBe(200)
    expect(p.y).toBe(150)
  })
})

describe('bezierEdge', () => {
  it('returns degenerate edge when points are very close', () => {
    const from = { x: 100, y: 100 }
    const to = { x: 100.5, y: 100 }
    const b = bezierEdge(from, to)
    expect(b.p0).toBe(from)
    expect(b.cp).toBe(from)
    expect(b.p1).toBe(to)
  })

  it('offsets endpoints from node centers for pattern nodes', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 200, y: 0 }
    const b = bezierEdge(from, to)
    // Horizontal line: exit offset should be PAT_HALF_W from center
    expect(b.p0.x).toBeCloseTo(PAT_HALF_W, 0)
    expect(b.p1.x).toBeCloseTo(200 - PAT_HALF_W, 0)
  })

  it('uses smaller offsets for function nodes', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 200, y: 0 }
    const b = bezierEdge(from, to, 'fn', 'fn')
    expect(b.p0.x).toBeCloseTo(FN_HALF_W, 0)
    expect(b.p1.x).toBeCloseTo(200 - FN_HALF_W, 0)
  })

  it('produces a control point offset perpendicular to the line', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 200, y: 0 }
    const b = bezierEdge(from, to)
    // For a horizontal line, perpendicular offset is vertical
    expect(b.cp.y).not.toBe(0)
  })
})

describe('bezierAt', () => {
  const b = { p0: { x: 0, y: 0 }, cp: { x: 50, y: 100 }, p1: { x: 100, y: 0 } }

  it('returns start point at t=0', () => {
    const p = bezierAt(b, 0)
    expect(p.x).toBe(0)
    expect(p.y).toBe(0)
  })

  it('returns end point at t=1', () => {
    const p = bezierAt(b, 1)
    expect(p.x).toBe(100)
    expect(p.y).toBe(0)
  })

  it('returns midpoint at t=0.5', () => {
    const p = bezierAt(b, 0.5)
    // Quadratic bezier midpoint: 0.25*p0 + 0.5*cp + 0.25*p1
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeCloseTo(50)
  })
})

describe('bezierDist', () => {
  const b = { p0: { x: 0, y: 0 }, cp: { x: 50, y: 0 }, p1: { x: 100, y: 0 } }

  it('returns 0 for a point on the curve', () => {
    expect(bezierDist(50, 0, b)).toBe(0)
  })

  it('returns distance for a point off the curve', () => {
    const d = bezierDist(50, 10, b)
    expect(d).toBeCloseTo(10, 0)
  })

  it('returns small distance for point near start', () => {
    const d = bezierDist(0, 1, b)
    expect(d).toBeCloseTo(1, 0)
  })
})
