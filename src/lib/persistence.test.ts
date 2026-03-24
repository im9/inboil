/**
 * Persistence round-trip tests (ADR 082 Phase 1).
 * Verify cloneSongPure → restoreSongPure preserves all fields.
 */
import { describe, it, expect } from 'vitest'
import { makeDefaultSong, makeEmptySong, makeTrig } from './factory.ts'
import { cloneSongPure, restoreSongPure, type ExternalState } from './songClone.ts'
import { DEFAULT_FX_PAD, DEFAULT_MASTER_PAD } from './constants.ts'
import type { Song } from './types.ts'

// ── Helpers ──

function defaultExt(): ExternalState {
  return {
    fxPad: JSON.parse(JSON.stringify(DEFAULT_FX_PAD)),
    masterPad: JSON.parse(JSON.stringify(DEFAULT_MASTER_PAD)),
    fxFlavours: { verb: 'room', delay: 'digital', glitch: 'bitcrush', granular: 'cloud' },
    masterGain: 0.8,
    swing: 0,
  }
}

function roundTrip(song: Song, ext?: ExternalState) {
  const e = ext ?? defaultExt()
  const cloned = cloneSongPure(song, e)
  return restoreSongPure(cloned)
}

// ── Tests ──

describe('song round-trip: basic fields', () => {
  it('preserves name, bpm, rootNote', () => {
    const song = makeDefaultSong()
    song.name = 'Test Song'
    song.bpm = 140
    song.rootNote = 5
    const r = roundTrip(song)
    expect(r.song.name).toBe('Test Song')
    expect(r.song.bpm).toBe(140)
    expect(r.song.rootNote).toBe(5)
  })

  it('preserves track count and properties', () => {
    const song = makeDefaultSong()
    song.tracks[0].muted = true
    song.tracks[1].volume = 0.5
    song.tracks[2].pan = -0.3
    const r = roundTrip(song)
    expect(r.song.tracks.length).toBe(song.tracks.length)
    expect(r.song.tracks[0].muted).toBe(true)
    expect(r.song.tracks[1].volume).toBe(0.5)
    expect(r.song.tracks[2].pan).toBeCloseTo(-0.3)
  })

  it('preserves masterGain and swing', () => {
    const song = makeDefaultSong()
    const ext = defaultExt()
    ext.masterGain = 0.65
    ext.swing = 0.3
    const r = roundTrip(song, ext)
    expect(r.masterGain).toBeCloseTo(0.65)
    expect(r.swing).toBeCloseTo(0.3)
  })
})

describe('song round-trip: patterns and cells', () => {
  it('preserves pattern count', () => {
    const song = makeDefaultSong()
    const r = roundTrip(song)
    expect(r.song.patterns.length).toBe(song.patterns.length)
  })

  it('preserves pattern id, name, color', () => {
    const song = makeDefaultSong()
    song.patterns[0].name = 'Intro'
    song.patterns[0].color = 3
    const r = roundTrip(song)
    expect(r.song.patterns[0].name).toBe('Intro')
    expect(r.song.patterns[0].color).toBe(3)
    expect(r.song.patterns[0].id).toBe(song.patterns[0].id)
  })

  it('preserves cell trackId', () => {
    const song = makeDefaultSong()
    const r = roundTrip(song)
    for (let pi = 0; pi < song.patterns.length; pi++) {
      for (let ci = 0; ci < song.patterns[pi].cells.length; ci++) {
        expect(r.song.patterns[pi].cells[ci].trackId)
          .toBe(song.patterns[pi].cells[ci].trackId)
      }
    }
  })

  it('preserves cell voiceId and voiceParams', () => {
    const song = makeDefaultSong()
    const cell = song.patterns[0].cells[0]
    cell.voiceParams = { cutoff: 0.7, resonance: 0.3 }
    const r = roundTrip(song)
    expect(r.song.patterns[0].cells[0].voiceId).toBe(cell.voiceId)
    expect(r.song.patterns[0].cells[0].voiceParams).toEqual({ cutoff: 0.7, resonance: 0.3 })
  })

  it('preserves cell send levels', () => {
    const song = makeDefaultSong()
    const cell = song.patterns[0].cells[0]
    cell.reverbSend = 0.4
    cell.delaySend = 0.6
    cell.glitchSend = 0.1
    cell.granularSend = 0.2
    const r = roundTrip(song)
    const rc = r.song.patterns[0].cells[0]
    expect(rc.reverbSend).toBeCloseTo(0.4)
    expect(rc.delaySend).toBeCloseTo(0.6)
    expect(rc.glitchSend).toBeCloseTo(0.1)
    expect(rc.granularSend).toBeCloseTo(0.2)
  })

  it('preserves trig data (active, note, velocity, duration, slide)', () => {
    const song = makeDefaultSong()
    const cell = song.patterns[0].cells[0]
    cell.trigs[0] = { active: true, note: 72, velocity: 0.9, duration: 2, slide: true }
    const r = roundTrip(song)
    const trig = r.song.patterns[0].cells[0].trigs[0]
    expect(trig.active).toBe(true)
    expect(trig.note).toBe(72)
    expect(trig.velocity).toBe(0.9)
    expect(trig.duration).toBe(2)
    expect(trig.slide).toBe(true)
  })

  it('preserves trig chance', () => {
    const song = makeDefaultSong()
    song.patterns[0].cells[0].trigs[0] = { ...makeTrig(true, 60), chance: 0.5 }
    const r = roundTrip(song)
    expect(r.song.patterns[0].cells[0].trigs[0].chance).toBe(0.5)
  })

  it('preserves trig paramLocks', () => {
    const song = makeDefaultSong()
    song.patterns[0].cells[0].trigs[0] = { ...makeTrig(true, 60), paramLocks: { cutoff: 0.3, resonance: 0.8 } }
    const r = roundTrip(song)
    expect(r.song.patterns[0].cells[0].trigs[0].paramLocks).toEqual({ cutoff: 0.3, resonance: 0.8 })
  })

  it('preserves trig chord notes', () => {
    const song = makeDefaultSong()
    song.patterns[0].cells[0].trigs[0] = { ...makeTrig(true, 60), notes: [64, 67] }
    const r = roundTrip(song)
    expect(r.song.patterns[0].cells[0].trigs[0].notes).toEqual([64, 67])
  })
})

