/**
 * Scene playback engine — graph traversal, modifier application, generative chains.
 * Extracted from state.svelte.ts for modularity.
 */
import { song, bumpSongVersion, playback, ui, fxPad, fxFlavours, cellForTrack, masterPad, perf } from './state.svelte.ts'
import { snapshotAutomationTargets, restoreAutomationSnapshot } from './automation.ts'
import { executeGenChain, findNode } from './sceneActions.ts'
import { getParamDefs } from './paramDefs.ts'
import type { SceneNode, SceneEdge, SweepData, VoiceId } from './types.ts'

// ── Scene helpers ───────────────────────────────────────────────────

/** True when scene has a root node → use graph traversal instead of linear sections */
export function hasScenePlayback(): boolean {
  return song.scene.nodes.some(n => n.root)
}

function sceneRootNode(): SceneNode | undefined {
  return song.scene.nodes.find(n => n.root)
}

/** Returns the pattern index currently being played by the engine */
export function currentlyPlayingIndex(): number {
  if (!playback.playing) return -1
  const soloIdx = soloPatternIndex()
  if (soloIdx != null) return soloIdx
  if (playback.mode === 'scene') {
    return playback.playingPattern ?? -1
  }
  return playback.playingPattern ?? ui.currentPattern
}

/** True when the viewed pattern is the one the engine is actually playing */
export function isViewingPlayingPattern(): boolean {
  return playback.playing && ui.currentPattern === currentlyPlayingIndex()
}

/** Resolve soloNodeId to a pattern index, or null if invalid */
export function soloPatternIndex(): number | null {
  if (!playback.soloNodeId) return null
  const node = findNode(playback.soloNodeId)
  if (!node || node.type !== 'pattern') return null
  const idx = song.patterns.findIndex(p => p.id === node.patternId)
  return idx >= 0 ? idx : null
}

// ── Modifiers // ── Modifier nodes & generative chains generative chains (ADR 093) ────────────────────

/** Apply a modifier node's effect during scene traversal (pass-through) */
function applyModifierNode(node: SceneNode): void {
  const fp = node.modifierParams
  if (!fp) return
  if (fp.transpose) {
    if (fp.transpose.mode === 'abs') {
      playback.sceneAbsoluteKey = fp.transpose.key ?? 0
    } else {
      playback.sceneTranspose += fp.transpose.semitones
    }
  }
  if (fp.tempo) {
    bumpSongVersion()
    song.bpm = fp.tempo.bpm
  }
  if (fp.repeat) {
    playback.sceneRepeatLeft = fp.repeat.count - 1
    playback.sceneRepeatTotal = fp.repeat.count
    playback.sceneRepeatIndex = 0
  }
  if (fp.fx) {
    fxPad.verb.on     = fp.fx.verb
    fxPad.delay.on    = fp.fx.delay
    fxPad.glitch.on   = fp.fx.glitch
    fxPad.granular.on = fp.fx.granular
    if (fp.fx.flavourOverrides) {
      if (fp.fx.flavourOverrides.verb)     fxFlavours.verb     = fp.fx.flavourOverrides.verb
      if (fp.fx.flavourOverrides.delay)    fxFlavours.delay    = fp.fx.flavourOverrides.delay
      if (fp.fx.flavourOverrides.glitch)   fxFlavours.glitch   = fp.fx.flavourOverrides.glitch
      if (fp.fx.flavourOverrides.granular) fxFlavours.granular = fp.fx.flavourOverrides.granular
    }
  }
}

/** True if node type is a pass-through modifier node */
function isModifierNode(node: SceneNode): boolean {
  return node.type === 'transpose' || node.type === 'tempo' || node.type === 'repeat' || node.type === 'fx' || node.type === 'sweep'
}

/** Apply satellite modifier nodes attached to a pattern node (ADR 110).
 *  FX resets to OFF when no FX modifier node is attached — scoped to pattern. */
