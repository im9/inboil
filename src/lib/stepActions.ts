/**
 * Step editor actions: trig toggling, velocity, notes, voices, p-locks.
 * Extracted from state.svelte.ts for modularity.
 */

import { song, ui, pushUndo, activeCell } from './state.svelte.ts'
import type { Trig, VoiceId, CellInsertFx } from './state.svelte.ts'
import { PATTERN_COLORS } from './constants.ts'
import { makeTrig, makeTrack, makeEmptyCell, DRUM_VOICES } from './factory.ts'
import { VOICE_LIST } from './audio/dsp/voices.ts'
import { defaultVoiceParams } from './paramDefs.ts'
import { isGuest, guestToggleTrig, guestSetVelocity, guestSetChance, guestMute, guestSolo } from './multiDevice/guest.ts'

// ── Step editing ──

/** Auto-assign a color when the first trig is placed in a default-color pattern */
function maybeAutoColor() {
  const pat = song.patterns[ui.currentPattern]
  if (!pat || pat.color !== 0) return  // already customized
  if (pat.cells.some(c => c.trigs.some(t => t.active))) return  // already has data
  // Pick the least-used color (skip 0 = default)
  const counts = new Array(PATTERN_COLORS.length).fill(0)
  for (const p of song.patterns) { if (p.cells.some(c => c.trigs.some(t => t.active))) counts[p.color]++ }
  let best = 1, bestCount = Infinity
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] < bestCount) { bestCount = counts[i]; best = i }
  }
  pat.color = best
}

export function toggleTrig(trackId: number, stepIndex: number) {
  if (isGuest()) { guestToggleTrig(trackId, stepIndex, !activeCell(trackId).trigs[stepIndex].active); return }
  pushUndo('Toggle step')
  const c = activeCell(trackId)
  const willActivate = !c.trigs[stepIndex].active
  if (willActivate) maybeAutoColor()
  c.trigs[stepIndex].active = !c.trigs[stepIndex].active
}

export function setTrigVelocity(trackId: number, stepIdx: number, v: number) {
  if (isGuest()) { guestSetVelocity(trackId, stepIdx, v); return }
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
    if (!trig.active) maybeAutoColor()
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
  if (isGuest()) { guestSetChance(trackId, stepIdx, chance); return }
  pushUndo('Set chance')
  const v = Math.max(0, Math.min(1, chance))
  activeCell(trackId).trigs[stepIdx].chance = v >= 1 ? undefined : v
}

/** Check if a trig contains a specific note (handles both mono and poly) */
export function trigHasNote(trig: Trig, note: number): boolean {
  if (trig.notes) return trig.notes.includes(note)
  return trig.note === note
}

/** Place a note bar: set head trig + clear covered steps */
export function placeNoteBar(trackId: number, startStep: number, note: number, duration: number) {
  pushUndo('Place note')
  maybeAutoColor()
  const c = activeCell(trackId)
  // Truncate any prior note whose duration overlaps this step
  for (let d = 1; d <= 16; d++) {
    const prev = startStep - d
    if (prev < 0) break
    const pt = c.trigs[prev]
    if (pt.active) {
      if ((pt.duration ?? 1) > d) pt.duration = d
      break
    }
  }
  const dur = Math.max(1, Math.min(c.steps - startStep, Math.min(16, duration)))
  c.trigs[startStep].active = true
  c.trigs[startStep].note = note
  c.trigs[startStep].duration = dur
  // Clear notes array when placing a single note bar (mono mode)
  delete c.trigs[startStep].notes
  for (let d = 1; d < dur; d++) {
    const idx = startStep + d
    if (idx < c.steps) c.trigs[idx].active = false
  }
}

/** Add a note to a step's chord (poly mode) */
export function addNoteToStep(trackId: number, stepIdx: number, note: number) {
  pushUndo('Add chord note')
  const c = activeCell(trackId)
  const trig = c.trigs[stepIdx]
  if (!trig.active) {
    // Empty step — place as primary note
    maybeAutoColor()
    trig.active = true
    trig.note = note
    trig.duration = 1
    delete trig.notes
    return
  }
  // Already active — build/extend notes array
  const existing = trig.notes ?? [trig.note]
  if (existing.includes(note)) return  // already has this note
  existing.push(note)
  existing.sort((a, b) => a - b)
  trig.notes = existing
  trig.note = existing[0]  // primary = lowest note
}

