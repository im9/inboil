/**
 * Storage integration tests (ADR 082 Phase 2).
 * Uses fake-indexeddb to emulate IDB in memory.
 */
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach } from 'vitest'
import { makeDefaultSong, makeEmptySong } from './factory.ts'
import {
  listProjects, loadProject, saveProject, deleteProject,
  saveSample, loadSamples, deleteSamples, deleteSample,
  saveUserPreset, loadUserPresets, loadAllUserPresets, deleteUserPreset, renameUserPreset,
  _resetForTest,
  type StoredProject,
} from './storage.ts'

// ── Helpers ──

function makeProject(id: string, name: string, song = makeEmptySong()): StoredProject {
  const now = Date.now()
  return { id, name, song, createdAt: now, updatedAt: now }
}

beforeEach(() => {
  // Fresh IDB + reset cached connection for each test
  globalThis.indexedDB = new IDBFactory()
  _resetForTest()
})

// ── Project CRUD ──

describe('project CRUD', () => {
  it('save → load round-trip preserves song', async () => {
    const song = makeDefaultSong()
    const proj = makeProject('test-1', 'Test', song)
    await saveProject(proj)
    const loaded = await loadProject('test-1')
    expect(loaded).not.toBeNull()
    expect(loaded!.name).toBe('Test')
    expect(loaded!.song.patterns.length).toBe(song.patterns.length)
    expect(loaded!.song.bpm).toBe(song.bpm)
  })

  it('loadProject returns null for non-existent id', async () => {
    const loaded = await loadProject('does-not-exist')
    expect(loaded).toBeNull()
  })

  it('overwrite updates existing project', async () => {
    const proj = makeProject('upd-1', 'Original')
    await saveProject(proj)
    proj.name = 'Updated'
    proj.song.bpm = 180
    proj.updatedAt = Date.now() + 1000
    await saveProject(proj)
    const loaded = await loadProject('upd-1')
    expect(loaded!.name).toBe('Updated')
    expect(loaded!.song.bpm).toBe(180)
  })

  it('delete removes project', async () => {
    await saveProject(makeProject('del-1', 'Delete Me'))
    await deleteProject('del-1')
    const loaded = await loadProject('del-1')
    expect(loaded).toBeNull()
  })

  it('delete non-existent id does not throw', async () => {
    await expect(deleteProject('no-such-id')).resolves.toBeUndefined()
  })

  it('listProjects returns sorted by updatedAt (newest first)', async () => {
    await saveProject({ ...makeProject('a', 'A'), updatedAt: 1000 })
    await saveProject({ ...makeProject('b', 'B'), updatedAt: 3000 })
    await saveProject({ ...makeProject('c', 'C'), updatedAt: 2000 })
    const list = await listProjects()
    expect(list.map(p => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('listProjects returns id, name, createdAt, updatedAt only', async () => {
    await saveProject(makeProject('min-1', 'Minimal'))
    const list = await listProjects()
    const p = list.find(x => x.id === 'min-1')!
    expect(p).toBeDefined()
    expect(Object.keys(p).sort()).toEqual(['createdAt', 'id', 'name', 'updatedAt'])
  })
})

// ── Samples ──

describe('sample CRUD', () => {
  it('save → load round-trip', async () => {
    const buf = new ArrayBuffer(16)
    await saveSample('proj-1', 0, 0, 'kick.wav', buf)
    const samples = await loadSamples('proj-1')
    expect(samples.length).toBe(1)
    expect(samples[0].name).toBe('kick.wav')
    expect(samples[0].trackId).toBe(0)
    expect(samples[0].patternIndex).toBe(0)
    expect(samples[0].buffer.byteLength).toBe(16)
  })

  it('overwrite sample for same project+track+pattern', async () => {
    await saveSample('proj-1', 0, 0, 'old.wav', new ArrayBuffer(8))
    await saveSample('proj-1', 0, 0, 'new.wav', new ArrayBuffer(32))
    const samples = await loadSamples('proj-1')
    expect(samples.length).toBe(1)
    expect(samples[0].name).toBe('new.wav')
    expect(samples[0].buffer.byteLength).toBe(32)
  })

  it('multiple tracks per project', async () => {
    await saveSample('proj-1', 0, 0, 'kick.wav', new ArrayBuffer(8))
    await saveSample('proj-1', 1, 0, 'snare.wav', new ArrayBuffer(12))
    const samples = await loadSamples('proj-1')
    expect(samples.length).toBe(2)
  })

  it('deleteSamples removes all for project', async () => {
    await saveSample('proj-1', 0, 0, 'a.wav', new ArrayBuffer(8))
    await saveSample('proj-1', 1, 0, 'b.wav', new ArrayBuffer(8))
    await saveSample('proj-2', 0, 0, 'c.wav', new ArrayBuffer(8))
    await deleteSamples('proj-1')
    expect((await loadSamples('proj-1')).length).toBe(0)
    expect((await loadSamples('proj-2')).length).toBe(1)
  })

  it('deleteSample removes single track+pattern sample', async () => {
    await saveSample('proj-1', 0, 0, 'a.wav', new ArrayBuffer(8))
    await saveSample('proj-1', 1, 0, 'b.wav', new ArrayBuffer(8))
    await deleteSample('proj-1', 0, 0)
    const samples = await loadSamples('proj-1')
    expect(samples.length).toBe(1)
    expect(samples[0].trackId).toBe(1)
  })
})

// ── User Presets ──

describe('user preset CRUD', () => {
  it('save → load round-trip', async () => {
    await saveUserPreset('DM', 'My Kick', { tone: 0.5, decay: 0.3 })
    const presets = await loadUserPresets('DM')
    expect(presets.length).toBe(1)
    expect(presets[0].name).toBe('My Kick')
    expect(presets[0].params).toEqual({ tone: 0.5, decay: 0.3 })
  })

  it('name is truncated to 16 chars', async () => {
    await saveUserPreset('DM', 'This Name Is Way Too Long', { x: 1 })
    const presets = await loadUserPresets('DM')
    expect(presets[0].name.length).toBeLessThanOrEqual(16)
  })

  it('loadUserPresets filters by voiceId', async () => {
    await saveUserPreset('DM', 'Preset A', { x: 1 })
    await saveUserPreset('WT', 'Preset B', { y: 2 })
    expect((await loadUserPresets('DM')).length).toBe(1)
    expect((await loadUserPresets('WT')).length).toBe(1)
  })

  it('loadAllUserPresets returns all', async () => {
    await saveUserPreset('DM', 'A', { x: 1 })
    await saveUserPreset('WT', 'B', { y: 2 })
    const all = await loadAllUserPresets()
    expect(all.length).toBe(2)
  })

  it('deleteUserPreset removes by id', async () => {
    const id = await saveUserPreset('DM', 'ToDelete', { x: 1 })
    await deleteUserPreset(id)
    expect((await loadUserPresets('DM')).length).toBe(0)
  })

  it('renameUserPreset updates name', async () => {
    const id = await saveUserPreset('DM', 'Old Name', { x: 1 })
    await renameUserPreset(id, 'New Name')
    const presets = await loadUserPresets('DM')
    expect(presets[0].name).toBe('New Name')
  })

  it('renameUserPreset truncates to 16 chars', async () => {
    const id = await saveUserPreset('DM', 'Short', { x: 1 })
    await renameUserPreset(id, 'A Very Long Preset Name Indeed')
    const presets = await loadUserPresets('DM')
    expect(presets[0].name.length).toBeLessThanOrEqual(16)
  })
})
