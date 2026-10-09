import { test, expect, seed, waitForApp, readStore } from './helpers/fixtures'

const card = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Usage data' })

test('a new install is asked, and the answer sticks', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await expect(card(page)).toContainText('Nothing is sent unless you say yes')
  await expect(card(page).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', /PRIVACY\.md/)

  await card(page).getByRole('button', { name: 'No thanks' }).click()
  await expect(card(page)).toHaveCount(0)
  await page.reload()
  await waitForApp(page)
  await expect(card(page)).toHaveCount(0)

  const [settings] = await readStore(page, 'settings')
  expect(settings.analyticsEnabled).toBe(false)
  expect(typeof settings.analyticsConsentAt).toBe('number')
})

test('saying yes records it and shows the switch on in Settings', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await card(page).getByRole('button', { name: 'Share' }).click()
  await page.goto('/settings')
  await expect(page.getByRole('switch', { name: 'Share anonymous usage data' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('switch', { name: 'Share anonymous usage data' }).click()
  await expect(page.getByRole('switch', { name: 'Share anonymous usage data' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
})

test('an install that had analytics on by default is asked again, not assumed', async ({ page }) => {
  await seed(page)
  // The old default: enabled, but no answer ever recorded.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('trana')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('settings', 'readwrite')
          const store = tx.objectStore('settings')
          const get = store.get(1)
          get.onsuccess = () => {
            store.put({ ...get.result, analyticsEnabled: true, analyticsConsentAt: null })
          }
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
        }
      }),
  )
  await page.goto('/')
  await waitForApp(page)
  await expect(card(page)).toBeVisible()
})
