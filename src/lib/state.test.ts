import { describe, it, expect } from 'vitest'
// @ts-expect-error no @types/node
import { readFileSync } from 'node:fs'

/**
 * Guard against TDZ (Temporal Dead Zone) bugs in state module initialization.
 *
 * The state module runs side-effects at import time (e.g. savePrefs on first visit).
 * If a $state variable referenced in savePrefs is declared after the call site,
 * a fresh browser (private mode / empty localStorage) will hit a ReferenceError.
 *
 * This test statically checks that all $state declarations referenced by savePrefs
 * appear before any module-level savePrefs() call in the source.
 */

const SRC = readFileSync(new URL('./state.svelte.ts', import.meta.url), 'utf-8')
const lines = SRC.split('\n')

/**
 * Find the first module-level (outside any function/method) call to savePrefs().
 * Tracks brace depth of function definitions to skip calls inside functions.
 */
function firstModuleLevelCall(): number {
  let fnDepth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Detect function start (top-level or export)
    if (fnDepth === 0 && /^\s*(?:export\s+)?(?:async\s+)?function\s/.test(line)) {
      for (const ch of line) {
        if (ch === '{') fnDepth++
        if (ch === '}') fnDepth--
      }
      continue
    }
    if (fnDepth > 0) {
      for (const ch of line) {
        if (ch === '{') fnDepth++
        if (ch === '}') fnDepth--
      }
      continue
    }
    // Module-level code — check for savePrefs() call
    if (/savePrefs\(\)/.test(line)) return i
  }
  return -1
}

/** Find all $state variable names referenced inside savePrefs function body */
function stateVarsInSavePrefs(): string[] {
  const fnStart = lines.findIndex((l: string) => /^(?:export\s+)?function savePrefs/.test(l))
  if (fnStart === -1) return []
  let depth = 0
  let fnEnd = fnStart
  for (let i = fnStart; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++
      if (ch === '}') depth--
    }
    if (depth === 0) { fnEnd = i; break }
  }
  const body = lines.slice(fnStart, fnEnd + 1).join('\n')
  const stateVarNames: string[] = []
  lines.forEach((l: string) => {
    const m = l.match(/^export\s+const\s+(\w+)\s*=\s*\$state/)
    if (m) stateVarNames.push(m[1])
  })
  return stateVarNames.filter(name => new RegExp(`\\b${name}\\b`).test(body))
}

describe('state module init order (TDZ guard)', () => {
  it('if a module-level savePrefs() call exists, all $state vars it uses are declared before it', () => {
    const firstCall = firstModuleLevelCall()
    if (firstCall === -1) return // no module-level call — nothing to guard

    const vars = stateVarsInSavePrefs()
    expect(vars.length, 'savePrefs should reference at least one $state var').toBeGreaterThan(0)

    for (const name of vars) {
      const declLine = lines.findIndex((l: string) =>
        new RegExp(`^export\\s+const\\s+${name}\\s*=\\s*\\$state`).test(l)
      )
      expect(
        declLine,
        `"${name}" (line ${declLine + 1}) must be declared before first module-level savePrefs() call (line ${firstCall + 1})`,
      ).toBeLessThan(firstCall)
    }
  })
})
