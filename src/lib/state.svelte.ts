// State — Section/Cell model (ADR 042)
import {
  SCALE_DEGREES_SET,
  PIANO_ROLL_MIN, PIANO_ROLL_MAX,
  DEFAULT_EFFECTS, DEFAULT_FX_PAD, DEFAULT_PERF,
} from './constants.ts'
import {
  DRUM_SYNTHS, makeTrig, makeDefaultSong, makeEmptyCell,
  makePatternId,
  TRACK_DEFAULTS, SECTION_COUNT, FACTORY_COUNT,
} from './factory.ts'

export { NOTE_NAMES } from './constants.ts'
export { FACTORY_COUNT, SECTION_COUNT } from './factory.ts'

export type SynthType = 'DrumSynth' | 'NoiseSynth' | 'AnalogSynth' | 'FMSynth' | 'Sampler' | 'ChordSynth'

export interface Trig {
  active: boolean
  note: number      // MIDI note (60 = C4)
  velocity: number  // 0.0–1.0
  duration: number  // step count 1-16 (default 1)
  slide: boolean    // slide/glide to next note (default false)
  chance?: number   // 0.0–1.0, undefined = always fire (100%)
  paramLocks?: Record<string, number>  // per-step voice param overrides (P-Lock)
}

/** Inline step data for one track in one section (ADR 042, replaces Phrase) */
export interface Cell {
  steps: number           // 1–64
  trigs: Trig[]           // length === steps
  voiceParams: Record<string, number>
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

/** Reusable pattern — name + color + 8 tracks of step data (ADR 044, 049) */
export interface Pattern {
  id: string              // e.g. 'pat_00'
  name: string            // max 8 chars
  color: number           // index into PATTERN_COLORS (0–7)
  cells: Cell[]           // 8 fixed (one per track)
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
  synthType: SynthType
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

/** Node on the scene canvas (ADR 044) */
export interface SceneNode {
  id: string
  type: 'pattern' | 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx'
  x: number               // canvas position (normalized 0–1)
  y: number
  root: boolean           // true = playback entry point (exactly one)
  patternId?: string      // for type === 'pattern'
  params?: Record<string, number>
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
    ...(tr.paramLocks && Object.keys(tr.paramLocks).length > 0
      ? { paramLocks: { ...tr.paramLocks } } : {}),
  }
}

function cloneCell(c: Cell): Cell {
  return {
    steps: c.steps,
    voiceParams: { ...c.voiceParams },
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
  return { id: t.id, name: t.name, synthType: t.synthType, muted: t.muted, volume: t.volume, pan: t.pan }
}

function cloneScene(sc: Scene): Scene {
  return {
    name: sc.name,
    nodes: sc.nodes.map(n => ({ ...n, ...(n.params ? { params: { ...n.params } } : {}) })),
    edges: sc.edges.map(e => ({ ...e })),
    labels: (sc.labels ?? []).map(l => ({ ...l })),
  }
}

function cloneSong(): Song {
  return {
    name: song.name, bpm: song.bpm, rootNote: song.rootNote,
    tracks: song.tracks.map(cloneTrack),
    patterns: song.patterns.map(clonePattern),
    sections: song.sections.map(cloneSection),
    scene: cloneScene(song.scene),
  }
}

interface UndoEntry { snapshot: Song; label: string }
const undoStack: UndoEntry[] = []
const redoStack: UndoEntry[] = []
const UNDO_MAX = 50
let lastPushTime = 0
let lastPushLabel = ''

function pushUndo(label: string): void {
  const now = Date.now()
  if (label === lastPushLabel && now - lastPushTime < 500) {
    return
  }
  undoStack.push({ snapshot: cloneSong(), label })
  if (undoStack.length > UNDO_MAX) undoStack.shift()
  redoStack.length = 0
  lastPushTime = now
  lastPushLabel = label
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
  song.name = src.name
  song.bpm = src.bpm
  song.rootNote = src.rootNote ?? 0
  song.tracks = src.tracks.map(t => ({ ...t }))
  song.patterns = src.patterns.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color ?? 0,
    cells: p.cells.map(restoreCell),
  }))
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
  song.scene = src.scene
    ? {
        name: src.scene.name,
        nodes: src.scene.nodes.map(n => ({ ...n, ...(n.params ? { params: { ...n.params } } : {}) })),
        edges: src.scene.edges.map(e => ({ ...e })),
        labels: (src.scene.labels ?? []).map(l => ({ ...l })),
      }
    : { name: 'Main', nodes: [], edges: [], labels: [] }
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

