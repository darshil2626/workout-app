import { test, expect } from './helpers/fixtures'

test.describe('failure handling', () => {
  test('shows a recovery screen, not a broken app, when the database cannot open', async ({ page, errors }) => {
    await page.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException('blocked for test', 'SecurityError')
      }
    })
    await page.goto('/')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(/can.t open your data/i)
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Save a backup' })).toBeVisible()

    // Erasing needs a second confirmation.
    await expect(alert.getByRole('button', { name: /yes, erase/i })).toHaveCount(0)
    await alert.getByRole('button', { name: 'Erase and start over' }).click()
    await expect(alert.getByRole('button', { name: /yes, erase/i })).toBeVisible()

    // The failure was logged on purpose; this test expects it.
    errors.length = 0
  })

  test('tells the person when a write fails because the device is full', async ({ page, errors }) => {
    await page.goto('/')
    await expect(page.locator('.app')).toBeVisible()
    await page.evaluate(() => {
      Promise.reject(new DOMException('full', 'QuotaExceededError'))
    })
    await expect(page.getByRole('status').filter({ hasText: /out of storage/i })).toBeVisible()
    errors.length = 0
  })
})
