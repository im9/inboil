import { describe, it, expect } from 'vitest'
import { cloneSceneNode, cloneScene, cloneSweepData, cloneModifierParams, restoreScene, migrateDecoratorsToModifiers, purgeOrphanModifiers, migrateSweepCurvesToAbsolute } from './sceneData.ts'
import type { SceneNode, SceneEdge, Scene, GenerativeConfig, SweepData, SweepToggleCurve, ModifierParams } from './types.ts'

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

// ── Sweep data: clone & migration (ADR 118, 122, 123) ──

function sweepNode(id: string, curves: any[], toggles?: SweepToggleCurve[]): SceneNode {
  return {
    id, type: 'sweep', x: 0.5, y: 0.5, root: false,
    modifierParams: { sweep: { curves, ...(toggles ? { toggles } : {}) } },
  }
}

describe('cloneSceneNode (sweep)', () => {
  it('deep clones sweep curves', () => {
    const orig = sweepNode('s1', [
      { target: { kind: 'fx', param: 'reverbWet' }, points: [{ t: 0, v: 0 }, { t: 1, v: 1 }], color: '#f00' },
    ])
    const cloned = cloneSceneNode(orig)
    cloned.modifierParams!.sweep!.curves[0].points[0].v = 0.99
    expect(orig.modifierParams!.sweep!.curves[0].points[0].v).toBe(0)
  })

  it('deep clones sweep toggles (ADR 123)', () => {
    const toggles: SweepToggleCurve[] = [
      { target: { kind: 'fxOn', fx: 'verb' }, points: [{ t: 0, on: false }, { t: 0.5, on: true }], color: '#0f0' },
    ]
    const orig = sweepNode('s1', [], toggles)
    const cloned = cloneSceneNode(orig)
    cloned.modifierParams!.sweep!.toggles![0].points[0].on = true
    expect(orig.modifierParams!.sweep!.toggles![0].points[0].on).toBe(false)
  })

  it('handles sweep without toggles', () => {
    const orig = sweepNode('s1', [
      { target: { kind: 'fx', param: 'delayTime' }, points: [{ t: 0, v: 0 }], color: '#00f' },
    ])
    const cloned = cloneSceneNode(orig)
    expect(cloned.modifierParams!.sweep!.toggles).toBeUndefined()
    expect(cloned.modifierParams!.sweep!.curves).toHaveLength(1)
  })
})

describe('restoreScene (sweep migration)', () => {
  it('migrates filter curves from fx kind to master kind (ADR 122)', () => {
    const src: Scene = {
      name: 'Test',
      nodes: [
        patNode('p1'),
        sweepNode('s1', [
          { target: { kind: 'fx', param: 'filterCutoff' }, points: [{ t: 0, v: 0 }], color: '#f00' },
          { target: { kind: 'fx', param: 'filterResonance' }, points: [{ t: 0, v: 0 }], color: '#0f0' },
          { target: { kind: 'fx', param: 'reverbWet' }, points: [{ t: 0, v: 0 }], color: '#00f' },
        ]),
      ],
      edges: [edge('s1', 'p1')],
      labels: [],
      stamps: [],
    }
    const restored = restoreScene(src)
    const s = restored.nodes.find((n: SceneNode) => n.id === 's1')!
    const curves = s.modifierParams!.sweep!.curves

    // filter curves should be migrated to master kind
    const filterCutoff = curves.find((c: any) => c.target.param === 'filterCutoff')!
    const filterReso = curves.find((c: any) => c.target.param === 'filterResonance')!
    expect(filterCutoff.target.kind).toBe('master')
    expect(filterReso.target.kind).toBe('master')

    // non-filter FX curves should remain unchanged
    const reverbWet = curves.find((c: any) => c.target.param === 'reverbWet')!
    expect(reverbWet.target.kind).toBe('fx')
  })

  it('preserves sweep toggles through restore (ADR 123)', () => {
    const toggles: SweepToggleCurve[] = [
      { target: { kind: 'hold', fx: 'verb' }, points: [{ t: 0, on: false }, { t: 0.5, on: true }], color: '#f00' },
      { target: { kind: 'fxOn', fx: 'delay' }, points: [{ t: 0.3, on: true }], color: '#0f0' },
    ]
    const src: Scene = {
      name: 'Test',
      nodes: [patNode('p1'), sweepNode('s1', [], toggles)],
      edges: [edge('s1', 'p1')],
      labels: [],
      stamps: [],
    }
    const restored = restoreScene(src)
    const s = restored.nodes.find((n: SceneNode) => n.id === 's1')!
    expect(s.modifierParams!.sweep!.toggles).toHaveLength(2)
    expect(s.modifierParams!.sweep!.toggles![0].target).toEqual({ kind: 'hold', fx: 'verb' })
    expect(s.modifierParams!.sweep!.toggles![1].points[0].on).toBe(true)
  })
})

