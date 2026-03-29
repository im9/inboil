/**
 * Pure helper functions extracted from SweepCanvas.svelte for testability.
 * No reactive state dependencies — all inputs passed as parameters.
 */

import type { SweepCurve, SweepTarget, SweepToggleTarget } from './types.ts'
import { evaluateCurve } from './sweepEval.ts'

// ── Types for parameterized helpers ──

/** Minimal cell info needed for label generation */
export interface CellRef { trackId: number; name: string }

/** Canvas geometry needed by hit-test helpers */
export interface CanvasGeometry {
  rectLeft: number
  rectTop: number
  rectWidth: number
  rectHeight: number
}

/** View window (zoom state) */
export interface ViewWindow {
  viewStart: number
  viewSpan: number
}

// ── Coordinate transforms ──

/** Convert normalized t coordinate to canvas pixel x */
export function tToX(t: number, w: number, vw: ViewWindow): number {
  return ((t - vw.viewStart) / vw.viewSpan) * w
}

/** Convert pointer screen coordinates to normalized curve coordinates */
export function pointerToNorm(
  clientX: number, clientY: number,
  geo: CanvasGeometry, canvasH: number, timelineH: number,
  vw: ViewWindow,
): { t: number; v: number } {
  const scaleY = geo.rectHeight / canvasH
  const tlH = timelineH * scaleY
  const screenT = (clientX - geo.rectLeft) / geo.rectWidth
  const t = Math.max(0, Math.min(1, vw.viewStart + screenT * vw.viewSpan))
  const drawTop = geo.rectTop + tlH
  const drawHeight = geo.rectHeight - tlH
  const y = (clientY - drawTop) / drawHeight
  const v = Math.max(0, Math.min(1, 1 - y))
  return { t, v }
}

/** Convert pointer x to normalized t value */
export function pointerToT(
  clientX: number, geo: CanvasGeometry, vw: ViewWindow,
): number {
  const screenT = (clientX - geo.rectLeft) / geo.rectWidth
  return Math.max(0, Math.min(1, vw.viewStart + screenT * vw.viewSpan))
}

/** Test if pointer y is within the timeline header */
export function isInTimeline(
  clientY: number, geo: CanvasGeometry, canvasH: number, timelineH: number,
): boolean {
  const tlH = timelineH * (geo.rectHeight / canvasH)
  return (clientY - geo.rectTop) < tlH
}

/** Test if pointer y is within the toggle lane at the bottom */
export function isInToggleLane(
  clientY: number, geo: CanvasGeometry, canvasH: number, toggleLaneH: number,
): boolean {
  const laneTop = geo.rectTop + geo.rectHeight - toggleLaneH * (geo.rectHeight / canvasH)
  return clientY >= laneTop
}

// ── Hit-test calculations ──

/** Hit-test curve anchor points — returns point index or -1 */
export function hitTestPoint(
  clientX: number, clientY: number,
  points: readonly { t: number; v: number }[],
  geo: CanvasGeometry, canvasH: number, timelineH: number,
  vw: ViewWindow, hitRadius: number,
): number {
  const w = geo.rectWidth
  const tlH = timelineH * (geo.rectHeight / canvasH)
  const drawH = geo.rectHeight - tlH
  for (let i = 0; i < points.length; i++) {
    const px = tToX(points[i].t, w, vw)
    const py = (1 - points[i].v) * drawH + tlH
    const dx = clientX - geo.rectLeft - px
    const dy = clientY - geo.rectTop - py
    if (Math.sqrt(dx * dx + dy * dy) < hitRadius) return i
  }
  return -1
}

/** Hit-test toggle boundary handles — returns point index or -1 */
export function hitTestToggleBoundary(
  clientX: number,
  togglePoints: readonly { t: number; on: boolean }[],
  geo: CanvasGeometry, vw: ViewWindow, threshold = 8,
): number {
  const w = geo.rectWidth
  for (let i = 0; i < togglePoints.length; i++) {
    const bx = tToX(togglePoints[i].t, w, vw)
    const dx = Math.abs(clientX - geo.rectLeft - bx)
    if (dx < threshold) return i
  }
  return -1
}

/** Hit-test which curve is nearest to pointer — returns index or -1 */
export function hitTestCurveNearest(
  norm: { t: number; v: number },
  curves: readonly SweepCurve[],
  hitDist: number,
  isMuteCurve: (c: SweepCurve) => boolean,
): number {
  let bestIdx = -1
  let bestDist = hitDist
  for (let ci = 0; ci < curves.length; ci++) {
    const curve = curves[ci]
    if (isMuteCurve(curve)) continue
    if (curve.points.length < 2) continue
    const v = evaluateCurve(curve.points, norm.t)
    const dist = Math.abs(v - norm.v)
    if (dist < bestDist) { bestDist = dist; bestIdx = ci }
  }
  return bestIdx
}

// ── Label generators ──

const MASTER_LABELS: Record<string, string> = {
  masterVolume: 'Volume', swing: 'Swing', compThreshold: 'Comp thr', compRatio: 'Comp rat',
  duckDepth: 'Duck dep', duckRelease: 'Duck rel', retVerb: 'Ret verb', retDelay: 'Ret dly',
  satDrive: 'Sat drv', satTone: 'Sat tone', filterCutoff: 'Filter freq', filterResonance: 'Filter reso',
}

const FX_LABELS: Record<string, string> = {
  reverbWet: 'Verb wet', reverbDamp: 'Verb damp', delayTime: 'Dly time', delayFeedback: 'Dly feed',
  glitchX: 'Glitch X', glitchY: 'Glitch Y', granularSize: 'Gran size', granularDensity: 'Gran dens',
}

const SEND_LABELS: Record<string, string> = {
  reverbSend: 'verb', delaySend: 'dly', glitchSend: 'glitch', granularSend: 'grain',
}

const BAND_LABELS: Record<string, string> = { eqLow: 'Low', eqMid: 'Mid', eqHigh: 'High' }

/** Human-readable label for a sweep curve target */
export function curveLabel(target: SweepTarget, cells?: readonly CellRef[]): string {
  if (target.kind === 'master') return MASTER_LABELS[target.param] ?? target.param
  if (target.kind === 'track') {
    const name = cells?.find(c => c.trackId === target.trackId)?.name || `Trk ${target.trackId + 1}`
    return `${name} ${target.param}`
  }
  if (target.kind === 'send') {
    const name = cells?.find(c => c.trackId === target.trackId)?.name || `Trk ${target.trackId + 1}`
    return `${name} ${SEND_LABELS[target.param] ?? target.param}`
  }
  if (target.kind === 'fx') return FX_LABELS[target.param] ?? target.param
  if (target.kind === 'eq') return `${BAND_LABELS[target.band] ?? target.band} ${target.param}`
  return 'Unknown'
}

const PERF_LABELS: Record<string, string> = { fill: 'Fill', rev: 'Reverse', brk: 'Break' }

/** Human-readable label for a sweep toggle target */
export function toggleLabel(target: SweepToggleTarget, cells?: readonly CellRef[]): string {
  if (target.kind === 'hold') return `${target.fx} hold`
  if (target.kind === 'fxOn') return `${target.fx} on`
  if (target.kind === 'mute') {
    const name = cells?.find(c => c.trackId === target.trackId)?.name || `Trk ${target.trackId + 1}`
    return `${name} mute`
  }
  if (target.kind === 'perf') return PERF_LABELS[target.param] ?? target.param
  return 'Unknown'
}
