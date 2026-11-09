import { test, expect, waitForApp, logSet, readStore } from './helpers/fixtures'
import type { Workout } from '../../src/db/types'

async function startBench(page: import('@playwright/test').Page) {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()
  await page.getByRole('button', { name: 'Add set' }).click()
}

const weightHeader = (page: import('@playwright/test').Page) => page.locator('.set-table thead .col-weight').first()

test.describe('a US device', () => {
  test.use({ locale: 'en-US' })

  test('a first workout logs in lb, and one tap switches it to kg', async ({ page }) => {
    await startBench(page)
    await expect(weightHeader(page)).toHaveText('Weight (lb)')
    await expect(page.getByText('Logging in lb ·')).toBeVisible()

    await page.getByRole('button', { name: 'Use kg' }).click()
    await expect(weightHeader(page)).toHaveText('Weight (kg)')
    await expect(page.getByText('Logging in kg ·')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use lb' })).toBeVisible()

    // Distance and length followed, because none had been changed by hand.
    await page.goto('/settings')
    await waitForApp(page)
    await expect(page.getByRole('button', { name: 'km', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'cm', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })
})

test('the default locale stays in kg, and the unit line can be dismissed on its own', async ({ page }) => {
  await startBench(page)
  await expect(weightHeader(page)).toHaveText('Weight (kg)')
  await expect(page.getByRole('button', { name: 'Use lb' })).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss unit tip' }).click()
  await expect(page.getByRole('button', { name: 'Use lb' })).toHaveCount(0)
  // The tick tip is a separate thing and is still there.
  await expect(page.getByRole('note')).toContainText('tap the tick')
  expect(await page.evaluate(() => localStorage.getItem('trana.unitHintSeen'))).toBe('1')
})

test('"Got it" on the tick tip also retires the unit line', async ({ page }) => {
  await startBench(page)
  await page.getByRole('note').getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByRole('button', { name: 'Use lb' })).toHaveCount(0)
})

test('ticking a set keeps the unit line, since a wrong unit shows up after the first set', async ({ page }) => {
  await startBench(page)
  await logSet(page, 0, '60', '5')
  await expect(page.getByRole('button', { name: 'Use lb' })).toBeVisible()
})

test('switching keeps the typed number and changes what it means (60 kg becomes 60 lb)', async ({ page }) => {
  await startBench(page)
  await logSet(page, 0, '60', '5')
  const weight = page.locator('.set-table tbody tr').first().getByLabel('Weight', { exact: true })
  await expect(weight).toHaveValue('60')

  await page.getByRole('button', { name: 'Use lb' }).click()
  await expect(weightHeader(page)).toHaveText('Weight (lb)')
  await expect(weight).toHaveValue('60')
  // Stored as 60 lb in kg, not left at 60 kg (which would read 132.28 lb).
  await expect
    .poll(async () => {
      const w = (await readStore<Workout>(page, 'workouts')).find((x) => x.status === 'active')
      return w?.exercises[0]?.sets[0]?.weight
    })
    .toBe(27.216)
})
