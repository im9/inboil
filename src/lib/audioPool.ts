/**
 * audioPool.ts — OPFS-based persistent sample library (ADR 104).
 *
 * OPFS stores raw audio files (deduped by content hash).
 * IndexedDB 'pool-meta' stores lightweight metadata for fast browsing.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface PoolEntry {
  id: string              // content hash (dedup key)
  path: string            // OPFS path: "kicks/808_kick.wav"
  name: string            // display name (filename without extension)
  folder: string          // "kicks", "snares", "loops", "unsorted"
  duration: number        // seconds
  sampleRate: number
  size: number            // bytes
  waveform: Float32Array  // 128-point overview for visual preview
  addedAt: number         // Date.now()
}

/** Serialisable version of PoolEntry for IndexedDB (waveform as plain array). */
interface StoredPoolEntry {
  id: string
  path: string
  name: string
  folder: string
  duration: number
  sampleRate: number
  size: number
  waveform: number[]      // JSON-safe
  addedAt: number
}

// ── Constants ────────────────────────────────────────────────────────

const POOL_ROOT = 'inboil-pool'
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_DURATION = 10                  // seconds
const WAVEFORM_POINTS = 128

// ── OPFS helpers ─────────────────────────────────────────────────────

/** Get (or create) the pool root directory in OPFS. */
async function poolRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(POOL_ROOT, { create: true })
}

/** Get (or create) a subfolder inside the pool. Supports nested paths like "factory/kicks". */
async function poolFolder(folder: string): Promise<FileSystemDirectoryHandle> {
  let dir = await poolRoot()
  for (const segment of folder.split('/')) {
    if (segment) dir = await dir.getDirectoryHandle(segment, { create: true })
  }
  return dir
}

/** Write raw bytes to OPFS at folder/filename. */
async function writeFile(folder: string, filename: string, data: ArrayBuffer): Promise<void> {
  const dir = await poolFolder(folder)
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

/** Read raw bytes from OPFS at folder/filename. Returns null if not found. */
export async function readFile(folder: string, filename: string): Promise<ArrayBuffer | null> {
  try {
    const dir = await poolFolder(folder)
    const fileHandle = await dir.getFileHandle(filename)
    const file = await fileHandle.getFile()
    return file.arrayBuffer()
  } catch {
    return null
  }
}

/** Delete a file from OPFS. */
async function removeFile(folder: string, filename: string): Promise<void> {
  try {
    const dir = await poolFolder(folder)
    await dir.removeEntry(filename)
  } catch {
    // file already gone — ok
  }
}

/** List all folders in the pool. */
export async function listFolders(): Promise<string[]> {
  const root = await poolRoot()
  const folders: string[] = []
  for await (const [name, handle] of (root as any).entries()) {
    if (handle.kind === 'directory') folders.push(name)
  }
  return folders.sort()
}

// ── Content hash (dedup) ─────────────────────────────────────────────

/** SHA-256 of first 64KB + file size → hex string. Fast dedup without reading entire file. */
export async function contentHash(buffer: ArrayBuffer): Promise<string> {
  const slice = buffer.slice(0, 65536)
  const sizeBytes = new Uint8Array(8)
  new DataView(sizeBytes.buffer).setFloat64(0, buffer.byteLength)
  const combined = new Uint8Array(slice.byteLength + 8)
  combined.set(new Uint8Array(slice), 0)
  combined.set(sizeBytes, slice.byteLength)
  const hash = await crypto.subtle.digest('SHA-256', combined)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Waveform overview ────────────────────────────────────────────────

/** Downsample mono Float32Array to N-point peak envelope. */
export function generateWaveform(mono: Float32Array, points: number = WAVEFORM_POINTS): Float32Array {
  const out = new Float32Array(points)
  const blockSize = mono.length / points
  for (let i = 0; i < points; i++) {
    const start = Math.floor(i * blockSize)
    const end = Math.floor((i + 1) * blockSize)
    let peak = 0
    for (let j = start; j < end; j++) {
      const abs = Math.abs(mono[j])
      if (abs > peak) peak = abs
    }
    out[i] = peak
  }
  return out
}

// ── IndexedDB pool-meta store ────────────────────────────────────────
//
// Separate IDB database ('inboil-pool') to avoid version conflicts with
// the main 'inboil' database managed by storage.ts.

const POOL_DB_NAME = 'inboil-pool'
const POOL_DB_VERSION = 1
const META_STORE = 'meta'

let poolDbPromise: Promise<IDBDatabase> | null = null

function openPoolDb(): Promise<IDBDatabase> {
  if (poolDbPromise) return poolDbPromise
  poolDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(POOL_DB_NAME, POOL_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => { db.close(); poolDbPromise = null }
      resolve(db)
    }
    req.onerror = () => { poolDbPromise = null; reject(req.error) }
  })
  return poolDbPromise
}

