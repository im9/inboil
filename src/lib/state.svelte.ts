// Reactive state — Section/Cell model (ADR 042)
// Action modules: sampleActions, poolActions, projectActions, importExport

import { showFatalError } from './fatalError.svelte.ts'

import {
  DEFAULT_FX_PAD, DEFAULT_MASTER_PAD, DEFAULT_PERF,
  DEFAULT_FX_FLAVOURS,
} from './constants.ts'
import type { FxFlavours } from './constants.ts'
import {
  makeEmptySong, makeEmptyCell,
} from './factory.ts'

export { NOTE_NAMES } from './constants.ts'
export { FACTORY_COUNT, PATTERN_POOL_SIZE } from './factory.ts'

// Re-export all types from types.ts for backwards compatibility
export type {
  VoiceId, BrushMode, ChordShape,
  Trig, CellInsertFx, CellSampleRef, Cell, ChainFx, Pattern, Section, Track, Effects,
  SceneDecorator, AutomationPoint, AutomationTarget, AutomationParams, AutomationSnapshot,
  ModifierType, ModifierParams,
  GenerativeEngine, GenerativeConfig, TuringParams, QuantizerParams, TonnetzParams, TonnetzAnchor, TonnetzRhythm, TonnetzSlot,
  SceneNode, SceneEdge, SceneLabel, Scene, Song,
  MidiDevice, SampleMeta, Lang,
} from './types.ts'

import type {
  BrushMode, ChordShape,
  Cell, Pattern, Song,
  AutomationSnapshot,
  MidiDevice, SampleMeta, Lang,
} from './types.ts'

/** Find a cell by trackId in a pattern (ADR 079). */
export function cellForTrack(pat: Pattern, trackId: number): Cell | undefined {
  return pat.cells.find(c => c.trackId === trackId)
}

/** Get the active cell for a track in the currently selected pattern. */
export function activeCell(trackId: number): Cell {
  const cell = cellForTrack(song.patterns[ui.currentPattern], trackId)
  if (!cell) throw new Error(`No cell for trackId=${trackId} in pattern ${ui.currentPattern}`)
  return cell
}

/** Ensure a pattern has cells for all global tracks (call before mutation). */
export function ensureCells(pat: Pattern): void {
  const existing = new Set(pat.cells.map(c => c.trackId))
  for (const t of song.tracks) {
    if (!existing.has(t.id)) {
      pat.cells.push(makeEmptyCell(t.id, `TR${t.id + 1}`, null, 60))
    }
  }
}

// ── Undo ─────────────────────────────────────────────────────────────

// Clone helpers moved to songClone.ts (ADR 082)

import { cloneSongPure, restoreSongPure } from './songClone.ts'

export function cloneSong(): Song {
  return cloneSongPure(song, {
    fxPad: JSON.parse(JSON.stringify(fxPad)),
    masterPad: JSON.parse(JSON.stringify(masterPad)),
    fxFlavours: { ...fxFlavours },
    masterGain: perf.masterGain,
    swing: perf.swing,
  })
}

interface UndoEntry { snapshot: Song; label: string }
const undoStack: UndoEntry[] = []
const redoStack: UndoEntry[] = []
const UNDO_MAX = 50
let lastPushTime = 0
let lastPushLabel = ''

export function clearUndoStacks(): void {
  undoStack.length = 0
  redoStack.length = 0
}

/** Auto-save: debounced 500ms after last mutation, with concurrency guard.
 *  Defined here (not in projectActions.ts) to avoid circular import issues with pushUndo. */
let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let _autoSaving = false
export function scheduleAutoSave() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer)
  _autoSaveTimer = setTimeout(async () => {
    _autoSaveTimer = null
    if (!project.dirty || _autoSaving) return
    _autoSaving = true
    try {
      const { projectSave, projectSaveAs } = await import('./projectActions.ts')
      if (project.id) await projectSave()
      else await projectSaveAs(song.name || 'Untitled')
      project.dirty = false
    } catch (e) {
      console.error('[autoSave] ERROR:', e)
      showFatalError('DAT-002', e instanceof Error ? e.message : String(e))
    } finally {
      _autoSaving = false
    }
  }, 500)
}

