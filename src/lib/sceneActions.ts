/**
 * Scene graph CRUD, layout, and clipboard operations.
 * Extracted from state.svelte.ts for modularity.
 */

import { song, ui, pushUndo, cellForTrack } from './state.svelte.ts'
import type { SceneNode, SceneEdge, SceneDecorator, AutomationParams, GenerativeEngine, TuringParams, QuantizerParams, TonnetzParams, Trig, Cell } from './state.svelte.ts'
import { hasMigratableFnNodes, migrateFnToDecorators, cloneSceneNode } from './sceneData.ts'
import { turingGenerate, quantizeTrigs, tonnetzGenerate } from './generative.ts'
import { randomPatternName } from './factory.ts'

// ── Shared generative chain execution ──

/** Execute a chain of generative nodes, returning resulting trigs or null */
export function executeGenChain(chain: SceneNode[], cell: Cell, steps: number): Trig[] | null {
  let trigs: Trig[] | null = null
  for (const genNode of chain) {
    const gen = genNode.generative!
    if (gen.engine === 'turing') {
      trigs = turingGenerate(gen.params as TuringParams, steps, gen.seed)
    } else if (gen.engine === 'quantizer') {
      const input = trigs ?? cell.trigs.map(t => ({ ...t }))
      trigs = quantizeTrigs(input, gen.params as QuantizerParams)
    } else if (gen.engine === 'tonnetz') {
      trigs = tonnetzGenerate(gen.params as TonnetzParams, steps)
    }
  }
  return trigs
}

// ── Node lookup helper ──

/** Find a scene node by ID */
export function findNode(nodeId: string): SceneNode | undefined {
  return song.scene.nodes.find(n => n.id === nodeId)
}

// ── ID generation ──

function nextSceneId(prefix: 'sn' | 'se'): string {
  const items = prefix === 'sn' ? song.scene.nodes : song.scene.edges
  const max = items.reduce((m, item) => {
    const num = parseInt(item.id.replace(`${prefix}_`, ''))
    return isNaN(num) ? m : Math.max(m, num)
  }, -1)
  return `${prefix}_${String(max + 1).padStart(2, '0')}`
}

// ── Node CRUD ──

/** Update a scene node's position (no undo — cosmetic, high frequency) */
export function sceneUpdateNode(nodeId: string, x: number, y: number): void {
  const node = findNode(nodeId)
  if (!node) return
  node.x = x
  node.y = y
}

/** Add a pattern node at position. Auto-names the pattern if blank. */
export function sceneAddNode(patternId: string, x: number, y: number): string {
  pushUndo('Add scene node')
  // Auto-assign a random name if the pattern has none
  const pat = song.patterns.find(p => p.id === patternId)
  if (pat && !pat.name) {
    const usedNames = song.patterns.filter(p => p.name).map(p => p.name)
    pat.name = randomPatternName(usedNames)
  }
  const id = nextSceneId('sn')
  const isFirst = song.scene.nodes.length === 0
  song.scene.nodes.push({
    id, type: 'pattern', x, y,
    root: isFirst,
    patternId,
  })
  return id
}

/** Delete a node and its connected edges */
export function sceneDeleteNode(nodeId: string): void {
  pushUndo('Delete scene node')
  const wasRoot = findNode(nodeId)?.root
  song.scene.edges = song.scene.edges.filter(e => e.from !== nodeId && e.to !== nodeId)
  song.scene.nodes = song.scene.nodes.filter(n => n.id !== nodeId)
  if (wasRoot && song.scene.nodes.length > 0) {
    const nextRoot = song.scene.nodes.find(n => n.type === 'pattern') || song.scene.nodes[0]
    nextRoot.root = true
  }
  delete ui.selectedSceneNodes[nodeId]
  if (ui.selectedSceneEdge && !song.scene.edges.some(e => e.id === ui.selectedSceneEdge)) {
    ui.selectedSceneEdge = null
  }
}

