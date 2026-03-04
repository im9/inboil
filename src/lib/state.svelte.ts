// Mock state — no WASM, JS clock only
import {
  SCALE_DEGREES_SET,
  PIANO_ROLL_MIN, PIANO_ROLL_MAX,
  DEFAULT_EFFECTS, DEFAULT_FX_PAD, DEFAULT_PERF,
} from './constants.ts'
import {
  DRUM_SYNTHS, makeTrig, makeDefaultSong,
} from './factory.ts'

export { NOTE_NAMES } from './constants.ts'
export { FACTORY_COUNT } from './factory.ts'

export type SynthType = 'DrumSynth' | 'NoiseSynth' | 'AnalogSynth' | 'FMSynth' | 'Sampler' | 'ChordSynth'

export interface Trig {
  active: boolean
  note: number      // MIDI note (60 = C4) — used by melodic tracks
  velocity: number  // 0.0–1.0
  duration: number  // step count 1-16 (default 1)
  slide: boolean    // slide/glide to next note (default false)
  chance?: number   // 0.0–1.0, undefined = always fire (100%)
  paramLocks?: Record<string, number>  // per-step voice param overrides (P-Lock)
}

/** Single-track step sequence (ADR 032) */
export interface Phrase {
  id: number
  name: string            // max 6 chars
  steps: number           // 1–64
  trigs: Trig[]           // length === steps; index 0 = step 1
  voiceParams: Record<string, number>  // per-voice tunable parameters
  reverbSend: number      // 0.0–1.0
  delaySend: number       // 0.0–1.0
  glitchSend: number      // 0.0–1.0
  granularSend: number    // 0.0–1.0
}

/** Phrase reference within a Chain */
export interface ChainPhraseRef {
  phraseId: number        // reference to Phrase.id in same track
  transpose: number       // semitone offset (-24 to +24)
}

/** Ordered list of phrase references for one track */
export interface Chain {
  id: number              // 0-based, scoped per track
  entries: ChainPhraseRef[]  // max 16
}

export interface Track {
  id: number
  name: string
  synthType: SynthType
  muted: boolean
  volume: number
  pan: number
  phrases: Phrase[]       // pool (max 128 per track)
  chains: Chain[]         // pool (max 128 per track)
}

export interface Effects {
  reverb: { size: number; damp: number }
  delay:  { time: number; feedback: number }  // time = beat fraction (0.75 = dotted 8th)
  ducker: { depth: number; release: number }  // depth 0-1, release ms
  comp:   { threshold: number; ratio: number; makeup: number }
}

export interface ChainFx {
  on: boolean
  x: number
  y: number
}

/** Song row = which chain to play per track at this position */
export interface SongRow {
  chainIds: (number | null)[]  // 8 entries, one per track (null = skip)
  repeats: number              // 1–16
  key?: number                 // root note override (0–11)
  oct?: number                 // octave override
  perf?: number                // 0=NONE, 1=FILL, 2=BRK, 3=REV
  perfLen?: number             // steps (1/4/8/16)
  verb?: ChainFx
  delay?: ChainFx
  glitch?: ChainFx
  granular?: ChainFx
}

/** Song = top-level arrangement (replaces Pattern + PatternBank) */
export interface Song {
  name: string
  bpm: number
  rootNote: number        // 0–11
  tracks: Track[]         // 8 tracks
  rows: SongRow[]         // up to 256 rows
}

/** Get the active phrase for a track (based on ui.activePhrases) */
export function activePhrase(trackId: number): Phrase {
  return song.tracks[trackId].phrases[ui.activePhrases[trackId]]
}

// ── Undo ─────────────────────────────────────────────────────────────

function clonePhrase(ph: Phrase): Phrase {
  return {
    id: ph.id, name: ph.name, steps: ph.steps,
    voiceParams: { ...ph.voiceParams },
    reverbSend: ph.reverbSend, delaySend: ph.delaySend,
    glitchSend: ph.glitchSend, granularSend: ph.granularSend,
    trigs: ph.trigs.map(tr => ({
      active: tr.active, note: tr.note, velocity: tr.velocity,
      duration: tr.duration, slide: tr.slide,
      ...(tr.chance != null ? { chance: tr.chance } : {}),
      ...(tr.paramLocks && Object.keys(tr.paramLocks).length > 0
        ? { paramLocks: { ...tr.paramLocks } } : {}),
    })),
  }
}

