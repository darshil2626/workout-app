import { test, expect, waitForApp, openTab } from './helpers/fixtures'

test.describe('cold start with an empty database', () => {
  test('loads with the starter routine and no active workout', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    // A fresh install is seeded with one starter routine, so the dashboard
    // (not the first-run screen) is what a brand-new user lands on.
    await expect(page.getByRole('button', { name: 'Start Full Body Starter' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Empty workout' })).toBeVisible()
    await expect(page.locator('.active-banner')).toHaveCount(0)
  })

  test('first-run screen shows once the starter routine is deleted', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.locator('.card', { hasText: 'Full Body Starter' }).getByRole('button').first().click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Delete routine/ })
      .click()
    await page
      .getByRole('dialog', { name: /Delete/ })
      .getByRole('button', { name: 'Delete', exact: true })
      .click()
    await expect(page.getByRole('heading', { name: /log the first one/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start empty workout' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Build a routine first' })).toBeVisible()
    await expect(page.locator('.active-banner')).toHaveCount(0)
  })

  test('every bottom-nav tab opens', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const nav = page.locator('.bottom-nav')
    await expect(nav.getByRole('link')).toHaveCount(3)

    await openTab(page, 'History')
    await expect(page).toHaveURL(/\/history$/)
    await expect(nav.getByRole('link', { name: 'History' })).toHaveClass(/active/)
    await expect(page.locator('.page')).toBeVisible()

    await openTab(page, 'Stats')
    await expect(page).toHaveURL(/\/stats$/)
    await expect(nav.getByRole('link', { name: 'Stats' })).toHaveClass(/active/)
    await expect(page.locator('.page')).toBeVisible()

    await openTab(page, 'Home')
    await expect(page).toHaveURL(/\/$/)
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveClass(/active/)
    await expect(page.getByRole('button', { name: 'Empty workout' })).toBeVisible()
  })

  test('header shortcuts open the exercise library and settings', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Exercise library' }).click()
    await expect(page).toHaveURL(/\/exercises$/)
    await page.goBack()
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })

  test('unknown routes fall back to home', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Empty workout' })).toBeVisible()
  })
})
