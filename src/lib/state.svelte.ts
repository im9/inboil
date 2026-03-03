// Mock state — no WASM, JS clock only
import {
  SCALE_DEGREES_SET,
  PIANO_ROLL_MIN, PIANO_ROLL_MAX,
  DEFAULT_EFFECTS, DEFAULT_FX_PAD, DEFAULT_PERF,
} from './constants.ts'
import {
  DRUM_SYNTHS, makeTrig, makeEmptyPattern,
  makeFactoryPattern, FACTORY_COUNT,
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

export interface Track {
  id: number
  name: string
  synthType: SynthType
  steps: number        // 1–64
  trigs: Trig[]        // length === steps; index 0 = step 1
  muted: boolean
  volume: number
  pan: number
  reverbSend: number   // 0.0–1.0
  delaySend: number    // 0.0–1.0
  glitchSend: number   // 0.0–1.0
  granularSend: number // 0.0–1.0
  voiceParams: Record<string, number>  // per-voice tunable parameters
}

export interface Effects {
  reverb: { size: number; damp: number }
  delay:  { time: number; feedback: number }  // time = beat fraction (0.75 = dotted 8th)
  ducker: { depth: number; release: number }  // depth 0-1, release ms
  comp:   { threshold: number; ratio: number; makeup: number }
}

export interface Pattern {
  id: number
  name: string
  bpm: number
  rootNote: number   // 0–11 (C=0, C#=1, ..., B=11)
  tracks: Track[]
}

export const PATTERN_COUNT = 100

// ── Undo ─────────────────────────────────────────────────────────────

function clonePattern(): Pattern {
  return {
    id: pattern.id,
    name: pattern.name,
    bpm: pattern.bpm,
    rootNote: pattern.rootNote,
    tracks: pattern.tracks.map(t => ({
      id: t.id, name: t.name, synthType: t.synthType,
      steps: t.steps, muted: t.muted, volume: t.volume,
      pan: t.pan,
      reverbSend: t.reverbSend, delaySend: t.delaySend,
      glitchSend: t.glitchSend, granularSend: t.granularSend,
      voiceParams: { ...t.voiceParams },
      trigs: t.trigs.map(tr => ({
        active: tr.active, note: tr.note, velocity: tr.velocity,
        duration: tr.duration, slide: tr.slide,
        ...(tr.chance != null ? { chance: tr.chance } : {}),
        ...(tr.paramLocks && Object.keys(tr.paramLocks).length > 0
          ? { paramLocks: { ...tr.paramLocks } } : {}),
      })),
    })),
  }
}

interface UndoEntry { snapshot: Pattern; label: string }
const undoStack: UndoEntry[] = []
const redoStack: UndoEntry[] = []
const UNDO_MAX = 50
let lastPushTime = 0
let lastPushLabel = ''

function pushUndo(label: string): void {
  const now = Date.now()
  if (label === lastPushLabel && now - lastPushTime < 500) {
    // debounce: replace last entry
    return
  }
  undoStack.push({ snapshot: clonePattern(), label })
  if (undoStack.length > UNDO_MAX) undoStack.shift()
  redoStack.length = 0
  lastPushTime = now
  lastPushLabel = label
}

function restorePattern(src: Pattern): void {
  pattern.id = src.id
  pattern.name = src.name
  pattern.bpm = src.bpm
  pattern.rootNote = src.rootNote ?? 0
  pattern.tracks = src.tracks.map(t => ({
    ...t,
    trigs: t.trigs.map(tr => ({
      ...tr,
      duration: tr.duration ?? 1,
      slide: tr.slide ?? false,
      ...(tr.paramLocks ? { paramLocks: { ...tr.paramLocks } } : {}),
    })),
    voiceParams: { ...t.voiceParams },
  }))
}

export function undo(): boolean {
  const entry = undoStack.pop()
  if (!entry) return false
  redoStack.push({ snapshot: clonePattern(), label: entry.label })
  restorePattern(entry.snapshot)
  lastPushLabel = ''
  return true
}

export function redo(): boolean {
  const entry = redoStack.pop()
  if (!entry) return false
  undoStack.push({ snapshot: clonePattern(), label: entry.label })
  restorePattern(entry.snapshot)
  lastPushLabel = ''
  return true
}

// ── Reactive state ───────────────────────────────────────────────────

export const pattern = $state<Pattern>(makeFactoryPattern(1))

// Pattern bank: slots 0–9 = factory presets, slots 10–99 = user (empty)
const patternBank: Pattern[] = [
  ...Array.from({ length: FACTORY_COUNT }, (_, i) => makeFactoryPattern(i + 1)),
  ...Array.from({ length: PATTERN_COUNT - FACTORY_COUNT }, (_, i) => makeEmptyPattern(i + FACTORY_COUNT + 1)),
]

function saveToBank(): void {
  pattern.rootNote = perf.rootNote  // capture live key tweak into pattern
  patternBank[pattern.id - 1] = clonePattern()
}

function loadFromBank(idx: number): void {
  restorePattern(patternBank[idx])
  perf.rootNote = pattern.rootNote  // sync KEY selector to loaded pattern
}

export const patternNav = $state({ pendingId: 0 })

// ── Pattern clipboard (copy / paste / clear) ──────────────────────────
let clipboardPattern: Pattern | null = null
export const clipboard = $state({ hasData: false })

export function copyPattern(): void {
  clipboard.hasData = true
  clipboardPattern = clonePattern()
}

export function pastePattern(targetId: number): void {
  if (!clipboardPattern) return
  if (targetId < 1 || targetId > PATTERN_COUNT) return
  pushUndo('Paste pattern')
  const src = clipboardPattern
  patternBank[targetId - 1] = {
    id: targetId,
    name: src.name,
    bpm: src.bpm,
    rootNote: src.rootNote,
    tracks: src.tracks.map(t => ({
      ...t,
      voiceParams: { ...t.voiceParams },
      trigs: t.trigs.map(tr => ({
        ...tr,
        ...(tr.paramLocks ? { paramLocks: { ...tr.paramLocks } } : {}),
      })),
    })),
  }
  if (targetId === pattern.id) loadFromBank(targetId - 1)
}

export function clearPattern(targetId: number): void {
  if (targetId < 1 || targetId > PATTERN_COUNT) return
  pushUndo('Clear pattern')
  patternBank[targetId - 1] = makeEmptyPattern(targetId)
  if (targetId === pattern.id) loadFromBank(targetId - 1)
}

export function getPatternName(id: number): string {
  return patternBank[id - 1]?.name ?? ''
}

export function switchPattern(id: number): void {
  if (id < 1 || id > PATTERN_COUNT) return
  if (id === pattern.id) { patternNav.pendingId = 0; return }
  if (playback.playing) {
    patternNav.pendingId = id
  } else {
    saveToBank()
    loadFromBank(id - 1)
  }
}

/** Apply any pending pattern switch (called at beat boundary or on stop) */
export function applyPendingSwitch(): void {
  if (patternNav.pendingId > 0) {
    const id = patternNav.pendingId
    patternNav.pendingId = 0
    saveToBank()
    loadFromBank(id - 1)
  }
}

/** Alias for applyPendingSwitch — called on stop to apply immediately */
export const clearPendingSwitch = applyPendingSwitch

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
})

