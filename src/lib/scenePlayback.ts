/**
 * Scene graph playback engine — graph traversal, decorator application, generative chains.
 * Extracted from state.svelte.ts for modularity.
 */
import { song, playback, ui, fxPad, fxFlavours, cellForTrack } from './state.svelte.ts'
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

// ── Decorators & generative chains ──────────────────────────────────

/** Apply decorators attached to a pattern node before playback (ADR 062) */
function applyDecorators(node: SceneNode): void {
  for (const dec of node.decorators ?? []) {
    if (dec.type === 'transpose') {
      if (dec.params.mode === 1) {
        playback.sceneAbsoluteKey = dec.params.key ?? 0
      } else {
        playback.sceneTranspose += (dec.params.semitones ?? 0)
      }
    } else if (dec.type === 'tempo') {
      song.bpm = dec.params.bpm ?? 120
    } else if (dec.type === 'repeat') {
      playback.sceneRepeatLeft = (dec.params.count ?? 2) - 1
    } else if (dec.type === 'fx') {
      fxPad.verb     = { ...fxPad.verb,     on: !!dec.params.verb }
      fxPad.delay    = { ...fxPad.delay,    on: !!dec.params.delay }
      fxPad.glitch   = { ...fxPad.glitch,   on: !!dec.params.glitch }
      fxPad.granular = { ...fxPad.granular, on: !!dec.params.granular }
      // ADR 076: apply per-decorator flavour overrides
      if (dec.flavourOverrides) {
        if (dec.flavourOverrides.verb)     fxFlavours.verb     = dec.flavourOverrides.verb
        if (dec.flavourOverrides.delay)    fxFlavours.delay    = dec.flavourOverrides.delay
        if (dec.flavourOverrides.glitch)   fxFlavours.glitch   = dec.flavourOverrides.glitch
        if (dec.flavourOverrides.granular) fxFlavours.granular = dec.flavourOverrides.granular
      }
    } else if (dec.type === 'automation' && dec.automationParams) {
      playback.activeAutomations.push(dec.automationParams)
    }
  }
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
        } else if (mode === 'layer' && trigs[i].active) {
          if (cell.trigs[i].active) {
            const existing = cell.trigs[i].notes ?? [cell.trigs[i].note]
            if (!existing.includes(trigs[i].note)) {
              cell.trigs[i].notes = [...existing, trigs[i].note]
            }
          } else {
            cell.trigs[i] = trigs[i]
          }
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
  playback.activeAutomations = []
  if (node.type === 'pattern') {
    playback.automationSnapshot = snapshotAutomationTargets()
    applyDecorators(node)
    applyLiveGenerative(node)
    const pi = song.patterns.findIndex(p => p.id === node.patternId)
    const idx = pi >= 0 ? pi : 0
    playback.playingPattern = idx
    return { advanced: true, patternIndex: idx }
  }
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
      if (playback.automationSnapshot) {
        restoreAutomationSnapshot(playback.automationSnapshot)
      }
      playback.activeAutomations = []
      playback.automationSnapshot = snapshotAutomationTargets()
      applyDecorators(node)
      applyLiveGenerative(node)
      playback.sceneNodeId = node.id
      playback.sceneEdgeId = currentEdge.id
      const pi = song.patterns.findIndex(p => p.id === node.patternId)
      const idx = pi >= 0 ? pi : 0
      playback.playingPattern = idx
      return { advanced: true, patternIndex: idx }
    }

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

