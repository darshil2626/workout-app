import { test, expect, seed, waitForApp } from './helpers/fixtures'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

const regions = ['Usage data', 'Install Trana', 'Back up your data']

// On iOS a Safari tab and a Home Screen app keep separate storage, so a workout
// logged in the tab is not in the installed app. The install offer therefore shows
// before the first workout, and once there is history it offers an export to carry
// it across. Notice order itself is covered in notice-order.spec.ts.
test.use({ userAgent: IPHONE_SAFARI })

test('a first launch shows only the install nudge, and dismissing it leaves nothing', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByRole('button', { name: 'Empty workout' })).toBeVisible()
  const banner = page.getByRole('region', { name: 'Install Trana' })
  await expect(banner).toContainText('Add Trana to your Home Screen first')
  await expect(banner).toContainText('inside whichever app you open Trana from')
  await expect(banner.getByRole('button', { name: 'Export backup' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Usage data' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Back up your data' })).toHaveCount(0)

  await banner.getByRole('button', { name: 'How' }).click()
  const sheet = page.getByRole('dialog', { name: 'Install Trana' })
  await expect(sheet).toContainText('In the compact Safari layout, tap ••• first')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  await banner.getByRole('button', { name: 'Dismiss' }).click()
  for (const name of regions) await expect(page.getByRole('region', { name })).toHaveCount(0)
  // The snooze holds across a reload.
  await page.reload()
  await waitForApp(page)
  for (const name of regions) await expect(page.getByRole('region', { name })).toHaveCount(0)
})

test('the Export backup button in the install offer saves a real backup', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: { name: string; text: string } }
    navigator.canShare = () => true
    navigator.share = async (data) => {
      const file = data?.files?.[0]
      if (file) w.__shared = { name: file.name, text: await file.text() }
    }
  })
  await seed(page)
  await page.getByRole('region', { name: 'Install Trana' }).getByRole('button', { name: 'Export backup' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared?: { name: string } }).__shared?.name))
    .toMatch(/^trana-backup-\d{4}-\d{2}-\d{2}\.json$/)
})

test.describe('already installed (Home Screen app)', () => {
  test.beforeEach(async ({ page }) => {
    // iOS Safari reports a Home Screen launch through navigator.standalone.
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'standalone', { get: () => true })
    })
  })

  test('with history: the analytics question first and no install banner', async ({ page }) => {
    await seed(page)
    await expect(page.getByRole('region', { name: 'Usage data' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Install Trana' })).toHaveCount(0)
    await page.getByRole('region', { name: 'Usage data' }).getByRole('button', { name: 'No thanks' }).click()
    await expect(page.getByRole('region', { name: 'Usage data' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Install Trana' })).toHaveCount(0)
  })
})
