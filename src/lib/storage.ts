/**
 * storage.ts — IndexedDB persistence layer (ADR 020).
 * Stores projects (song + effects) as named snapshots.
 */
import type { Song } from './state.svelte.ts'

export interface StoredProject {
  id: string
  name: string
  song: Song
  createdAt: number
  updatedAt: number
}

const DB_NAME = 'inboil'
const DB_VERSION = 1
const STORE = 'projects'

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
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
  return dbPromise
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return open().then(db => db.transaction(STORE, mode).objectStore(STORE))
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

/** List all projects (lightweight: id + name + timestamps) */
export async function listProjects(): Promise<Pick<StoredProject, 'id' | 'name' | 'createdAt' | 'updatedAt'>[]> {
  const store = await tx('readonly')
  const all: StoredProject[] = await req(store.getAll())
  return all
    .map(p => ({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Load a full project by id */
export async function loadProject(id: string): Promise<StoredProject | null> {
  const store = await tx('readonly')
  const result = await req(store.get(id))
  return result ?? null
}

/** Save (upsert) a project */
export async function saveProject(project: StoredProject): Promise<void> {
  const store = await tx('readwrite')
  await req(store.put(project))
}

/** Delete a project by id */
export async function deleteProject(id: string): Promise<void> {
  const store = await tx('readwrite')
  await req(store.delete(id))
}
