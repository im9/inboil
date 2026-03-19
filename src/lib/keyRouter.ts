/**
 * Centralized keyboard routing (ADR 115).
 *
 * A single dispatcher replaces distributed `<svelte:window onkeydown>` handlers.
 * Events are routed through a priority-ordered layer stack. The first handler
 * that returns `true` or calls `e.preventDefault()` wins; remaining layers are skipped.
 *
 * Priority (high -> low): text-input > sheet > tracker > scene > app
 */

import { isTextInputTarget } from './domHelpers'

export type KeyLayer = 'text-input' | 'sheet' | 'tracker' | 'scene' | 'app'
export type KeyHandler = (e: KeyboardEvent) => boolean | void

const layers: Map<KeyLayer, KeyHandler> = new Map()
const upLayers: Map<KeyLayer, KeyHandler> = new Map()

const PRIORITY: KeyLayer[] = ['text-input', 'sheet', 'tracker', 'scene', 'app']

export function registerKeyLayer(layer: KeyLayer, handler: KeyHandler): void {
  layers.set(layer, handler)
}

export function unregisterKeyLayer(layer: KeyLayer): void {
  layers.delete(layer)
}

export function registerKeyUpLayer(layer: KeyLayer, handler: KeyHandler): void {
  upLayers.set(layer, handler)
}

export function unregisterKeyUpLayer(layer: KeyLayer): void {
  upLayers.delete(layer)
}

/** Keydown dispatcher — bind to `<svelte:window onkeydown={dispatch}>` in App.svelte */
export function dispatch(e: KeyboardEvent): void {
  if (e.defaultPrevented) return
  if (isTextInputTarget(e)) return

  for (const layer of PRIORITY) {
    if (layer === 'text-input') continue // already handled above
    const handler = layers.get(layer)
    if (!handler) continue
    const consumed = handler(e)
    if (consumed || e.defaultPrevented) return
  }
}

/** Keyup dispatcher — bind to `<svelte:window onkeyup={dispatchUp}>` in App.svelte */
export function dispatchUp(e: KeyboardEvent): void {
  if (e.defaultPrevented) return

  for (const layer of PRIORITY) {
    if (layer === 'text-input') continue
    const handler = upLayers.get(layer)
    if (!handler) continue
    const consumed = handler(e)
    if (consumed || e.defaultPrevented) return
  }
}
