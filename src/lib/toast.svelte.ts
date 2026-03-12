/**
 * Global toast notification store (ADR 091 P0-1).
 * Call showToast() from anywhere to display a message.
 */

export interface Toast {
  id: number
  message: string
  type: 'error' | 'warn' | 'info'
}

let nextId = 0
export const toasts: Toast[] = $state([])

export function showToast(message: string, type: Toast['type'] = 'error'): void {
  const id = nextId++
  toasts.push({ id, message, type })
  setTimeout(() => dismissToast(id), 5000)
}

export function dismissToast(id: number): void {
  const idx = toasts.findIndex(t => t.id === id)
  if (idx >= 0) toasts.splice(idx, 1)
}
