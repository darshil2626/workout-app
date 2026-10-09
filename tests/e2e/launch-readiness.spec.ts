import { test, expect, seed, waitForApp } from './helpers/fixtures'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

test.describe('iPhone, not installed', () => {
  test.use({ userAgent: IPHONE_SAFARI })

  test('says plainly that Safari can delete the data until it is added to the Home Screen', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const banner = page.getByRole('region', { name: 'Install Trana' })
    await expect(banner).toContainText('Add to Home Screen to keep your data')
    await expect(banner).toContainText(/delete a website.s data/)
  })

  test('backup goes through the share sheet, as a real JSON file', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __shared?: { name: string; text: string } }
      navigator.canShare = () => true
      navigator.share = async (data) => {
        const file = data?.files?.[0]
        if (file) w.__shared = { name: file.name, text: await file.text() }
      }
    })
    await seed(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: /Export backup/ }).click()
    await expect(page.locator('.page')).toContainText('Backup ready. Choose Save to Files')

    const shared = await page.evaluate(
      () => (window as unknown as { __shared: { name: string; text: string } }).__shared,
    )
    expect(shared.name).toMatch(/^trana-backup-\d{4}-\d{2}-\d{2}\.json$/)
    const parsed = JSON.parse(shared.text)
    expect(parsed.app).toBe('trana')
    expect(parsed.workouts.length).toBeGreaterThan(100)
    await expect(page.locator('.page')).toContainText('Last backup today.')
  })

  test('dismissing the share sheet does not count as a backup', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.canShare = () => true
      navigator.share = async () => {
        throw new DOMException('dismissed', 'AbortError')
      }
    })
    await seed(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: /Export backup/ }).click()
    // Give a wrongly recorded backup time to show up.
    await page.waitForTimeout(500)
    await expect(page.locator('.page')).toContainText('You have not made a backup yet.')
    await expect(page.locator('.page')).not.toContainText('Backup ready')
  })
})

test('a tab left behind by another tab upgrading the database is told to reload', async ({ page, context }) => {
  await page.goto('/')
  await waitForApp(page)

  const other = await context.newPage()
  await other.goto('/')
  await other.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('trana', 500)
        open.onupgradeneeded = () => {}
        open.onsuccess = () => {
          open.result.close()
          resolve()
        }
        open.onerror = () => reject(open.error)
      }),
  )

  const toast = page.getByRole('status').filter({ hasText: /updated in another window/ })
  await expect(toast).toBeVisible()
  await expect(toast.getByRole('button', { name: 'Reload' })).toBeVisible()
})

test('a browser without colour-mix gets an explanation, not a broken app', async ({ page }) => {
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS)
    CSS.supports = ((...args: string[]) =>
      args.join(' ').includes('color-mix')
        ? false
        : (supports as (...a: string[]) => boolean)(...args)) as typeof CSS.supports
  })
  await page.goto('/')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Trana needs a newer browser')
  await expect(alert).toContainText('iOS 16.2')
  await expect(alert).toContainText('have not been touched')
  // The database was never opened.
  const dbs = await page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name)))
  expect(dbs).not.toContain('trana')
})
