import { describe, it, expect } from 'vitest'
import {
  cloneTrig, cloneCell, clonePattern, cloneTrack,
  cloneSongPure, restoreCellPure, restoreSongPure,
} from './songClone.ts'
import type { Trig, Cell, Pattern, Track, Song } from './types.ts'
import { DEFAULT_EFFECTS, DEFAULT_FX_PAD, DEFAULT_MASTER_PAD } from './constants.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTrig(overrides: Partial<Trig> = {}): Trig {
  return { active: true, note: 60, velocity: 0.8, duration: 1, slide: false, ...overrides }
}

function makeCell(overrides: Partial<Cell> = {}): Cell {
  return {
    trackId: 0, name: 'KICK', voiceId: 'Kick', steps: 4,
    trigs: [makeTrig(), makeTrig({ active: false }), makeTrig(), makeTrig({ active: false })],
    voiceParams: { tone: 0.5, decay: 0.7 },
    reverbSend: 0.08, delaySend: 0, glitchSend: 0, granularSend: 0,
    ...overrides,
  }
}

function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return { id: 'pat_00', name: 'DRIFT', color: 0, cells: [makeCell()], ...overrides }
}

function makeTrack(id = 0): Track {
  return { id, muted: false, volume: 0.8, pan: 0 }
}

function makeMinimalSong(overrides: Partial<Song> = {}): Song {
  return {
    name: 'Test', bpm: 120, rootNote: 0,
    tracks: [makeTrack(0), makeTrack(1)],
    patterns: [makePattern({ cells: [makeCell({ trackId: 0 }), makeCell({ trackId: 1, name: 'SNARE', voiceId: 'Snare' })] })],
    sections: [],
    scene: { name: 'Main', nodes: [], edges: [], labels: [] },
    effects: { ...DEFAULT_EFFECTS, comp: { ...DEFAULT_EFFECTS.comp } },
    masterGain: 0.8,
    swing: 0,
    ...overrides,
  }
}

// ── cloneTrig ─────────────────────────────────────────────────────────────────

describe('cloneTrig', () => {
  it('produces a deep copy', () => {
    const orig = makeTrig({ chance: 0.5, notes: [60, 64, 67], paramLocks: { tone: 0.3 } })
    const copy = cloneTrig(orig)

    expect(copy).toEqual(orig)
    // Mutating copy must not affect original
    copy.velocity = 0.1
    copy.notes!.push(72)
    copy.paramLocks!.tone = 0.9
    expect(orig.velocity).toBe(0.8)
    expect(orig.notes).toEqual([60, 64, 67])
    expect(orig.paramLocks!.tone).toBe(0.3)
  })

  it('omits undefined optional fields', () => {
    const copy = cloneTrig(makeTrig())
    expect(copy).not.toHaveProperty('chance')
    expect(copy).not.toHaveProperty('notes')
    expect(copy).not.toHaveProperty('paramLocks')
  })

  it('omits empty notes array', () => {
    const copy = cloneTrig(makeTrig({ notes: [] }))
    expect(copy).not.toHaveProperty('notes')
  })

  it('omits empty paramLocks', () => {
    const copy = cloneTrig(makeTrig({ paramLocks: {} }))
    expect(copy).not.toHaveProperty('paramLocks')
  })
})

// ── cloneCell ─────────────────────────────────────────────────────────────────

describe('cloneCell', () => {
  it('deep copies trigs and voiceParams', () => {
    const orig = makeCell({ insertFx: { type: 'verb', flavour: 'room', mix: 0.5, x: 0.3, y: 0.7 } })
    const copy = cloneCell(orig)

    expect(copy).toEqual(orig)
    copy.voiceParams.tone = 1.0
    copy.trigs[0].velocity = 0.1
    copy.insertFx!.mix = 1.0
    expect(orig.voiceParams.tone).toBe(0.5)
    expect(orig.trigs[0].velocity).toBe(0.8)
    expect(orig.insertFx!.mix).toBe(0.5)
  })

  it('omits presetName when absent', () => {
    const copy = cloneCell(makeCell())
    expect(copy).not.toHaveProperty('presetName')
  })

  it('preserves presetName when present', () => {
    const copy = cloneCell(makeCell({ presetName: 'DEEP' }))
    expect(copy.presetName).toBe('DEEP')
  })
})

// ── clonePattern ──────────────────────────────────────────────────────────────

describe('clonePattern', () => {
  it('deep copies all cells', () => {
    const orig = makePattern({ cells: [makeCell({ trackId: 0 }), makeCell({ trackId: 1 })] })
    const copy = clonePattern(orig)

    expect(copy.cells).toHaveLength(2)
    copy.cells[0].name = 'MODIFIED'
    expect(orig.cells[0].name).toBe('KICK')
  })
})

// ── cloneTrack ────────────────────────────────────────────────────────────────