// ── Persisted preferences (single localStorage key) ─────────────────
const STORAGE_KEY = 'inboil'
const STORAGE_VERSION = 1

interface StoredPrefs {
  v: number
  lang: Lang
  visited: boolean
  scaleMode: boolean
}

function loadPrefs(): StoredPrefs {
  const defaults: StoredPrefs = { v: STORAGE_VERSION, lang: 'ja', visited: false, scaleMode: true }
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
  }))
}

const initialPrefs = loadPrefs()

export type Lang = 'ja' | 'en'
export const lang = $state({ value: initialPrefs.lang })
export const prefs = $state({
  visited: initialPrefs.visited,
  scaleMode: initialPrefs.scaleMode,
})

// First visit → show help sidebar
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
  pattern.tracks[trackId].trigs[stepIndex].active =
    !pattern.tracks[trackId].trigs[stepIndex].active
}

export function setTrigVelocity(trackId: number, stepIdx: number, v: number) {
  pushUndo('Set velocity')
  pattern.tracks[trackId].trigs[stepIdx].velocity = Math.max(0.05, Math.min(1, v))
}

/** For piano roll: click cell sets note + activates; click same note deactivates */
export function setTrigNote(trackId: number, stepIndex: number, note: number) {
  pushUndo('Set note')
  const trig = pattern.tracks[trackId].trigs[stepIndex]
  if (trig.active && trig.note === note) {
    trig.active = false
  } else {
    trig.active = true
    trig.note = note
  }
}

