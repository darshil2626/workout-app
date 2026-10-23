import { test, expect } from './helpers/fixtures'
import type { Page } from '@playwright/test'

const URL = 'https://api.web3forms.com/submit'

async function fill(page: Page) {
  await page.goto('/feedback')
  await page.getByLabel('What happened?').fill('The rest timer froze')
}

test('/feedback loads on a direct visit with every field and a clear privacy note', async ({ page }) => {
  await page.goto('/feedback')
  await expect(page.getByLabel('What happened?')).toBeVisible()
  await expect(page.getByLabel(/What did you expect/)).toBeVisible()
  await expect(page.getByLabel(/Your email/)).toBeVisible()
  await expect(page.getByRole('group', { name: /How is Trana/ }).getByRole('button')).toHaveCount(5)
  await expect(page.getByLabel(/Include app version and device info/)).toBeChecked()
  await expect(page.getByText(/Never your workouts, routines or measurements/)).toBeVisible()
  await expect(page.getByText(/Web3Forms keeps submissions for up to 3 years/)).toBeVisible()
})

test('a message is required, and a bad email is refused before anything is sent', async ({ page }) => {
  let sent = 0
  await page.route(URL, (route) => {
    sent++
    return route.fulfill({ status: 200, json: { success: true } })
  })
  await page.goto('/feedback')
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('alert')).toContainText('what happened')
  await page.getByLabel('What happened?').fill('x')
  await page.getByLabel(/Your email/).fill('nope')
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('alert')).toContainText('email')
  expect(sent).toBe(0)
})

test('sends the form and device info, never workout data, then thanks', async ({ page }) => {
  let body: Record<string, unknown> = {}
  await page.route(URL, (route) => {
    body = route.request().postDataJSON()
    return route.fulfill({ status: 200, json: { success: true } })
  })
  await fill(page)
  await page
    .getByRole('group', { name: /How is Trana/ })
    .getByRole('button', { name: '4' })
    .click()
  await page.getByLabel(/Your email/).fill('a@b.co')
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('status')).toContainText('Thanks')
  expect(body.what_happened).toBe('The rest timer froze')
  expect(body.rating).toBe('4/5')
  expect(body.email).toBe('a@b.co')
  expect(body.botcheck).toBe(false)
  expect(typeof body.access_key).toBe('string')
  expect(typeof body.build).toBe('string')
  expect(JSON.stringify(body)).not.toMatch(/workout|routine/i)
})

test('device info is left out when unticked', async ({ page }) => {
  let body: Record<string, unknown> = {}
  await page.route(URL, (route) => {
    body = route.request().postDataJSON()
    return route.fulfill({ status: 200, json: { success: true } })
  })
  await fill(page)
  await page.getByLabel(/Include app version and device info/).uncheck()
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('status')).toContainText('Thanks')
  expect(body.build).toBeUndefined()
  expect(body.browser).toBeUndefined()
})

for (const [status, text] of [
  [429, /try again in a few minutes/],
  [400, /did not accept/],
  [500, /did not send/],
] as const) {
  test(`a ${status} reply shows a friendly message and keeps the text`, async ({ page }) => {
    await page.route(URL, (route) => route.fulfill({ status, json: { success: false } }))
    await fill(page)
    await page.getByRole('button', { name: 'Send feedback' }).click()
    await expect(page.getByRole('alert')).toContainText(text)
    await expect(page.getByLabel('What happened?')).toHaveValue('The rest timer froze')
  })
}

test('a network failure is handled, not thrown', async ({ page }) => {
  await page.route(URL, (route) => route.abort())
  await fill(page)
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByRole('alert')).toContainText(/did not send/)
})