export function pushUndo(label: string): void {
  const now = Date.now()
  // Always mark dirty + schedule save, even if undo snapshot is debounced
  project.dirty = true
  songVer.v++
  scheduleAutoSave()
  if (label === lastPushLabel && now - lastPushTime < 500) {
    return
  }
  undoStack.push({ snapshot: cloneSong(), label })
  if (undoStack.length > UNDO_MAX) undoStack.shift()
  redoStack.length = 0
  lastPushTime = now
  lastPushLabel = label
}

export function restoreSong(src: Song): void {
  songVer.v++
  const r = restoreSongPure(src)
  // Apply to reactive state
  song.name = r.song.name
  song.bpm = r.song.bpm
  song.rootNote = r.song.rootNote
  song.tracks = r.song.tracks
  song.patterns = r.song.patterns
  song.sections = r.song.sections ?? []
  song.scene = r.song.scene
  song.effects = r.song.effects
  // FX flavours
  fxFlavours.verb     = r.fxFlavours.verb
  fxFlavours.delay    = r.fxFlavours.delay
  fxFlavours.glitch   = r.fxFlavours.glitch
  fxFlavours.granular = r.fxFlavours.granular
  // FX pad
  fxPad.verb     = r.fxPad.verb     as typeof fxPad.verb
  fxPad.delay    = r.fxPad.delay    as typeof fxPad.delay
  fxPad.glitch   = r.fxPad.glitch   as typeof fxPad.glitch
  fxPad.granular = r.fxPad.granular as typeof fxPad.granular
  fxPad.filter   = r.fxPad.filter   as typeof fxPad.filter
  fxPad.eqLow    = r.fxPad.eqLow   as typeof fxPad.eqLow
  fxPad.eqMid    = r.fxPad.eqMid   as typeof fxPad.eqMid
  fxPad.eqHigh   = r.fxPad.eqHigh  as typeof fxPad.eqHigh
  // Master pad
  masterPad.comp = r.masterPad.comp as typeof masterPad.comp
  masterPad.duck = r.masterPad.duck as typeof masterPad.duck
  masterPad.ret  = r.masterPad.ret  as typeof masterPad.ret
  // Master gain & swing
  perf.masterGain = r.masterGain
  perf.swing = r.swing
}

export function undo(): boolean {
  const entry = undoStack.pop()
  if (!entry) return false
  redoStack.push({ snapshot: cloneSong(), label: entry.label })
  restoreSong(entry.snapshot)
  lastPushLabel = ''
  return true
}

export function redo(): boolean {
  const entry = redoStack.pop()
  if (!entry) return false
  undoStack.push({ snapshot: cloneSong(), label: entry.label })
  restoreSong(entry.snapshot)
  lastPushLabel = ''
  return true
}

// ── Reactive state ───────────────────────────────────────────────────

export const song = $state<Song>(makeEmptySong())
/** Monotonic counter bumped on every song mutation — cheap dependency for $effect sync */
export const songVer = $state({ v: 0 })
export function bumpSongVersion() { songVer.v++ }
// Restore project name + BPM synchronously to avoid flash before async IDB load
try { if (typeof localStorage !== 'undefined') { const p = JSON.parse(localStorage.getItem('inboil') ?? ''); if (p.lastProjectName) song.name = p.lastProjectName; if (p.lastBpm) song.bpm = p.lastBpm } } catch { /* expected in SSR/test */ }

