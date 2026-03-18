/**
 * Pure data transformation functions for song clone/restore.
 * Extracted from state.svelte.ts for testability (ADR 082).
 */

import type { Trig, Cell, Pattern, Track, Song, Effects, VoiceId } from './types.ts'
import type { FxFlavours } from './constants.ts'
import { DEFAULT_EFFECTS, DEFAULT_FX_PAD, DEFAULT_MASTER_PAD } from './constants.ts'
import { cloneScene, restoreScene } from './sceneData.ts'
import { makeEmptyCell } from './factory.ts'

// ── Clone helpers (pure) ────────────────────────────────────────────────────

export function cloneTrig(tr: Trig): Trig {
  return {
    active: tr.active, note: tr.note, velocity: tr.velocity,
    duration: tr.duration, slide: tr.slide,
    ...(tr.chance != null ? { chance: tr.chance } : {}),
    ...(tr.notes && tr.notes.length > 0 ? { notes: [...tr.notes] } : {}),
    ...(tr.paramLocks && Object.keys(tr.paramLocks).length > 0
      ? { paramLocks: { ...tr.paramLocks } } : {}),
  }
}

export function cloneCell(c: Cell): Cell {
  return {
    trackId: c.trackId,
    name: c.name,
    voiceId: c.voiceId,
    steps: c.steps,
    voiceParams: { ...c.voiceParams },
    ...(c.presetName ? { presetName: c.presetName } : {}),
    reverbSend: c.reverbSend, delaySend: c.delaySend,
    glitchSend: c.glitchSend, granularSend: c.granularSend,
    ...(c.insertFx ? { insertFx: { ...c.insertFx } } : {}),
    ...(c.sampleRef ? { sampleRef: { ...c.sampleRef } } : {}),
    ...(c.scale != null ? { scale: c.scale } : {}),
    trigs: c.trigs.map(cloneTrig),
  }
}

export function clonePattern(p: Pattern): Pattern {
  return { id: p.id, name: p.name, color: p.color, cells: p.cells.map(cloneCell) }
}

export function cloneTrack(t: Track): Track {
  return { id: t.id, muted: t.muted, volume: t.volume, pan: t.pan }
}

// ── Pad/flavour types for clone/restore ─────────────────────────────────────

export type FxPadState = Record<string, Record<string, number | boolean>>
export type MasterPadState = Record<string, Record<string, number | boolean>>

export interface ExternalState {
  fxPad: FxPadState
  masterPad: MasterPadState
  fxFlavours: FxFlavours
  masterGain: number
  swing: number
}

// ── cloneSong (pure) ────────────────────────────────────────────────────────

export function cloneSongPure(song: Song, ext: ExternalState): Song {
  return {
    name: song.name, bpm: song.bpm, rootNote: song.rootNote,
    tracks: song.tracks.map(cloneTrack),
    patterns: song.patterns.map(clonePattern),
    sections: [],
    scene: cloneScene(song.scene),
    effects: {
      reverb: { ...song.effects.reverb },
      delay: { ...song.effects.delay },
      ducker: { ...song.effects.ducker },
      comp: { ...song.effects.comp },
    },
    flavours: { ...ext.fxFlavours },
    fxPadState: JSON.parse(JSON.stringify(ext.fxPad)),
    masterPadState: JSON.parse(JSON.stringify(ext.masterPad)),
    masterGain: ext.masterGain,
    swing: ext.swing,
  }
}

// ── restoreCell (pure) ──────────────────────────────────────────────────────

export function restoreCellPure(c: Cell, fallbackTrackId: number): Cell {
  return {
    ...c,
    trackId: c.trackId ?? fallbackTrackId,  // migration: legacy saves lack trackId
    voiceParams: { ...c.voiceParams },
    trigs: c.trigs.map(tr => ({
      ...tr,
      duration: tr.duration ?? 1,
      slide: tr.slide ?? false,
      ...(tr.paramLocks ? { paramLocks: { ...tr.paramLocks } } : {}),
    })),
    ...(c.insertFx ? { insertFx: { ...c.insertFx } } : {}),
  }
}

// ── restoreSong (pure) ──────────────────────────────────────────────────────

export interface RestoredState {
  song: Song
  fxPad: FxPadState
  masterPad: MasterPadState
  fxFlavours: FxFlavours
  masterGain: number
  swing: number
}

