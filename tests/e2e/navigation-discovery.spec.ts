import { test, expect, waitForApp } from './helpers/fixtures'

test('the exercise library is a labelled button, and Measurements is reachable from Settings', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByRole('button', { name: 'Exercises', exact: true })).toBeVisible()

  await page.goto('/settings')
  await page
    .getByRole('button', { name: /Body measurements/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/measurements$/)
})
