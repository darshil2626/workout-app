import { test, expect, waitForApp } from './helpers/fixtures'

test('set inputs reject negatives and absurd values instead of storing them', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()

  const row = page.locator('.set-table tbody tr').first()
  const weight = row.getByLabel('Weight', { exact: true })
  const reps = row.getByLabel('Reps', { exact: true })

  // Over the limit: not kept, the field falls back to blank on blur.
  await weight.fill('99999999999')
  await weight.blur()
  await expect(weight).toHaveValue('')
  // ...and the row says why, to sighted and screen reader users alike.
  const weightHint = row.getByText('Max 1000 kg')
  await expect(weightHint).toBeVisible()
  await expect(weight).toHaveAttribute('aria-describedby', (await weightHint.getAttribute('id')) ?? '')

  // A minus sign is not turned into a positive number.
  await weight.fill('-20')
  await weight.blur()
  await expect(weight).toHaveValue('')
  await expect(row.getByText('Must be 0 or more')).toBeVisible()
  await reps.fill('-5')
  await reps.blur()
  await expect(reps).toHaveValue('')
  await reps.fill('1000')
  await expect(row.getByText('Max 999 reps')).toBeVisible()
  await reps.fill('8')
  await expect(row.getByText('Max 999 reps')).toBeHidden()

  // Normal values still work.
  await weight.fill('60')
  await weight.blur()
  await expect(weight).toHaveValue('60')
})

test('hints cover distance and duration, follow the unit, and clear on focus', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Plank')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()

  const row = page.locator('.set-table tbody tr').first()
  const duration = row.getByLabel('Duration', { exact: true })

  await duration.fill('-5')
  await expect(row.getByText('Must be 0 or more')).toBeVisible()
  await duration.fill('25:00:00')
  await expect(row.getByText('Max 24 h')).toBeVisible()
  await duration.blur()
  await expect(duration).toHaveValue('')

  // Refocusing the field dismisses the stale message.
  await duration.focus()
  await expect(row.getByText('Max 24 h')).toBeHidden()
})

test('the weight hint names the limit in the chosen unit', async ({ page }) => {
  await page.goto('/settings')
  await page
    .locator('.field', { has: page.locator('.field-label', { hasText: /^Weight$/ }) })
    .locator('.segmented button', { hasText: 'lb' })
    .click()
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()

  const row = page.locator('.set-table tbody tr').first()
  await row.getByLabel('Weight', { exact: true }).fill('9999')
  // 1000 kg, shown in lb.
  await expect(row.getByText('Max 2204.62 lb')).toBeVisible()
})
