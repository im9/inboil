/**
 * Pure data transformation functions for scene (ADR 062, updated ADR 093).
 * Extracted from state.svelte.ts for testability and separation of concerns.
 */

import type { SceneNode, SceneEdge, Scene, SceneDecorator, ModifierParams, ModifierType, TonnetzParams } from './types.ts'
import { legacyToSlots } from './generative.ts'

// ── Clone helpers ──

function cloneModifierParams(fp: ModifierParams): ModifierParams {
  const clone: ModifierParams = {}
  if (fp.transpose) clone.transpose = { ...fp.transpose }
  if (fp.tempo) clone.tempo = { ...fp.tempo }
  if (fp.repeat) clone.repeat = { ...fp.repeat }
  if (fp.fx) clone.fx = { ...fp.fx, ...(fp.fx.flavourOverrides ? { flavourOverrides: { ...fp.fx.flavourOverrides } } : {}) }
  if (fp.sweep) clone.sweep = {
    curves: fp.sweep.curves.map(c => ({ ...c, target: { ...c.target }, points: c.points.map(p => ({ ...p })) })),
    ...(fp.sweep.toggles ? { toggles: fp.sweep.toggles.map(t => ({ ...t, target: { ...t.target }, points: t.points.map(p => ({ ...p })) })) } : {}),
  }
  return clone
}

