import { activePhrase, ui, setVoiceParam, setParamLock } from './state.svelte.ts'
import { denormalizeParam, type ParamDef } from './paramDefs.ts'

export function knobValue(p: { key: string; default: number }): number {
  const ph = activePhrase(ui.selectedTrack)
  const selTrig = ui.selectedStep !== null ? ph.trigs[ui.selectedStep] : null
  if (ui.lockMode && selTrig) {
    const lockVal = selTrig.paramLocks?.[p.key]
    return lockVal !== undefined ? lockVal : (ph.voiceParams[p.key] ?? p.default)
  }
  return ph.voiceParams[p.key] ?? p.default
}

export function knobChange(p: { key: string }, v: number): void {
  const actual = denormalizeParam(p as ParamDef, v)
  if (ui.lockMode && ui.selectedStep !== null) {
    setParamLock(ui.selectedTrack, ui.selectedStep, p.key, actual)
  } else {
    setVoiceParam(ui.selectedTrack, p.key, actual)
  }
}

export function isParamLocked(key: string): boolean {
  const ph = activePhrase(ui.selectedTrack)
  const selTrig = ui.selectedStep !== null ? ph.trigs[ui.selectedStep] : null
  return !!(ui.lockMode && selTrig?.paramLocks?.[key] !== undefined)
}
