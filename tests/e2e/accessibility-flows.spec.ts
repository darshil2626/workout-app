import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect, seed, waitForApp, logSet, readStore } from './helpers/fixtures'

/**
 * The screens and sheets people spend the most time in once they are logging, which
 * the route-level axe checks (accessibility.spec.ts) never reach: the active workout,
 * a finished workout, the routine editor, and the sheets opened from them.
 */

async function expectNoViolations(page: Page) {
  // Entry animations fade text in from transparent; measuring mid-fade reports contrast
  // that no one ever sees.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' | ')}`)
  expect(summary).toEqual([])
}

async function startWorkoutWithBench(page: Page) {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  // The picker itself is one of the surfaces to check.
  await expect(picker).toBeVisible()
  await expectNoViolations(page)
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()
  await expect(page.locator('.ex-block')).toHaveCount(1)
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility of logging flows (${scheme} theme)`, () => {
    test.use({ colorScheme: scheme })

    test('active workout, with and without a completed set, and its sheets', async ({ page }) => {
      await seed(page)
      await startWorkoutWithBench(page)
      await expectNoViolations(page)

      // Name it after a session already in history, so the screen has something to compare
      // against and shows its up/down badge. The default name depends on the time of day,
      // which used to make this coverage come and go.
      const [previous] = (await readStore(page, 'workouts')).filter((w) => w.status === 'done')
      await page.getByLabel('Workout name').fill(previous.name)
      await logSet(page, 0, '72.5', '6')
      await expect(page.locator('.delta-badge').first()).toBeVisible()
      await expectNoViolations(page)

      // The set menu opened from the set number.
      await page.locator('.set-table tbody tr').first().locator('.set-badge').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)

      // The finish confirmation and the effort/feeling sheet after it.
      await page.getByRole('button', { name: 'Finish', exact: true }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page)
    })

    test('a finished workout, and the routine editor', async ({ page }) => {
      await seed(page)
      await page.goto('/history')
      await waitForApp(page)
      await page.locator('.card-tappable').first().click()
      await expect(page).toHaveURL(/\/history\/[^/]+$/)
      await waitForApp(page)
      await expectNoViolations(page)

      await page.goto('/routines/new')
      await waitForApp(page)
      await expectNoViolations(page)
    })

    test('the first-run screen on an empty install', async ({ page }) => {
      await page.goto('/')
      await waitForApp(page)
      await expectNoViolations(page)
    })
  })
}
