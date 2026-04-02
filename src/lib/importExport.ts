/**
 * Project export/import JSON + demo song loading.
 * Extracted from state.svelte.ts for cohesion.
 */
import type { SampleMeta } from './types.ts'
import { song, ui, project, cloneSong, restoreSong, clearUndoStacks, cellForTrack, samplesByCell } from './state.svelte.ts'
import { clearSamples, setSample, setSamplePack } from './sampleActions.ts'
import { projectSaveAs } from './projectActions.ts'
import { validateSongData } from './validate.ts'
import { makeDemoSong } from './demo.ts'

const audioPool = () => import('./audioPool.ts')

// ── Base64 helpers ───────────────────────────────────────────────────

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// ── Shared sample restore (deduplicates importProjectJSON + projectLoadDemo) ──

async function restoreEmbeddedSamples(samples: Record<string, { name: string; packId?: string; buffer?: string }>): Promise<void> {
  const { engine } = await import('./audio/engine.ts')
  for (const [key, entry] of Object.entries(samples)) {
    const isLegacy = !key.includes('_')  // v2: "0", "1" etc.
    const trackId = isLegacy ? Number(key) : Number(key.split('_')[0])
    const patternIndices = isLegacy
      ? song.patterns.map((_, i) => i).filter(i => {
          const cell = cellForTrack(song.patterns[i], trackId)
          return cell && cell.voiceId === 'Sampler'
        })
      : [Number(key.split('_')[1])]

    for (const pi of patternIndices) {
      if (entry.packId) {
        try {
          const mod = await audioPool()
          const zones = await mod.loadPackZones(entry.packId)
          const waveform = await engine.loadPackToTrack(trackId, zones, pi)
          if (waveform) setSamplePack(trackId, pi, entry.name, waveform, new ArrayBuffer(0), entry.packId)
        } catch (e) {
          console.warn(`[import] pack restore failed for ${entry.packId}:`, e)
        }
      } else if (entry.buffer) {
        const rawBuffer = base64ToBuffer(entry.buffer)
        const waveform = await engine.loadSampleFromBuffer(trackId, rawBuffer, pi)
        if (waveform) setSample(trackId, pi, entry.name, waveform, rawBuffer)
      }
    }
  }
}

/** Reset UI/undo state for a fresh project (shared by import + demo) */
function resetProjectState(): void {
  ui.currentPattern = 0
  ui.selectedTrack = 0
  ui.patternSheet = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  clearUndoStacks()
}

// ── Public API ───────────────────────────────────────────────────────

/** Export current project as a downloadable .inboil.json file */
export function exportProjectJSON(): void {
  const snapshot = cloneSong()
  // Serialize samples per cell (ADR 110): key = "trackId_patternIndex"
  const samples: Record<string, { name: string; packId?: string; buffer?: string }> = {}
  for (const [key, meta] of Object.entries(samplesByCell) as [string, SampleMeta][]) {
    if (meta.packId) {
      samples[key] = { name: meta.name, packId: meta.packId }
    } else if (meta.rawBuffer.byteLength > 0) {
      samples[key] = { name: meta.name, buffer: bufferToBase64(meta.rawBuffer) }
    }
  }
  const payload = { v: 3 as const, ...snapshot, samples, exportedAt: Date.now() }
  const json = JSON.stringify(payload)
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${song.name || 'untitled'}.inboil.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Import a project from JSON string — creates a new unsaved project */
export async function importProjectJSON(json: string): Promise<void> {
  const data = JSON.parse(json)
  const validated = validateSongData(data)
  restoreSong(validated)
  clearSamples()
  project.id = null
  project.dirty = false
  resetProjectState()
  // Persist immediately so the imported project isn't lost on page close
  await projectSaveAs(song.name || 'Untitled')
  // Restore embedded samples (v2: trackId keys, v3: trackId_patternIndex keys)
  const samples = data.samples as Record<string, { name: string; packId?: string; buffer?: string }> | undefined
  if (samples) await restoreEmbeddedSamples(samples)
}

/** Load factory demo patterns as a new unsaved project */
export async function projectLoadFactory(): Promise<void> {
  return projectLoadDemo()
}

/** Load demo project (welcome overlay) — fetches demo-song.json from public/ */
export async function projectLoadDemo(): Promise<void> {
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'demo-song.json')
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    const data = await res.json()
    const validated = validateSongData(data)
    restoreSong(validated)
    clearSamples()
    project.id = null
    project.dirty = true
    resetProjectState()
    // Restore embedded samples
    const samples = data.samples as Record<string, { name: string; packId?: string; buffer?: string }> | undefined
    if (samples) await restoreEmbeddedSamples(samples)
  } catch (e) {
    console.error('[demo] Failed to load demo song, falling back to built-in:', e)
    restoreSong(makeDemoSong())
    clearSamples()
    project.id = null
    project.dirty = true
    resetProjectState()
  }
}
