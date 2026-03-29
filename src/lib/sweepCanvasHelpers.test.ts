import { describe, it, expect } from 'vitest'
import {
  tToX, pointerToNorm, pointerToT,
  isInTimeline, isInToggleLane,
  hitTestPoint, hitTestToggleBoundary, hitTestCurveNearest,
  curveLabel, toggleLabel,
  type CellRef, type CanvasGeometry, type ViewWindow,
} from './sweepCanvasHelpers.ts'
import type { SweepCurve, SweepTarget } from './types.ts'

// ── Fixtures ──

const fullView: ViewWindow = { viewStart: 0, viewSpan: 1 }
const zoomedView: ViewWindow = { viewStart: 0.25, viewSpan: 0.5 }

const geo: CanvasGeometry = {
  rectLeft: 0, rectTop: 0, rectWidth: 800, rectHeight: 400,
}

const TIMELINE_H = 22
const TOGGLE_LANE_H = 28

const cells: CellRef[] = [
  { trackId: 0, name: 'KICK' },
  { trackId: 1, name: 'SNARE' },
  { trackId: 2, name: 'HAT' },
]

// ── tToX ──

describe('tToX', () => {
  it('maps t=0 to x=0 in full view', () => {
    expect(tToX(0, 800, fullView)).toBe(0)
  })

  it('maps t=1 to x=w in full view', () => {
    expect(tToX(1, 800, fullView)).toBe(800)
  })

  it('maps t=0.5 to x=400 in full view', () => {
    expect(tToX(0.5, 800, fullView)).toBe(400)
  })

  it('accounts for zoom', () => {
    // viewStart=0.25, viewSpan=0.5 → t=0.25 maps to x=0, t=0.75 maps to x=800
    expect(tToX(0.25, 800, zoomedView)).toBe(0)
    expect(tToX(0.75, 800, zoomedView)).toBe(800)
    expect(tToX(0.5, 800, zoomedView)).toBe(400)
  })
})

// ── pointerToNorm ──

describe('pointerToNorm', () => {
  it('maps center of draw area to t=0.5, v=0', () => {
    const canvasH = 400
    const drawH = canvasH - TIMELINE_H
    const centerY = TIMELINE_H + drawH / 2
    const result = pointerToNorm(400, centerY, geo, canvasH, TIMELINE_H, fullView)
    expect(result.t).toBeCloseTo(0.5, 5)
    expect(result.v).toBeCloseTo(0, 2)
  })

  it('maps top of draw area to v≈1', () => {
    const canvasH = 400
    const result = pointerToNorm(400, TIMELINE_H, geo, canvasH, TIMELINE_H, fullView)
    expect(result.v).toBeCloseTo(1, 2)
  })

  it('clamps v to [-1, 1]', () => {
    const canvasH = 400
    const result = pointerToNorm(400, 500, geo, canvasH, TIMELINE_H, fullView)
    expect(result.v).toBe(-1)
  })

  it('clamps t to [0, 1]', () => {
    const canvasH = 400
    const left = pointerToNorm(-100, 200, geo, canvasH, TIMELINE_H, fullView)
    const right = pointerToNorm(900, 200, geo, canvasH, TIMELINE_H, fullView)
    expect(left.t).toBe(0)
    expect(right.t).toBe(1)
  })
})

// ── pointerToT ──

describe('pointerToT', () => {
  it('maps left edge to t=viewStart', () => {
    expect(pointerToT(0, geo, fullView)).toBe(0)
  })

  it('maps right edge to t=viewStart+viewSpan', () => {
    expect(pointerToT(800, geo, fullView)).toBe(1)
  })

  it('maps with zoom', () => {
    expect(pointerToT(0, geo, zoomedView)).toBe(0.25)
    expect(pointerToT(800, geo, zoomedView)).toBe(0.75)
  })
})

// ── isInTimeline ──

describe('isInTimeline', () => {
  it('returns true for pointer above timeline boundary', () => {
    expect(isInTimeline(10, geo, 400, TIMELINE_H)).toBe(true)
  })

  it('returns false for pointer below timeline boundary', () => {
    expect(isInTimeline(30, geo, 400, TIMELINE_H)).toBe(false)
  })
})

// ── isInToggleLane ──

describe('isInToggleLane', () => {
  it('returns true for pointer in bottom lane', () => {
    expect(isInToggleLane(390, geo, 400, TOGGLE_LANE_H)).toBe(true)
  })

  it('returns false for pointer above toggle lane', () => {
    expect(isInToggleLane(100, geo, 400, TOGGLE_LANE_H)).toBe(false)
  })
})

// ── hitTestPoint ──

describe('hitTestPoint', () => {
  const points = [
    { t: 0.25, v: 0.5 },
    { t: 0.5, v: 0 },
    { t: 0.75, v: -0.5 },
  ]

  it('returns point index when pointer is within hit radius', () => {
    // Point at t=0.5 → x=400 in full view on 800px canvas
    // Point at v=0 → midpoint of draw area
    const canvasH = 400
    const drawH = canvasH - TIMELINE_H
    const py = (0.5 - 0 / 2) * drawH + TIMELINE_H // v=0 → y = midpoint
    const idx = hitTestPoint(400, py, points, geo, canvasH, TIMELINE_H, fullView, 10)
    expect(idx).toBe(1)
  })

  it('returns -1 when no point is near', () => {
    const idx = hitTestPoint(100, 100, points, geo, 400, TIMELINE_H, fullView, 10)
    expect(idx).toBe(-1)
  })
})

