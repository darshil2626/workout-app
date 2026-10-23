import { test, expect, waitForApp, logSet } from './helpers/fixtures'

async function startBench(page: import('@playwright/test').Page) {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()
  await page.getByRole('button', { name: 'Add set' }).click()
}

test('a repeat set copies the set above, so it is one tap', async ({ page }) => {
  await startBench(page)
  await logSet(page, 0, '60', '5')
  const second = page.locator('.set-table tbody tr').nth(1)
  await expect(second.getByLabel('Weight', { exact: true })).toHaveAttribute('placeholder', '60')
  await second.locator('.check-btn').click()
  await expect(second).toHaveClass(/done/)
  await expect(second.getByLabel('Weight', { exact: true })).toHaveValue('60')
  await expect(second.getByLabel('Reps', { exact: true })).toHaveValue('5')
})

test('ticking a loaded lift with no weight asks for the weight instead of logging 0 kg', async ({ page }) => {
  await startBench(page)
  const first = page.locator('.set-table tbody tr').first()
  await first.locator('.check-btn').click()
  await expect(first).not.toHaveClass(/done/)
  await expect(first.getByLabel('Weight', { exact: true })).toBeFocused()
  await expect(first.getByLabel('Weight', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await first.getByLabel('Weight', { exact: true }).fill('40')
  await first.getByLabel('Reps', { exact: true }).fill('8')
  await first.getByLabel('Reps', { exact: true }).blur()
  await first.locator('.check-btn').click()
  await expect(first).toHaveClass(/done/)
})

test('a first workout shows the tick hint, and dismissing it is remembered', async ({ page }) => {
  await startBench(page)
  const hint = page.getByRole('note')
  await expect(hint).toContainText('tap the tick')
  await hint.getByRole('button', { name: 'Got it' }).click()
  await expect(hint).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('trana.tickHintSeen'))).toBe('1')
})

test('the hint goes away once a set is ticked', async ({ page }) => {
  await startBench(page)
  await expect(page.getByRole('note')).toHaveCount(1)
  await logSet(page, 0, '60', '5')
  await expect(page.getByRole('note')).toHaveCount(0)
})

test('an empty History offers to start the first workout', async ({ page }) => {
  await page.goto('/history')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Start your first workout' }).click()
  await expect(page.getByRole('button', { name: 'Empty workout' })).toBeVisible()
})
