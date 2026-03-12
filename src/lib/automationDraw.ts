/**
 * Shared automation editor utilities — canvas drawing, coordinate math,
 * target options, RDP simplification.
 * Used by both AutomationEditor.svelte (scene overlay) and DockAutomationEditor.svelte (dock panel).
 */
import { song, ui } from './state.svelte.ts'
import { VOICE_LIST } from './audio/dsp/voices.ts'
import type { AutomationPoint, AutomationTarget, Pattern } from './types.ts'

// ── Types ────────────────────────────────────────────────────────────

export interface CanvasLayout {
  W: number
  H: number
  PAD: { l: number; r: number; t: number; b: number }
  plotW: number
  plotH: number
}

export type TargetOption = { label: string; target: AutomationTarget }
export type TargetGroup = { group: string; items: TargetOption[] }

export const SNAP_OPTIONS = [
  { value: 0, label: 'OFF' },
  { value: 4, label: '1/4' },
  { value: 8, label: '1/8' },
  { value: 16, label: '1/16' },
] as const

// ── Coordinate conversion ────────────────────────────────────────────

export function toCanvas(layout: CanvasLayout, t: number, v: number): { x: number; y: number } {
  return { x: layout.PAD.l + t * layout.plotW, y: layout.PAD.t + (1 - v) * layout.plotH }
}

export function fromCanvas(layout: CanvasLayout, cx: number, cy: number, snap: number): { t: number; v: number } {
  let t = (cx - layout.PAD.l) / layout.plotW
  let v = 1 - (cy - layout.PAD.t) / layout.plotH
  t = Math.max(0, Math.min(1, t))
  v = Math.max(0, Math.min(1, v))
  if (snap > 0) t = Math.round(t * snap) / snap
  return { t, v }
}

// ── Hit testing ──────────────────────────────────────────────────────

export function hitPoint(layout: CanvasLayout, points: AutomationPoint[], cx: number, cy: number, radius = 8): number {
  for (let i = 0; i < points.length; i++) {
    const p = toCanvas(layout, points[i].t, points[i].v)
    if (Math.hypot(cx - p.x, cy - p.y) < radius) return i
  }
  return -1
}

// ── Ramer-Douglas-Peucker simplification ─────────────────────────────

export function rdpSimplify(pts: { x: number; y: number }[], epsilon: number): { x: number; y: number }[] {
  if (pts.length <= 2) return pts
  let maxDist = 0, maxIdx = 0
  const first = pts[0], last = pts[pts.length - 1]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(pts.slice(0, maxIdx + 1), epsilon)
    const right = rdpSimplify(pts.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

function perpDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 0.001) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
}

// ── Target serialization ─────────────────────────────────────────────

export function targetKey(t: AutomationTarget): string {
  if (t.kind === 'global') return `global:${t.param}`
  if (t.kind === 'track') return `track:${t.trackIndex}:${t.param}`
  if (t.kind === 'fx') return `fx:${t.param}`
  if (t.kind === 'eq') return `eq:${t.band}:${t.param}`
  return `send:${(t as any).trackIndex}:${t.param}`
}

export function findTargetByKey(groups: TargetGroup[], key: string): AutomationTarget | null {
  for (const g of groups) {
    for (const item of g.items) {
      if (targetKey(item.target) === key) return item.target
    }
  }
  return null
}

// ── Voice label helper ───────────────────────────────────────────────

export function getVoiceLabel(trackIndex: number, hostPattern: Pattern | null): string {
  const pat = hostPattern ?? song.patterns[ui.currentPattern]
  const vid = pat?.cells.find(c => c.trackId === trackIndex)?.voiceId
  if (!vid) return ''
  const meta = VOICE_LIST.find(v => v.id === vid)
  return meta?.label ?? vid.slice(0, 4).toUpperCase()
}

// ── Target options builder ───────────────────────────────────────────