function cloneChain(ch: Chain): Chain {
  return { id: ch.id, entries: ch.entries.map(e => ({ ...e })) }
}

function cloneTrack(t: Track): Track {
  return {
    id: t.id, name: t.name, synthType: t.synthType,
    muted: t.muted, volume: t.volume, pan: t.pan,
    phrases: t.phrases.map(clonePhrase),
    chains: t.chains.map(cloneChain),
  }
}

function cloneRow(r: SongRow): SongRow {
  return {
    chainIds: [...r.chainIds], repeats: r.repeats,
    ...(r.key != null ? { key: r.key } : {}),
    ...(r.oct != null ? { oct: r.oct } : {}),
    ...(r.perf != null ? { perf: r.perf } : {}),
    ...(r.perfLen != null ? { perfLen: r.perfLen } : {}),
    ...(r.verb ? { verb: { ...r.verb } } : {}),
    ...(r.delay ? { delay: { ...r.delay } } : {}),
    ...(r.glitch ? { glitch: { ...r.glitch } } : {}),
    ...(r.granular ? { granular: { ...r.granular } } : {}),
  }
}

function cloneSong(): Song {
  return {
    name: song.name,
    bpm: song.bpm,
    rootNote: song.rootNote,
    tracks: song.tracks.map(cloneTrack),
    rows: song.rows.map(cloneRow),
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
  song.tracks = src.tracks.map(t => ({
    ...t,
    phrases: (t.phrases ?? []).map(ph => ({
      ...ph,
      voiceParams: { ...ph.voiceParams },
      trigs: ph.trigs.map(tr => ({
        ...tr,
        duration: tr.duration ?? 1,
        slide: tr.slide ?? false,
        ...(tr.paramLocks ? { paramLocks: { ...tr.paramLocks } } : {}),
      })),
    })),
    chains: (t.chains ?? []).map(ch => ({ ...ch, entries: ch.entries.map(e => ({ ...e })) })),
  }))
  song.rows = (src.rows ?? []).map(cloneRow)
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
})

export const ui = $state({
  selectedTrack: 0,
  view: 'grid' as 'grid' | 'fx' | 'eq' | 'chain',
  sidebar: null as 'help' | 'system' | null,
  lockMode: false,
  selectedStep: null as number | null,
  soloTracks: new Set<number>(),
  dockTab: 'param' as 'param' | 'help' | 'sys',
  dockPosition: 'right' as 'right' | 'bottom',
  mobileOverlay: false,
  activePhrases: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
})

/** Select a phrase set — all tracks switch to the same phrase index */
export function selectPhraseSet(index: number): void {
  const max = song.tracks.reduce((m, t) => Math.min(m, t.phrases.length), Infinity)
  if (index < 0 || index >= max) return
  for (let i = 0; i < 8; i++) ui.activePhrases[i] = index
}

/** Get the name of the currently active phrase set (first track's phrase name) */
export function getActivePhraseSetName(): string {
  return song.tracks[0]?.phrases[ui.activePhrases[0]]?.name ?? ''
}

export const PHRASE_SET_COUNT = $derived.by(() =>
  song.tracks.reduce((m, t) => Math.min(m, t.phrases.length), Infinity)
)

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
      // Migrate legacy key
      const legacyLang = localStorage.getItem('inboil-lang')
      if (legacyLang) {
        defaults.lang = legacyLang as Lang
        localStorage.removeItem('inboil-lang')
      }
      return defaults
    }
    const parsed = JSON.parse(raw)
    if (parsed.v !== STORAGE_VERSION) return defaults  // schema mismatch → reset
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

// Apply persisted dock position
ui.dockPosition = initialPrefs.dockPosition

