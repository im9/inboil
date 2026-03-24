import { describe, it, expect } from 'vitest'
import { cloneSceneNode, cloneScene, restoreScene, migrateDecoratorsToModifiers, purgeOrphanModifiers } from './sceneData.ts'
import type { SceneNode, SceneEdge, Scene, GenerativeConfig } from './types.ts'

// ── Helpers ──

function patNode(id: string, x = 0.5, y = 0.5, decorators?: SceneNode['decorators']): SceneNode {
  return { id, type: 'pattern', x, y, root: false, patternId: `pat-${id}`, decorators }
}

function modNode(id: string, type: SceneNode['type'] = 'transpose', modifierParams?: SceneNode['modifierParams']): SceneNode {
  return { id, type, x: 0.5, y: 0.5, root: false, modifierParams: modifierParams ?? { transpose: { semitones: 3, mode: 'rel' } } }
}

function legacyModNode(id: string, type: SceneNode['type'] = 'transpose', params?: Record<string, number>): SceneNode {
  return { id, type, x: 0.5, y: 0.5, root: false, params: params ?? { semitones: 3 } }
}

function edge(from: string, to: string, order = 0): SceneEdge {
  return { id: `e-${from}-${to}`, from, to, order }
}

// ── cloneSceneNode ──

describe('cloneSceneNode', () => {
  it('deep clones modifierParams', () => {
    const orig = modNode('n1', 'transpose', { transpose: { semitones: 5, mode: 'rel' } })
    const cloned = cloneSceneNode(orig)
    cloned.modifierParams!.transpose!.semitones = 99
    expect(orig.modifierParams!.transpose!.semitones).toBe(5)
  })

  it('strips decorators after clone (migration)', () => {
    const orig = patNode('p1', 0.5, 0.5, [
      { type: 'transpose', params: { semitones: 3 } },
    ])
    const cloned = cloneSceneNode(orig)
    expect(cloned.decorators).toBeUndefined()
  })

  it('handles node without modifierParams', () => {
    const orig: SceneNode = { id: 'n1', type: 'pattern', x: 0, y: 0, root: false }
    const cloned = cloneSceneNode(orig)
    expect(cloned.modifierParams).toBeUndefined()
  })
})

// ── cloneScene ──

describe('cloneScene', () => {
  it('produces an independent copy', () => {
    const scene: Scene = {
      name: 'Test',
      nodes: [patNode('p1', 0.2, 0.3), modNode('f1')],
      edges: [edge('f1', 'p1')],
      labels: [{ id: 'l1', text: 'hello', x: 0.5, y: 0.5 }],
      stamps: [],
    }
    const cloned = cloneScene(scene)
    cloned.nodes[0].x = 0.9
    cloned.edges[0].from = 'changed'
    cloned.labels[0].text = 'changed'
    expect(scene.nodes[0].x).toBe(0.2)
    expect(scene.edges[0].from).toBe('f1')
    expect(scene.labels[0].text).toBe('hello')
  })
})

// ── restoreScene ──

describe('restoreScene', () => {
  it('returns empty scene for undefined input', () => {
    const scene = restoreScene(undefined)
    expect(scene.name).toBe('Main')
    expect(scene.nodes).toEqual([])
    expect(scene.edges).toEqual([])
    expect(scene.labels).toEqual([])
  })

  it('fills missing labels with empty array', () => {
    const src = { name: 'Test', nodes: [], edges: [] } as unknown as Scene
    const restored = restoreScene(src)
    expect(restored.labels).toEqual([])
  })

  it('migrates decorators to modifier nodes during restore', () => {
    const src: Scene = {
      name: 'Test',
      nodes: [
        patNode('p1'),
        patNode('p2', 0.5, 0.5, [{ type: 'transpose', params: { semitones: 5 } }]),
      ],
      edges: [edge('p1', 'p2')],
      labels: [],
      stamps: [],
    }
    const restored = restoreScene(src)
    // p2 should no longer have decorators
    const p2 = restored.nodes.find((n: SceneNode) => n.id === 'p2')!
    expect(p2.decorators).toBeUndefined()
    // Should have a modifier node with transpose modifierParams
    const modNodes = restored.nodes.filter((n: SceneNode) => n.type === 'transpose')
    expect(modNodes.length).toBe(1)
    expect(modNodes[0].modifierParams?.transpose?.semitones).toBe(5)
  })

  it('migrates legacy params to modifierParams during restore', () => {
    const src: Scene = {
      name: 'Test',
      nodes: [legacyModNode('f1', 'tempo', { bpm: 140 }), patNode('p1')],
      edges: [edge('f1', 'p1')],
      labels: [],
      stamps: [],
    }
    const restored = restoreScene(src)
    const f1 = restored.nodes.find((n: SceneNode) => n.id === 'f1')!
    expect(f1.modifierParams?.tempo?.bpm).toBe(140)
    expect(f1.params).toBeUndefined()
  })
})

// ── migrateDecoratorsToModifiers ──

