/**
 * Section arrangement, presets, and pattern-level operations.
 * Extracted from state.svelte.ts for modularity.
 */

import { song, ui, playback, pushUndo } from './state.svelte.ts'
import type { SceneNode, ChainFx, Pattern } from './state.svelte.ts'
import {
  makePatternId, makeEmptyCell,
  FACTORY_COUNT, getTemplate,
} from './factory.ts'

// ── Internal helpers (needed for pattern ops) ──

function cloneCell(c: Pattern['cells'][0]) {
  return {
    ...c,
    trigs: c.trigs.map(t => ({
      ...t,
      ...(t.notes ? { notes: [...t.notes] } : {}),
      ...(t.paramLocks ? { paramLocks: { ...t.paramLocks } } : {}),
    })),
    voiceParams: { ...c.voiceParams },
  }
}

function clonePattern(p: Pattern): Pattern {
  return { id: p.id, name: p.name, color: p.color, cells: p.cells.map(cloneCell) }
}

// ── Section Arrangement ──

/** Whether arrangement mode is active (loop range > 1 section) */
export function hasArrangement(): boolean {
  return playback.loopEnd > playback.loopStart
}

export type SongFxKey = 'verb' | 'delay' | 'glitch' | 'granular'

// ── Section presets ──

// Section indices (0-based): 0=4FLOOR 1=TRAP 2=BREAK 3=2STEP 4=LOFI
// 5=TECHNO 6=HOUSE 7=DNB 8=HYPER 9=MINIMAL 10=REGGAETN 11=DISCO
// 12=ELECTRO 13=DUBSTEP 14=DRILL 15=SYNTHWV 16=AFROBT 17=JERSEY
// 18=GARAGE 19=AMBIENT 20=LF.B

interface SectionPresetEntry {
  sectionIndex: number
  repeats?: number
  key?: number; oct?: number
  perf?: number; perfLen?: number
  verb?: ChainFx; delay?: ChainFx; glitch?: ChainFx; granular?: ChainFx
}

interface ScenePresetNode {
  type: SceneNode['type']
  patternIndex?: number   // index into entries[] (maps to pattern after cloning)
  x: number; y: number
  root?: boolean
  params?: Record<string, number>
}
interface ScenePresetEdge { fromIdx: number; toIdx: number; order: number }

export const SONG_PRESETS: {
  name: string
  entries: SectionPresetEntry[]
  scene?: { nodes: ScenePresetNode[]; edges: ScenePresetEdge[] }
}[] = [
  { name: 'LOFI',
    entries: [
      { sectionIndex: 4, repeats: 2, key: 0 },
      { sectionIndex: 4, repeats: 2, verb: { on: true, x: 0.25, y: 0.65 } },
      { sectionIndex: 20, repeats: 4, verb: { on: true, x: 0.25, y: 0.65 }, delay: { on: true, x: 0.70, y: 0.40 } },
      { sectionIndex: 4, repeats: 4, verb: { on: true, x: 0.25, y: 0.65 }, glitch: { on: true, x: 0.45, y: 0.15 } },
      { sectionIndex: 20, repeats: 4, key: 0, verb: { on: true, x: 0.25, y: 0.65 }, delay: { on: true, x: 0.70, y: 0.40 }, glitch: { on: true, x: 0.45, y: 0.15 } },
      { sectionIndex: 4, repeats: 4, key: 4, perf: 2, perfLen: 4, verb: { on: true, x: 0.25, y: 0.65 }, glitch: { on: true, x: 0.45, y: 0.15 }, delay: { on: true, x: 1.0, y: 0.40 } },
      { sectionIndex: 20, repeats: 4, perf: 1, perfLen: 8, verb: { on: true, x: 0.25, y: 0.65 }, glitch: { on: true, x: 0.45, y: 0.15 }, granular: { on: true, x: 0.50, y: 0.30 }, delay: { on: true, x: 1.0, y: 0.40 } },
      { sectionIndex: 4, repeats: 4, verb: { on: true, x: 0.25, y: 0.65 }, glitch: { on: true, x: 0.45, y: 0.15 }, granular: { on: true, x: 0.50, y: 0.30 }, delay: { on: true, x: 1.0, y: 0.40 } },
    ],
    scene: {
      nodes: [
        { type: 'pattern', patternIndex: 0, x: 0.10, y: 0.30, root: true },
        { type: 'pattern', patternIndex: 1, x: 0.25, y: 0.30 },
        { type: 'pattern', patternIndex: 2, x: 0.40, y: 0.30 },
        { type: 'pattern', patternIndex: 3, x: 0.55, y: 0.30 },
        { type: 'pattern', patternIndex: 4, x: 0.70, y: 0.30 },
        { type: 'pattern', patternIndex: 5, x: 0.85, y: 0.30 },
        { type: 'pattern', patternIndex: 6, x: 0.70, y: 0.60 },
        { type: 'pattern', patternIndex: 7, x: 0.40, y: 0.60 },
      ],
      edges: [
        { fromIdx: 0, toIdx: 1, order: 0 },
        { fromIdx: 1, toIdx: 2, order: 0 },
        { fromIdx: 2, toIdx: 3, order: 0 },
        { fromIdx: 3, toIdx: 4, order: 0 },
        { fromIdx: 4, toIdx: 5, order: 0 },
        { fromIdx: 5, toIdx: 6, order: 0 },
        { fromIdx: 6, toIdx: 7, order: 0 },
        { fromIdx: 7, toIdx: 0, order: 0 },
      ],
    },
  },
]

