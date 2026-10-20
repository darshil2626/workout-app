import fs from 'node:fs'
import path from 'node:path'
import { test, expect, importBackup, waitForApp, openTab } from './helpers/fixtures'

// The same files as tests/integration/backupHistory.test.ts, but through the real
// Settings > Import screen and then the screens a person would open next. The shared
// `errors` fixture fails the test on any uncaught error or console.error.

const DIR = path.resolve('tests/fixtures/backups')
const FILES = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

for (const file of FILES) {
  test(`a backup from ${file} imports and every main screen opens`, async ({ page }) => {
    await importBackup(page, path.join(DIR, file))
    await page.goto('/')
    await waitForApp(page)
    await expect(page.locator('.bottom-nav')).toBeVisible()

    await openTab(page, 'History')
    await expect(page.getByText('Legs', { exact: true }).first()).toBeVisible()
    await page.getByText('Legs', { exact: true }).first().click()
    await expect(page).toHaveURL(/\/history\/w-legs$/)
    await expect(page.getByText('Squat').first()).toBeVisible()

    await page.goto('/exercises/squat-barbell')
    await waitForApp(page)
    await expect(page.locator('.header-title')).toContainText('Squat')
    await expect(page.getByRole('heading', { name: 'Heaviest weight' })).toBeVisible()

    await page.goto('/exercises/custom-zercher')
    await expect(page.locator('.header-title')).toContainText('Zercher Squat')

    await openTabViaUrl(page, '/stats')
    await expect(page.locator('.header-title')).toHaveText('Stats')

    await openTabViaUrl(page, '/settings')
    await expect(page.locator('.header-title')).toHaveText('Settings')

    // A workout the old build left running is still there to resume.
    if (file !== FILES[0]) {
      await page.goto('/')
      await waitForApp(page)
      await expect(page.getByText('session running')).toBeVisible()
    }
  })
}

async function openTabViaUrl(page: import('@playwright/test').Page, url: string) {
  await page.goto(url)
  await waitForApp(page)
}
