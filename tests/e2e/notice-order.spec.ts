import { test, expect, seed, waitForApp } from './helpers/fixtures'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

const regions = ['Usage data', 'Install Trana', 'Back up your data']

// On iOS a Safari tab and a Home Screen app keep separate storage, so the install
// offer moves ahead of everything else there (see HomeNotices). Elsewhere a first
// launch stays empty and the analytics question still comes first.

test.describe('Android', () => {
  test.use({ userAgent: ANDROID_CHROME })

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
})

test.describe('desktop', () => {
  test.use({ userAgent: DESKTOP_CHROME })

  test('a first launch shows no notices at all', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByRole('button', { name: 'Empty workout' })).toBeVisible()
    for (const name of regions) await expect(page.getByRole('region', { name })).toHaveCount(0)
  })
})

test.describe('iPhone, in a Safari tab', () => {
  test.use({ userAgent: IPHONE_SAFARI })

  test('a first launch shows only the install nudge', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByRole('button', { name: 'Empty workout' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Install Trana' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Usage data' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Back up your data' })).toHaveCount(0)
  })

  test('with history: the install offer first with an export, then the analytics question, never together', async ({
    page,
  }) => {
    await seed(page)
    const banner = page.getByRole('region', { name: 'Install Trana' })
    await expect(banner).toContainText('Add to Home Screen to keep your data')
    await expect(banner).toContainText('export a backup, install, then use Settings → Import in the app')
    await expect(banner.getByRole('button', { name: 'Export backup' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Usage data' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Back up your data' })).toHaveCount(0)

    await banner.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByRole('region', { name: 'Usage data' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Install Trana' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Back up your data' })).toHaveCount(0)
  })
})
