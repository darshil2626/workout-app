import { test, expect, waitForApp, readStore } from './helpers/fixtures'
import type { Page } from '@playwright/test'

async function addExercise(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill(name)
  await picker.locator('.picker-item', { hasText: name }).first().click()
  await picker.getByRole('button', { name: /^Add 1 exercise/ }).click()
  await expect(picker).toHaveCount(0)
}

const names = (page: Page) => page.locator('.ex-block .ex-name')

test('create, edit, and start a routine with prefilled targets', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  // --- create ---
  // No seeded routine any more, so an empty install opens on the first-run question.
  await page.getByRole('button', { name: 'Build a routine first' }).click()
  await expect(page).toHaveURL(/\/routines\/new$/)
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await page.locator('#routine-name').fill('Push Day')
  await addExercise(page, 'Bench Press (Barbell)')
  await addExercise(page, 'Squat (Barbell)')
  await expect(names(page)).toHaveText(['Bench Press (Barbell)', 'Squat (Barbell)'])

  // New exercises come with 3 empty target sets; set targets on bench's first set.
  const bench = page.locator('.ex-block').first()
  await expect(bench.locator('tbody tr')).toHaveCount(3)
  await bench.getByLabel('Target weight').first().fill('100')
  await bench.getByLabel('Target reps').first().fill('5')
  await bench.getByLabel('Target reps').first().blur()
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/\/$/)
  const card = page.locator('.card', { hasText: 'Push Day' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('2 exercises')
  await expect(card).toContainText('6 sets')
  await expect.poll(async () => (await readStore(page, 'routines')).some((r) => r.name === 'Push Day')).toBe(true)

  // --- edit: reorder, add, remove ---
  await card.getByRole('button').first().click()
  await page
    .getByRole('dialog', { name: 'Push Day' })
    .getByRole('button', { name: /Edit routine/ })
    .click()
  await expect(page).toHaveURL(/\/routines\/[^/]+$/)
  await expect(names(page)).toHaveText(['Bench Press (Barbell)', 'Squat (Barbell)'])

  // Move Squat up.
  await page.locator('.ex-block').nth(1).getByRole('button', { name: 'Exercise options' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Move up/ })
    .click()
  await expect(names(page)).toHaveText(['Squat (Barbell)', 'Bench Press (Barbell)'])

  // Add a third, then remove it again.
  await addExercise(page, 'Deadlift (Barbell)')
  await expect(names(page)).toHaveCount(3)
  await page.locator('.ex-block').nth(2).getByRole('button', { name: 'Exercise options' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Remove exercise/ })
    .click()
  await expect(names(page)).toHaveText(['Squat (Barbell)', 'Bench Press (Barbell)'])

  // Add a set to bench (copies the last target) then save.
  await page.locator('.ex-block').nth(1).getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.ex-block').nth(1).locator('tbody tr')).toHaveCount(4)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/$/)

  const edited = page.locator('.card', { hasText: 'Push Day' })
  await expect(edited).toContainText('7 sets')
  await expect(edited.locator('.history-ex-list li').first()).toContainText('Squat (Barbell)')

  // --- start from Home: sets are prefilled from the targets ---
  await edited.getByRole('button', { name: 'Start routine' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByLabel('Workout name')).toHaveValue('Push Day')
  await expect(names(page)).toHaveText(['Squat (Barbell)', 'Bench Press (Barbell)'])
  const benchRows = page.locator('.ex-block').nth(1).locator('.set-table tbody tr')
  await expect(benchRows).toHaveCount(4)
  await expect(benchRows.nth(0).getByLabel('Weight', { exact: true })).toHaveValue('100')
  await expect(benchRows.nth(0).getByLabel('Reps', { exact: true })).toHaveValue('5')
  // Untargeted sets stay blank.
  await expect(benchRows.nth(1).getByLabel('Weight', { exact: true })).toHaveValue('')
})

test('cancel on a changed routine asks before discarding', async ({ page }) => {
  await page.goto('/routines/new')
  await page.locator('#routine-name').fill('Throwaway')
  await page.getByRole('button', { name: 'Cancel' }).click()
  const dlg = page.getByRole('dialog', { name: 'Discard changes?' })
  await expect(dlg).toBeVisible()
  await dlg.getByRole('button', { name: 'Discard' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.card', { hasText: 'Throwaway' })).toHaveCount(0)
})

test('routine target fields reject values over the set-row limits', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Build a routine first' }).click()
  await page.locator('#routine-name').fill('Limits')
  await addExercise(page, 'Bench Press (Barbell)')
  const block = page.locator('.ex-block').first()
  const weight = block.getByLabel('Target weight').first()
  const reps = block.getByLabel('Target reps').first()

  await weight.fill('99999')
  await expect(block.getByText('Max 1000 kg')).toBeVisible()
  await weight.blur()
  await expect(weight).toHaveValue('')
  // The hint goes away with the rejected text.
  await expect(block.getByText('Max 1000 kg')).toBeHidden()

  await reps.fill('1000')
  await expect(block.getByText('Max 999 reps')).toBeVisible()
  await reps.blur()
  await expect(reps).toHaveValue('')

  await weight.fill('100')
  await expect(block.getByText('Max 1000 kg')).toBeHidden()
  await weight.blur()
  await expect(weight).toHaveValue('100')
})

test('a rejected routine target keeps the last good value, and distance has a limit', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Build a routine first' }).click()
  await page.locator('#routine-name').fill('Limits 2')
  await addExercise(page, 'Bench Press (Barbell)')
  const weight = page.locator('.ex-block').first().getByLabel('Target weight').first()
  await weight.fill('100')
  await weight.fill('99999')
  await weight.blur()
  await expect(weight).toHaveValue('100')

  await addExercise(page, 'Running (Treadmill)')
  const run = page.locator('.ex-block').nth(1)
  const distance = run.getByLabel('Target distance').first()
  await distance.fill('1001')
  await expect(run.getByText('Max 1000 km')).toBeVisible()
  await distance.blur()
  await expect(distance).toHaveValue('')
  await distance.fill('5')
  await distance.blur()
  await expect(distance).toHaveValue('5')
})
