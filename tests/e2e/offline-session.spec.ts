import { test, expect, waitForApp, openTab, logSet, readStore, waitForWorkoutSaved } from './helpers/fixtures'
import type { Page } from '@playwright/test'

async function swReady(page: Page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    if (!reg.active) throw new Error('no active service worker')
  })
}

async function addBench(page: Page) {
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()
  await expect(page.locator('.ex-block')).toHaveCount(1)
}

async function finishAndSkipRating(page: Page) {
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Finish workout?' })
    .getByRole('button', { name: 'Finish', exact: true })
    .click()
  await page.getByRole('dialog', { name: 'Workout complete' }).getByRole('button', { name: 'Skip' }).click()
  // A first-ever finish asks for training days next (optional); skip that too.
  await page
    .getByRole('dialog', { name: 'Which days do you usually train?' })
    .getByRole('button', { name: 'Skip' })
    .click()
  await expect(page).toHaveURL(/\/history\/[^/]+$/)
}

async function expectOneFinishedWorkout(page: Page) {
  const workouts = await readStore(page, 'workouts')
  expect(workouts.filter((w) => w.status === 'active')).toHaveLength(0)
  expect(workouts.filter((w) => w.status !== 'active')).toHaveLength(1)
}

test('a full session offline: log, finish, history and stats, then back online with data intact', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await waitForApp(page)
  await swReady(page)

  await context.setOffline(true)
  // Cold start from the service worker while offline.
  await page.goto('/')
  await waitForApp(page)

  await page.getByRole('button', { name: 'Empty workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await addBench(page)
  await logSet(page, 0, '60', '5')
  await expect(page.locator('.set-table tbody tr').nth(0)).toHaveClass(/done/)
  await finishAndSkipRating(page)

  await openTab(page, 'History')
  await expect(page.locator('.history-ex-list').first()).toContainText('Bench Press (Barbell)')
  await openTab(page, 'Stats')
  await expect(page.getByRole('button', { name: '300kg Volume lifted' })).toBeVisible()

  await context.setOffline(false)
  await page.reload()
  await waitForApp(page)
  await expectOneFinishedWorkout(page)
  await openTab(page, 'History')
  await expect(page.locator('.history-ex-list').first()).toContainText('Bench Press (Barbell)')
})

test('going offline partway through a workout loses nothing', async ({ page, context }) => {
  await page.goto('/')
  await waitForApp(page)
  await swReady(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await addBench(page)
  await logSet(page, 0, '60', '5')

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Add set' }).click()
  await logSet(page, 1, '70', '5')
  await expect(page.locator('.set-table tbody tr').nth(1)).toHaveClass(/done/)

  // A reload while offline keeps both sets (once the debounced autosave has landed).
  await waitForWorkoutSaved(page, (w) => w.exercises[0]?.sets.length === 2 && w.exercises[0].sets[1].weight === 70)
  await page.reload()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.locator('.set-table tbody tr')).toHaveCount(2)
  await expect(page.locator('.set-table tbody tr').nth(1)).toHaveClass(/done/)

  await finishAndSkipRating(page)
  await context.setOffline(false)
  await page.reload()
  await waitForApp(page)
  await expectOneFinishedWorkout(page)
  await openTab(page, 'Stats')
  await expect(page.getByRole('button', { name: '2 Sets', exact: true })).toBeVisible()
})
