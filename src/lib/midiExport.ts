/**
 * MIDI Export — Standard MIDI File Type 1 encoder (ADR 030 Phase 1).
 * Zero dependencies. Exports current pattern as .mid file.
 */

import { song, ui, cellForTrack } from './state.svelte.ts'

const PPQN = 96              // ticks per quarter note
const TICKS_PER_STEP = PPQN / 4  // 24 ticks per 16th note

// ── Variable-length quantity encoding (MIDI spec) ────────────────────────────

function writeVLQ(value: number): number[] {
  if (value < 0) value = 0
  if (value < 0x80) return [value]
  const bytes: number[] = []
  bytes.unshift(value & 0x7F)
  value >>= 7
  while (value > 0) {
    bytes.unshift((value & 0x7F) | 0x80)
    value >>= 7
  }
  return bytes
}

// ── Track builders ───────────────────────────────────────────────────────────

interface MidiEvent {
  tick: number
  data: number[]  // raw MIDI bytes (status + data)
}

function buildTempoTrack(bpm: number): Uint8Array {
  const microsPerBeat = Math.round(60_000_000 / bpm)
  const events: number[] = []

  // Delta=0, Meta event FF 51 03, tempo (3 bytes big-endian)
  events.push(0x00)  // delta
  events.push(0xFF, 0x51, 0x03)
  events.push((microsPerBeat >> 16) & 0xFF)
  events.push((microsPerBeat >> 8) & 0xFF)
  events.push(microsPerBeat & 0xFF)

  // End of track
  events.push(0x00, 0xFF, 0x2F, 0x00)

  return wrapTrack(new Uint8Array(events))
}

function buildNoteTrack(channel: number, trigs: { active: boolean; note: number; velocity: number; duration: number; notes?: number[] }[], steps: number): Uint8Array {
  // Collect note-on and note-off events
  const events: MidiEvent[] = []
  const ch = channel & 0x0F

  for (let step = 0; step < steps; step++) {
    const trig = trigs[step]
    if (!trig || !trig.active) continue

    const tick = step * TICKS_PER_STEP
    const dur = (trig.duration ?? 1) * TICKS_PER_STEP
    const vel = Math.max(1, Math.min(127, Math.round(trig.velocity * 127)))

    // Support poly notes
    const notes = trig.notes ?? [trig.note]
    for (const note of notes) {
      events.push({ tick, data: [0x90 | ch, note, vel] })
      events.push({ tick: tick + dur, data: [0x80 | ch, note, 0] })
    }
  }

  // Sort by tick, then note-off before note-on at same tick
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick
    // Note-off (0x80) before note-on (0x90) at same tick
    return (a.data[0] & 0xF0) - (b.data[0] & 0xF0)
  })

  // Encode with delta times
  const bytes: number[] = []
  let lastTick = 0
  for (const ev of events) {
    const delta = ev.tick - lastTick
    bytes.push(...writeVLQ(delta))
    bytes.push(...ev.data)
    lastTick = ev.tick
  }

  // End of track
  bytes.push(0x00, 0xFF, 0x2F, 0x00)

  return wrapTrack(new Uint8Array(bytes))
}

function wrapTrack(data: Uint8Array): Uint8Array {
  // MTrk + 4-byte length + data
  const header = new Uint8Array(8)
  const view = new DataView(header.buffer)
  header[0] = 0x4D; header[1] = 0x54; header[2] = 0x72; header[3] = 0x6B  // "MTrk"
  view.setUint32(4, data.length)
  const result = new Uint8Array(8 + data.length)
  result.set(header)
  result.set(data, 8)
  return result
}

// ── File assembly ────────────────────────────────────────────────────────────

function buildMidiFile(tracks: Uint8Array[]): Uint8Array {
  // MThd header: 14 bytes
  const header = new Uint8Array(14)
  const view = new DataView(header.buffer)
  header[0] = 0x4D; header[1] = 0x54; header[2] = 0x68; header[3] = 0x64  // "MThd"
  view.setUint32(4, 6)             // header length = 6
  view.setUint16(8, 1)             // format type 1 (multi-track)
  view.setUint16(10, tracks.length)
  view.setUint16(12, PPQN)

  let totalLen = 14
  for (const t of tracks) totalLen += t.length
  const result = new Uint8Array(totalLen)
  result.set(header)
  let offset = 14
  for (const t of tracks) {
    result.set(t, offset)
    offset += t.length
  }
  return result
}

// ── Public API ───────────────────────────────────────────────────────────────

export function exportPatternMidi(): Blob {
  const pat = song.patterns[ui.currentPattern]
  const tracks: Uint8Array[] = []

  // Track 0: tempo
  tracks.push(buildTempoTrack(song.bpm))

  // Track 1–N: note data per track
  for (let i = 0; i < song.tracks.length; i++) {
    const t = song.tracks[i]
    const cell = cellForTrack(pat, t.id)
    if (!cell || !cell.voiceId) continue
    tracks.push(buildNoteTrack(i, cell.trigs, cell.steps))
  }

  const data = buildMidiFile(tracks)
  return new Blob([data.buffer as ArrayBuffer], { type: 'audio/midi' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAndDownloadMidi(): void {
  const pat = song.patterns[ui.currentPattern]
  const name = pat.name || `pattern_${String(ui.currentPattern).padStart(2, '0')}`
  const blob = exportPatternMidi()
  downloadBlob(blob, `${name}.mid`)
}
