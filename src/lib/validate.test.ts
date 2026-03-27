import { describe, it, expect } from 'vitest'
import { validateSongData, validateRecoverySnapshot, ValidationError } from './validate.ts'

// Minimal valid song structure for testing
function minimalSong() {
  return {
    name: 'Test',
    bpm: 120,
    rootNote: 0,
    tracks: [{ id: 0, muted: false, volume: 0.8, pan: 0 }],
    patterns: [{
      id: 'pat_00',
      name: 'DRIFT',
      color: 0,
      cells: [{
        trackId: 0,
        name: 'TR1',
        voiceId: '909K',
        steps: 16,
        voiceParams: { tone: 0.5 },
        reverbSend: 0,
        delaySend: 0,
        glitchSend: 0,
        granularSend: 0,
        trigs: Array.from({ length: 16 }, () => ({
          active: false, note: 60, velocity: 0.8, duration: 1, slide: false,
        })),
      }],
    }],
    sections: [],
    scene: { name: 'Main', nodes: [], edges: [], labels: [], stamps: [] },
    effects: {
      reverb: { size: 0.5, damp: 0.5 },
      delay: { time: 0.3, feedback: 0.4 },
      ducker: { depth: 0.5, release: 0.2 },
      comp: { threshold: 0.6, ratio: 0.3, makeup: 0.5, attack: 0.1, release: 0.3 },
    },
  }
}

