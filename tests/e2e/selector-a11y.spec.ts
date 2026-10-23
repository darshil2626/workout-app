import { test, expect, waitForApp } from './helpers/fixtures'

test('theme and unit selectors expose the selected option to assistive tech', async ({ page }) => {
  await page.goto('/settings')
  await waitForApp(page)

  const groups = page.locator('.segmented')
  const count = await groups.count()
  expect(count).toBeGreaterThanOrEqual(4)

  // Every option is a toggle button, and exactly one per group is pressed.
  for (let i = 0; i < count; i++) {
    const buttons = groups.nth(i).locator('button')
    const n = await buttons.count()
    for (let j = 0; j < n; j++) {
      await expect(buttons.nth(j)).toHaveAttribute('aria-pressed', /^(true|false)$/)
    }
    await expect(groups.nth(i).locator('button[aria-pressed="true"]')).toHaveCount(1)
  }

  // Choosing lb moves the pressed state.
  const weightGroup = page
    .locator('.field', { has: page.locator('.field-label', { hasText: /^Weight$/ }) })
    .locator('.segmented')
  await weightGroup.getByRole('button', { name: 'lb', exact: true }).click()
  await expect(weightGroup.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(weightGroup.getByRole('button', { name: 'kg', exact: true })).toHaveAttribute('aria-pressed', 'false')
})