export const song = $state<Song>(makeDefaultSong())

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
})

export const ui = $state<{
  selectedTrack: number
  currentSection: number
  currentPattern: number
  phraseView: 'pattern' | 'scene' | 'fx' | 'eq'
  selectedSceneNode: string | null
  selectedSceneEdge: string | null
  selectedSceneLabel: string | null
  sidebar: 'help' | 'system' | null
  lockMode: boolean
  selectedStep: number | null
  soloTracks: Set<number>
  dockPosition: 'right' | 'bottom'
  mobileOverlay: boolean
}>({
  selectedTrack: 0,
  currentSection: 0,
  currentPattern: 0,    // index into song.patterns[] (ADR 044 Phase 1a)
  phraseView: 'pattern',
  selectedSceneNode: null,
  selectedSceneEdge: null,
  selectedSceneLabel: null,
  sidebar: null,
  lockMode: false,
  selectedStep: null,
  soloTracks: new Set<number>(),
  dockPosition: 'right',
  mobileOverlay: false,
})

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
  dockPosition: 'right' | 'bottom'
  patternEditor: 'grid' | 'tracker'
}

function loadPrefs(): StoredPrefs {
  const defaults: StoredPrefs = { v: STORAGE_VERSION, lang: 'ja', visited: false, scaleMode: true, dockPosition: 'right', patternEditor: 'grid' }
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
    dockPosition: ui.dockPosition,
    patternEditor: prefs.patternEditor,
  }))
}

const initialPrefs = loadPrefs()

export type Lang = 'ja' | 'en'
export const lang = $state({ value: initialPrefs.lang })
export const prefs = $state({
  visited: initialPrefs.visited,
  scaleMode: initialPrefs.scaleMode,
  patternEditor: initialPrefs.patternEditor as 'grid' | 'tracker',
})