// ── hitTestToggleBoundary ──

describe('hitTestToggleBoundary', () => {
  const togglePoints = [
    { t: 0.25, on: false },
    { t: 0.5, on: true },
    { t: 0.75, on: false },
  ]

  it('returns index when pointer is near a boundary', () => {
    // t=0.5 → x=400 in full view
    const idx = hitTestToggleBoundary(402, togglePoints, geo, fullView, 8)
    expect(idx).toBe(1)
  })

  it('returns -1 when far from all boundaries', () => {
    const idx = hitTestToggleBoundary(100, togglePoints, geo, fullView, 8)
    expect(idx).toBe(-1)
  })

  it('respects custom threshold', () => {
    const idx = hitTestToggleBoundary(395, togglePoints, geo, fullView, 3)
    expect(idx).toBe(-1) // 5px away, threshold is 3
  })
})

// ── hitTestCurveNearest ──

describe('hitTestCurveNearest', () => {
  const curves: SweepCurve[] = [
    { target: { kind: 'fx', param: 'reverbWet' }, points: [{ t: 0, v: 0 }, { t: 1, v: 1 }], color: '#f00' },
    { target: { kind: 'fx', param: 'delayFeedback' }, points: [{ t: 0, v: -0.5 }, { t: 1, v: -0.5 }], color: '#0f0' },
  ]
  const noMute = () => false

  it('returns nearest curve index', () => {
    // norm at t=0.5, v=0.4 → curve[0] evaluates to ~0.5, curve[1] to -0.5
    const idx = hitTestCurveNearest({ t: 0.5, v: 0.4 }, curves, 0.2, noMute)
    expect(idx).toBe(0)
  })

  it('returns -1 when no curve is near', () => {
    const idx = hitTestCurveNearest({ t: 0.5, v: -0.1 }, curves, 0.05, noMute)
    expect(idx).toBe(-1)
  })

  it('skips mute curves', () => {
    const isMute = (c: SweepCurve) => c.target.param === 'reverbWet'
    const idx = hitTestCurveNearest({ t: 0.5, v: 0.4 }, curves, 0.2, isMute)
    expect(idx).toBe(-1)
  })

  it('skips curves with fewer than 2 points', () => {
    const sparse: SweepCurve[] = [
      { target: { kind: 'fx', param: 'reverbWet' }, points: [{ t: 0, v: 0 }], color: '#f00' },
    ]
    const idx = hitTestCurveNearest({ t: 0, v: 0 }, sparse, 0.1, noMute)
    expect(idx).toBe(-1)
  })
})

// ── curveLabel ──

describe('curveLabel', () => {
  it('returns master param label', () => {
    expect(curveLabel({ kind: 'master', param: 'masterVolume' })).toBe('Volume')
    expect(curveLabel({ kind: 'master', param: 'filterCutoff' })).toBe('Filter freq')
  })

  it('returns track param with cell name', () => {
    const target: SweepTarget = { kind: 'track', trackId: 0, param: 'volume' }
    expect(curveLabel(target, cells)).toBe('KICK volume')
  })

  it('falls back to Trk N when no cells provided', () => {
    const target: SweepTarget = { kind: 'track', trackId: 5, param: 'decay' }
    expect(curveLabel(target)).toBe('Trk 6 decay')
  })

  it('returns send param with cell name', () => {
    const target: SweepTarget = { kind: 'send', trackId: 1, param: 'reverbSend' }
    expect(curveLabel(target, cells)).toBe('SNARE verb')
  })

  it('returns fx param label', () => {
    expect(curveLabel({ kind: 'fx', param: 'glitchX' })).toBe('Glitch X')
  })

  it('returns eq band + param label', () => {
    expect(curveLabel({ kind: 'eq', band: 'eqMid', param: 'gain' })).toBe('Mid gain')
  })

  it('returns Unknown for unrecognized target', () => {
    expect(curveLabel({ kind: 'unknown' } as any)).toBe('Unknown')
  })
})

// ── toggleLabel ──

describe('toggleLabel', () => {
  it('returns hold label', () => {
    expect(toggleLabel({ kind: 'hold', fx: 'verb' })).toBe('verb hold')
  })

  it('returns fxOn label', () => {
    expect(toggleLabel({ kind: 'fxOn', fx: 'delay' })).toBe('delay on')
  })

  it('returns mute label with cell name', () => {
    expect(toggleLabel({ kind: 'mute', trackId: 2 }, cells)).toBe('HAT mute')
  })

  it('falls back to Trk N for unknown trackId', () => {
    expect(toggleLabel({ kind: 'mute', trackId: 9 })).toBe('Trk 10 mute')
  })

  it('returns Unknown for unrecognized target', () => {
    expect(toggleLabel({ kind: 'unknown' } as any)).toBe('Unknown')
  })
})
