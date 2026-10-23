import { test, expect, waitForApp } from './helpers/fixtures'

async function openBench(page: import('@playwright/test').Page, fresh = true) {
  if (fresh) {
    await page.goto('/')
    await waitForApp(page)
  }
  await page.getByRole('button', { name: 'Exercises', exact: true }).click()
  await page.getByPlaceholder(/Search/).fill('Bench Press (Barbell)')
  await page.getByText('Bench Press (Barbell)').first().click()
}

test('an exercise page starts a workout with that exercise', async ({ page }) => {
  await openBench(page)
  await page.getByRole('button', { name: 'Start workout with this' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByText('Bench Press (Barbell)').first()).toBeVisible()
  await expect(page.locator('.set-table tbody tr')).toHaveCount(1)
})

test('with a workout running it adds to it, and does not add twice', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByRole('button', { name: 'Minimise workout' }).click()
  await openBench(page, false)
  await page.getByRole('button', { name: 'Add to current workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.locator('.ex-block')).toHaveCount(1)
  await page.getByRole('button', { name: 'Minimise workout' }).click()
  await openBench(page, false)
  await page.getByRole('button', { name: 'Go to current workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.locator('.ex-block')).toHaveCount(1)
})
