import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect, seed, openTab, logSet, readStore, dismissInstallNudgeIfShown } from './helpers/fixtures'

const ANALYTICS_URL = 'https://us.i.posthog.com/**'
const FEEDBACK_URL = 'https://api.web3forms.com/submit'

/** Origins the production Content-Security-Policy lets the page connect to, read from the built page. */
async function cspConnectOrigins(page: Page): Promise<string[]> {
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  const connect = policy?.split(';').find((d) => d.trim().startsWith('connect-src'))
  expect(connect, 'the built page carries a connect-src directive').toBeTruthy()
  return connect!
    .trim()
    .split(/\s+/)
    .slice(1)
    .filter((s) => s.startsWith('https://'))
    .map((s) => new URL(s).origin)
}

test('a typical session only talks to allowed origins, and analytics carry no workout content', async ({
  page,
  context,
  baseURL,
}) => {
  const sameOrigin = new URL(baseURL!).origin
  const requests: { url: string; origin: string; body: string | null }[] = []
  context.on('request', (req) => {
    if (!/^https?:/.test(req.url())) return
    requests.push({ url: req.url(), origin: new URL(req.url()).origin, body: req.postData() })
  })
  // Nothing real leaves the test; the requests are still recorded above.
  await page.route(ANALYTICS_URL, (route) => route.fulfill({ status: 200, json: { status: 1 } }))
  await page.route(FEEDBACK_URL, (route) => route.fulfill({ status: 200, json: { success: true } }))

  // First launch with a history, then say yes to analytics so any sending path is live.
  await seed(page)
  // On iOS (the WebKit project) the install nudge comes first; get past it.
  const consent = page.getByRole('region', { name: 'Usage data' })
  await dismissInstallNudgeIfShown(page, consent)
  await consent.getByRole('button', { name: 'Share' }).click()

  // The allowed origins are the CSP's, and PRIVACY.md names the same two services.
  const allowed = new Set([sameOrigin, ...(await cspConnectOrigins(page))])
  expect([...allowed].sort()).toEqual([sameOrigin, 'https://api.web3forms.com', 'https://us.i.posthog.com'].sort())
  const privacy = fs.readFileSync(path.join(process.cwd(), 'PRIVACY.md'), 'utf8')
  expect(privacy).toContain('posthog.com')
  expect(privacy).toContain('web3forms.com')

  // Log a workout with a note.
  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder('Search exercises').fill('Bench Press (Barbell)')
  await picker.locator('.picker-item').first().click()
  await picker.getByRole('button', { name: 'Add 1 exercise' }).click()
  await logSet(page, 0, '61.5', '7')
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Finish workout?' })
    .getByRole('button', { name: 'Finish', exact: true })
    .click()
  await page.getByRole('dialog', { name: 'Workout complete' }).getByRole('button', { name: 'Skip' }).click()
  await expect(page).toHaveURL(/\/history\/[^/]+$/)

  await openTab(page, 'History')
  await openTab(page, 'Stats')
  await page.goto('/settings')

  // Backup export.
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup (.json)' }).click()
  await download

  // Feedback, the one place a request to Web3Forms is expected.
  await page.goto('/feedback')
  await page.getByLabel('What happened?').fill('The rest timer froze')
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('status')).toContainText('Thanks')

  const unexpected = requests.filter((r) => !allowed.has(r.origin)).map((r) => r.url)
  expect(unexpected, 'requests to origins outside the CSP').toEqual([])

  const feedbackSent = requests.filter((r) => r.origin === 'https://api.web3forms.com')
  expect(feedbackSent.length, 'Web3Forms is contacted only for the feedback send').toBe(1)

  // Analytics bodies must hold none of what the user logged or named.
  const exercises = (await readStore(page, 'exercises')).map((e) => String(e.name))
  const routines = (await readStore(page, 'routines')).map((r) => String(r.name))
  const forbidden = [...exercises, ...routines].filter((s) => s.length > 2)
  expect(forbidden.length).toBeGreaterThan(0)
  const analytics = requests.filter((r) => r.origin === 'https://us.i.posthog.com')
  if (analytics.length === 0) {
    // The e2e build has no VITE_POSTHOG_KEY, so PostHog never starts and there is nothing to inspect.
    // Say so in the report rather than passing silently; a keyed build would make this live.
    test.info().annotations.push({
      type: 'analytics-payload-check-not-live',
      description: 'No analytics requests were made (no VITE_POSTHOG_KEY in this build), so no payload was checked.',
    })
  }
  for (const r of analytics) {
    // Bodies may be compressed or percent-encoded; check the raw text and, when it decodes, the decoded text.
    const raw = r.body ?? ''
    let decoded = raw
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      // keep the raw text
    }
    for (const body of [raw, decoded]) {
      for (const term of forbidden) expect(body, `analytics body mentions "${term}"`).not.toContain(term)
      expect(body).not.toContain('61.5')
    }
  }
})
