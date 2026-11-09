import { test, expect, waitForApp, logSet, readStore } from './helpers/fixtures'
import type { Page } from '@playwright/test'

const DAYS_DIALOG = 'Which days do you usually train?'

async function logAndFinish(page: Page) {
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()
  await logSet(page, 0, '60', '5')
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Finish workout?' })
    .getByRole('button', { name: 'Finish', exact: true })
    .click()
  await page.getByRole('dialog', { name: 'Workout complete' }).getByRole('button', { name: 'Skip' }).click()
}

const settingsRow = async (page: Page) => (await readStore(page, 'settings'))[0]
const goalValue = (page: Page) => page.locator('.row-between', { hasText: 'Weekly goal' }).locator('.mono')

test('the first finish asks for training days once, and Settings shows the answer', async ({ page }) => {
  await logAndFinish(page)

  const step = page.getByRole('dialog', { name: DAYS_DIALOG })
  await expect(step).toBeVisible()
  await expect(step).toContainText('You can change this in Settings')
  // Week starts on Monday by default.
  await expect(step.getByRole('group', { name: 'Training days' }).getByRole('button')).toHaveText([
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ])
  await expect(step.getByRole('button', { name: 'Save' })).toBeDisabled()
  for (const day of ['Monday', 'Wednesday', 'Friday']) await step.getByRole('button', { name: day }).click()
  await expect(step.getByRole('button', { name: 'Wednesday' })).toHaveAttribute('aria-pressed', 'true')
  await expect(step.getByRole('button', { name: 'Tuesday' })).toHaveAttribute('aria-pressed', 'false')
  await step.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/history\/[^/]+$/)

  expect(await settingsRow(page)).toMatchObject({ trainingDays: [1, 3, 5], weeklyGoalWorkouts: 3 })
  expect((await readStore(page, 'workouts')).filter((w) => w.status === 'done')).toHaveLength(1)

  await page.goto('/settings')
  await waitForApp(page)
  await expect(page.locator('button.row-between', { hasText: 'Training days' })).toContainText('Mon, Wed, Fri')
  await expect(goalValue(page)).toHaveText('3')

  // A second finish goes straight to the saved workout.
  await logAndFinish(page)
  await expect(page).toHaveURL(/\/history\/[^/]+$/)
  await expect(page.getByRole('dialog', { name: DAYS_DIALOG })).toHaveCount(0)
})

test('Skip changes nothing and is remembered across a reload', async ({ page }) => {
  await logAndFinish(page)
  await page.getByRole('dialog', { name: DAYS_DIALOG }).getByRole('button', { name: 'Skip' }).click()
  await expect(page).toHaveURL(/\/history\/[^/]+$/)
  expect(await settingsRow(page)).toMatchObject({ trainingDays: [], weeklyGoalWorkouts: 3 })

  // Remove the finished session so the next finish is "first" again by count:
  // only the remembered skip can keep the question away now.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('trana')
        open.onsuccess = () => {
          const tx = open.result.transaction('workouts', 'readwrite')
          tx.objectStore('workouts').clear()
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
  await page.reload()
  await waitForApp(page)
  expect(await page.evaluate(() => localStorage.getItem('trana.trainingDaysAsked'))).toBe('1')

  await logAndFinish(page)
  await expect(page).toHaveURL(/\/history\/[^/]+$/)
  await expect(page.getByRole('dialog', { name: DAYS_DIALOG })).toHaveCount(0)
})

test('changing days in Settings moves a goal that followed them, not one set separately', async ({ page }) => {
  await logAndFinish(page)
  const step = page.getByRole('dialog', { name: DAYS_DIALOG })
  for (const day of ['Monday', 'Wednesday', 'Friday']) await step.getByRole('button', { name: day }).click()
  await step.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/history\/[^/]+$/)

  await page.goto('/settings')
  await waitForApp(page)
  const row = page.locator('button.row-between', { hasText: 'Training days' })

  // Goal 3 came from three days, so adding a fourth day offers 4 and keeps it on.
  await row.click()
  let sheet = page.getByRole('dialog', { name: 'Training days' })
  await sheet.getByRole('button', { name: 'Saturday' }).click()
  await expect(sheet.getByRole('switch', { name: 'Set weekly goal to 4' })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(row).toContainText('Mon, Wed, Fri, Sat')
  await expect(goalValue(page)).toHaveText('4')

  // A goal moved with the stepper is left alone by default.
  await page.getByRole('button', { name: 'Increase weekly goal' }).click()
  await expect(goalValue(page)).toHaveText('5')
  await row.click()
  sheet = page.getByRole('dialog', { name: 'Training days' })
  await sheet.getByRole('button', { name: 'Saturday' }).click()
  await expect(sheet.getByRole('switch', { name: 'Set weekly goal to 3' })).toHaveAttribute('aria-checked', 'false')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(row).toContainText('Mon, Wed, Fri')
  await expect(goalValue(page)).toHaveText('5')
  expect(await settingsRow(page)).toMatchObject({ trainingDays: [1, 3, 5], weeklyGoalWorkouts: 5 })
})
