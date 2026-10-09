import { test, expect, seed, waitForApp, expectNoHorizontalOverflow, readStore } from './helpers/fixtures'

// The app is served from the site root (BASE_PATH defaults to '/').
const ROUTES: { path: string; title: RegExp | string; content: RegExp }[] = [
  { path: '/', title: /.+/, content: /Your routines/ },
  { path: '/history', title: 'History', content: /Bench Press/ },
  { path: '/stats', title: 'Stats', content: /Volume lifted/ },
  { path: '/exercises', title: 'Exercises', content: /Bench Press/ },
  { path: '/exercises/bench-press-barbell', title: 'Bench Press', content: /Heaviest/ },
  { path: '/measurements', title: 'Measurements', content: /Bodyweight/i },
  { path: '/settings', title: 'Settings', content: /Export backup/ },
]

test.describe('synthetic dataset smoke', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page)
  })

  for (const r of ROUTES) {
    test(`${r.path} renders real content without overflow`, async ({ page }) => {
      await page.goto(r.path)
      await waitForApp(page)
      await expect(page.locator('.header-title')).toContainText(r.title)
      await expect(page.locator('.page')).toContainText(r.content)
      await expect(page.locator('.error-boundary, [role="alert"]:visible')).toHaveCount(0)
      await expectNoHorizontalOverflow(page)
    })
  }

  test('a history entry opens its detail page', async ({ page }) => {
    await page.goto('/history')
    const ids = (await readStore(page, 'workouts')).filter((w) => w.status === 'done')
    expect(ids.length).toBeGreaterThan(100)
    await page
      .locator('.page button', { has: page.locator('.history-ex-list') })
      .first()
      .click()
    await expect(page).toHaveURL(/\/history\/[^/]+$/)
    await expect(page.locator('.page')).toContainText(/sets?/i)
    await expectNoHorizontalOverflow(page)
  })

  test('exercise list leads to an exercise detail with a chart', async ({ page }) => {
    await page.goto('/exercises')
    await page
      .getByPlaceholder(/search/i)
      .first()
      .fill('Bench Press (Barbell)')
    await page.locator('.page button', { hasText: 'Bench Press (Barbell)' }).first().click()
    await expect(page).toHaveURL(/\/exercises\/bench-press-barbell$/)
    await expect(page.locator('.chart-controls .chip').first()).toBeVisible()
    await expect(page.locator('.chart-card svg').first()).toBeVisible()
  })

  test('unknown ids do not crash the detail pages', async ({ page }) => {
    await page.goto('/exercises/does-not-exist')
    await waitForApp(page)
    await expectNoHorizontalOverflow(page)
    await page.goto('/history/does-not-exist')
    await waitForApp(page)
    await expectNoHorizontalOverflow(page)
  })
})