function poolTx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openPoolDb().then(db => db.transaction(META_STORE, mode).objectStore(META_STORE))
}

function poolReq<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

/** Close connection and reset module state. */
export async function closePoolDb(): Promise<void> {
  if (poolDbPromise) {
    try { (await poolDbPromise).close() } catch { /* already closed */ }
    poolDbPromise = null
  }
}

/** Reset module state (test only). */
export function _resetPoolForTest(): void {
  poolDbPromise = null
}

/** Save a PoolEntry to IndexedDB. */
async function saveMeta(entry: PoolEntry): Promise<void> {
  const stored: StoredPoolEntry = {
    ...entry,
    waveform: Array.from(entry.waveform),
  }
  const store = await poolTx('readwrite')
  await poolReq(store.put(stored))
}

/** Load a PoolEntry by id. */
export async function loadMeta(id: string): Promise<PoolEntry | null> {
  const store = await poolTx('readonly')
  const stored: StoredPoolEntry | undefined = await poolReq(store.get(id))
  if (!stored) return null
  return { ...stored, waveform: new Float32Array(stored.waveform) }
}

/** Load all pool entries. */
export async function loadAllMeta(): Promise<PoolEntry[]> {
  const store = await poolTx('readonly')
  const all: StoredPoolEntry[] = await poolReq(store.getAll())
  return all.map(s => ({ ...s, waveform: new Float32Array(s.waveform) }))
}

/** Delete a pool entry from IndexedDB. */
async function deleteMeta(id: string): Promise<void> {
  const store = await poolTx('readwrite')
  await poolReq(store.delete(id))
}

// ── Import flow ──────────────────────────────────────────────────────

export interface ImportResult {
  entry: PoolEntry
  duplicate: boolean
}

/**
 * Import a file into the audio pool.
 * Decodes, hashes, dedup-checks, writes to OPFS, saves metadata.
 * Returns the PoolEntry and whether it was a duplicate.
 */
export async function importFile(
  file: File,
  folder: string = 'unsorted',
  ctx?: AudioContext | OfflineAudioContext,
): Promise<ImportResult> {
  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
  }

  const rawBuffer = await file.arrayBuffer()

  // Compute content hash for dedup
  const id = await contentHash(rawBuffer)

  // Check for duplicate
  const existing = await loadMeta(id)
  if (existing) {
    return { entry: existing, duplicate: true }
  }

  // Decode audio
  if (!ctx) ctx = new AudioContext()
  const audioBuf = await ctx.decodeAudioData(rawBuffer.slice(0))

  // Validate duration
  if (audioBuf.duration > MAX_DURATION) {
    throw new Error(`Sample too long: ${audioBuf.duration.toFixed(1)}s (max ${MAX_DURATION}s)`)
  }

  // Convert to mono
  const mono = audioBuf.numberOfChannels === 1
    ? new Float32Array(audioBuf.getChannelData(0))
    : averageChannels(audioBuf)

  // Generate waveform overview
  const waveform = generateWaveform(mono)

  // Sanitize filename
  const filename = sanitizeFilename(file.name)
  const displayName = filename.replace(/\.[^.]+$/, '')

  // Write raw audio to OPFS (store original encoded bytes for quality)
  await writeFile(folder, filename, rawBuffer)

  // Build entry
  const entry: PoolEntry = {
    id,
    path: `${folder}/${filename}`,
    name: displayName,
    folder,
    duration: audioBuf.duration,
    sampleRate: audioBuf.sampleRate,
    size: rawBuffer.byteLength,
    waveform,
    addedAt: Date.now(),
  }

  // Persist metadata
  await saveMeta(entry)

  return { entry, duplicate: false }
}

/** Import multiple files, returning results for each. */
export async function importFiles(
  files: File[],
  folder: string = 'unsorted',
  ctx?: AudioContext | OfflineAudioContext,
): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  for (const file of files) {
    try {
      results.push(await importFile(file, folder, ctx))
    } catch (e) {
      console.warn(`[pool] import failed for ${file.name}:`, e)
    }
  }
  return results
}