export function setTrigDuration(trackId: number, stepIdx: number, dur: number) {
  pushUndo('Set duration')
  pattern.tracks[trackId].trigs[stepIdx].duration = Math.max(1, Math.min(16, Math.round(dur)))
}

export function setTrigSlide(trackId: number, stepIdx: number, slide: boolean) {
  pushUndo('Set slide')
  pattern.tracks[trackId].trigs[stepIdx].slide = slide
}

export function setTrigChance(trackId: number, stepIdx: number, chance: number) {
  pushUndo('Set chance')
  const v = Math.max(0, Math.min(1, chance))
  pattern.tracks[trackId].trigs[stepIdx].chance = v >= 1 ? undefined : v
}

/** Place a note bar: set head trig + clear covered steps */
export function placeNoteBar(trackId: number, startStep: number, note: number, duration: number) {
  pushUndo('Place note')
  const trigs = pattern.tracks[trackId].trigs
  const steps = pattern.tracks[trackId].steps
  const dur = Math.max(1, Math.min(steps - startStep, Math.min(16, duration)))
  trigs[startStep].active = true
  trigs[startStep].note = note
  trigs[startStep].duration = dur
  for (let d = 1; d < dur; d++) {
    const idx = startStep + d
    if (idx < steps) trigs[idx].active = false
  }
}

/** Find the head step of a note bar that covers the given step/note */
export function findNoteHead(trackId: number, stepIdx: number, note: number): number {
  const trigs = pattern.tracks[trackId].trigs
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
  pattern.tracks[trackId].muted = !pattern.tracks[trackId].muted
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
  const track = pattern.tracks[trackId]
  const old = track.steps
  if (clamped === old) return
  if (clamped > old) {
    const lastNote = track.trigs[old - 1]?.note ?? 60
    for (let i = old; i < clamped; i++) {
      track.trigs.push(makeTrig(false, lastNote))
    }
  } else {
    track.trigs.splice(clamped)
  }
  track.steps = clamped
}

export function setTrackSend(trackId: number, send: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend', v: number) {
  pushUndo('Set send')
  pattern.tracks[trackId][send] = Math.min(1, Math.max(0, v))
}

export function setVoiceParam(trackId: number, key: string, value: number) {
  pushUndo('Set param')
  pattern.tracks[trackId].voiceParams[key] = value
}

export function setParamLock(trackId: number, stepIdx: number, key: string, value: number) {
  pushUndo('Set P-Lock')
  const trig = pattern.tracks[trackId].trigs[stepIdx]
  if (!trig.paramLocks) trig.paramLocks = {}
  trig.paramLocks[key] = value
}

export function clearParamLock(trackId: number, stepIdx: number, key: string) {
  pushUndo('Clear P-Lock')
  const trig = pattern.tracks[trackId].trigs[stepIdx]
  if (!trig.paramLocks) return
  delete trig.paramLocks[key]
  if (Object.keys(trig.paramLocks).length === 0) trig.paramLocks = undefined
}

export function clearAllParamLocks(trackId: number, stepIdx: number) {
  pushUndo('Clear all P-Locks')
  pattern.tracks[trackId].trigs[stepIdx].paramLocks = undefined
}


// ── Factory reset ────────────────────────────────────────────────────