describe('song round-trip: insertFx', () => {
  it('preserves dual insertFx per cell', () => {
    const song = makeDefaultSong()
    song.patterns[0].cells[0].insertFx = [
      { type: 'verb', flavour: 'room', mix: 0.4, x: 0.6, y: 0.3 },
      { type: 'delay', flavour: 'tape', mix: 0.5, x: 0.5, y: 0.5 },
    ]
    const r = roundTrip(song)
    expect(r.song.patterns[0].cells[0].insertFx).toEqual([
      { type: 'verb', flavour: 'room', mix: 0.4, x: 0.6, y: 0.3 },
      { type: 'delay', flavour: 'tape', mix: 0.5, x: 0.5, y: 0.5 },
    ])
  })

  it('preserves single-slot insertFx with null', () => {
    const song = makeDefaultSong()
    song.patterns[0].cells[0].insertFx = [
      { type: 'glitch', flavour: 'bitcrush', mix: 0.3, x: 0.4, y: 0.6 },
      null,
    ]
    const r = roundTrip(song)
    expect(r.song.patterns[0].cells[0].insertFx![0]).toEqual({ type: 'glitch', flavour: 'bitcrush', mix: 0.3, x: 0.4, y: 0.6 })
    expect(r.song.patterns[0].cells[0].insertFx![1]).toBeNull()
  })

  it('omits insertFx when not set', () => {
    const song = makeEmptySong()
    const r = roundTrip(song)
    expect(r.song.patterns[0].cells[0].insertFx).toBeUndefined()
  })

  it('migrates legacy single insertFx object to array', () => {
    // Simulate loading legacy save data (goes through restoreSongPure directly)
    const song = makeDefaultSong()
    ;(song.patterns[0].cells[0] as any).insertFx = { type: 'verb', flavour: 'room', mix: 0.4, x: 0.6, y: 0.3 }
    const r = restoreSongPure(song)
    expect(Array.isArray(r.song.patterns[0].cells[0].insertFx)).toBe(true)
    expect(r.song.patterns[0].cells[0].insertFx![0]).toEqual({ type: 'verb', flavour: 'room', mix: 0.4, x: 0.6, y: 0.3 })
    expect(r.song.patterns[0].cells[0].insertFx![1]).toBeNull()
  })
})

describe('song round-trip: effects', () => {
  it('preserves global effects', () => {
    const song = makeDefaultSong()
    song.effects.reverb.size = 0.9
    song.effects.delay.feedback = 0.7
    song.effects.comp.threshold = 0.5
    const r = roundTrip(song)
    expect(r.song.effects.reverb.size).toBe(0.9)
    expect(r.song.effects.delay.feedback).toBe(0.7)
    expect(r.song.effects.comp.threshold).toBe(0.5)
  })
})