function applySatelliteModifiers(patternNodeId: string): void {
  const satellites: SceneNode[] = []
  for (const edge of song.scene.edges) {
    if (edge.to !== patternNodeId) continue
    const src = findNode(edge.from)
    if (src && isModifierNode(src)) satellites.push(src)
  }
  // Reset scoped fn effects if no matching satellite on this pattern
  if (!satellites.some(n => n.type === 'fx')) {
    fxPad.verb.on = false
    fxPad.delay.on = false
    fxPad.glitch.on = false
    fxPad.granular.on = false
  }
  if (!satellites.some(n => n.type === 'transpose')) {
    playback.sceneTranspose = 0
    playback.sceneAbsoluteKey = null
  }
  for (const src of satellites) applyModifierNode(src)
}

/** Apply live-mode generative nodes that feed into a pattern node (ADR 078 Phase 2). */
function applyLiveGenerative(patternNode: SceneNode): void {
  if (patternNode.type !== 'pattern') return
  const pat = song.patterns.find(p => p.id === patternNode.patternId)
  if (!pat || pat.cells.length === 0) return

  const incomingEdges = song.scene.edges.filter(e => e.to === patternNode.id)
  for (const edge of incomingEdges) {
    const srcNode = findNode(edge.from)
    if (!srcNode?.generative) continue

    const chain = collectLiveChain(srcNode.id)
    if (chain.length === 0) continue

    const trackIdx = srcNode.generative.targetTrack ?? 0
    const cell = cellForTrack(pat, trackIdx) ?? pat.cells[0]
    const steps = cell.steps
    const trigs = executeGenChain(chain, cell, steps)
    if (trigs) {
      const lastGen = chain[chain.length - 1].generative!
      const mode = lastGen.mergeMode
      const len = Math.min(cell.trigs.length, trigs.length)
      for (let i = 0; i < len; i++) {
        if (mode === 'replace') {
          cell.trigs[i] = trigs[i]
        } else if (mode === 'merge') {
          if (!cell.trigs[i].active) cell.trigs[i] = trigs[i]
        } else if (mode === 'layer') {
          // Legacy fallback: layer treated as replace (ADR 117)
          cell.trigs[i] = trigs[i]
        }
      }
    }
  }
}

/** Collect generative chain following incoming edges backward, then return in forward order */
function collectLiveChain(startId: string): SceneNode[] {
  const chain: SceneNode[] = []
  const visited = new Set<string>()
  let currentId = startId

  while (true) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const node = findNode(currentId)
    if (!node?.generative) break
    chain.unshift(node)
    const inEdge = song.scene.edges.find(e => e.to === currentId)
    if (!inEdge) break
    const src = findNode(inEdge.from)
    if (!src?.generative) break
    currentId = src.id
  }
  return chain
}

// ── Graph traversal ─────────────────────────────────────────────────

function startSceneNode(node: SceneNode): { advanced: boolean; patternIndex: number; stop?: boolean } {
  playback.sceneNodeId = node.id
  playback.sceneEdgeId = null
  if (playback.automationSnapshot) {
    restoreAutomationSnapshot(playback.automationSnapshot)
    playback.automationSnapshot = null
  }
  if (node.type === 'pattern') {
    applySatelliteModifiers(node.id)  // ADR 110: apply attached fn satellites
    playback.automationSnapshot = snapshotAutomationTargets()
    applyLiveGenerative(node)
    const pi = song.patterns.findIndex(p => p.id === node.patternId)
    const idx = pi >= 0 ? pi : 0
    playback.playingPattern = idx
    return { advanced: true, patternIndex: idx }
  }
  // Modifier nodes: apply effect and follow outgoing edge (pass-through — legacy)
  if (isModifierNode(node)) applyModifierNode(node)
  const edges = song.scene.edges.filter(e => e.from === node.id).sort((a, b) => a.order - b.order)
  if (edges.length > 0) {
    const pick = edges[Math.floor(Math.random() * edges.length)]
    return walkToNode(pick)
  }
  return { advanced: false, patternIndex: -1, stop: true }
}

