/**
 * Automation evaluation, snapshot, and application logic.
 * Extracted from state.svelte.ts for modularity.
 */
import { BPM_MIN, BPM_MAX } from './constants.ts'
import { song, playback, perf, fxPad, fxFlavours, masterPad, cellForTrack } from './state.svelte.ts'
import type { AutomationPoint, AutomationTarget, AutomationSnapshot } from './types.ts'

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
  const v = snap.values
  if (v['global:tempo'] != null) song.bpm = v['global:tempo']
  if (v['global:masterVolume'] != null) perf.masterGain = v['global:masterVolume']
  for (let i = 0; i < song.tracks.length; i++) {
    if (v[`track:${i}:volume`] != null) song.tracks[i].volume = v[`track:${i}:volume`]
    if (v[`track:${i}:pan`] != null) song.tracks[i].pan = v[`track:${i}:pan`]
  }
  // Restore FX pad & flavours mutated by decorators
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
        song.bpm = Math.round(BPM_MIN + v * (BPM_MAX - BPM_MIN))
      } else if (target.param === 'masterVolume') {
        perf.masterGain = v
      } else if (target.param === 'swing') {
        perf.swing = v
      } else if (target.param === 'compThreshold') {
        masterPad.comp = { ...masterPad.comp, x: v }
      } else if (target.param === 'compRatio') {
        masterPad.comp = { ...masterPad.comp, y: v }
      } else if (target.param === 'compMakeup') {
        song.effects.comp.makeup = 1 + v * 3
      } else if (target.param === 'compAttack') {
        song.effects.comp.attack = 0.1 + v * 29.9
      } else if (target.param === 'compRelease') {
        song.effects.comp.release = 10 + v * 290
      } else if (target.param === 'duckDepth') {
        masterPad.duck = { ...masterPad.duck, x: v }
      } else if (target.param === 'duckRelease') {
        masterPad.duck = { ...masterPad.duck, y: v }
      } else if (target.param === 'retVerb') {
        masterPad.ret = { ...masterPad.ret, x: v }
      } else if (target.param === 'retDelay') {
        masterPad.ret = { ...masterPad.ret, y: v }
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
    case 'eq':
      if (target.param === 'freq') {
        if (target.band === 'eqLow') fxPad.eqLow = { ...fxPad.eqLow, x: v }
        else if (target.band === 'eqMid') fxPad.eqMid = { ...fxPad.eqMid, x: v }
        else fxPad.eqHigh = { ...fxPad.eqHigh, x: v }
      } else if (target.param === 'gain') {
        if (target.band === 'eqLow') fxPad.eqLow = { ...fxPad.eqLow, y: v }
        else if (target.band === 'eqMid') fxPad.eqMid = { ...fxPad.eqMid, y: v }
        else fxPad.eqHigh = { ...fxPad.eqHigh, y: v }
      } else {
        const q = 0.3 + v * 7.7
        if (target.band === 'eqLow') fxPad.eqLow = { ...fxPad.eqLow, q }
        else if (target.band === 'eqMid') fxPad.eqMid = { ...fxPad.eqMid, q }
        else fxPad.eqHigh = { ...fxPad.eqHigh, q }
      }
      break
    case 'send': {
      const pat = playback.playingPattern != null ? song.patterns[playback.playingPattern] : null
      if (!pat) break
      const cell = cellForTrack(pat, target.trackIndex)
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
