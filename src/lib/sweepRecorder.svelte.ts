/**
 * Sweep recording engine (ADR 123 Phase 2).
 * Captures real-time parameter movements during scene playback
 * and converts them to SweepCurve/SweepToggleCurve data.
 *
 * Flow: arm → (user touches pad) → playback starts → recording → stop
 */
import { song, playback, pushUndo, playFromNode } from './state.svelte.ts'
import { scenePlayElapsedMs } from './scenePlayback.ts'
import { repositionSatellites } from './sceneActions.ts'
import { buildSweepData, targetKey, setUserControlledChecker, mergeOverdub, mergeOverdubToggles, rdpSimplify, isGlobalTarget } from './sweepEval.ts'
import type { SweepCurve, SweepTarget, SweepToggleCurve, SweepToggleTarget } from './types.ts'

// ── Recording state ──

interface CapturePoint {
  timeMs: number   // performance.now() timestamp
  value: number    // normalized 0–1
}

interface ToggleCapturePoint {
  timeMs: number
  on: boolean
}

interface CurveCapture {
  target: SweepTarget
  color: string
  points: CapturePoint[]
}

interface ToggleCapture {
  target: SweepToggleTarget
  color: string
  points: ToggleCapturePoint[]
}

// Re-export targetKey from sweepEval for external consumers
export { targetKey } from './sweepEval.ts'

export const sweepRec = $state({
  /** 'idle' → 'armed' → 'recording' → 'idle' */
  state: 'idle' as 'idle' | 'armed' | 'recording',
  /** ID of the sweep node being recorded into (null = auto-generate) */
  sweepNodeId: null as string | null,
  /** Pattern node ID the sweep is associated with */
  patternNodeId: null as string | null,
  /** Set of target keys currently being touched by the user */
  userControlled: new Set<string>(),
  /** Elapsed display string for UI */
  elapsedDisplay: '',
  /** Number of parameters being captured (live) */
  captureCount: 0,
  /** Rolling traces for trail strip preview (Phase 4). Max 4 most-recent params. */
  recentTraces: [] as { key: string; label: string; color: string; values: number[] }[],
})

const TRACE_MAX_SAMPLES = 120 // ~2 seconds at 60fps
const TRACE_MAX_VISIBLE = 4

/** Chain metrics — frozen at arm time so stop-time state changes don't affect conversion */
let chainStepsPerPat = 16
let chainRepeatCount = 1

// Register user-controlled checker so pure .ts files can query recording state
// without importing this .svelte.ts module directly
setUserControlledChecker((key: string) => {
  return sweepRec.state === 'recording' && sweepRec.userControlled.has(key)
})

let curveCaptures = new Map<string, CurveCapture>()
let toggleCaptures = new Map<string, ToggleCapture>()
// Global-scope captures (master/fx/eq/fxOn/hold) — ADR 123 Phase 5
let globalCurveCaptures = new Map<string, CurveCapture>()
let globalToggleCaptures = new Map<string, ToggleCapture>()
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let recordingStartMs = 0
/** Progress offset (0–1) — where in the chain playback was when recording started */
let recordingProgressOffset = 0
/** Track scene node ID for chain transition detection */
let lastSceneNodeId: string | null = null
/** Accumulated flush results across chain transitions */
let flushedChains: { sweepNodeId: string | null; patternNodeId: string; curves: SweepCurve[]; toggles: SweepToggleCurve[] }[] = []

// ── Color assignment for new curves ──
const CURVE_COLORS = [
  '#d94030', '#2878c0', '#c8a020', '#28a060',
  '#a838a8', '#e06848', '#1898a0', '#889020',
  '#c07828', '#5858d0', '#20a8a8', '#a0a030',
]
let colorIdx = 0
function nextColor(): string {
  return CURVE_COLORS[colorIdx++ % CURVE_COLORS.length]
}

// ── Short target label (context-free, for trail strip) ──

const SHORT_LABELS: Record<string, string> = {
  masterVolume: 'Vol', swing: 'Swing', compThreshold: 'Comp', compRatio: 'Comp R',
  duckDepth: 'Duck', duckRelease: 'Duck R', retVerb: 'Ret V', retDelay: 'Ret D',
  satDrive: 'Sat', satTone: 'Sat T', filterCutoff: 'Filter', filterResonance: 'Reso',
  reverbWet: 'Verb', reverbDamp: 'Damp', delayTime: 'Dly T', delayFeedback: 'Dly F',
  glitchX: 'Glt X', glitchY: 'Glt Y', granularSize: 'Grn S', granularDensity: 'Grn D',
}