describe('cloneTrack', () => {
  it('copies id, muted, volume, pan', () => {
    const orig = makeTrack(3)
    orig.muted = true
    orig.volume = 0.6
    orig.pan = -0.2
    const copy = cloneTrack(orig)
    expect(copy).toEqual({ id: 3, muted: true, volume: 0.6, pan: -0.2 })
  })
})

// ── cloneSongPure ─────────────────────────────────────────────────────────────

describe('cloneSongPure', () => {
  it('produces a deep copy that is independent of the original', () => {
    const song = makeMinimalSong()
    const ext = {
      fxPad: { verb: { on: false, x: 0.25, y: 0.65 } },
      masterPad: { comp: { on: true, x: 0.22, y: 0.26 } },
      fxFlavours: { verb: 'room' as const, delay: 'digital' as const, glitch: 'bitcrush' as const, granular: 'cloud' as const },
      masterGain: 0.8,
      swing: 0,
    }

    const copy = cloneSongPure(song, ext)

    expect(copy.bpm).toBe(120)
    expect(copy.patterns).toHaveLength(1)
    expect(copy.tracks).toHaveLength(2)

    // Mutate copy — original must be unaffected
    copy.bpm = 140
    copy.patterns[0].cells[0].voiceParams.tone = 1.0
    copy.tracks[0].volume = 0.1
    copy.effects.reverb.size = 0.99

    expect(song.bpm).toBe(120)
    expect(song.patterns[0].cells[0].voiceParams.tone).toBe(0.5)
    expect(song.tracks[0].volume).toBe(0.8)
    expect(song.effects.reverb.size).toBe(0.72)
  })

  it('includes external state (fxPad, masterPad, flavours)', () => {
    const song = makeMinimalSong()
    const ext = {
      fxPad: { verb: { on: true, x: 0.5, y: 0.5 } },
      masterPad: { comp: { on: false, x: 0.1, y: 0.1 } },
      fxFlavours: { verb: 'hall' as const, delay: 'tape' as const, glitch: 'redux' as const, granular: 'cloud' as const },
      masterGain: 0.6,
      swing: 0.3,
    }

    const copy = cloneSongPure(song, ext)
    expect(copy.flavours).toEqual(ext.fxFlavours)
    expect(copy.masterGain).toBe(0.6)
    expect(copy.swing).toBe(0.3)
  })
})

// ── restoreCellPure ───────────────────────────────────────────────────────────

describe('restoreCellPure', () => {
  it('uses fallback trackId when missing (legacy migration)', () => {
    const legacy = makeCell() as Cell & { trackId?: number }
    delete (legacy as unknown as unknown as Record<string, unknown>).trackId
    const restored = restoreCellPure(legacy as Cell, 5)
    expect(restored.trackId).toBe(5)
  })

  it('preserves existing trackId', () => {
    const cell = makeCell({ trackId: 3 })
    const restored = restoreCellPure(cell, 99)
    expect(restored.trackId).toBe(3)
  })

  it('defaults duration and slide on legacy trigs', () => {
    const cell = makeCell()
    // Simulate legacy trigs missing duration/slide
    const legacyTrigs = cell.trigs.map(t => {
      const { duration, slide, ...rest } = t
      return rest as unknown as Trig
    })
    cell.trigs = legacyTrigs

    const restored = restoreCellPure(cell, 0)
    for (const t of restored.trigs) {
      expect(t.duration).toBe(1)
      expect(t.slide).toBe(false)
    }
  })

  it('deep copies insertFx', () => {
    const cell = makeCell({ insertFx: { type: 'delay', flavour: 'tape', mix: 0.4, x: 0.5, y: 0.5 } })
    const restored = restoreCellPure(cell, 0)
    restored.insertFx!.mix = 1.0
    expect(cell.insertFx!.mix).toBe(0.4)
  })
})

// ── restoreSongPure ───────────────────────────────────────────────────────────