// ── Read sample from pool ────────────────────────────────────────────

/** Read raw audio bytes from the pool by entry. */
export async function readSample(entry: PoolEntry): Promise<ArrayBuffer | null> {
  return readFile(entry.folder, entry.path.split('/').pop()!)
}

// ── Pool management ──────────────────────────────────────────────────

/** Delete a sample from the pool (OPFS + metadata). */
export async function deleteFromPool(id: string): Promise<void> {
  const entry = await loadMeta(id)
  if (!entry) return
  const filename = entry.path.split('/').pop()!
  await removeFile(entry.folder, filename)
  await deleteMeta(id)
}

/** Move a sample to a different folder. */
export async function moveToFolder(id: string, newFolder: string): Promise<void> {
  const entry = await loadMeta(id)
  if (!entry) return

  const filename = entry.path.split('/').pop()!

  // Read from old location
  const data = await readFile(entry.folder, filename)
  if (!data) return

  // Write to new location
  await writeFile(newFolder, filename, data)

  // Remove from old location
  await removeFile(entry.folder, filename)

  // Update metadata
  entry.folder = newFolder
  entry.path = `${newFolder}/${filename}`
  await saveMeta(entry)
}

/** Rename a sample's display name (metadata only, OPFS filename unchanged). */
export async function renameEntry(id: string, newName: string): Promise<void> {
  const entry = await loadMeta(id)
  if (!entry) return
  entry.name = newName.trim() || entry.name
  await saveMeta(entry)
}

// ── Storage budget ───────────────────────────────────────────────────

const POOL_SOFT_LIMIT = 200 * 1024 * 1024  // 200 MB
const POOL_WARN_THRESHOLD = 0.8             // warn at 80%

export interface PoolStats {
  totalSize: number
  count: number
  limitBytes: number
  usageRatio: number
  warning: boolean
}

/** Calculate pool storage stats from metadata. */
export async function getPoolStats(): Promise<PoolStats> {
  const entries = await loadAllMeta()
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0)
  const usageRatio = totalSize / POOL_SOFT_LIMIT
  return {
    totalSize,
    count: entries.length,
    limitBytes: POOL_SOFT_LIMIT,
    usageRatio,
    warning: usageRatio >= POOL_WARN_THRESHOLD,
  }
}

// ── Factory samples (ADR 104 §H) ────────────────────────────────────

const FACTORY_VERSION_KEY = 'inboil-factory-pool-version'
const FACTORY_VERSION = 4              // bump when factory pack changes (v4: replace vocals with ETV chops + phrases)
const FACTORY_MANIFEST_URL = '/samples/factory.json'
const FACTORY_SAMPLES_BASE = '/samples/'

interface FactoryZone {
  file: string
  rootNote: number
  loNote: number
  hiNote: number
}

interface FactoryPack {
  id: string
  name: string
  category: string
  zones: FactoryZone[]
}

interface FactoryManifest {
  version: number
  totalSize: number
  samples: { file: string; folder: string; name: string; size: number }[]
  packs?: FactoryPack[]
}

/** Check if factory samples need to be installed (no network). */
export function needsFactoryInstall(): boolean {
  const current = parseInt(localStorage.getItem(FACTORY_VERSION_KEY) ?? '0', 10)
  return current < FACTORY_VERSION
}

/**
 * Install factory samples into the pool on first launch (or version bump).
 * Fetches manifest + individual webm files from CDN, decodes, writes to OPFS + metadata.
 * Calls onProgress(done, total) for each completed file.
 */
