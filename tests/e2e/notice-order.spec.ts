import { test, expect, seed, waitForApp } from './helpers/fixtures'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

test.use({ userAgent: IPHONE_SAFARI })

const regions = ['Usage data', 'Install Trana', 'Back up your data']

test('a first launch shows no notices at all', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByRole('button', { name: 'Empty workout' })).toBeVisible()
  for (const name of regions) await expect(page.getByRole('region', { name })).toHaveCount(0)
})

test('with history: the analytics question first, then the install offer, never together', async ({ page }) => {
  await seed(page)
  await expect(page.getByRole('region', { name: 'Usage data' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Install Trana' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Back up your data' })).toHaveCount(0)
  await page.getByRole('region', { name: 'Usage data' }).getByRole('button', { name: 'No thanks' }).click()
  await expect(page.getByRole('region', { name: 'Install Trana' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Back up your data' })).toHaveCount(0)
})
