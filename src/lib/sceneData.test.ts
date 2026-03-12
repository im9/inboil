import { describe, it, expect } from 'vitest'
import { cloneSceneNode, cloneScene, restoreScene, hasMigratableFnNodes, migrateFnToDecorators, purgeStandaloneFnNodes } from './sceneData.ts'
import type { SceneNode, SceneEdge, Scene, GenerativeConfig } from './state.svelte.ts'

// ── Helpers ──

function patNode(id: string, x = 0.5, y = 0.5, decorators?: SceneNode['decorators']): SceneNode {
  return { id, type: 'pattern', x, y, root: false, patternId: `pat-${id}`, decorators }
}

function fnNode(id: string, type: SceneNode['type'] = 'transpose', params?: Record<string, number>): SceneNode {
  return { id, type, x: 0.5, y: 0.5, root: false, params: params ?? { semitones: 3 } }
}

function edge(from: string, to: string, order = 0): SceneEdge {
  return { id: `e-${from}-${to}`, from, to, order }
}

// ── cloneSceneNode ──

describe('cloneSceneNode', () => {
  it('deep clones params', () => {
    const orig = fnNode('n1', 'transpose', { semitones: 5 })
    const cloned = cloneSceneNode(orig)
    cloned.params!.semitones = 99
    expect(orig.params!.semitones).toBe(5)
  })

  it('deep clones decorators', () => {
    const orig = patNode('p1', 0.5, 0.5, [
      { type: 'transpose', params: { semitones: 3 } },
      { type: 'fx', params: { verb: 1, delay: 0 } },
    ])
    const cloned = cloneSceneNode(orig)
    cloned.decorators![0].params.semitones = 99
    cloned.decorators![1].params.verb = 0
    expect(orig.decorators![0].params.semitones).toBe(3)
    expect(orig.decorators![1].params.verb).toBe(1)
  })

  it('handles node without decorators', () => {
    const orig: SceneNode = { id: 'n1', type: 'pattern', x: 0, y: 0, root: false }
    const cloned = cloneSceneNode(orig)
    expect(cloned.decorators).toEqual([])
  })

  it('handles node without params', () => {
    const orig: SceneNode = { id: 'n1', type: 'pattern', x: 0, y: 0, root: false }
    const cloned = cloneSceneNode(orig)
    expect(cloned.params).toBeUndefined()
  })
})

// ── cloneScene ──

describe('cloneScene', () => {
  it('produces an independent copy', () => {
    const scene: Scene = {
      name: 'Test',
      nodes: [patNode('p1', 0.2, 0.3, [{ type: 'tempo', params: { bpm: 140 } }])],
      edges: [edge('p1', 'p2')],
      labels: [{ id: 'l1', text: 'hello', x: 0.5, y: 0.5 }],
    }
    const cloned = cloneScene(scene)
    // Mutate clone — original should be untouched
    cloned.nodes[0].x = 0.9
    cloned.nodes[0].decorators![0].params.bpm = 200
    cloned.edges[0].from = 'changed'
    cloned.labels[0].text = 'changed'
    expect(scene.nodes[0].x).toBe(0.2)
    expect(scene.nodes[0].decorators![0].params.bpm).toBe(140)
    expect(scene.edges[0].from).toBe('p1')
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

  it('fills missing decorators with empty array', () => {
    const src: Scene = {
      name: 'Test',
      nodes: [{ id: 'n1', type: 'pattern', x: 0, y: 0, root: true }],
      edges: [],
      labels: [],
    }
    const restored = restoreScene(src)
    expect(restored.nodes[0].decorators).toEqual([])
  })

  it('fills missing labels with empty array', () => {
    const src = { name: 'Test', nodes: [], edges: [] } as unknown as Scene
    const restored = restoreScene(src)
    expect(restored.labels).toEqual([])
  })

  it('deep clones decorators from source', () => {
    const dec = { type: 'transpose' as const, params: { semitones: 5 } }
    const src: Scene = {
      name: 'Test',
      nodes: [{ id: 'n1', type: 'pattern', x: 0, y: 0, root: true, decorators: [dec] }],
      edges: [],
      labels: [],
    }
    const restored = restoreScene(src)
    restored.nodes[0].decorators![0].params.semitones = 99
    expect(dec.params.semitones).toBe(5)
  })
})

// ── hasMigratableFnNodes ──

describe('hasMigratableFnNodes', () => {
  it('returns true for [Pat] → [Fn] → [Pat] chain', () => {
    const nodes = [patNode('p1'), fnNode('f1'), patNode('p2')]
    const edges = [edge('p1', 'f1'), edge('f1', 'p2')]
    expect(hasMigratableFnNodes(nodes, edges)).toBe(true)
  })

  it('returns false when no function nodes exist', () => {
    const nodes = [patNode('p1'), patNode('p2')]
    const edges = [edge('p1', 'p2')]
    expect(hasMigratableFnNodes(nodes, edges)).toBe(false)
  })

  it('returns false when function node has multiple outputs', () => {
    const nodes = [patNode('p1'), fnNode('f1'), patNode('p2'), patNode('p3')]
    const edges = [edge('p1', 'f1'), edge('f1', 'p2'), edge('f1', 'p3')]
    expect(hasMigratableFnNodes(nodes, edges)).toBe(false)
  })

  it('returns false when function node points to another function node', () => {
    const nodes = [fnNode('f1'), fnNode('f2', 'tempo')]
    const edges = [edge('f1', 'f2')]
    expect(hasMigratableFnNodes(nodes, edges)).toBe(false)
  })

  it('skips probability nodes', () => {
    const nodes: SceneNode[] = [
      patNode('p1'),
      { id: 'prob', type: 'probability', x: 0.5, y: 0.5, root: false },
      patNode('p2'),
    ]
    const edges = [edge('p1', 'prob'), edge('prob', 'p2')]
    expect(hasMigratableFnNodes(nodes, edges)).toBe(false)
  })
})

// ── migrateFnToDecorators ──

describe('migrateFnToDecorators', () => {
  it('converts a single [Pat] → [Fn] → [Pat] chain', () => {
    const nodes = [patNode('p1'), fnNode('f1', 'transpose', { semitones: 5 }), patNode('p2')]
    const edges = [edge('p1', 'f1'), edge('f1', 'p2')]
    const result = migrateFnToDecorators(nodes, edges)
    expect(result.converted).toBe(1)
    // f1 should be gone
    expect(result.nodes.find(n => n.id === 'f1')).toBeUndefined()
    // p2 should have a decorator
    const p2 = result.nodes.find(n => n.id === 'p2')!
    expect(p2.decorators).toHaveLength(1)
    expect(p2.decorators![0].type).toBe('transpose')
    expect(p2.decorators![0].params.semitones).toBe(5)
    // Edge should be rewired: p1 → p2
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].from).toBe('p1')
    expect(result.edges[0].to).toBe('p2')
  })

  it('converts chained function nodes [Pat] → [Fn1] → [Fn2] → [Pat]', () => {
    const nodes = [
      patNode('p1'),
      fnNode('f1', 'transpose', { semitones: 3 }),
      fnNode('f2', 'tempo', { bpm: 140 }),
      patNode('p2'),
    ]
    const edges = [edge('p1', 'f1'), edge('f1', 'f2'), edge('f2', 'p2')]
    const result = migrateFnToDecorators(nodes, edges)
    expect(result.converted).toBe(2)
    const p2 = result.nodes.find(n => n.id === 'p2')!
    expect(p2.decorators).toHaveLength(2)
    // First converted: f2 (closer to pattern), then f1
    expect(p2.decorators!.map(d => d.type)).toEqual(['tempo', 'transpose'])
  })

  it('does nothing when no migratable nodes exist', () => {
    const nodes = [patNode('p1'), patNode('p2')]
    const edges = [edge('p1', 'p2')]
    const result = migrateFnToDecorators(nodes, edges)
    expect(result.converted).toBe(0)
    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(1)
  })

  it('preserves existing decorators on the target', () => {
    const nodes = [
      patNode('p1'),
      fnNode('f1', 'tempo', { bpm: 160 }),
      patNode('p2', 0.5, 0.5, [{ type: 'fx', params: { verb: 1 } }]),
    ]
    const edges = [edge('p1', 'f1'), edge('f1', 'p2')]
    const result = migrateFnToDecorators(nodes, edges)
    const p2 = result.nodes.find(n => n.id === 'p2')!
    expect(p2.decorators).toHaveLength(2)
    expect(p2.decorators![0].type).toBe('fx') // existing
    expect(p2.decorators![1].type).toBe('tempo') // migrated
  })

  it('does not mutate original params', () => {
    const origParams = { semitones: 7 }
    const nodes = [patNode('p1'), fnNode('f1', 'transpose', origParams), patNode('p2')]
    const edges = [edge('p1', 'f1'), edge('f1', 'p2')]
    const result = migrateFnToDecorators(nodes, edges)
    const p2 = result.nodes.find(n => n.id === 'p2')!
    p2.decorators![0].params.semitones = 99
    expect(origParams.semitones).toBe(7)
  })
})