export function buildTargetOptions(hostPattern: Pattern | null, opts?: {
  includeSwing?: boolean
  includeMaster?: boolean
  includeEQ?: boolean
}): TargetGroup[] {
  const groups: TargetGroup[] = []

  // Global
  const globalItems: TargetOption[] = [
    { label: 'Tempo', target: { kind: 'global', param: 'tempo' } },
    { label: opts?.includeMaster ? 'Master Vol' : 'Master Volume', target: { kind: 'global', param: 'masterVolume' } },
  ]
  if (opts?.includeSwing) {
    globalItems.push({ label: 'Swing', target: { kind: 'global', param: 'swing' } })
  }
  groups.push({ group: 'Global', items: globalItems })

  // Master bus params
  if (opts?.includeMaster) {
    groups.push({ group: 'Master', items: [
      { label: 'Comp THR', target: { kind: 'global', param: 'compThreshold' } },
      { label: 'Comp RAT', target: { kind: 'global', param: 'compRatio' } },
      { label: 'Comp MKP', target: { kind: 'global', param: 'compMakeup' } },
      { label: 'Comp ATK', target: { kind: 'global', param: 'compAttack' } },
      { label: 'Comp REL', target: { kind: 'global', param: 'compRelease' } },
      { label: 'Duck DPT', target: { kind: 'global', param: 'duckDepth' } },
      { label: 'Duck REL', target: { kind: 'global', param: 'duckRelease' } },
      { label: 'Ret VRB', target: { kind: 'global', param: 'retVerb' } },
      { label: 'Ret DLY', target: { kind: 'global', param: 'retDelay' } },
    ]})
  }

  // Track indices
  const trackIndices: number[] = []
  if (hostPattern) {
    for (const c of hostPattern.cells) { if (c.voiceId) trackIndices.push(c.trackId) }
  } else {
    for (const t of song.tracks) trackIndices.push(t.id)
  }

  // Track params
  const trackItems: TargetOption[] = []
  for (const i of trackIndices) {
    const vl = getVoiceLabel(i, hostPattern)
    trackItems.push({ label: `T${i + 1} ${vl} Vol`, target: { kind: 'track', trackIndex: i, param: 'volume' } })
    trackItems.push({ label: `T${i + 1} ${vl} Pan`, target: { kind: 'track', trackIndex: i, param: 'pan' } })
  }
  if (trackItems.length > 0) groups.push({ group: 'Track', items: trackItems })

  // FX params
  groups.push({ group: 'FX', items: [
    { label: 'Reverb Wet', target: { kind: 'fx', param: 'reverbWet' } },
    { label: 'Reverb Damp', target: { kind: 'fx', param: 'reverbDamp' } },
    { label: opts?.includeMaster ? 'Delay Time' : 'Delay Time', target: { kind: 'fx', param: 'delayTime' } },
    { label: opts?.includeMaster ? 'Delay FB' : 'Delay Feedback', target: { kind: 'fx', param: 'delayFeedback' } },
    { label: opts?.includeMaster ? 'Filter Cut' : 'Filter Cutoff', target: { kind: 'fx', param: 'filterCutoff' } },
    { label: 'Glitch X', target: { kind: 'fx', param: 'glitchX' } },
    { label: 'Glitch Y', target: { kind: 'fx', param: 'glitchY' } },
    { label: opts?.includeMaster ? 'Gran Size' : 'Granular Size', target: { kind: 'fx', param: 'granularSize' } },
    { label: opts?.includeMaster ? 'Gran Dens' : 'Granular Density', target: { kind: 'fx', param: 'granularDensity' } },
  ]})

  // Send params
  const sendItems: TargetOption[] = []
  for (const i of trackIndices) {
    const vl = getVoiceLabel(i, hostPattern)
    sendItems.push({ label: `T${i + 1} ${vl} VrbSnd`, target: { kind: 'send', trackIndex: i, param: 'reverbSend' } })
    sendItems.push({ label: `T${i + 1} ${vl} DlySnd`, target: { kind: 'send', trackIndex: i, param: 'delaySend' } })
    if (!opts?.includeMaster) {
      // Scene editor includes all sends
      sendItems.push({ label: `T${i + 1} ${vl} GltSnd`, target: { kind: 'send', trackIndex: i, param: 'glitchSend' } })
      sendItems.push({ label: `T${i + 1} ${vl} GrnSnd`, target: { kind: 'send', trackIndex: i, param: 'granularSend' } })
    }
  }
  if (sendItems.length > 0) groups.push({ group: 'Send', items: sendItems })

  // EQ params
  if (opts?.includeEQ) {
    groups.push({ group: 'EQ', items: [
      { label: 'Low Freq', target: { kind: 'eq', band: 'eqLow', param: 'freq' } },
      { label: 'Low Gain', target: { kind: 'eq', band: 'eqLow', param: 'gain' } },
      { label: 'Low Q', target: { kind: 'eq', band: 'eqLow', param: 'q' } },
      { label: 'Mid Freq', target: { kind: 'eq', band: 'eqMid', param: 'freq' } },
      { label: 'Mid Gain', target: { kind: 'eq', band: 'eqMid', param: 'gain' } },
      { label: 'Mid Q', target: { kind: 'eq', band: 'eqMid', param: 'q' } },
      { label: 'High Freq', target: { kind: 'eq', band: 'eqHigh', param: 'freq' } },
      { label: 'High Gain', target: { kind: 'eq', band: 'eqHigh', param: 'gain' } },
      { label: 'High Q', target: { kind: 'eq', band: 'eqHigh', param: 'q' } },
    ]})
  }

  return groups
}