describe('song round-trip: fxPadState', () => {
  it('preserves custom fxPad values', () => {
    const song = makeDefaultSong()
    const ext = defaultExt()
    ext.fxPad.verb = { on: true, x: 0.8, y: 0.2 }
    ext.fxPad.delay = { on: false, x: 0.3, y: 0.7 }
    const r = roundTrip(song, ext)
    expect(r.fxPad.verb).toEqual({ on: true, x: 0.8, y: 0.2 })
    expect(r.fxPad.delay).toEqual({ on: false, x: 0.3, y: 0.7 })
  })

  it('preserves EQ pad values with Q and shelf', () => {
    const song = makeDefaultSong()
    const ext = defaultExt()
    ext.fxPad.eqLow = { on: true, x: 0.2, y: 0.6, q: 2.0, shelf: true }
    const r = roundTrip(song, ext)
    expect(r.fxPad.eqLow).toEqual({ on: true, x: 0.2, y: 0.6, q: 2.0, shelf: true })
  })

  it('defaults fxPad when fxPadState is missing', () => {
    const song = makeDefaultSong()
    delete song.fxPadState
    const r = restoreSongPure(song)
    expect(r.fxPad.verb).toEqual(DEFAULT_FX_PAD.verb)
  })
})

describe('song round-trip: masterPadState', () => {
  it('preserves custom masterPad values', () => {
    const song = makeDefaultSong()
    const ext = defaultExt()
    ext.masterPad.comp = { on: false, x: 0.5, y: 0.8 }
    ext.masterPad.duck = { on: true, x: 0.1, y: 0.9 }
    const r = roundTrip(song, ext)
    expect(r.masterPad.comp).toEqual({ on: false, x: 0.5, y: 0.8 })
    expect(r.masterPad.duck).toEqual({ on: true, x: 0.1, y: 0.9 })
  })

  it('defaults masterPad when masterPadState is missing', () => {
    const song = makeDefaultSong()
    delete song.masterPadState
    const r = restoreSongPure(song)
    expect(r.masterPad.comp).toEqual(DEFAULT_MASTER_PAD.comp)
  })
})

describe('song round-trip: fxFlavours', () => {
  it('preserves custom flavours', () => {
    const song = makeDefaultSong()
    const ext = defaultExt()
    ext.fxFlavours = { verb: 'shimmer', delay: 'tape', glitch: 'stutter', granular: 'reverse' }
    const r = roundTrip(song, ext)
    expect(r.fxFlavours).toEqual({ verb: 'shimmer', delay: 'tape', glitch: 'stutter', granular: 'reverse' })
  })

  it('defaults flavours when missing', () => {
    const song = makeDefaultSong()
    delete song.flavours
    const r = restoreSongPure(song)
    expect(r.fxFlavours.verb).toBe('room')
    expect(r.fxFlavours.delay).toBe('digital')
  })

  it('migrates legacy granular freeze flavour to cloud (ADR 121)', () => {
    const song = makeDefaultSong()
    // Simulate legacy save with 'freeze' flavour
    ;(song as unknown as Record<string, unknown>).flavours = { verb: 'hall', delay: 'tape', glitch: 'stutter', granular: 'freeze' }
    const r = restoreSongPure(song)
    expect(r.fxFlavours.granular).toBe('cloud')
    // Other flavours preserved
    expect(r.fxFlavours.verb).toBe('hall')
    expect(r.fxFlavours.delay).toBe('tape')
  })
})

describe('song round-trip: scene graph', () => {
  it('preserves scene nodes and edges through double round-trip', () => {
    // restoreScene may filter/migrate nodes, so verify idempotency:
    // a second round-trip should produce identical results to the first.
    const song = makeDefaultSong()
    const r1 = roundTrip(song)
    const r2 = roundTrip(r1.song, defaultExt())
    expect(r2.song.scene.nodes.length).toBe(r1.song.scene.nodes.length)
    expect(r2.song.scene.edges.length).toBe(r1.song.scene.edges.length)
    // Verify pattern nodes survive
    const patNodes = r1.song.scene.nodes.filter(n => n.type === 'pattern')
    expect(patNodes.length).toBeGreaterThan(0)
  })

  it('migrates legacy decorators to modifier nodes on restore', () => {
    // Simulate old saved data with decorators (pre-ADR 093)
    const song = makeDefaultSong()
    const raw = JSON.parse(JSON.stringify(song))
    const pNode = raw.scene.nodes.find((n: any) => n.type === 'pattern')
    if (pNode) {
      pNode.decorators = [{ type: 'transpose', params: { semitones: 5 } }]
      const r = restoreSongPure(raw)
      // Decorator should be migrated to a modifier node
      const modNodes = r.song.scene.nodes.filter(n => n.type === 'transpose')
      expect(modNodes.length).toBeGreaterThanOrEqual(1)
      const migrated = modNodes.find(n => n.modifierParams?.transpose?.semitones === 5)
      expect(migrated).toBeDefined()
      // Pattern node should not have decorators
      const rNode = r.song.scene.nodes.find(n => n.id === pNode.id)
      expect(rNode?.decorators).toBeUndefined()
    }
  })

  it('preserves generative node config', () => {
    const song = makeDefaultSong()
    const genNode = song.scene.nodes.find(n => n.type === 'pattern')
    if (genNode) {
      genNode.generative = {
        engine: 'turing',
        mergeMode: 'replace',
        targetTrack: 0,
        params: { engine: 'turing', length: 8, lock: 0.5, range: [48, 72], mode: 'note', density: 0.7 },
      }
      const r = roundTrip(song)
      const rNode = r.song.scene.nodes.find(n => n.id === genNode.id)
      expect(rNode?.generative?.engine).toBe('turing')
      expect((rNode?.generative?.params as { lock: number }).lock).toBe(0.5)
    }
  })
})

