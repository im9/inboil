/**
 * Pure data transformation functions for scene graph (ADR 062, updated ADR 093).
 * Extracted from state.svelte.ts for testability and separation of concerns.
 */

import type { SceneNode, SceneEdge, Scene, SceneDecorator, FnParams, FnNodeType } from './types.ts'

// ── Clone helpers ──

function cloneFnParams(fp: FnParams): FnParams {
  const clone: FnParams = {}
  if (fp.transpose) clone.transpose = { ...fp.transpose }
  if (fp.tempo) clone.tempo = { ...fp.tempo }
  if (fp.repeat) clone.repeat = { ...fp.repeat }
  if (fp.fx) clone.fx = { ...fp.fx, ...(fp.fx.flavourOverrides ? { flavourOverrides: { ...fp.fx.flavourOverrides } } : {}) }
  return clone
}

export function cloneSceneNode(n: SceneNode): SceneNode {
  const clone: SceneNode = {
    ...n,
    ...(n.params ? { params: { ...n.params } } : {}),
  }
  if (n.fnParams) clone.fnParams = cloneFnParams(n.fnParams)
  if (n.automationParams) {
    const ap = n.automationParams
    clone.automationParams = { target: { ...ap.target }, points: ap.points.map(p => ({ ...p })), interpolation: ap.interpolation }
  }
  if (n.generative) {
    clone.generative = {
      ...n.generative,
      params: { ...n.generative.params },
    }
    // Deep-clone array/tuple fields in params
    const p = n.generative.params as unknown as Record<string, unknown>
    const cp = clone.generative.params as unknown as Record<string, unknown>
    for (const k of Object.keys(p)) {
      if (Array.isArray(p[k])) cp[k] = [...(p[k] as unknown[])]
    }
  }
  // Strip legacy decorator field after migration
  delete clone.decorators
  return clone
}

export function cloneScene(sc: Scene): Scene {
  return {
    name: sc.name,
    nodes: sc.nodes.map(cloneSceneNode),
    edges: sc.edges.map(e => ({ ...e })),
    labels: (sc.labels ?? []).map(l => ({ ...l })),
  }
}

/** Restore a scene from saved data, filling in defaults for missing fields.
 *  Auto-migrates decorators to function nodes and legacy fn node formats (ADR 093). */
export function restoreScene(src: Scene | undefined): Scene {
  if (!src) return { name: 'Main', nodes: [], edges: [], labels: [] }
  // Clone nodes preserving decorators (migration will strip them)
  let nodes = src.nodes.map(n => {
    const clone = cloneSceneNode(n)
    if (n.decorators?.length) clone.decorators = n.decorators.map(d => ({ ...d, params: { ...d.params } }))
    return clone
  })
  let edges = src.edges.map(e => ({ ...e }))
  // ADR 093: migrate decorators on pattern nodes → standalone function nodes
  const dm = migrateDecoratorsToFnNodes(nodes, edges)
  nodes = dm.nodes; edges = dm.edges
  // ADR 093: migrate legacy fn nodes (params → fnParams)
  migrateLegacyFnParams(nodes)
  // Remove orphan automation/probability nodes
  const p = purgeOrphanFnNodes(nodes, edges)
  nodes = p.nodes; edges = p.edges
  return {
    name: src.name,
    nodes,
    edges,
    labels: (src.labels ?? []).map(l => ({ ...l })),
  }
}

// ── Migration (ADR 093) ──

const FN_NODE_TYPES = new Set<string>(['transpose', 'tempo', 'repeat', 'fx'])

/** Convert decorator params to typed FnParams */
function decoratorToFnParams(dec: SceneDecorator): FnParams | null {
  const p = dec.params
  switch (dec.type) {
    case 'transpose': return { transpose: { semitones: p.semitones ?? 0, mode: p.mode === 1 ? 'abs' : 'rel', key: p.key } }
    case 'tempo': return { tempo: { bpm: p.bpm ?? 120 } }
    case 'repeat': return { repeat: { count: p.count ?? 2 } }
    case 'fx': return { fx: { verb: !!p.verb, delay: !!p.delay, glitch: !!p.glitch, granular: !!p.granular, flavourOverrides: dec.flavourOverrides } }
    case 'automation': return null  // dropped (ADR 093 — replaced by per-step paramLocks)
  }
}

