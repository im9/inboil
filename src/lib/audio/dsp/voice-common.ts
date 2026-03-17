/**
 * Shared voice interface and utilities — imported by all voice modules.
 * Kept minimal to avoid circular dependencies.
 */

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

export interface Voice {
  noteOn(note: number, velocity: number): void
  noteOff(): void
  slideNote(note: number, velocity: number): void
  tick(): number
  tickStereo?(out: Float32Array): void  // writes [L, R] into out[0], out[1]
  reset(): void
  setParam(key: string, value: number): void
}
