import { test, expect, waitForApp, openTab, logSet } from './helpers/fixtures'
import type { Page } from '@playwright/test'

async function startEmptyAndAddBench(page: Page) {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()
  await expect(page.locator('.ex-block')).toHaveCount(1)
  await expect(page.locator('.ex-block .ex-name')).toContainText('Bench Press')
}

test('core loop: log, complete, PR, finish, history, stats', async ({ page }) => {
  await startEmptyAndAddBench(page)

  // A fresh exercise block starts with one blank set; add a second.
  const rows = page.locator('.set-table tbody tr')
  await expect(rows).toHaveCount(1)
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(rows).toHaveCount(2)

  // Rest timer is not running until a set is ticked.
  await expect(page.locator('.rest-bar-body')).toHaveCount(0)

  await logSet(page, 0, '60', '5')
  await expect(rows.nth(0)).toHaveClass(/done/)
  await expect(page.locator('.rest-bar-body')).toBeVisible()
  await expect(page.locator('.rest-label')).toHaveText('Rest')

  // A heavier second set beats the first, so the row turns gold.
  await logSet(page, 1, '80', '5')
  await expect(rows.nth(1)).toHaveClass(/done/)
  await expect(rows.nth(1)).toHaveClass(/\bpr\b/)
  await expect(rows.nth(1).locator('.check-btn')).toHaveAttribute('aria-label', /Personal record/)

  // Finish -> confirm -> rating sheet -> skip.
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.getByRole('dialog', { name: 'Finish workout?' }).getByRole('button', { name: 'Finish', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Workout complete' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.finish-summary')).toContainText('700 kg')
  await expect(sheet.locator('.finish-prs')).toBeVisible()
  await sheet.getByRole('button', { name: 'Skip' }).click()

  // Lands on the saved workout's detail page.
  await expect(page).toHaveURL(/\/history\/[^/]+$/)
  await expect(page.getByText('Bench Press (Barbell)').first()).toBeVisible()
  await expect(page.locator('.active-banner')).toHaveCount(0)

  // History lists it.
  await page.goto('/history')
  await expect(page.locator('.history-ex-list').first()).toContainText('Bench Press (Barbell)')
  await expect(page.locator('.history-ex-list li').first()).toContainText('2 sets')

  // Home counts it towards the weekly goal.
  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByLabel('1 of 3 workouts this week')).toBeVisible()

  // Stats counts the session.
  await openTab(page, 'Stats')
  await expect(page.getByRole('button', { name: '700kg Volume lifted' })).toBeVisible()
  await expect(page.getByRole('button', { name: '2 Sets', exact: true })).toBeVisible()
  await expect(page.locator('.page')).toContainText(/1\s*workout logged/)
})

test('rating the session saves effort and feeling', async ({ page }) => {
  await startEmptyAndAddBench(page)
  await logSet(page, 0, '50', '8')
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.getByRole('dialog', { name: 'Finish workout?' }).getByRole('button', { name: 'Finish', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Workout complete' })
  await sheet.locator('.rpe-row').first().locator('.chip').nth(2).click()
  await expect(sheet.locator('.rpe-row').first().locator('.chip').nth(2)).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/history\/[^/]+$/)
})

test('finishing with nothing logged warns first', async ({ page }) => {
  await startEmptyAndAddBench(page)
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Nothing logged yet' })).toBeVisible()
})
