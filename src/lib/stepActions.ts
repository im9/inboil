/**
 * Step editor actions: trig toggling, velocity, notes, voices, p-locks.
 * Extracted from state.svelte.ts for modularity.
 */

import { song, ui, pushUndo, activeCell } from './state.svelte.ts'
import type { Trig, VoiceId } from './state.svelte.ts'
import { PATTERN_COLORS } from './constants.ts'
import { makeTrig, makeTrack, makeEmptyCell, DRUM_VOICES } from './factory.ts'
import { VOICE_LIST } from './audio/dsp/voices.ts'
import { defaultVoiceParams } from './paramDefs.ts'

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
  pushUndo('Toggle step')
  const c = activeCell(trackId)
  const willActivate = !c.trigs[stepIndex].active
  if (willActivate) maybeAutoColor()
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

export function isDrum(trackOrCell: { voiceId: VoiceId | null }): boolean {
  return !!trackOrCell.voiceId && DRUM_VOICES.has(trackOrCell.voiceId)
}

/** Change instrument voice for the active cell (ADR 062, was track-level) */
export function changeVoice(trackIdx: number, newVoiceId: VoiceId) {
  pushUndo('Change instrument')
  const track = song.tracks[trackIdx]
  const c = activeCell(trackIdx)
  const wasDrum = c.voiceId ? DRUM_VOICES.has(c.voiceId) : false
  c.voiceId = newVoiceId
  c.voiceParams = defaultVoiceParams(newVoiceId)
  const meta = VOICE_LIST.find(v => v.id === newVoiceId)
  if (meta) c.name = meta.label
  // Keep track-level voiceId in sync as template default
  track.voiceId = newVoiceId
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

// ── Dynamic track count (ADR 056) ──

const MAX_TRACKS = 16

export function addTrack(voiceId: VoiceId | null = null): number | null {
  if (song.tracks.length >= MAX_TRACKS) return null
  pushUndo('Add track')
  const idx = song.tracks.length
  const meta = voiceId ? VOICE_LIST.find(v => v.id === voiceId) : null
  const name = meta?.label ?? (voiceId ? voiceId.toUpperCase().slice(0, 4) : `TR${idx + 1}`)
  const drum = voiceId ? DRUM_VOICES.has(voiceId) : false
  song.tracks.push(makeTrack(idx, name, voiceId, 0))
  for (const pat of song.patterns) {
    pat.cells.push(makeEmptyCell(idx, name, voiceId, drum ? 60 : 48))
  }
  ui.selectedTrack = idx
  return idx
}

export function removeTrack(idx: number): boolean {
  if (song.tracks.length === 0) return false
  pushUndo('Remove track')
  song.tracks.splice(idx, 1)
  song.tracks.forEach((t, i) => t.id = i)
  for (const pat of song.patterns) {
    pat.cells.splice(idx, 1)
  }
  if (song.tracks.length === 0) {
    ui.selectedTrack = -1
  } else if (ui.selectedTrack >= song.tracks.length) {
    ui.selectedTrack = song.tracks.length - 1
  }
  return true
}
