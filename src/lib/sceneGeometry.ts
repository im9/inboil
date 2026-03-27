export type Pt = { x: number; y: number }
export type BezierEdge = { p0: Pt; cp: Pt; p1: Pt }

import { PAD_INSET } from './constants.ts'

export const PAT_HALF_W = 36, PAT_HALF_H = 17
export const FN_HALF_W = 18, FN_HALF_H = 18
export const GEN_HALF_W = 60, GEN_HALF_H = 36  // generative node faceplate (ADR 078)

/** Fixed scene world size (independent of viewport) */
export const WORLD_W = 1600, WORLD_H = 1000

/** Convert normalized coords to pixel position for canvas drawing */
export function toPixel(nx: number, ny: number, w: number, h: number) {
  return {
    x: PAD_INSET + nx * (w - PAD_INSET * 2),
    y: PAD_INSET + ny * (h - PAD_INSET * 2),
  }
}

/** Convert client pixel coords to normalized 0–1 scene coords (inverse of toPixel). */
export function toNormScene(
  cx: number, cy: number,
  viewRect: DOMRect,
  panX: number, panY: number,
  zoom: number,
): { x: number; y: number } {
  const canvasX = (cx - viewRect.left - panX) / zoom
  const canvasY = (cy - viewRect.top - panY) / zoom
  return {
    x: Math.max(0, Math.min(1, (canvasX - PAD_INSET) / (WORLD_W - PAD_INSET * 2))),
    y: Math.max(0, Math.min(1, (canvasY - PAD_INSET) / (WORLD_H - PAD_INSET * 2))),
  }
}

/** Node size category for edge computation */
export type NodeSizeKind = 'pattern' | 'fn' | 'generative'

export function halfSize(kind: NodeSizeKind): { w: number; h: number } {
  if (kind === 'generative') return { w: GEN_HALF_W, h: GEN_HALF_H }
  if (kind === 'fn') return { w: FN_HALF_W, h: FN_HALF_H }
  return { w: PAT_HALF_W, h: PAT_HALF_H }
}

/** Compute bezier edge endpoints offset from node centers by half-size toward direction */
export function bezierEdge(from: Pt, to: Pt, fromKind: NodeSizeKind = 'pattern', toKind: NodeSizeKind = 'pattern'): BezierEdge {
  const dx = to.x - from.x, dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return { p0: from, cp: from, p1: to }
  const nx = dx / dist, ny = dy / dist
  const s0 = halfSize(fromKind), s1 = halfSize(toKind)
  const hw0 = s0.w, hh0 = s0.h
  const hw1 = s1.w, hh1 = s1.h
  // Exit/enter at node edge along the line direction
  const r0 = Math.min(hw0 / Math.max(Math.abs(nx), 0.01), hh0 / Math.max(Math.abs(ny), 0.01))
  const r1 = Math.min(hw1 / Math.max(Math.abs(nx), 0.01), hh1 / Math.max(Math.abs(ny), 0.01))
  const p0: Pt = { x: from.x + nx * r0, y: from.y + ny * r0 }
  const p1: Pt = { x: to.x - nx * r1, y: to.y - ny * r1 }
  // Control point: offset perpendicular to the line
  const cx = (p0.x + p1.x) / 2 + dy * 0.15
  const cy = (p0.y + p1.y) / 2 - dx * 0.15
  return { p0, cp: { x: cx, y: cy }, p1 }
}

/** Draw a quadratic bezier edge with arrowhead */
export function drawBezier(ctx: CanvasRenderingContext2D, b: BezierEdge, color: string, lineWidth: number) {
  const angle = Math.atan2(b.p1.y - b.cp.y, b.p1.x - b.cp.x)
  const al = 8
  const spread = 0.28
  // Shorten stroke so butt cap is hidden inside the arrowhead
  const pullback = lineWidth * 2
  const endX = b.p1.x - pullback * Math.cos(angle)
  const endY = b.p1.y - pullback * Math.sin(angle)

  // Stroke (ends inside arrowhead body)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(b.p0.x, b.p0.y)
  ctx.quadraticCurveTo(b.cp.x, b.cp.y, endX, endY)
  ctx.stroke()

  // Arrowhead at original position
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(b.p1.x, b.p1.y)
  ctx.lineTo(b.p1.x - al * Math.cos(angle - spread), b.p1.y - al * Math.sin(angle - spread))
  ctx.lineTo(b.p1.x - al * Math.cos(angle + spread), b.p1.y - al * Math.sin(angle + spread))
  ctx.closePath(); ctx.fill()
}

/** Pre-composite rgba against #EDE8DC background to get an opaque color (avoids alpha overlap artifacts) */
export function flatColor(r: number, g: number, b: number, a: number): string {
  return `rgb(${Math.round(237 + (r - 237) * a)},${Math.round(232 + (g - 232) * a)},${Math.round(220 + (b - 220) * a)})`
}

/** Min distance from point to a quadratic bezier (sample 12 points) */
export function bezierDist(px: number, py: number, b: BezierEdge): number {
  let min = Infinity
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    const u = 1 - t
    const x = u * u * b.p0.x + 2 * u * t * b.cp.x + t * t * b.p1.x
    const y = u * u * b.p0.y + 2 * u * t * b.cp.y + t * t * b.p1.y
    const d = Math.hypot(px - x, py - y)
    if (d < min) min = d
  }
  return min
}

