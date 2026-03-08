/**
 * storage.ts — IndexedDB persistence layer (ADR 020).
 * Stores projects (song + effects) as named snapshots.
 * Stores user samples as raw audio buffers per project+track.
 */
import type { Song } from './state.svelte.ts'

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

const DB_NAME = 'inboil'
const DB_VERSION = 2
const STORE = 'projects'
const SAMPLE_STORE = 'samples'

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
    }
    req.onsuccess = () => resolve(req.result)
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