/** Convert legacy fn node params (Record<string, number>) to typed FnParams */
function legacyParamsToFnParams(type: string, params: Record<string, number>): FnParams | null {
  switch (type) {
    case 'transpose': return { transpose: { semitones: params.semitones ?? 0, mode: params.mode === 1 ? 'abs' : 'rel', key: params.key } }
    case 'tempo': return { tempo: { bpm: params.bpm ?? 120 } }
    case 'repeat': return { repeat: { count: params.count ?? 2 } }
    case 'fx': return { fx: { verb: !!params.verb, delay: !!params.delay, glitch: !!params.glitch, granular: !!params.granular } }
    default: return null  // automation, probability — not convertible
  }
}

let _fnIdCounter = 0

/** Migrate decorators on pattern nodes to standalone function nodes (ADR 093).
 *  For each decorator, creates a fn node wired before the pattern node. */
export function migrateDecoratorsToFnNodes(
  nodes: SceneNode[],
  edges: SceneEdge[],
): { converted: number; nodes: SceneNode[]; edges: SceneEdge[] } {
  let converted = 0
  const newNodes: SceneNode[] = []
  const newEdges: SceneEdge[] = []

  for (const node of nodes) {
    if (!node.decorators?.length) continue

    // Build chain of fn nodes from decorators (order preserved)
    const fnChain: SceneNode[] = []
    for (const dec of node.decorators) {
      const fp = decoratorToFnParams(dec)
      if (!fp) continue  // skip automation decorators
      const fnNode: SceneNode = {
        id: `fn_mig_${++_fnIdCounter}`,
        type: dec.type as FnNodeType,
        x: node.x - 0.06 * (fnChain.length + 1),
        y: node.y,
        root: false,
        fnParams: fp,
      }
      fnChain.push(fnNode)
      converted++
    }

    if (fnChain.length > 0) {
      // Rewire incoming edges → first fn node in chain
      const headId = fnChain[0].id
      for (const e of edges) {
        if (e.to === node.id) e.to = headId
      }
      // Chain fn nodes together
      for (let i = 0; i < fnChain.length - 1; i++) {
        newEdges.push({ id: `e_mig_${++_fnIdCounter}`, from: fnChain[i].id, to: fnChain[i + 1].id, order: 0 })
      }
      // Last fn node → pattern node
      newEdges.push({ id: `e_mig_${++_fnIdCounter}`, from: fnChain[fnChain.length - 1].id, to: node.id, order: 0 })
      newNodes.push(...fnChain)
    }

    // Clear decorators from pattern node
    delete node.decorators
  }

  return {
    converted,
    nodes: [...nodes, ...newNodes],
    edges: [...edges, ...newEdges],
  }
}

/** Migrate legacy fn nodes that use params → fnParams format */
function migrateLegacyFnParams(nodes: SceneNode[]): void {
  for (const n of nodes) {
    if (n.fnParams) continue  // already migrated
    if (!FN_NODE_TYPES.has(n.type)) continue
    if (!n.params) continue
    const fp = legacyParamsToFnParams(n.type, n.params)
    if (fp) {
      n.fnParams = fp
      delete n.params
      delete n.automationParams
    }
  }
}

/** Remove orphaned automation/probability nodes and dead-end fn nodes */
export function purgeOrphanFnNodes(
  nodes: SceneNode[],
  edges: SceneEdge[],
): { removed: number; nodes: SceneNode[]; edges: SceneEdge[] } {
  const toRemove = new Set<string>()
  for (const n of nodes) {
    // Remove legacy automation nodes (no longer supported)
    if (n.type === 'automation') {
      toRemove.add(n.id)
      continue
    }
    // Remove fn nodes with no outgoing edges (dead ends)
    if (FN_NODE_TYPES.has(n.type) && !edges.some(e => e.from === n.id)) {
      toRemove.add(n.id)
    }
  }
  if (toRemove.size === 0) return { removed: 0, nodes, edges }
  if (typeof console !== 'undefined') {
    console.warn(`[ADR 093] Removing ${toRemove.size} orphan node(s):`, [...toRemove])
  }
  edges = edges.filter(e => !toRemove.has(e.from) && !toRemove.has(e.to))
  nodes = nodes.filter(n => !toRemove.has(n.id))
  return { removed: toRemove.size, nodes, edges }
}