/** Point at t on quadratic bezier */
export function bezierAt(b: BezierEdge, t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * b.p0.x + 2 * u * t * b.cp.x + t * t * b.p1.x,
    y: u * u * b.p0.y + 2 * u * t * b.cp.y + t * t * b.p1.y,
  }
}

// ── Node display helpers ──

import type { SceneNode, Pattern, ModifierType } from './types.ts'
import { PATTERN_COLORS } from './constants.ts'
import { ICON } from './icons.ts'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Get display label for a scene node */
export function nodeName(node: SceneNode, patterns: Pattern[]): string {
  if (node.type === 'pattern') {
    const pat = patterns.find(p => p.id === node.patternId)
    return pat?.name || '---'
  }
  if (node.type === 'generative' && node.generative) {
    return generativeLabel(node.generative)
  }
  // Modifier node labels (ADR 093)
  if (node.type === 'probability') return '?%'
  return modifierLabel(node)
}

/** Get compact label for a modifier node (ADR 093) */
export function modifierLabel(node: SceneNode): string {
  const fp = node.modifierParams
  if (fp?.transpose) {
    if (fp.transpose.mode === 'abs') return `KEY ${NOTE_NAMES[fp.transpose.key ?? 0]}`
    const s = fp.transpose.semitones
    return `T${s >= 0 ? '+' : ''}${s}`
  }
  if (fp?.tempo) return `×${fp.tempo.bpm}`
  if (fp?.repeat) return `RPT${fp.repeat.count}`
  if (fp?.fx) {
    const tags = []
    if (fp.fx.verb) tags.push('V')
    if (fp.fx.delay) tags.push('D')
    if (fp.fx.glitch) tags.push('G')
    if (fp.fx.granular) tags.push('R')
    return tags.length > 0 ? `FX ${tags.join('')}` : 'FX'
  }
  if (fp?.sweep) {
    const n = fp.sweep.curves.length
    return n > 0 ? `SWP ${n}` : 'SWP'
  }
  return '?'
}

/** SVG inner content for a modifier node icon (ADR 110) */
export function modifierIcon(type: ModifierType): string {
  switch (type) {
    case 'transpose': return ICON.transpose
    case 'repeat': return ICON.repeat
    case 'tempo': return ICON.tempo
    case 'fx': return ICON.fx
    case 'sweep': return ICON.sweep
  }
}

/** Short value label for a modifier node (used alongside icon, ADR 110) */
export function modifierValue(node: SceneNode): string {
  const fp = node.modifierParams
  if (fp?.transpose) {
    if (fp.transpose.mode === 'abs') return NOTE_NAMES[fp.transpose.key ?? 0]
    const s = fp.transpose.semitones
    return `${s >= 0 ? '+' : ''}${s}`
  }
  if (fp?.tempo) return `${fp.tempo.bpm}`
  if (fp?.repeat) return `×${fp.repeat.count}`
  if (fp?.fx) {
    const tags = []
    if (fp.fx.verb) tags.push('V')
    if (fp.fx.delay) tags.push('D')
    if (fp.fx.glitch) tags.push('G')
    if (fp.fx.granular) tags.push('R')
    return tags.length > 0 ? tags.join('·') : '—'
  }
  if (fp?.sweep) {
    const n = fp.sweep.curves.length
    return n > 0 ? `${n}` : '—'
  }
  return '?'
}

/** Compact label for a generative node (ADR 078) */
function generativeLabel(gen: NonNullable<SceneNode['generative']>): string {
  switch (gen.engine) {
    case 'turing': {
      const p = gen.params as import('./state.svelte.ts').TuringParams
      return `TM ${p.length}×${p.lock.toFixed(1)}`
    }
    case 'quantizer': {
      const p = gen.params as import('./state.svelte.ts').QuantizerParams
      return `Q ${NOTE_NAMES[p.root]}${p.scale.slice(0, 3)}`
    }
    case 'tonnetz': {
      const p = gen.params as import('./state.svelte.ts').TonnetzParams
      const seq = p.sequence ?? p.slots?.map(s => 'op' in s ? s.op : '♪').slice(0, 3) ?? []
      return `T ${seq.slice(0, 3).join('·')}`
    }
  }
}


/** Accent colors per generative engine (ADR 078) and sweep (ADR 118) */
const GEN_COLORS: Record<string, string> = {
  turing: '#8a9432',    // chartreuse
  quantizer: '#2a9485', // emerald
  tonnetz: '#9456b0',   // violet
  sweep: '#c47a2a',     // amber
}

/** Get color hex for a pattern node, or engine accent for generative */
export function nodeColor(node: SceneNode, patterns: Pattern[]): string | null {
  if (node.type === 'generative' && node.generative) {
    return GEN_COLORS[node.generative.engine] ?? null
  }
  if (node.type === 'sweep') return GEN_COLORS.sweep
  if (node.type !== 'pattern') return null
  const pat = patterns.find(p => p.id === node.patternId)
  return PATTERN_COLORS[pat?.color ?? 0]
}

/** Get the NodeSizeKind for a scene node */
export function nodeSizeKind(node: SceneNode): NodeSizeKind {
  if (node.type === 'pattern') return 'pattern'
  if (node.type === 'generative' || node.type === 'sweep') return 'generative'
  return 'fn'
}