ui.dockPosition = initialPrefs.dockPosition

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
export function toggleDockPosition(): void {
  ui.dockPosition = ui.dockPosition === 'right' ? 'bottom' : 'right'
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

export const vkbd = $state({
  enabled: false,
  octave: 4,
  velocity: 0.8,
  heldKeys: new Set<string>(),
})

export const effects = $state<Effects>({
  reverb: { ...DEFAULT_EFFECTS.reverb },
  delay:  { ...DEFAULT_EFFECTS.delay },
  ducker: { ...DEFAULT_EFFECTS.ducker },
  comp:   { ...DEFAULT_EFFECTS.comp },
})

// ── Actions ─────────────────────────────────────────────────────────

export function toggleTrig(trackId: number, stepIndex: number) {
  pushUndo('Toggle step')
  const c = activeCell(trackId)
  c.trigs[stepIndex].active = !c.trigs[stepIndex].active
}

export function setTrigVelocity(trackId: number, stepIdx: number, v: number) {
  pushUndo('Set velocity')
  activeCell(trackId).trigs[stepIdx].velocity = Math.max(0.05, Math.min(1, v))
}

/** For piano roll: click cell sets note + activates; click same note deactivates */
export function setTrigNote(trackId: number, stepIndex: number, note: number) {
  pushUndo('Set note')
  const trig = activeCell(trackId).trigs[stepIndex]
  if (trig.active && trig.note === note) {
    trig.active = false
  } else {
    trig.active = true
    trig.note = note
  }
}

export function setTrigDuration(trackId: number, stepIdx: number, dur: number) {
  pushUndo('Set duration')
  activeCell(trackId).trigs[stepIdx].duration = Math.max(1, Math.min(16, Math.round(dur)))
}

export function setTrigSlide(trackId: number, stepIdx: number, slide: boolean) {
  pushUndo('Set slide')
  activeCell(trackId).trigs[stepIdx].slide = slide
}

export function setTrigChance(trackId: number, stepIdx: number, chance: number) {
  pushUndo('Set chance')
  const v = Math.max(0, Math.min(1, chance))
  activeCell(trackId).trigs[stepIdx].chance = v >= 1 ? undefined : v
}

/** Place a note bar: set head trig + clear covered steps */
export function placeNoteBar(trackId: number, startStep: number, note: number, duration: number) {
  pushUndo('Place note')
  const c = activeCell(trackId)
  const dur = Math.max(1, Math.min(c.steps - startStep, Math.min(16, duration)))
  c.trigs[startStep].active = true
  c.trigs[startStep].note = note
  c.trigs[startStep].duration = dur
  for (let d = 1; d < dur; d++) {
    const idx = startStep + d
    if (idx < c.steps) c.trigs[idx].active = false
  }
}

/** Find the head step of a note bar that covers the given step/note */
export function findNoteHead(trackId: number, stepIdx: number, note: number): number {
  const trigs = activeCell(trackId).trigs
  for (let d = 0; d < 16; d++) {
    const prev = stepIdx - d
    if (prev < 0) break
    const trig = trigs[prev]
    if (!trig) break
    if (trig.active && trig.note === note && (trig.duration ?? 1) > d) {
      return prev
    }
    if (d > 0 && trig.active && trig.note === note) break
  }
  return -1
}

export function toggleMute(trackId: number) {
  pushUndo('Toggle mute')
  song.tracks[trackId].muted = !song.tracks[trackId].muted
}

export function toggleSolo(trackId: number) {
  if (ui.soloTracks.has(trackId)) {
    ui.soloTracks.delete(trackId)
  } else {
    ui.soloTracks.add(trackId)
  }
  ui.soloTracks = new Set(ui.soloTracks)
}

export function isDrum(track: Track): boolean {
  return DRUM_SYNTHS.includes(track.synthType)
}

export const STEP_OPTIONS = [2, 4, 8, 12, 16, 24, 32, 48, 64] as const

export function setTrackSteps(trackId: number, newSteps: number) {
  pushUndo('Set steps')
  const clamped = Math.max(2, Math.min(64, newSteps))
  const c = activeCell(trackId)
  const old = c.steps
  if (clamped === old) return
  if (clamped > old) {
    const lastNote = c.trigs[old - 1]?.note ?? 60
    for (let i = old; i < clamped; i++) {
      c.trigs.push(makeTrig(false, lastNote))
    }
  } else {
    c.trigs.splice(clamped)
  }
  c.steps = clamped
}

export function setTrackSend(trackId: number, send: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend', v: number) {
  pushUndo('Set send')
  activeCell(trackId)[send] = Math.min(1, Math.max(0, v))
}

export function setVoiceParam(trackId: number, key: string, value: number) {
  pushUndo('Set param')
  activeCell(trackId).voiceParams[key] = value
}

export function setParamLock(trackId: number, stepIdx: number, key: string, value: number) {
  pushUndo('Set P-Lock')
  const trig = activeCell(trackId).trigs[stepIdx]
  if (!trig.paramLocks) trig.paramLocks = {}
  trig.paramLocks[key] = value
}

export function clearParamLock(trackId: number, stepIdx: number, key: string) {
  pushUndo('Clear P-Lock')
  const trig = activeCell(trackId).trigs[stepIdx]
  if (!trig.paramLocks) return
  delete trig.paramLocks[key]
  if (Object.keys(trig.paramLocks).length === 0) trig.paramLocks = undefined
}

export function clearAllParamLocks(trackId: number, stepIdx: number) {
  pushUndo('Clear all P-Locks')
  activeCell(trackId).trigs[stepIdx].paramLocks = undefined
}

// ── Factory reset ────────────────────────────────────────────────────

export function factoryReset(): void {
  restoreSong(makeDefaultSong())
  // Reset UI
  ui.selectedTrack = 0
  ui.currentSection = 0
  ui.currentPattern = 0
  ui.phraseView = 'pattern'
  ui.sidebar = null
  ui.lockMode = false
  ui.selectedStep = null
  ui.dockPosition = 'right'
  ui.mobileOverlay = false
  ui.selectedSceneNode = null
  ui.selectedSceneEdge = null
  // Reset perf
  Object.assign(perf, DEFAULT_PERF)
  perf.rootNote = song.rootNote
  // Reset effects
  effects.reverb = { ...DEFAULT_EFFECTS.reverb }
  effects.delay = { ...DEFAULT_EFFECTS.delay }
  effects.ducker = { ...DEFAULT_EFFECTS.ducker }
  effects.comp = { ...DEFAULT_EFFECTS.comp }
  // Reset FX pad
  fxPad.verb = { ...DEFAULT_FX_PAD.verb }
  fxPad.delay = { ...DEFAULT_FX_PAD.delay }
  fxPad.glitch = { ...DEFAULT_FX_PAD.glitch }
  fxPad.granular = { ...DEFAULT_FX_PAD.granular }
  fxPad.filter = { ...DEFAULT_FX_PAD.filter }
  fxPad.eqLow = { ...DEFAULT_FX_PAD.eqLow }
  fxPad.eqMid = { ...DEFAULT_FX_PAD.eqMid }
  fxPad.eqHigh = { ...DEFAULT_FX_PAD.eqHigh }
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
  playback.soloNodeId = null
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

// ── Section Arrangement ──────────────────────────────────────────────

/** Whether arrangement mode is active (loop range > 1 section) */
export function hasArrangement(): boolean {
  return playback.loopEnd > playback.loopStart
}

export type SongFxKey = 'verb' | 'delay' | 'glitch' | 'granular'

// ── Section presets ────────────────────────────────────────────────

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
  ui.selectedSceneNode = null
  ui.selectedSceneEdge = null
}

// Pre-populate with LOFI preset
songLoadPreset(0)

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

/** Clear a pattern's cells to empty */
export function patternClear(patternIndex: number): void {
  pushUndo('Clear pattern')
  song.patterns[patternIndex].cells = TRACK_DEFAULTS.map((d, i) =>
    makeEmptyCell(i, d.synthType, d.note)
  )
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

// ── Pattern clipboard ────────────────────────────────────────────────
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

// ── Scene graph helpers ─────────────────────────────────────────────

/** Update a scene node's position (no undo — cosmetic, high frequency) */
export function sceneUpdateNode(nodeId: string, x: number, y: number): void {
  const node = song.scene.nodes.find(n => n.id === nodeId)
  if (!node) return
  node.x = x
  node.y = y
}

function nextSceneId(prefix: 'sn' | 'se'): string {
  const items = prefix === 'sn' ? song.scene.nodes : song.scene.edges
  const max = items.reduce((m, item) => {
    const num = parseInt(item.id.replace(`${prefix}_`, ''))
    return isNaN(num) ? m : Math.max(m, num)
  }, -1)
  return `${prefix}_${String(max + 1).padStart(2, '0')}`
}

/** Add a pattern node at position */
export function sceneAddNode(patternId: string, x: number, y: number): string {
  pushUndo('Add scene node')
  const id = nextSceneId('sn')
  const isFirst = song.scene.nodes.length === 0
  song.scene.nodes.push({
    id, type: 'pattern', x, y,
    root: isFirst,
    patternId,
  })
  return id
}

/** Delete a node and its connected edges */
export function sceneDeleteNode(nodeId: string): void {
  pushUndo('Delete scene node')
  const wasRoot = song.scene.nodes.find(n => n.id === nodeId)?.root
  song.scene.edges = song.scene.edges.filter(e => e.from !== nodeId && e.to !== nodeId)
  song.scene.nodes = song.scene.nodes.filter(n => n.id !== nodeId)
  if (wasRoot && song.scene.nodes.length > 0) {
    const nextRoot = song.scene.nodes.find(n => n.type === 'pattern') || song.scene.nodes[0]
    nextRoot.root = true
  }
  if (ui.selectedSceneNode === nodeId) ui.selectedSceneNode = null
  if (ui.selectedSceneEdge && !song.scene.edges.some(e => e.id === ui.selectedSceneEdge)) {
    ui.selectedSceneEdge = null
  }
}

/** Create a directed edge (prevents duplicates and self-loops) */
export function sceneAddEdge(from: string, to: string): string | null {
  if (from === to) return null
  if (song.scene.edges.some(e => e.from === from && e.to === to)) return null
  pushUndo('Add scene edge')
  const id = nextSceneId('se')
  const maxOrder = song.scene.edges
    .filter(e => e.from === from)
    .reduce((m, e) => Math.max(m, e.order), -1)
  song.scene.edges.push({ id, from, to, order: maxOrder + 1 })
  return id
}

/** Delete an edge */
export function sceneDeleteEdge(edgeId: string): void {
  pushUndo('Delete scene edge')
  song.scene.edges = song.scene.edges.filter(e => e.id !== edgeId)
  if (ui.selectedSceneEdge === edgeId) ui.selectedSceneEdge = null
}

/** Set a node as root (only pattern nodes can be root) */
export function sceneSetRoot(nodeId: string): void {
  const node = song.scene.nodes.find(n => n.id === nodeId)
  if (!node || node.type !== 'pattern') return
  pushUndo('Set root node')
  for (const n of song.scene.nodes) n.root = n.id === nodeId
}

// ── Free-floating labels (ADR 052) ──

export function sceneAddLabel(x: number, y: number, text = ''): string {
  pushUndo('Add label')
  const id = crypto.randomUUID().slice(0, 8)
  song.scene.labels = [...(song.scene.labels ?? []), { id, text, x, y }]
  return id
}

export function sceneUpdateLabel(labelId: string, text: string): void {
  const label = song.scene.labels.find(l => l.id === labelId)
  if (!label) return
  pushUndo('Update label')
  label.text = text
}

export function sceneDeleteLabel(labelId: string): void {
  pushUndo('Delete label')
  song.scene.labels = song.scene.labels.filter(l => l.id !== labelId)
}

export function sceneMoveLabel(labelId: string, x: number, y: number): void {
  const label = song.scene.labels.find(l => l.id === labelId)
  if (!label) return
  label.x = x
  label.y = y
}

export function sceneResizeLabel(labelId: string, delta: number): void {
  const label = song.scene.labels.find(l => l.id === labelId)
  if (!label) return
  label.size = Math.max(0.5, Math.min(4, (label.size ?? 1) + delta))
}

const FUNCTION_DEFAULTS: Record<string, Record<string, number>> = {
  transpose: { mode: 0, semitones: 0, key: 0 },
  tempo: { bpm: 120 },
  repeat: { count: 2 },
  probability: {},
  fx: { verb: 0, delay: 0, glitch: 0, granular: 0 },
}

/** Add a function node */
export function sceneAddFunctionNode(
  type: 'transpose' | 'tempo' | 'repeat' | 'probability' | 'fx',
  x: number, y: number
): string {
  pushUndo('Add function node')
  const id = nextSceneId('sn')
  song.scene.nodes.push({
    id, type, x, y,
    root: false,
    params: { ...FUNCTION_DEFAULTS[type] },
  })
  return id
}

/** Update a function node's params */
export function sceneUpdateNodeParams(nodeId: string, params: Record<string, number>): void {
  pushUndo('Update node params')
  const node = song.scene.nodes.find(n => n.id === nodeId)
  if (!node) return
  node.params = { ...params }
}

/** Swap edge order with its neighbor */
export function sceneReorderEdge(edgeId: string, direction: 'up' | 'down'): void {
  const edge = song.scene.edges.find(e => e.id === edgeId)
  if (!edge) return
  const siblings = song.scene.edges
    .filter(e => e.from === edge.from)
    .sort((a, b) => a.order - b.order)
  const idx = siblings.findIndex(e => e.id === edgeId)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= siblings.length) return
  pushUndo('Reorder edge')
  const tmp = edge.order
  edge.order = siblings[swapIdx].order
  siblings[swapIdx].order = tmp
}

/** Auto-layout scene nodes left→right using BFS layers from root */
export function sceneFormatNodes(): void {
  const { nodes, edges } = song.scene
  if (nodes.length === 0) return
  pushUndo('Format nodes')

  // Build adjacency list
  const children = new Map<string, string[]>()
  for (const e of edges) {
    const list = children.get(e.from) || []
    list.push(e.to)
    children.set(e.from, list)
  }

  // BFS from root to assign layers
  const root = nodes.find(n => n.root) || nodes[0]
  const layer = new Map<string, number>()
  const queue: string[] = [root.id]
  layer.set(root.id, 0)
  while (queue.length > 0) {
    const id = queue.shift()!
    const d = layer.get(id)!
    for (const child of children.get(id) || []) {
      if (!layer.has(child)) {
        layer.set(child, d + 1)
        queue.push(child)
      }
    }
  }

  // Assign orphan nodes (not reached by BFS) to a final column
  const maxLayer = Math.max(0, ...layer.values())
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, maxLayer + 1)
  }

  // Group nodes by layer
  const layers = new Map<number, string[]>()
  for (const [id, d] of layer) {
    const list = layers.get(d) || []
    list.push(id)
    layers.set(d, list)
  }

  // Sort nodes within each layer by edge order for deterministic layout
  for (const [, ids] of layers) {
    ids.sort((a, b) => {
      const aEdge = edges.find(e => e.to === a)
      const bEdge = edges.find(e => e.to === b)
      return (aEdge?.order ?? 0) - (bEdge?.order ?? 0)
    })
  }

  // Assign normalized positions: x = layer (left→right), y = spread within layer
  const totalLayers = Math.max(1, ...layers.keys()) + 1
  const margin = 0.08
  for (const [d, ids] of layers) {
    const nx = totalLayers === 1 ? 0.5 : margin + (d / Math.max(1, totalLayers - 1)) * (1 - margin * 2)
    for (let i = 0; i < ids.length; i++) {
      const ny = ids.length === 1 ? 0.5 : margin + (i / (ids.length - 1)) * (1 - margin * 2)
      const node = nodes.find(n => n.id === ids[i])
      if (node) {
        node.x = nx
        node.y = ny
      }
    }
  }
}

