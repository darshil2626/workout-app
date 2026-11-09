import { test, expect, waitForApp, readStore } from './helpers/fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByRole('heading', { name: 'How do you want to start?' })).toBeVisible()
})

test('"I already lift" starts an empty workout', async ({ page }) => {
  await page.getByRole('button', { name: /I already lift/ }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.locator('.ex-block')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
  // Nothing was saved as a routine on the way.
  expect(await readStore(page, 'routines')).toHaveLength(0)
})

test('"I\'m new to lifting" saves the dumbbell template and starts its first day', async ({ page }) => {
  await page.getByRole('button', { name: /I’m new to lifting/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Pick a starter routine' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Not medical advice')
  // Dumbbells and machines lead; the barbell routine is offered, not led with.
  const options = sheet.locator('.sheet-list-item')
  await expect(options).toHaveCount(5)
  await expect(options.first()).toContainText('Full Body (Dumbbells)')
  await expect(options.nth(1)).toContainText('Full Body (Machines)')

  await options.first().click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.locator('.ex-block .ex-name')).toHaveText([
    'Goblet Squat',
    'Bench Press (Dumbbell)',
    'Bent Over Row (Dumbbell)',
    'Bicep Curl (Dumbbell)',
  ])

  // Both days are kept as the user's own routines, in a folder named after the template.
  await expect
    .poll(async () => (await readStore(page, 'routines')).map((r) => r.name).sort())
    .toEqual(['Dumbbell Full Body A', 'Dumbbell Full Body B'])
  expect((await readStore(page, 'folders')).map((f) => f.name)).toEqual(['Full Body (Dumbbells)'])
})

test('"I\'m switching from another app" opens Settings at the import button', async ({ page }) => {
  await page.getByRole('button', { name: /I’m switching from another app/ }).click()
  await expect(page).toHaveURL(/\/settings\?import=1$/)
  const importButton = page.getByRole('button', { name: 'Import backup or CSV' })
  await expect(importButton).toBeInViewport()
  await expect(importButton).toBeFocused()
  await expect(importButton).toHaveClass(/btn-primary/)
})

test('"Build a routine first" opens the routine editor', async ({ page }) => {
  await page.getByRole('button', { name: 'Build a routine first' }).click()
  await expect(page).toHaveURL(/\/routines\/new$/)
})