// ── Clone roundtrip tests (BACKLOG) ──
// Fully-populated objects → clone → deepEqual + independence.
// Catches missing fields when types change.

function fullSweepData(): SweepData {
  return {
    curves: [
      { target: { kind: 'master', param: 'masterVolume' }, points: [{ t: 0, v: -0.5 }, { t: 0.5, v: 0.3 }, { t: 1, v: 1 }], color: '#f00' },
      { target: { kind: 'track', trackId: 2, param: 'volume' }, points: [{ t: 0.1, v: 0 }], color: '#0f0' },
      { target: { kind: 'send', trackId: 1, param: 'reverbSend' }, points: [{ t: 0, v: -1 }, { t: 1, v: 1 }], color: '#00f' },
      { target: { kind: 'fx', param: 'delayFeedback' }, points: [{ t: 0.2, v: 0.4 }], color: '#ff0' },
      { target: { kind: 'eq', band: 'eqMid', param: 'gain' }, points: [{ t: 0, v: 0 }, { t: 1, v: 0.8 }], color: '#0ff' },
    ],
    toggles: [
      { target: { kind: 'hold', fx: 'verb' }, points: [{ t: 0, on: false }, { t: 0.3, on: true }, { t: 0.7, on: false }], color: '#f0f' },
      { target: { kind: 'fxOn', fx: 'delay' }, points: [{ t: 0.5, on: true }], color: '#fa0' },
      { target: { kind: 'mute', trackId: 3 }, points: [{ t: 0, on: false }, { t: 1, on: true }], color: '#0af' },
    ],
    durationMs: 8000,
    offsetMs: 1200,
  }
}

function fullModifierParams(): ModifierParams {
  return {
    transpose: { semitones: -3, mode: 'abs', key: 7 },
    tempo: { bpm: 145 },
    repeat: { count: 4 },
    fx: { verb: true, delay: false, glitch: true, granular: false, flavourOverrides: { verb: 'hall', delay: 'tape' } },
    sweep: fullSweepData(),
  }
}

function fullScene(): Scene {
  return {
    name: 'Full Test Scene',
    nodes: [
      { id: 'p1', type: 'pattern', x: 0.1, y: 0.2, root: true, patternId: 'pat_00' },
      { id: 'p2', type: 'pattern', x: 0.6, y: 0.4, root: false, patternId: 'pat_01' },
      { id: 'f1', type: 'transpose', x: 0.3, y: 0.3, root: false, modifierParams: fullModifierParams() },
      { id: 'f2', type: 'sweep', x: 0.4, y: 0.5, root: false, modifierParams: { sweep: fullSweepData() } },
      {
        id: 'g1', type: 'generative', x: 0.7, y: 0.7, root: false,
        generative: {
          engine: 'turing', mergeMode: 'replace', targetTrack: 0,
          params: { engine: 'turing', length: 16, lock: 0.8, range: [36, 84] as [number, number], mode: 'note' as const, density: 0.5 },
        },
      },
      { id: 'prob1', type: 'probability', x: 0.5, y: 0.6, root: false },
    ],
    edges: [
      { id: 'e1', from: 'p1', to: 'f1', order: 0 },
      { id: 'e2', from: 'f1', to: 'f2', order: 0 },
      { id: 'e3', from: 'f2', to: 'p2', order: 0 },
      { id: 'e4', from: 'p1', to: 'g1', order: 1 },
      { id: 'e5', from: 'p1', to: 'prob1', order: 2 },
    ],
    labels: [
      { id: 'l1', text: 'Intro', x: 0.1, y: 0.05 },
      { id: 'l2', text: 'Build', x: 0.5, y: 0.05 },
    ],
    stamps: [
      { id: 's1', stampId: 'run', x: 0.8, y: 0.1 },
    ],
    globalSweep: fullSweepData(),
  }
}