/** Set a node as root (only pattern nodes can be root) */
export function sceneSetRoot(nodeId: string): void {
  const node = findNode(nodeId)
  if (!node || node.type !== 'pattern') return
  pushUndo('Set root node')
  for (const n of song.scene.nodes) n.root = n.id === nodeId
}

// ── Edge CRUD ──

/** Create a directed edge (prevents duplicates and self-loops) */
export function sceneAddEdge(from: string, to: string): string | null {
  if (from === to) return null
  if (song.scene.edges.some(e => e.from === from && e.to === to)) return null
  pushUndo('Add scene edge')
  const id = nextSceneId('se')
  const maxOrder = song.scene.edges
    .filter(e => e.from === from)
    .reduce((m, e) => Math.max(m, e.order), -1)
  song.scene.edges.push({ id, from, to, order: maxOrder + 1 })
  return id
}

/** Delete an edge */
export function sceneDeleteEdge(edgeId: string): void {
  pushUndo('Delete scene edge')
  song.scene.edges = song.scene.edges.filter(e => e.id !== edgeId)
  if (ui.selectedSceneEdge === edgeId) ui.selectedSceneEdge = null
}

/** Swap edge order with its neighbor */
export function sceneReorderEdge(edgeId: string, direction: 'up' | 'down'): void {
  const edge = song.scene.edges.find(e => e.id === edgeId)
  if (!edge) return
  const siblings = song.scene.edges
    .filter(e => e.from === edge.from)
    .sort((a, b) => a.order - b.order)
  const idx = siblings.findIndex(e => e.id === edgeId)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= siblings.length) return
  pushUndo('Reorder edge')
  const tmp = edge.order
  edge.order = siblings[swapIdx].order
  siblings[swapIdx].order = tmp
}

// ── Labels (ADR 052) ──

export function sceneAddLabel(x: number, y: number, text = ''): string {
  pushUndo('Add label')
  const id = crypto.randomUUID().slice(0, 8)
  song.scene.labels = [...(song.scene.labels ?? []), { id, text, x, y }]
  return id
}

export function sceneUpdateLabel(labelId: string, text: string): void {
  const label = song.scene.labels.find(l => l.id === labelId)
  if (!label) return
  pushUndo('Update label')
  label.text = text
}

export function sceneDeleteLabel(labelId: string): void {
  pushUndo('Delete label')
  song.scene.labels = song.scene.labels.filter(l => l.id !== labelId)
}

export function sceneMoveLabel(labelId: string, x: number, y: number): void {
  const label = song.scene.labels.find(l => l.id === labelId)
  if (!label) return
  label.x = x
  label.y = y
}

export function sceneResizeLabel(labelId: string, delta: number): void {
  const label = song.scene.labels.find(l => l.id === labelId)
  if (!label) return
  label.size = Math.max(0.5, Math.min(4, (label.size ?? 1) + delta))
}

// ── Generative nodes (ADR 078) ──

const DEFAULT_AUTOMATION_PARAMS: AutomationParams = {
  target: { kind: 'global', param: 'tempo' },
  points: [{ t: 0, v: 0.25 }, { t: 1, v: 0.5 }],  // ~120→180 BPM
  interpolation: 'linear',
}

/** Default configs per generative engine */
function defaultGenerativeConfig(engine: GenerativeEngine): SceneNode['generative'] {
  switch (engine) {
    case 'turing': return {
      engine: 'turing',
      mergeMode: 'replace',
      targetTrack: Math.max(0, ui.selectedTrack),
      params: { engine: 'turing', length: 8, lock: 0.5, range: [48, 72], mode: 'note' as const, density: 0.7 },
    }
    case 'quantizer': return {
      engine: 'quantizer',
      mergeMode: 'replace',
      targetTrack: Math.max(0, ui.selectedTrack),
      params: { engine: 'quantizer', scale: 'minor', root: 0, octaveRange: [3, 5] as [number, number] },
    }
    case 'tonnetz': return {
      engine: 'tonnetz',
      mergeMode: 'replace',
      targetTrack: Math.max(0, ui.selectedTrack),
      params: { engine: 'tonnetz', startChord: [60, 64, 67] as [number, number, number], sequence: ['P', 'L', 'R'], stepsPerChord: 4, voicing: 'close' as const },
    }
  }
}