// First visit → show help sidebar
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
  const ph = activePhrase(trackId)
  ph.trigs[stepIndex].active = !ph.trigs[stepIndex].active
}

export function setTrigVelocity(trackId: number, stepIdx: number, v: number) {
  pushUndo('Set velocity')
  activePhrase(trackId).trigs[stepIdx].velocity = Math.max(0.05, Math.min(1, v))
}

/** For piano roll: click cell sets note + activates; click same note deactivates */
export function setTrigNote(trackId: number, stepIndex: number, note: number) {
  pushUndo('Set note')
  const trig = activePhrase(trackId).trigs[stepIndex]
  if (trig.active && trig.note === note) {
    trig.active = false
  } else {
    trig.active = true
    trig.note = note
  }
}

export function setTrigDuration(trackId: number, stepIdx: number, dur: number) {
  pushUndo('Set duration')
  activePhrase(trackId).trigs[stepIdx].duration = Math.max(1, Math.min(16, Math.round(dur)))
}

export function setTrigSlide(trackId: number, stepIdx: number, slide: boolean) {
  pushUndo('Set slide')
  activePhrase(trackId).trigs[stepIdx].slide = slide
}

export function setTrigChance(trackId: number, stepIdx: number, chance: number) {
  pushUndo('Set chance')
  const v = Math.max(0, Math.min(1, chance))
  activePhrase(trackId).trigs[stepIdx].chance = v >= 1 ? undefined : v
}

/** Place a note bar: set head trig + clear covered steps */
export function placeNoteBar(trackId: number, startStep: number, note: number, duration: number) {
  pushUndo('Place note')
  const ph = activePhrase(trackId)
  const dur = Math.max(1, Math.min(ph.steps - startStep, Math.min(16, duration)))
  ph.trigs[startStep].active = true
  ph.trigs[startStep].note = note
  ph.trigs[startStep].duration = dur
  for (let d = 1; d < dur; d++) {
    const idx = startStep + d
    if (idx < ph.steps) ph.trigs[idx].active = false
  }
}

/** Find the head step of a note bar that covers the given step/note */
export function findNoteHead(trackId: number, stepIdx: number, note: number): number {
  const trigs = activePhrase(trackId).trigs
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
  const ph = activePhrase(trackId)
  const old = ph.steps
  if (clamped === old) return
  if (clamped > old) {
    const lastNote = ph.trigs[old - 1]?.note ?? 60
    for (let i = old; i < clamped; i++) {
      ph.trigs.push(makeTrig(false, lastNote))
    }
  } else {
    ph.trigs.splice(clamped)
  }
  ph.steps = clamped
}

export function setTrackSend(trackId: number, send: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend', v: number) {
  pushUndo('Set send')
  activePhrase(trackId)[send] = Math.min(1, Math.max(0, v))
}

export function setVoiceParam(trackId: number, key: string, value: number) {
  pushUndo('Set param')
  activePhrase(trackId).voiceParams[key] = value
}

export function setParamLock(trackId: number, stepIdx: number, key: string, value: number) {
  pushUndo('Set P-Lock')
  const trig = activePhrase(trackId).trigs[stepIdx]
  if (!trig.paramLocks) trig.paramLocks = {}
  trig.paramLocks[key] = value
}

export function clearParamLock(trackId: number, stepIdx: number, key: string) {
  pushUndo('Clear P-Lock')
  const trig = activePhrase(trackId).trigs[stepIdx]
  if (!trig.paramLocks) return
  delete trig.paramLocks[key]
  if (Object.keys(trig.paramLocks).length === 0) trig.paramLocks = undefined
}

export function clearAllParamLocks(trackId: number, stepIdx: number) {
  pushUndo('Clear all P-Locks')
  activePhrase(trackId).trigs[stepIdx].paramLocks = undefined
}

// ── Factory reset ────────────────────────────────────────────────────