// ── Scene Copy/Paste (Phase 5) ───────────────────────────────────────

let sceneClipboard: { nodes: SceneNode[]; edges: SceneEdge[] } | null = null

export function hasSceneClipboard(): boolean {
  return sceneClipboard !== null && sceneClipboard.nodes.length > 0
}

/** Copy a single node to clipboard */
export function sceneCopyNode(nodeId: string): void {
  const node = song.scene.nodes.find(n => n.id === nodeId)
  if (!node) return
  sceneClipboard = {
    nodes: [{ ...node, params: node.params ? { ...node.params } : undefined }],
    edges: [],
  }
}

/** Copy node + all reachable downstream nodes & connecting edges */
export function sceneCopySubgraph(nodeId: string): void {
  const startNode = song.scene.nodes.find(n => n.id === nodeId)
  if (!startNode) return
  const visited = new Set<string>()
  const queue = [nodeId]
  const collectedNodes: SceneNode[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = song.scene.nodes.find(n => n.id === id)
    if (!node) continue
    collectedNodes.push({ ...node, params: node.params ? { ...node.params } : undefined })
    for (const edge of song.scene.edges) {
      if (edge.from === id && !visited.has(edge.to)) queue.push(edge.to)
    }
  }
  sceneClipboard = {
    nodes: collectedNodes,
    edges: song.scene.edges
      .filter(e => visited.has(e.from) && visited.has(e.to))
      .map(e => ({ ...e })),
  }
}

