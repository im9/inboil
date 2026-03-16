// State — Section/Cell model (ADR 042)
import {
  DEFAULT_FX_PAD, DEFAULT_MASTER_PAD, DEFAULT_PERF,
  DEFAULT_FX_FLAVOURS,
} from './constants.ts'
import type { FxFlavours } from './constants.ts'
import {
  makeDefaultSong, makeEmptySong, makeEmptyCell,
} from './factory.ts'
import { makeDemoSong } from './demo.ts'

export { NOTE_NAMES } from './constants.ts'
export { FACTORY_COUNT, PATTERN_POOL_SIZE } from './factory.ts'

// Re-export all types from types.ts for backwards compatibility
export type {
  VoiceId, BrushMode, ChordShape,
  Trig, CellInsertFx, Cell, ChainFx, Pattern, Section, Track, Effects,
  SceneDecorator, AutomationPoint, AutomationTarget, AutomationParams, AutomationSnapshot,
  GenerativeEngine, GenerativeConfig, TuringParams, QuantizerParams, TonnetzParams,
  SceneNode, SceneEdge, SceneLabel, Scene, Song,
  MidiDevice, SampleMeta, Lang,
} from './types.ts'

import type {
  BrushMode, ChordShape,
  Cell, Pattern, Song,
  AutomationParams, AutomationSnapshot,
  MidiDevice, SampleMeta, Lang,
} from './types.ts'
import { showToast } from './toast.svelte.ts'

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
// Restore project name + BPM synchronously to avoid flash before async IDB load
try { const p = JSON.parse(localStorage.getItem('inboil') ?? ''); if (p.lastProjectName) song.name = p.lastProjectName; if (p.lastBpm) song.bpm = p.lastBpm } catch (e) { console.warn('[state] localStorage restore failed:', e) }

