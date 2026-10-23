import { test, expect, waitForApp } from './helpers/fixtures'

test('a sheet takes focus, keeps Tab inside, and returns focus on close', async ({ page }) => {
  await page.goto('/measurements')
  await waitForApp(page)

  const add = page.getByRole('button', { name: 'Add Bodyweight entry' })
  await add.focus()
  await add.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))

  // Focus moved in on open.
  expect(await inside()).toBe(true)

  // Tab and Shift+Tab far past the ends never reach the page behind.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await inside()).toBe(true)
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await inside()).toBe(true)
  }

  // Closing puts focus back on the button that opened it.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(add).toBeFocused()
})
