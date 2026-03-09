// State — Section/Cell model (ADR 042)
import {
  SCALE_DEGREES_SET,
  PIANO_ROLL_MIN, PIANO_ROLL_MAX,
  DEFAULT_EFFECTS, DEFAULT_FX_PAD, DEFAULT_MASTER_PAD, DEFAULT_PERF,
} from './constants.ts'
import {
  DRUM_VOICES, makeDefaultSong, makeEmptySong, makeEmptyCell,
  SECTION_COUNT,
} from './factory.ts'

export { NOTE_NAMES } from './constants.ts'
export { FACTORY_COUNT, SECTION_COUNT } from './factory.ts'

export type { VoiceId } from './audio/dsp/voices.ts'
import type { VoiceId } from './audio/dsp/voices.ts'

export interface Trig {
  active: boolean
  note: number      // MIDI note (60 = C4) — primary / mono note
  velocity: number  // 0.0–1.0
  duration: number  // step count 1-16 (default 1)
  slide: boolean    // slide/glide to next note (default false)
  chance?: number   // 0.0–1.0, undefined = always fire (100%)
  notes?: number[]  // poly: all chord notes (includes primary `note`); absent = mono [note]
  paramLocks?: Record<string, number>  // per-step voice param overrides (P-Lock)
}

/** Inline step data for one track in one section (ADR 042, replaces Phrase) */
export interface Cell {
  name: string            // per-pattern track name (ADR 062)
  voiceId: VoiceId | null  // per-pattern instrument (null = unassigned)
  steps: number           // 1–64
  trigs: Trig[]           // length === steps
  voiceParams: Record<string, number>
  presetName?: string     // last applied preset name (for UI recall)
  reverbSend: number      // 0.0–1.0
  delaySend: number
  glitchSend: number
  granularSend: number
}

export interface ChainFx {
  on: boolean
  x: number
  y: number
}

/** Reusable pattern — name + color + N tracks of step data (ADR 044, 049, 056) */
export interface Pattern {
  id: string              // e.g. 'pat_00'
  name: string            // max 8 chars
  color: number           // index into PATTERN_COLORS (0–7)
  cells: Cell[]           // one per track (up to 16)
}

/** Arrangement slot referencing a Pattern (ADR 044) */
export interface Section {
  patternIndex: number    // index into Song.patterns
  repeats: number         // 1–16
  key?: number            // root note override (0–11)
  oct?: number            // octave override
  perf?: number           // 0=NONE, 1=FILL, 2=BRK, 3=REV
  perfLen?: number        // steps (1/4/8/16)
  verb?: ChainFx
  delay?: ChainFx
  glitch?: ChainFx
  granular?: ChainFx
}

/** Track = instrument config only (ADR 042, no phrases/chains) */
export interface Track {
  id: number
  name: string
  voiceId: VoiceId | null  // null = unassigned
  muted: boolean
  volume: number
  pan: number
}

export interface Effects {
  reverb: { size: number; damp: number }
  delay:  { time: number; feedback: number }
  ducker: { depth: number; release: number }
  comp:   { threshold: number; ratio: number; makeup: number }
}

/** Function decorator attached to a pattern node (ADR 062) */
export interface SceneDecorator {
  type: 'transpose' | 'tempo' | 'repeat' | 'fx' | 'automation'
  params: Record<string, number>
  automationParams?: AutomationParams  // for type === 'automation'
}

/** Automation curve point (ADR 053) */
export interface AutomationPoint {
  t: number  // 0.0–1.0 — position within pattern duration
  v: number  // 0.0–1.0 — normalized parameter value
}