export function factoryReset(): void {
  // Reset song to default
  restoreSong(makeDefaultSong())
  // Reset active phrases
  for (let i = 0; i < 8; i++) ui.activePhrases[i] = 0
  // Reset perf
  Object.assign(perf, DEFAULT_PERF)
  perf.rootNote = song.rootNote
  // Reset UI
  ui.selectedTrack = 0
  ui.view = 'grid'
  ui.sidebar = null
  ui.lockMode = false
  ui.selectedStep = null
  ui.dockTab = 'param'
  ui.dockPosition = 'right'
  ui.mobileOverlay = false
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
  // Reset song playback
  songPlay.active = false
  songPlay.currentRow = 0
  songPlay.repeatCount = 0
  songPlay.playingPhraseSet = -1
  // Reset prefs (keep lang)
  prefs.scaleMode = true
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
  }
  prefs.visited = true
  savePrefs()
}

// ── Randomize ────────────────────────────────────────────────────────

// Scale intervals (semitones from root)
const SCALES = [
  [0, 3, 5, 7, 10],        // minor pentatonic
  [0, 2, 4, 7, 9],         // major pentatonic
  [0, 2, 3, 5, 7, 9, 10],  // dorian
]

// ── Song Playback (replaces old Pattern Chain) ───────────────────────

// Song rows use the same SongRow interface defined above.
// Each row references chains per-track, plus perf/FX overrides.
// The songPlay state tracks playback position within the song.

export const songPlay = $state({
  active: false,
  currentRow: 0,
  repeatCount: 0,
  playingPhraseSet: -1 as number,  // which phrase set index is currently playing (-1 = none)
})

/** Get the phrase set index from a song row (assumes all chainIds are equal for now) */
function rowToPhraseSet(row: SongRow): number {
  return row.chainIds[0] ?? 0
}

// ── Song row presets ────────────────────────────────────────────────

function makeSongRow(phraseSet: number, repeats = 2, opts?: {
  key?: number, oct?: number, perf?: number, perfLen?: number,
  verb?: boolean, delay?: boolean, glitch?: boolean, granular?: boolean,
  delaySend?: number,
}): SongRow {
  return {
    chainIds: Array(8).fill(phraseSet),
    repeats, key: opts?.key, oct: opts?.oct,
    perf: opts?.perf ?? 0, perfLen: opts?.perfLen ?? 16,
    ...(opts?.verb     ? { verb:     { on: true,  x: 0.25, y: 0.65 } } : {}),
    ...(opts?.delay    ? { delay:    { on: true,  x: opts?.delaySend ?? 0.70, y: 0.40 } } : {}),
    ...(opts?.glitch   ? { glitch:   { on: true,  x: 0.45, y: 0.15 } } : {}),
    ...(opts?.granular ? { granular: { on: true,  x: 0.50, y: 0.30 } } : {}),
  }
}

// Phrase set indices (0-based): 0=4FLOOR 1=TRAP 2=BREAK 3=2STEP 4=LOFI
// 5=TECHNO 6=HOUSE 7=DNB 8=HYPER 9=MINIMAL 10=REGGAETN 11=DISCO
// 12=ELECTRO 13=DUBSTEP 14=DRILL 15=SYNTHWV 16=AFROBT 17=JERSEY
// 18=GARAGE 19=AMBIENT 20=LF.B

export const SONG_PRESETS = [
  { name: 'LOFI',
    rows: [
      makeSongRow(4, 2, { key: 0 }),
      makeSongRow(4, 2, { verb: true }),
      makeSongRow(20, 4, { verb: true, delay: true }),
      makeSongRow(4, 4, { verb: true, glitch: true }),
      makeSongRow(20, 4, { key: 0, verb: true, delay: true, glitch: true }),
      makeSongRow(4, 4, { key: 4, perf: 2, perfLen: 4, verb: true, glitch: true, delay: true, delaySend: 1.0 }),
      makeSongRow(20, 4, { perf: 1, perfLen: 8, verb: true, glitch: true, granular: true, delay: true, delaySend: 1.0 }),
      makeSongRow(4, 4, { verb: true, glitch: true, granular: true, delay: true, delaySend: 1.0 }),
    ] },
]

export function songLoadPreset(index: number) {
  const preset = SONG_PRESETS[index]
  if (!preset) return
  song.rows = preset.rows.map(cloneRow)
  songPlay.currentRow = 0
  songPlay.repeatCount = 0
  songPlay.active = false
  songPlay.playingPhraseSet = -1
}