function walkToNode(edge: SceneEdge): { advanced: boolean; patternIndex: number; stop?: boolean } {
  const visited = new Set<string>()
  let currentEdge = edge

  while (true) {
    const node = findNode(currentEdge.to)
    if (!node || visited.has(node.id)) {
      return { advanced: false, patternIndex: -1, stop: true }
    }
    visited.add(node.id)

    if (node.type === 'pattern') {
      applySatelliteModifiers(node.id)  // ADR 110: apply attached fn satellites
      if (playback.automationSnapshot) {
        restoreAutomationSnapshot(playback.automationSnapshot)
      }
      playback.automationSnapshot = snapshotAutomationTargets()
      applyLiveGenerative(node)
      playback.sceneNodeId = node.id
      playback.sceneEdgeId = currentEdge.id
      const pi = song.patterns.findIndex(p => p.id === node.patternId)
      const idx = pi >= 0 ? pi : 0
      playback.playingPattern = idx
      return { advanced: true, patternIndex: idx }
    }

    // Modifier nodes: apply effect and continue traversal (pass-through)
    if (isModifierNode(node)) applyModifierNode(node)

    const outEdges = song.scene.edges.filter(e => e.from === node.id).sort((a, b) => a.order - b.order)
    if (outEdges.length === 0) {
      return { advanced: false, patternIndex: -1, stop: true }
    }
    currentEdge = outEdges[Math.floor(Math.random() * outEdges.length)]
  }
}

/** Advance graph playback at beat boundary. Called from App.svelte onStep.
 *  Pass startFrom to begin traversal from a specific node instead of root. */
export function advanceSceneNode(startFrom?: string): { advanced: boolean; patternIndex: number; stop?: boolean } {
  const root = sceneRootNode()
  if (!root && !startFrom) return { advanced: false, patternIndex: 0 }

  if (!playback.sceneNodeId) {
    if (startFrom) {
      const node = findNode(startFrom)
      if (node) return startSceneNode(node)
    }
    if (root) return startSceneNode(root)
    return { advanced: false, patternIndex: 0 }
  }

  if (playback.sceneRepeatLeft > 0) {
    playback.sceneRepeatLeft--
    playback.sceneRepeatIndex++
    return { advanced: false, patternIndex: -1 }
  }
  // Reset repeat phase when moving to next node
  playback.sceneRepeatIndex = 0
  playback.sceneRepeatTotal = 1

  const current = findNode(playback.sceneNodeId!)
  if (!current) {
    if (root) return startSceneNode(root)
    return { advanced: false, patternIndex: 0 }
  }

  const outEdges = song.scene.edges
    .filter(e => e.from === current.id)
    .sort((a, b) => a.order - b.order)

  if (outEdges.length === 0) {
    return { advanced: false, patternIndex: -1, stop: true }
  }

  return walkToNode(outEdges[Math.floor(Math.random() * outEdges.length)])
}

// ── Sweep automation (ADR 118) ──────────────────────────────────────

/** Find sweep node connected to a pattern node */
function findConnectedSweep(patternNodeId: string): SweepData | null {
  for (const edge of song.scene.edges) {
    if (edge.to !== patternNodeId) continue
    const src = findNode(edge.from)
    if (src?.type === 'sweep' && src.modifierParams?.sweep) return src.modifierParams.sweep
  }
  return null
}