/** Remove a note from a step's chord (poly mode) */
export function removeNoteFromStep(trackId: number, stepIdx: number, note: number) {
  pushUndo('Remove chord note')
  const c = activeCell(trackId)
  const trig = c.trigs[stepIdx]
  if (!trig.active) return
  if (!trig.notes) {
    // Mono: just deactivate if it matches
    if (trig.note === note) trig.active = false
    return
  }
  const idx = trig.notes.indexOf(note)
  if (idx < 0) return
  trig.notes.splice(idx, 1)
  if (trig.notes.length === 0) {
    trig.active = false
    delete trig.notes
  } else if (trig.notes.length === 1) {
    trig.note = trig.notes[0]
    delete trig.notes
  } else {
    trig.note = trig.notes[0]
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
    if (trig.active && trigHasNote(trig, note) && (trig.duration ?? 1) > d) {
      return prev
    }
    if (d > 0 && trig.active && trigHasNote(trig, note)) break
  }
  return -1
}

// ── Track operations ──

export function toggleMute(trackId: number) {
  if (isGuest()) { guestMute(trackId, !song.tracks[trackId].muted); return }
  pushUndo('Toggle mute')
  song.tracks[trackId].muted = !song.tracks[trackId].muted
}

export function toggleSolo(trackId: number) {
  if (isGuest()) { guestSolo(trackId); return }
  if (ui.soloTracks.has(trackId)) {
    ui.soloTracks.delete(trackId)
  } else {
    ui.soloTracks.add(trackId)
  }
  ui.soloTracks = new Set(ui.soloTracks)
}

export function isDrum(trackOrCell: { voiceId: VoiceId | null }): boolean {
  return !!trackOrCell.voiceId && DRUM_VOICES.has(trackOrCell.voiceId)
}

/** Change instrument voice for the active cell (ADR 062, was track-level) */
export function changeVoice(trackIdx: number, newVoiceId: VoiceId) {
  pushUndo('Change instrument')
  const c = activeCell(trackIdx)
  const wasDrum = c.voiceId ? DRUM_VOICES.has(c.voiceId) : false
  c.voiceId = newVoiceId
  c.voiceParams = defaultVoiceParams(newVoiceId)
  const meta = VOICE_LIST.find(v => v.id === newVoiceId)
  if (meta) c.name = meta.label
  // Reset sends when switching between drum and melodic (ADR 058 Phase 2)
  const nowDrum = DRUM_VOICES.has(newVoiceId)
  if (wasDrum !== nowDrum) {
    c.reverbSend = nowDrum ? 0.08 : 0.25
    c.delaySend  = nowDrum ? 0.00 : 0.12
  }
}

/** Apply a synth preset to the selected track */
export function applyPreset(trackIdx: number, params: Record<string, number>, presetName?: string) {
  pushUndo('Apply preset')
  const c = activeCell(trackIdx)
  c.voiceParams = { ...c.voiceParams, ...params }
  if (presetName != null) c.presetName = presetName
}

/** Reset track params to voice defaults (INIT) */
export function resetToDefaults(trackIdx: number) {
  pushUndo('Reset to defaults')
  const c = activeCell(trackIdx)
  c.voiceParams = defaultVoiceParams(c.voiceId as VoiceId)
  c.presetName = undefined
}

/** Reset per-step parameters controllable from the vel-row tabs */
const SEQ_PARAM_KEYS = ['vol', 'pan', 'reverbSend', 'delaySend', 'glitchSend', 'granularSend', 'ins0mix', 'ins0x', 'ins0y', 'ins1mix', 'ins1x', 'ins1y'] as const
export function resetSeqParams(trackIdx: number) {
  pushUndo('Reset seq params')
  const c = activeCell(trackIdx)
  // Reset per-step automation
  for (const trig of c.trigs) {
    trig.velocity = 0.8
    trig.chance = undefined
    if (trig.paramLocks) {
      for (const key of SEQ_PARAM_KEYS) delete trig.paramLocks[key]
      if (Object.keys(trig.paramLocks).length === 0) trig.paramLocks = undefined
    }
  }
  // Reset baseline mix/send values
  const track = song.tracks[trackIdx]
  if (track) { track.volume = 0.8; track.pan = 0 }
  c.reverbSend = 0; c.delaySend = 0; c.glitchSend = 0; c.granularSend = 0
}

export const STEP_OPTIONS = [
  2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 12, 13, 14, 15, 16,
  24, 32, 48, 64,
] as const

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

// ── Per-track step scale (ADR 112) ──────────────────────────────────────────

export const SCALE_OPTIONS = [
  { label: '1/8',  divisor: 4   },
  { label: '3/16', divisor: 3   },
  { label: '1/16', divisor: 2   },  // default
  { label: '3/32', divisor: 1.5 },
  { label: '1/32', divisor: 1   },
] as const

export function setTrackScale(trackId: number, divisor: number) {
  pushUndo('Set scale')
  const c = activeCell(trackId)
  c.scale = divisor === 2 ? undefined : divisor  // omit default to keep saves lean
}

export function cycleTrackScale(trackId: number, direction: 1 | -1 = 1) {
  const c = activeCell(trackId)
  const current = c.scale ?? 2
  const idx = SCALE_OPTIONS.findIndex(o => o.divisor === current)
  const next = (idx + direction + SCALE_OPTIONS.length) % SCALE_OPTIONS.length
  setTrackScale(trackId, SCALE_OPTIONS[next].divisor)
}