// Pre-populate with LOFI preset rows
songLoadPreset(0)

export function songAppendRow(phraseSetIndex: number) {
  if (song.rows.length >= 256) return
  song.rows.push({
    chainIds: Array(8).fill(phraseSetIndex),
    repeats: 1,
  })
}

export function songRemoveRow(index: number) {
  song.rows.splice(index, 1)
  if (songPlay.currentRow >= song.rows.length) songPlay.currentRow = 0
}

export function songClearRows() {
  if (songPlay.active) {
    perf.filling = false; perf.breaking = false; perf.reversing = false
    fxPad.verb     = { ...fxPad.verb, on: false }
    fxPad.delay    = { ...fxPad.delay, on: false }
    fxPad.glitch   = { ...fxPad.glitch, on: false }
    fxPad.granular = { ...fxPad.granular, on: false }
  }
  song.rows = []
  songPlay.currentRow = 0
  songPlay.repeatCount = 0
  songPlay.active = false
  songPlay.playingPhraseSet = -1
}

export function songSetRowPhraseSet(index: number, phraseSet: number) {
  const max = song.tracks.reduce((m, t) => Math.min(m, t.phrases.length), Infinity)
  if (phraseSet < 0 || phraseSet >= max) return
  song.rows[index].chainIds = Array(8).fill(phraseSet)
}

export function songStepRepeats(index: number, dir: -1 | 1) {
  const r = song.rows[index]
  r.repeats = Math.max(1, Math.min(8, r.repeats + dir))
}

export function songCycleKey(index: number) {
  const r = song.rows[index]
  if (r.key == null) { r.key = 0 }
  else if (r.key >= 11) { r.key = undefined }
  else { r.key++ }
}

export function songSetKey(index: number, key: number | undefined) {
  song.rows[index].key = key
}

export function songCycleOct(index: number) {
  const r = song.rows[index]
  if (r.oct == null) { r.oct = -2 }
  else if (r.oct >= 2) { r.oct = undefined }
  else { r.oct++ }
}

export function songCyclePerf(index: number) {
  song.rows[index].perf = ((song.rows[index].perf ?? 0) + 1) % 4
}

const PERF_LEN_OPTIONS = [16, 8, 4, 1] as const

export function songCyclePerfLen(index: number) {
  const r = song.rows[index]
  const cur = PERF_LEN_OPTIONS.indexOf((r.perfLen ?? 16) as 16 | 8 | 4 | 1)
  r.perfLen = PERF_LEN_OPTIONS[(cur + 1) % PERF_LEN_OPTIONS.length]
}

export type SongFxKey = 'verb' | 'delay' | 'glitch' | 'granular'

export function songToggleFx(index: number, fx: SongFxKey) {
  const r = song.rows[index]
  const current = r[fx]
  if (current) {
    current.on = !current.on
  } else {
    r[fx] = { on: true, x: 0.5, y: 0.5 }
  }
}

export function songSetFxSend(index: number, fx: SongFxKey, value: number) {
  const r = song.rows[index]
  if (!r[fx]) r[fx] = { on: true, x: value, y: 0.5 }
  else r[fx]!.x = value
}

/** Apply FX and key/oct for a song row (called on row advance) */
export function applySongRow(row: SongRow) {
  if (row.key != null) perf.rootNote = row.key
  if (row.oct != null) perf.octave = row.oct
  fxPad.verb = row.verb?.on
    ? { on: true, x: row.verb.x, y: row.verb.y }
    : { ...fxPad.verb, on: false }
  fxPad.delay = row.delay?.on
    ? { on: true, x: row.delay.x, y: row.delay.y }
    : { ...fxPad.delay, on: false }
  fxPad.glitch = row.glitch?.on
    ? { on: true, x: row.glitch.x, y: row.glitch.y }
    : { ...fxPad.glitch, on: false }
  fxPad.granular = row.granular?.on
    ? { on: true, x: row.granular.x, y: row.granular.y }
    : { ...fxPad.granular, on: false }
}

