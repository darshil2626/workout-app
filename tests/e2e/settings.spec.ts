import { readFileSync } from 'node:fs'
import { test, expect, seed, importBackup, readStore, waitForApp, logSet, waitForWorkoutSaved, SYNTHETIC } from './helpers/fixtures'
import type { Page } from '@playwright/test'

const unitButton = (page: Page, u: 'kg' | 'lb') =>
  page.locator('.field', { has: page.locator('.field-label', { hasText: /^Weight$/ }) }).locator('.segmented button', { hasText: u })

const settingRow = (page: Page, label: string) => page.locator('button.row-between', { hasText: label })

async function statsVolume(page: Page) {
  await page.goto('/stats')
  const tile = page.getByRole('button', { name: /Volume lifted/ })
  await expect(tile).toBeVisible()
  return (await tile.innerText()).replace(/\s+/g, ' ')
}

test('switching kg and lb changes displayed weights and round-trips losslessly', async ({ page }) => {
  await seed(page)
  const before = await statsVolume(page)
  expect(before).toMatch(/kg/)

  await page.goto('/settings')
  await expect(settingRow(page, 'Barbell weight')).toContainText('20 kg')
  await expect(settingRow(page, 'Barbell weight')).toContainText(/^(?!.*lb)/s)

  await unitButton(page, 'lb').click()
  await expect(unitButton(page, 'lb')).toHaveClass(/active/)
  await expect(settingRow(page, 'Barbell weight')).toContainText('44.09 lb')

  const asLb = await statsVolume(page)
  expect(asLb).toMatch(/lb/)
  expect(asLb).not.toBe(before)
  const num = (s: string) => {
    const m = /([\d,.]+)\s*([kM])?/.exec(s)!
    return Number(m[1].replace(/,/g, '')) * (m[2] === 'k' ? 1e3 : m[2] === 'M' ? 1e6 : 1)
  }
  const kgVal = num(before)
  const lbVal = num(asLb)
  expect(lbVal / kgVal).toBeGreaterThan(2.1)
  expect(lbVal / kgVal).toBeLessThan(2.3)

  await page.goto('/settings')
  await unitButton(page, 'kg').click()
  await expect(settingRow(page, 'Barbell weight')).toContainText('20 kg')
  expect(await statsVolume(page)).toBe(before)

  // Switching units never rewrote stored data: bar weight is still exactly 20 kg.
  const settings = await readStore(page, 'settings')
  expect(settings[0].barWeightKg).toBe(20)
  expect(settings[0].weightUnit).toBe('kg')
})

test('a weight typed in lb is stored in kg and shown back consistently', async ({ page }) => {
  await page.goto('/settings')
  await unitButton(page, 'lb').click()
  await expect(unitButton(page, 'lb')).toHaveClass(/active/)
  await page.goto('/')
  await waitForApp(page)
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()
  await expect(page.locator('.set-table thead')).toContainText('lb')
  await logSet(page, 0, '135', '5', false)
  await waitForWorkoutSaved(page, (w) => Math.abs((w.exercises[0]?.sets[0]?.weight ?? 0) - 135 / 2.20462262185) < 1e-2)

  // Flip units mid-workout via Settings; the same stored weight reads 61.24 kg.
  await page.getByRole('button', { name: 'Minimise workout' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await unitButton(page, 'kg').click()
  await page.locator('.active-banner').getByRole('button').click()
  await expect(page.locator('.set-table thead')).toContainText('kg')
  await expect(page.locator('.set-table tbody tr').first().getByLabel('Weight', { exact: true })).toHaveValue('61.24')

  await page.getByRole('button', { name: 'Minimise workout' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await unitButton(page, 'lb').click()
  await page.locator('.active-banner').getByRole('button').click()
  await expect(page.locator('.set-table tbody tr').first().getByLabel('Weight', { exact: true })).toHaveValue('135')
})

test('export downloads a valid backup; wipe then re-import restores it', async ({ page }) => {
  await seed(page)
  const original = {
    workouts: (await readStore(page, 'workouts')).length,
    routines: (await readStore(page, 'routines')).length,
    exercises: (await readStore(page, 'exercises')).length,
  }
  expect(original.workouts).toBe(JSON.parse(readFileSync(SYNTHETIC, 'utf8')).workouts.length)

  await page.goto('/settings')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup (.json)' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^trana-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const path = await download.path()
  const text = readFileSync(path, 'utf8')
  const backup = JSON.parse(text)
  expect(backup.app).toBe('trana')
  expect(backup.version).toBeGreaterThanOrEqual(2)
  expect(backup.workouts).toHaveLength(original.workouts)
  expect(backup.routines).toHaveLength(original.routines)

  // Wipe.
  await page.getByRole('button', { name: /Delete all data|Wipe|Erase/i }).first().click()
  await page.getByRole('dialog', { name: 'Delete all data?' }).getByRole('button', { name: 'Delete everything' }).click()
  await expect.poll(async () => (await readStore(page, 'workouts')).length).toBe(0)
  await expect.poll(async () => (await readStore(page, 'routines')).length).toBe(0)

  // Re-import the file the app just produced.
  await importBackup(page, { name: 'restore.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await expect.poll(async () => (await readStore(page, 'workouts')).length).toBe(original.workouts)
  expect((await readStore(page, 'routines')).length).toBe(original.routines)
  expect((await readStore(page, 'exercises')).length).toBe(original.exercises)

  await page.goto('/history')
  await expect(page.locator('.history-ex-list').first()).toBeVisible()
})

test('importing a non-backup file is refused without touching data', async ({ page }) => {
  await seed(page)
  const before = (await readStore(page, 'workouts')).length
  await page.goto('/settings')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'junk.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.page')).toContainText(/missing|not valid|Unrecognized|newer version/i)
  expect((await readStore(page, 'workouts')).length).toBe(before)
})