describe('song round-trip: deep clone isolation', () => {
  it('mutating cloned song does not affect original', () => {
    const song = makeDefaultSong()
    const ext = defaultExt()
    const cloned = cloneSongPure(song, ext)
    cloned.name = 'MUTATED'
    cloned.patterns[0].cells[0].trigs[0].note = 99
    expect(song.name).not.toBe('MUTATED')
    expect(song.patterns[0].cells[0].trigs[0].note).not.toBe(99)
  })

  it('mutating restored state does not affect snapshot', () => {
    const song = makeDefaultSong()
    const ext = defaultExt()
    const snapshot = cloneSongPure(song, ext)
    const r = restoreSongPure(snapshot)
    r.song.patterns[0].cells[0].trigs[0].note = 99
    expect(snapshot.patterns[0].cells[0].trigs[0].note).not.toBe(99)
  })
})

describe('template switch + restore', () => {
  it('does not pad empty cells for tracks removed by template switch', () => {
    // Simulate: start with 8-track song, then apply a 4-track template to pattern[0]
    const song = makeDefaultSong()
    const originalTrackCount = song.tracks.length // e.g. 8

    // Simulate applying a smaller template to pattern[0]:
    // keep only the first 4 cells
    song.patterns[0].cells = song.patterns[0].cells.slice(0, 4)

    // Other patterns still reference all original tracks, so song.tracks stays large
    expect(song.tracks.length).toBe(originalTrackCount)

    // Round-trip through clone → restore (simulates IndexedDB save/load)
    const r = roundTrip(song)

    // Pattern[0] should still have only 4 cells, not padded back to originalTrackCount
    expect(r.song.patterns[0].cells.length).toBe(4)
  })

  it('still pads cells for legacy saves without trackId', () => {
    const song = makeDefaultSong()
    const trackCount = song.tracks.length

    // Remove trackId from pattern[0] cells to simulate legacy save
    song.patterns[0].cells = song.patterns[0].cells.slice(0, 4)
    for (const cell of song.patterns[0].cells) {
      delete (cell as unknown as Record<string, unknown>).trackId
    }

    const r = roundTrip(song)

    // Legacy pattern SHOULD be padded to full track count
    expect(r.song.patterns[0].cells.length).toBe(trackCount)
  })
})

describe('legacy migration', () => {
  it('assigns trackId when missing from cells', () => {
    const song = makeEmptySong()
    // Simulate legacy save without trackId
    for (const pat of song.patterns) {
      for (const cell of pat.cells) {
        delete (cell as unknown as Record<string, unknown>).trackId
      }
    }
    const r = restoreSongPure(song)
    r.song.patterns[0].cells.forEach((c, i) => {
      expect(c.trackId).toBe(i)
    })
  })

  it('defaults duration and slide on legacy trigs', () => {
    const song = makeEmptySong()
    const trig = song.patterns[0].cells[0].trigs[0]
    delete (trig as unknown as Record<string, unknown>).duration
    delete (trig as unknown as Record<string, unknown>).slide
    const r = restoreSongPure(song)
    expect(r.song.patterns[0].cells[0].trigs[0].duration).toBe(1)
    expect(r.song.patterns[0].cells[0].trigs[0].slide).toBe(false)
  })

  it('handles missing effects gracefully', () => {
    const song = makeEmptySong()
    delete (song as unknown as Record<string, unknown>).effects
    const r = restoreSongPure(song)
    expect(r.song.effects.reverb).toBeDefined()
    expect(r.song.effects.comp).toBeDefined()
  })

  it('handles missing rootNote', () => {
    const song = makeEmptySong()
    delete (song as unknown as Record<string, unknown>).rootNote
    const r = restoreSongPure(song)
    expect(r.song.rootNote).toBe(0)
  })
})
