import { describe, it, expect, beforeAll } from 'vitest'
import { drawWaveform } from './domHelpers.ts'

beforeAll(() => {
  // Stub window for Node environment
  if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = { devicePixelRatio: 1 }
  }
})

// Minimal CanvasRenderingContext2D stub
function stubCanvas(): HTMLCanvasElement {
  const calls: string[] = []
  const ctx = {
    setTransform() { calls.push('setTransform') },
    clearRect() { calls.push('clearRect') },
    fillRect() { calls.push('fillRect') },
    beginPath() { calls.push('beginPath') },
    moveTo() {},
    lineTo() {},
    stroke() { calls.push('stroke') },
    arc() {},
    fill() {},
    _calls: calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  }
  return {
    getContext: () => ctx,
    clientWidth: 100,
    clientHeight: 40,
    width: 0,
    height: 0,
  } as unknown as HTMLCanvasElement
}

describe('drawWaveform', () => {
  it('draws without throwing on valid input', () => {
    const canvas = stubCanvas()
    const waveform = new Float32Array([0, 0.5, -0.3, 1.0, -1.0, 0.2])
    expect(() => drawWaveform(canvas, waveform)).not.toThrow()
    // Canvas should have been resized
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
  })

  it('draws slice markers when slices > 0', () => {
    const canvas = stubCanvas()
    const waveform = new Float32Array(128)
    drawWaveform(canvas, waveform, 4)
    const ctx = canvas.getContext('2d') as unknown as { _calls: string[] }
    // Should have multiple stroke calls (waveform + centerline + slices)
    const strokeCount = ctx._calls.filter(c => c === 'stroke').length
    expect(strokeCount).toBeGreaterThanOrEqual(3)
  })

  it('handles empty waveform without error', () => {
    const canvas = stubCanvas()
    expect(() => drawWaveform(canvas, new Float32Array(0))).not.toThrow()
  })

  it('handles null context gracefully', () => {
    const canvas = { getContext: () => null, clientWidth: 100, clientHeight: 40, width: 0, height: 0 } as unknown as HTMLCanvasElement
    expect(() => drawWaveform(canvas, new Float32Array(10))).not.toThrow()
  })
})
