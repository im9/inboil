/**
 * Browser capability detection (ADR 091 P0-2).
 * Returns null if all features are supported, or an error message string.
 */
export function checkBrowserCompat(): string | null {
  const missing: string[] = []

  if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') {
    missing.push('Web Audio API')
  }

  // Safari: check AudioWorkletNode constructor, not just window.AudioWorklet
  if (typeof AudioContext !== 'undefined') {
    try {
      const ctx = new AudioContext()
      if (typeof AudioWorkletNode === 'undefined') missing.push('AudioWorklet')
      ctx.close()
    } catch {
      missing.push('AudioContext')
    }
  } else if (typeof AudioWorkletNode === 'undefined') {
    missing.push('AudioWorklet')
  }

  if (typeof indexedDB === 'undefined') {
    missing.push('IndexedDB')
  }

  if (missing.length === 0) return null
  return `Missing: ${missing.join(', ')}. Chrome 66+, Firefox 76+, or Safari 14.1+ required.`
}