/** Add a generative node */
export function sceneAddGenerativeNode(engine: GenerativeEngine, x: number, y: number): string {
  pushUndo('Add generative node')
  const id = nextSceneId('sn')
  song.scene.nodes.push({
    id, type: 'generative', x, y,
    root: false,
    generative: defaultGenerativeConfig(engine),
  })
  return id
}

/** Update generative node params */
export function sceneUpdateGenerativeParams(nodeId: string, params: Partial<TuringParams | QuantizerParams | TonnetzParams>): void {
  pushUndo('Update generative params')
  const node = findNode(nodeId)
  if (!node?.generative) return
  Object.assign(node.generative.params, params)
}

/** Run generative engine (write mode): generate notes and write to target pattern.
 *  Supports chaining: Turing → Quantizer → Pattern.
 *  Finds the first pattern node connected via outgoing edges. */
export function sceneGenerateWrite(nodeId: string): boolean {
  const node = findNode(nodeId)
  if (!node?.generative) return false

  // Find target pattern by following outgoing edges (collecting gen chain)
  const targetPatNode = findTargetPattern(nodeId)
  if (!targetPatNode) return false

  const pat = song.patterns.find(p => p.id === targetPatNode.patternId)
  if (!pat || pat.cells.length === 0) return false

  pushUndo('Generate sequence')

  const trackIdx = node.generative.targetTrack ?? 0
  const cell = cellForTrack(pat, trackIdx) ?? pat.cells[0]
  const steps = cell.steps

  // Collect the generative chain from this node to the target pattern
  const chain = collectGenChain(nodeId)

  const trigs = executeGenChain(chain, cell, steps)
  if (trigs) {
    const lastGen = chain[chain.length - 1].generative!
    applyGeneratedTrigs(cell.trigs, trigs, lastGen.mergeMode)
  }

  return true
}

/** Generate trigs into a buffer without writing to pattern (ADR 089 delayed write).
 *  Returns null if generation fails, otherwise { trigs, trackId, mergeMode }. */
export function sceneGenerateBuffer(nodeId: string): { trigs: Trig[]; trackId: number; mergeMode: string } | null {
  const node = findNode(nodeId)
  if (!node?.generative) return null

  const targetPatNode = findTargetPattern(nodeId)
  if (!targetPatNode) return null

  const pat = song.patterns.find(p => p.id === targetPatNode.patternId)
  if (!pat || pat.cells.length === 0) return null

  const trackIdx = node.generative.targetTrack ?? 0
  const cell = cellForTrack(pat, trackIdx) ?? pat.cells[0]
  const steps = cell.steps

  const chain = collectGenChain(nodeId)
  const trigs = executeGenChain(chain, cell, steps)
  if (!trigs) return null
  const lastGen = chain[chain.length - 1].generative!
  return { trigs, trackId: trackIdx, mergeMode: lastGen.mergeMode }
}

/** Collect generative nodes along outgoing edges until we hit a pattern node.
 *  Returns ordered list starting from the given node. */
function collectGenChain(fromId: string): SceneNode[] {
  const chain: SceneNode[] = []
  const visited = new Set<string>()
  let currentId = fromId

  while (true) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const node = findNode(currentId)
    if (!node) break
    if (node.type === 'generative' && node.generative) {
      chain.push(node)
    }
    if (node.type === 'pattern') break
    // Follow first outgoing edge
    const outEdge = song.scene.edges.find(e => e.from === currentId)
    if (!outEdge) break
    currentId = outEdge.to
  }
  return chain
}

