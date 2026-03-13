/**
 * storage.ts — IndexedDB persistence layer (ADR 020).
 * Stores projects (song + effects) as named snapshots.
 * Stores user samples as raw audio buffers per project+track.
 */
import type { Song } from './types.ts'
import { showToast } from './toast.svelte.ts'

export interface StoredProject {
  id: string
  name: string
  song: Song
  createdAt: number
  updatedAt: number
}

/** Persisted sample buffer (ADR 020 Section I, Phase A) */
export interface StoredSample {
  key: string          // `${projectId}_${trackId}`
  projectId: string
  trackId: number
  name: string         // original filename
  buffer: ArrayBuffer  // raw encoded audio bytes (pre-decode)
  createdAt: number
}

/** User-saved voice preset (ADR 015 §B) */
export interface StoredPreset {
  id?: number             // auto-increment
  voiceId: string         // which voice this preset is for
  name: string            // user-given name (max 16 chars)
  params: Record<string, number>
  createdAt: number
}

const DB_NAME = 'inboil'
const DB_VERSION = 3
const STORE = 'projects'
const SAMPLE_STORE = 'samples'
const PRESET_STORE = 'presets'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SAMPLE_STORE)) {
        const ss = db.createObjectStore(SAMPLE_STORE, { keyPath: 'key' })
        ss.createIndex('projectId', 'projectId', { unique: false })
      }
      if (!db.objectStoreNames.contains(PRESET_STORE)) {
        const ps = db.createObjectStore(PRESET_STORE, { keyPath: 'id', autoIncrement: true })
        ps.createIndex('voiceId', 'voiceId', { unique: false })
      }
    }
    req.onblocked = () => { showToast('DB upgrade blocked — close other tabs and reload', 'warn') }
    req.onsuccess = () => {
      const db = req.result
      // When another tab opens a newer DB version, close this connection
      // so the upgrade isn't blocked (the user will reload this tab anyway)
      db.onversionchange = () => { db.close(); dbPromise = null }
      // Request persistent storage so the browser won't evict our data
      navigator.storage?.persist?.()
      resolve(db)
    }
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
  return dbPromise
}

function tx(store: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return open().then(db => db.transaction(store, mode).objectStore(store))
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

// ── Projects ─────────────────────────────────────────────────────────

/** List all projects (lightweight: id + name + timestamps) */
export async function listProjects(): Promise<Pick<StoredProject, 'id' | 'name' | 'createdAt' | 'updatedAt'>[]> {
  const store = await tx(STORE, 'readonly')
  const all: StoredProject[] = await req(store.getAll())
  return all
    .map(p => ({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Load a full project by id */
export async function loadProject(id: string): Promise<StoredProject | null> {
  const store = await tx(STORE, 'readonly')
  const result = await req(store.get(id))
  return result ?? null
}

/** Save (upsert) a project */
export async function saveProject(project: StoredProject): Promise<void> {
  const store = await tx(STORE, 'readwrite')
  await req(store.put(project))
}

/** Delete a project by id */
export async function deleteProject(id: string): Promise<void> {
  const store = await tx(STORE, 'readwrite')
  await req(store.delete(id))
}

// ── Samples (ADR 020 Section I, Phase A) ─────────────────────────────

/** Save a sample buffer for a project+track */
export async function saveSample(projectId: string, trackId: number, name: string, buffer: ArrayBuffer): Promise<void> {
  const store = await tx(SAMPLE_STORE, 'readwrite')
  const sample: StoredSample = {
    key: `${projectId}_${trackId}`,
    projectId,
    trackId,
    name,
    buffer,
    createdAt: Date.now(),
  }
  await req(store.put(sample))
}

/** Load all samples for a project */
export async function loadSamples(projectId: string): Promise<StoredSample[]> {
  const store = await tx(SAMPLE_STORE, 'readonly')
  const index = store.index('projectId')
  return req(index.getAll(projectId))
}

/** Delete all samples for a project */
export async function deleteSamples(projectId: string): Promise<void> {
  const store = await tx(SAMPLE_STORE, 'readwrite')
  const index = store.index('projectId')
  const keys: string[] = await req(index.getAllKeys(projectId) as IDBRequest<string[]>)
  for (const key of keys) store.delete(key)
}

/** Delete a single sample for a project+track */
export async function deleteSample(projectId: string, trackId: number): Promise<void> {
  const store = await tx(SAMPLE_STORE, 'readwrite')
  await req(store.delete(`${projectId}_${trackId}`))
}

// ── User Presets (ADR 015 §B) ────────────────────────────────────────

/** Save a user preset, returns the auto-incremented id */
export async function saveUserPreset(voiceId: string, name: string, params: Record<string, number>): Promise<number> {
  const store = await tx(PRESET_STORE, 'readwrite')
  const preset: StoredPreset = { voiceId, name: name.slice(0, 16), params, createdAt: Date.now() }
  return req(store.add(preset) as IDBRequest<number>)
}

/** Load all user presets for a voice */
export async function loadUserPresets(voiceId: string): Promise<StoredPreset[]> {
  const store = await tx(PRESET_STORE, 'readonly')
  const index = store.index('voiceId')
  return req(index.getAll(voiceId))
}

/** Load all user presets */
export async function loadAllUserPresets(): Promise<StoredPreset[]> {
  const store = await tx(PRESET_STORE, 'readonly')
  return req(store.getAll())
}

/** Reset module state (test only) */
export function _resetForTest(): void {
  dbPromise = null
}

/** Delete a user preset by id */
export async function deleteUserPreset(id: number): Promise<void> {
  const store = await tx(PRESET_STORE, 'readwrite')
  await req(store.delete(id))
}

/** Rename a user preset */
export async function renameUserPreset(id: number, name: string): Promise<void> {
  const store = await tx(PRESET_STORE, 'readwrite')
  const existing: StoredPreset | undefined = await req(store.get(id))
  if (!existing) return
  existing.name = name.slice(0, 16)
  await req(store.put(existing))
}