/** Paste clipboard at position, returns new node IDs */
export function scenePaste(baseX: number, baseY: number): string[] {
  if (!sceneClipboard || sceneClipboard.nodes.length === 0) return []
  pushUndo('Paste scene nodes')
  const idMap = new Map<string, string>()
  const pastedIds: string[] = []
  const ref = sceneClipboard.nodes[0]
  const dx = baseX - ref.x, dy = baseY - ref.y
  for (const src of sceneClipboard.nodes) {
    const newId = nextSceneId('sn')
    idMap.set(src.id, newId)
    song.scene.nodes.push({
      ...src, id: newId, root: false,
      x: Math.max(0, Math.min(1, src.x + dx)),
      y: Math.max(0, Math.min(1, src.y + dy)),
      params: src.params ? { ...src.params } : undefined,
    })
    pastedIds.push(newId)
  }
  for (const src of sceneClipboard.edges) {
    const newFrom = idMap.get(src.from), newTo = idMap.get(src.to)
    if (newFrom && newTo) {
      song.scene.edges.push({ id: nextSceneId('se'), from: newFrom, to: newTo, order: src.order })
    }
  }
  return pastedIds
}

// ── Scene Playback (Phase 4) ─────────────────────────────────────────

/** True when scene has a root node → use graph traversal instead of linear sections */
export function hasScenePlayback(): boolean {
  return song.scene.nodes.some(n => n.root)
}