// ── Canvas drawing ───────────────────────────────────────────────────

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  layout: CanvasLayout,
  snap: number,
  opts?: { dotted?: boolean; axisLabels?: boolean },
): void {
  const { PAD, plotW, plotH } = layout
  const divisions = snap > 0 ? snap : 4

  ctx.strokeStyle = 'rgba(30, 32, 40, 0.08)'
  ctx.lineWidth = 0.5
  if (opts?.dotted) ctx.setLineDash([2, 4])

  // Vertical (time)
  for (let i = 0; i <= divisions; i++) {
    const x = PAD.l + (i / divisions) * plotW
    ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, PAD.t + plotH); ctx.stroke()
  }
  // Horizontal (value)
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (i / 4) * plotH
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + plotW, y); ctx.stroke()
  }
  if (opts?.dotted) ctx.setLineDash([])

  // Axis labels (scene overlay only)
  if (opts?.axisLabels) {
    ctx.fillStyle = 'rgba(30, 32, 40, 0.3)'
    ctx.font = '7px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('1.0', PAD.l - 3, PAD.t + 5)
    ctx.fillText('0.0', PAD.l - 3, PAD.t + plotH + 1)
    ctx.textAlign = 'center'
    ctx.fillText('0', PAD.l, PAD.t + plotH + 11)
    ctx.fillText('1', PAD.l + plotW, PAD.t + plotH + 11)
  }
}

export function drawCurve(
  ctx: CanvasRenderingContext2D,
  layout: CanvasLayout,
  points: AutomationPoint[],
  interpolation: string,
  color: string,
  opts?: { opacity?: number; lineWidth?: number; fill?: boolean; lineJoin?: CanvasLineJoin; lineCap?: CanvasLineCap },
): void {
  if (points.length < 2) return
  const opacity = opts?.opacity ?? 1
  const lw = opts?.lineWidth ?? 1.5

  ctx.globalAlpha = opacity
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  if (opts?.lineJoin) ctx.lineJoin = opts.lineJoin
  if (opts?.lineCap) ctx.lineCap = opts.lineCap

  ctx.beginPath()
  const p0 = toCanvas(layout, points[0].t, points[0].v)
  ctx.moveTo(p0.x, p0.y)

  if (interpolation === 'smooth' && points.length > 2) {
    for (let i = 0; i < points.length - 1; i++) {
      const curr = toCanvas(layout, points[i].t, points[i].v)
      const next = toCanvas(layout, points[i + 1].t, points[i + 1].v)
      const cpx = (curr.x + next.x) / 2
      ctx.bezierCurveTo(cpx, curr.y, cpx, next.y, next.x, next.y)
    }
  } else {
    for (let i = 1; i < points.length; i++) {
      const p = toCanvas(layout, points[i].t, points[i].v)
      ctx.lineTo(p.x, p.y)
    }
  }
  ctx.stroke()

  // Translucent fill under curve
  if (opts?.fill) {
    const last = toCanvas(layout, points[points.length - 1].t, points[points.length - 1].v)
    ctx.lineTo(last.x, layout.PAD.t + layout.plotH)
    ctx.lineTo(p0.x, layout.PAD.t + layout.plotH)
    ctx.closePath()
    ctx.globalAlpha = opacity * 0.15
    ctx.fillStyle = color
    ctx.fill()
  }

  ctx.globalAlpha = 1
}

