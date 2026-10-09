import { test, expect, seed, waitForApp, readStore } from './helpers/fixtures'

test('History draws a page at a time, but totals and reach cover everything', async ({ page }) => {
  await seed(page)
  const done = (await readStore(page, 'workouts')).filter((w) => w.status === 'done').length
  expect(done).toBeGreaterThan(120)

  await page.goto('/history')
  await waitForApp(page)
  const cards = page.locator('.card-tappable')
  await expect(cards).toHaveCount(60)
  // The summary counts the whole history, not what is drawn.
  await expect(page.locator('.list-summary')).toContainText(String(done))

  const more = page.getByRole('button', { name: /Show earlier workouts/ })
  await expect(more).toContainText(`${done - 60} more`)
  // No scrolling: bringing the button into view would trigger the auto-load below.
  await more.dispatchEvent('click')
  await expect(cards).toHaveCount(120)

  // Scrolling to the end loads the rest without pressing anything.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(cards).toHaveCount(done)
  await expect(more).toHaveCount(0)
})

test('a short history shows no paging control', async ({ page }) => {
  await page.goto('/history')
  await waitForApp(page)
  await expect(page.getByRole('button', { name: /Show earlier workouts/ })).toHaveCount(0)
})
