/**
 * Scene playback snapshot/restore — preserves globals mutated by function nodes.
 * Curve automation removed (ADR 093 — replaced by per-step paramLocks).
 */
import { song, bumpSongVersion, perf, fxPad, fxFlavours, masterPad } from './state.svelte.ts'
import type { AutomationSnapshot } from './types.ts'

/** Snapshot current values of all automation targets so they can be restored later */
export function snapshotAutomationTargets(): AutomationSnapshot {
  const values: Record<string, number> = {}
  values['global:tempo'] = song.bpm
  values['global:masterVolume'] = perf.masterGain
  values['global:swing'] = perf.swing
  for (let i = 0; i < song.tracks.length; i++) {
    values[`track:${i}:volume`] = song.tracks[i].volume
    values[`track:${i}:pan`] = song.tracks[i].pan
  }
  return {
    values,
    fxPad: JSON.parse(JSON.stringify(fxPad)),
    fxFlavours: { ...fxFlavours },
    masterPad: JSON.parse(JSON.stringify(masterPad)),
    comp: { makeup: song.effects.comp.makeup, attack: song.effects.comp.attack, release: song.effects.comp.release },
  }
}

/** Restore values from a snapshot taken before automation was applied */
export function restoreAutomationSnapshot(snap: AutomationSnapshot): void {
  bumpSongVersion()
  const v = snap.values
  if (v['global:tempo'] != null) song.bpm = v['global:tempo']
  if (v['global:masterVolume'] != null) perf.masterGain = v['global:masterVolume']
  for (let i = 0; i < song.tracks.length; i++) {
    if (v[`track:${i}:volume`] != null) song.tracks[i].volume = v[`track:${i}:volume`]
    if (v[`track:${i}:pan`] != null) song.tracks[i].pan = v[`track:${i}:pan`]
  }
  // Restore FX pad & flavours mutated by function nodes
  const FX_PAD_KEYS = ['verb', 'delay', 'glitch', 'granular', 'filter', 'eqLow', 'eqMid', 'eqHigh'] as const
  for (const key of FX_PAD_KEYS) Object.assign(fxPad[key], snap.fxPad[key])
  Object.assign(fxFlavours, snap.fxFlavours)
  // Restore master pad & comp
  if (snap.masterPad) {
    const MASTER_PAD_KEYS = ['comp', 'duck', 'ret'] as const
    for (const key of MASTER_PAD_KEYS) Object.assign(masterPad[key], snap.masterPad[key])
  }
  if (snap.comp) {
    song.effects.comp.makeup = snap.comp.makeup
    song.effects.comp.attack = snap.comp.attack
    song.effects.comp.release = snap.comp.release
  }
  if (snap.values['global:swing'] != null) perf.swing = snap.values['global:swing']
}

