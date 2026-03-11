/**
 * E2E tests — core app flows (ADR 082 Phase 3 + 4).
 * Runs against dev server via Playwright + Chromium.
 */
import { test, expect } from '@playwright/test'

/** Close help sidebar if visible (shown on first visit) */
async function dismissHelp(page: import('@playwright/test').Page) {
  const sidebar = page.locator('.sidebar')
  if (await sidebar.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.locator('.btn-close').click()
    await page.waitForTimeout(200)
  }
}

/** Open pattern 0 sheet by double-tapping matrix cell */
async function openPatternSheet(page: import('@playwright/test').Page) {
  await page.locator('[aria-label="Pattern 0"]').dblclick()
  await page.waitForTimeout(400)
}

// ── Basic app tests (clean state each time) ──

test.describe('app basics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Clear state for clean test
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)
  })

  test('header controls visible', async ({ page }) => {
    await expect(page.locator('[aria-label="Play"]')).toBeVisible()
    await expect(page.locator('[aria-label="Stop"]')).toBeVisible()
    await expect(page.locator('[aria-label="System settings"]')).toBeVisible()
  })

  test('scene view is default', async ({ page }) => {
    await expect(page.locator('.scene-canvas')).toBeVisible()
  })

  test('double-tap matrix cell opens step grid', async ({ page }) => {
    await openPatternSheet(page)
    await expect(page.locator('[aria-label="Step 1"]').first()).toBeVisible()
  })

  test('system sidebar opens and closes', async ({ page }) => {
    await page.locator('[aria-label="System settings"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('.sidebar')).toBeVisible()
    await expect(page.locator('.sidebar').locator('button', { hasText: /NEW PROJECT|新規プロジェクト/ })).toBeVisible()

    await page.locator('.btn-close').click()
    await page.waitForTimeout(300)
    await expect(page.locator('.sidebar')).not.toBeVisible()
  })

  test('FX button opens overlay', async ({ page }) => {
    await page.locator('[data-tip*="FX pad"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[role="application"]').first()).toBeVisible()
  })
})

// ── Undo/Redo ──

test.describe('undo/redo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)
    await openPatternSheet(page)
  })

  test('ctrl+z undoes a step toggle', async ({ page }) => {
    const step = page.locator('[aria-label="Step 1"]').first()
    const flipCard = step.locator('.flip-card')

    const before = await flipCard.evaluate(el => el.classList.contains('flipped'))

    await step.click()
    await page.waitForTimeout(300)
    const after = await flipCard.evaluate(el => el.classList.contains('flipped'))
    expect(after).not.toBe(before)

    // Undo
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(300)
    const undone = await flipCard.evaluate(el => el.classList.contains('flipped'))
    expect(undone).toBe(before)

    // Redo
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(300)
    const redone = await flipCard.evaluate(el => el.classList.contains('flipped'))
    expect(redone).toBe(after)
  })
})

// ── Persistence across reload ──

test.describe('persistence', () => {
  test('step toggle survives reload', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)
    await openPatternSheet(page)

    const step = page.locator('[aria-label="Step 1"]').first()
    const flipCard = step.locator('.flip-card')
    const before = await flipCard.evaluate(el => el.classList.contains('flipped'))

    // Toggle
    await step.click()
    await page.waitForTimeout(500)
    const toggled = await flipCard.evaluate(el => el.classList.contains('flipped'))
    expect(toggled).not.toBe(before)

    // Wait for auto-save
    await page.waitForTimeout(1000)

    // Reload
    await page.reload()
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)
    await openPatternSheet(page)

    const stepAfter = page.locator('[aria-label="Step 1"]').first()
    const flipAfter = stepAfter.locator('.flip-card')
    const afterReload = await flipAfter.evaluate(el => el.classList.contains('flipped'))
    expect(afterReload).toBe(toggled)
  })

  test('BPM survives reload', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)

    // Read current BPM via app state
    const bpmBefore = await page.evaluate(() => {
      // Access the BPM input field or use the + button approach
      const el = document.querySelector('.bpm-value')
      // Each flap-cell has multiple .char spans; get unique chars from the visible top half
      const cells = el?.querySelectorAll('.flap-cell')
      if (!cells) return 0
      let s = ''
      cells.forEach(cell => {
        const visible = cell.querySelector('.half.top.visible .char') ?? cell.querySelector('.half.top.queued .char')
        if (visible) s += visible.textContent?.trim() ?? ''
      })
      return parseInt(s) || 0
    })

    // Click + to increment
    await page.locator('[data-tip*="Increase tempo"]').click()
    await page.waitForTimeout(500)

    const bpmAfterClick = bpmBefore + 1

    // Wait for prefs save
    await page.waitForTimeout(500)

    // Reload
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Read BPM after reload
    const bpmAfterReload = await page.evaluate(() => {
      const el = document.querySelector('.bpm-value')
      const cells = el?.querySelectorAll('.flap-cell')
      if (!cells) return 0
      let s = ''
      cells.forEach(cell => {
        const visible = cell.querySelector('.half.top.visible .char') ?? cell.querySelector('.half.top.queued .char')
        if (visible) s += visible.textContent?.trim() ?? ''
      })
      return parseInt(s) || 0
    })

    expect(bpmAfterReload).toBe(bpmAfterClick)
  })
})

