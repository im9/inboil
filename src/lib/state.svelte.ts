// NOTE: Large file by design — single reactive state module (undo, project, samples, prefs, multi-device)
// State — Section/Cell model (ADR 042)
import {
  DEFAULT_FX_PAD, DEFAULT_MASTER_PAD, DEFAULT_PERF,
  DEFAULT_FX_FLAVOURS,
} from './constants.ts'
import type { FxFlavours } from './constants.ts'
import {
  makeEmptySong, makeEmptyCell,
} from './factory.ts'
import { makeDemoSong } from './demo.ts'

export { NOTE_NAMES } from './constants.ts'
export { FACTORY_COUNT, PATTERN_POOL_SIZE } from './factory.ts'

// Re-export all types from types.ts for backwards compatibility
export type {
  VoiceId, BrushMode, ChordShape,
  Trig, CellInsertFx, CellSampleRef, Cell, ChainFx, Pattern, Section, Track, Effects,
  SceneDecorator, AutomationPoint, AutomationTarget, AutomationParams, AutomationSnapshot,
  ModifierType, ModifierParams,
  GenerativeEngine, GenerativeConfig, TuringParams, QuantizerParams, TonnetzParams,
  SceneNode, SceneEdge, SceneLabel, Scene, Song,
  MidiDevice, SampleMeta, Lang,
} from './types.ts'

import type {
  BrushMode, ChordShape,
  Cell, Pattern, Song,
  AutomationSnapshot,
  MidiDevice, SampleMeta, Lang,
} from './types.ts'
import { showToast } from './toast.svelte.ts'
import { showFatalError } from './fatalError.svelte.ts'
import { validateSongData, validateRecoverySnapshot } from './validate.ts'

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

