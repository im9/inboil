// State — Section/Cell model (ADR 042)
import {
  SCALE_DEGREES_SET,
  PIANO_ROLL_MIN, PIANO_ROLL_MAX,
  DEFAULT_EFFECTS, DEFAULT_FX_PAD, DEFAULT_PERF,
} from './constants.ts'
import {
  DRUM_SYNTHS, makeTrig, makeDefaultSong, makeEmptyCell,
  TRACK_DEFAULTS, SECTION_COUNT,
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

/** One arrangement section (ADR 042, replaces SongRow + Chain) */
export interface Section {
  name: string            // max 6 chars
  cells: Cell[]           // 8 fixed (one per track)
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

/** Song = flat arrangement of sections (ADR 042) */
export interface Song {
  name: string
  bpm: number
  rootNote: number        // 0–11
  tracks: Track[]         // 8 fixed
  sections: Section[]     // SECTION_COUNT (64) fixed
}

/** Get the active cell for a track in the current section */
export function activeCell(trackId: number): Cell {
  return song.sections[ui.currentSection].cells[trackId]
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

function cloneSection(s: Section): Section {
  return {
    name: s.name,
    cells: s.cells.map(cloneCell),
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

function cloneSong(): Song {
  return {
    name: song.name, bpm: song.bpm, rootNote: song.rootNote,
    tracks: song.tracks.map(cloneTrack),
    sections: song.sections.map(cloneSection),
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

function restoreSong(src: Song): void {
  song.name = src.name
  song.bpm = src.bpm
  song.rootNote = src.rootNote ?? 0
  song.tracks = src.tracks.map(t => ({ ...t }))
  song.sections = src.sections.map(s => ({
    ...s,
    cells: s.cells.map(c => ({
      ...c,
      voiceParams: { ...c.voiceParams },
      trigs: c.trigs.map(tr => ({
        ...tr,
        duration: tr.duration ?? 1,
        slide: tr.slide ?? false,
        ...(tr.paramLocks ? { paramLocks: { ...tr.paramLocks } } : {}),
      })),
    })),
    ...(s.verb ? { verb: { ...s.verb } } : {}),
    ...(s.delay ? { delay: { ...s.delay } } : {}),
    ...(s.glitch ? { glitch: { ...s.glitch } } : {}),
    ...(s.granular ? { granular: { ...s.granular } } : {}),
  }))
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
})

export const ui = $state({
  selectedTrack: 0,
  currentSection: 0,
  phraseView: 'grid' as 'grid' | 'tracker',
  sidebar: null as 'help' | 'system' | null,
  lockMode: false,
  selectedStep: null as number | null,
  soloTracks: new Set<number>(),
  dockTab: 'param' as 'param' | 'fx' | 'eq' | 'help' | 'sys',
  dockPosition: 'right' as 'right' | 'bottom',
  mobileOverlay: false,
})

// ── Section navigation ───────────────────────────────────────────────

/** Switch to a section for editing */
export function selectSection(index: number): void {
  if (index < 0 || index >= SECTION_COUNT) return
  ui.currentSection = index
}

/** Get name of the currently active section */
export function getActiveSectionName(): string {
  return song.sections[ui.currentSection]?.name ?? ''
}

/** Total number of sections */
export function getSectionCount(): number {
  return SECTION_COUNT
}

/** Check if a section contains any active trigs */
export function sectionHasData(index: number): boolean {
  return song.sections[index].cells.some(c => c.trigs.some(t => t.active))
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
}

function loadPrefs(): StoredPrefs {
  const defaults: StoredPrefs = { v: STORAGE_VERSION, lang: 'ja', visited: false, scaleMode: true, dockPosition: 'right' }
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
  }))
}

const initialPrefs = loadPrefs()

export type Lang = 'ja' | 'en'
export const lang = $state({ value: initialPrefs.lang })
export const prefs = $state({
  visited: initialPrefs.visited,
  scaleMode: initialPrefs.scaleMode,
})

ui.dockPosition = initialPrefs.dockPosition

if (!prefs.visited) {
  ui.sidebar = 'help'
  ui.dockTab = 'help'
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
  ui.phraseView = 'grid'
  ui.sidebar = null
  ui.lockMode = false
  ui.selectedStep = null
  ui.dockTab = 'param'
  ui.dockPosition = 'right'
  ui.mobileOverlay = false
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

export const SONG_PRESETS = [
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
    ] as SectionPresetEntry[] },
]

/** Load a song preset: copies factory section data into arrangement sections with metadata overlays */
export function songLoadPreset(index: number) {
  const preset = SONG_PRESETS[index]
  if (!preset) return
  for (let i = 0; i < preset.entries.length; i++) {
    const entry = preset.entries[i]
    const src = song.sections[entry.sectionIndex]
    if (!src) continue
    // Copy cells from the source factory section
    song.sections[i] = {
      name: src.name,
      cells: src.cells.map(cloneCell),
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
  playback.currentSection = 0
  playback.repeatCount = 0
  playback.loopStart = 0
  playback.loopEnd = preset.entries.length - 1
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

/** Clear a section's cells to empty (preserves metadata) */
export function sectionClear(index: number) {
  pushUndo('Clear section')
  const s = song.sections[index]
  s.cells = TRACK_DEFAULTS.map((d, i) => makeEmptyCell(i, d.synthType, d.note))
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