function shortLabel(target: SweepTarget | SweepToggleTarget): string {
  if ('param' in target) {
    if (target.kind === 'track') return `T${(target.trackId ?? 0) + 1} ${target.param}`
    if (target.kind === 'send') return `T${(target.trackId ?? 0) + 1} snd`
    if (target.kind === 'eq') return `${target.band.replace('eq', '')} ${target.param}`
    return SHORT_LABELS[target.param] ?? target.param
  }
  if (target.kind === 'mute') return `T${(target.trackId ?? 0) + 1} mute`
  if (target.kind === 'hold') return `${target.fx} hold`
  return `${target.fx} on`
}

/** Push a value to the trail strip rolling buffer */
function pushTrace(key: string, label: string, color: string, value: number): void {
  let trace = sweepRec.recentTraces.find(t => t.key === key)
  if (!trace) {
    trace = { key, label, color, values: [] }
    sweepRec.recentTraces.push(trace)
  }
  trace.values.push(value)
  if (trace.values.length > TRACE_MAX_SAMPLES) {
    trace.values.splice(0, trace.values.length - TRACE_MAX_SAMPLES)
  }
  // Move this trace to end (most recent) and cap visible count
  const idx = sweepRec.recentTraces.indexOf(trace)
  if (idx >= 0 && idx < sweepRec.recentTraces.length - 1) {
    sweepRec.recentTraces.splice(idx, 1)
    sweepRec.recentTraces.push(trace)
  }
  if (sweepRec.recentTraces.length > TRACE_MAX_VISIBLE) {
    sweepRec.recentTraces.splice(0, sweepRec.recentTraces.length - TRACE_MAX_VISIBLE)
  }
}

// ── Chain duration calculation ──

/** Freeze chain metrics (steps × repeats) at arm time so conversion is stable. */
function freezeChainMetrics(patNodeId: string): void {
  const patNode = song.scene.nodes.find(n => n.id === patNodeId)
  const patId = patNode?.patternId
  const pat = patId != null ? song.patterns.find(p => p.id === patId) : null
  chainStepsPerPat = pat ? Math.max(...pat.cells.map(c => c.steps)) : 16

  // Search modifier nodes attached to this pattern node
  chainRepeatCount = 1
  for (const edge of song.scene.edges) {
    if (edge.to !== patNodeId) continue
    const src = song.scene.nodes.find(n => n.id === edge.from)
    if (src?.type === 'repeat' && src.modifierParams?.repeat) {
      chainRepeatCount = src.modifierParams.repeat.count
      break
    }
  }
}

/** Get current playback progress (0–1) within the chain scope. */
function currentPlaybackProgress(): number {
  if (!playback.playing || playback.mode !== 'scene') return 0
  const patIdx = playback.playingPattern ?? 0
  const pat = song.patterns[patIdx]
  if (!pat) return 0
  const stepsArr = pat.cells.map(c => c.steps)
  const maxSteps = Math.max(...stepsArr)
  const longestIdx = stepsArr.indexOf(maxSteps)
  const currentStep = playback.playheads[longestIdx] ?? 0
  const repTotal = chainRepeatCount || 1
  const repIdx = playback.sceneRepeatIndex
  return Math.max(0, Math.min(1, (repIdx + currentStep / maxSteps) / repTotal))
}

/** Get chain duration in ms using frozen metrics + current BPM. */
function chainDurationMs(): number {
  const msPerStep = 60000 / song.bpm / 4 // 16th note
  return chainStepsPerPat * chainRepeatCount * msPerStep
}

// ── Public API ──

/** Find the pattern node a sweep node is wired to (sweep → pattern edge). */
export function findPatternForSweep(sweepNodeId: string): string | null {
  for (const edge of song.scene.edges) {
    if (edge.from !== sweepNodeId) continue
    const target = song.scene.nodes.find(n => n.id === edge.to)
    if (target?.type === 'pattern' || target?.type === 'generative') return target.id
  }
  return null
}

/** Arm for recording — enters standby state. Playback + recording starts
 *  automatically when the user touches any pad/knob. */