function cloneSong(): Song {
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

function restoreSong(src: Song): void {
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
try { const p = JSON.parse(localStorage.getItem('inboil') ?? ''); if (p.lastProjectName) song.name = p.lastProjectName; if (p.lastBpm) song.bpm = p.lastBpm } catch (e) { console.warn('[state] localStorage restore failed:', e) }

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
  phraseView: 'pattern' | 'scene' | 'fx' | 'eq' | 'master' | 'perf'
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
  // If selected track has no cell in this pattern, pick first available
  const pat = song.patterns[patternIndex]
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
  undoStack.length = 0
  redoStack.length = 0
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

// ── Project persistence (ADR 020) ────────────────────────────────────

import type { StoredProject } from './storage.ts'
export type { StoredProject }

const storage = () => import('./storage.ts')

export async function listProjects() {
  return (await storage()).listProjects()
}

// ── Audio Pool (ADR 104) ─────────────────────────────────────────────

import type { PoolEntry, PoolStats } from './audioPool.ts'
export type { PoolEntry, PoolStats }
const audioPool = () => import('./audioPool.ts')

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

/** Install factory samples on first launch, then refresh pool. */
export async function initPool(): Promise<void> {
  try {
    const mod = await audioPool()
    const needs = mod.needsFactoryInstall()
    if (needs) {
      pool.loading = true
      const result = await mod.installFactorySamples((done, total) => {
        pool.factoryProgress = { done, total }
      })
      pool.factoryProgress = null
      if (result.installed > 0) {
        showToast(`${result.installed} factory samples installed`, 'info')
      }
    }
  } catch (e) {
    console.warn('[pool] factory install failed:', e)
  }
  await refreshPool()
}

/** Refresh pool entries and stats from IndexedDB + OPFS. */
export async function refreshPool(): Promise<void> {
  pool.loading = true
  try {
    const mod = await audioPool()
    const [entries, folders, stats] = await Promise.all([
      mod.loadAllMeta(),
      mod.listFolders(),
      mod.getPoolStats(),
    ])
    pool.entries = entries
    pool.folders = folders
    pool.stats = stats
  } catch (e) {
    console.warn('[pool] refresh failed:', e)
  }
  pool.loading = false
}

/** Import files into the pool and refresh state. */
export async function poolImportFiles(files: File[], folder?: string): Promise<void> {
  const mod = await audioPool()
  const results = await mod.importFiles(files, folder)
  const dupeCount = results.filter(r => r.duplicate).length
  const newCount = results.length - dupeCount
  if (newCount > 0) showToast(`${newCount} sample${newCount > 1 ? 's' : ''} added to pool`, 'info')
  if (dupeCount > 0) showToast(`${dupeCount} duplicate${dupeCount > 1 ? 's' : ''} skipped`, 'info')
  if (results.length > 0) {
    await refreshPool()
    if (pool.stats.warning) {
      showToast(`Pool storage at ${(pool.stats.usageRatio * 100).toFixed(0)}% (${(pool.stats.totalSize / 1024 / 1024).toFixed(1)}MB / ${(pool.stats.limitBytes / 1024 / 1024).toFixed(0)}MB)`, 'warn')
    }
  }
}

/** Delete a sample from the pool and refresh state. */
export async function poolDeleteEntry(id: string): Promise<void> {
  const mod = await audioPool()
  await mod.deleteFromPool(id)
  await refreshPool()
}

/** Move a pool sample to a different folder and refresh state. */
export async function poolMoveEntry(id: string, newFolder: string): Promise<void> {
  const mod = await audioPool()
  await mod.moveToFolder(id, newFolder)
  await refreshPool()
}

/** Rename a pool sample and refresh state. */
export async function poolRenameEntry(id: string, newName: string): Promise<void> {
  const mod = await audioPool()
  await mod.renameEntry(id, newName)
  await refreshPool()
}

/** Assign a pool sample to the current track. Reads from OPFS, decodes, and sets on track. */
export async function poolAssignToTrack(entry: PoolEntry, trackId: number, patternIndex = ui.currentPattern): Promise<void> {
  const mod = await audioPool()
  const rawBuffer = await mod.readSample(entry)
  if (!rawBuffer) { showToast('Sample not found in pool', 'error'); return }
  const { engine } = await import('./audio/engine.ts')
  const result = await engine.loadUserSample(trackId, new File([rawBuffer], entry.name), patternIndex)
  if (result) {
    setSample(trackId, patternIndex, entry.name, result.waveform, result.rawBuffer)
  }
}

/** Assign a factory pack to the current track+pattern. Loads all zones and sends to worklet. (ADR 106) */
export async function poolAssignPackToTrack(packId: string, packName: string, trackId: number, patternIndex = ui.currentPattern): Promise<void> {
  const mod = await audioPool()
  const zones = await mod.loadPackZones(packId)
  if (!zones.length) { showToast('Pack has no zones', 'error'); return }
  const { engine } = await import('./audio/engine.ts')
  const waveform = await engine.loadPackToTrack(trackId, zones, patternIndex)
  if (waveform) {
    setSamplePack(trackId, patternIndex, packName, waveform, zones[0].buffer.buffer as ArrayBuffer, packId)
  }
}

// ── Sample persistence (ADR 020 Section I, ADR 110 per-cell) ─────────

/** Per-cell sample storage — key: `${trackId}_${patternIndex}` (ADR 110) */
export const samplesByCell = $state<Record<string, SampleMeta>>({})

/** Compose a samplesByCell key */
export function sampleCellKey(trackId: number, patternIndex: number): string {
  return `${trackId}_${patternIndex}`
}

/** Store a loaded sample in memory + persist to IndexedDB + set cell.sampleRef (ADR 110) */
export function setSample(trackId: number, patternIndex: number, name: string, waveform: Float32Array, rawBuffer: ArrayBuffer): void {
  samplesByCell[sampleCellKey(trackId, patternIndex)] = { name, waveform, rawBuffer }
  // Set sampleRef on the Cell
  const cell = cellForTrack(song.patterns[patternIndex], trackId)
  if (cell) cell.sampleRef = { name }
  if (project.id) void storage().then(s => s.saveSample(project.id!, trackId, patternIndex, name, rawBuffer))
    .catch(e => { console.warn('[sample] save failed:', e); showToast('Sample save failed', 'error') })
}

/** Store a factory pack reference in memory + persist packId to IndexedDB (ADR 106, 110) */
export function setSamplePack(trackId: number, patternIndex: number, name: string, waveform: Float32Array, primaryBuffer: ArrayBuffer, packId: string): void {
  samplesByCell[sampleCellKey(trackId, patternIndex)] = { name, waveform, rawBuffer: primaryBuffer, packId }
  const cell = cellForTrack(song.patterns[patternIndex], trackId)
  if (cell) cell.sampleRef = { name, packId }
  if (project.id) void storage().then(s => s.saveSample(project.id!, trackId, patternIndex, name, new ArrayBuffer(0), packId))
    .catch(e => { console.warn('[sample] pack save failed:', e); showToast('Sample save failed', 'error') })
}

/** Copy sample references from one pattern index to another (for pattern duplicate/paste) */
export function copySamplesForPattern(srcIndex: number, dstIndex: number): void {
  const pat = song.patterns[srcIndex]
  if (!pat) return
  for (const cell of pat.cells) {
    const srcKey = sampleCellKey(cell.trackId, srcIndex)
    const meta = samplesByCell[srcKey]
    if (!meta) continue
    const dstKey = sampleCellKey(cell.trackId, dstIndex)
    // Copy in-memory sample metadata
    samplesByCell[dstKey] = { ...meta }
    // Copy engine cache (packZones / userSamples)
    void import('./audio/engine.ts').then(({ engine }) => {
      engine.copySampleCache(srcKey, dstKey)
    })
    // Persist to IDB
    if (project.id) {
      void storage().then(s => s.saveSample(project.id!, cell.trackId, dstIndex, meta.name, meta.rawBuffer, meta.packId))
        .catch(e => { console.warn('[sample] copy save failed:', e); showToast('Sample save failed', 'error') })
    }
  }
}

/** Persist any pending samples after project gets an id (called from projectSaveAs) */
async function persistPendingSamples(projectId: string): Promise<void> {
  for (const [key, meta] of Object.entries(samplesByCell)) {
    const [tid, pi] = key.split('_').map(Number)
    await (await storage()).saveSample(projectId, tid, pi, meta.name, meta.rawBuffer, meta.packId)
  }
}

/** Restore samples from IndexedDB — decode + cache in engine (sent on next sendPattern) */
export async function restoreSamples(projectId: string): Promise<void> {
  clearSamples()
  const stored = await (await storage()).loadSamples(projectId)
  if (stored.length === 0) return
  const { engine } = await import('./audio/engine.ts')
  for (const s of stored) {
    // Detect old format (pre-ADR 110): patternIndex missing or undefined
    const isLegacy = s.patternIndex == null
    const patternIndices = isLegacy
      ? song.patterns.map((_, i) => i).filter(i => {
          const cell = cellForTrack(song.patterns[i], s.trackId)
          return cell && (cell.voiceId === 'Sampler')
        })
      : [s.patternIndex]

    for (const pi of patternIndices) {
      // Guard: pattern may have been removed/replaced during async restore
      if (!song.patterns[pi]) continue
      const key = sampleCellKey(s.trackId, pi)
      if (s.packId) {
        try {
          const mod = await audioPool()
          const zones = await mod.loadPackZones(s.packId)
          const waveform = await engine.loadPackToTrack(s.trackId, zones, pi)
          if (waveform) {
            samplesByCell[key] = { name: s.name, waveform, rawBuffer: new ArrayBuffer(0), packId: s.packId }
            const cell = cellForTrack(song.patterns[pi], s.trackId)
            if (cell) cell.sampleRef = { name: s.name, packId: s.packId }
          }
        } catch (e) {
          console.warn(`[sample] pack restore failed for ${s.packId}:`, e)
        }
      } else {
        const waveform = await engine.loadSampleFromBuffer(s.trackId, s.buffer, pi)
        if (waveform) {
          samplesByCell[key] = { name: s.name, waveform, rawBuffer: s.buffer }
          const cell = cellForTrack(song.patterns[pi], s.trackId)
          if (cell) cell.sampleRef = { name: s.name }
        }
      }
      // Migrate old entry to new format
      if (isLegacy && project.id) {
        void storage().then(st => st.saveSample(project.id!, s.trackId, pi, s.name, s.buffer, s.packId))
      }
    }
    // Old-format IDB entries are left as-is — they'll be overwritten by new-format saves
    // and won't cause issues (loadSamples returns all, new entries take precedence)
  }
  // Trigger pattern re-send so _autoLoadSamples picks up newly cached samples.
  // Without this, samples restored after the initial pattern sync stay in cache
  // but never reach the worklet (race between async restore and effect timing).
  bumpSongVersion()
}

/** Clear all in-memory sample state */
function clearSamples(): void {
  for (const k of Object.keys(samplesByCell)) delete samplesByCell[k]
}

/** Display name for a track: use sampleRef first, then in-memory lookup (ADR 110) */
export function trackDisplayName(cell: Cell, patternIndex?: number): string {
  if (cell.voiceId === 'Sampler') {
    if (cell.sampleRef?.name) return cell.sampleRef.name
    if (patternIndex != null) {
      const meta = samplesByCell[sampleCellKey(cell.trackId, patternIndex)]
      if (meta?.name) return meta.name
    }
  }
  return cell.name
}

/** Build a StoredProject from current state */
function buildStoredProject(id: string, name: string, now: number, createdAt?: number): StoredProject {
  return { id, name, song: cloneSong(), createdAt: createdAt ?? now, updatedAt: now }
}

/** Save current song as a new project */
export async function projectSaveAs(name: string): Promise<string> {
  song.name = name
  const id = crypto.randomUUID()
  const now = Date.now()
  await (await storage()).saveProject(buildStoredProject(id, name, now))
  project.id = id
  project.lastSavedAt = now
  clearRecoverySnapshot()
  await persistPendingSamples(id)
  savePrefs()
  return id
}

/** Overwrite the current project (or save-as if no project yet) */
export async function projectSave(): Promise<void> {
  if (!project.id) {
    await projectSaveAs(song.name || 'Untitled')
    return
  }
  const s = await storage()
  const existing = await s.loadProject(project.id)
  const now = Date.now()
  await s.saveProject(buildStoredProject(project.id, song.name, now, existing?.createdAt))
  project.lastSavedAt = now
  clearRecoverySnapshot()
}

/** Load a project by id and replace current state */
export async function projectLoad(id: string): Promise<boolean> {
  const proj = await (await storage()).loadProject(id)
  if (!proj) return false
  // Migrate: ensure song.name matches project name
  if (!proj.song.name) proj.song.name = proj.name
  clearSamples()
  restoreSong(proj.song)
  project.id = id
  project.dirty = false
  // Reset UI
  ui.currentPattern = 0
  ui.selectedTrack = 0
  ui.patternSheet = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  undoStack.length = 0
  redoStack.length = 0
  savePrefs()
  // Restore persisted samples (async, non-blocking)
  void restoreSamples(id)
  return true
}

/** Create a new empty project (does not persist until first save) */
export function projectNew(): void {
  restoreSong(makeEmptySong())
  clearSamples()
  project.id = null
  project.dirty = false
  ui.currentPattern = 0
  ui.selectedTrack = 0
  ui.patternSheet = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  undoStack.length = 0
  redoStack.length = 0
  savePrefs()
}

/** Delete a project and reset to new if it was current */
export async function projectDelete(id: string): Promise<void> {
  const s = await storage()
  await s.deleteProject(id)
  await s.deleteSamples(id)
  if (project.id === id) projectNew()
}

/** Auto-save: debounced 500ms after last mutation, with concurrency guard */
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let autoSaving = false

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    if (!project.dirty || autoSaving) return
    autoSaving = true
    const doSave = project.id
      ? projectSave()
      : projectSaveAs(song.name || 'Untitled')
    doSave.then(() => {
      project.dirty = false
    }).catch(e => {
      console.error('[autoSave] ERROR:', e)
      showFatalError('DAT-002', e instanceof Error ? e.message : String(e))
    }).finally(() => {
      autoSaving = false
    })
  }, 500)
}