export const playback = $state({
  playing: false,
  playheads: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
  // Scene playback (Phase 4)
  sceneNodeId: null as string | null,
  sceneEdgeId: null as string | null,
  sceneRepeatLeft: 0,
  sceneRepeatIndex: 0,     // current repeat (0-based) — ADR 118
  sceneRepeatTotal: 1,     // total repeat count — ADR 118
  sceneTranspose: 0,
  sceneAbsoluteKey: null as number | null,
  soloNodeId: null as string | null,
  // ADR 045: playback mode decoupled from view
  mode: 'loop' as 'loop' | 'scene',
  playingPattern: null as number | null,
  // Pattern queue: next pattern to play at cycle boundary (loop mode)
  queuedPattern: null as number | null,
  automationSnapshot: null as AutomationSnapshot | null,
})

export const ui = $state<{
  selectedTrack: number
  currentPattern: number
  phraseView: 'pattern' | 'scene' | 'fx' | 'eq' | 'master' | 'perf' | 'tonnetz' | 'quantizer' | 'turing'
  viewFocus: 'pattern' | 'scene'
  patternSheet: boolean
  patternSheetOrigin: { x: number; y: number } | null
  selectedSceneNodes: Record<string, true>
  selectedSceneEdge: string | null
  selectedSceneLabels: Record<string, boolean>
  selectedSceneStamps: Record<string, boolean>
  sidebar: 'help' | 'system' | null
  systemTab: 'project' | 'settings'
  lockMode: boolean
  selectedStep: number | null
  soloTracks: Set<number>
  mobileOverlay: boolean
  focusSceneNodeId: string | null
  dockTab: 'tracks' | 'scene'
  brushMode: BrushMode
  chordShape: ChordShape
  stepPage: number
  stepPageSize: number
  sweepTab: boolean
  granularMode2: boolean
  tonnetzNodeId: string | null
  quantizerNodeId: string | null
  turingNodeId: string | null
}>({
  selectedTrack: 0,
  currentPattern: 0,    // index into song.patterns[] (ADR 044 Phase 1a)
  phraseView: 'pattern',
  viewFocus: 'pattern',
  patternSheet: false,
  patternSheetOrigin: null,
  selectedSceneNodes: {} as Record<string, true>,
  selectedSceneEdge: null,
  selectedSceneLabels: {} as Record<string, boolean>,
  selectedSceneStamps: {} as Record<string, boolean>,
  sidebar: null,
  systemTab: 'project' as const,
  lockMode: false,
  selectedStep: null,
  soloTracks: new Set<number>(),
  mobileOverlay: false,
  focusSceneNodeId: null,
  dockTab: 'tracks' as const,
  brushMode: 'draw' as BrushMode,
  chordShape: 'triad' as ChordShape,
  stepPage: 0,
  stepPageSize: 16,
  sweepTab: false,
  granularMode2: false,
  tonnetzNodeId: null,
  quantizerNodeId: null,
  turingNodeId: null,
})

/** Get the first selected scene node (for single-selection compatibility) */
export function primarySelectedNode(): string | null {
  const keys = Object.keys(ui.selectedSceneNodes)
  return keys.length > 0 ? keys[0] : null
}

// ── Section navigation ───────────────────────────────────────────────

/** Select a pattern for editing (decoupled from section) */
export function selectPattern(patternIndex: number): void {
  if (patternIndex < 0 || patternIndex >= song.patterns.length) return
  ui.currentPattern = patternIndex
  ui.dockTab = 'tracks'  // reset tab on pattern change (ADR 092)
  // Apply per-pattern key (scene playback overrides via its own transpose logic)
  const pat = song.patterns[patternIndex]
  if (!playback.playing || playback.mode === 'loop') {
    perf.rootNote = pat.rootNote ?? song.rootNote
  }
  // If selected track has no cell in this pattern, pick first available
  if (!pat.cells.some(c => c.trackId === ui.selectedTrack)) {
    ui.selectedTrack = pat.cells.length > 0 ? pat.cells[0].trackId : -1
  }
  // Queue pattern switch at cycle boundary during loop playback
  if (playback.playing && playback.mode === 'loop') {
    playback.queuedPattern = patternIndex !== playback.playingPattern ? patternIndex : null
  }
}

