import { test, expect, seed, waitForApp } from './helpers/fixtures'

test('Home nudges towards a backup, and making one clears the nudge', async ({ page }) => {
  await seed(page)
  const reminder = page.getByRole('region', { name: 'Back up your data' })
  await expect(reminder).toBeVisible()
  await expect(reminder).toContainText(/workouts live only on this device/)

  const download = page.waitForEvent('download')
  await reminder.getByRole('button', { name: 'Back up' }).click()
  await download
  await expect(reminder).toHaveCount(0)

  await page.goto('/settings')
  await expect(page.locator('.page')).toContainText('Last backup today.')
})

test('dismissing the reminder keeps it away', async ({ page }) => {
  await seed(page)
  const reminder = page.getByRole('region', { name: 'Back up your data' })
  await reminder.getByRole('button', { name: 'Dismiss' }).click()
  await expect(reminder).toHaveCount(0)
  await page.reload()
  await waitForApp(page)
  await expect(reminder).toHaveCount(0)
})

test('a fresh install is not nagged', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByRole('region', { name: 'Back up your data' })).toHaveCount(0)
})
