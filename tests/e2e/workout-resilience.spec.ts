import { test, expect, waitForApp, logSet, readStore, waitForWorkoutSaved } from './helpers/fixtures'
import type { Page } from '@playwright/test'

async function startWithBench(page: Page) {
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
}

test('reload mid-workout keeps the session and entered values', async ({ page }) => {
  await startWithBench(page)
  await page.getByLabel('Workout name').fill('Reload Test')
  await logSet(page, 0, '72.5', '6') // completed
  await page.getByRole('button', { name: 'Add set' }).click()
  await logSet(page, 1, '65', '8', false) // typed but not ticked
  await waitForWorkoutSaved(page, (w) => w.name === 'Reload Test' && w.exercises[0]?.sets.length === 2 && w.exercises[0].sets[1].reps === 8)

  await page.reload()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByLabel('Workout name')).toHaveValue('Reload Test')
  const rows = page.locator('.set-table tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByLabel('Weight', { exact: true })).toHaveValue('72.5')
  await expect(rows.nth(0).getByLabel('Reps', { exact: true })).toHaveValue('6')
  await expect(rows.nth(0)).toHaveClass(/done/)
  await expect(rows.nth(1).getByLabel('Weight', { exact: true })).toHaveValue('65')
  await expect(rows.nth(1).getByLabel('Reps', { exact: true })).toHaveValue('8')
  await expect(rows.nth(1)).not.toHaveClass(/done/)
})

test('reload on another page still shows the active-workout banner', async ({ page }) => {
  await startWithBench(page)
  await page.getByRole('button', { name: 'Minimise workout' }).click()
  await page.goto('/history')
  await waitForApp(page)
  await expect(page.locator('.active-banner')).toBeVisible()
})

test('minimise returns to the tabs and the banner resumes the workout', async ({ page }) => {
  await startWithBench(page)
  await logSet(page, 0, '50', '10', false)

  await page.getByRole('button', { name: 'Minimise workout' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.bottom-nav')).toBeVisible()
  const banner = page.locator('.active-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('Resume')

  // The banner follows you across tabs.
  await page.locator('.bottom-nav').getByRole('link', { name: 'History' }).click()
  await expect(page).toHaveURL(/\/history$/)
  await expect(banner).toBeVisible()

  await banner.getByRole('button').click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.locator('.bottom-nav')).toHaveCount(0)
  await expect(banner).toHaveCount(0)
  await expect(page.locator('.set-table tbody tr').first().getByLabel('Weight', { exact: true })).toHaveValue('50')
})

test('starting a second workout while one is running is blocked', async ({ page }) => {
  await startWithBench(page)
  await page.getByRole('button', { name: 'Minimise workout' }).click()
  // PrimaryAction becomes "resume"; a routine start is refused with a prompt.
  await page.getByRole('button', { name: 'Start routine' }).click()
  const dlg = page.getByRole('dialog', { name: 'A workout is already running' })
  await expect(dlg).toBeVisible()
  await dlg.getByRole('button', { name: 'Go to workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
})

test('discard clears the session', async ({ page }) => {
  await startWithBench(page)
  await logSet(page, 0, '50', '10', false)
  await waitForWorkoutSaved(page, (w) => w.exercises[0]?.sets[0]?.reps === 10)

  await page.getByRole('button', { name: 'Discard', exact: true }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Discard workout?' })
  await expect(dlg).toBeVisible()
  // Cancel keeps it.
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.ex-block')).toHaveCount(1)

  await page.getByRole('button', { name: 'Discard', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'Discard workout?' }).getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.active-banner')).toHaveCount(0)
  await expect.poll(async () => (await readStore(page, 'workouts')).length).toBe(0)

  // Survives a reload: nothing to resume.
  await page.reload()
  await waitForApp(page)
  await expect(page.locator('.active-banner')).toHaveCount(0)
  await page.goto('/workout')
  // /workout with no session falls back to the "No workout in progress" screen or home.
  await expect(page.locator('.active-banner')).toHaveCount(0)
})