export function drawPoints(
  ctx: CanvasRenderingContext2D,
  layout: CanvasLayout,
  points: AutomationPoint[],
  color: string,
  dragIndex: number,
  radius = 3.5,
): void {
  for (let i = 0; i < points.length; i++) {
    const p = toCanvas(layout, points[i].t, points[i].v)
    ctx.beginPath()
    ctx.arc(p.x, p.y, dragIndex === i ? radius + 1.5 : radius, 0, Math.PI * 2)
    ctx.fillStyle = dragIndex === i ? color : 'white'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = radius < 3.5 ? 1 : 1.5
    ctx.stroke()
  }
}

export function drawFreehandPreview(
  ctx: CanvasRenderingContext2D,
  freehandPoints: { x: number; y: number }[],
  color: string,
  opts?: { opacity?: number; lineWidth?: number },
): void {
  if (freehandPoints.length < 2) return
  const lw = opts?.lineWidth ?? 1.5
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.globalAlpha = opts?.opacity ?? 0.6
  ctx.beginPath()
  ctx.moveTo(freehandPoints[0].x, freehandPoints[0].y)
  for (let i = 1; i < freehandPoints.length; i++) {
    ctx.lineTo(freehandPoints[i].x, freehandPoints[i].y)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
}

// ── Target colors (dock editor) ──────────────────────────────────────

const OLIVE  = '#787845'
const BLUE   = '#4472B4'
const SALMON = '#E8A090'
const PURPLE = '#9B6BA0'
const TEAL   = '#4A9B9B'
const AMBER  = 'hsl(35, 80%, 55%)'

export function targetColor(t?: AutomationTarget): string {
  if (!t) return AMBER
  if (t.kind === 'fx') {
    if (t.param.startsWith('reverb')) return OLIVE
    if (t.param.startsWith('delay')) return BLUE
    if (t.param.startsWith('glitch')) return SALMON
    if (t.param.startsWith('granular')) return PURPLE
    if (t.param.startsWith('filter')) return TEAL
  }
  if (t.kind === 'eq') {
    if (t.band === 'eqLow') return OLIVE
    if (t.band === 'eqMid') return BLUE
    if (t.band === 'eqHigh') return SALMON
  }
  if (t.kind === 'global') {
    if (t.param.startsWith('comp')) return OLIVE
    if (t.param.startsWith('duck')) return BLUE
    if (t.param.startsWith('ret')) return SALMON
  }
  if (t.kind === 'track') return TEAL
  if (t.kind === 'send') {
    if (t.param === 'reverbSend') return OLIVE
    if (t.param === 'delaySend') return BLUE
    if (t.param === 'glitchSend') return SALMON
    if (t.param === 'granularSend') return PURPLE
  }
  return AMBER
}

/** Default olive color for scene overlay editor */
export const SCENE_CURVE_COLOR = 'rgba(120, 120, 69, 0.9)'

/** Prepare canvas for HiDPI drawing */
export function initCanvas(canvas: HTMLCanvasElement, W: number, H: number): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const dpr = window.devicePixelRatio || 1
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)
  return ctx
}