export function armRecording(sweepNodeId: string | null, patternNodeId: string): void {
  if (sweepRec.state !== 'idle') return
  freezeChainMetrics(patternNodeId)
  sweepRec.state = 'armed'
  sweepRec.sweepNodeId = sweepNodeId
  sweepRec.patternNodeId = patternNodeId
  sweepRec.userControlled.clear()
  sweepRec.elapsedDisplay = 'ARMED'
  curveCaptures.clear()
  toggleCaptures.clear()
  globalCurveCaptures.clear()
  globalToggleCaptures.clear()
  colorIdx = 0
}

/** Disarm — cancel armed state without recording. */
export function disarmRecording(): void {
  if (sweepRec.state !== 'armed') return
  resetState()
}

/** Transition from armed → recording. Called internally when user touches a param. */
function beginRecording(): void {
  if (sweepRec.state !== 'armed') return
  const patNodeId = sweepRec.patternNodeId
  if (!patNodeId) { resetState(); return }

  // Start playback if not already playing
  if (!playback.playing) {
    playFromNode(patNodeId)
    recordingProgressOffset = 0 // starting from beginning
  } else {
    // Compute current position within the chain from playback state
    recordingProgressOffset = currentPlaybackProgress()
  }

  sweepRec.state = 'recording'
  recordingStartMs = performance.now()
  sweepRec.elapsedDisplay = '0:00'
  lastSceneNodeId = playback.sceneNodeId ?? patNodeId
  flushedChains = []

  elapsedTimer = setInterval(() => {
    const elapsed = Math.floor((performance.now() - recordingStartMs) / 1000)
    const m = Math.floor(elapsed / 60)
    const s = elapsed % 60
    sweepRec.elapsedDisplay = `${m}:${s.toString().padStart(2, '0')}`
  }, 250)
}

/** Stop recording and write captured data to sweep node. */
export function stopRecording(): void {
  if (sweepRec.state === 'armed') { disarmRecording(); return }
  if (sweepRec.state !== 'recording') return

  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }

  const patNodeId = sweepRec.patternNodeId
  if (!patNodeId) { resetState(); return }

  // Convert remaining chain-scoped captures
  const duration = chainDurationMs()
  const newCurves = convertCurveCaptures(duration)
  const newToggles = convertToggleCaptures(duration)

  // Collect all chains: flushed (from transitions) + current
  if (newCurves.length > 0 || newToggles.length > 0) {
    flushedChains.push({
      sweepNodeId: sweepRec.sweepNodeId,
      patternNodeId: patNodeId,
      curves: newCurves,
      toggles: newToggles,
    })
  }

  // Convert global-scoped captures (ADR 123 Phase 5)
  // Global captures use total recording elapsed time as duration
  const totalRecMs = performance.now() - recordingStartMs
  const globalCurves = convertGlobalCurveCaptures(totalRecMs)
  const globalToggles = convertGlobalToggleCaptures(totalRecMs)

  const hasChainData = flushedChains.length > 0
  const hasGlobalData = globalCurves.length > 0 || globalToggles.length > 0

  if (!hasChainData && !hasGlobalData) { resetState(); return }

  // Single undo snapshot before any mutations
  pushUndo('sweep recording')

  // Write chain-scoped captures to their respective sweep nodes
  for (const chain of flushedChains) {
    let nodeId = chain.sweepNodeId
    if (!nodeId) {
      nodeId = sceneAddModifierNoUndo(chain.patternNodeId)
    }
    if (!nodeId) continue

    const node = song.scene.nodes.find(n => n.id === nodeId)
    const existing = node?.modifierParams?.sweep ?? { curves: [] }

    const mergedCurves = mergeOverdub(existing.curves, chain.curves)
    const mergedToggles = mergeOverdubToggles(existing.toggles ?? [], chain.toggles)

    if (node) {
      node.modifierParams = { ...node.modifierParams, sweep: buildSweepData(mergedCurves, mergedToggles) }
    }
  }

  // Write global-scoped captures to scene.globalSweep (ADR 123 Phase 5)
  if (hasGlobalData) {
    const existing = song.scene.globalSweep ?? { curves: [] }
    const mergedCurves = mergeOverdub(existing.curves, globalCurves)
    const mergedToggles = mergeOverdubToggles(existing.toggles ?? [], globalToggles)
    const data = buildSweepData(mergedCurves, mergedToggles)
    data.durationMs = totalRecMs
    // Store offset from scene play start so playback aligns correctly
    data.offsetMs = scenePlayElapsedMs() - totalRecMs
    song.scene.globalSweep = data
  }

  resetState()
}

// ── Chain transition detection (ADR 123 §3) ──

/** Check if scene playback has moved to a different pattern node.
 *  If so, flush current captures and switch recording target. */
