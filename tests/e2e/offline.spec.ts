import { test, expect, waitForApp, openTab } from './helpers/fixtures'

test('app shell and visited routes work offline after the service worker is ready', async ({ page, context }) => {
  await page.goto('/')
  await waitForApp(page)

  // Wait for the worker to be active (precache complete).
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    if (!reg.active) throw new Error('no active service worker')
  })

  // Visit a second route online so its chunk is exercised.
  await openTab(page, 'History')
  await expect(page).toHaveURL(/\/history$/)
  await expect(page.locator('.header-title')).toHaveText('History')

  await context.setOffline(true)

  // Reload on the previously visited route.
  await page.reload()
  await waitForApp(page)
  await expect(page.locator('.header-title')).toHaveText('History')

  // In-app navigation to other tabs still works (lazy chunks come from the precache).
  await openTab(page, 'Stats')
  await expect(page.locator('.header-title')).toHaveText('Stats')
  await openTab(page, 'Home')
  await expect(page.getByRole('button', { name: 'Empty workout' })).toBeVisible()

  // A hard navigation to a route never visited in this session also renders.
  await page.goto('/settings')
  await expect(page.locator('.header-title')).toHaveText('Settings')

  // And data still writes offline: a workout can be started and survives a reload.
  await page.goto('/')
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await page.reload()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByLabel('Workout name')).toBeVisible()

  await context.setOffline(false)
})
