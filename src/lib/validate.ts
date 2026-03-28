/**
 * Runtime validation for Song data loaded from JSON (import, recovery, IDB).
 * Ensures required fields exist and have correct types before passing to restoreSong.
 * Does NOT enforce business logic (e.g. BPM range) — that's restoreSongPure's job.
 */

import type { Song, Pattern, Cell, Trig, Track } from './types.ts'

export class ValidationError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'ValidationError'
  }
}

function assertType(path: string, value: unknown, expected: string): void {
  const actual = Array.isArray(value) ? 'array' : typeof value
  if (actual !== expected) {
    throw new ValidationError(path, `expected ${expected}, got ${actual}`)
  }
}

function assertOptionalType(path: string, value: unknown, expected: string): void {
  if (value == null) return
  assertType(path, value, expected)
}

function validateTonnetzAnchors(path: string, anchors: unknown): void {
  if (!Array.isArray(anchors)) throw new ValidationError(path, 'expected array')
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]
    if (typeof a !== 'object' || a === null) throw new ValidationError(`${path}[${i}]`, 'expected object')
    const anchor = a as Record<string, unknown>
    if (typeof anchor.step !== 'number') throw new ValidationError(`${path}[${i}].step`, 'expected number')
    if (!Array.isArray(anchor.chord) || anchor.chord.length !== 3) {
      throw new ValidationError(`${path}[${i}].chord`, 'expected 3-element array')
    }
  }
}

function validateTrig(path: string, t: unknown): Trig {
  if (typeof t !== 'object' || t === null) throw new ValidationError(path, 'expected object')
  const raw = t as Record<string, unknown>
  assertType(`${path}.active`, raw.active, 'boolean')
  assertType(`${path}.note`, raw.note, 'number')
  assertType(`${path}.velocity`, raw.velocity, 'number')
  // duration and slide may be missing in legacy saves — restoreCellPure handles defaults
  return t as Trig
}

function validateCell(path: string, c: unknown): Cell {
  if (typeof c !== 'object' || c === null) throw new ValidationError(path, 'expected object')
  const raw = c as Record<string, unknown>
  // trackId may be missing in legacy saves (pre-ADR 079) — restoreSongPure assigns fallback
  assertType(`${path}.name`, raw.name, 'string')
  assertType(`${path}.steps`, raw.steps, 'number')
  if (!Array.isArray(raw.trigs)) throw new ValidationError(`${path}.trigs`, 'expected array')
  raw.trigs.forEach((tr, i) => validateTrig(`${path}.trigs[${i}]`, tr))
  if (typeof raw.voiceParams !== 'object' || raw.voiceParams === null) {
    throw new ValidationError(`${path}.voiceParams`, 'expected object')
  }
  // ADR 114: insertFx is either array [slot0, slot1] or legacy single object (migrated in restoreCellPure)
  if (raw.insertFx != null) {
    if (Array.isArray(raw.insertFx)) {
      if (raw.insertFx.length !== 2) throw new ValidationError(`${path}.insertFx`, 'expected array of length 2')
      for (let i = 0; i < 2; i++) {
        const fx = raw.insertFx[i] as Record<string, unknown> | null
        if (fx == null) continue
        if (typeof fx !== 'object') throw new ValidationError(`${path}.insertFx[${i}]`, 'expected object or null')
        assertType(`${path}.insertFx[${i}].mix`, fx.mix, 'number')
        assertType(`${path}.insertFx[${i}].x`, fx.x, 'number')
        assertType(`${path}.insertFx[${i}].y`, fx.y, 'number')
      }
    } else if (typeof raw.insertFx !== 'object') {
      throw new ValidationError(`${path}.insertFx`, 'expected array or object')
    }
  }
  // ADR 112: optional per-track step scale
  assertOptionalType(`${path}.scale`, raw.scale, 'number')
  // ADR 110: optional per-cell sample reference
  if (raw.sampleRef != null) {
    if (typeof raw.sampleRef !== 'object') throw new ValidationError(`${path}.sampleRef`, 'expected object')
    const sr = raw.sampleRef as Record<string, unknown>
    assertType(`${path}.sampleRef.name`, sr.name, 'string')
    assertOptionalType(`${path}.sampleRef.packId`, sr.packId, 'string')
  }
  return c as Cell
}

function validatePattern(path: string, p: unknown): Pattern {
  if (typeof p !== 'object' || p === null) throw new ValidationError(path, 'expected object')
  const raw = p as Record<string, unknown>
  assertType(`${path}.id`, raw.id, 'string')
  assertType(`${path}.name`, raw.name, 'string')
  assertOptionalType(`${path}.rootNote`, raw.rootNote, 'number')
  if (!Array.isArray(raw.cells)) throw new ValidationError(`${path}.cells`, 'expected array')
  raw.cells.forEach((c, i) => validateCell(`${path}.cells[${i}]`, c))
  return p as Pattern
}

function validateTrack(path: string, t: unknown): Track {
  if (typeof t !== 'object' || t === null) throw new ValidationError(path, 'expected object')
  const raw = t as Record<string, unknown>
  assertType(`${path}.id`, raw.id, 'number')
  assertType(`${path}.muted`, raw.muted, 'boolean')
  assertType(`${path}.volume`, raw.volume, 'number')
  assertType(`${path}.pan`, raw.pan, 'number')
  return t as Track
}