// ── Phase 4: Extended E2E ──

// ── Scene graph persistence ──

test.describe('scene graph', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)
  })

  test('add pattern to scene via → button', async ({ page }) => {
    // Fresh scene is empty
    expect(await page.locator('.scene-node').count()).toBe(0)

    // Click → to add pattern 0 to scene
    await page.locator('.head-scene').click()
    await page.waitForTimeout(400)

    // Scene node should appear
    const nodes = page.locator('.scene-node')
    await expect(nodes.first()).toBeVisible()
    expect(await nodes.count()).toBe(1)
  })

  test('scene node survives reload', async ({ page }) => {
    // Add pattern to scene
    await page.locator('.head-scene').click()
    await page.waitForTimeout(400)
    await expect(page.locator('.scene-node').first()).toBeVisible()

    // Wait for auto-save
    await page.waitForTimeout(1000)

    await page.reload()
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)

    // Node should persist
    await expect(page.locator('.scene-node').first()).toBeVisible()
    expect(await page.locator('.scene-node').count()).toBe(1)
  })

  test('first scene node becomes root', async ({ page }) => {
    // Add pattern to scene
    await page.locator('.head-scene').click()
    await page.waitForTimeout(400)

    const rootNode = page.locator('.scene-node.root')
    await expect(rootNode).toBeVisible()
    expect(await rootNode.count()).toBe(1)
  })
})

// ── Instrument / voice change ──

test.describe('voice change', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)
    await openPatternSheet(page)
  })

  test('voice picker opens and lists instruments', async ({ page }) => {
    // Click voice selector button in dock panel (distinguish from preset browser)
    const voiceBtn = page.locator('[data-tip="Change instrument"]')
    await expect(voiceBtn).toBeVisible()
    await voiceBtn.click()
    await page.waitForTimeout(300)

    // Picker list should be visible with items
    await expect(page.locator('.picker-list')).toBeVisible()
    const items = page.locator('.picker-item')
    expect(await items.count()).toBeGreaterThan(1)
  })

  test('changing voice updates dock display', async ({ page }) => {
    const voiceBtn = page.locator('[data-tip="Change instrument"]')
    const nameBefore = await voiceBtn.locator('.voice-current-name').textContent()

    // Open picker and select a different voice
    await voiceBtn.click()
    await page.waitForTimeout(300)

    // Find a voice that's not currently selected
    const unselected = page.locator('.picker-item:not(.selected)').first()
    const newVoiceName = await unselected.locator('.picker-name').textContent()
    await unselected.click()
    await page.waitForTimeout(300)

    // Voice name should have changed
    const nameAfter = await page.locator('[data-tip="Change instrument"] .voice-current-name').textContent()
    expect(nameAfter).not.toBe(nameBefore)
    expect(nameAfter).toBe(newVoiceName)
  })

  test('voice change survives reload', async ({ page }) => {
    const voiceBtn = page.locator('[data-tip="Change instrument"]')
    await voiceBtn.click()
    await page.waitForTimeout(300)

    // Select a different voice
    const unselected = page.locator('.picker-item:not(.selected)').first()
    await unselected.click()
    await page.waitForTimeout(300)

    const nameAfterChange = await page.locator('[data-tip="Change instrument"] .voice-current-name').textContent()

    // Wait for auto-save
    await page.waitForTimeout(1000)

    // Reload
    await page.reload()
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)
    await openPatternSheet(page)

    const nameAfterReload = await page.locator('[data-tip="Change instrument"] .voice-current-name').textContent()
    expect(nameAfterReload).toBe(nameAfterChange)
  })
})

