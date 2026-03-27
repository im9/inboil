/**
 * Audio pool CRUD — initPool, refreshPool, import/delete/move/rename/assign.
 * Extracted from state.svelte.ts for cohesion.
 */
import type { PoolEntry } from './audioPool.ts'
import { ui, pool } from './state.svelte.ts'
import { setSample, setSamplePack } from './sampleActions.ts'
import { showToast } from './toast.svelte.ts'

const audioPool = () => import('./audioPool.ts')

/** Install factory samples on first launch, then refresh pool. */
export async function initPool(): Promise<void> {
  try {
    const mod = await audioPool()
    const needs = mod.needsFactoryInstall()
    if (needs) {
      pool.loading = true
      const result = await mod.installFactorySamples((done, total) => {
        pool.factoryProgress = { done, total }
      })
      pool.factoryProgress = null
      if (result.installed > 0) {
        showToast(`${result.installed} factory samples installed`, 'info')
      }
    }
  } catch (e) {
    console.warn('[pool] factory install failed:', e)
  }
  await refreshPool()
}

/** Refresh pool entries and stats from IndexedDB + OPFS. */
export async function refreshPool(): Promise<void> {
  pool.loading = true
  try {
    const mod = await audioPool()
    const [entries, folders, stats] = await Promise.all([
      mod.loadAllMeta(),
      mod.listFolders(),
      mod.getPoolStats(),
    ])
    pool.entries = entries
    pool.folders = folders
    pool.stats = stats
  } catch (e) {
    console.warn('[pool] refresh failed:', e)
  }
  pool.loading = false
}

/** Import files into the pool and refresh state. */
export async function poolImportFiles(files: File[], folder?: string): Promise<void> {
  const mod = await audioPool()
  const results = await mod.importFiles(files, folder)
  const dupeCount = results.filter(r => r.duplicate).length
  const newCount = results.length - dupeCount
  if (newCount > 0) showToast(`${newCount} sample${newCount > 1 ? 's' : ''} added to pool`, 'info')
  if (dupeCount > 0) showToast(`${dupeCount} duplicate${dupeCount > 1 ? 's' : ''} skipped`, 'info')
  if (results.length > 0) {
    await refreshPool()
    if (pool.stats.warning) {
      showToast(`Pool storage at ${(pool.stats.usageRatio * 100).toFixed(0)}% (${(pool.stats.totalSize / 1024 / 1024).toFixed(1)}MB / ${(pool.stats.limitBytes / 1024 / 1024).toFixed(0)}MB)`, 'warn')
    }
  }
}

/** Delete a sample from the pool and refresh state. */
export async function poolDeleteEntry(id: string): Promise<void> {
  const mod = await audioPool()
  await mod.deleteFromPool(id)
  await refreshPool()
}

/** Move a pool sample to a different folder and refresh state. */
export async function poolMoveEntry(id: string, newFolder: string): Promise<void> {
  const mod = await audioPool()
  await mod.moveToFolder(id, newFolder)
  await refreshPool()
}

/** Rename a pool sample and refresh state. */
export async function poolRenameEntry(id: string, newName: string): Promise<void> {
  const mod = await audioPool()
  await mod.renameEntry(id, newName)
  await refreshPool()
}

/** Assign a pool sample to the current track. Reads from OPFS, decodes, and sets on track. */
export async function poolAssignToTrack(entry: PoolEntry, trackId: number, patternIndex = ui.currentPattern): Promise<void> {
  const mod = await audioPool()
  const rawBuffer = await mod.readSample(entry)
  if (!rawBuffer) { showToast('Sample not found in pool', 'error'); return }
  const { engine } = await import('./audio/engine.ts') // REFACTOR-OK: lazy import — intentional to avoid top-level circular dep + keep engine tree-shakeable
  const result = await engine.loadUserSample(trackId, new File([rawBuffer], entry.name), patternIndex)
  if (result) {
    setSample(trackId, patternIndex, entry.name, result.waveform, result.rawBuffer)
  }
}

/** Assign a factory pack to the current track+pattern. Loads all zones and sends to worklet. (ADR 106) */
export async function poolAssignPackToTrack(packId: string, packName: string, trackId: number, patternIndex = ui.currentPattern): Promise<void> {
  const mod = await audioPool()
  const zones = await mod.loadPackZones(packId)
  if (!zones.length) { showToast('Pack has no zones', 'error'); return }
  const { engine } = await import('./audio/engine.ts')
  const waveform = await engine.loadPackToTrack(trackId, zones, patternIndex)
  if (waveform) {
    setSamplePack(trackId, patternIndex, packName, waveform, zones[0].buffer.buffer as ArrayBuffer, packId)
  }
}
