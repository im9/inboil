/**
 * Scene playback snapshot/restore — preserves globals mutated by modifier nodes.
 * Curve automation removed (ADR 093 — replaced by per-step paramLocks).
 */
import { song, bumpSongVersion, perf, fxPad, fxFlavours, masterPad, playback } from './state.svelte.ts'
import type { AutomationSnapshot } from './types.ts'

/** Snapshot current values of all automation targets so they can be restored later */
export function snapshotAutomationTargets(): AutomationSnapshot {
  const values: Record<string, number> = {}
  values['global:tempo'] = song.bpm
  values['global:masterVolume'] = perf.masterGain
  values['global:swing'] = perf.swing
  // Find currently playing pattern for voice param snapshot (ADR 118)
  const sceneNode = playback.sceneNodeId ? song.scene.nodes.find(n => n.id === playback.sceneNodeId) : null
  const currentPat = sceneNode?.patternId ? song.patterns.find(p => p.id === sceneNode.patternId) : null
  for (let i = 0; i < song.tracks.length; i++) {
    values[`track:${i}:volume`] = song.tracks[i].volume
    values[`track:${i}:pan`] = song.tracks[i].pan
    values[`track:${i}:muted`] = song.tracks[i].muted ? 1 : 0
    // Send params for sweep restore
    const cell = currentPat?.cells.find(c => c.trackId === song.tracks[i].id)
    if (cell) {
      values[`send:${i}:reverbSend`] = cell.reverbSend
      values[`send:${i}:delaySend`] = cell.delaySend
      values[`send:${i}:glitchSend`] = cell.glitchSend
      values[`send:${i}:granularSend`] = cell.granularSend
    }
    if (cell?.voiceParams) {
      for (const [key, val] of Object.entries(cell.voiceParams)) {
        if (typeof val === 'number') values[`voice:${i}:${key}`] = val
      }
    }
  }
  return {
    values,
    fxPad: JSON.parse(JSON.stringify(fxPad)),
    fxFlavours: { ...fxFlavours },
    masterPad: JSON.parse(JSON.stringify(masterPad)),
    comp: { makeup: song.effects.comp.makeup, attack: song.effects.comp.attack, release: song.effects.comp.release },
    perf: { reverbHold: perf.reverbHold, delayHold: perf.delayHold, glitchHold: perf.glitchHold, granularHold: perf.granularHold },
  }
}

/** Restore values from a snapshot taken before automation was applied */
export function restoreAutomationSnapshot(snap: AutomationSnapshot): void {
  bumpSongVersion()
  const v = snap.values
  if (v['global:tempo'] != null) song.bpm = v['global:tempo']
  if (v['global:masterVolume'] != null) perf.masterGain = v['global:masterVolume']
  // Restore voice params from sweep (ADR 118)
  const sceneNode2 = playback.sceneNodeId ? song.scene.nodes.find(n => n.id === playback.sceneNodeId) : null
  const restorePat = sceneNode2?.patternId ? song.patterns.find(p => p.id === sceneNode2.patternId) : null
  for (let i = 0; i < song.tracks.length; i++) {
    if (v[`track:${i}:volume`] != null) song.tracks[i].volume = v[`track:${i}:volume`]
    if (v[`track:${i}:pan`] != null) song.tracks[i].pan = v[`track:${i}:pan`]
    if (v[`track:${i}:muted`] != null) song.tracks[i].muted = v[`track:${i}:muted`] > 0.5
    const cell = restorePat?.cells.find(c => c.trackId === song.tracks[i].id)
    if (cell) {
      // Restore send levels
      if (v[`send:${i}:reverbSend`] != null) cell.reverbSend = v[`send:${i}:reverbSend`]
      if (v[`send:${i}:delaySend`] != null) cell.delaySend = v[`send:${i}:delaySend`]
      if (v[`send:${i}:glitchSend`] != null) cell.glitchSend = v[`send:${i}:glitchSend`]
      if (v[`send:${i}:granularSend`] != null) cell.granularSend = v[`send:${i}:granularSend`]
      // Restore voice params
      if (cell.voiceParams) {
        for (const key of Object.keys(v)) {
          const prefix = `voice:${i}:`
          if (key.startsWith(prefix)) {
            cell.voiceParams[key.slice(prefix.length)] = v[key]
          }
        }
      }
    }
  }
  // Restore FX pad & flavours mutated by modifier nodes
  const FX_PAD_KEYS = ['verb', 'delay', 'glitch', 'granular', 'filter', 'eqLow', 'eqMid', 'eqHigh'] as const
  for (const key of FX_PAD_KEYS) Object.assign(fxPad[key], snap.fxPad[key])
  Object.assign(fxFlavours, snap.fxFlavours)
  // Restore master pad & comp
  if (snap.masterPad) {
    const MASTER_PAD_KEYS = ['comp', 'duck', 'ret', 'sat'] as const
    for (const key of MASTER_PAD_KEYS) Object.assign(masterPad[key], snap.masterPad[key])
  }
  if (snap.comp) {
    song.effects.comp.makeup = snap.comp.makeup
    song.effects.comp.attack = snap.comp.attack
    song.effects.comp.release = snap.comp.release
  }
  if (snap.values['global:swing'] != null) perf.swing = snap.values['global:swing']
  // Restore hold states (ADR 123)
  if (snap.perf) {
    perf.reverbHold = snap.perf.reverbHold
    perf.delayHold = snap.perf.delayHold
    perf.glitchHold = snap.perf.glitchHold
    perf.granularHold = snap.perf.granularHold
  }
}

