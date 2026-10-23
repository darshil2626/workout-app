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

  // A minus sign is not turned into a positive number.
  await weight.fill('-20')
  await weight.blur()
  await expect(weight).toHaveValue('')
  await reps.fill('-5')
  await reps.blur()
  await expect(reps).toHaveValue('')

  // Normal values still work.
  await weight.fill('60')
  await weight.blur()
  await expect(weight).toHaveValue('60')
})