export const playback = $state({
  playing: false,
  playheads: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
  // Scene graph playback (Phase 4)
  sceneNodeId: null as string | null,
  sceneEdgeId: null as string | null,
  sceneRepeatLeft: 0,
  sceneTranspose: 0,
  sceneAbsoluteKey: null as number | null,
  soloNodeId: null as string | null,
  // ADR 045: playback mode decoupled from view
  mode: 'loop' as 'loop' | 'scene',
  playingPattern: null as number | null,
  // Pattern queue: next pattern to play at cycle boundary (loop mode)
  queuedPattern: null as number | null,
  // ADR 053: active automation curves during scene playback
  activeAutomations: [] as AutomationParams[],
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
  selectedSceneLabel: string | null
  sidebar: 'help' | 'system' | null
  systemTab: 'project' | 'settings'
  lockMode: boolean
  selectedStep: number | null
  soloTracks: Set<number>
  mobileOverlay: boolean
  editingAutomationDecorator: { nodeId: string; decoratorIndex: number } | null
  editingAutomationInline: { nodeId: string; decoratorIndex: number } | null
  focusSceneNodeId: string | null
  dockTab: 'tracks' | 'scene'
  brushMode: BrushMode
  chordShape: ChordShape
}>({
  selectedTrack: 0,
  currentPattern: 0,    // index into song.patterns[] (ADR 044 Phase 1a)
  phraseView: 'pattern',
  viewFocus: 'pattern',
  patternSheet: false,
  patternSheetOrigin: null,
  selectedSceneNodes: {} as Record<string, true>,
  selectedSceneEdge: null,
  selectedSceneLabel: null,
  sidebar: null,
  systemTab: 'project' as const,
  lockMode: false,
  selectedStep: null,
  soloTracks: new Set<number>(),
  mobileOverlay: false,
  editingAutomationDecorator: null,
  editingAutomationInline: null,
  focusSceneNodeId: null,
  dockTab: 'tracks' as const,
  brushMode: 'draw' as BrushMode,
  chordShape: 'triad' as ChordShape,
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
  ui.editingAutomationDecorator = null
  ui.editingAutomationInline = null
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
  playback.sceneTranspose = 0
  playback.sceneAbsoluteKey = null
  if (playback.automationSnapshot) {
    restoreAutomationSnapshot(playback.automationSnapshot)
  }
  playback.activeAutomations = []
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

// ── Extracted modules (re-exported for backwards compatibility) ──────

// Scene & section playback
export {
  hasScenePlayback, currentlyPlayingIndex, isViewingPlayingPattern,
  soloPatternIndex, advanceSceneNode,
} from './scenePlayback.ts'

// Automation
export { restoreAutomationSnapshot, applyAutomations } from './automation.ts'
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

// ── Sample persistence (ADR 020 Section I, Phase A) ──────────────────

export const samplesByTrack = $state<Record<number, SampleMeta>>({})

/** Store a loaded sample in memory + persist to IndexedDB */
export function setSample(trackId: number, name: string, waveform: Float32Array, rawBuffer: ArrayBuffer): void {
  samplesByTrack[trackId] = { name, waveform, rawBuffer }
  if (project.id) void storage().then(s => s.saveSample(project.id!, trackId, name, rawBuffer))
    .catch(e => { console.warn('[sample] save failed:', e); showToast('Sample save failed', 'error') })
}

/** Persist any pending samples after project gets an id (called from projectSaveAs) */
async function persistPendingSamples(projectId: string): Promise<void> {
  for (const [tid, meta] of Object.entries(samplesByTrack)) {
    await (await storage()).saveSample(projectId, Number(tid), meta.name, meta.rawBuffer)
  }
}

/** Restore samples from IndexedDB — decode + cache in engine (sent on next sendPattern) */
export async function restoreSamples(projectId: string): Promise<void> {
  clearSamples()
  const stored = await (await storage()).loadSamples(projectId)
  if (stored.length === 0) return
  const { engine } = await import('./audio/engine.ts')  // lazy: engine.init() may not have been called yet
  for (const s of stored) {
    const waveform = await engine.loadSampleFromBuffer(s.trackId, s.buffer)
    if (waveform) {
      samplesByTrack[s.trackId] = { name: s.name, waveform, rawBuffer: s.buffer }
    }
  }
}

/** Clear all in-memory sample state */
function clearSamples(): void {
  for (const k of Object.keys(samplesByTrack)) delete samplesByTrack[Number(k)]
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

/** Auto-save: debounced 500ms after last mutation */
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    if (!project.dirty) return
    const doSave = project.id
      ? projectSave()
      : projectSaveAs(song.name || 'Untitled')
    doSave.then(() => {
      project.dirty = false
    }).catch(e => {
      console.error('[autoSave] ERROR:', e)
      showToast('Auto-save failed. Export your project to avoid data loss.', 'error')
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
    const rec = JSON.parse(raw) as { projectId: string | null; song: Song; timestamp: number }
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

/** Export current project as a downloadable .inboil.json file */
export function exportProjectJSON(): void {
  const snapshot = cloneSong()
  const payload = { v: 1 as const, ...snapshot, exportedAt: Date.now() }
  const json = JSON.stringify(payload, null, 2)
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
  if (typeof data !== 'object' || data === null) throw new Error('Invalid project file')
  // Accept both v:1 export format and raw Song objects
  const src = data as Record<string, unknown>
  // Validate required Song fields
  if (!Array.isArray(src.tracks) || !Array.isArray(src.patterns) || typeof src.bpm !== 'number') {
    throw new Error('Invalid project file: missing required fields (tracks, patterns, bpm)')
  }
  restoreSong(src as unknown as Song)
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
}

/** Load factory demo patterns as a new unsaved project */
export function projectLoadFactory(): void {
  restoreSong(makeDefaultSong())
  clearSamples()
  project.id = null
  project.dirty = true
  ui.currentPattern = 0
  ui.selectedTrack = 0
  ui.patternSheet = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  undoStack.length = 0
  redoStack.length = 0
}

/** Load demo project (welcome overlay) */
export function projectLoadDemo(): void {
  restoreSong(makeDemoSong())
  clearSamples()
  project.id = null
  project.dirty = true
  ui.currentPattern = 0
  ui.selectedTrack = 0
  ui.patternSheet = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  undoStack.length = 0
  redoStack.length = 0
}
