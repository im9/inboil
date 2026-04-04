/**
 * Centralized list of localStorage keys owned by inboil.
 * Used by factoryReset to clear only our keys (not the entire origin).
 */
export const OWNED_STORAGE_KEYS = [
  'inboil',
  'inboil-lang',
  'inboil_recovery',
  'inboil-factory-pool-version',
] as const

/** Remove only inboil-owned keys from localStorage. */
export function clearOwnedLocalStorage(): void {
  if (typeof localStorage === 'undefined') return
  for (const key of OWNED_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
}