// ── Parameter locks ──

test.describe('parameter locks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.waitForLoadState('networkidle')
    await dismissHelp(page)
    await openPatternSheet(page)
  })

  test('P-LOCK mode toggles on and off', async ({ page }) => {
    const modeRow = page.locator('.mode-row').first()
    const modeSwitch = modeRow.locator('.mode-switch')

    // Initially off
    await expect(modeSwitch).not.toHaveClass(/\bon\b/)

    // Toggle on
    await modeRow.click()
    await page.waitForTimeout(200)
    await expect(modeSwitch).toHaveClass(/on/)

    // "select a step" hint should appear
    await expect(page.locator('.lock-hint')).toBeVisible()

    // Toggle off
    await modeRow.click()
    await page.waitForTimeout(200)
    await expect(modeSwitch).not.toHaveClass(/\bon\b/)
  })

  test('selecting step in P-LOCK mode highlights it', async ({ page }) => {
    // Enable P-LOCK mode
    await page.locator('.mode-row').first().click()
    await page.waitForTimeout(200)

    // Click Step 1 to select it for locking
    const step = page.locator('[aria-label="Step 1"]').first()
    await step.click()
    await page.waitForTimeout(200)

    // Step should have lock-selected class
    await expect(step).toHaveClass(/lock-selected/)

    // "STEP 1" label should appear in dock
    await expect(page.locator('.lock-step')).toContainText('STEP 1')
  })

  test('knob drag in P-LOCK mode creates lock dot', async ({ page }) => {
    // First activate a step (so there's a trig to lock)
    const step = page.locator('[aria-label="Step 1"]').first()
    await step.click()
    await page.waitForTimeout(300)

    // Enable P-LOCK mode
    await page.locator('.mode-row').first().click()
    await page.waitForTimeout(200)

    // Select Step 1 for locking
    await step.click()
    await page.waitForTimeout(200)

    // Find first knob and drag it to set a param lock
    const knob = page.locator('.knob-grid [role="slider"]').first()
    if (await knob.isVisible().catch(() => false)) {
      const box = await knob.boundingBox()
      if (box) {
        // Drag upward to change value (knobs respond to vertical drag)
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 5 })
        await page.mouse.up()
        await page.waitForTimeout(300)

        // Lock dot should appear on the step
        const lockDot = step.locator('.lock-dot')
        await expect(lockDot).toBeVisible()
      }
    }
  })

  test('param lock survives reload', async ({ page }) => {
    // Activate step 1
    const step = page.locator('[aria-label="Step 1"]').first()
    await step.click()
    await page.waitForTimeout(300)

    // Enable P-LOCK mode
    await page.locator('.mode-row').first().click()
    await page.waitForTimeout(200)

    // Select Step 1
    await step.click()
    await page.waitForTimeout(200)

    // Drag first knob to create a lock
    const knob = page.locator('.knob-grid [role="slider"]').first()
    if (await knob.isVisible().catch(() => false)) {
      const box = await knob.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 5 })
        await page.mouse.up()
        await page.waitForTimeout(300)

        // Confirm lock dot is present
        await expect(step.locator('.lock-dot')).toBeVisible()

        // Wait for auto-save
        await page.waitForTimeout(1000)

        // Reload
        await page.reload()
        await page.waitForLoadState('networkidle')
        await dismissHelp(page)
        await openPatternSheet(page)

        // Enable P-LOCK mode again to see lock indicators
        await page.locator('.mode-row').first().click()
        await page.waitForTimeout(200)

        // Lock dot should still be visible
        const stepAfter = page.locator('[aria-label="Step 1"]').first()
        await expect(stepAfter.locator('.lock-dot')).toBeVisible()
      }
    }
  })
})