describe('validateSongData', () => {
  it('accepts a valid minimal song', () => {
    const song = minimalSong()
    expect(() => validateSongData(song)).not.toThrow()
  })

  it('returns the song object on success', () => {
    const song = minimalSong()
    const result = validateSongData(song)
    expect(result.bpm).toBe(120)
    expect(result.tracks).toHaveLength(1)
  })

  // ── Top-level field validation ──

  it('rejects null', () => {
    expect(() => validateSongData(null)).toThrow(ValidationError)
  })

  it('rejects non-object', () => {
    expect(() => validateSongData('not a song')).toThrow(ValidationError)
  })

  it('rejects missing bpm', () => {
    const song = minimalSong()
    delete (song as Record<string, unknown>).bpm
    expect(() => validateSongData(song)).toThrow(/bpm/)
  })

  it('rejects non-number bpm', () => {
    const song = minimalSong() as Record<string, unknown>
    song.bpm = 'fast'
    expect(() => validateSongData(song)).toThrow(/bpm/)
  })

  it('rejects NaN bpm', () => {
    const song = minimalSong() as Record<string, unknown>
    song.bpm = NaN
    expect(() => validateSongData(song)).toThrow(/bpm.*positive finite/)
  })

  it('rejects Infinity bpm', () => {
    const song = minimalSong() as Record<string, unknown>
    song.bpm = Infinity
    expect(() => validateSongData(song)).toThrow(/bpm.*positive finite/)
  })

  it('rejects zero bpm', () => {
    const song = minimalSong() as Record<string, unknown>
    song.bpm = 0
    expect(() => validateSongData(song)).toThrow(/bpm.*positive finite/)
  })

  it('rejects missing tracks', () => {
    const song = minimalSong()
    delete (song as Record<string, unknown>).tracks
    expect(() => validateSongData(song)).toThrow(/tracks/)
  })

  it('rejects empty tracks', () => {
    const song = minimalSong()
    song.tracks = []
    expect(() => validateSongData(song)).toThrow(/tracks.*must not be empty/)
  })

  it('rejects missing patterns', () => {
    const song = minimalSong()
    delete (song as Record<string, unknown>).patterns
    expect(() => validateSongData(song)).toThrow(/patterns/)
  })

  it('rejects empty patterns', () => {
    const song = minimalSong()
    song.patterns = []
    expect(() => validateSongData(song)).toThrow(/patterns.*must not be empty/)
  })

  // ── Pattern rootNote validation ──

  it('accepts pattern with rootNote', () => {
    const song = minimalSong()
    ;(song.patterns[0] as Record<string, unknown>).rootNote = 9
    expect(() => validateSongData(song)).not.toThrow()
  })

  it('accepts pattern without rootNote (undefined)', () => {
    const song = minimalSong()
    expect(() => validateSongData(song)).not.toThrow()
  })

  it('rejects pattern with non-number rootNote', () => {
    const song = minimalSong()
    ;(song.patterns[0] as Record<string, unknown>).rootNote = 'A'
    expect(() => validateSongData(song)).toThrow(/rootNote/)
  })

  // ── Track validation ──

  it('rejects track with missing id', () => {
    const song = minimalSong()
    delete (song.tracks[0] as Record<string, unknown>).id
    expect(() => validateSongData(song)).toThrow(/tracks\[0\]\.id/)
  })

  it('rejects track with wrong muted type', () => {
    const song = minimalSong() as Record<string, unknown>
    ;(song as any).tracks[0].muted = 'yes'
    expect(() => validateSongData(song)).toThrow(/tracks\[0\]\.muted/)
  })

  // ── Pattern validation ──

  it('rejects pattern with missing id', () => {
    const song = minimalSong()
    delete (song.patterns[0] as Record<string, unknown>).id
    expect(() => validateSongData(song)).toThrow(/patterns\[0\]\.id/)
  })

  it('rejects pattern with missing name', () => {
    const song = minimalSong()
    delete (song.patterns[0] as Record<string, unknown>).name
    expect(() => validateSongData(song)).toThrow(/patterns\[0\]\.name/)
  })

  it('rejects pattern with non-array cells', () => {
    const song = minimalSong()
    ;(song.patterns[0] as Record<string, unknown>).cells = 'not an array'
    expect(() => validateSongData(song)).toThrow(/patterns\[0\]\.cells/)
  })

  // ── Cell validation ──

  it('rejects cell with missing steps', () => {
    const song = minimalSong()
    delete (song.patterns[0].cells[0] as Record<string, unknown>).steps
    expect(() => validateSongData(song)).toThrow(/cells\[0\]\.steps/)
  })

  it('rejects cell with non-array trigs', () => {
    const song = minimalSong()
    ;(song.patterns[0].cells[0] as Record<string, unknown>).trigs = {}
    expect(() => validateSongData(song)).toThrow(/cells\[0\]\.trigs/)
  })

  it('rejects cell with missing voiceParams', () => {
    const song = minimalSong()
    delete (song.patterns[0].cells[0] as Record<string, unknown>).voiceParams
    expect(() => validateSongData(song)).toThrow(/voiceParams/)
  })

  // ── Trig validation ──

  it('rejects trig with missing active', () => {
    const song = minimalSong()
    delete (song.patterns[0].cells[0].trigs[0] as Record<string, unknown>).active
    expect(() => validateSongData(song)).toThrow(/trigs\[0\]\.active/)
  })

  it('rejects trig with non-number note', () => {
    const song = minimalSong()
    ;(song.patterns[0].cells[0].trigs[0] as Record<string, unknown>).note = 'C4'
    expect(() => validateSongData(song)).toThrow(/trigs\[0\]\.note/)
  })

  // ── Legacy compatibility ──

  it('accepts song without trackId on cells (legacy pre-ADR 079)', () => {
    const song = minimalSong()
    delete (song.patterns[0].cells[0] as Record<string, unknown>).trackId
    expect(() => validateSongData(song)).not.toThrow()
  })

  it('accepts song without scene (legacy)', () => {
    const song = minimalSong()
    delete (song as Record<string, unknown>).scene
    expect(() => validateSongData(song)).not.toThrow()
  })

  it('accepts song without effects (legacy)', () => {
    const song = minimalSong()
    delete (song as Record<string, unknown>).effects
    expect(() => validateSongData(song)).not.toThrow()
  })

  it('accepts v:1 export format', () => {
    const song = { v: 1, ...minimalSong(), exportedAt: Date.now() }
    expect(() => validateSongData(song)).not.toThrow()
  })

  // ── Scene validation ──

  it('rejects scene with non-array nodes', () => {
    const song = minimalSong()
    ;(song.scene as Record<string, unknown>).nodes = 'bad'
    expect(() => validateSongData(song)).toThrow(/scene\.nodes/)
  })

  // ── Optional fields ──

  it('accepts missing optional fields', () => {
    const song = minimalSong()
    delete (song as Record<string, unknown>).name
    delete (song as Record<string, unknown>).rootNote
    delete (song as Record<string, unknown>).masterGain
    delete (song as Record<string, unknown>).swing
    expect(() => validateSongData(song)).not.toThrow()
  })

  it('rejects wrong type for optional name', () => {
    const song = minimalSong() as Record<string, unknown>
    song.name = 123
    expect(() => validateSongData(song)).toThrow(/name/)
  })
})

describe('validateRecoverySnapshot', () => {
  it('accepts valid recovery snapshot', () => {
    const snapshot = {
      projectId: 'proj_123',
      song: minimalSong(),
      timestamp: Date.now(),
    }
    expect(() => validateRecoverySnapshot(snapshot)).not.toThrow()
  })

  it('accepts null projectId', () => {
    const snapshot = {
      projectId: null,
      song: minimalSong(),
      timestamp: Date.now(),
    }
    expect(() => validateRecoverySnapshot(snapshot)).not.toThrow()
  })

  it('rejects missing timestamp', () => {
    const snapshot = { projectId: null, song: minimalSong() }
    expect(() => validateRecoverySnapshot(snapshot)).toThrow(/timestamp/)
  })

  it('rejects invalid song inside snapshot', () => {
    const snapshot = {
      projectId: null,
      song: { bpm: 120 },  // missing tracks and patterns
      timestamp: Date.now(),
    }
    expect(() => validateRecoverySnapshot(snapshot)).toThrow(/tracks/)
  })

  it('rejects non-object', () => {
    expect(() => validateRecoverySnapshot(null)).toThrow(ValidationError)
  })
})
