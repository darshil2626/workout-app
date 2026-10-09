import { test, expect, seed } from './helpers/fixtures'

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
})

test('Settings offers feedback, and copy-debug-info holds facts but no workout content', async ({ page }) => {
  await seed(page)
  await page.goto('/settings')
  await expect(page.getByRole('link', { name: 'Send feedback or report a bug' })).toHaveAttribute(
    'href',
    /github\.com\/.*\/issues\/new\/choose/,
  )

  await page.getByRole('button', { name: 'Copy debug info' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Copied/ })).toBeVisible()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('Build:')
  expect(text).toMatch(/Stored: \d+ workouts, \d+ routines/)
  expect(text).toMatch(/Database version: 4(\r?\n|$)/)
  // Nothing from inside the history.
  expect(text).not.toContain('Bench Press')
})

test('a failure appears in the report by kind and class, never its message', async ({ page, errors }) => {
  await seed(page)
  await page.goto('/settings')
  await page.evaluate(() => {
    void Promise.reject(new TypeError('my private routine name'))
  })
  await expect.poll(() => page.evaluate(() => localStorage.getItem('trana_recent_errors'))).toContain('TypeError')
  // The app logs the failure on purpose; this test expects it.
  errors.length = 0

  await page.getByRole('button', { name: 'Copy debug info' }).click()
  // The clipboard is written asynchronously and persists between tests.
  await expect(page.getByRole('status').filter({ hasText: /^Copied/ })).toBeVisible()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toMatch(/unhandledrejection TypeError/)
  expect(text).not.toContain('private routine')
})