function sceneRootNode(): SceneNode | undefined {
  return song.scene.nodes.find(n => n.root)
}

/** Resolve soloNodeId to a pattern index, or null if invalid */
export function soloPatternIndex(): number | null {
  if (!playback.soloNodeId) return null
  const node = song.scene.nodes.find(n => n.id === playback.soloNodeId)
  if (!node || node.type !== 'pattern') return null
  const idx = song.patterns.findIndex(p => p.id === node.patternId)
  return idx >= 0 ? idx : null
}

function startSceneNode(node: SceneNode): { advanced: boolean; patternIndex: number; stop?: boolean } {
  playback.sceneNodeId = node.id
  playback.sceneEdgeId = null
  if (node.type === 'pattern') {
    const pi = song.patterns.findIndex(p => p.id === node.patternId)
    const idx = pi >= 0 ? pi : 0
    ui.currentPattern = idx
    playback.playingPattern = idx
    return { advanced: true, patternIndex: idx }
  }
  // Root is a function node — follow its edges
  const edges = song.scene.edges.filter(e => e.from === node.id).sort((a, b) => a.order - b.order)
  if (edges.length > 0) {
    const pick = edges[Math.floor(Math.random() * edges.length)]
    return walkToNode(pick)
  }
  return { advanced: false, patternIndex: -1, stop: true }
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
      playback.sceneNodeId = node.id
      playback.sceneEdgeId = currentEdge.id
      const pi = song.patterns.findIndex(p => p.id === node.patternId)
      const idx = pi >= 0 ? pi : 0
      ui.currentPattern = idx
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
  if (!hasArrangement()) return false
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
  if (playback.playing && hasArrangement()) {
    applySection(song.sections[playback.loopStart])
  }
}

