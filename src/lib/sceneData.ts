/**
 * Pure data transformation functions for scene graph (ADR 062).
 * Extracted from state.svelte.ts for testability and separation of concerns.
 */

import type { SceneNode, SceneEdge, Scene, SceneDecorator } from './types.ts'

// ── Clone helpers ──

function cloneDecorator(d: SceneDecorator): SceneDecorator {
  const clone: SceneDecorator = { type: d.type, params: { ...d.params } }
  if (d.automationParams) {
    const ap = d.automationParams
    clone.automationParams = { target: { ...ap.target }, points: ap.points.map(p => ({ ...p })), interpolation: ap.interpolation }
  }
  if (d.flavourOverrides) clone.flavourOverrides = { ...d.flavourOverrides }
  return clone
}

export function cloneSceneNode(n: SceneNode): SceneNode {
  const clone: SceneNode = {
    ...n,
    ...(n.params ? { params: { ...n.params } } : {}),
    decorators: (n.decorators ?? []).map(cloneDecorator),
  }
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
 *  Auto-migrates legacy function nodes to decorators and purges orphans (ADR 078). */
export function restoreScene(src: Scene | undefined): Scene {
  if (!src) return { name: 'Main', nodes: [], edges: [], labels: [] }
  let nodes = src.nodes.map(cloneSceneNode)
  let edges = src.edges.map(e => ({ ...e }))
  // ADR 078: auto-migrate legacy function nodes
  if (hasMigratableFnNodes(nodes, edges)) {
    const m = migrateFnToDecorators(nodes, edges)
    nodes = m.nodes; edges = m.edges
  }
  // ADR 078: purge any remaining standalone legacy nodes
  const p = purgeStandaloneFnNodes(nodes, edges)
  nodes = p.nodes; edges = p.edges
  return {
    name: src.name,
    nodes,
    edges,
    labels: (src.labels ?? []).map(l => ({ ...l })),
  }
}

// ── Migration (ADR 062 Phase 4) ──

const LEGACY_FN_TYPES = new Set(['transpose', 'tempo', 'repeat', 'probability', 'fx', 'automation'])

function isLegacyFnNode(node: SceneNode): boolean {
  return LEGACY_FN_TYPES.has(node.type)
}

/** Check if a scene has function nodes in edge chains that can be migrated to decorators */
export function hasMigratableFnNodes(nodes: SceneNode[], edges: SceneEdge[]): boolean {
  for (const fn of nodes) {
    if (!isLegacyFnNode(fn) || fn.type === 'probability') continue
    const outEdges = edges.filter(e => e.from === fn.id)
    if (outEdges.length !== 1) continue
    const target = nodes.find(n => n.id === outEdges[0].to)
    if (target?.type === 'pattern') return true
  }
  return false
}

/** Migrate edge-chain function nodes to decorators (pure, mutates in place).
 *  Returns the number of nodes converted and the mutated arrays. */
export function migrateFnToDecorators(
  nodes: SceneNode[],
  edges: SceneEdge[],
): { converted: number; nodes: SceneNode[]; edges: SceneEdge[] } {
  let converted = 0
  let changed = true
  while (changed) {
    changed = false
    for (const fn of nodes) {
      if (!isLegacyFnNode(fn) || fn.type === 'probability') continue
      const outEdges = edges.filter(e => e.from === fn.id)
      const inEdges = edges.filter(e => e.to === fn.id)
      if (outEdges.length !== 1) continue
      const targetNode = nodes.find(n => n.id === outEdges[0].to)
      if (!targetNode || targetNode.type !== 'pattern') continue
      const decType = fn.type as SceneDecorator['type']
      const dec: SceneDecorator = { type: decType, params: { ...(fn.params ?? {}) } }
      if (fn.type === 'automation' && fn.automationParams) {
        const ap = fn.automationParams
        dec.automationParams = { target: { ...ap.target }, points: ap.points.map(p => ({ ...p })), interpolation: ap.interpolation }
      }
      targetNode.decorators ??= []
      targetNode.decorators.push(dec)
      for (const ie of inEdges) {
        ie.to = targetNode.id
      }
      edges = edges.filter(e => e.from !== fn.id)
      nodes = nodes.filter(n => n.id !== fn.id)
      converted++
      changed = true
      break
    }
  }
  return { converted, nodes, edges }
}

/** Remove all remaining standalone legacy function nodes (ADR 078 consolidation).
 *  Orphan fn nodes that couldn't be migrated are removed with a warning. */
export function purgeStandaloneFnNodes(
  nodes: SceneNode[],
  edges: SceneEdge[],
): { removed: number; nodes: SceneNode[]; edges: SceneEdge[] } {
  const toRemove = new Set<string>()
  for (const n of nodes) {
    if (isLegacyFnNode(n)) toRemove.add(n.id)
  }
  if (toRemove.size === 0) return { removed: 0, nodes, edges }
  if (typeof console !== 'undefined') {
    console.warn(`[ADR 078] Removing ${toRemove.size} orphan legacy node(s):`, [...toRemove])
  }
  edges = edges.filter(e => !toRemove.has(e.from) && !toRemove.has(e.to))
  nodes = nodes.filter(n => !toRemove.has(n.id))
  return { removed: toRemove.size, nodes, edges }
}
