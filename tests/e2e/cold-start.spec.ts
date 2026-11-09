import { test, expect, waitForApp, openTab } from './helpers/fixtures'

/** The first-run "I already lift" card, which a cold start lands on. */
const ALREADY_LIFT = /I already lift/

test.describe('cold start with an empty database', () => {
  // Changed on purpose: a fresh install used to be seeded with a "Full Body
  // Starter" routine, so it opened on the dashboard (and the first-run screen
  // was only reachable by deleting that routine). It now has no routine and
  // opens on the first-run question instead.
  test('loads on the first-run question with no routine and no active workout', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByRole('heading', { name: 'How do you want to start?' })).toBeVisible()
    await expect(page.getByRole('button', { name: /I’m new to lifting/ })).toBeVisible()
    await expect(page.getByRole('button', { name: ALREADY_LIFT })).toBeVisible()
    await expect(page.getByRole('button', { name: /I’m switching from another app/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Build a routine first' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Full Body Starter/ })).toHaveCount(0)
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
    // Was 'Empty workout' on the seeded dashboard; an empty install now shows the first-run cards.
    await expect(page.getByRole('button', { name: ALREADY_LIFT })).toBeVisible()
  })

  test('header shortcuts open the exercise library and settings', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Exercises', exact: true }).click()
    await expect(page).toHaveURL(/\/exercises$/)
    await page.goBack()
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })

  test('unknown routes fall back to home', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: ALREADY_LIFT })).toBeVisible()
  })
})
