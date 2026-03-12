/**
 * Tests for automation snapshot/restore — verifies FX pad and flavour state
 * survives decorator mutations during scene↔pattern playback transitions.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_FX_PAD, DEFAULT_FX_FLAVOURS, DEFAULT_MASTER_PAD } from './constants.ts'
import type { FxFlavours } from './constants.ts'

// ── Pure reimplementation of snapshot/restore logic for testability ──
// Mirrors snapshotAutomationTargets() / restoreAutomationSnapshot() in state.svelte.ts

type FxPad = typeof DEFAULT_FX_PAD
interface AutomationSnapshot {
  values: Record<string, number>
  fxPad: FxPad
  fxFlavours: FxFlavours
}

function snapshotFx(fxPad: FxPad, fxFlavours: FxFlavours): AutomationSnapshot {
  return {
    values: {},
    fxPad: JSON.parse(JSON.stringify(fxPad)),
    fxFlavours: { ...fxFlavours },
  }
}

function restoreFx(snap: AutomationSnapshot, fxPad: FxPad, fxFlavours: FxFlavours): void {
  for (const key of Object.keys(snap.fxPad) as (keyof FxPad)[]) {
    Object.assign(fxPad[key], snap.fxPad[key])
  }
  Object.assign(fxFlavours, snap.fxFlavours)
}

// ── Tests ──

describe('automation snapshot: FX persistence', () => {
  it('restores fxPad.verb.on after decorator mutation', () => {
    const pad: FxPad = JSON.parse(JSON.stringify(DEFAULT_FX_PAD))
    const flavours: FxFlavours = { ...DEFAULT_FX_FLAVOURS }

    // verb is off by default
    expect(pad.verb.on).toBe(false)

    // Snapshot before decorator
    const snap = snapshotFx(pad, flavours)

    // Simulate decorator: turn verb on
    pad.verb = { ...pad.verb, on: true }
    expect(pad.verb.on).toBe(true)

    // Restore — verb should be off again
    restoreFx(snap, pad, flavours)
    expect(pad.verb.on).toBe(false)
  })

  it('restores all FX on/off flags after decorator mutation', () => {
    const pad: FxPad = JSON.parse(JSON.stringify(DEFAULT_FX_PAD))
    const flavours: FxFlavours = { ...DEFAULT_FX_FLAVOURS }
    const snap = snapshotFx(pad, flavours)

    // Decorator turns everything on
    pad.verb     = { ...pad.verb, on: true }
    pad.delay    = { ...pad.delay, on: true }
    pad.glitch   = { ...pad.glitch, on: true }
    pad.granular = { ...pad.granular, on: true }

    restoreFx(snap, pad, flavours)
    expect(pad.verb.on).toBe(false)
    expect(pad.delay.on).toBe(false)
    expect(pad.glitch.on).toBe(false)
    expect(pad.granular.on).toBe(false)
  })

  it('restores fxFlavours after decorator override', () => {
    const pad: FxPad = JSON.parse(JSON.stringify(DEFAULT_FX_PAD))
    const flavours: FxFlavours = { ...DEFAULT_FX_FLAVOURS }
    const snap = snapshotFx(pad, flavours)

    // Decorator overrides flavours
    flavours.verb = 'shimmer'
    flavours.delay = 'tape'
    expect(flavours.verb).toBe('shimmer')

    restoreFx(snap, pad, flavours)
    expect(flavours.verb).toBe('room')
    expect(flavours.delay).toBe('digital')
  })

  it('preserves FX x/y values through snapshot cycle', () => {
    const pad: FxPad = JSON.parse(JSON.stringify(DEFAULT_FX_PAD))
    pad.verb.x = 0.8
    pad.verb.y = 0.3
    const flavours: FxFlavours = { ...DEFAULT_FX_FLAVOURS }
    const snap = snapshotFx(pad, flavours)

    // Decorator mutates on flag but x/y shouldn't be lost
    pad.verb = { ...pad.verb, on: true }
    pad.verb.x = 0.99

    restoreFx(snap, pad, flavours)
    expect(pad.verb.x).toBe(0.8)
    expect(pad.verb.y).toBe(0.3)
    expect(pad.verb.on).toBe(false)
  })

  it('snapshot is a deep copy — later mutations do not affect it', () => {
    const pad: FxPad = JSON.parse(JSON.stringify(DEFAULT_FX_PAD))
    const flavours: FxFlavours = { ...DEFAULT_FX_FLAVOURS }
    const snap = snapshotFx(pad, flavours)

    pad.delay.x = 0.99
    flavours.glitch = 'stutter'

    // Snapshot values should be unchanged
    expect(snap.fxPad.delay.x).toBe(DEFAULT_FX_PAD.delay.x)
    expect(snap.fxFlavours.glitch).toBe('bitcrush')
  })

  it('restores all 8 fxPad sub-objects (FX_PAD_KEYS coverage)', () => {
    const pad: FxPad = JSON.parse(JSON.stringify(DEFAULT_FX_PAD))
    const flavours: FxFlavours = { ...DEFAULT_FX_FLAVOURS }
    const snap = snapshotFx(pad, flavours)

    // Mutate every sub-object
    const FX_KEYS = ['verb', 'delay', 'glitch', 'granular', 'filter', 'eqLow', 'eqMid', 'eqHigh'] as const
    for (const key of FX_KEYS) {
      ;(pad[key] as Record<string, unknown>).x = 0.99
    }

    restoreFx(snap, pad, flavours)

    // Verify every key was restored
    for (const key of FX_KEYS) {
      expect(pad[key].x, `fxPad.${key}.x should be restored`).toBe(DEFAULT_FX_PAD[key].x)
    }
  })

  it('restores all 3 masterPad sub-objects (MASTER_PAD_KEYS coverage)', () => {
    type MasterPad = typeof DEFAULT_MASTER_PAD
    const master: MasterPad = JSON.parse(JSON.stringify(DEFAULT_MASTER_PAD))
    const snapMaster: MasterPad = JSON.parse(JSON.stringify(master))

    // Mutate every sub-object
    const MASTER_KEYS = ['comp', 'duck', 'ret'] as const
    for (const key of MASTER_KEYS) {
      master[key].x = 0.99
      master[key].y = 0.01
    }

    // Restore using Object.assign loop (same pattern as automation.ts)
    for (const key of MASTER_KEYS) {
      Object.assign(master[key], snapMaster[key])
    }

    for (const key of MASTER_KEYS) {
      expect(master[key].x, `masterPad.${key}.x should be restored`).toBe(DEFAULT_MASTER_PAD[key].x)
      expect(master[key].y, `masterPad.${key}.y should be restored`).toBe(DEFAULT_MASTER_PAD[key].y)
    }
  })
})