// ── Generative nodes (ADR 078) ──

function genNode(id: string): SceneNode {
  const gen: GenerativeConfig = {
    engine: 'turing',
    mergeMode: 'replace',
    targetTrack: 0,
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

// ── purgeStandaloneFnNodes ──

describe('purgeStandaloneFnNodes', () => {
  it('removes orphan legacy fn nodes', () => {
    const nodes = [patNode('p1'), fnNode('f1'), patNode('p2')]
    const edges = [edge('p1', 'f1'), edge('f1', 'p2')]
    const result = purgeStandaloneFnNodes(nodes, edges)
    expect(result.removed).toBe(1)
    expect(result.nodes.find(n => n.id === 'f1')).toBeUndefined()
    // Edges referencing f1 should be removed
    expect(result.edges.every(e => e.from !== 'f1' && e.to !== 'f1')).toBe(true)
  })

  it('preserves generative nodes', () => {
    const nodes = [patNode('p1'), genNode('g1')]
    const edges = [edge('p1', 'g1')]
    const result = purgeStandaloneFnNodes(nodes, edges)
    expect(result.removed).toBe(0)
    expect(result.nodes).toHaveLength(2)
  })

  it('preserves pattern nodes', () => {
    const nodes = [patNode('p1'), patNode('p2')]
    const edges = [edge('p1', 'p2')]
    const result = purgeStandaloneFnNodes(nodes, edges)
    expect(result.removed).toBe(0)
  })
})

describe('restoreScene (ADR 078 migration)', () => {
  it('purges legacy fn nodes during restore', () => {
    const src: Scene = {
      name: 'Test',
      nodes: [patNode('p1'), fnNode('f1'), patNode('p2')],
      edges: [edge('p1', 'f1'), edge('f1', 'p2')],
      labels: [],
    }
    const restored = restoreScene(src)
    expect(restored.nodes.find(n => n.id === 'f1')).toBeUndefined()
  })

  it('preserves generative nodes during restore', () => {
    const src: Scene = {
      name: 'Test',
      nodes: [patNode('p1'), genNode('g1')],
      edges: [edge('p1', 'g1')],
      labels: [],
    }
    const restored = restoreScene(src)
    expect(restored.nodes.find(n => n.id === 'g1')).toBeDefined()
    expect(restored.nodes.find(n => n.id === 'g1')!.generative!.engine).toBe('turing')
  })
})