/** Find first pattern node reachable via outgoing edges (BFS) */
function findTargetPattern(fromId: string): SceneNode | null {
  const visited = new Set<string>()
  const queue = [fromId]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const outEdges = song.scene.edges.filter(e => e.from === id)
    for (const edge of outEdges) {
      const target = findNode(edge.to)
      if (!target) continue
      if (target.type === 'pattern') return target
      queue.push(target.id)
    }
  }
  return null
}

/** Apply generated trigs to existing trigs based on merge mode */
function applyGeneratedTrigs(
  existing: import('./state.svelte.ts').Trig[],
  generated: import('./state.svelte.ts').Trig[],
  mode: string,
): void {
  const len = Math.min(existing.length, generated.length)
  for (let i = 0; i < len; i++) {
    if (mode === 'replace') {
      existing[i] = generated[i]
    } else if (mode === 'merge') {
      // Fill empty steps only
      if (!existing[i].active) {
        existing[i] = generated[i]
      }
    } else if (mode === 'layer') {
      // Add generated notes as chord on active steps
      if (generated[i].active) {
        if (existing[i].active) {
          const existingNotes = existing[i].notes ?? [existing[i].note]
          const newNote = generated[i].note
          if (!existingNotes.includes(newNote)) {
            existing[i].notes = [...existingNotes, newNote]
          }
        } else {
          existing[i] = generated[i]
        }
      }
    }
  }
}

/** Set target track index for generative output */
export function sceneSetTargetTrack(nodeId: string, trackIdx: number): void {
  pushUndo('Set target track')
  const node = findNode(nodeId)
  if (!node?.generative) return
  node.generative.targetTrack = trackIdx
}

/** Set or randomize the seed for deterministic generation */
export function sceneSetSeed(nodeId: string, seed: number | undefined): void {
  pushUndo('Set seed')
  const node = findNode(nodeId)
  if (!node?.generative) return
  node.generative.seed = seed
}

/** Apply a factory preset to a generative node */
export function sceneApplyGenerativePreset(nodeId: string, params: Record<string, unknown>): void {
  pushUndo('Apply generative preset')
  const node = findNode(nodeId)
  if (!node?.generative) return
  const cloned: Record<string, unknown> = {}
  for (const k of Object.keys(params)) {
    cloned[k] = Array.isArray(params[k]) ? [...(params[k] as unknown[])] : params[k]
  }
  node.generative.params = cloned as unknown as typeof node.generative.params
}


/** Find upstream generative node IDs that feed into a pattern (by pattern index).
 *  Returns the "leaf" generative node IDs (closest to the pattern node). */
export function findUpstreamGenerativeNodes(patternIndex: number): string[] {
  const pat = song.patterns[patternIndex]
  if (!pat) return []
  const patNodes = song.scene.nodes.filter(n => n.type === 'pattern' && n.patternId === pat.id)
  const result: string[] = []
  for (const pn of patNodes) {
    const inEdges = song.scene.edges.filter(e => e.to === pn.id)
    for (const edge of inEdges) {
      const src = findNode(edge.from)
      if (src?.generative) result.push(src.id)
    }
  }
  return result
}

/** Update a function node's params (legacy, kept for decorator use) */
export function sceneUpdateNodeParams(nodeId: string, params: Record<string, number>): void {
  pushUndo('Update node params')
  const node = findNode(nodeId)
  if (!node) return
  node.params = { ...params }
}

// ── Decorators (ADR 066) ──