/** Automation target parameter (ADR 053) */
export type AutomationTarget =
  | { kind: 'global'; param: 'tempo' | 'masterVolume' }
  | { kind: 'track';  trackIndex: number; param: 'volume' | 'pan' }
  | { kind: 'fx';     param: 'reverbWet' | 'reverbDamp' | 'delayTime' | 'delayFeedback'
                            | 'filterCutoff' | 'glitchX' | 'glitchY' | 'granularSize' | 'granularDensity' }
  | { kind: 'send';   trackIndex: number; param: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend' }

/** Automation node parameters (ADR 053) */
export interface AutomationParams {
  target: AutomationTarget
  points: AutomationPoint[]
  interpolation: 'linear' | 'smooth'
}

/** Node on the scene canvas (ADR 044) */
export interface SceneNode {
  id: string
  type: 'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx' | 'automation'
  x: number               // canvas position (normalized 0–1)
  y: number
  root: boolean           // true = playback entry point (exactly one)
  patternId?: string      // for type === 'pattern'
  params?: Record<string, number>
  automationParams?: AutomationParams  // for type === 'automation' (ADR 053)
  decorators?: SceneDecorator[]  // function decorators attached to pattern nodes (ADR 062)
}

/** Directed edge between nodes (ADR 044) */
export interface SceneEdge {
  id: string
  from: string            // source node id
  to: string              // target node id
  order: number           // playback order when multiple edges from same source
}

/** Free-floating text label on the scene canvas (ADR 052) */
export interface SceneLabel {
  id: string
  text: string
  x: number               // normalized 0–1
  y: number
  size?: number            // font scale factor (default 1.0 = 10px)
}

/** Scene = the arrangement graph (ADR 044) */
export interface Scene {
  name: string
  nodes: SceneNode[]
  edges: SceneEdge[]
  labels: SceneLabel[]
}

/** Song = pattern pool + arrangement sections + scene graph (ADR 044) */
export interface Song {
  name: string
  bpm: number
  rootNote: number        // 0–11
  tracks: Track[]         // 8 fixed
  patterns: Pattern[]     // pattern pool (ADR 044)
  sections: Section[]     // arrangement slots referencing patterns
  scene: Scene            // arrangement graph (ADR 044, data-only in Phase 1a)
  effects: Effects        // global send/bus effects (ADR 020)
}

/** Resolve the Pattern referenced by a section index */
export function sectionPattern(sectionIndex: number): Pattern {
  return song.patterns[song.sections[sectionIndex].patternIndex]
}

/** Get the active cell for a track in the currently selected pattern */
export function activeCell(trackId: number): Cell {
  return song.patterns[ui.currentPattern].cells[trackId]
}

// ── Undo ─────────────────────────────────────────────────────────────

function cloneTrig(tr: Trig): Trig {
  return {
    active: tr.active, note: tr.note, velocity: tr.velocity,
    duration: tr.duration, slide: tr.slide,
    ...(tr.chance != null ? { chance: tr.chance } : {}),
    ...(tr.notes && tr.notes.length > 0 ? { notes: [...tr.notes] } : {}),
    ...(tr.paramLocks && Object.keys(tr.paramLocks).length > 0
      ? { paramLocks: { ...tr.paramLocks } } : {}),
  }
}

function cloneCell(c: Cell): Cell {
  return {
    name: c.name,
    voiceId: c.voiceId,
    steps: c.steps,
    voiceParams: { ...c.voiceParams },
    ...(c.presetName ? { presetName: c.presetName } : {}),
    reverbSend: c.reverbSend, delaySend: c.delaySend,
    glitchSend: c.glitchSend, granularSend: c.granularSend,
    trigs: c.trigs.map(cloneTrig),
  }
}

function clonePattern(p: Pattern): Pattern {
  return { id: p.id, name: p.name, color: p.color, cells: p.cells.map(cloneCell) }
}

function cloneSection(s: Section): Section {
  return {
    patternIndex: s.patternIndex,
    repeats: s.repeats,
    ...(s.key != null ? { key: s.key } : {}),
    ...(s.oct != null ? { oct: s.oct } : {}),
    ...(s.perf != null ? { perf: s.perf } : {}),
    ...(s.perfLen != null ? { perfLen: s.perfLen } : {}),
    ...(s.verb ? { verb: { ...s.verb } } : {}),
    ...(s.delay ? { delay: { ...s.delay } } : {}),
    ...(s.glitch ? { glitch: { ...s.glitch } } : {}),
    ...(s.granular ? { granular: { ...s.granular } } : {}),
  }
}

function cloneTrack(t: Track): Track {
  return { id: t.id, name: t.name, voiceId: t.voiceId, muted: t.muted, volume: t.volume, pan: t.pan }
}

import { cloneScene, restoreScene } from './sceneData.ts'

function cloneSong(): Song {
  return {
    name: song.name, bpm: song.bpm, rootNote: song.rootNote,
    tracks: song.tracks.map(cloneTrack),
    patterns: song.patterns.map(clonePattern),
    sections: song.sections.map(cloneSection),
    scene: cloneScene(song.scene),
    effects: {
      reverb: { ...song.effects.reverb },
      delay: { ...song.effects.delay },
      ducker: { ...song.effects.ducker },
      comp: { ...song.effects.comp },
    },
  }
}

interface UndoEntry { snapshot: Song; label: string }
const undoStack: UndoEntry[] = []
const redoStack: UndoEntry[] = []
const UNDO_MAX = 50
let lastPushTime = 0
let lastPushLabel = ''

export function pushUndo(label: string): void {
  const now = Date.now()
  if (label === lastPushLabel && now - lastPushTime < 500) {
    return
  }
  undoStack.push({ snapshot: cloneSong(), label })
  if (undoStack.length > UNDO_MAX) undoStack.shift()
  redoStack.length = 0
  lastPushTime = now
  lastPushLabel = label
  project.dirty = true
  scheduleAutoSave()
}

function restoreCell(c: Cell): Cell {
  return {
    ...c,
    voiceParams: { ...c.voiceParams },
    trigs: c.trigs.map(tr => ({
      ...tr,
      duration: tr.duration ?? 1,
      slide: tr.slide ?? false,
      ...(tr.paramLocks ? { paramLocks: { ...tr.paramLocks } } : {}),
    })),
  }
}

function restoreSong(src: Song): void {
  song.name = src.name || 'Untitled'
  song.bpm = src.bpm
  song.rootNote = src.rootNote ?? 0
  song.tracks = src.tracks.map(t => ({ ...t }))
  song.patterns = src.patterns.map(p => {
    const cells = p.cells.map(restoreCell)
    // Reconcile cells count with tracks (ADR 056)
    while (cells.length < song.tracks.length) {
      const t = song.tracks[cells.length]
      cells.push(makeEmptyCell(cells.length, t.name, t.voiceId, 60))
    }
    if (cells.length > song.tracks.length) cells.length = song.tracks.length
    return { id: p.id, name: p.name, color: p.color ?? 0, cells }
  })
  song.sections = src.sections.map(s => ({
    patternIndex: s.patternIndex,
    repeats: s.repeats,
    ...(s.key != null ? { key: s.key } : {}),
    ...(s.oct != null ? { oct: s.oct } : {}),
    ...(s.perf != null ? { perf: s.perf } : {}),
    ...(s.perfLen != null ? { perfLen: s.perfLen } : {}),
    ...(s.verb ? { verb: { ...s.verb } } : {}),
    ...(s.delay ? { delay: { ...s.delay } } : {}),
    ...(s.glitch ? { glitch: { ...s.glitch } } : {}),
    ...(s.granular ? { granular: { ...s.granular } } : {}),
  }))
  song.scene = restoreScene(src.scene)
  const fx = src.effects ?? DEFAULT_EFFECTS
  song.effects = {
    reverb: { ...fx.reverb },
    delay: { ...fx.delay },
    ducker: { ...fx.ducker },
    comp: { ...fx.comp },
  }
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
// Restore project name synchronously to avoid flash of "Untitled"
try { const p = JSON.parse(localStorage.getItem('inboil') ?? ''); if (p.lastProjectName) song.name = p.lastProjectName; if (p.lastBpm) song.bpm = p.lastBpm } catch {}

export const playback = $state({
  playing: false,
  playheads: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
  currentSection: 0,
  repeatCount: 0,
  loopStart: 0,
  loopEnd: 0,
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
  // ADR 053: active automation curves during scene playback
  activeAutomations: [] as AutomationParams[],
  automationSnapshot: null as Record<string, number> | null,
})

export const ui = $state<{
  selectedTrack: number
  currentSection: number
  currentPattern: number
  phraseView: 'pattern' | 'scene' | 'fx' | 'eq' | 'master'
  viewFocus: 'pattern' | 'scene'
  patternSheet: boolean
  patternSheetOrigin: { x: number; y: number } | null
  selectedSceneNodes: Record<string, true>
  selectedSceneEdge: string | null
  selectedSceneLabel: string | null
  sidebar: 'help' | 'system' | null
  lockMode: boolean
  selectedStep: number | null
  soloTracks: Set<number>
  dockMinimized: boolean
  mobileOverlay: boolean
  editingAutomationDecorator: { nodeId: string; decoratorIndex: number } | null
  focusSceneNodeId: string | null
}>({
  selectedTrack: 0,
  currentSection: 0,
  currentPattern: 0,    // index into song.patterns[] (ADR 044 Phase 1a)
  phraseView: 'pattern',
  viewFocus: 'pattern',
  patternSheet: false,
  patternSheetOrigin: null,
  selectedSceneNodes: {} as Record<string, true>,
  selectedSceneEdge: null,
  selectedSceneLabel: null,
  sidebar: null,
  lockMode: false,
  selectedStep: null,
  soloTracks: new Set<number>(),
  dockMinimized: false,
  mobileOverlay: false,
  editingAutomationDecorator: null,
  focusSceneNodeId: null,
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
}

/** Switch to a section for editing — also syncs currentPattern to section's pattern */
export function selectSection(index: number): void {
  if (index < 0 || index >= SECTION_COUNT) return
  ui.currentSection = index
  ui.currentPattern = song.sections[index].patternIndex
}

/** Get name of the currently selected pattern */
export function getActivePatternName(): string {
  return song.patterns[ui.currentPattern]?.name ?? ''
}
/** @deprecated Use getActivePatternName() */
export const getActiveSectionName = getActivePatternName

/** Total number of sections */
export function getSectionCount(): number {
  return SECTION_COUNT
}

/** Check if a section's pattern contains any active trigs */
export function sectionHasData(index: number): boolean {
  return sectionPattern(index).cells.some(c => c.trigs.some(t => t.active))
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

/** Assign a different pattern to a section (enables N:1 pattern re-use) */
export function sectionSetPattern(sectionIndex: number, patternIndex: number): void {
  if (patternIndex < 0 || patternIndex >= song.patterns.length) return
  pushUndo('Assign pattern')
  song.sections[sectionIndex].patternIndex = patternIndex
}

/** Set loop range (used by SectionNav drag) */
export function setLoopRange(start: number, end: number): void {
  let s = Math.max(0, Math.min(start, SECTION_COUNT - 1))
  let e = Math.max(0, Math.min(end, SECTION_COUNT - 1))
  if (s > e) { const tmp = s; s = e; e = tmp }
  playback.loopStart = s
  playback.loopEnd = e
}

/** Clear loop range (single section loop) */
export function clearLoopRange(): void {
  playback.loopStart = 0
  playback.loopEnd = 0
}

// ── Persisted preferences (single localStorage key) ─────────────────
const STORAGE_KEY = 'inboil'
const STORAGE_VERSION = 1

interface StoredPrefs {
  v: number
  lang: Lang
  visited: boolean
  scaleMode: boolean
  dockMinimized: boolean
  patternEditor: 'grid' | 'tracker'
  showGuide: boolean
  lastProjectId: string | null
  lastProjectName: string
  lastBpm: number
}

function loadPrefs(): StoredPrefs {
  const defaults: StoredPrefs = { v: STORAGE_VERSION, lang: 'ja', visited: false, scaleMode: true, dockMinimized: false, patternEditor: 'grid', showGuide: true, lastProjectId: null, lastProjectName: 'Untitled', lastBpm: 120 }
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
  } catch { return defaults }
}

function savePrefs(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: STORAGE_VERSION,
    lang: lang.value,
    visited: prefs.visited,
    scaleMode: prefs.scaleMode,
    dockMinimized: ui.dockMinimized,
    patternEditor: prefs.patternEditor,
    showGuide: prefs.showGuide,
    lastProjectId: project.id,
    lastProjectName: song.name,
    lastBpm: song.bpm,
  }))
}