/** Get name of the currently selected pattern */
export function getActivePatternName(): string {
  return song.patterns[ui.currentPattern]?.name ?? ''
}

/** Check if a pattern contains any active trigs */
export function patternHasData(patternIndex: number): boolean {
  const pat = song.patterns[patternIndex]
  if (!pat) return false
  return pat.cells.some(c => c.trigs.some(t => t.active))
}

/** Overall density of a pattern (active trigs / total steps across all tracks) */
export function patternDensity(patternIndex: number): number {
  const pat = song.patterns[patternIndex]
  if (!pat) return 0
  let total = 0, active = 0
  for (const c of pat.cells) {
    total += c.steps
    for (const t of c.trigs) { if (t.active) active++ }
  }
  return total > 0 ? active / total : 0
}

/** Check if a pattern is used by any scene node */
export function patternUsedInScene(patternIndex: number): boolean {
  const pat = song.patterns[patternIndex]
  if (!pat) return false
  return song.scene.nodes.some(n => n.type === 'pattern' && n.patternId === pat.id)
}


// ── Persisted preferences (single localStorage key) ─────────────────
const STORAGE_KEY = 'inboil'
const STORAGE_VERSION = 1

interface StoredPrefs {
  v: number
  lang: Lang
  visited: boolean
  scaleMode: boolean
  patternEditor: 'grid' | 'tracker'
  showGuide: boolean
  lastProjectId: string | null
  lastProjectName: string
  lastBpm: number
}

function loadPrefs(): StoredPrefs {
  const defaults: StoredPrefs = { v: STORAGE_VERSION, lang: 'ja', visited: false, scaleMode: true, patternEditor: 'grid', showGuide: true, lastProjectId: null, lastProjectName: 'Untitled', lastBpm: 120 }
  if (typeof localStorage === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const legacyLang = localStorage.getItem('inboil-lang')
      if (legacyLang) {
        defaults.lang = legacyLang as Lang
        localStorage.removeItem('inboil-lang')
      }
      return defaults
    }
    const parsed = JSON.parse(raw)
    if (parsed.v !== STORAGE_VERSION) return defaults
    return { ...defaults, ...parsed }
  } catch (e) { console.warn('[state] loadPrefs failed:', e); return defaults }
}

export function savePrefs(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: STORAGE_VERSION,
    lang: lang.value,
    visited: prefs.visited,
    scaleMode: prefs.scaleMode,
    patternEditor: prefs.patternEditor,
    showGuide: prefs.showGuide,
    lastProjectId: project.id,
    lastProjectName: song.name,
    lastBpm: song.bpm,
  }))
}

const initialPrefs = loadPrefs()

export const lang = $state<{ value: Lang }>({ value: initialPrefs.lang })
export const prefs = $state({
  visited: initialPrefs.visited,
  scaleMode: initialPrefs.scaleMode,
  patternEditor: initialPrefs.patternEditor as 'grid' | 'tracker',
  showGuide: initialPrefs.showGuide,
})

/** Project tracking state */
export const project = $state({
  id: initialPrefs.lastProjectId as string | null,
  dirty: false,
  lastSavedAt: 0,
})

// Welcome overlay handles visited flag + sidebar open on first launch

export function toggleLang(): void {
  lang.value = lang.value === 'ja' ? 'en' : 'ja'
  savePrefs()
}
export function toggleSidebar(panel: 'help' | 'system'): void {
  ui.sidebar = ui.sidebar === panel ? null : panel
  if (panel === 'system' && ui.sidebar === 'system') ui.systemTab = 'project'
}
export function toggleScaleMode(): void {
  prefs.scaleMode = !prefs.scaleMode
  savePrefs()
}
export function togglePatternEditor(): void {
  prefs.patternEditor = prefs.patternEditor === 'grid' ? 'tracker' : 'grid'
  savePrefs()
}
export function toggleShowGuide(): void {
  prefs.showGuide = !prefs.showGuide
  savePrefs()
}