function checkChainTransition(): void {
  if (sweepRec.state !== 'recording') return
  const currentNodeId = playback.sceneNodeId
  if (!currentNodeId || currentNodeId === lastSceneNodeId) return

  // Scene node changed — flush captures for the old chain
  if (lastSceneNodeId && (curveCaptures.size > 0 || toggleCaptures.size > 0)) {
    const duration = chainDurationMs()
    const curves = convertCurveCaptures(duration)
    const toggles = convertToggleCaptures(duration)
    if (curves.length > 0 || toggles.length > 0) {
      flushedChains.push({
        sweepNodeId: sweepRec.sweepNodeId,
        patternNodeId: sweepRec.patternNodeId!,
        curves,
        toggles,
      })
    }
    curveCaptures.clear()
    toggleCaptures.clear()
    sweepRec.userControlled.clear()
  }

  // Switch to new chain
  lastSceneNodeId = currentNodeId
  // Find sweep node for the new pattern node (if one exists)
  const newPatNode = song.scene.nodes.find(n => n.id === currentNodeId)
  if (newPatNode && (newPatNode.type === 'pattern' || newPatNode.type === 'generative')) {
    sweepRec.patternNodeId = currentNodeId
    // Find existing sweep node for this pattern
    let newSweepId: string | null = null
    for (const edge of song.scene.edges) {
      if (edge.to !== currentNodeId) continue
      const src = song.scene.nodes.find(n => n.id === edge.from)
      if (src?.type === 'sweep') { newSweepId = src.id; break }
    }
    sweepRec.sweepNodeId = newSweepId
    freezeChainMetrics(currentNodeId)
    recordingStartMs = performance.now()
    recordingProgressOffset = 0 // new chain starts from beginning
  }
}

/** Report that the user is touching a continuous parameter.
 *  If armed, triggers playback + recording start. */
export function captureValue(target: SweepTarget, value: number, color?: string): void {
  if (sweepRec.state === 'idle') return
  if (sweepRec.state === 'armed') beginRecording()
  if (sweepRec.state !== 'recording') return
  checkChainTransition()

  const key = targetKey(target)
  sweepRec.userControlled.add(key)

  const captures = isGlobalTarget(target) ? globalCurveCaptures : curveCaptures
  let capture = captures.get(key)
  if (!capture) {
    capture = { target, color: color ?? nextColor(), points: [] }
    captures.set(key, capture)
  }
  capture.points.push({ timeMs: performance.now(), value })
  sweepRec.captureCount = curveCaptures.size + toggleCaptures.size + globalCurveCaptures.size + globalToggleCaptures.size
  pushTrace(key, shortLabel(target), capture.color, value)
}

/** Report that the user toggled a boolean parameter.
 *  If armed, triggers playback + recording start. */
export function captureToggle(target: SweepToggleTarget, on: boolean, color?: string): void {
  if (sweepRec.state === 'idle') return
  if (sweepRec.state === 'armed') beginRecording()
  if (sweepRec.state !== 'recording') return
  checkChainTransition()

  const key = targetKey(target)
  sweepRec.userControlled.add(key)

  const captures = isGlobalTarget(target) ? globalToggleCaptures : toggleCaptures
  let capture = captures.get(key)
  if (!capture) {
    capture = { target, color: color ?? nextColor(), points: [] }
    captures.set(key, capture)
  }
  capture.points.push({ timeMs: performance.now(), on })
  sweepRec.captureCount = curveCaptures.size + toggleCaptures.size + globalCurveCaptures.size + globalToggleCaptures.size
  pushTrace(key, shortLabel(target), capture.color, on ? 1 : 0)
}


// ── Conversion: ms timestamps → normalized t using BPM-based chain duration ──

function convertCurveCaptures(duration: number): SweepCurve[] {
  const result: SweepCurve[] = []
  for (const capture of curveCaptures.values()) {
    if (capture.points.length < 2) continue
    let points = capture.points.map(p => ({
      t: Math.max(0, Math.min(1, recordingProgressOffset + (p.timeMs - recordingStartMs) / duration)),
      v: p.value, // 0–1 absolute normalized value
    }))
    points = rdpSimplify(points, 0.02)
    result.push({ target: capture.target, points, color: capture.color })
  }
  return result
}