/** Load a song preset: references factory patterns directly, sections share patterns via patternIndex */
export function songLoadPreset(index: number) {
  const preset = SONG_PRESETS[index]
  if (!preset) return
  // Deduplicate: map each unique sectionIndex to a pattern slot
  const seen = new Map<number, number>()  // sectionIndex → patternIndex in pool
  for (const entry of preset.entries) {
    if (!seen.has(entry.sectionIndex)) {
      seen.set(entry.sectionIndex, entry.sectionIndex)
    }
  }
  // Sections reference the shared pattern by sectionIndex (factory patterns are already in place)
  for (let i = 0; i < preset.entries.length; i++) {
    const entry = preset.entries[i]
    song.sections[i] = {
      patternIndex: entry.sectionIndex,
      repeats: entry.repeats ?? 1,
      ...(entry.key != null ? { key: entry.key } : {}),
      ...(entry.oct != null ? { oct: entry.oct } : {}),
      ...(entry.perf != null ? { perf: entry.perf } : {}),
      ...(entry.perfLen != null ? { perfLen: entry.perfLen } : {}),
      ...(entry.verb ? { verb: { ...entry.verb } } : {}),
      ...(entry.delay ? { delay: { ...entry.delay } } : {}),
      ...(entry.glitch ? { glitch: { ...entry.glitch } } : {}),
      ...(entry.granular ? { granular: { ...entry.granular } } : {}),
    }
  }
  // Populate scene graph if preset has one
  if (preset.scene) {
    const nodeIds: string[] = []
    song.scene.nodes = []
    song.scene.edges = []
    song.scene.labels = []
    for (let i = 0; i < preset.scene.nodes.length; i++) {
      const pn = preset.scene.nodes[i]
      const id = `sn_${String(i).padStart(2, '0')}`
      nodeIds.push(id)
      // Resolve patternIndex: scene node references entry index → map to factory sectionIndex
      let patternId: string | undefined
      if (pn.patternIndex != null) {
        const entry = preset.entries[pn.patternIndex]
        patternId = makePatternId(entry ? entry.sectionIndex : pn.patternIndex)
      }
      song.scene.nodes.push({
        id, type: pn.type, x: pn.x, y: pn.y, root: pn.root ?? false,
        ...(patternId != null ? { patternId } : {}),
        ...(pn.params ? { params: { ...pn.params } } : {}),
      })
    }
    for (let i = 0; i < preset.scene.edges.length; i++) {
      const pe = preset.scene.edges[i]
      song.scene.edges.push({
        id: `se_${String(i).padStart(2, '0')}`,
        from: nodeIds[pe.fromIdx], to: nodeIds[pe.toIdx], order: pe.order,
      })
    }
  } else {
    song.scene.nodes = []
    song.scene.edges = []
    song.scene.labels = []
  }

  playback.currentSection = 0
  playback.repeatCount = 0
  playback.loopStart = 0
  playback.loopEnd = preset.entries.length - 1
  playback.sceneNodeId = null
  playback.sceneEdgeId = null
  playback.sceneRepeatLeft = 0
  playback.sceneTranspose = 0
  playback.sceneAbsoluteKey = null
  playback.soloNodeId = null
  ui.currentPattern = 0
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
}

// ── Section operations ──

export function sectionStepRepeats(index: number, dir: -1 | 1) {
  const s = song.sections[index]
  s.repeats = Math.max(1, Math.min(8, s.repeats + dir))
}