/**
 * Validate that a parsed JSON object has the required Song structure.
 * Throws ValidationError with a descriptive path if any field is missing or wrong type.
 * Accepts both v:1 export format and raw Song objects.
 */
export function validateSongData(data: unknown): Song {
  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('root', 'expected object')
  }
  const raw = data as Record<string, unknown>

  // Required top-level fields
  assertType('bpm', raw.bpm, 'number')
  if (!isFinite(raw.bpm as number) || (raw.bpm as number) <= 0) {
    throw new ValidationError('bpm', 'must be a positive finite number')
  }

  if (!Array.isArray(raw.tracks)) throw new ValidationError('tracks', 'expected array')
  if (raw.tracks.length === 0) throw new ValidationError('tracks', 'must not be empty')
  raw.tracks.forEach((t, i) => validateTrack(`tracks[${i}]`, t))

  if (!Array.isArray(raw.patterns)) throw new ValidationError('patterns', 'expected array')
  if (raw.patterns.length === 0) throw new ValidationError('patterns', 'must not be empty')
  raw.patterns.forEach((p, i) => validatePattern(`patterns[${i}]`, p))

  // Optional fields — just type-check if present
  assertOptionalType('name', raw.name, 'string')
  assertOptionalType('rootNote', raw.rootNote, 'number')
  assertOptionalType('masterGain', raw.masterGain, 'number')
  assertOptionalType('swing', raw.swing, 'number')

  // scene is required but may be minimal
  if (raw.scene != null) {
    if (typeof raw.scene !== 'object') throw new ValidationError('scene', 'expected object')
    const scene = raw.scene as Record<string, unknown>
    if (scene.nodes != null && !Array.isArray(scene.nodes)) {
      throw new ValidationError('scene.nodes', 'expected array')
    }
    if (scene.edges != null && !Array.isArray(scene.edges)) {
      throw new ValidationError('scene.edges', 'expected array')
    }
    // Validate generative node params (ADR 126, ADR 127)
    if (Array.isArray(scene.nodes)) {
      for (let i = 0; i < scene.nodes.length; i++) {
        const node = scene.nodes[i] as Record<string, unknown>
        if (node?.generative && typeof node.generative === 'object') {
          const gen = node.generative as Record<string, unknown>
          if (gen.params && typeof gen.params === 'object') {
            const p = gen.params as Record<string, unknown>
            if (p.engine === 'tonnetz') {
              if (p.anchors != null) validateTonnetzAnchors(`scene.nodes[${i}].generative.params.anchors`, p.anchors)
              if (p.sequence != null && !Array.isArray(p.sequence)) throw new ValidationError(`scene.nodes[${i}].generative.params.sequence`, 'expected array')
            }
            if (p.engine === 'quantizer') {
              // ADR 127: validate chords array if present
              if (p.chords != null) {
                if (!Array.isArray(p.chords)) throw new ValidationError(`scene.nodes[${i}].generative.params.chords`, 'expected array')
                for (let j = 0; j < (p.chords as unknown[]).length; j++) {
                  const c = (p.chords as Record<string, unknown>[])[j]
                  if (typeof c !== 'object' || c === null) throw new ValidationError(`scene.nodes[${i}].generative.params.chords[${j}]`, 'expected object')
                  if (typeof c.step !== 'number') throw new ValidationError(`scene.nodes[${i}].generative.params.chords[${j}].step`, 'expected number')
                  if (!Array.isArray(c.notes)) throw new ValidationError(`scene.nodes[${i}].generative.params.chords[${j}].notes`, 'expected array')
                }
              }
              // ADR 127: validate harmonyVoices array if present
              if (p.harmonyVoices != null) {
                if (!Array.isArray(p.harmonyVoices)) throw new ValidationError(`scene.nodes[${i}].generative.params.harmonyVoices`, 'expected array')
                for (let j = 0; j < (p.harmonyVoices as unknown[]).length; j++) {
                  const v = (p.harmonyVoices as Record<string, unknown>[])[j]
                  if (typeof v !== 'object' || v === null) throw new ValidationError(`scene.nodes[${i}].generative.params.harmonyVoices[${j}]`, 'expected object')
                  if (typeof v.interval !== 'number') throw new ValidationError(`scene.nodes[${i}].generative.params.harmonyVoices[${j}].interval`, 'expected number')
                }
              }
            }
          }
        }
      }
    }
  }

  return data as Song
}

/**
 * Validate a recovery snapshot structure.
 */
export function validateRecoverySnapshot(data: unknown): { projectId: string | null; song: Song; timestamp: number } {
  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('recovery', 'expected object')
  }
  const raw = data as Record<string, unknown>
  assertType('recovery.timestamp', raw.timestamp, 'number')
  if (raw.projectId != null) assertType('recovery.projectId', raw.projectId, 'string')
  validateSongData(raw.song)
  return data as { projectId: string | null; song: Song; timestamp: number }
}
