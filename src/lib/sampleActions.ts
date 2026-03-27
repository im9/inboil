/**
 * Sample persistence — setSample, restoreSamples, copySamplesForPattern, etc.
 * Extracted from state.svelte.ts for cohesion.
 */
import type { Cell } from './types.ts'
import { song, project, samplesByCell, cellForTrack, bumpSongVersion } from './state.svelte.ts'
import { showToast } from './toast.svelte.ts'

const storage = () => import('./storage.ts')
const audioPool = () => import('./audioPool.ts')

/** Compose a samplesByCell key */
export function sampleCellKey(trackId: number, patternIndex: number): string {
  return `${trackId}_${patternIndex}`
}

/** Store a loaded sample in memory + persist to IndexedDB + set cell.sampleRef (ADR 110) */
export function setSample(trackId: number, patternIndex: number, name: string, waveform: Float32Array, rawBuffer: ArrayBuffer): void {
  samplesByCell[sampleCellKey(trackId, patternIndex)] = { name, waveform, rawBuffer }
  // Set sampleRef on the Cell
  const cell = cellForTrack(song.patterns[patternIndex], trackId)
  if (cell) cell.sampleRef = { name }
  if (project.id) void storage().then(s => s.saveSample(project.id!, trackId, patternIndex, name, rawBuffer))
    .catch(e => { console.warn('[sample] save failed:', e); showToast('Sample save failed', 'error') })
}

/** Store a factory pack reference in memory + persist packId to IndexedDB (ADR 106, 110) */
export function setSamplePack(trackId: number, patternIndex: number, name: string, waveform: Float32Array, primaryBuffer: ArrayBuffer, packId: string): void {
  samplesByCell[sampleCellKey(trackId, patternIndex)] = { name, waveform, rawBuffer: primaryBuffer, packId }
  const cell = cellForTrack(song.patterns[patternIndex], trackId)
  if (cell) cell.sampleRef = { name, packId }
  if (project.id) void storage().then(s => s.saveSample(project.id!, trackId, patternIndex, name, new ArrayBuffer(0), packId))
    .catch(e => { console.warn('[sample] pack save failed:', e); showToast('Sample save failed', 'error') })
}

/** Copy sample references from one pattern index to another (for pattern duplicate/paste) */
export function copySamplesForPattern(srcIndex: number, dstIndex: number): void {
  const pat = song.patterns[srcIndex]
  if (!pat) return
  for (const cell of pat.cells) {
    const srcKey = sampleCellKey(cell.trackId, srcIndex)
    const meta = samplesByCell[srcKey]
    if (!meta) continue
    const dstKey = sampleCellKey(cell.trackId, dstIndex)
    // Copy in-memory sample metadata
    samplesByCell[dstKey] = { ...meta }
    // Copy engine cache (packZones / userSamples)
    void import('./audio/engine.ts').then(({ engine }) => {
      engine.copySampleCache(srcKey, dstKey)
    }).catch(e => console.warn('[sample] cache copy failed:', e))
    // Persist to IDB
    if (project.id) {
      void storage().then(s => s.saveSample(project.id!, cell.trackId, dstIndex, meta.name, meta.rawBuffer, meta.packId))
        .catch(e => { console.warn('[sample] copy save failed:', e); showToast('Sample save failed', 'error') })
    }
  }
}

/** Persist any pending samples after project gets an id (called from projectSaveAs) */
export async function persistPendingSamples(projectId: string): Promise<void> {
  for (const [key, meta] of Object.entries(samplesByCell)) {
    const [tid, pi] = key.split('_').map(Number)
    await (await storage()).saveSample(projectId, tid, pi, meta.name, meta.rawBuffer, meta.packId)
  }
}

/** Restore samples from IndexedDB — decode + cache in engine (sent on next sendPattern) */
export async function restoreSamples(projectId: string): Promise<void> {
  clearSamples()
  const stored = await (await storage()).loadSamples(projectId)
  if (stored.length === 0) return
  const { engine } = await import('./audio/engine.ts')
  for (const s of stored) {
    // Detect old format (pre-ADR 110): patternIndex missing or undefined
    const isLegacy = s.patternIndex == null
    const patternIndices = isLegacy
      ? song.patterns.map((_, i) => i).filter(i => {
          const cell = cellForTrack(song.patterns[i], s.trackId)
          return cell && (cell.voiceId === 'Sampler')
        })
      : [s.patternIndex]

    for (const pi of patternIndices) {
      // Guard: pattern may have been removed/replaced during async restore
      if (!song.patterns[pi]) continue
      const key = sampleCellKey(s.trackId, pi)
      if (s.packId) {
        try {
          const mod = await audioPool()
          const zones = await mod.loadPackZones(s.packId)
          const waveform = await engine.loadPackToTrack(s.trackId, zones, pi)
          if (waveform) {
            samplesByCell[key] = { name: s.name, waveform, rawBuffer: new ArrayBuffer(0), packId: s.packId }
            const cell = cellForTrack(song.patterns[pi], s.trackId)
            if (cell) cell.sampleRef = { name: s.name, packId: s.packId }
          }
        } catch (e) {
          console.warn(`[sample] pack restore failed for ${s.packId}:`, e)
        }
      } else {
        const waveform = await engine.loadSampleFromBuffer(s.trackId, s.buffer, pi)
        if (waveform) {
          samplesByCell[key] = { name: s.name, waveform, rawBuffer: s.buffer }
          const cell = cellForTrack(song.patterns[pi], s.trackId)
          if (cell) cell.sampleRef = { name: s.name }
        }
      }
      // Migrate old entry to new format
      if (isLegacy && project.id) {
        void storage().then(st => st.saveSample(project.id!, s.trackId, pi, s.name, s.buffer, s.packId))
          .catch(e => console.warn('[sample] migration save failed:', e))
      }
    }
  }
  // Trigger pattern re-send so _autoLoadSamples picks up newly cached samples.
  bumpSongVersion()
}

/** Clear all in-memory sample state */
export function clearSamples(): void {
  for (const k of Object.keys(samplesByCell)) delete samplesByCell[k]
}

/** Display name for a track: use sampleRef first, then in-memory lookup (ADR 110) */
export function trackDisplayName(cell: Cell, patternIndex?: number): string {
  if (cell.voiceId === 'Sampler') {
    if (cell.sampleRef?.name) return cell.sampleRef.name
    if (patternIndex != null) {
      const meta = samplesByCell[sampleCellKey(cell.trackId, patternIndex)]
      if (meta?.name) return meta.name
    }
  }
  return cell.name
}
