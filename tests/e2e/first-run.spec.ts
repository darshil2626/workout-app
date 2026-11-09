import type { Page } from '@playwright/test'
import { test, expect, ALREADY_LIFT, waitForApp, readStore } from './helpers/fixtures'

const QUESTION = 'How do you want to start?'

async function openHome(page: Page) {
  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByRole('heading', { name: QUESTION })).toBeVisible()
}

/** Deletes a routine through its card's menu on the Home dashboard. */
async function deleteRoutine(page: Page, name: string) {
  await page.locator('.card', { hasText: name }).getByRole('button').first().click()
  await page
    .getByRole('dialog', { name })
    .getByRole('button', { name: /Delete routine/ })
    .click()
  await page
    .getByRole('dialog', { name: /Delete/ })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
}

test.describe('first-run question', () => {
  test.beforeEach(async ({ page }) => openHome(page))

  test('"I already lift" starts an empty workout', async ({ page }) => {
    await page.getByRole('button', { name: ALREADY_LIFT }).click()
    await expect(page).toHaveURL(/\/workout$/)
    await expect(page.locator('.ex-block')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
    // Nothing was saved as a routine on the way.
    expect(await readStore(page, 'routines')).toHaveLength(0)
  })

  test('"I\'m new to lifting" saves the dumbbell template and starts its first day', async ({ page }) => {
    await page.getByRole('button', { name: /I’m new to lifting/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Pick a starter routine' })
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Not medical advice')
    // Dumbbells and machines lead; the barbell routine is offered, not led with.
    const options = sheet.locator('.sheet-list-item')
    await expect(options).toHaveCount(5)
    await expect(options.first()).toContainText('Full Body (Dumbbells)')
    await expect(options.nth(1)).toContainText('Full Body (Machines)')

    await options.first().click()
    await expect(page).toHaveURL(/\/workout$/)
    await expect(page.locator('.ex-block .ex-name')).toHaveText([
      'Goblet Squat',
      'Bench Press (Dumbbell)',
      'Bent Over Row (Dumbbell)',
      'Bicep Curl (Dumbbell)',
    ])

    // Both days are kept as the user's own routines, in a folder named after the template.
    await expect
      .poll(async () => (await readStore(page, 'routines')).map((r) => r.name).sort())
      .toEqual(['Dumbbell Full Body A', 'Dumbbell Full Body B'])
    expect((await readStore(page, 'folders')).map((f) => f.name)).toEqual(['Full Body (Dumbbells)'])
  })

  test('"I\'m switching from another app" opens Settings at the import button, once', async ({ page }) => {
    await page.getByRole('button', { name: /I’m switching from another app/ }).click()
    await expect(page).toHaveURL(/\/settings$/) // the one-off flag is dropped from the address
    const importButton = page.getByRole('button', { name: 'Import backup or CSV' })
    await expect(importButton).toBeInViewport()
    await expect(importButton).toBeFocused()
    await expect(importButton).toHaveClass(/btn-primary/)

    // Leaving and coming back (by Back, too) is an ordinary visit to Settings.
    await page.goBack()
    await expect(page.getByRole('heading', { name: QUESTION })).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('button', { name: 'Import backup or CSV' })).toHaveClass(/btn-ghost/)
    await expect(page.getByRole('button', { name: 'Import backup or CSV' })).not.toBeFocused()
  })

  test('"Build a routine first" opens the routine editor', async ({ page }) => {
    await page.getByRole('button', { name: 'Build a routine first' }).click()
    await expect(page).toHaveURL(/\/routines\/new$/)
  })
})

test.describe('returning to the first-run question', () => {
  test('deleting the last routine brings the question back', async ({ page }) => {
    await openHome(page)
    await page.getByRole('button', { name: 'Build a routine first' }).click()
    await page.locator('#routine-name').fill('Mine')
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const picker = page.getByRole('dialog')
    await picker.getByPlaceholder('Search exercises').fill('Goblet Squat')
    await picker.locator('.picker-item', { hasText: 'Goblet Squat' }).first().click()
    await picker.getByRole('button', { name: /^Add 1 exercise/ }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: QUESTION })).toHaveCount(0)

    await deleteRoutine(page, 'Mine')
    await expect(page.getByRole('heading', { name: QUESTION })).toBeVisible()
    await expect(page.locator('.active-banner')).toHaveCount(0)
  })

  test('an emptied template folder does not keep the question away', async ({ page }) => {
    await openHome(page)
    await page.getByRole('button', { name: /I’m new to lifting/ }).click()
    await page
      .getByRole('dialog', { name: 'Pick a starter routine' })
      .getByRole('button', { name: /Full Body \(Dumbbells\)/ })
      .click()
    await expect(page).toHaveURL(/\/workout$/)
    await page.getByRole('button', { name: 'Discard', exact: true }).first().click()
    await page
      .getByRole('dialog', { name: 'Discard workout?' })
      .getByRole('button', { name: 'Discard', exact: true })
      .click()
    await expect(page).toHaveURL(/\/$/)

    // Folders start collapsed; open this one to reach its routines.
    await page.locator('.folder-toggle', { hasText: 'Full Body (Dumbbells)' }).click()
    await deleteRoutine(page, 'Dumbbell Full Body A')
    await deleteRoutine(page, 'Dumbbell Full Body B')
    // The folder itself is still stored, empty; it must not hide the question.
    await expect.poll(async () => (await readStore(page, 'folders')).length).toBe(1)
    await expect(page.getByRole('heading', { name: QUESTION })).toBeVisible()
  })
})

test.describe('switching on an iPhone, in a Safari tab', () => {
  // Same user agent as notice-order.spec.ts. Not installed, so imported history
  // would sit in Safari's tab storage.
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  })

  test('offers to install first, and "Import anyway" continues to the import button', async ({ page }) => {
    await openHome(page)
    await page.getByRole('button', { name: /I’m switching from another app/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Install first, then import' })
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Add to Home Screen')
    await expect(page).toHaveURL(/\/$/)

    await sheet.getByRole('button', { name: 'Import anyway' }).click()
    await expect(page).toHaveURL(/\/settings$/)
    const importButton = page.getByRole('button', { name: 'Import backup or CSV' })
    await expect(importButton).toBeInViewport()
    await expect(importButton).toHaveClass(/btn-primary/)
  })
})