function convertToggleCaptures(duration: number): SweepToggleCurve[] {
  const result: SweepToggleCurve[] = []
  for (const capture of toggleCaptures.values()) {
    if (capture.points.length === 0) continue
    const points = capture.points.map(p => ({
      t: Math.max(0, Math.min(1, recordingProgressOffset + (p.timeMs - recordingStartMs) / duration)),
      on: p.on,
    }))
    result.push({ target: capture.target, points, color: capture.color })
  }
  return result
}

// ── Global capture conversion (ADR 123 Phase 5) ──
// Global captures normalize t to the total recording elapsed time (not chain duration)

function convertGlobalCurveCaptures(totalMs: number): SweepCurve[] {
  const result: SweepCurve[] = []
  if (totalMs <= 0) return result
  for (const capture of globalCurveCaptures.values()) {
    if (capture.points.length < 2) continue
    let points = capture.points.map(p => ({
      t: Math.max(0, Math.min(1, (p.timeMs - recordingStartMs) / totalMs)),
      v: p.value, // 0–1 absolute normalized value
    }))
    points = rdpSimplify(points, 0.02)
    result.push({ target: capture.target, points, color: capture.color })
  }
  return result
}

function convertGlobalToggleCaptures(totalMs: number): SweepToggleCurve[] {
  const result: SweepToggleCurve[] = []
  if (totalMs <= 0) return result
  for (const capture of globalToggleCaptures.values()) {
    if (capture.points.length === 0) continue
    const points = capture.points.map(p => ({
      t: Math.max(0, Math.min(1, (p.timeMs - recordingStartMs) / totalMs)),
      on: p.on,
    }))
    // Quantize perf toggle points to bar boundaries (ADR 128 Phase 2)
    const isPerfTarget = 'param' in capture.target && capture.target.kind === 'perf'
    if (isPerfTarget) {
      quantizeTogglePointsToBar(points, totalMs)
    }
    result.push({ target: capture.target, points, color: capture.color })
  }
  return result
}

/** Snap toggle point t-values to the nearest bar boundary (ADR 128 Phase 2).
 *  Mutates points in place. */
function quantizeTogglePointsToBar(points: { t: number; on: boolean }[], totalMs: number): void {
  quantizeTogglePoints(points, totalMs, song.bpm)
}

/** Pure quantize helper — snap toggle t-values to nearest bar boundary.
 *  Exported for testability. */
export function quantizeTogglePoints(points: { t: number; on: boolean }[], totalMs: number, bpm: number): void {
  const msPerBar = (60000 / bpm) * 4
  const barT = msPerBar / totalMs
  if (barT <= 0) return
  for (const p of points) {
    p.t = Math.max(0, Math.min(1, Math.round(p.t / barT) * barT))
  }
}

// ── Internal ──

/** Create a sweep modifier node without its own pushUndo (caller handles undo). */
function sceneAddModifierNoUndo(patternNodeId: string): string | null {
  const patNode = song.scene.nodes.find(n => n.id === patternNodeId)
  if (!patNode) return null
  const id = `fn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const node = {
    id,
    type: 'sweep' as const,
    x: patNode.x,
    y: patNode.y - 0.04,
    root: false,
    modifierParams: { sweep: { curves: [] as SweepCurve[] } },
  }
  song.scene.nodes.push(node)
  // Replace existing sweep on this pattern
  for (const edge of song.scene.edges) {
    if (edge.to !== patternNodeId) continue
    const src = song.scene.nodes.find(n => n.id === edge.from)
    if (src?.type === 'sweep') {
      const edgeIdx = song.scene.edges.findIndex(e => e.from === src.id)
      if (edgeIdx >= 0) song.scene.edges.splice(edgeIdx, 1)
      const nodeIdx = song.scene.nodes.findIndex(n => n.id === src.id)
      if (nodeIdx >= 0) song.scene.nodes.splice(nodeIdx, 1)
      break
    }
  }
  song.scene.edges.push({ id: `e_${id}`, from: id, to: patternNodeId, order: 0 })
  repositionSatellites(patternNodeId)
  return id
}

function resetState(): void {
  sweepRec.state = 'idle'
  sweepRec.sweepNodeId = null
  sweepRec.patternNodeId = null
  sweepRec.userControlled.clear()
  sweepRec.elapsedDisplay = ''
  sweepRec.captureCount = 0
  sweepRec.recentTraces.length = 0
  curveCaptures.clear()
  toggleCaptures.clear()
  globalCurveCaptures.clear()
  globalToggleCaptures.clear()
  lastSceneNodeId = null
  flushedChains = []
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
}