export const perf = $state({ ...DEFAULT_PERF })

export const fxPad = $state({
  verb:     { ...DEFAULT_FX_PAD.verb },
  delay:    { ...DEFAULT_FX_PAD.delay },
  glitch:   { ...DEFAULT_FX_PAD.glitch },
  granular: { ...DEFAULT_FX_PAD.granular },
  filter:   { ...DEFAULT_FX_PAD.filter },
  eqLow:    { ...DEFAULT_FX_PAD.eqLow },
  eqMid:    { ...DEFAULT_FX_PAD.eqMid },
  eqHigh:   { ...DEFAULT_FX_PAD.eqHigh },
})

export const fxFlavours = $state<FxFlavours>({ ...DEFAULT_FX_FLAVOURS })

export const masterPad = $state({
  comp: { ...DEFAULT_MASTER_PAD.comp },
  duck: { ...DEFAULT_MASTER_PAD.duck },
  ret:  { ...DEFAULT_MASTER_PAD.ret },
  sat:  { ...DEFAULT_MASTER_PAD.sat },
})

export const masterLevels = $state({ peakL: 0, peakR: 0, gr: 1.0, cpu: 0 })

export const vkbd = $state({
  enabled: false,
  octave: 4,
  velocity: 0.8,
  heldKeys: new Set<string>(),
})

// ── Multi-device session (ADR 019) ────────────────────────────────
export const session = $state<{
  role: 'solo' | 'host' | 'guest'
  roomCode: string | null
  peers: { id: string; name: string }[]
  connected: boolean
}>({
  role: 'solo',
  roomCode: null,
  peers: [],
  connected: false,
})

export const midiIn = $state({
  available: !!navigator.requestMIDIAccess,
  enabled: false,
  devices: [] as MidiDevice[],
  activeDeviceId: '',
  channel: 0 as number,
  receiving: false,
})

/** @deprecated Use song.effects directly — kept as re-export for migration convenience */
export const effects = {
  get reverb() { return song.effects.reverb },
  set reverb(v) { song.effects.reverb = v },
  get delay() { return song.effects.delay },
  set delay(v) { song.effects.delay = v },
  get ducker() { return song.effects.ducker },
  set ducker(v) { song.effects.ducker = v },
  get comp() { return song.effects.comp },
  set comp(v) { song.effects.comp = v },
}

// ── Factory reset ────────────────────────────────────────────────────

export function factoryReset(): void {
  restoreSong(makeEmptySong())
  // Reset UI
  ui.selectedTrack = 0
  ui.currentPattern = 0
  ui.phraseView = 'pattern'
  ui.viewFocus = 'pattern'
  ui.patternSheet = false
  ui.patternSheetOrigin = null
  ui.sidebar = null
  ui.lockMode = false
  ui.selectedStep = null
  ui.mobileOverlay = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  // Reset perf
  Object.assign(perf, DEFAULT_PERF)
  perf.rootNote = song.rootNote
  // effects are reset by restoreSong above
  // Reset FX flavours
  Object.assign(fxFlavours, DEFAULT_FX_FLAVOURS)
  // Reset FX pad
  fxPad.verb = { ...DEFAULT_FX_PAD.verb }
  fxPad.delay = { ...DEFAULT_FX_PAD.delay }
  fxPad.glitch = { ...DEFAULT_FX_PAD.glitch }
  fxPad.granular = { ...DEFAULT_FX_PAD.granular }
  fxPad.filter = { ...DEFAULT_FX_PAD.filter }
  fxPad.eqLow = { ...DEFAULT_FX_PAD.eqLow }
  fxPad.eqMid = { ...DEFAULT_FX_PAD.eqMid }
  fxPad.eqHigh = { ...DEFAULT_FX_PAD.eqHigh }
  // Reset master pad
  masterPad.comp = { ...DEFAULT_MASTER_PAD.comp }
  masterPad.duck = { ...DEFAULT_MASTER_PAD.duck }
  masterPad.ret  = { ...DEFAULT_MASTER_PAD.ret }
  // Reset playback
  playback.sceneNodeId = null
  playback.sceneEdgeId = null
  playback.sceneRepeatLeft = 0
  playback.sceneRepeatIndex = 0
  playback.sceneRepeatTotal = 1
  playback.sceneTranspose = 0
  playback.sceneAbsoluteKey = null
  if (playback.automationSnapshot) {
    restoreAutomationSnapshot(playback.automationSnapshot)
  }
  playback.automationSnapshot = null
  playback.soloNodeId = null
  // Reset project
  project.id = null
  project.dirty = false
  clearUndoStacks()
  // Reset prefs (keep lang)
  prefs.scaleMode = true
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
  }
  prefs.visited = true
  savePrefs()
}