export function restoreSongPure(src: Song): RestoredState {
  // Strip legacy name/voiceId from tracks (ADR 080)
  const tracks = src.tracks.map((t: Track & { name?: string; voiceId?: VoiceId | null }) => ({
    id: t.id, muted: t.muted, volume: t.volume, pan: t.pan,
  }))
  const legacyTrackData = src.tracks as (Track & { name?: string; voiceId?: VoiceId | null })[]

  const patterns = src.patterns.map(p => {
    const isLegacy = p.cells.some((c: unknown) => (c as Record<string, unknown>).trackId == null)
    const cells = p.cells.map((c, i) => restoreCellPure(c, i))
    // Only pad missing cells for legacy saves (pre-ADR 079) where cells lack trackId
    if (isLegacy) {
      const existing = new Set(cells.map(c => c.trackId))
      for (const t of legacyTrackData) {
        if (!existing.has(t.id)) {
          cells.push(makeEmptyCell(t.id, t.name ?? `TR${t.id + 1}`, t.voiceId ?? null, 60))
        }
      }
    }
    return { id: p.id, name: p.name, color: p.color ?? 0, cells }
  })

  // Legacy: sections are preserved for old save round-trip but not used at runtime
  const sections = src.sections ?? []

  const scene = restoreScene(src.scene)

  const fx = src.effects ?? DEFAULT_EFFECTS
  const effects: Effects = {
    reverb: { ...fx.reverb },
    delay: { ...fx.delay },
    ducker: { ...fx.ducker },
    comp: { ...DEFAULT_EFFECTS.comp, ...fx.comp },
  }

  // FX flavours
  const fl = src.flavours
  const fxFlavours: FxFlavours = {
    verb:     (fl?.verb     ?? 'room')     as FxFlavours['verb'],
    delay:    (fl?.delay    ?? 'digital')   as FxFlavours['delay'],
    glitch:   (fl?.glitch   ?? 'bitcrush')  as FxFlavours['glitch'],
    granular: (fl?.granular ?? 'cloud')     as FxFlavours['granular'],
  }

  // FX pad state
  let fxPad: FxPadState
  if (src.fxPadState) {
    fxPad = {
      verb:     { ...DEFAULT_FX_PAD.verb,     ...src.fxPadState.verb },
      delay:    { ...DEFAULT_FX_PAD.delay,    ...src.fxPadState.delay },
      glitch:   { ...DEFAULT_FX_PAD.glitch,   ...src.fxPadState.glitch },
      granular: { ...DEFAULT_FX_PAD.granular, ...src.fxPadState.granular },
      filter:   { ...DEFAULT_FX_PAD.filter,   ...src.fxPadState.filter },
      eqLow:    { ...DEFAULT_FX_PAD.eqLow,   ...src.fxPadState.eqLow },
      eqMid:    { ...DEFAULT_FX_PAD.eqMid,   ...src.fxPadState.eqMid },
      eqHigh:   { ...DEFAULT_FX_PAD.eqHigh,  ...src.fxPadState.eqHigh },
    }
  } else {
    fxPad = {
      verb:     { ...DEFAULT_FX_PAD.verb },
      delay:    { ...DEFAULT_FX_PAD.delay },
      glitch:   { ...DEFAULT_FX_PAD.glitch },
      granular: { ...DEFAULT_FX_PAD.granular },
      filter:   { ...DEFAULT_FX_PAD.filter },
      eqLow:    { ...DEFAULT_FX_PAD.eqLow },
      eqMid:    { ...DEFAULT_FX_PAD.eqMid },
      eqHigh:   { ...DEFAULT_FX_PAD.eqHigh },
    }
  }

  // Master pad state
  let masterPad: MasterPadState
  if (src.masterPadState) {
    masterPad = {
      comp: { ...DEFAULT_MASTER_PAD.comp, ...src.masterPadState.comp },
      duck: { ...DEFAULT_MASTER_PAD.duck, ...src.masterPadState.duck },
      ret:  { ...DEFAULT_MASTER_PAD.ret,  ...src.masterPadState.ret },
    }
  } else {
    masterPad = {
      comp: { ...DEFAULT_MASTER_PAD.comp },
      duck: { ...DEFAULT_MASTER_PAD.duck },
      ret:  { ...DEFAULT_MASTER_PAD.ret },
    }
  }

  const song: Song = {
    name: src.name || 'Untitled',
    bpm: src.bpm,
    rootNote: src.rootNote ?? 0,
    tracks, patterns, sections, scene, effects,
    flavours: fxFlavours,
    fxPadState: fxPad as Song['fxPadState'],
    masterPadState: masterPad as Song['masterPadState'],
    masterGain: src.masterGain,
    swing: src.swing,
  }

  return {
    song,
    fxPad,
    masterPad,
    fxFlavours,
    masterGain: src.masterGain ?? 0.8,
    swing: src.swing ?? 0,
  }
}