/** Attach a legacy function node as a decorator on a pattern node (migration support) */
export function sceneAttachDecorator(fnNodeId: string, patternNodeId: string): boolean {
  const fnNode = findNode(fnNodeId)
  const patNode = findNode(patternNodeId)
  if (!fnNode || !patNode || patNode.type !== 'pattern') return false
  if (fnNode.type === 'pattern' || fnNode.type === 'probability' || fnNode.type === 'generative') return false
  pushUndo('Attach decorator')
  let dec: SceneDecorator
  if (fnNode.type === 'automation') {
    const ap = fnNode.automationParams ?? DEFAULT_AUTOMATION_PARAMS
    dec = { type: 'automation', params: {}, automationParams: { target: { ...ap.target }, points: ap.points.map(p => ({ ...p })), interpolation: ap.interpolation } }
  } else {
    dec = { type: fnNode.type as SceneDecorator['type'], params: { ...(fnNode.params ?? {}) } }
  }
  patNode.decorators ??= []
  patNode.decorators.push(dec)
  song.scene.edges = song.scene.edges.filter(e => e.from !== fnNodeId && e.to !== fnNodeId)
  song.scene.nodes = song.scene.nodes.filter(n => n.id !== fnNodeId)
  return true
}

/** Remove a decorator from a pattern node (ADR 069) */
export function sceneRemoveDecorator(patternNodeId: string, decoratorIndex: number): void {
  const patNode = findNode(patternNodeId)
  if (!patNode?.decorators?.[decoratorIndex]) return
  pushUndo('Remove decorator')
  patNode.decorators.splice(decoratorIndex, 1)
}

/** Update a decorator's params on a pattern node */
export function sceneUpdateDecorator(patternNodeId: string, decoratorIndex: number, params: Record<string, number>): void {
  const patNode = findNode(patternNodeId)
  if (!patNode?.decorators?.[decoratorIndex]) return
  pushUndo('Update decorator')
  patNode.decorators[decoratorIndex].params = { ...params }
}

const DECORATOR_DEFAULTS: Record<string, Record<string, number>> = {
  transpose: { mode: 0, semitones: 0, key: 0 },
  tempo: { bpm: 120 },
  repeat: { count: 2 },
  fx: { verb: 0, delay: 0, glitch: 0, granular: 0 },
}

/** Add a decorator directly to a pattern node (ADR 069) */
export function sceneAddDecorator(patternNodeId: string, type: SceneDecorator['type']): void {
  const patNode = findNode(patternNodeId)
  if (!patNode || patNode.type !== 'pattern') return
  pushUndo('Add decorator')
  patNode.decorators ??= []
  if (type === 'automation') {
    const ap = DEFAULT_AUTOMATION_PARAMS
    patNode.decorators.push({
      type: 'automation',
      params: {},
      automationParams: { target: { ...ap.target }, points: ap.points.map(p => ({ ...p })), interpolation: ap.interpolation },
    })
  } else {
    patNode.decorators.push({ type, params: { ...DECORATOR_DEFAULTS[type] } })
  }
  // Auto-switch to DECO tab when adding from pattern sheet (ADR 092)
  if (ui.patternSheet) ui.dockTab = 'scene'
}

/** Add an automation decorator directly to a pattern node */
export function sceneAddAutomationDecorator(patternNodeId: string): void {
  const patNode = findNode(patternNodeId)
  if (!patNode || patNode.type !== 'pattern') return
  pushUndo('Add automation decorator')
  const ap = DEFAULT_AUTOMATION_PARAMS
  patNode.decorators ??= []
  patNode.decorators.push({
    type: 'automation',
    params: {},
    automationParams: { target: { ...ap.target }, points: ap.points.map(p => ({ ...p })), interpolation: ap.interpolation },
  })
}

/** Check if there are function nodes in edge chains that can be migrated to decorators */
export function sceneHasMigratableFnNodes(): boolean {
  return hasMigratableFnNodes(song.scene.nodes, song.scene.edges)
}

/** Migrate edge-chain function nodes to decorators (ADR 066 Phase 4) */
export function sceneMigrateFnToDecorators(): number {
  pushUndo('Migrate to decorators')
  const result = migrateFnToDecorators(song.scene.nodes, song.scene.edges)
  song.scene.nodes = result.nodes
  song.scene.edges = result.edges
  return result.converted
}

// ── Layout ──

