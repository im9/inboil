/**
 * Pure data transformation functions for scene graph (ADR 062).
 * Extracted from state.svelte.ts for testability and separation of concerns.
 */

import type { SceneNode, SceneEdge, Scene, SceneDecorator } from './state.svelte.ts'

// ── Clone helpers ──

export function cloneSceneNode(n: SceneNode): SceneNode {
  return {
    ...n,
    ...(n.params ? { params: { ...n.params } } : {}),
    decorators: (n.decorators ?? []).map(d => ({ type: d.type, params: { ...d.params } })),
  }
}

export function cloneScene(sc: Scene): Scene {
  return {
    name: sc.name,
    nodes: sc.nodes.map(cloneSceneNode),
    edges: sc.edges.map(e => ({ ...e })),
    labels: (sc.labels ?? []).map(l => ({ ...l })),
  }
}

/** Restore a scene from saved data, filling in defaults for missing fields */
export function restoreScene(src: Scene | undefined): Scene {
  if (!src) return { name: 'Main', nodes: [], edges: [], labels: [] }
  return {
    name: src.name,
    nodes: src.nodes.map(cloneSceneNode),
    edges: src.edges.map(e => ({ ...e })),
    labels: (src.labels ?? []).map(l => ({ ...l })),
  }
}

// ── Migration (ADR 062 Phase 4) ──

/** Check if a scene has function nodes in edge chains that can be migrated to decorators */
export function hasMigratableFnNodes(nodes: SceneNode[], edges: SceneEdge[]): boolean {
  for (const fn of nodes) {
    if (fn.type === 'pattern' || fn.type === 'probability') continue
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
      if (fn.type === 'pattern' || fn.type === 'probability') continue
      const outEdges = edges.filter(e => e.from === fn.id)
      const inEdges = edges.filter(e => e.to === fn.id)
      if (outEdges.length !== 1) continue
      const targetNode = nodes.find(n => n.id === outEdges[0].to)
      if (!targetNode || targetNode.type !== 'pattern') continue
      const dec: SceneDecorator = { type: fn.type, params: { ...(fn.params ?? {}) } }
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