/** Immediate auto-save (for beforeunload) */
export async function projectAutoSave(): Promise<void> {
  if (!project.dirty) return
  if (!project.id) {
    await projectSaveAs(song.name || 'Untitled')
  } else {
    await projectSave()
  }
  project.dirty = false
}

// ── Crash Recovery (ADR 099) ─────────────────────────────────────────
const RECOVERY_KEY = 'inboil_recovery'

/** Write current song to localStorage as crash recovery (synchronous, safe for beforeunload). */
export function writeRecoverySnapshot(): void {
  if (!project.dirty) return
  try {
    const snapshot = JSON.stringify({
      projectId: project.id,
      song: cloneSong(),
      timestamp: Date.now(),
    })
    localStorage.setItem(RECOVERY_KEY, snapshot)
  } catch (e) {
    // localStorage full or unavailable — silently skip
    console.warn('[recovery] snapshot write failed:', e)
  }
}

/** Clear recovery snapshot (call after successful IDB save). */
export function clearRecoverySnapshot(): void {
  try { localStorage.removeItem(RECOVERY_KEY) } catch { /* ignore */ }
}

/** Check for a recovery snapshot newer than IDB and restore if found.
 *  Returns true if recovery was applied. */
export async function checkRecovery(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY)
    if (!raw) return false
    const rec = validateRecoverySnapshot(JSON.parse(raw))
    // Only recover if it matches the current project (or no project yet)
    if (rec.projectId !== project.id) {
      clearRecoverySnapshot()
      return false
    }
    // Only recover if newer than last IDB save
    if (rec.timestamp <= project.lastSavedAt) {
      clearRecoverySnapshot()
      return false
    }
    restoreSong(rec.song)
    project.dirty = true
    clearRecoverySnapshot()
    scheduleAutoSave()
    showToast('Unsaved changes recovered', 'info')
    return true
  } catch (e) {
    console.warn('[recovery] check failed:', e)
    clearRecoverySnapshot()
    return false
  }
}