/** Auto-layout scene nodes left→right using BFS layers from root */
export function sceneFormatNodes(nodeIds?: Record<string, true>, direction: 'horizontal' | 'vertical' = 'horizontal'): void {
  const { nodes, edges } = song.scene
  if (nodes.length === 0) return
  pushUndo('Format nodes')

  const targets = nodeIds && Object.keys(nodeIds).length > 0 ? nodeIds : null

  const children = new Map<string, string[]>()
  for (const e of edges) {
    const list = children.get(e.from) || []
    list.push(e.to)
    children.set(e.from, list)
  }

  const root = nodes.find(n => n.root) || nodes[0]
  const layer = new Map<string, number>()
  const queue: string[] = [root.id]
  layer.set(root.id, 0)
  while (queue.length > 0) {
    const id = queue.shift()!
    const d = layer.get(id)!
    for (const child of children.get(id) || []) {
      if (!layer.has(child)) {
        layer.set(child, d + 1)
        queue.push(child)
      }
    }
  }

  const maxLayer = Math.max(0, ...layer.values())
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, maxLayer + 1)
  }

  const layers = new Map<number, string[]>()
  for (const [id, d] of layer) {
    if (targets && !targets[id]) continue
    const list = layers.get(d) || []
    list.push(id)
    layers.set(d, list)
  }

  for (const [, ids] of layers) {
    ids.sort((a, b) => {
      const aEdge = edges.find(e => e.to === a)
      const bEdge = edges.find(e => e.to === b)
      return (aEdge?.order ?? 0) - (bEdge?.order ?? 0)
    })
  }

  let x1 = 0.08, x2 = 0.92, y1 = 0.08, y2 = 0.92
  if (targets) {
    const targetNodes = nodes.filter(n => targets[n.id])
    if (targetNodes.length > 0) {
      x1 = Math.min(...targetNodes.map(n => n.x))
      x2 = Math.max(...targetNodes.map(n => n.x))
      y1 = Math.min(...targetNodes.map(n => n.y))
      y2 = Math.max(...targetNodes.map(n => n.y))
      if (x2 - x1 < 0.05) { x1 = Math.max(0, x1 - 0.05); x2 = Math.min(1, x2 + 0.05) }
      if (y2 - y1 < 0.05) { y1 = Math.max(0, y1 - 0.05); y2 = Math.min(1, y2 + 0.05) }
    }
  }

  const vert = direction === 'vertical'
  const totalLayers = Math.max(1, ...layers.keys()) + 1
  for (const [d, ids] of layers) {
    const primary = totalLayers === 1
      ? ((vert ? y1 + y2 : x1 + x2) / 2)
      : (vert ? y1 : x1) + (d / Math.max(1, totalLayers - 1)) * (vert ? y2 - y1 : x2 - x1)
    for (let i = 0; i < ids.length; i++) {
      const secondary = ids.length === 1
        ? ((vert ? x1 + x2 : y1 + y2) / 2)
        : (vert ? x1 : y1) + (i / (ids.length - 1)) * (vert ? x2 - x1 : y2 - y1)
      const node = nodes.find(n => n.id === ids[i])
      if (node) {
        node.x = vert ? secondary : primary
        node.y = vert ? primary : secondary
      }
    }
  }
}

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v' | 'distribute-h' | 'distribute-v'