describe('cloneSweepData roundtrip', () => {
  it('produces a deep equal copy of a fully-populated SweepData', () => {
    const orig = fullSweepData()
    const cloned = cloneSweepData(orig)
    expect(cloned).toEqual(orig)
  })

  it('clone is fully independent from original', () => {
    const orig = fullSweepData()
    const cloned = cloneSweepData(orig)

    // Mutate every nested structure in the clone
    cloned.curves[0].points[0].v = 999
    cloned.curves[0].target = { kind: 'fx', param: 'glitchX' }
    cloned.curves.push({ target: { kind: 'fx', param: 'reverbWet' }, points: [], color: '#000' })
    cloned.toggles![0].points[0].on = true
    cloned.toggles![0].target = { kind: 'fxOn', fx: 'glitch' }
    cloned.durationMs = 0
    cloned.offsetMs = 0

    // Original must be unaffected
    expect(orig.curves[0].points[0].v).toBe(-0.5)
    expect(orig.curves[0].target).toEqual({ kind: 'master', param: 'masterVolume' })
    expect(orig.curves).toHaveLength(5)
    expect(orig.toggles![0].points[0].on).toBe(false)
    expect(orig.toggles![0].target).toEqual({ kind: 'hold', fx: 'verb' })
    expect(orig.durationMs).toBe(8000)
    expect(orig.offsetMs).toBe(1200)
  })
})

describe('cloneModifierParams roundtrip', () => {
  it('produces a deep equal copy of fully-populated ModifierParams', () => {
    const orig = fullModifierParams()
    const cloned = cloneModifierParams(orig)
    expect(cloned).toEqual(orig)
  })

  it('clone is fully independent from original', () => {
    const orig = fullModifierParams()
    const cloned = cloneModifierParams(orig)

    cloned.transpose!.semitones = 12
    cloned.transpose!.key = 0
    cloned.tempo!.bpm = 200
    cloned.repeat!.count = 1
    cloned.fx!.verb = false
    cloned.fx!.flavourOverrides!.verb = 'room'
    cloned.sweep!.curves[0].points[0].v = 999

    expect(orig.transpose!.semitones).toBe(-3)
    expect(orig.transpose!.key).toBe(7)
    expect(orig.tempo!.bpm).toBe(145)
    expect(orig.repeat!.count).toBe(4)
    expect(orig.fx!.verb).toBe(true)
    expect(orig.fx!.flavourOverrides!.verb).toBe('hall')
    expect(orig.sweep!.curves[0].points[0].v).toBe(-0.5)
  })

  it('handles empty ModifierParams', () => {
    const orig: ModifierParams = {}
    const cloned = cloneModifierParams(orig)
    expect(cloned).toEqual({})
  })
})

describe('cloneScene roundtrip', () => {
  it('produces a deep equal copy of a fully-populated Scene', () => {
    const orig = fullScene()
    const cloned = cloneScene(orig)
    // cloneSceneNode strips decorators, so compare excluding that
    expect(cloned).toEqual(orig)
  })

  it('clone is fully independent from original', () => {
    const orig = fullScene()
    const cloned = cloneScene(orig)

    // Mutate nodes
    cloned.nodes[0].x = 0.99
    cloned.nodes[2].modifierParams!.transpose!.semitones = 99
    cloned.nodes[3].modifierParams!.sweep!.curves[0].points[0].v = 999
    ;(cloned.nodes[4].generative!.params as any).length = 64

    // Mutate edges
    cloned.edges[0].from = 'mutated'

    // Mutate labels
    cloned.labels[0].text = 'mutated'

    // Mutate stamps
    cloned.stamps[0].stampId = 'mutated'

    // Mutate globalSweep
    cloned.globalSweep!.curves[0].points[0].v = 999
    cloned.globalSweep!.toggles![0].points[0].on = true
    cloned.globalSweep!.durationMs = 0

    // Original must be unaffected
    expect(orig.nodes[0].x).toBe(0.1)
    expect(orig.nodes[2].modifierParams!.transpose!.semitones).toBe(-3)
    expect(orig.nodes[3].modifierParams!.sweep!.curves[0].points[0].v).toBe(-0.5)
    expect((orig.nodes[4].generative!.params as any).length).toBe(16)
    expect(orig.edges[0].from).toBe('p1')
    expect(orig.labels[0].text).toBe('Intro')
    expect(orig.stamps[0].stampId).toBe('run')
    expect(orig.globalSweep!.curves[0].points[0].v).toBe(-0.5)
    expect(orig.globalSweep!.toggles![0].points[0].on).toBe(false)
    expect(orig.globalSweep!.durationMs).toBe(8000)
  })
})

