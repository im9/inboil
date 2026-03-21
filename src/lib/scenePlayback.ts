/**
 * Scene graph playback engine — graph traversal, decorator application, generative chains.
 * Extracted from state.svelte.ts for modularity.
 */
import { song, bumpSongVersion, playback, ui, fxPad, fxFlavours, cellForTrack } from './state.svelte.ts'
import { snapshotAutomationTargets, restoreAutomationSnapshot } from './automation.ts'
import { executeGenChain, findNode } from './sceneActions.ts'
import type { SceneNode, SceneEdge } from './types.ts'

// ── Scene graph helpers ─────────────────────────────────────────────

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

// ── Function nodes & generative chains (ADR 093) ────────────────────

/** Apply a function node's effect during scene traversal (pass-through) */
function applyFunctionNode(node: SceneNode): void {
  const fp = node.fnParams
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

/** True if node type is a pass-through function node */
function isFnNode(node: SceneNode): boolean {
  return node.type === 'transpose' || node.type === 'tempo' || node.type === 'repeat' || node.type === 'fx'
}

/** Apply satellite fn nodes attached to a pattern node (ADR 110).
 *  FX resets to OFF when no FX fn node is attached — scoped to pattern. */
function applySatelliteFnNodes(patternNodeId: string): void {
  const satellites: SceneNode[] = []
  for (const edge of song.scene.edges) {
    if (edge.to !== patternNodeId) continue
    const src = findNode(edge.from)
    if (src && isFnNode(src)) satellites.push(src)
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
  for (const src of satellites) applyFunctionNode(src)
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
    applySatelliteFnNodes(node.id)  // ADR 110: apply attached fn satellites
    playback.automationSnapshot = snapshotAutomationTargets()
    applyLiveGenerative(node)
    const pi = song.patterns.findIndex(p => p.id === node.patternId)
    const idx = pi >= 0 ? pi : 0
    playback.playingPattern = idx
    return { advanced: true, patternIndex: idx }
  }
  // Function nodes: apply effect and follow outgoing edge (pass-through — legacy)
  if (isFnNode(node)) applyFunctionNode(node)
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
      applySatelliteFnNodes(node.id)  // ADR 110: apply attached fn satellites
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

    // Function nodes: apply effect and continue traversal (pass-through)
    if (isFnNode(node)) applyFunctionNode(node)

    const outEdges = song.scene.edges.filter(e => e.from === node.id).sort((a, b) => a.order - b.order)
    if (outEdges.length === 0) {
      return { advanced: false, patternIndex: -1, stop: true }
    }
    currentEdge = outEdges[Math.floor(Math.random() * outEdges.length)]
  }
}

/** Advance graph playback at beat boundary. Called from App.svelte onStep. */
export function advanceSceneNode(): { advanced: boolean; patternIndex: number; stop?: boolean } {
  const root = sceneRootNode()
  if (!root) return { advanced: false, patternIndex: 0 }

  if (!playback.sceneNodeId) {
    return startSceneNode(root)
  }

  if (playback.sceneRepeatLeft > 0) {
    playback.sceneRepeatLeft--
    return { advanced: false, patternIndex: -1 }
  }

  const current = findNode(playback.sceneNodeId!)
  if (!current) return startSceneNode(root)

  const outEdges = song.scene.edges
    .filter(e => e.from === current.id)
    .sort((a, b) => a.order - b.order)

  if (outEdges.length === 0) {
    return { advanced: false, patternIndex: -1, stop: true }
  }

  return walkToNode(outEdges[Math.floor(Math.random() * outEdges.length)])
}

