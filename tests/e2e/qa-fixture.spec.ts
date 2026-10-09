import { readFileSync } from 'node:fs'
import { test, expect, seed, waitForApp, logSet, QA_DATASET, QA_ANCHOR } from './helpers/fixtures'
import type { Page } from '@playwright/test'

// The fixture's relative labels ("3d ago") are computed
// against QA_ANCHOR, so the browser clock is pinned to it before anything loads.
const expected = JSON.parse(readFileSync('qa/qa-expected.json', 'utf8'))

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(QA_ANCHOR))
  await seed(page, QA_DATASET)
})

const routineCard = (page: Page, name: string) =>
  page.locator('.swipe-row .card', { has: page.locator('.truncate', { hasText: name.slice(0, 20) }) })

test.describe('Home routine "last done" labels', () => {
  for (const [name, exp] of Object.entries<{ lastDone: string | null; why: string }>(expected.routineLabels)) {
    test(`${name}: ${exp.lastDone ?? 'no label'}`, async ({ page }) => {
      const card = routineCard(page, name)
      await expect(card).toHaveCount(1)
      // The label is the faint text beside the routine name; absent when never done.
      const label = card.locator('.row-between .faint')
      if (exp.lastDone === null) await expect(label).toHaveCount(0)
      else await expect(label).toHaveText(exp.lastDone)
    })
  }
})

test.describe('History cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/history')
    await waitForApp(page)
  })
  const card = (page: Page, name: string) =>
    page.locator('button.card-tappable', { has: page.locator('.truncate', { hasText: new RegExp(`^${name}$`) }) })

  // The fixture's "History eight exercises" session has 8 exercises; cards cap at 3.
  const CAP = 3

  test('eight exercises: capped list with a +N more line', async ({ page }) => {
    const c = card(page, 'History eight exercises')
    await expect(c.locator('.history-ex-list > li:not(.history-ex-more)')).toHaveCount(CAP)
    await expect(c.locator('.history-ex-more')).toHaveText(`+${8 - CAP} more`)
    const first = c.locator('.history-ex-list > li').first()
    await expect(first.locator('span').nth(0)).toHaveText(expected.historyCards['History eight exercises'].firstRow[0])
    await expect(first.locator('span').nth(1)).toHaveText(expected.historyCards['History eight exercises'].firstRow[1])
  })

  test('one set: singular label and no more line', async ({ page }) => {
    const c = card(page, 'History one set')
    await expect(c.locator('.history-ex-list > li')).toHaveCount(1)
    await expect(c.locator('.history-ex-more')).toHaveCount(0)
    const [name, sets] = expected.historyCards['History one set'].firstRow
    await expect(c.locator('.history-ex-list li span').nth(0)).toHaveText(name)
    await expect(c.locator('.history-ex-list li span').nth(1)).toHaveText(sets)
  })

  test('empty session says nothing was logged', async ({ page }) => {
    await expect(card(page, 'History empty').locator('.card-exercises')).toHaveText(expected.historyCards['History empty'].text)
  })
})

test.describe('exercise metric chips', () => {
  for (const [id, chips] of Object.entries<string[]>(expected.exerciseMetricChips)) {
    test(id, async ({ page }) => {
      await page.goto(`/exercises/${id}`)
      await expect(page.locator('.chart-controls .chip').first()).toBeVisible()
      await expect(page.locator('.chart-controls .chip')).toHaveText(chips)
    })
  }

  test('every bench chip draws a chart', async ({ page }) => {
    await page.goto('/exercises/bench-press-barbell')
    const chips = page.locator('.chart-controls .chip')
    await expect(chips.first()).toBeVisible()
    const n = await chips.count()
    expect(n).toBe(expected.exerciseMetricChips['bench-press-barbell'].length)
    for (let i = 0; i < n; i++) {
      await chips.nth(i).click()
      await expect(chips.nth(i)).toHaveClass(/active/)
      await expect(page.locator('.chart-card svg path, .chart-card svg rect').first()).toBeVisible()
    }
  })

  test('bench volume excludes warm-up sets', async ({ page }) => {
    await page.goto('/exercises/bench-press-barbell')
    await page.locator('.chart-controls .chip', { hasText: 'Volume' }).click()
    await page.locator('.chart-card button', { hasText: /table/i }).first().click()
    const table = page.locator('.chart-card table').first()
    await expect(table).toContainText(/1[, ]?050\b/)
    await expect(table).not.toContainText(/1[, ]?250\b/)
  })
})

test('stats: headline 3 and four small tiles in 2 rows', async ({ page }) => {
  await page.goto('/stats')
  await expect(page.locator('.headline .stat-label')).toHaveText(['Volume lifted', 'Sets', 'Reps'])
  await expect(page.locator('.stat-grid-pairs .stat-label')).toHaveText(['Time lifting', 'Training age', 'Week streak', 'Best streak'])
  const tops = await page.locator('.stat-grid-pairs').first().evaluate((g) =>
    [...g.children].map((c) => Math.round(c.getBoundingClientRect().top)),
  )
  expect(tops).toHaveLength(4)
  expect(new Set(tops).size).toBe(2)
})

test('PR set turns gold while an ordinary completed set stays green', async ({ page }) => {
  await routineCard(page, 'R1 Stale').getByRole('button', { name: 'Start routine' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  const rows = page.locator('.set-table tbody tr')
  // Baseline heaviest bench is 100 kg x 5: 102.5 beats it, 90 does not.
  await logSet(page, 0, '102.5', '5')
  await logSet(page, 1, '90', '5')
  await expect(rows.nth(0)).toHaveClass(/\bpr\b/)
  await expect(rows.nth(1)).toHaveClass(/\bdone\b/)
  await expect(rows.nth(1)).not.toHaveClass(/\bpr\b/)
  await expect(page.locator('.badge-pr')).toHaveCount(0)
})

test('Home header icons share a centre line with the title', async ({ page }) => {
  const centre = (loc: ReturnType<Page['locator']>) =>
    loc.evaluate((e) => {
      const r = e.getBoundingClientRect()
      return r.top + r.height / 2
    })
  const a = await centre(page.locator('.header .icon-btn').nth(0))
  const b = await centre(page.locator('.header .icon-btn').nth(1))
  const t = await centre(page.locator('.home-status'))
  expect(Math.abs(a - b)).toBeLessThan(0.5)
  expect(Math.abs(t - a)).toBeLessThanOrEqual(1.5)
})

test('the last routine button clears the active-workout banner', async ({ page }) => {
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByRole('button', { name: 'Minimise workout' }).click()
  await expect(page.locator('.active-banner')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const banner = document.querySelector('.active-banner')!.getBoundingClientRect().top
        const last = Math.max(...[...document.querySelectorAll('.page .btn')].map((e) => e.getBoundingClientRect().bottom))
        return last <= banner
      }),
    )
    .toBe(true)
})
