import AxeBuilder from '@axe-core/playwright'
import { test, expect, seed, waitForApp } from './helpers/fixtures'

const ROUTES = ['/', '/history', '/stats', '/exercises', '/exercises/bench-press-barbell', '/measurements', '/settings']

test.describe('accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page)
  })

  for (const path of ROUTES) {
    test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(path)
      await waitForApp(page)
      // Entry animations fade text in from transparent; measuring mid-fade reports contrast
      // that no one ever sees.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))))
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      const summary = results.violations.map(
        (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' | ')}`,
      )
      expect(summary).toEqual([])
    })
  }

  test('pinch-zoom is not disabled', async ({ page }) => {
    await page.goto('/')
    const content = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)/i)
    expect(content).not.toMatch(/maximum-scale/i)
  })
})
