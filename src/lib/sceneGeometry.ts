export type Pt = { x: number; y: number }
export type BezierEdge = { p0: Pt; cp: Pt; p1: Pt }

import { PAD_INSET } from './constants.ts'

export const PAT_HALF_W = 36, PAT_HALF_H = 17
export const FN_HALF_W = 24, FN_HALF_H = 12
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

/** Node size category for edge computation */
export type NodeSizeKind = 'pattern' | 'fn' | 'generative'

function halfSize(kind: NodeSizeKind): { w: number; h: number } {
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
export function drawBezier(ctx: CanvasRenderingContext2D, b: BezierEdge, strokeStyle: string, fillStyle: string, lineWidth: number) {
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(b.p0.x, b.p0.y)
  ctx.quadraticCurveTo(b.cp.x, b.cp.y, b.p1.x, b.p1.y)
  ctx.stroke()
  // Arrowhead: direction at t=1 of quadratic bezier is (p1 - cp)
  const angle = Math.atan2(b.p1.y - b.cp.y, b.p1.x - b.cp.x)
  const al = 7
  ctx.fillStyle = fillStyle
  ctx.beginPath()
  ctx.moveTo(b.p1.x, b.p1.y)
  ctx.lineTo(b.p1.x - al * Math.cos(angle - 0.4), b.p1.y - al * Math.sin(angle - 0.4))
  ctx.lineTo(b.p1.x - al * Math.cos(angle + 0.4), b.p1.y - al * Math.sin(angle + 0.4))
  ctx.closePath(); ctx.fill()
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

import type { SceneNode, SceneDecorator, Pattern, AutomationTarget } from './state.svelte.ts'
import { PATTERN_COLORS } from './constants.ts'

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
  // Legacy function node labels (migration support)
  if (node.type === 'transpose') {
    if (node.params?.mode === 1) return `KEY ${NOTE_NAMES[node.params?.key ?? 0]}`
    const s = node.params?.semitones ?? 0
    return `T${s >= 0 ? '+' : ''}${s}`
  }
  if (node.type === 'tempo') return `×${node.params?.bpm ?? 120}`
  if (node.type === 'repeat') return `RPT${node.params?.count ?? 2}`
  if (node.type === 'probability') return '?%'
  if (node.type === 'fx') {
    const p = node.params ?? {}
    const tags = []
    if (p.verb) tags.push('V')
    if (p.delay) tags.push('D')
    if (p.glitch) tags.push('G')
    if (p.granular) tags.push('R')
    return tags.length > 0 ? `FX ${tags.join('')}` : 'FX'
  }
  if (node.type === 'automation') {
    return '~' + automationTargetLabel(node.automationParams?.target)
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
      return `T ${p.sequence.slice(0, 3).join('·')}`
    }
  }
}

/** Short label for an automation target */
export function automationTargetLabel(target?: AutomationTarget): string {
  if (!target) return 'AUTO'
  switch (target.kind) {
    case 'global': {
      const labels: Record<string, string> = {
        tempo: 'TEMPO', masterVolume: 'VOL', swing: 'SWG',
        compThreshold: 'CMP THR', compRatio: 'CMP RAT', compMakeup: 'CMP MKP',
        compAttack: 'CMP ATK', compRelease: 'CMP REL',
        duckDepth: 'DCK DPT', duckRelease: 'DCK REL', retVerb: 'RET VRB', retDelay: 'RET DLY',
      }
      return labels[target.param] ?? target.param.toUpperCase()
    }
    case 'track':  return `T${target.trackIndex + 1} ${target.param === 'volume' ? 'VOL' : 'PAN'}`
    case 'fx':     return target.param.replace(/([A-Z])/g, ' $1').trim().toUpperCase().slice(0, 8)
    case 'eq':     return `${target.band.replace('eq', '').toUpperCase()} ${target.param.toUpperCase()}`
    case 'send':   return `T${target.trackIndex + 1} ${target.param.replace('Send', '').toUpperCase()}`
    default:       return 'AUTO'
  }
}

/** Get compact label for a decorator (ADR 062) */
export function decoratorLabel(dec: SceneDecorator): string {
  if (dec.type === 'transpose') {
    if (dec.params.mode === 1) return `KEY ${NOTE_NAMES[dec.params.key ?? 0]}`
    const s = dec.params.semitones ?? 0
    return `T${s >= 0 ? '+' : ''}${s}`
  }
  if (dec.type === 'tempo') return `×${dec.params.bpm ?? 120}`
  if (dec.type === 'repeat') return `RPT${dec.params.count ?? 2}`
  if (dec.type === 'fx') {
    const p = dec.params
    const tags = []
    if (p.verb) tags.push('V')
    if (p.delay) tags.push('D')
    if (p.glitch) tags.push('G')
    if (p.granular) tags.push('R')
    return tags.length > 0 ? `FX ${tags.join('')}` : 'FX'
  }
  if (dec.type === 'automation') {
    return '~' + automationTargetLabel(dec.automationParams?.target)
  }
  return '?'
}

/** Accent colors per generative engine (ADR 078) */
const GEN_COLORS: Record<string, string> = {
  turing: '#787845',    // olive
  quantizer: '#458078', // teal
  tonnetz: '#785a87',   // purple
}

/** Get color hex for a pattern node, or engine accent for generative */
export function nodeColor(node: SceneNode, patterns: Pattern[]): string | null {
  if (node.type === 'generative' && node.generative) {
    return GEN_COLORS[node.generative.engine] ?? null
  }
  if (node.type !== 'pattern') return null
  const pat = patterns.find(p => p.id === node.patternId)
  return PATTERN_COLORS[pat?.color ?? 0]
}

/** Get the NodeSizeKind for a scene node */
export function nodeSizeKind(node: SceneNode): NodeSizeKind {
  if (node.type === 'pattern') return 'pattern'
  if (node.type === 'generative') return 'generative'
  return 'fn'
}