describe('migrateDecoratorsToModifiers', () => {
  it('converts decorators on a pattern node to modifier node chain', () => {
    const nodes = [
      patNode('p1'),
      patNode('p2', 0.5, 0.5, [
        { type: 'transpose', params: { semitones: 5 } },
        { type: 'fx', params: { verb: 1, delay: 0, glitch: 0, granular: 0 } },
      ]),
    ]
    const edges = [edge('p1', 'p2')]
    const result = migrateDecoratorsToModifiers(nodes, edges)
    expect(result.converted).toBe(2)
    // Should have new modifier nodes
    const modNodes = result.nodes.filter((n: SceneNode) => n.type !== 'pattern')
    expect(modNodes.length).toBe(2)
    // Incoming edge should point to first modifier node in chain, not p2
    const incomingToP2 = result.edges.filter((e: SceneEdge) => e.to === 'p2')
    expect(incomingToP2.length).toBe(1) // last modifier node → p2
  })

  it('does nothing when no decorators exist', () => {
    const nodes = [patNode('p1'), patNode('p2')]
    const edges = [edge('p1', 'p2')]
    const result = migrateDecoratorsToModifiers(nodes, edges)
    expect(result.converted).toBe(0)
    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(1)
  })

  it('skips automation decorators', () => {
    const nodes = [
      patNode('p1', 0.5, 0.5, [
        { type: 'automation', params: {} },
        { type: 'transpose', params: { semitones: 3 } },
      ]),
    ]
    const edges: SceneEdge[] = []
    const result = migrateDecoratorsToModifiers(nodes, edges)
    expect(result.converted).toBe(1) // only transpose, not automation
  })
})

// ── purgeOrphanModifiers ──

describe('purgeOrphanModifiers', () => {
  it('removes modifier nodes with no outgoing edges (dead ends)', () => {
    const nodes = [patNode('p1'), modNode('f1')]
    const edges = [edge('p1', 'f1')]
    const result = purgeOrphanModifiers(nodes, edges)
    expect(result.removed).toBe(1)
    expect(result.nodes.find((n: SceneNode) => n.id === 'f1')).toBeUndefined()
    expect(result.edges.every((e: SceneEdge) => e.from !== 'f1' && e.to !== 'f1')).toBe(true)
  })

  it('preserves modifier nodes with outgoing edges', () => {
    const nodes = [modNode('f1'), patNode('p1')]
    const edges = [edge('f1', 'p1')]
    const result = purgeOrphanModifiers(nodes, edges)
    expect(result.removed).toBe(0)
    expect(result.nodes).toHaveLength(2)
  })

  it('removes automation type nodes', () => {
    const autoNode: SceneNode = { id: 'a1', type: 'automation' as SceneNode['type'], x: 0.5, y: 0.5, root: false }
    const nodes = [patNode('p1'), autoNode]
    const edges = [edge('p1', 'a1')]
    const result = purgeOrphanModifiers(nodes, edges)
    expect(result.removed).toBe(1)
  })

  it('preserves generative nodes', () => {
    const gen: GenerativeConfig = {
      engine: 'turing', mergeMode: 'replace', targetTrack: 0,
      params: { engine: 'turing', length: 8, lock: 0.5, range: [48, 72] as [number, number], mode: 'note' as const, density: 0.7 },
    }
    const gNode: SceneNode = { id: 'g1', type: 'generative', x: 0.5, y: 0.5, root: false, generative: gen }
    const nodes = [patNode('p1'), gNode]
    const edges = [edge('p1', 'g1')]
    const result = purgeOrphanModifiers(nodes, edges)
    expect(result.removed).toBe(0)
    expect(result.nodes).toHaveLength(2)
  })

  it('preserves pattern nodes', () => {
    const nodes = [patNode('p1'), patNode('p2')]
    const edges = [edge('p1', 'p2')]
    const result = purgeOrphanModifiers(nodes, edges)
    expect(result.removed).toBe(0)
  })
})

// ── Generative nodes (ADR 078) ──

function genNode(id: string): SceneNode {
  const gen: GenerativeConfig = {
    engine: 'turing', mergeMode: 'replace', targetTrack: 0,
    params: { engine: 'turing', length: 8, lock: 0.5, range: [48, 72] as [number, number], mode: 'note' as const, density: 0.7 },
  }
  return { id, type: 'generative', x: 0.5, y: 0.5, root: false, generative: gen }
}

describe('cloneSceneNode (generative)', () => {
  it('deep clones generative config', () => {
    const orig = genNode('g1')
    const cloned = cloneSceneNode(orig)
    ;(cloned.generative!.params as any).length = 16
    expect((orig.generative!.params as any).length).toBe(8)
  })

  it('preserves engine type', () => {
    const cloned = cloneSceneNode(genNode('g1'))
    expect(cloned.generative!.engine).toBe('turing')
    expect(cloned.type).toBe('generative')
  })
})

describe('restoreScene (ADR 078 generative)', () => {
  it('preserves generative nodes during restore', () => {
    const src: Scene = {
      name: 'Test',
      nodes: [patNode('p1'), genNode('g1')],
      edges: [edge('p1', 'g1')],
      labels: [],
      stamps: [],
    }
    const restored = restoreScene(src)
    expect(restored.nodes.find((n: SceneNode) => n.id === 'g1')).toBeDefined()
    expect(restored.nodes.find((n: SceneNode) => n.id === 'g1')!.generative!.engine).toBe('turing')
  })
})