export function setTrackSend(trackId: number, send: 'reverbSend' | 'delaySend' | 'glitchSend' | 'granularSend', v: number) {
  pushUndo('Set send')
  activeCell(trackId)[send] = Math.min(1, Math.max(0, v))
}

// ── Insert FX (ADR 077, 114: dual chain) ────────────────────────────────────

const DEFAULT_INSERT_FX: CellInsertFx = { type: null, flavour: 'room', mix: 0.5, x: 0.5, y: 0.5 }

function ensureInsertFx(trackId: number, slot: 0 | 1): CellInsertFx {
  const cell = activeCell(trackId)
  if (!cell.insertFx) cell.insertFx = [null, null]
  if (!cell.insertFx[slot]) cell.insertFx[slot] = { ...DEFAULT_INSERT_FX }
  return cell.insertFx[slot]!
}

export function setInsertFxType(trackId: number, slot: 0 | 1, type: CellInsertFx['type']) {
  pushUndo('Set insert FX type')
  const fx = ensureInsertFx(trackId, slot)
  fx.type = type
  // Reset flavour to default for new type
  if (type === 'verb') fx.flavour = 'room'
  else if (type === 'delay') fx.flavour = 'digital'
  else if (type === 'glitch') fx.flavour = 'bitcrush'
}

export function setInsertFxFlavour(trackId: number, slot: 0 | 1, flavour: string) {
  pushUndo('Set insert FX flavour')
  ensureInsertFx(trackId, slot).flavour = flavour
}

export function setInsertFxParam(trackId: number, slot: 0 | 1, param: 'mix' | 'x' | 'y', v: number) {
  pushUndo('Set insert FX param')
  ensureInsertFx(trackId, slot)[param] = Math.min(1, Math.max(0, v))
}

export function clearInsertFx(trackId: number, slot: 0 | 1) {
  pushUndo('Clear insert FX')
  const cell = activeCell(trackId)
  if (cell.insertFx) {
    cell.insertFx[slot] = null
    if (!cell.insertFx[0] && !cell.insertFx[1]) cell.insertFx = undefined
  }
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

// ── Dynamic track count (ADR 056) ──

const MAX_TRACKS = 16

/** Find a track id not referenced by any pattern cell — available for reuse */
function findOrphanTrackId(): number | null {
  const usedIds = new Set<number>()
  for (const pat of song.patterns) {
    for (const cell of pat.cells) usedIds.add(cell.trackId)
  }
  for (const track of song.tracks) {
    if (!usedIds.has(track.id)) return track.id
  }
  return null
}

/** Whether a new track can be added (under limit or orphan slot available) */
export function canAddTrack(): boolean {
  return song.tracks.length < MAX_TRACKS || findOrphanTrackId() != null
}

export function addTrack(voiceId: VoiceId | null = null): number | null {
  // Try to reuse an orphan track slot before growing the array
  let idx: number
  const orphanId = song.tracks.length >= MAX_TRACKS ? findOrphanTrackId() : null
  if (song.tracks.length >= MAX_TRACKS && orphanId == null) return null
  pushUndo('Add track')
  if (orphanId != null) {
    // Reuse existing slot — reset track state
    idx = orphanId
    const slot = song.tracks.find(t => t.id === orphanId)!
    slot.muted = false; slot.volume = 0.8; slot.pan = 0
  } else {
    idx = song.tracks.length
    song.tracks.push(makeTrack(idx))
  }
  const meta = voiceId ? VOICE_LIST.find(v => v.id === voiceId) : null
  const name = meta?.label ?? (voiceId ? voiceId.toUpperCase().slice(0, 4) : `TR${idx + 1}`)
  const drum = voiceId ? DRUM_VOICES.has(voiceId) : false
  // Add cell to current pattern only — other patterns get cells lazily via ensureCell
  const currentPat = song.patterns[ui.currentPattern]
  if (currentPat) {
    currentPat.cells.push(makeEmptyCell(idx, name, voiceId, drum ? 60 : 48))
  }
  ui.selectedTrack = idx
  return idx
}

export function removeTrack(trackId: number): boolean {
  const pat = song.patterns[ui.currentPattern]
  if (!pat) return false
  const cellIdx = pat.cells.findIndex(c => c.trackId === trackId)
  if (cellIdx < 0) return false
  pushUndo('Remove track')
  // Remove cell from current pattern only — song.tracks and other patterns untouched
  pat.cells.splice(cellIdx, 1)
  if (pat.cells.length === 0) {
    ui.selectedTrack = -1
  } else if (!pat.cells.some(c => c.trackId === ui.selectedTrack)) {
    ui.selectedTrack = pat.cells[Math.min(cellIdx, pat.cells.length - 1)].trackId
  }
  return true
}
