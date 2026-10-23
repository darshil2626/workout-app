import { test, expect, seed, waitForApp } from './helpers/fixtures'

test('Home nudges towards a backup, and making one clears the nudge', async ({ page }) => {
  await seed(page)
  // The analytics question comes first; the reminder follows once it is answered.
  await page.getByRole('region', { name: 'Usage data' }).getByRole('button', { name: 'No thanks' }).click()
  // One notice at a time: if the install offer is up, it goes first.
  const install = page.getByRole('region', { name: 'Install Trana' })
  await expect(install.or(page.getByRole('region', { name: 'Back up your data' }))).toBeVisible()
  if (await install.isVisible()) await install.getByRole('button', { name: 'Dismiss' }).click()
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
  // The analytics question comes first; the reminder follows once it is answered.
  await page.getByRole('region', { name: 'Usage data' }).getByRole('button', { name: 'No thanks' }).click()
  // One notice at a time: if the install offer is up, it goes first.
  const install = page.getByRole('region', { name: 'Install Trana' })
  await expect(install.or(page.getByRole('region', { name: 'Back up your data' }))).toBeVisible()
  if (await install.isVisible()) await install.getByRole('button', { name: 'Dismiss' }).click()
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

test('notices keep clear of the start buttons above them', async ({ page }) => {
  await seed(page)
  const notice = page.getByRole('region', { name: 'Usage data' })
  await expect(notice).toBeVisible()
  const gap = await notice.evaluate((el) => {
    const above = el.previousElementSibling
    if (!above) return null
    return el.getBoundingClientRect().top - above.getBoundingClientRect().bottom
  })
  expect(gap).not.toBeNull()
  expect(gap as number).toBeGreaterThanOrEqual(16)
})