export function factoryReset(): void {
  // Reset pattern bank
  for (let i = 0; i < FACTORY_COUNT; i++) {
    patternBank[i] = makeFactoryPattern(i + 1)
  }
  for (let i = FACTORY_COUNT; i < PATTERN_COUNT; i++) {
    patternBank[i] = makeEmptyPattern(i + 1)
  }
  // Reset perf before load (loadFromBank sets perf.rootNote from pattern)
  Object.assign(perf, DEFAULT_PERF)
  // Load pattern 1
  loadFromBank(0)
  patternNav.pendingId = 0
  // Reset UI
  ui.selectedTrack = 0
  ui.view = 'grid'
  ui.sidebar = null
  ui.lockMode = false
  ui.selectedStep = null
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
  // Reset chain
  chain.entries.length = 0
  chain.active = false
  chain.currentIndex = 0
  chain.repeatCount = 0
  chain.playingPatternId = 0
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

// ── Pattern Chain ─────────────────────────────────────────────────────

// Perf types: 0=NONE, 1=FILL, 2=BRK, 3=REV

export interface ChainFx {
  on: boolean
  x: number
  y: number
}

export interface ChainEntry {
  patternId: number
  repeats: number
  key: number | null  // 0–11 override, null = use pattern's rootNote
  oct: number | null  // -2 to +2 override, null = use current perf.octave
  perf: number        // 0=NONE, 1=FILL, 2=BRK, 3=REV
  perfLen: number     // steps (1/4/8/16) — perf activates for last N steps of last repeat
  verb: ChainFx
  delay: ChainFx
  glitch: ChainFx
  granular: ChainFx
}

export const chain = $state({
  entries: [] as ChainEntry[],
  active: false,
  currentIndex: 0,
  repeatCount: 0,
  playingPatternId: 0,
})

/** Read pattern data from bank without modifying editing state */
export function getPatternData(id: number): Pattern {
  return patternBank[id - 1]
}

// ── Chain presets ──────────────────────────────────────────────────────
// Pattern IDs are 1-indexed: 1=4FLOOR 2=TRAP 3=BREAK 4=2STEP 5=LOFI
// 6=TECHNO 7=HOUSE 8=DNB 9=HYPER 10=MINIMAL 11=REGGAETN 12=DISCO
// 13=ELECTRO 14=DUBSTEP 15=DRILL 16=SYNTHWV 17=AFROBT 18=JERSEY
// 19=GARAGE 20=AMBIENT

function makeChainEntry(patternId: number, repeats = 2, opts?: {
  key?: number, oct?: number, perf?: number, perfLen?: number,
  verb?: boolean, delay?: boolean, glitch?: boolean, granular?: boolean,
  delaySend?: number,
}): ChainEntry {
  return {
    patternId, repeats, key: opts?.key ?? null, oct: opts?.oct ?? null,
    perf: opts?.perf ?? 0, perfLen: opts?.perfLen ?? 16,
    verb:     { on: opts?.verb ?? false,     x: 0.25, y: 0.65 },
    delay:    { on: opts?.delay ?? false,    x: opts?.delaySend ?? 0.70, y: 0.40 },
    glitch:   { on: opts?.glitch ?? false,   x: 0.45, y: 0.15 },
    granular: { on: opts?.granular ?? false, x: 0.50, y: 0.30 },
  }
}

export const CHAIN_PRESETS = [
  // LOFI(5)+LF.B(21) 85bpm key=G — lo-fi song with A/B sections
  { name: 'LOFI',
    entries: [
      makeChainEntry(5, 2, { key: 0 }),                      // 01 intro: A key=C ×2
      makeChainEntry(5, 2, { verb: true }),                  // 02 verse 1: A +VRB ×2
      makeChainEntry(21, 4, { verb: true, delay: true }),    // 03 chorus 1: B +VRB+DLY ×4
      makeChainEntry(5, 4, { verb: true, glitch: true }),    // 04 verse 2: A +VRB+GLT ×4
      makeChainEntry(21, 4, { key: 0, verb: true, delay: true, glitch: true }),  // 05 chorus 2: B → C +VRB+DLY+GLT ×4
      makeChainEntry(5, 4, { key: 4, perf: 2, perfLen: 4, verb: true, glitch: true, delay: true, delaySend: 1.0 }),  // 06 break: A → Em BRK ¼ +VRB+GLT+DLY max ×4
      makeChainEntry(21, 4, { perf: 1, perfLen: 8, verb: true, glitch: true, granular: true, delay: true, delaySend: 1.0 }),  // 07 climax: B FILL ½ +VRB+GLT+GRN+DLY max ×4
      makeChainEntry(5, 4, { verb: true, glitch: true, granular: true, delay: true, delaySend: 1.0 }),  // 08 outro: A +VRB+GLT+GRN+DLY max ×4
    ] },
] as const

export function chainLoadPreset(index: number) {
  const preset = CHAIN_PRESETS[index]
  if (!preset) return
  chain.entries.length = 0
  for (const e of preset.entries) {
    chain.entries.push({
      patternId: e.patternId, repeats: e.repeats, key: e.key, oct: e.oct, perf: e.perf, perfLen: e.perfLen,
      verb:     { ...e.verb },
      delay:    { ...e.delay },
      glitch:   { ...e.glitch },
      granular: { ...e.granular },
    })
  }
  chain.currentIndex = 0
  chain.repeatCount = 0
  chain.active = false
  chain.playingPatternId = 0
}

// Pre-populate with LOFI preset
chainLoadPreset(0)

export function chainAppend(patternId: number) {
  if (chain.entries.length >= 99) return
  chain.entries.push({
    patternId, repeats: 1, key: null, oct: null, perf: 0, perfLen: 16,
    verb:     { on: false, x: 0.25, y: 0.65 },
    delay:    { on: false, x: 0.70, y: 0.40 },
    glitch:   { on: false, x: 0.45, y: 0.15 },
    granular: { on: false, x: 0.50, y: 0.30 },
  })
}

export function chainRemove(index: number) {
  chain.entries.splice(index, 1)
  if (chain.currentIndex >= chain.entries.length) chain.currentIndex = 0
}

export function chainClear() {
  if (chain.active) {
    perf.filling = false; perf.breaking = false; perf.reversing = false
    fxPad.verb     = { ...fxPad.verb, on: false }
    fxPad.delay    = { ...fxPad.delay, on: false }
    fxPad.glitch   = { ...fxPad.glitch, on: false }
    fxPad.granular = { ...fxPad.granular, on: false }
  }
  chain.entries.length = 0
  chain.currentIndex = 0
  chain.repeatCount = 0
  chain.active = false
  chain.playingPatternId = 0
}

export function chainSetPattern(index: number, patternId: number) {
  if (patternId < 1 || patternId > PATTERN_COUNT) return
  chain.entries[index].patternId = patternId
}

export function chainStepRepeats(index: number, dir: -1 | 1) {
  const e = chain.entries[index]
  e.repeats = Math.max(1, Math.min(8, e.repeats + dir))
}

export function chainCycleKey(index: number) {
  const e = chain.entries[index]
  if (e.key === null) { e.key = 0 }
  else if (e.key >= 11) { e.key = null }
  else { e.key++ }
}

export function chainSetKey(index: number, key: number | null) {
  chain.entries[index].key = key
}

export function chainCycleOct(index: number) {
  const e = chain.entries[index]
  // null → -2 → -1 → 0 → +1 → +2 → null
  if (e.oct === null) { e.oct = -2 }
  else if (e.oct >= 2) { e.oct = null }
  else { e.oct++ }
}

export function chainCyclePerf(index: number) {
  chain.entries[index].perf = (chain.entries[index].perf + 1) % 4
}

const PERF_LEN_OPTIONS = [16, 8, 4, 1] as const

export function chainCyclePerfLen(index: number) {
  const e = chain.entries[index]
  const cur = PERF_LEN_OPTIONS.indexOf(e.perfLen as 16 | 8 | 4 | 1)
  e.perfLen = PERF_LEN_OPTIONS[(cur + 1) % PERF_LEN_OPTIONS.length]
}

export type ChainFxKey = 'verb' | 'delay' | 'glitch' | 'granular'

export function chainToggleFx(index: number, fx: ChainFxKey) {
  chain.entries[index][fx].on = !chain.entries[index][fx].on
}

export function chainSetFxSend(index: number, fx: ChainFxKey, value: number) {
  chain.entries[index][fx].x = value
}

/** Apply FX and key/oct for a chain entry (called on entry advance) */
export function applyChainEntry(entry: ChainEntry) {
  if (entry.key !== null) perf.rootNote = entry.key
  if (entry.oct !== null) perf.octave = entry.oct
  fxPad.verb = entry.verb.on
    ? { on: true, x: entry.verb.x, y: entry.verb.y }
    : { ...fxPad.verb, on: false }
  fxPad.delay = entry.delay.on
    ? { on: true, x: entry.delay.x, y: entry.delay.y }
    : { ...fxPad.delay, on: false }
  fxPad.glitch = entry.glitch.on
    ? { on: true, x: entry.glitch.x, y: entry.glitch.y }
    : { ...fxPad.glitch, on: false }
  fxPad.granular = entry.granular.on
    ? { on: true, x: entry.granular.x, y: entry.granular.y }
    : { ...fxPad.granular, on: false }
}

/** Apply perf on last repeat — activates for last N steps (perfLen) of the last repeat.
 *  Called on every step; returns true if any perf flag changed. */
export function updateChainPerf(step: number): boolean {
  if (!chain.active || chain.entries.length === 0) return false
  const entry = chain.entries[chain.currentIndex]
  const isLast = chain.repeatCount >= entry.repeats - 1
  // -1 compensates for pending-flag latency: non-reset sendPattern sets pending
  // flags that apply on the NEXT step boundary, so we detect 1 step earlier.
  const inZone = isLast && step >= (16 - entry.perfLen - 1)
  const f = entry.perf === 1 && inZone
  const b = entry.perf === 2 && inZone
  const r = entry.perf === 3 && inZone
  const changed = perf.filling !== f || perf.breaking !== b || perf.reversing !== r
  perf.filling = f; perf.breaking = b; perf.reversing = r
  return changed
}

/** Chain is fully independent of editing pattern — never calls switchPattern */
export function chainToggle() {
  chain.active = !chain.active
  if (chain.active && chain.entries.length > 0) {
    // Resume from current position (preserved from last stop)
    chain.repeatCount = 0
    const entry = chain.entries[chain.currentIndex]
    chain.playingPatternId = entry.patternId
    applyChainEntry(entry)
  } else if (!chain.active) {
    perf.filling = false; perf.breaking = false; perf.reversing = false
    fxPad.verb     = { ...fxPad.verb, on: false }
    fxPad.delay    = { ...fxPad.delay, on: false }
    fxPad.glitch   = { ...fxPad.glitch, on: false }
    fxPad.granular = { ...fxPad.granular, on: false }
    chain.playingPatternId = 0
  }
}

/** Rewind chain to first entry */
export function chainRewind() {
  chain.currentIndex = 0
  chain.repeatCount = 0
  if (chain.active && chain.entries.length > 0) {
    const entry = chain.entries[0]
    chain.playingPatternId = entry.patternId
    applyChainEntry(entry)
  }
}

/** Jump chain to a specific entry */
export function chainJump(index: number) {
  if (index < 0 || index >= chain.entries.length) return
  chain.currentIndex = index
  chain.repeatCount = 0
  if (chain.active) {
    const entry = chain.entries[index]
    chain.playingPatternId = entry.patternId
    applyChainEntry(entry)
  }
}

/** Called at beat boundary. Returns true if advanced to a new entry. */
export function advanceChain(): boolean {
  if (!chain.active || chain.entries.length === 0) return false
  chain.repeatCount++
  if (chain.repeatCount >= chain.entries[chain.currentIndex].repeats) {
    chain.currentIndex = (chain.currentIndex + 1) % chain.entries.length
    chain.repeatCount = 0
    chain.playingPatternId = chain.entries[chain.currentIndex].patternId
    return true
  }
  return false
}

export function randomizePattern(): void {
  pushUndo('Randomize')
  // Pick a random root in the piano-roll range (C3=48 .. C4=60)
  const roots = [48, 50, 51, 53, 55, 56, 58, 60]
  const root  = roots[Math.floor(Math.random() * roots.length)]
  const scale = SCALES[Math.floor(Math.random() * SCALES.length)]

  // Build note pool spanning the full piano-roll range
  let allNotes: number[] = []
  for (let oct = 0; oct < 3; oct++) {
    for (const interval of scale) {
      const n = root + oct * 12 + interval
      if (n >= PIANO_ROLL_MIN && n <= PIANO_ROLL_MAX) allNotes.push(n)
    }
  }

  // When scale mode is on, quantize to grid scale positions
  if (prefs.scaleMode) {
    allNotes = allNotes
      .map(n => {
        if (SCALE_DEGREES_SET.has(n % 12)) return n
        // Snap to nearest grid-scale position
        const up = n + 1 <= PIANO_ROLL_MAX && SCALE_DEGREES_SET.has((n + 1) % 12) ? n + 1 : n + 2
        const down = n - 1 >= PIANO_ROLL_MIN && SCALE_DEGREES_SET.has((n - 1) % 12) ? n - 1 : n - 2
        return (n - down <= up - n) ? down : up
      })
      .filter((n, i, arr) => n >= PIANO_ROLL_MIN && n <= PIANO_ROLL_MAX && arr.indexOf(n) === i)
  }
  const lowNotes  = allNotes.filter(n => n < 60)
  const highNotes = allNotes.filter(n => n >= 60)

  for (let t = 0; t < pattern.tracks.length; t++) {
    const track = pattern.tracks[t]
    const steps = track.steps

    if (isDrum(track)) {
      // Probability profile per drum track name
      for (let s = 0; s < steps; s++) {
        let prob = 0
        const beat = s % 8  // position within 8-step group

        if (track.name === 'KICK') {
          prob = beat === 0 ? 0.92 : beat === 4 ? 0.40 : 0.08
        } else if (track.name === 'SNARE') {
          prob = beat === 4 ? 0.88 : beat === 6 ? 0.25 : 0.05
        } else if (track.name === 'CLAP') {
          prob = beat === 4 ? 0.70 : 0.03
        } else if (track.name === 'O.HH') {
          // Open hat on offbeats, sparse
          prob = (beat === 2 || beat === 6) ? 0.50 : 0.05
        } else if (track.name === 'CYM') {
          // Cymbal crash: very sparse
          prob = beat === 0 ? 0.25 : 0.02
        } else {
          // C.HH or other: 8th-note grid with swing variation
          const on8th = s % 2 === 0
          prob = on8th ? 0.82 : (Math.random() > 0.5 ? 0.55 : 0.20)
        }

        const active = Math.random() < prob
        track.trigs[s].active   = active
        track.trigs[s].velocity = 0.55 + Math.random() * 0.45
        // Add chance to non-primary beats for organic feel
        track.trigs[s].chance = active && prob < 0.5 ? 0.5 + Math.random() * 0.4 : undefined
      }
    } else {
      // Melodic: scale-quantized notes, ~30% density
      const pool    = track.name === 'BASS'
        ? (lowNotes.length  > 0 ? lowNotes  : allNotes)
        : (highNotes.length > 0 ? highNotes : allNotes)
      const density = track.name === 'BASS' ? 0.30 : 0.27

      for (let s = 0; s < steps; s++) {
        const active = Math.random() < density
        track.trigs[s].active   = active
        track.trigs[s].note     = active
          ? pool[Math.floor(Math.random() * pool.length)]
          : track.trigs[s].note
        track.trigs[s].velocity = active ? 0.55 + Math.random() * 0.45 : track.trigs[s].velocity
      }
    }
  }
}