/** Restore last project on app startup */
export async function projectRestore(): Promise<void> {
  if (!project.id) return
  const ok = await projectLoad(project.id)
  if (!ok) { project.id = null; savePrefs() ; return }
  // Check for crash recovery after IDB load
  await checkRecovery()
}

/** Rename the current project */
export async function projectRename(name: string): Promise<void> {
  song.name = name
  if (project.id) {
    const s = await storage()
    const existing = await s.loadProject(project.id)
    if (existing) {
      existing.name = name
      existing.song.name = name
      existing.updatedAt = Date.now()
      await s.saveProject(existing)
    }
  }
}

// ── Export / Import (ADR 020 Section J) ──────────────────────────────

/** Encode ArrayBuffer to base64 string */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** Decode base64 string to ArrayBuffer */
function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Export current project as a downloadable .inboil.json file */
export function exportProjectJSON(): void {
  const snapshot = cloneSong()
  // Serialize samples per cell (ADR 110): key = "trackId_patternIndex"
  const samples: Record<string, { name: string; packId?: string; buffer?: string }> = {}
  for (const [key, meta] of Object.entries(samplesByCell)) {
    if (meta.packId) {
      samples[key] = { name: meta.name, packId: meta.packId }
    } else if (meta.rawBuffer.byteLength > 0) {
      samples[key] = { name: meta.name, buffer: bufferToBase64(meta.rawBuffer) }
    }
  }
  // Strip empty patterns to reduce file size (restored on import via restoreSongPure)
  const scenePatIds = new Set(
    snapshot.scene.nodes.filter((n: { patternId?: string }) => n.patternId).map((n: { patternId?: string }) => n.patternId)
  )
  const stripped = {
    ...snapshot,
    patterns: snapshot.patterns.filter((p: { id: string; cells: { trigs: { active: boolean }[] }[] }) =>
      scenePatIds.has(p.id) || p.cells.some(c => c.trigs.some(t => t.active))
    ),
  }
  const payload = { v: 3 as const, ...stripped, samples, exportedAt: Date.now() }
  const json = JSON.stringify(payload)
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${song.name || 'untitled'}.inboil.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Import a project from JSON string — creates a new unsaved project */
export async function importProjectJSON(json: string): Promise<void> {
  const data = JSON.parse(json)
  const validated = validateSongData(data)
  restoreSong(validated)
  clearSamples()
  project.id = null
  project.dirty = false
  ui.currentPattern = 0
  ui.selectedTrack = 0
  ui.patternSheet = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  undoStack.length = 0
  redoStack.length = 0
  // Persist immediately so the imported project isn't lost on page close
  await projectSaveAs(song.name || 'Untitled')
  // Restore embedded samples (v2: trackId keys, v3: trackId_patternIndex keys)
  const samples = data.samples as Record<string, { name: string; packId?: string; buffer?: string }> | undefined
  if (samples) {
    const { engine } = await import('./audio/engine.ts')
    for (const [key, entry] of Object.entries(samples)) {
      const isLegacy = !key.includes('_')  // v2: "0", "1" etc.
      const trackId = isLegacy ? Number(key) : Number(key.split('_')[0])
      const patternIndices = isLegacy
        ? song.patterns.map((_, i) => i).filter(i => {
            const cell = cellForTrack(song.patterns[i], trackId)
            return cell && cell.voiceId === 'Sampler'
          })
        : [Number(key.split('_')[1])]

      for (const pi of patternIndices) {
        if (entry.packId) {
          try {
            const mod = await audioPool()
            const zones = await mod.loadPackZones(entry.packId)
            const waveform = await engine.loadPackToTrack(trackId, zones, pi)
            if (waveform) {
              setSamplePack(trackId, pi, entry.name, waveform, new ArrayBuffer(0), entry.packId)
            }
          } catch (e) {
            console.warn(`[import] pack restore failed for ${entry.packId}:`, e)
          }
        } else if (entry.buffer) {
          const rawBuffer = base64ToBuffer(entry.buffer)
          const waveform = await engine.loadSampleFromBuffer(trackId, rawBuffer, pi)
          if (waveform) {
            setSample(trackId, pi, entry.name, waveform, rawBuffer)
          }
        }
      }
    }
  }
}

/** Load factory demo patterns as a new unsaved project */
export async function projectLoadFactory(): Promise<void> {
  return projectLoadDemo()
}

/** Load demo project (welcome overlay) — fetches demo-song.json from public/ */
export async function projectLoadDemo(): Promise<void> {
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'demo-song.json')
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    const data = await res.json()
    const validated = validateSongData(data)
    restoreSong(validated)
    clearSamples()
    project.id = null
    project.dirty = true
    ui.currentPattern = 0
    ui.selectedTrack = 0
    ui.patternSheet = true   // show sequencer so new users see what to interact with
    ui.selectedSceneNodes = {}
    ui.selectedSceneEdge = null
    undoStack.length = 0
    redoStack.length = 0
    // Restore embedded samples
    const samples = data.samples as Record<string, { name: string; packId?: string; buffer?: string }> | undefined
    if (samples) {
      const { engine } = await import('./audio/engine.ts')
      for (const [key, entry] of Object.entries(samples)) {
        const isLegacy = !key.includes('_')
        const trackId = isLegacy ? Number(key) : Number(key.split('_')[0])
        const patternIndices = isLegacy
          ? song.patterns.map((_, i) => i).filter(i => {
              const cell = cellForTrack(song.patterns[i], trackId)
              return cell && cell.voiceId === 'Sampler'
            })
          : [Number(key.split('_')[1])]
        for (const pi of patternIndices) {
          if (entry.packId) {
            try {
              const mod = await audioPool()
              const zones = await mod.loadPackZones(entry.packId)
              const waveform = await engine.loadPackToTrack(trackId, zones, pi)
              if (waveform) setSamplePack(trackId, pi, entry.name, waveform, new ArrayBuffer(0), entry.packId)
            } catch (e) { console.warn(`[demo] pack restore failed for ${entry.packId}:`, e) }
          } else if (entry.buffer) {
            const rawBuffer = base64ToBuffer(entry.buffer)
            const waveform = await engine.loadSampleFromBuffer(trackId, rawBuffer, pi)
            if (waveform) setSample(trackId, pi, entry.name, waveform, rawBuffer)
          }
        }
      }
    }
  } catch (e) {
    console.error('[demo] Failed to load demo song, falling back to built-in:', e)
    restoreSong(makeDemoSong())
    clearSamples()
    project.id = null
    project.dirty = true
    ui.currentPattern = 0
    ui.selectedTrack = 0
    ui.patternSheet = true
    ui.selectedSceneNodes = {}
    ui.selectedSceneEdge = null
    undoStack.length = 0
    redoStack.length = 0
  }
}