describe('restoreSongPure', () => {
  it('restores a complete song with all fields', () => {
    const song = makeMinimalSong({
      flavours: { verb: 'hall', delay: 'tape', glitch: 'redux', granular: 'cloud' },
      fxPadState: { ...DEFAULT_FX_PAD },
      masterPadState: { ...DEFAULT_MASTER_PAD },
    })

    const result = restoreSongPure(song)
    expect(result.song.name).toBe('Test')
    expect(result.song.bpm).toBe(120)
    expect(result.fxFlavours.verb).toBe('hall')
    expect(result.masterGain).toBe(0.8)
  })

  it('applies defaults for missing optional fields', () => {
    const song = makeMinimalSong()
    // Remove optional fields to simulate older save format
    delete (song as unknown as Record<string, unknown>).flavours
    delete (song as unknown as Record<string, unknown>).fxPadState
    delete (song as unknown as Record<string, unknown>).masterPadState
    delete (song as unknown as Record<string, unknown>).masterGain
    delete (song as unknown as Record<string, unknown>).swing

    const result = restoreSongPure(song)
    expect(result.fxFlavours).toEqual({ verb: 'room', delay: 'digital', glitch: 'bitcrush', granular: 'cloud' })
    expect(result.masterGain).toBe(0.8)
    expect(result.swing).toBe(0)
    expect(result.fxPad.verb).toBeDefined()
    expect(result.masterPad.comp).toBeDefined()
  })

  it('strips legacy name/voiceId from tracks (ADR 080)', () => {
    const song = makeMinimalSong()
    const legacyTracks = song.tracks.map(t => ({ ...t, name: 'OLD_NAME', voiceId: 'Kick' as const }))
    song.tracks = legacyTracks as Track[]

    const result = restoreSongPure(song)
    for (const t of result.song.tracks) {
      expect(t).not.toHaveProperty('name')
      expect(t).not.toHaveProperty('voiceId')
    }
  })

  it('pads missing cells for legacy saves (pre-ADR 079)', () => {
    const song = makeMinimalSong()
    // 2 tracks but pattern only has 1 cell without trackId (legacy)
    const legacyCell = makeCell({ name: 'KICK', voiceId: 'Kick' })
    delete (legacyCell as unknown as Record<string, unknown>).trackId
    song.patterns = [{ id: 'pat_00', name: 'DRIFT', color: 0, cells: [legacyCell] }]
    // Add legacy track data for padding
    song.tracks = [
      { id: 0, muted: false, volume: 0.8, pan: 0 } as Track & { name?: string; voiceId?: string },
      { id: 1, muted: false, volume: 0.8, pan: 0, name: 'SNARE', voiceId: 'Snare' } as unknown as Track,
    ]

    const result = restoreSongPure(song)
    expect(result.song.patterns[0].cells).toHaveLength(2)
    expect(result.song.patterns[0].cells[1].trackId).toBe(1)
  })

  it('defaults rootNote to 0 when missing', () => {
    const song = makeMinimalSong()
    delete (song as unknown as Record<string, unknown>).rootNote
    const result = restoreSongPure(song)
    expect(result.song.rootNote).toBe(0)
  })

  it('defaults pattern color to 0 when missing', () => {
    const song = makeMinimalSong()
    delete (song.patterns[0] as unknown as Record<string, unknown>).color
    const result = restoreSongPure(song)
    expect(result.song.patterns[0].color).toBe(0)
  })

  it('merges comp defaults for older saves missing attack/release', () => {
    const song = makeMinimalSong()
    // Simulate old effects without comp.attack/release
    song.effects = {
      reverb: { size: 0.5, damp: 0.5 },
      delay: { time: 0.5, feedback: 0.3 },
      ducker: { depth: 0.5, release: 100 },
      comp: { threshold: 0.3, ratio: 4, makeup: 2 } as Song['effects']['comp'],
    }

    const result = restoreSongPure(song)
    expect(result.song.effects.comp.attack).toBe(DEFAULT_EFFECTS.comp.attack)
    expect(result.song.effects.comp.release).toBe(DEFAULT_EFFECTS.comp.release)
    expect(result.song.effects.comp.threshold).toBe(0.3)
  })

  it('defaults name to Untitled when empty', () => {
    const song = makeMinimalSong({ name: '' })
    const result = restoreSongPure(song)
    expect(result.song.name).toBe('Untitled')
  })
})

// ── Round-trip (clone → restore) ──────────────────────────────────────────────

describe('clone → restore round-trip', () => {
  it('round-trips without data loss', () => {
    const song = makeMinimalSong({
      flavours: { verb: 'hall', delay: 'tape', glitch: 'bitcrush', granular: 'cloud' },
      fxPadState: { ...DEFAULT_FX_PAD },
      masterPadState: { ...DEFAULT_MASTER_PAD },
    })
    const ext = {
      fxPad: { ...DEFAULT_FX_PAD },
      masterPad: { ...DEFAULT_MASTER_PAD },
      fxFlavours: { verb: 'hall' as const, delay: 'tape' as const, glitch: 'bitcrush' as const, granular: 'cloud' as const },
      masterGain: 0.8,
      swing: 0.15,
    }

    const cloned = cloneSongPure(song, ext)
    const restored = restoreSongPure(cloned)

    expect(restored.song.bpm).toBe(song.bpm)
    expect(restored.song.tracks).toHaveLength(song.tracks.length)
    expect(restored.song.patterns).toHaveLength(song.patterns.length)
    expect(restored.song.patterns[0].cells).toHaveLength(song.patterns[0].cells.length)
    expect(restored.fxFlavours.verb).toBe('hall')
    expect(restored.swing).toBe(0.15)
  })
})
