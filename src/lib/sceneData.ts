/**
 * Pure data transformation functions for scene (ADR 062, updated ADR 093).
 * Extracted from state.svelte.ts for testability and separation of concerns.
 */

import type { SceneNode, SceneEdge, Scene, SceneDecorator, ModifierParams, ModifierType, TonnetzParams, TonnetzSlot, TonnetzAnchor, SweepData } from './types.ts'

// ── Clone helpers ──

export function cloneSweepData(sd: SweepData): SweepData {
  const clone: SweepData = {
    curves: sd.curves.map(c => ({ ...c, target: { ...c.target }, points: c.points.map(p => ({ ...p })) })),
  }
  if (sd.toggles) clone.toggles = sd.toggles.map(t => ({ ...t, target: { ...t.target }, points: t.points.map(p => ({ ...p })) }))
  if (sd.durationMs !== undefined) clone.durationMs = sd.durationMs
  if (sd.offsetMs !== undefined) clone.offsetMs = sd.offsetMs
  return clone
}

export function cloneModifierParams(fp: ModifierParams): ModifierParams {
  const clone: ModifierParams = {}
  if (fp.transpose) clone.transpose = { ...fp.transpose }
  if (fp.tempo) clone.tempo = { ...fp.tempo }
  if (fp.repeat) clone.repeat = { ...fp.repeat }
  if (fp.fx) clone.fx = { ...fp.fx, ...(fp.fx.flavourOverrides ? { flavourOverrides: { ...fp.fx.flavourOverrides } } : {}) }
  if (fp.sweep) clone.sweep = cloneSweepData(fp.sweep)
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
    // Deep-clone array and object fields in params (nested objects like arp, rhythm can be Svelte proxies)
    const p = n.generative.params as unknown as Record<string, unknown>
    const cp = clone.generative.params as unknown as Record<string, unknown>
    for (const k of Object.keys(p)) {
      const v = p[k]
      if (Array.isArray(v)) {
        cp[k] = v.map(item => {
          if (typeof item !== 'object' || item === null) return item
          const obj: Record<string, unknown> = {}
          for (const [key, val] of Object.entries(item as Record<string, unknown>)) {
            obj[key] = Array.isArray(val) ? [...val] : val
          }
          return obj
        })
      } else if (typeof v === 'object' && v !== null) {
        // Plain object (arp, rhythm preset object) — shallow clone with array spread
        const obj: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
          obj[key] = Array.isArray(val) ? [...val] : val
        }
        cp[k] = obj
      }
    }
  }
  // Strip legacy decorator field after migration
  delete clone.decorators
  return clone
}

export function cloneScene(sc: Scene): Scene {
  const clone: Scene = {
    name: sc.name,
    nodes: sc.nodes.map(cloneSceneNode),
    edges: sc.edges.map(e => ({ ...e })),
    labels: (sc.labels ?? []).map(l => ({ ...l })),
    stamps: (sc.stamps ?? []).map(s => ({ ...s })),
  }
  if (sc.globalSweep) clone.globalSweep = cloneSweepData(sc.globalSweep)
  return clone
}

/** Migrate legacy sweep curve values from offset (-1..+1) to absolute (0..1).
 *  Detects old format by checking if any point has v < 0 or v > 1. */
export function migrateSweepCurvesToAbsolute(sd: SweepData): void {
  for (const curve of sd.curves) {
    if (curve.points.some(p => p.v < -0.001 || p.v > 1.001)) {
      for (const p of curve.points) {
        p.v = (p.v + 1) / 2  // -1..+1 → 0..1
      }
    }
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
      // Migrate sweep curve values from offset (-1..+1) to absolute (0..1)
      migrateSweepCurvesToAbsolute(n.modifierParams.sweep)
    }
  }
  // ADR 126 v2: migrate Tonnetz params to per-step format
  for (const n of nodes) {
    if (n.generative?.params) {
      const tp = n.generative.params as TonnetzParams & { slots?: TonnetzSlot[]; stepsPerChord?: number }
      if (tp.engine === 'tonnetz') {
        // Migrate v1 slots → new format (sequence + anchors)
        if (tp.slots && !Array.isArray(tp.sequence)) {
          const sequence: string[] = []
          const anchors: TonnetzAnchor[] = []
          let step = 0
          for (const slot of tp.slots) {
            const dur = slot.steps ?? tp.stepsPerChord ?? 4
            if ('chord' in slot && slot.chord) {
              anchors.push({ step, chord: [...slot.chord] as [number, number, number] })
              // Fill steps with hold
              for (let i = 0; i < dur; i++) sequence.push('')
            } else {
              const op = ('op' in slot ? slot.op : '') ?? ''
              for (let i = 0; i < dur; i++) sequence.push(op)
            }
            step += dur
          }
          tp.sequence = sequence.length > 0 ? sequence : ['P', 'L', 'R']
          if (anchors.length > 0) tp.anchors = anchors
          delete tp.slots
        }
        // Migrate legacy stepsPerChord (pre-v1) — sequence already present, just remove stepsPerChord
        if (tp.stepsPerChord != null && !tp.slots) {
          delete tp.stepsPerChord
        }
        // Ensure sequence exists
        if (!tp.sequence || !Array.isArray(tp.sequence)) {
          tp.sequence = ['P', 'L', 'R']
        }
      }
    }
  }
  // Remove orphan automation/probability nodes
  const p = purgeOrphanModifiers(nodes, edges)
  nodes = p.nodes; edges = p.edges
  const scene: Scene = {
    name: src.name,
    nodes,
    edges,
    labels: (src.labels ?? []).map(l => ({ ...l })),
    stamps: (src.stamps ?? []).map(s => ({ ...s })),
  }
  if (src.globalSweep) {
    scene.globalSweep = cloneSweepData(src.globalSweep)
    migrateSweepCurvesToAbsolute(scene.globalSweep)
  }
  return scene
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
