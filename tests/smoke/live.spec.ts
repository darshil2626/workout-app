import { test, expect, waitForApp, logSet, waitForWorkoutSaved } from '../e2e/helpers/fixtures'

// Runs against the deployed site, not a local build, after every deploy:
//   SMOKE_URL=https://usetrana.com npm run test:smoke
// It answers one question a green CI cannot: can a stranger arriving at the real
// address open the app, use it, and still have their workout after a reload?
//
// Optional:
//   EXPECT_SHA=<commit>      wait until the site is serving that commit (CDN propagation)
//   SMOKE_LEGACY_URL=<url>   an old address that must send people to the new one
//
// Each browser test starts from an empty profile, so nothing here touches anyone's
// data. Analytics are opt-in and off for a fresh profile, so nothing is recorded.

const SITE = new URL(process.env.SMOKE_URL ?? 'https://usetrana.com').origin
const EXPECT_SHA = process.env.EXPECT_SHA?.slice(0, 7)
const LEGACY_URL = process.env.SMOKE_LEGACY_URL

test.describe('the deployed site', () => {
  test('serves the shell, the manifest, the service worker and the icons from the root', async ({ request }) => {
    const index = await request.get(`${SITE}/`)
    expect(index.status()).toBe(200)
    expect(index.headers()['content-type']).toContain('text/html')
    expect(await index.text()).toContain('<title>Trana</title>')

    const manifestRes = await request.get(`${SITE}/manifest.webmanifest`)
    expect(manifestRes.status()).toBe(200)
    const manifest = await manifestRes.json()
    // A wrong base path at build time shows up here before it shows up as a blank page.
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')

    const sw = await request.get(`${SITE}/sw.js`)
    expect(sw.status()).toBe(200)
    expect(sw.headers()['content-type']).toMatch(/javascript/)

    for (const icon of manifest.icons as { src: string }[]) {
      const res = await request.get(new URL(icon.src, `${SITE}/`).href)
      expect(res.status(), icon.src).toBe(200)
      expect(res.headers()['content-type'], icon.src).toContain('image/png')
    }
    expect((await request.get(`${SITE}/apple-touch-icon.png`)).status()).toBe(200)
  })

  test('sends plain http to https', async ({ request }) => {
    test.skip(!SITE.startsWith('https://'), 'only meaningful for an https site')
    const res = await request.get(SITE.replace('https://', 'http://') + '/', { maxRedirects: 0 })
    expect([301, 302, 308]).toContain(res.status())
    expect(res.headers()['location']).toBe(`${SITE}/`)
  })

  test('the old address sends people to the new one', async ({ request }) => {
    test.skip(!LEGACY_URL, 'SMOKE_LEGACY_URL not set')
    const res = await request.get(LEGACY_URL!, { maxRedirects: 0 })
    expect([301, 302, 308]).toContain(res.status())
    expect(res.headers()['location']).toContain(SITE)
  })

  test('is serving the commit that was just deployed', async ({ request }) => {
    test.skip(!EXPECT_SHA, 'EXPECT_SHA not set')
    test.setTimeout(5 * 60_000)
    // The build id is inlined into a bundle, so look through the files the worker precaches.
    await expect
      .poll(
        async () => {
          const sw = await (await request.get(`${SITE}/sw.js?${Date.now()}`)).text()
          const files = [...new Set(sw.match(/assets\/[\w.-]+\.js/g) ?? [])]
          for (const file of files) {
            const body = await (await request.get(`${SITE}/${file}`)).text()
            if (body.includes(` · ${EXPECT_SHA}`)) return true
          }
          return false
        },
        { message: `site is serving ${EXPECT_SHA}`, intervals: [5_000, 10_000], timeout: 4 * 60_000 },
      )
      .toBe(true)
  })
})

test.describe('a first visit from a stranger', () => {
  test('installs its worker, logs a workout, and keeps it across a reload and without a network', async ({
    page,
    context,
  }) => {
    await page.goto(`${SITE}/`)
    await waitForApp(page)

    // Not a blank page, and a starter routine to tap into.
    await expect(page.getByRole('button', { name: 'Start Full Body Starter' })).toBeVisible()

    // The worker is what makes it work offline; it must install and take control.
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await waitForApp(page)
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

    // A real workout, set by set.
    await page.getByRole('button', { name: 'Empty workout' }).click()
    await expect(page).toHaveURL(/\/workout$/)
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const picker = page.getByRole('dialog')
    await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
    await picker.locator('.picker-item').first().click()
    await picker.getByRole('button', { name: 'Add 1 exercise' }).click()
    await logSet(page, 0, '60', '5')
    await expect(page.locator('.set-table tbody tr').nth(0)).toHaveClass(/done/)

    // Autosave is debounced; wait for it as the e2e suite does, then pull the plug.
    await waitForWorkoutSaved(page, (w) => w.exercises[0]?.sets[0]?.completed === true)

    // Still there after a reload, and after the network goes away.
    await page.reload()
    await expect(page.locator('.ex-block .ex-name')).toContainText('Bench Press')
    await expect(page.locator('.set-table tbody tr').nth(0)).toHaveClass(/done/)

    await context.setOffline(true)
    await page.reload()
    await waitForApp(page)
    await expect(page.locator('.ex-block .ex-name')).toContainText('Bench Press')
    await context.setOffline(false)

    // Finish it and find it in History.
    await page.getByRole('button', { name: 'Finish', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Finish workout?' })
      .getByRole('button', { name: 'Finish', exact: true })
      .click()
    await page.getByRole('dialog', { name: 'Workout complete' }).getByRole('button', { name: 'Skip' }).click()
    // The app opens the saved workout once the finish is written; loading another page
    // before then cuts the write off and leaves the session active.
    await expect(page).toHaveURL(/\/history\/[^/]+$/)
    await page.goto(`${SITE}/history`)
    await expect(page.locator('.history-ex-list').first()).toContainText('Bench Press (Barbell)')
  })

  test('a deep link opens the app rather than a GitHub error page', async ({ page }) => {
    // A shared /history link, or a refresh before the worker exists, has no file to hit.
    await page.goto(`${SITE}/history`)
    await waitForApp(page)
    await expect(page.locator('.header-title')).toHaveText('History')
  })

  test('exports a backup that is a valid Trana backup', async ({ page }) => {
    // Through the UI: a deep link on a first visit has no worker to answer it yet.
    await page.goto(`${SITE}/`)
    await waitForApp(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.locator('.header-title')).toHaveText('Settings')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /export backup/i }).click()
    const file = await download
    const stream = await file.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    expect(backup.app).toBe('trana')
    expect(Array.isArray(backup.workouts)).toBe(true)
    expect(backup.exercises.length).toBeGreaterThan(100)
  })
})
