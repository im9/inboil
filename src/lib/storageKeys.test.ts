import { describe, it, expect, beforeEach } from 'vitest'
import { clearOwnedLocalStorage, OWNED_STORAGE_KEYS } from './storageKeys.ts'

// Minimal localStorage polyfill for Node
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { for (const k in store) delete store[k] },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as Storage
}

beforeEach(() => {
  localStorage.clear()
})

describe('clearOwnedLocalStorage', () => {
  it('removes all owned keys', () => {
    for (const key of OWNED_STORAGE_KEYS) {
      localStorage.setItem(key, 'test-value')
    }
    clearOwnedLocalStorage()
    for (const key of OWNED_STORAGE_KEYS) {
      expect(localStorage.getItem(key), `key "${key}" should be removed`).toBeNull()
    }
  })

  it('does not remove unrelated keys', () => {
    localStorage.setItem('inboil', 'owned')
    localStorage.setItem('other-app-data', 'foreign')
    localStorage.setItem('theme', 'dark')
    clearOwnedLocalStorage()
    expect(localStorage.getItem('other-app-data')).toBe('foreign')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('is safe when keys do not exist', () => {
    expect(() => clearOwnedLocalStorage()).not.toThrow()
  })
})
