/**
 * Project CRUD + auto-save + crash recovery.
 * Extracted from state.svelte.ts for cohesion.
 */
import type { StoredProject } from './storage.ts'
import { song, project, ui, cloneSong, restoreSong, clearUndoStacks, savePrefs, setScheduleAutoSave } from './state.svelte.ts'
import { clearSamples, restoreSamples, persistPendingSamples } from './sampleActions.ts'
import { makeEmptySong } from './factory.ts'
import { showToast } from './toast.svelte.ts'
import { showFatalError } from './fatalError.svelte.ts'
import { validateRecoverySnapshot } from './validate.ts'

const storage = () => import('./storage.ts')

export async function listProjects() {
  return (await storage()).listProjects()
}

/** Build a StoredProject from current state */
function buildStoredProject(id: string, name: string, now: number, createdAt?: number): StoredProject {
  return { id, name, song: cloneSong(), createdAt: createdAt ?? now, updatedAt: now }
}

/** Save current song as a new project */
export async function projectSaveAs(name: string): Promise<string> {
  song.name = name
  const id = crypto.randomUUID()
  const now = Date.now()
  await (await storage()).saveProject(buildStoredProject(id, name, now))
  project.id = id
  project.lastSavedAt = now
  clearRecoverySnapshot()
  await persistPendingSamples(id)
  savePrefs()
  return id
}

/** Overwrite the current project (or save-as if no project yet) */
export async function projectSave(): Promise<void> {
  if (!project.id) {
    await projectSaveAs(song.name || 'Untitled')
    return
  }
  const s = await storage()
  const existing = await s.loadProject(project.id)
  const now = Date.now()
  await s.saveProject(buildStoredProject(project.id, song.name, now, existing?.createdAt))
  project.lastSavedAt = now
  clearRecoverySnapshot()
}

/** Load a project by id and replace current state */
export async function projectLoad(id: string): Promise<boolean> {
  const proj = await (await storage()).loadProject(id)
  if (!proj) return false
  // Migrate: ensure song.name matches project name
  if (!proj.song.name) proj.song.name = proj.name
  clearSamples()
  restoreSong(proj.song)
  project.id = id
  project.dirty = false
  // Reset UI
  ui.currentPattern = 0
  ui.selectedTrack = 0
  ui.patternSheet = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  clearUndoStacks()
  savePrefs()
  // Restore persisted samples (async, non-blocking)
  void restoreSamples(id)
  return true
}

/** Create a new empty project (does not persist until first save) */
export function projectNew(): void {
  restoreSong(makeEmptySong())
  clearSamples()
  project.id = null
  project.dirty = false
  ui.currentPattern = 0
  ui.selectedTrack = 0
  ui.patternSheet = false
  ui.selectedSceneNodes = {}
  ui.selectedSceneEdge = null
  clearUndoStacks()
  savePrefs()
}

/** Delete a project and reset to new if it was current */
export async function projectDelete(id: string): Promise<void> {
  const s = await storage()
  await s.deleteProject(id)
  await s.deleteSamples(id)
  if (project.id === id) projectNew()
}

/** Auto-save: debounced 500ms after last mutation, with concurrency guard */
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let autoSaving = false

export function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    if (!project.dirty || autoSaving) return
    autoSaving = true // REFACTOR-OK: 500ms debounce + dirty guard prevents overlapping saves; .finally() resets flag
    const doSave = project.id
      ? projectSave()
      : projectSaveAs(song.name || 'Untitled')
    doSave.then(() => {
      project.dirty = false
    }).catch(e => {
      console.error('[autoSave] ERROR:', e)
      showFatalError('DAT-002', e instanceof Error ? e.message : String(e))
    }).finally(() => {
      autoSaving = false
    })
  }, 500)
}

// Register callback so pushUndo() can trigger auto-save without circular import
setScheduleAutoSave(scheduleAutoSave)

/** Immediate auto-save (for beforeunload) */
export async function projectAutoSave(): Promise<void> {
  if (!project.dirty) return
  if (!project.id) {
    await projectSaveAs(song.name || 'Untitled')
  } else {
    await projectSave()
  }
  project.dirty = false
}

// ── Crash Recovery (ADR 099) ─────────────────────────────────────────
const RECOVERY_KEY = 'inboil_recovery'

/** Write current song to localStorage as crash recovery (synchronous, safe for beforeunload). */
export function writeRecoverySnapshot(): void {
  if (!project.dirty) return
  try {
    const snapshot = JSON.stringify({
      projectId: project.id,
      song: cloneSong(),
      timestamp: Date.now(),
    })
    localStorage.setItem(RECOVERY_KEY, snapshot)
  } catch (e) {
    // localStorage full or unavailable — silently skip
    console.warn('[recovery] snapshot write failed:', e)
  }
}

/** Clear recovery snapshot (call after successful IDB save). */
export function clearRecoverySnapshot(): void {
  try { localStorage.removeItem(RECOVERY_KEY) } catch { /* ignore */ }
}

/** Check for a recovery snapshot newer than IDB and restore if found.
 *  Returns true if recovery was applied. */
export async function checkRecovery(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY)
    if (!raw) return false
    const rec = validateRecoverySnapshot(JSON.parse(raw))
    // Only recover if it matches the current project (or no project yet)
    if (rec.projectId !== project.id) {
      clearRecoverySnapshot()
      return false
    }
    // Only recover if newer than last IDB save
    if (rec.timestamp <= project.lastSavedAt) {
      clearRecoverySnapshot()
      return false
    }
    restoreSong(rec.song)
    project.dirty = true
    clearRecoverySnapshot()
    scheduleAutoSave()
    showToast('Unsaved changes recovered', 'info')
    return true
  } catch (e) {
    console.warn('[recovery] check failed:', e)
    clearRecoverySnapshot()
    return false
  }
}

/** Restore last project on app startup */
export async function projectRestore(): Promise<void> {
  if (!project.id) return
  const ok = await projectLoad(project.id)
  if (!ok) { project.id = null; savePrefs() ; return }
  // Check for crash recovery after IDB load
  await checkRecovery()
}

/** Rename the current project */
export async function projectRename(name: string): Promise<void> {
  song.name = name
  if (project.id) {
    const s = await storage()
    const existing = await s.loadProject(project.id)
    if (existing) {
      existing.name = name
      existing.song.name = name
      existing.updatedAt = Date.now()
      await s.saveProject(existing)
    }
  }
}