export function sectionJump(index: number) {
  if (index < 0 || index >= SECTION_COUNT) return
  playback.currentSection = index
  playback.repeatCount = 0
  if (playback.playing && hasArrangement()) {
    applySection(song.sections[index])
  }
}

/** Called at beat boundary. Returns true if advanced to a new section. */
export function advanceSection(): boolean {
  if (!hasArrangement()) return false
  playback.repeatCount++
  if (playback.repeatCount >= song.sections[playback.currentSection].repeats) {
    const next = playback.currentSection + 1
    playback.currentSection = next > playback.loopEnd ? playback.loopStart : next
    playback.repeatCount = 0
    return true
  }
  return false
}

export function randomizePattern(): void {
  pushUndo('Randomize')
  const roots = [48, 50, 51, 53, 55, 56, 58, 60]
  const root  = roots[Math.floor(Math.random() * roots.length)]
  const scale = SCALES[Math.floor(Math.random() * SCALES.length)]

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

  for (let t = 0; t < song.tracks.length; t++) {
    const track = song.tracks[t]
    const c = activeCell(t)
    const steps = c.steps

    if (isDrum(track)) {
      for (let s = 0; s < steps; s++) {
        let prob = 0
        const beat = s % 8

        if (track.name === 'KICK') {
          prob = beat === 0 ? 0.92 : beat === 4 ? 0.40 : 0.08
        } else if (track.name === 'SNARE') {
          prob = beat === 4 ? 0.88 : beat === 6 ? 0.25 : 0.05
        } else if (track.name === 'CLAP') {
          prob = beat === 4 ? 0.70 : 0.03
        } else if (track.name === 'O.HH') {
          prob = (beat === 2 || beat === 6) ? 0.50 : 0.05
        } else if (track.name === 'CYM') {
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
    } else {
      const pool    = track.name === 'BASS'
        ? (lowNotes.length  > 0 ? lowNotes  : allNotes)
        : (highNotes.length > 0 ? highNotes : allNotes)
      const density = track.name === 'BASS' ? 0.30 : 0.27

      for (let s = 0; s < steps; s++) {
        const active = Math.random() < density
        c.trigs[s].active   = active
        c.trigs[s].note     = active
          ? pool[Math.floor(Math.random() * pool.length)]
          : c.trigs[s].note
        c.trigs[s].velocity = active ? 0.55 + Math.random() * 0.45 : c.trigs[s].velocity
      }
    }
  }
}
