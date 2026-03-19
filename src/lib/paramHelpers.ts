import { activeCell, ui } from './state.svelte.ts'
import { setVoiceParam, setParamLock } from './stepActions.ts'
import { denormalizeParam, type ParamDef } from './paramDefs.ts'
import { isGuest, guestSetVoiceParam } from './multiDevice/guest.ts'

export function knobValue(p: { key: string; default: number }): number {
  const ph = activeCell(ui.selectedTrack)
  const selTrig = ui.selectedStep !== null ? ph.trigs[ui.selectedStep] : null
  if (ui.lockMode && selTrig) {
    const lockVal = selTrig.paramLocks?.[p.key]
    return lockVal !== undefined ? lockVal : (ph.voiceParams[p.key] ?? p.default)
  }
  return ph.voiceParams[p.key] ?? p.default
}

export function knobChange(p: { key: string }, v: number): void {
  const actual = denormalizeParam(p as ParamDef, v)
  if (isGuest()) {
    guestSetVoiceParam(ui.selectedTrack, p.key, actual)
    return
  }
  if (ui.lockMode && ui.selectedStep !== null) {
    setParamLock(ui.selectedTrack, ui.selectedStep, p.key, actual)
  } else {
    setVoiceParam(ui.selectedTrack, p.key, actual)
  }
}

export function isParamLocked(key: string): boolean {
  const ph = activeCell(ui.selectedTrack)
  const selTrig = ui.selectedStep !== null ? ph.trigs[ui.selectedStep] : null
  return !!(ui.lockMode && selTrig?.paramLocks?.[key] !== undefined)
}

// ── Track-level P-Lock helpers (ADR 093) ──

/** Read a track-level param value, respecting P-Lock mode */
export function trackPlkValue(key: string, baseline: number): number {
  if (!ui.lockMode || ui.selectedStep === null) return baseline
  const ph = activeCell(ui.selectedTrack)
  const lockVal = ph.trigs[ui.selectedStep]?.paramLocks?.[key]
  return lockVal !== undefined ? lockVal : baseline
}

/** Write a track-level param, routing to P-Lock when in lock mode */
export function trackPlkChange(key: string, value: number, setBaseline: (v: number) => void): void {
  if (ui.lockMode && ui.selectedStep !== null) {
    setParamLock(ui.selectedTrack, ui.selectedStep, key, value)
  } else {
    setBaseline(value)
  }
}

/** Check if a track-level param has a P-Lock on the selected step */
export function isTrackPlkLocked(key: string): boolean {
  if (!ui.lockMode || ui.selectedStep === null) return false
  const ph = activeCell(ui.selectedTrack)
  return ph.trigs[ui.selectedStep]?.paramLocks?.[key] !== undefined
}
