import { test as base, expect, type Page } from '@playwright/test'
import path from 'node:path'

export const ROOT = process.cwd()
export const SYNTHETIC = path.join(ROOT, 'src/dev/synthetic-dataset.json')
export const QA_DATASET = path.join(ROOT, 'qa/qa-dataset.json')

/** Anchor the QA fixture's relative labels ("3d ago") are computed against. */
export const QA_ANCHOR = '2026-10-08T23:42:13.672Z'

/**
 * Every test fails on an uncaught page error or console.error. 404s for
 * optional assets (and the matching "Failed to load resource" noise) are ignored.
 */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() !== 'error') return
        const t = m.text()
        if (/404|Failed to load resource/i.test(t)) return
        errors.push(`console.error: ${t}`)
      })
      await use(errors)
      expect(errors, 'uncaught page errors / console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Waits until the app shell has mounted (bottom nav or a fullscreen header). */
export async function waitForApp(page: Page) {
  await expect(page.locator('.app')).toBeVisible()
  await expect(page.locator('.skeleton, .spinner')).toHaveCount(0)
}

/**
 * Loads a backup-format file through the real Settings > Import UI (the dev-only
 * ?qa=1 seeding is stripped from production builds). Leaves the app on /settings.
 */
export async function importBackup(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto('/settings')
  await page.locator('input[type="file"]').setInputFiles(file)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

/** Imports the dataset, then lands on the home screen with a fresh page load. */
export async function seed(page: Page, file: string = SYNTHETIC) {
  await importBackup(page, file)
  await page.goto('/')
  await waitForApp(page)
}

export async function openTab(page: Page, name: 'Home' | 'History' | 'Stats') {
  await page.locator('.bottom-nav').getByRole('link', { name }).click()
}

/** Asserts the page does not scroll sideways. */
export async function expectNoHorizontalOverflow(page: Page) {
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }))
  expect(o.sw, `scrollWidth ${o.sw} vs clientWidth ${o.cw}`).toBeLessThanOrEqual(o.cw)
}

/** Fills the Nth set row of the active workout and ticks it. */
export async function logSet(page: Page, row: number, weight: string, reps: string, tick = true) {
  const tr = page.locator('.set-table tbody tr').nth(row)
  await tr.getByLabel('Weight', { exact: true }).fill(weight)
  await tr.getByLabel('Reps', { exact: true }).fill(reps)
  // inputs commit on blur
  await tr.getByLabel('Reps', { exact: true }).blur()
  if (tick) await tr.locator('.check-btn').click()
}

/** Reads every row of an IndexedDB object store of the app's Dexie database. */
export async function readStore<T = any>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<any[]>((resolve, reject) => {
        const open = indexedDB.open('trana')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const req = db.transaction(name).objectStore(name).getAll()
          req.onsuccess = () => {
            db.close()
            resolve(req.result)
          }
          req.onerror = () => reject(req.error)
        }
      }),
    store,
  )
}

/** Waits until autosave (debounced) has written the active workout with this weight. */
export async function waitForWorkoutSaved(page: Page, predicate: (w: any) => boolean) {
  await expect
    .poll(async () => (await readStore(page, 'workouts')).some((w) => w.status === 'active' && predicate(w)), {
      message: 'active workout autosaved to IndexedDB',
    })
    .toBe(true)
}