export async function installFactorySamples(
  onProgress?: (done: number, total: number) => void,
): Promise<{ installed: number; skipped: number }> {
  if (!needsFactoryInstall()) return { installed: 0, skipped: 0 }

  // Fetch manifest
  const res = await fetch(FACTORY_MANIFEST_URL)
  if (!res.ok) throw new Error(`Factory manifest fetch failed: ${res.status}`)
  const manifest: FactoryManifest = await res.json()

  const ctx = new OfflineAudioContext(1, 1, 44100)
  let installed = 0
  let skipped = 0
  const total = manifest.samples.length

  for (const sample of manifest.samples) {
    try {
      // Fetch audio file
      const audioRes = await fetch(`${FACTORY_SAMPLES_BASE}${sample.file}`)
      if (!audioRes.ok) { skipped++; continue }
      const rawBuffer = await audioRes.arrayBuffer()

      // Compute hash for dedup
      const id = await contentHash(rawBuffer)

      // Skip if already in pool
      const existing = await loadMeta(id)
      if (existing) { skipped++; onProgress?.(installed + skipped, total); continue }

      // Decode to get duration, sampleRate, waveform
      const audioBuf = await ctx.decodeAudioData(rawBuffer.slice(0))
      const mono = audioBuf.numberOfChannels === 1
        ? new Float32Array(audioBuf.getChannelData(0))
        : averageChannels(audioBuf)
      const waveform = generateWaveform(mono)

      // Write to OPFS
      const folder = `factory/${sample.folder}`
      await writeFile(folder, sample.file, rawBuffer)

      // Save metadata
      const entry: PoolEntry = {
        id,
        path: `${folder}/${sample.file}`,
        name: sample.name,
        folder,
        duration: audioBuf.duration,
        sampleRate: audioBuf.sampleRate,
        size: rawBuffer.byteLength,
        waveform,
        addedAt: Date.now(),
      }
      await saveMeta(entry)
      installed++
    } catch (e) {
      console.warn(`[pool] factory install failed for ${sample.file}:`, e)
      skipped++
    }
    onProgress?.(installed + skipped, total)
  }

  // Mark version installed
  localStorage.setItem(FACTORY_VERSION_KEY, String(FACTORY_VERSION))
  return { installed, skipped }
}

// ── Factory packs (ADR 106) ─────────────────────────────────────────

/** Cached manifest for pack lookups (populated during factory install). */
let cachedManifest: FactoryManifest | null = null
let cachedManifestTime = 0
const MANIFEST_TTL = 5 * 60 * 1000 // 5 minutes

/** Get the factory manifest (fetches once per session, re-fetches after TTL). */
export async function getFactoryManifest(): Promise<FactoryManifest> {
  if (cachedManifest && Date.now() - cachedManifestTime < MANIFEST_TTL) return cachedManifest
  const res = await fetch(FACTORY_MANIFEST_URL)
  if (!res.ok) throw new Error(`Factory manifest fetch failed: ${res.status}`)
  cachedManifest = await res.json()
  cachedManifestTime = Date.now()
  return cachedManifest!
}

/** Get available factory pack definitions. */
export async function getFactoryPacks(): Promise<FactoryPack[]> {
  const manifest = await getFactoryManifest()
  return manifest.packs ?? []
}

export interface PackZoneData {
  buffer: Float32Array
  bufferSR: number
  rootNote: number
  loNote: number
  hiNote: number
}

/**
 * Load all zone buffers for a factory pack. Reads from OPFS (factory samples must be installed).
 * Returns decoded zone data ready to send to the worklet via loadZones command.
 */
export async function loadPackZones(
  packId: string,
  ctx?: AudioContext | OfflineAudioContext,
): Promise<PackZoneData[]> {
  const manifest = await getFactoryManifest()
  const pack = manifest.packs?.find(p => p.id === packId)
  if (!pack) throw new Error(`Factory pack not found: ${packId}`)

  if (!ctx) ctx = new AudioContext()
  const zones: PackZoneData[] = []

  for (const z of pack.zones) {
    // Read from OPFS — factory samples are in factory/{category}/
    const rawBuffer = await readFile(`factory/${pack.category}`, z.file)
    if (!rawBuffer) {
      console.warn(`[pool] pack zone file not found: factory/${pack.category}/${z.file}`)
      continue
    }

    // Decode to Float32Array
    const audioBuf = await ctx.decodeAudioData(rawBuffer.slice(0))
    const mono = audioBuf.numberOfChannels === 1
      ? new Float32Array(audioBuf.getChannelData(0))
      : averageChannels(audioBuf)

    zones.push({
      buffer: mono,
      bufferSR: audioBuf.sampleRate,
      rootNote: z.rootNote,
      loNote: z.loNote,
      hiNote: z.hiNote,
    })
  }

  return zones
}

// ── Helpers ──────────────────────────────────────────────────────────

function averageChannels(buf: AudioBuffer): Float32Array {
  const len = buf.length
  const out = new Float32Array(len)
  const channels = buf.numberOfChannels
  for (let ch = 0; ch < channels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) out[i] += data[i]
  }
  const scale = 1 / channels
  for (let i = 0; i < len; i++) out[i] *= scale
  return out
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 128)
}