// ── migrateSweepCurvesToAbsolute ──

describe('migrateSweepCurvesToAbsolute', () => {
  it('converts offset values (-1..+1) to absolute (0..1)', () => {
    const sd: SweepData = {
      curves: [
        { target: { kind: 'master', param: 'masterVolume' }, points: [{ t: 0, v: -1 }, { t: 0.5, v: 0 }, { t: 1, v: 1 }], color: '#f00' },
      ],
    }
    migrateSweepCurvesToAbsolute(sd)
    expect(sd.curves[0].points[0].v).toBeCloseTo(0)    // -1 → 0
    expect(sd.curves[0].points[1].v).toBeCloseTo(0.5)   // 0 → 0.5
    expect(sd.curves[0].points[2].v).toBeCloseTo(1)      // 1 → 1
  })

  it('leaves already-absolute values (0..1) unchanged', () => {
    const sd: SweepData = {
      curves: [
        { target: { kind: 'master', param: 'swing' }, points: [{ t: 0, v: 0.2 }, { t: 1, v: 0.8 }], color: '#0f0' },
      ],
    }
    migrateSweepCurvesToAbsolute(sd)
    expect(sd.curves[0].points[0].v).toBeCloseTo(0.2)
    expect(sd.curves[0].points[1].v).toBeCloseTo(0.8)
  })

  it('migrates only curves with out-of-range values', () => {
    const sd: SweepData = {
      curves: [
        { target: { kind: 'master', param: 'masterVolume' }, points: [{ t: 0, v: -0.5 }, { t: 1, v: 0.5 }], color: '#f00' },
        { target: { kind: 'master', param: 'swing' }, points: [{ t: 0, v: 0.3 }, { t: 1, v: 0.7 }], color: '#0f0' },
      ],
    }
    migrateSweepCurvesToAbsolute(sd)
    // First curve migrated (had v < 0)
    expect(sd.curves[0].points[0].v).toBeCloseTo(0.25)  // (-0.5 + 1) / 2
    expect(sd.curves[0].points[1].v).toBeCloseTo(0.75)  // (0.5 + 1) / 2
    // Second curve left alone (all within 0..1)
    expect(sd.curves[1].points[0].v).toBeCloseTo(0.3)
    expect(sd.curves[1].points[1].v).toBeCloseTo(0.7)
  })
})

describe('restoreScene (sweep absolute migration)', () => {
  it('migrates legacy offset sweep curves to absolute values', () => {
    const src: Scene = {
      name: 'Test',
      nodes: [
        patNode('p1'),
        sweepNode('s1', [
          { target: { kind: 'master', param: 'masterVolume' }, points: [{ t: 0, v: -0.6 }, { t: 1, v: 0.8 }], color: '#f00' },
        ]),
      ],
      edges: [edge('s1', 'p1')],
      labels: [],
      stamps: [],
    }
    const restored = restoreScene(src)
    const s = restored.nodes.find((n: SceneNode) => n.id === 's1')!
    const pts = s.modifierParams!.sweep!.curves[0].points
    expect(pts[0].v).toBeCloseTo(0.2)   // (-0.6 + 1) / 2
    expect(pts[1].v).toBeCloseTo(0.9)   // (0.8 + 1) / 2
  })

  it('migrates globalSweep offset curves to absolute values', () => {
    const src: Scene = {
      name: 'Test',
      nodes: [patNode('p1')],
      edges: [],
      labels: [],
      stamps: [],
      globalSweep: {
        curves: [
          { target: { kind: 'fx', param: 'reverbWet' }, points: [{ t: 0, v: -1 }, { t: 1, v: 1 }], color: '#00f' },
        ],
        durationMs: 4000,
      },
    }
    const restored = restoreScene(src)
    const pts = restored.globalSweep!.curves[0].points
    expect(pts[0].v).toBeCloseTo(0)   // (-1 + 1) / 2
    expect(pts[1].v).toBeCloseTo(1)   // (1 + 1) / 2
  })
})