/** Align or distribute selected scene nodes */
export function sceneAlignNodes(nodeIds: Record<string, true>, mode: AlignMode): void {
  const targets = song.scene.nodes.filter(n => nodeIds[n.id])
  if (targets.length < 2) return
  pushUndo('Align nodes')
  switch (mode) {
    case 'left':       { const v = Math.min(...targets.map(n => n.x)); for (const n of targets) n.x = v; break }
    case 'right':      { const v = Math.max(...targets.map(n => n.x)); for (const n of targets) n.x = v; break }
    case 'top':        { const v = Math.min(...targets.map(n => n.y)); for (const n of targets) n.y = v; break }
    case 'bottom':     { const v = Math.max(...targets.map(n => n.y)); for (const n of targets) n.y = v; break }
    case 'center-h':   { const v = targets.reduce((s, n) => s + n.y, 0) / targets.length; for (const n of targets) n.y = v; break }
    case 'center-v':   { const v = targets.reduce((s, n) => s + n.x, 0) / targets.length; for (const n of targets) n.x = v; break }
    case 'distribute-h': {
      targets.sort((a, b) => a.x - b.x)
      const min = targets[0].x, max = targets[targets.length - 1].x
      for (let i = 0; i < targets.length; i++) targets[i].x = targets.length === 1 ? min : min + (i / (targets.length - 1)) * (max - min)
      break
    }
    case 'distribute-v': {
      targets.sort((a, b) => a.y - b.y)
      const min = targets[0].y, max = targets[targets.length - 1].y
      for (let i = 0; i < targets.length; i++) targets[i].y = targets.length === 1 ? min : min + (i / (targets.length - 1)) * (max - min)
      break
    }
  }
}

// ── Copy/Paste ──

let sceneClipboard: { nodes: SceneNode[]; edges: SceneEdge[] } | null = null

export function hasSceneClipboard(): boolean {
  return sceneClipboard !== null && sceneClipboard.nodes.length > 0
}

/** Copy a single node to clipboard */
export function sceneCopyNode(nodeId: string): void {
  const node = findNode(nodeId)
  if (!node) return
  sceneClipboard = { nodes: [cloneSceneNode(node)], edges: [] }
}

/** Copy multiple selected nodes + internal edges to clipboard */
export function sceneCopySelected(nodeIds: Record<string, true>): void {
  const ids = new Set(Object.keys(nodeIds))
  if (ids.size === 0) return
  sceneClipboard = {
    nodes: song.scene.nodes.filter(n => ids.has(n.id)).map(cloneSceneNode),
    edges: song.scene.edges
      .filter(e => ids.has(e.from) && ids.has(e.to))
      .map(e => ({ ...e })),
  }
}

/** Copy node + all reachable downstream nodes & connecting edges */
export function sceneCopySubgraph(nodeId: string): void {
  const startNode = findNode(nodeId)
  if (!startNode) return
  const visited = new Set<string>()
  const queue = [nodeId]
  const collectedNodes: SceneNode[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = findNode(id)
    if (!node) continue
    collectedNodes.push(cloneSceneNode(node))
    for (const edge of song.scene.edges) {
      if (edge.from === id && !visited.has(edge.to)) queue.push(edge.to)
    }
  }
  sceneClipboard = {
    nodes: collectedNodes,
    edges: song.scene.edges
      .filter(e => visited.has(e.from) && visited.has(e.to))
      .map(e => ({ ...e })),
  }
}

/** Paste clipboard at position, returns new node IDs */
export function scenePaste(baseX: number, baseY: number): string[] {
  if (!sceneClipboard || sceneClipboard.nodes.length === 0) return []
  pushUndo('Paste scene nodes')
  const idMap = new Map<string, string>()
  const pastedIds: string[] = []
  const ref = sceneClipboard.nodes[0]
  const dx = baseX - ref.x, dy = baseY - ref.y
  for (const src of sceneClipboard.nodes) {
    const newId = nextSceneId('sn')
    idMap.set(src.id, newId)
    const cloned = cloneSceneNode(src)
    cloned.id = newId
    cloned.root = false
    cloned.x = Math.max(0, Math.min(1, src.x + dx))
    cloned.y = Math.max(0, Math.min(1, src.y + dy))
    song.scene.nodes.push(cloned)
    pastedIds.push(newId)
  }
  for (const src of sceneClipboard.edges) {
    const newFrom = idMap.get(src.from), newTo = idMap.get(src.to)
    if (newFrom && newTo) {
      song.scene.edges.push({ id: nextSceneId('se'), from: newFrom, to: newTo, order: src.order })
    }
  }
  return pastedIds
}