export function cloneSceneNode(n: SceneNode): SceneNode {
  const clone: SceneNode = {
    ...n,
    ...(n.params ? { params: { ...n.params } } : {}),
  }
  if (n.modifierParams) clone.modifierParams = cloneModifierParams(n.modifierParams)
  if (n.automationParams) {
    const ap = n.automationParams
    clone.automationParams = { target: { ...ap.target }, points: ap.points.map(p => ({ ...p })), interpolation: ap.interpolation }
  }
  if (n.generative) {
    clone.generative = {
      ...n.generative,
      params: { ...n.generative.params },
    }
    // Deep-clone array/tuple fields in params (slots contain objects, need deeper clone)
    const p = n.generative.params as unknown as Record<string, unknown>
    const cp = clone.generative.params as unknown as Record<string, unknown>
    for (const k of Object.keys(p)) {
      if (Array.isArray(p[k])) {
        cp[k] = (p[k] as unknown[]).map(v =>
          typeof v === 'object' && v !== null ? { ...v } : v
        )
      }
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
    stamps: (sc.stamps ?? []).map(s => ({ ...s })),
  }
}

/** Restore a scene from saved data, filling in defaults for missing fields.
 *  Auto-migrates decorators to modifier nodes, fnParams→modifierParams, and legacy formats (ADR 093, ADR 125). */
export function restoreScene(src: Scene | undefined): Scene {
  if (!src) return { name: 'Main', nodes: [], edges: [], labels: [], stamps: [] }
  // Clone nodes preserving decorators (migration will strip them)
  let nodes = src.nodes.map(n => {
    const clone = cloneSceneNode(n)
    if (n.decorators?.length) clone.decorators = n.decorators.map(d => ({ ...d, params: { ...d.params } }))
    return clone
  })
  let edges = src.edges.map(e => ({ ...e }))
  // ADR 093: migrate decorators on pattern nodes → standalone modifier nodes
  const dm = migrateDecoratorsToModifiers(nodes, edges)
  nodes = dm.nodes; edges = dm.edges
  // ADR 125: migrate fnParams → modifierParams
  for (const n of nodes) {
    if (n.fnParams && !n.modifierParams) {
      n.modifierParams = n.fnParams
    }
    delete n.fnParams
  }
  // ADR 093: migrate legacy modifier nodes (params → modifierParams)
  migrateLegacyModifierParams(nodes)
  // Migrate legacy sweep 'all' kind → drop (vol/pan are per-track, not master)
  for (const n of nodes) {
    if (n.modifierParams?.sweep) {
      n.modifierParams.sweep.curves = n.modifierParams.sweep.curves.filter(
        c => (c.target as { kind: string }).kind !== 'all'
      )
      // Migrate filter curves from fx → master (ADR 122 Phase 4)
      for (const c of n.modifierParams.sweep.curves) {
        const t = c.target as { kind: string; param?: string }
        if (t.kind === 'fx' && (t.param === 'filterCutoff' || t.param === 'filterResonance')) {
          t.kind = 'master'
        }
      }
    }
  }
  // ADR 126: migrate legacy Tonnetz params (sequence + stepsPerChord) → slots
  for (const n of nodes) {
    if (n.generative?.params) {
      const tp = n.generative.params as TonnetzParams
      if (tp.engine === 'tonnetz' && !tp.slots && tp.sequence) {
        tp.slots = legacyToSlots(tp)
      }
    }
  }
  // Remove orphan automation/probability nodes
  const p = purgeOrphanModifiers(nodes, edges)
  nodes = p.nodes; edges = p.edges
  return {
    name: src.name,
    nodes,
    edges,
    labels: (src.labels ?? []).map(l => ({ ...l })),
    stamps: (src.stamps ?? []).map(s => ({ ...s })),
  }
}

// ── Migration (ADR 093) ──

const MODIFIER_TYPES = new Set<string>(['transpose', 'tempo', 'repeat', 'fx', 'sweep'])

/** Convert decorator params to typed ModifierParams */
function decoratorToModifierParams(dec: SceneDecorator): ModifierParams | null {
  const p = dec.params
  switch (dec.type) {
    case 'transpose': return { transpose: { semitones: p.semitones ?? 0, mode: p.mode === 1 ? 'abs' : 'rel', key: p.key } }
    case 'tempo': return { tempo: { bpm: p.bpm ?? 120 } }
    case 'repeat': return { repeat: { count: p.count ?? 2 } }
    case 'fx': return { fx: { verb: !!p.verb, delay: !!p.delay, glitch: !!p.glitch, granular: !!p.granular, flavourOverrides: dec.flavourOverrides } }
    case 'automation': return null  // dropped (ADR 093 — replaced by per-step paramLocks)
  }
}

/** Convert legacy modifier node params (Record<string, number>) to typed ModifierParams */
function legacyParamsToModifierParams(type: string, params: Record<string, number>): ModifierParams | null {
  switch (type) {
    case 'transpose': return { transpose: { semitones: params.semitones ?? 0, mode: params.mode === 1 ? 'abs' : 'rel', key: params.key } }
    case 'tempo': return { tempo: { bpm: params.bpm ?? 120 } }
    case 'repeat': return { repeat: { count: params.count ?? 2 } }
    case 'fx': return { fx: { verb: !!params.verb, delay: !!params.delay, glitch: !!params.glitch, granular: !!params.granular } }
    default: return null  // automation, probability — not convertible
  }
}

let _fnIdCounter = 0

/** Migrate decorators on pattern nodes to standalone modifier nodes (ADR 093).
 *  For each decorator, creates a modifier node wired before the pattern node. */
export function migrateDecoratorsToModifiers(
  nodes: SceneNode[],
  edges: SceneEdge[],
): { converted: number; nodes: SceneNode[]; edges: SceneEdge[] } {
  let converted = 0
  const newNodes: SceneNode[] = []
  const newEdges: SceneEdge[] = []

  for (const node of nodes) {
    if (!node.decorators?.length) continue

    // Build chain of modifier nodes from decorators (order preserved)
    const modChain: SceneNode[] = []
    for (const dec of node.decorators) {
      const fp = decoratorToModifierParams(dec)
      if (!fp) continue  // skip automation decorators
      const modNode: SceneNode = {
        id: `fn_mig_${++_fnIdCounter}`,
        type: dec.type as ModifierType,
        x: node.x - 0.06 * (modChain.length + 1),
        y: node.y,
        root: false,
        modifierParams: fp,
      }
      modChain.push(modNode)
      converted++
    }

    if (modChain.length > 0) {
      // Rewire incoming edges → first modifier node in chain
      const headId = modChain[0].id
      for (const e of edges) {
        if (e.to === node.id) e.to = headId
      }
      // Chain modifier nodes together
      for (let i = 0; i < modChain.length - 1; i++) {
        newEdges.push({ id: `e_mig_${++_fnIdCounter}`, from: modChain[i].id, to: modChain[i + 1].id, order: 0 })
      }
      // Last modifier node → pattern node
      newEdges.push({ id: `e_mig_${++_fnIdCounter}`, from: modChain[modChain.length - 1].id, to: node.id, order: 0 })
      newNodes.push(...modChain)
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

/** Migrate legacy modifier nodes that use params → modifierParams format */
function migrateLegacyModifierParams(nodes: SceneNode[]): void {
  for (const n of nodes) {
    if (n.modifierParams) continue  // already migrated
    if (!MODIFIER_TYPES.has(n.type)) continue
    if (!n.params) continue
    const fp = legacyParamsToModifierParams(n.type, n.params)
    if (fp) {
      n.modifierParams = fp
      delete n.params
      delete n.automationParams
    }
  }
}

/** Remove orphaned automation/probability nodes and dead-end modifier nodes */
export function purgeOrphanModifiers(
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
    // Remove modifier nodes with no outgoing edges (dead ends)
    if (MODIFIER_TYPES.has(n.type) && !edges.some(e => e.from === n.id)) {
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