/** Apply perf on last repeat of a song row */
export function updateSongPerf(step: number): boolean {
  if (!songPlay.active || song.rows.length === 0) return false
  const row = song.rows[songPlay.currentRow]
  const isLast = songPlay.repeatCount >= row.repeats - 1
  const perfLen = row.perfLen ?? 16
  const perfType = row.perf ?? 0
  const inZone = isLast && step >= (16 - perfLen - 1)
  const f = perfType === 1 && inZone
  const b = perfType === 2 && inZone
  const r = perfType === 3 && inZone
  const changed = perf.filling !== f || perf.breaking !== b || perf.reversing !== r
  perf.filling = f; perf.breaking = b; perf.reversing = r
  return changed
}

export function songToggle() {
  songPlay.active = !songPlay.active
  if (songPlay.active && song.rows.length > 0) {
    songPlay.repeatCount = 0
    const row = song.rows[songPlay.currentRow]
    songPlay.playingPhraseSet = rowToPhraseSet(row)
    applySongRow(row)
  } else if (!songPlay.active) {
    perf.filling = false; perf.breaking = false; perf.reversing = false
    fxPad.verb     = { ...fxPad.verb, on: false }
    fxPad.delay    = { ...fxPad.delay, on: false }
    fxPad.glitch   = { ...fxPad.glitch, on: false }
    fxPad.granular = { ...fxPad.granular, on: false }
    songPlay.playingPhraseSet = -1
  }
}

export function songRewind() {
  songPlay.currentRow = 0
  songPlay.repeatCount = 0
  if (songPlay.active && song.rows.length > 0) {
    const row = song.rows[0]
    songPlay.playingPhraseSet = rowToPhraseSet(row)
    applySongRow(row)
  }
}

export function songJump(index: number) {
  if (index < 0 || index >= song.rows.length) return
  songPlay.currentRow = index
  songPlay.repeatCount = 0
  if (songPlay.active) {
    const row = song.rows[index]
    songPlay.playingPhraseSet = rowToPhraseSet(row)
    applySongRow(row)
  }
}

/** Called at beat boundary. Returns true if advanced to a new row. */
export function advanceSong(): boolean {
  if (!songPlay.active || song.rows.length === 0) return false
  songPlay.repeatCount++
  if (songPlay.repeatCount >= song.rows[songPlay.currentRow].repeats) {
    songPlay.currentRow = (songPlay.currentRow + 1) % song.rows.length
    songPlay.repeatCount = 0
    const row = song.rows[songPlay.currentRow]
    songPlay.playingPhraseSet = rowToPhraseSet(row)
    return true
  }
  return false
}

/** Build a Song-like object for the engine — picks phrases based on phrase set index */
export function songForPlayback(phraseSet: number): Song {
  return {
    name: song.name,
    bpm: song.bpm,
    rootNote: song.rootNote,
    tracks: song.tracks.map(t => ({
      ...t,
      phrases: [t.phrases[phraseSet] ?? t.phrases[0]],
      chains: [],
    })),
    rows: [],
  }
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
    const ph = activePhrase(t)
    const steps = ph.steps

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
        ph.trigs[s].active   = active
        ph.trigs[s].velocity = 0.55 + Math.random() * 0.45
        ph.trigs[s].chance = active && prob < 0.5 ? 0.5 + Math.random() * 0.4 : undefined
      }
    } else {
      const pool    = track.name === 'BASS'
        ? (lowNotes.length  > 0 ? lowNotes  : allNotes)
        : (highNotes.length > 0 ? highNotes : allNotes)
      const density = track.name === 'BASS' ? 0.30 : 0.27

      for (let s = 0; s < steps; s++) {
        const active = Math.random() < density
        ph.trigs[s].active   = active
        ph.trigs[s].note     = active
          ? pool[Math.floor(Math.random() * pool.length)]
          : ph.trigs[s].note
        ph.trigs[s].velocity = active ? 0.55 + Math.random() * 0.45 : ph.trigs[s].velocity
      }
    }
  }
}