// ── Transport callbacks (set by App.svelte, callable from components) ──
let _playFromNode: ((nodeId: string) => void) | null = null
export function setPlayFromNodeCallback(cb: (nodeId: string) => void) { _playFromNode = cb }
export function playFromNode(nodeId: string) { _playFromNode?.(nodeId) }

// ── Extracted modules (re-exported for backwards compatibility) ──────

// Scene & section playback
export {
  hasScenePlayback, currentlyPlayingIndex, isViewingPlayingPattern,
  soloPatternIndex, advanceSceneNode,
} from './scenePlayback.ts'

// Automation
export { restoreAutomationSnapshot } from './automation.ts'
import { restoreAutomationSnapshot } from './automation.ts'

// Randomize
export { randomizePattern } from './randomize.ts'

// ── Audio Pool state (ADR 104) ───────────────────────────────────────

import type { PoolEntry, PoolStats } from './audioPool.ts'
export type { PoolEntry, PoolStats }

export const pool = $state<{
  entries: PoolEntry[]
  folders: string[]
  stats: PoolStats
  loading: boolean
  factoryProgress: { done: number; total: number } | null
}>({
  entries: [],
  folders: [],
  stats: { totalSize: 0, count: 0, limitBytes: 200 * 1024 * 1024, usageRatio: 0, warning: false },
  loading: false,
  factoryProgress: null,
})

// ── Sample state (ADR 020 Section I, ADR 110 per-cell) ───────────────

/** Per-cell sample storage — key: `${trackId}_${patternIndex}` (ADR 110) */
export const samplesByCell = $state<Record<string, SampleMeta>>({})

// ── Extracted action modules (re-exported for backwards compatibility) ──

export type { StoredProject } from './storage.ts'

// Sample actions
export {
  sampleCellKey, setSample, setSamplePack, copySamplesForPattern,
  restoreSamples, clearSamples, trackDisplayName,
} from './sampleActions.ts'

// Pool actions
export {
  initPool, refreshPool, poolImportFiles, poolDeleteEntry,
  poolMoveEntry, poolRenameEntry, poolAssignToTrack, poolAssignPackToTrack,
} from './poolActions.ts'

// Project actions
export {
  listProjects, projectSaveAs, projectSave, projectLoad, projectNew,
  projectDelete, projectAutoSave, projectRestore, projectRename,
  writeRecoverySnapshot, clearRecoverySnapshot, checkRecovery,
} from './projectActions.ts'

// Import/export
export {
  exportProjectJSON, importProjectJSON, projectLoadFactory, projectLoadDemo,
} from './importExport.ts'

// ── E2E test access (dev only) ──────────────────────────────────────
if (import.meta.env.DEV) {
  ;(globalThis as any).__TEST_STATE__ = { song, playback, fxPad, perf, masterPad }
}