const initialPrefs = loadPrefs()

export type Lang = 'ja' | 'en'
export const lang = $state({ value: initialPrefs.lang })
export const prefs = $state({
  visited: initialPrefs.visited,
  scaleMode: initialPrefs.scaleMode,
  patternEditor: initialPrefs.patternEditor as 'grid' | 'tracker',
  showGuide: initialPrefs.showGuide,
})

ui.dockMinimized = initialPrefs.dockMinimized

/** Project tracking state */
export const project = $state({
  id: initialPrefs.lastProjectId as string | null,
  dirty: false,
  lastSavedAt: 0,
})

if (!prefs.visited) {
  ui.sidebar = 'help'
  prefs.visited = true
  savePrefs()
}

export function toggleLang(): void {
  lang.value = lang.value === 'ja' ? 'en' : 'ja'
  savePrefs()
}
export function toggleSidebar(panel: 'help' | 'system'): void {
  ui.sidebar = ui.sidebar === panel ? null : panel
}
export function toggleScaleMode(): void {
  prefs.scaleMode = !prefs.scaleMode
  savePrefs()
}
export function togglePatternEditor(): void {
  prefs.patternEditor = prefs.patternEditor === 'grid' ? 'tracker' : 'grid'
  savePrefs()
}
export function toggleDockMinimized(): void {
  ui.dockMinimized = !ui.dockMinimized
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

export const masterPad = $state({
  comp: { ...DEFAULT_MASTER_PAD.comp },
  duck: { ...DEFAULT_MASTER_PAD.duck },
  ret:  { ...DEFAULT_MASTER_PAD.ret },
})

export const masterLevels = $state({ peakL: 0, peakR: 0 })

export const vkbd = $state({
  enabled: false,
  octave: 4,
  velocity: 0.8,
  heldKeys: new Set<string>(),
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
  ui.currentSection = 0
  ui.currentPattern = 0
  ui.phraseView = 'pattern'
  ui.viewFocus = 'pattern'
  ui.patternSheet = false
  ui.patternSheetOrigin = null
  ui.sidebar = null
  ui.lockMode = false
  ui.selectedStep = null
  ui.dockMinimized = false
  ui.mobileOverlay = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  ui.editingAutomationDecorator = null
  // Reset perf
  Object.assign(perf, DEFAULT_PERF)
  perf.rootNote = song.rootNote
  // effects are reset by restoreSong above
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
  playback.currentSection = 0
  playback.repeatCount = 0
  playback.loopStart = 0
  playback.loopEnd = 0
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

// ── Randomize ────────────────────────────────────────────────────────

const SCALES = [
  [0, 3, 5, 7, 10],        // minor pentatonic
  [0, 2, 4, 7, 9],         // major pentatonic
  [0, 2, 3, 5, 7, 9, 10],  // dorian
]

// ── Scene Playback (Phase 4) ─────────────────────────────────────────

/** True when scene has a root node → use graph traversal instead of linear sections */
export function hasScenePlayback(): boolean {
  return song.scene.nodes.some(n => n.root)
}

function sceneRootNode(): SceneNode | undefined {
  return song.scene.nodes.find(n => n.root)
}

/** Returns the pattern index currently being played by the engine */
export function currentlyPlayingIndex(): number {
  if (!playback.playing) return -1
  const soloIdx = soloPatternIndex()
  if (soloIdx != null) return soloIdx
  if (playback.mode === 'scene') {
    if (playback.playingPattern != null) return playback.playingPattern
    return song.sections[playback.currentSection]?.patternIndex ?? -1
  }
  return ui.currentPattern
}

/** True when the viewed pattern is the one the engine is actually playing */
export function isViewingPlayingPattern(): boolean {
  return playback.playing && ui.currentPattern === currentlyPlayingIndex()
}

/** Resolve soloNodeId to a pattern index, or null if invalid */
export function soloPatternIndex(): number | null {
  if (!playback.soloNodeId) return null
  const node = song.scene.nodes.find(n => n.id === playback.soloNodeId)
  if (!node || node.type !== 'pattern') return null
  const idx = song.patterns.findIndex(p => p.id === node.patternId)
  return idx >= 0 ? idx : null
}

/** Apply decorators attached to a pattern node before playback (ADR 062) */
function applyDecorators(node: SceneNode): void {
  for (const dec of node.decorators ?? []) {
    if (dec.type === 'transpose') {
      if (dec.params.mode === 1) {
        playback.sceneAbsoluteKey = dec.params.key ?? 0
      } else {
        playback.sceneTranspose += (dec.params.semitones ?? 0)
      }
    } else if (dec.type === 'tempo') {
      song.bpm = dec.params.bpm ?? 120
    } else if (dec.type === 'repeat') {
      playback.sceneRepeatLeft = (dec.params.count ?? 2) - 1
    } else if (dec.type === 'fx') {
      fxPad.verb     = { ...fxPad.verb,     on: !!dec.params.verb }
      fxPad.delay    = { ...fxPad.delay,    on: !!dec.params.delay }
      fxPad.glitch   = { ...fxPad.glitch,   on: !!dec.params.glitch }
      fxPad.granular = { ...fxPad.granular, on: !!dec.params.granular }
    } else if (dec.type === 'automation' && dec.automationParams) {
      playback.activeAutomations.push(dec.automationParams)
    }
  }
}

function startSceneNode(node: SceneNode): { advanced: boolean; patternIndex: number; stop?: boolean } {
  playback.sceneNodeId = node.id
  playback.sceneEdgeId = null
  // Restore previous automation snapshot before applying new decorators
  if (playback.automationSnapshot) {
    restoreAutomationSnapshot(playback.automationSnapshot)
    playback.automationSnapshot = null
  }
  playback.activeAutomations = []
  if (node.type === 'pattern') {
    // Snapshot values before automation/decorators modify them
    playback.automationSnapshot = snapshotAutomationTargets()
    applyDecorators(node)
    // Collect automation nodes connected to this pattern
    collectAutomationsForPattern(node.id)
    const pi = song.patterns.findIndex(p => p.id === node.patternId)
    const idx = pi >= 0 ? pi : 0
    playback.playingPattern = idx
    return { advanced: true, patternIndex: idx }
  }
  // Root is a function node — follow its edges
  if (node.type === 'automation' && node.automationParams) {
    playback.activeAutomations.push(node.automationParams)
  }
  const edges = song.scene.edges.filter(e => e.from === node.id).sort((a, b) => a.order - b.order)
  if (edges.length > 0) {
    const pick = edges[Math.floor(Math.random() * edges.length)]
    return walkToNode(pick)
  }
  return { advanced: false, patternIndex: -1, stop: true }
}

/** Collect automation nodes that have edges pointing to a pattern node */
function collectAutomationsForPattern(patternNodeId: string): void {
  const inEdges = song.scene.edges.filter(e => e.to === patternNodeId)
  for (const edge of inEdges) {
    const srcNode = song.scene.nodes.find(n => n.id === edge.from)
    if (srcNode?.type === 'automation' && srcNode.automationParams) {
      playback.activeAutomations.push(srcNode.automationParams)
    }
  }
}

function walkToNode(edge: SceneEdge): { advanced: boolean; patternIndex: number; stop?: boolean } {
  const visited = new Set<string>()
  let currentEdge = edge

  while (true) {
    const node = song.scene.nodes.find(n => n.id === currentEdge.to)
    if (!node || visited.has(node.id)) {
      // Missing or cycle — stop playback
      return { advanced: false, patternIndex: -1, stop: true }
    }
    visited.add(node.id)

    if (node.type === 'pattern') {
      // Restore previous automation snapshot before applying new decorators
      if (playback.automationSnapshot) {
        restoreAutomationSnapshot(playback.automationSnapshot)
      }
      playback.activeAutomations = []
      playback.automationSnapshot = snapshotAutomationTargets()
      applyDecorators(node)
      collectAutomationsForPattern(node.id)
      playback.sceneNodeId = node.id
      playback.sceneEdgeId = currentEdge.id
      const pi = song.patterns.findIndex(p => p.id === node.patternId)
      const idx = pi >= 0 ? pi : 0
      playback.playingPattern = idx
      return { advanced: true, patternIndex: idx }
    }

    // Process function node
    if (node.type === 'transpose') {
      if (node.params?.mode === 1) {
        // Absolute mode: set key directly
        playback.sceneAbsoluteKey = node.params?.key ?? 0
      } else {
        // Relative mode: accumulate semitone offset
        playback.sceneTranspose += (node.params?.semitones ?? 0)
      }
    } else if (node.type === 'tempo') {
      song.bpm = node.params?.bpm ?? 120
    } else if (node.type === 'repeat') {
      playback.sceneRepeatLeft = (node.params?.count ?? 2) - 1
    } else if (node.type === 'fx') {
      const p = node.params ?? {}
      if (p.verb)     fxPad.verb     = { ...fxPad.verb, on: true }
      else            fxPad.verb     = { ...fxPad.verb, on: false }
      if (p.delay)    fxPad.delay    = { ...fxPad.delay, on: true }
      else            fxPad.delay    = { ...fxPad.delay, on: false }
      if (p.glitch)   fxPad.glitch   = { ...fxPad.glitch, on: true }
      else            fxPad.glitch   = { ...fxPad.glitch, on: false }
      if (p.granular) fxPad.granular = { ...fxPad.granular, on: true }
      else            fxPad.granular = { ...fxPad.granular, on: false }
    } else if (node.type === 'automation' && node.automationParams) {
      playback.activeAutomations.push(node.automationParams)
    }

    // Follow this function node's outgoing edges (random pick)
    const fnEdges = song.scene.edges.filter(e => e.from === node.id).sort((a, b) => a.order - b.order)
    if (fnEdges.length === 0) {
      // Dead end in function chain — stop playback
      return { advanced: false, patternIndex: -1, stop: true }
    }
    currentEdge = fnEdges[Math.floor(Math.random() * fnEdges.length)]
  }
}

/** Advance graph playback at beat boundary. Called from App.svelte onStep. */
export function advanceSceneNode(): { advanced: boolean; patternIndex: number; stop?: boolean } {
  const root = sceneRootNode()
  if (!root) return { advanced: false, patternIndex: 0 }

  // First call — start from root
  if (!playback.sceneNodeId) {
    return startSceneNode(root)
  }

  // Check repeat
  if (playback.sceneRepeatLeft > 0) {
    playback.sceneRepeatLeft--
    return { advanced: false, patternIndex: -1 }
  }

  // Find current node and follow outgoing edges
  const current = song.scene.nodes.find(n => n.id === playback.sceneNodeId)
  if (!current) return startSceneNode(root)

  const outEdges = song.scene.edges
    .filter(e => e.from === current.id)
    .sort((a, b) => a.order - b.order)

  if (outEdges.length === 0) {
    // Terminal node — stop playback
    return { advanced: false, patternIndex: -1, stop: true }
  }

  // Random pick among outgoing edges
  return walkToNode(outEdges[Math.floor(Math.random() * outEdges.length)])
}

/** Evaluate automation curve at progress t (0–1) */
function evaluateAutomation(points: AutomationPoint[], t: number, interpolation: string): number {
  if (points.length === 0) return 0.5
  if (t <= points[0].t) return points[0].v
  if (t >= points[points.length - 1].t) return points[points.length - 1].v
  let i = 0
  while (i < points.length - 1 && points[i + 1].t <= t) i++
  const p0 = points[i], p1 = points[i + 1]
  const segT = p1.t === p0.t ? 0 : (t - p0.t) / (p1.t - p0.t)
  if (interpolation === 'smooth') {
    // Smoothstep
    const s = segT * segT * (3 - 2 * segT)
    return p0.v + (p1.v - p0.v) * s
  }
  return p0.v + (p1.v - p0.v) * segT
}

/** Snapshot current values of all automation targets so they can be restored later */
function snapshotAutomationTargets(): Record<string, number> {
  const snap: Record<string, number> = {}
  snap['global:tempo'] = song.bpm
  snap['global:masterVolume'] = perf.masterGain
  for (let i = 0; i < song.tracks.length; i++) {
    snap[`track:${i}:volume`] = song.tracks[i].volume
    snap[`track:${i}:pan`] = song.tracks[i].pan
  }
  return snap
}

/** Restore values from a snapshot taken before automation was applied */
export function restoreAutomationSnapshot(snap: Record<string, number>): void {
  if (snap['global:tempo'] != null) song.bpm = snap['global:tempo']
  if (snap['global:masterVolume'] != null) perf.masterGain = snap['global:masterVolume']
  for (let i = 0; i < song.tracks.length; i++) {
    if (snap[`track:${i}:volume`] != null) song.tracks[i].volume = snap[`track:${i}:volume`]
    if (snap[`track:${i}:pan`] != null) song.tracks[i].pan = snap[`track:${i}:pan`]
  }
}

/** Apply active automations at current step progress. Called from App.svelte onStep. */
export function applyAutomations(stepIndex: number, totalSteps: number): void {
  if (playback.activeAutomations.length === 0) return
  const t = totalSteps > 1 ? stepIndex / (totalSteps - 1) : 0

  for (const auto of playback.activeAutomations) {
    const v = evaluateAutomation(auto.points, t, auto.interpolation)
    applyAutomationValue(auto.target, v)
  }
}

function applyAutomationValue(target: AutomationTarget, v: number): void {
  switch (target.kind) {
    case 'global':
      if (target.param === 'tempo') {
        song.bpm = Math.round(60 + v * 240)  // 60–300 BPM
      } else if (target.param === 'masterVolume') {
        perf.masterGain = v
      }
      break
    case 'track': {
      const track = song.tracks[target.trackIndex]
      if (!track) break
      if (target.param === 'volume') {
        track.volume = v
      } else if (target.param === 'pan') {
        track.pan = v * 2 - 1  // 0–1 → -1..1
      }
      break
    }
    case 'fx':
      switch (target.param) {
        case 'reverbWet':      fxPad.verb     = { ...fxPad.verb,     x: v }; break
        case 'reverbDamp':     fxPad.verb     = { ...fxPad.verb,     y: v }; break
        case 'delayTime':      fxPad.delay    = { ...fxPad.delay,    x: v }; break
        case 'delayFeedback':  fxPad.delay    = { ...fxPad.delay,    y: v }; break
        case 'filterCutoff':   fxPad.filter   = { ...fxPad.filter,   x: v }; break
        case 'glitchX':        fxPad.glitch   = { ...fxPad.glitch,   x: v }; break
        case 'glitchY':        fxPad.glitch   = { ...fxPad.glitch,   y: v }; break
        case 'granularSize':   fxPad.granular = { ...fxPad.granular, x: v }; break
        case 'granularDensity': fxPad.granular = { ...fxPad.granular, y: v }; break
      }
      break
    case 'send': {
      const pat = playback.playingPattern != null ? song.patterns[playback.playingPattern] : null
      if (!pat) break
      const cell = pat.cells[target.trackIndex]
      if (!cell) break
      switch (target.param) {
        case 'reverbSend':   cell.reverbSend = v; break
        case 'delaySend':    cell.delaySend = v; break
        case 'glitchSend':   cell.glitchSend = v; break
        case 'granularSend': cell.granularSend = v; break
      }
      break
    }
  }
}

/** Apply FX and key/oct for a section (called on section advance) */
export function applySection(sec: Section) {
  if (sec.key != null) perf.rootNote = sec.key
  if (sec.oct != null) perf.octave = sec.oct
  fxPad.verb = sec.verb?.on
    ? { on: true, x: sec.verb.x, y: sec.verb.y }
    : { ...fxPad.verb, on: false }
  fxPad.delay = sec.delay?.on
    ? { on: true, x: sec.delay.x, y: sec.delay.y }
    : { ...fxPad.delay, on: false }
  fxPad.glitch = sec.glitch?.on
    ? { on: true, x: sec.glitch.x, y: sec.glitch.y }
    : { ...fxPad.glitch, on: false }
  fxPad.granular = sec.granular?.on
    ? { on: true, x: sec.granular.x, y: sec.granular.y }
    : { ...fxPad.granular, on: false }
}

/** Apply perf on last repeat of a section */
export function updateSectionPerf(step: number): boolean {
  if (!(playback.loopEnd > playback.loopStart)) return false
  const sec = song.sections[playback.currentSection]
  const isLast = playback.repeatCount >= sec.repeats - 1
  const perfLen = sec.perfLen ?? 16
  const perfType = sec.perf ?? 0
  const inZone = isLast && step >= (16 - perfLen - 1)
  const f = perfType === 1 && inZone
  const b = perfType === 2 && inZone
  const r = perfType === 3 && inZone
  const changed = perf.filling !== f || perf.breaking !== b || perf.reversing !== r
  perf.filling = f; perf.breaking = b; perf.reversing = r
  return changed
}

export function sectionRewind() {
  playback.currentSection = playback.loopStart
  playback.repeatCount = 0
  if (playback.playing && (playback.loopEnd > playback.loopStart)) {
    applySection(song.sections[playback.loopStart])
  }
}

export function sectionJump(index: number) {
  if (index < 0 || index >= SECTION_COUNT) return
  playback.currentSection = index
  playback.repeatCount = 0
  if (playback.playing && (playback.loopEnd > playback.loopStart)) {
    applySection(song.sections[index])
  }
}

/** Called at beat boundary. Returns true if advanced to a new section. */
export function advanceSection(): boolean {
  if (!(playback.loopEnd > playback.loopStart)) return false
  playback.repeatCount++
  if (playback.repeatCount >= song.sections[playback.currentSection].repeats) {
    const next = playback.currentSection + 1
    playback.currentSection = next > playback.loopEnd ? playback.loopStart : next
    playback.repeatCount = 0
    return true
  }
  return false
}

// ── Chord progression templates (scale-degree indices 0-6) ───────────
const PROGRESSIONS = [
  [0, 4, 5, 3],  // I  - V  - vi - IV  (pop)
  [0, 3, 4, 4],  // I  - IV - V  - V   (rock)
  [5, 3, 0, 4],  // vi - IV - I  - V   (emo/pop)
  [0, 5, 3, 4],  // I  - vi - IV - V   (50s)
  [1, 4, 0, 0],  // ii - V  - I  - I   (jazz turnaround)
  [0, 3, 5, 3],  // I  - IV - vi - IV  (chill)
]

// Diatonic scale intervals (C major); same as SCALE_DEGREES but used locally for chord building
const DIATONIC = [0, 2, 4, 5, 7, 9, 11]

/** Build a diatonic chord (triad or 7th) from a scale degree root in a given octave */
function buildChord(degree: number, octave: number, seventh: boolean): number[] {
  const notes: number[] = []
  const offsets = seventh ? [0, 2, 4, 6] : [0, 2, 4] // diatonic degree offsets
  for (const off of offsets) {
    const deg = (degree + off) % 7
    const octShift = Math.floor((degree + off) / 7)
    const midi = octave * 12 + DIATONIC[deg]
    const n = midi + octShift * 12
    if (n >= PIANO_ROLL_MIN && n <= PIANO_ROLL_MAX) notes.push(n)
  }
  return notes
}

/** Pick a random element from an array */
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

export function randomizePattern(): void {
  pushUndo('Randomize')
  const roots = [48, 50, 51, 53, 55, 56, 58, 60]
  const root  = pick(roots)
  const scale = pick(SCALES)

  let allNotes: number[] = []
  for (let oct = 0; oct < 3; oct++) {
    for (const interval of scale) {
      const n = root + oct * 12 + interval
      if (n >= PIANO_ROLL_MIN && n <= PIANO_ROLL_MAX) allNotes.push(n)
    }
  }

  if (prefs.scaleMode) {
    allNotes = allNotes
      .map(n => {
        if (SCALE_DEGREES_SET.has(n % 12)) return n
        const up = n + 1 <= PIANO_ROLL_MAX && SCALE_DEGREES_SET.has((n + 1) % 12) ? n + 1 : n + 2
        const down = n - 1 >= PIANO_ROLL_MIN && SCALE_DEGREES_SET.has((n - 1) % 12) ? n - 1 : n - 2
        return (n - down <= up - n) ? down : up
      })
      .filter((n, i, arr) => n >= PIANO_ROLL_MIN && n <= PIANO_ROLL_MAX && arr.indexOf(n) === i)
  }
  const lowNotes  = allNotes.filter(n => n < 60)
  const highNotes = allNotes.filter(n => n >= 60)

  // Pick a chord progression for this randomization
  const prog = pick(PROGRESSIONS)
  const useSeventh = Math.random() < 0.3
  const chordOctave = 4 // C4=60 region

  for (let t = 0; t < song.tracks.length; t++) {
    const c = activeCell(t)
    const steps = c.steps
    const isPoly = (c.voiceId === 'iDEATH' || c.voiceId === 'FM') && (c.voiceParams?.polyMode ?? 0) >= 0.5

    if (c.voiceId && DRUM_VOICES.has(c.voiceId)) {
      // ── Drums: beat-locked probabilities (unchanged) ──
      for (let s = 0; s < steps; s++) {
        let prob = 0
        const beat = s % 8

        if (c.voiceId === 'Kick') {
          prob = beat === 0 ? 0.92 : beat === 4 ? 0.40 : 0.08
        } else if (c.voiceId === 'Snare') {
          prob = beat === 4 ? 0.88 : beat === 6 ? 0.25 : 0.05
        } else if (c.voiceId === 'Clap') {
          prob = beat === 4 ? 0.70 : 0.03
        } else if (c.voiceId === 'OpenHat') {
          prob = (beat === 2 || beat === 6) ? 0.50 : 0.05
        } else if (c.voiceId === 'Cymbal') {
          prob = beat === 0 ? 0.25 : 0.02
        } else {
          const on8th = s % 2 === 0
          prob = on8th ? 0.82 : (Math.random() > 0.5 ? 0.55 : 0.20)
        }

        const active = Math.random() < prob
        c.trigs[s].active   = active
        c.trigs[s].velocity = 0.55 + Math.random() * 0.45
        c.trigs[s].chance = active && prob < 0.5 ? 0.5 + Math.random() * 0.4 : undefined
      }
    } else if (isPoly) {
      // ── Poly chord mode: diatonic chord progression with rhythm templates ──
      // Rhythm templates: [stepOffset, duration, velocityBase]
      // Each template covers one chord change period (beatsPerChord steps)
      const CHORD_RHYTHMS: [number, number, number][][] = [
        // Pad: sustained whole notes
        [[0, 0, 0.80]],  // dur=0 means fill to next chord
        // Comp: syncopated hits (off-beat accents)
        [[0, 2, 0.75], [3, 1, 0.60], [5, 2, 0.70]],
        // Stab: short rhythmic stabs
        [[0, 1, 0.85], [2, 1, 0.55], [4, 1, 0.70], [6, 1, 0.50]],
        // Ska/upstroke: off-beat only
        [[1, 1, 0.70], [3, 1, 0.65], [5, 1, 0.72], [7, 1, 0.60]],
        // Pulse: dotted rhythm
        [[0, 3, 0.80], [3, 2, 0.65], [6, 2, 0.70]],
      ]
      const rhythm = pick(CHORD_RHYTHMS)
      const beatsPerChord = Math.max(1, Math.floor(steps / prog.length))
      // Clear all steps first
      for (let s = 0; s < steps; s++) c.trigs[s].active = false
      // Place chords according to rhythm template
      for (let ci = 0; ci < prog.length; ci++) {
        const base = ci * beatsPerChord
        const degree = prog[ci]
        const chord = buildChord(degree, chordOctave, useSeventh)
        if (chord.length === 0) continue
        for (const [off, dur, vel] of rhythm) {
          const s = base + off
          if (s >= steps) break
          c.trigs[s].active   = true
          c.trigs[s].note     = chord[0]
          c.trigs[s].notes    = chord
          c.trigs[s].velocity = vel + Math.random() * 0.15
          c.trigs[s].duration = dur === 0
            ? Math.min(beatsPerChord, steps - s)
            : Math.min(dur, steps - s)
        }
      }
    } else {
      // ── Mono melodic: scale-aware melody/bass ──
      const isBass = c.voiceId === 'Bass303' || c.voiceId === 'Analog'
      const pool   = isBass
        ? (lowNotes.length  > 0 ? lowNotes  : allNotes)
        : (highNotes.length > 0 ? highNotes : allNotes)

      if (isBass) {
        // Bass follows chord roots on downbeats, fills with scale tones
        const beatsPerChord = Math.max(1, Math.floor(steps / prog.length))
        for (let s = 0; s < steps; s++) {
          const chordIdx = Math.min(Math.floor(s / beatsPerChord), prog.length - 1)
          const rootNote = PIANO_ROLL_MIN + DIATONIC[prog[chordIdx]]
          const isDownbeat = s % beatsPerChord === 0
          const active = isDownbeat ? true : Math.random() < 0.25
          c.trigs[s].active   = active
          c.trigs[s].note     = active
            ? (isDownbeat ? rootNote : pick(pool))
            : c.trigs[s].note
          c.trigs[s].velocity = active ? 0.6 + Math.random() * 0.4 : c.trigs[s].velocity
        }
      } else {
        // Melody: stepwise motion with occasional leaps, biased to chord tones
        let prevNote = pick(pool)
        const density = 0.27
        for (let s = 0; s < steps; s++) {
          const active = Math.random() < density
          c.trigs[s].active = active
          if (active) {
            // 70% stepwise (±1-2 scale tones), 30% leap
            if (Math.random() < 0.7 && pool.length > 1) {
              const idx = pool.indexOf(prevNote)
              const nearIdx = idx >= 0
                ? Math.max(0, Math.min(pool.length - 1, idx + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2))))
                : Math.floor(Math.random() * pool.length)
              prevNote = pool[nearIdx]
            } else {
              prevNote = pick(pool)
            }
            c.trigs[s].note     = prevNote
            c.trigs[s].velocity = 0.55 + Math.random() * 0.45
          }
        }
      }
    }
  }
}

// ── Project persistence (ADR 020) ────────────────────────────────────

import { saveProject, loadProject, listProjects, deleteProject, saveSample, loadSamples, deleteSamples, type StoredProject } from './storage.ts'
export type { StoredProject }
export { listProjects, deleteProject }

// ── Sample persistence (ADR 020 Section I, Phase A) ──────────────────

/** In-memory sample state per track (survives navigation, persisted to IndexedDB) */
export interface SampleMeta {
  name: string
  waveform: Float32Array
  rawBuffer: ArrayBuffer
}

export const samplesByTrack = $state<Record<number, SampleMeta>>({})

/** Store a loaded sample in memory + persist to IndexedDB */
export function setSample(trackId: number, name: string, waveform: Float32Array, rawBuffer: ArrayBuffer): void {
  samplesByTrack[trackId] = { name, waveform, rawBuffer }
  if (project.id) void saveSample(project.id, trackId, name, rawBuffer)
}

/** Persist any pending samples after project gets an id (called from projectSaveAs) */
async function persistPendingSamples(projectId: string): Promise<void> {
  for (const [tid, meta] of Object.entries(samplesByTrack)) {
    await saveSample(projectId, Number(tid), meta.name, meta.rawBuffer)
  }
}

/** Restore samples from IndexedDB — decode + cache in engine (sent on next sendPattern) */
export async function restoreSamples(projectId: string): Promise<void> {
  clearSamples()
  const stored = await loadSamples(projectId)
  if (stored.length === 0) return
  const { engine } = await import('./audio/engine.ts')
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
  await saveProject(buildStoredProject(id, name, now))
  project.id = id
  project.dirty = false
  project.lastSavedAt = now
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
  const existing = await loadProject(project.id)
  const now = Date.now()
  await saveProject(buildStoredProject(project.id, song.name, now, existing?.createdAt))
  project.dirty = false
  project.lastSavedAt = now
}

/** Load a project by id and replace current state */
export async function projectLoad(id: string): Promise<boolean> {
  const proj = await loadProject(id)
  if (!proj) return false
  // Migrate: ensure song.name matches project name
  if (!proj.song.name) proj.song.name = proj.name
  restoreSong(proj.song)
  project.id = id
  project.dirty = false
  // Reset UI
  ui.currentPattern = 0
  ui.currentSection = 0
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
  ui.currentSection = 0
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
  await deleteProject(id)
  await deleteSamples(id)
  if (project.id === id) projectNew()
}

/** Auto-save: immediate on every mutation */
let autoSaveRunning = false

function scheduleAutoSave() {
  if (autoSaveRunning) return
  void doAutoSave()
}

async function doAutoSave(): Promise<void> {
  if (autoSaveRunning || !project.dirty) return
  autoSaveRunning = true
  try {
    if (!project.id) {
      await projectSaveAs(song.name || 'Untitled')
    } else {
      await projectSave()
    }
  } finally {
    autoSaveRunning = false
  }
}

/** Immediate auto-save (for beforeunload) */
export async function projectAutoSave(): Promise<void> {
  if (!project.dirty) return
  if (!project.id) {
    await projectSaveAs(song.name || 'Untitled')
  } else {
    await projectSave()
  }
}

/** Restore last project on app startup */
export async function projectRestore(): Promise<void> {
  if (!project.id) return
  const ok = await projectLoad(project.id)
  if (!ok) { project.id = null; savePrefs() }
}

/** Rename the current project */
export async function projectRename(name: string): Promise<void> {
  song.name = name
  if (project.id) {
    const existing = await loadProject(project.id)
    if (existing) {
      existing.name = name
      existing.song.name = name
      existing.updatedAt = Date.now()
      await saveProject(existing)
    }
  }
}

/** Load factory demo patterns as a new unsaved project */
export function projectLoadFactory(): void {
  restoreSong(makeDefaultSong())
  clearSamples()
  project.id = null
  project.dirty = true
  ui.currentPattern = 0
  ui.currentSection = 0
  ui.selectedTrack = 0
  ui.patternSheet = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  undoStack.length = 0
  redoStack.length = 0
}