export function sectionCycleKey(index: number) {
  const s = song.sections[index]
  if (s.key == null) { s.key = 0 }
  else if (s.key >= 11) { s.key = undefined }
  else { s.key++ }
}

export function sectionSetKey(index: number, key: number | undefined) {
  song.sections[index].key = key
}

export function sectionCycleOct(index: number) {
  const s = song.sections[index]
  if (s.oct == null) { s.oct = -2 }
  else if (s.oct >= 2) { s.oct = undefined }
  else { s.oct++ }
}

export function sectionCyclePerf(index: number) {
  song.sections[index].perf = ((song.sections[index].perf ?? 0) + 1) % 4
}

const PERF_LEN_OPTIONS = [16, 8, 4, 1] as const

export function sectionCyclePerfLen(index: number) {
  const s = song.sections[index]
  const cur = PERF_LEN_OPTIONS.indexOf((s.perfLen ?? 16) as 16 | 8 | 4 | 1)
  s.perfLen = PERF_LEN_OPTIONS[(cur + 1) % PERF_LEN_OPTIONS.length]
}

export function sectionToggleFx(index: number, fx: SongFxKey) {
  const s = song.sections[index]
  const current = s[fx]
  if (current) {
    current.on = !current.on
  } else {
    s[fx] = { on: true, x: 0.5, y: 0.5 }
  }
}

export function sectionSetFxSend(index: number, fx: SongFxKey, value: number) {
  const s = song.sections[index]
  if (!s[fx]) s[fx] = { on: true, x: value, y: 0.5 }
  else s[fx]!.x = value
}

// ── Pattern operations ──

/** Clear a pattern's cells to empty (preserves per-cell voiceId, ADR 062) */
export function patternClear(patternIndex: number): void {
  pushUndo('Clear pattern')
  const pat = song.patterns[patternIndex]
  pat.cells = pat.cells.map((c) => {
    const note = c.trigs.find(t => t.active)?.note ?? 60
    return makeEmptyCell(c.trackId, c.name, c.voiceId, note)
  })
}

/** Apply a pattern template — overwrites cells with template's voice layout (ADR 015 §C) */
export function patternApplyTemplate(patternIndex: number, templateId: string): void {
  pushUndo('Apply template')
  const tmpl = getTemplate(templateId)
  const pat = song.patterns[patternIndex]
  pat.cells = tmpl.tracks.map((d, i) => makeEmptyCell(song.tracks[i]?.id ?? i, d.name, d.voiceId, d.note))
}

/** Rename a pattern (max 8 chars, uppercase) */
export function patternRename(patternIndex: number, name: string): void {
  pushUndo('Rename pattern')
  song.patterns[patternIndex].name = name.slice(0, 8).toUpperCase()
}

/** Set pattern color (index into PATTERN_COLORS) */
export function patternSetColor(patternIndex: number, color: number): void {
  pushUndo('Set pattern color')
  song.patterns[patternIndex].color = color
}

/** Clear a section's pattern cells to empty (preserves section metadata) */
export function sectionClear(index: number) {
  patternClear(song.sections[index].patternIndex)
}

/** Duplicate pattern to the first empty slot, returns new index or -1 */
export function duplicatePattern(srcIndex: number): number {
  pushUndo('Duplicate pattern')
  const emptyIdx = song.patterns.findIndex((p, i) =>
    i >= FACTORY_COUNT && !p.cells.some(c => c.trigs.some(t => t.active))
  )
  if (emptyIdx === -1) return -1
  const src = song.patterns[srcIndex]
  song.patterns[emptyIdx] = {
    id: makePatternId(emptyIdx),
    name: src.name,
    color: src.color,
    cells: src.cells.map(cloneCell),
  }
  ui.currentPattern = emptyIdx
  return emptyIdx
}

// ── Pattern clipboard ──

let patternClipboard: Pattern | null = null

/** Copy pattern to internal clipboard */
export function patternCopy(index: number): void {
  patternClipboard = clonePattern(song.patterns[index])
}

/** Paste clipboard into pattern slot (overwrites) */
export function patternPaste(index: number): void {
  if (!patternClipboard) return
  pushUndo('Paste pattern')
  song.patterns[index] = {
    id: song.patterns[index].id,
    name: patternClipboard.name,
    color: patternClipboard.color,
    cells: patternClipboard.cells.map(cloneCell),
  }
}

/** Returns true if the pattern clipboard has content */
export function hasPatternClipboard(): boolean {
  return patternClipboard !== null
}