/** Evaluate a sweep curve at a given progress (0–1) using Catmull-Rom interpolation */
function evaluateCurve(points: { t: number; v: number }[], progress: number): number {
  if (points.length === 0) return 0
  if (progress <= points[0].t) return points[0].v
  if (progress >= points[points.length - 1].t) return points[points.length - 1].v
  for (let i = 0; i < points.length - 1; i++) {
    if (progress >= points[i].t && progress <= points[i + 1].t) {
      const seg = (progress - points[i].t) / (points[i + 1].t - points[i].t)
      if (points.length <= 2) {
        // Linear for 2 points
        return points[i].v + (points[i + 1].v - points[i].v) * seg
      }
      // Catmull-Rom spline for smooth interpolation
      const p0 = points[Math.max(0, i - 1)]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[Math.min(points.length - 1, i + 2)]
      const t2 = seg * seg, t3 = t2 * seg
      return 0.5 * (
        (2 * p1.v) +
        (-p0.v + p2.v) * seg +
        (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * t2 +
        (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * t3
      )
    }
  }
  return 0
}

/** Apply sweep automation for current step. Called from App.svelte onStep.
 *  Uses automation snapshot as base values — offsets are applied relative to snapshot.
 *  Returns true if any parameter was changed. */
export function applySweepStep(step: number, totalSteps: number): boolean {
  if (playback.mode !== 'scene' || !playback.sceneNodeId) return false
  const snap = playback.automationSnapshot
  if (!snap) return false

  const sweepData = findConnectedSweep(playback.sceneNodeId)
  if (!sweepData?.curves.length && !sweepData?.toggles?.length) return false

  const progress = (playback.sceneRepeatIndex + step / totalSteps) / playback.sceneRepeatTotal
  let changed = false

  for (const curve of sweepData.curves) {
    const offset = evaluateCurve(curve.points, progress)

    if (curve.target.kind === 'track') {
      const tgt = curve.target
      const trackIdx = song.tracks.findIndex(t => t.id === tgt.trackId)
      if (trackIdx < 0) continue
      const track = song.tracks[trackIdx]
      const param = curve.target.param
      if (param === 'volume') {
        const base = snap.values[`track:${trackIdx}:volume`] ?? track.volume
        const newVal = clamp(base + offset, 0, 1)
        if (Math.abs(track.volume - newVal) > 0.001) { track.volume = newVal; changed = true }
      } else if (param === 'pan') {
        const base = snap.values[`track:${trackIdx}:pan`] ?? track.pan
        const newVal = clamp(base + offset, -1, 1)
        if (Math.abs(track.pan - newVal) > 0.001) { track.pan = newVal; changed = true }
      } else {
        // Voice params (TONE, CUT, RESO, etc.) — apply offset scaled to param range
        const patIdx = song.patterns.findIndex(p => p.id === song.scene.nodes.find(n => n.id === playback.sceneNodeId)?.patternId)
        const pat = patIdx >= 0 ? song.patterns[patIdx] : null
        const cell = pat?.cells.find(c => c.trackId === tgt.trackId)
        if (cell?.voiceId && cell.voiceParams) {
          const defs = getParamDefs(cell.voiceId as VoiceId)
          const def = defs.find(d => d.key === param)
          if (def) {
            const range = def.max - def.min
            const baseVal = snap.values[`voice:${trackIdx}:${param}`] ?? cell.voiceParams[param] ?? def.default
            const newVal = clamp(baseVal + offset * range, def.min, def.max)
            if (Math.abs((cell.voiceParams[param] ?? def.default) - newVal) > range * 0.001) {
              cell.voiceParams[param] = newVal
              changed = true
            }
          }
        }
      }
    } else if (curve.target.kind === 'master') {
      const param = curve.target.param
      const MASTER_MAP: Record<string, { get: () => number; set: (v: number) => void; snapKey?: string; pad?: string; fxPad?: string; xy?: string }> = {
        masterVolume:  { get: () => perf.masterGain, set: v => { perf.masterGain = v }, snapKey: 'global:masterVolume' },
        swing:         { get: () => perf.swing, set: v => { perf.swing = v }, snapKey: 'global:swing' },
        compThreshold: { get: () => masterPad.comp.x, set: v => { masterPad.comp.x = v }, pad: 'comp', xy: 'x' },
        compRatio:     { get: () => masterPad.comp.y, set: v => { masterPad.comp.y = v }, pad: 'comp', xy: 'y' },
        duckDepth:     { get: () => masterPad.duck.x, set: v => { masterPad.duck.x = v }, pad: 'duck', xy: 'x' },
        duckRelease:   { get: () => masterPad.duck.y, set: v => { masterPad.duck.y = v }, pad: 'duck', xy: 'y' },
        retVerb:       { get: () => masterPad.ret.x, set: v => { masterPad.ret.x = v }, pad: 'ret', xy: 'x' },
        retDelay:      { get: () => masterPad.ret.y, set: v => { masterPad.ret.y = v }, pad: 'ret', xy: 'y' },
        satDrive:      { get: () => masterPad.sat.x, set: v => { masterPad.sat.x = v }, pad: 'sat', xy: 'x' },
        satTone:       { get: () => masterPad.sat.y, set: v => { masterPad.sat.y = v }, pad: 'sat', xy: 'y' },
        filterCutoff:  { get: () => fxPad.filter.x, set: v => { fxPad.filter.x = v }, fxPad: 'filter', xy: 'x' },
        filterResonance: { get: () => fxPad.filter.y, set: v => { fxPad.filter.y = v }, fxPad: 'filter', xy: 'y' },
      }
      const m = MASTER_MAP[param]
      if (m) {
        const base = m.snapKey
          ? (snap.values[m.snapKey] ?? m.get())
          : 'fxPad' in m
            ? (snap.fxPad as Record<string, Record<string, number | boolean>>)?.[m.fxPad!]?.[m.xy!] as number ?? m.get()
            : (snap.masterPad as Record<string, Record<string, number | boolean>>)?.[m.pad!]?.[m.xy!] as number ?? m.get()
        const newVal = clamp(base + offset, 0, 1)
        if (Math.abs(m.get() - newVal) > 0.001) { m.set(newVal); changed = true }
      }
    } else if (curve.target.kind === 'send') {
      const tgt = curve.target
      const trackIdx = song.tracks.findIndex(t => t.id === tgt.trackId)
      if (trackIdx < 0) continue
      const patIdx = song.patterns.findIndex(p => p.id === song.scene.nodes.find(n => n.id === playback.sceneNodeId)?.patternId)
      const pat = patIdx >= 0 ? song.patterns[patIdx] : null
      const cell = pat?.cells.find(c => c.trackId === tgt.trackId)
      if (cell) {
        const param = tgt.param
        const base = snap.values[`send:${trackIdx}:${param}`] ?? cell[param]
        const newVal = clamp(base + offset, 0, 1)
        if (Math.abs(cell[param] - newVal) > 0.001) { cell[param] = newVal; changed = true }
      }
    } else if (curve.target.kind === 'fx') {
      const param = curve.target.param
      const fxSnap = snap.fxPad
      const FX_MAP: Record<string, [string, string]> = {
        reverbWet: ['verb', 'x'], reverbDamp: ['verb', 'y'],
        delayTime: ['delay', 'x'], delayFeedback: ['delay', 'y'],
        glitchX: ['glitch', 'x'], glitchY: ['glitch', 'y'],
        granularSize: ['granular', 'x'], granularDensity: ['granular', 'y'],
      }
      const mapping = FX_MAP[param]
      if (mapping) {
        const [pad, key] = mapping
        const base = fxSnap[pad]?.[key] as number ?? 0.5
        ;(fxPad[pad as keyof typeof fxPad] as Record<string, number | boolean>)[key] = clamp(base + offset, 0, 1)
        changed = true
      }
    } else if (curve.target.kind === 'eq') {
      const { band, param } = curve.target
      const eqSnap = snap.fxPad[band]
      const eqPad = fxPad[band]
      if (eqSnap && eqPad) {
        const key = param === 'freq' ? 'x' : param === 'gain' ? 'y' : 'q'
        const base = eqSnap[key] as number ?? (key === 'q' ? 1.5 : 0.5)
        const newVal = clamp(base + offset, 0, key === 'q' ? 3 : 1)
        if (Math.abs((eqPad[key] as number) - newVal) > 0.001) { (eqPad as Record<string, number | boolean>)[key] = newVal; changed = true }
      }
    }
  }

  // Boolean toggle evaluation (ADR 123)
  if (sweepData.toggles) {
    for (const toggle of sweepData.toggles) {
      // Count how many points are ≤ current progress — odd count = ON, even = OFF
      const count = toggle.points.filter(t => t <= progress).length
      const on = count % 2 === 1

      if (toggle.target.kind === 'hold') {
        const HOLD_MAP: Record<string, keyof typeof perf> = {
          verb: 'reverbHold', delay: 'delayHold', glitch: 'glitchHold', granular: 'granularHold',
        }
        const key = HOLD_MAP[toggle.target.fx]
        if (key && perf[key] !== on) { (perf as unknown as Record<string, boolean>)[key] = on; changed = true }
      } else if (toggle.target.kind === 'fxOn') {
        const pad = fxPad[toggle.target.fx as keyof typeof fxPad]
        if (pad && pad.on !== on) { pad.on = on; changed = true }
      } else if (toggle.target.kind === 'mute') {
        const tgt = toggle.target
        const track = song.tracks.find(t => t.id === tgt.trackId)
        if (track && track.muted !== on) { track.muted = on; changed = true }
      }
    }
  }

  return changed
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

