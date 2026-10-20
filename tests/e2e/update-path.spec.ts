import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Page } from '@playwright/test'
import { test, expect, waitForApp, readStore, waitForWorkoutSaved } from './helpers/fixtures'

// What an installed copy goes through when a release lands: the new service worker
// downloads while the old page keeps running, a prompt offers the reload, and nobody
// loses a half-logged workout. Everything here runs in a real browser against two
// builds served from one origin.
//
// By default "old" and "new" are the same build with different service-worker bytes,
// which exercises the mechanism. To test a real upgrade, build the previous release
// into a folder and point OLD_BUILD_DIR at it:
//   git worktree add ../trana-prev <ref> && (cd ../trana-prev && npm ci && npm run build)
//   OLD_BUILD_DIR=../trana-prev/dist npm run test:e2e -- update-path

const DIST = path.resolve('dist')
const OLD_BUILD = process.env.OLD_BUILD_DIR ? path.resolve(process.env.OLD_BUILD_DIR) : DIST

const WORKOUT_NAME = 'Mid-set when the update lands'

/** Lets a page ask the worker controlling it which build it came from. */
const whoAmI = (label: string) => `
;self.addEventListener('message', (e) => { if (e.data === 'whoami') e.ports[0].postMessage('${label}') })
`

function stage(source: string, label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `trana-${label}-`))
  fs.cpSync(source, dir, { recursive: true })
  fs.appendFileSync(path.join(dir, 'sw.js'), whoAmI(label))
  return dir
}

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

let root = ''
let server: http.Server
let origin = ''
let oldDir = ''
let newDir = ''

test.beforeAll(async () => {
  test.skip(!fs.existsSync(DIST), 'run `npm run build` first')
  oldDir = stage(OLD_BUILD, 'old')
  newDir = stage(DIST, 'new')
  root = oldDir
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    let file = path.join(root, decodeURIComponent(url.pathname))
    // Single-page app: unknown routes get the shell, as GitHub Pages' 404 fallback does.
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html')
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://localhost:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve))
  for (const dir of [oldDir, newDir]) if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

test.beforeEach(() => {
  root = oldDir
})

async function controllingBuild(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const controller = navigator.serviceWorker.controller
        if (!controller) return reject(new Error('page is not controlled by a worker'))
        const channel = new MessageChannel()
        channel.port1.onmessage = (e) => resolve(String(e.data))
        controller.postMessage('whoami', [channel.port2])
        setTimeout(() => reject(new Error('worker did not answer')), 5000)
      }),
  )
}

/** Opens the old build, waits until it controls the page, and leaves a workout half logged. */
async function installOldBuildWithWorkoutInProgress(page: Page) {
  await page.goto(`${origin}/`)
  await waitForApp(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  // First visit: the worker claims the page only after a reload.
  await page.reload()
  await waitForApp(page)
  await expect.poll(() => controllingBuild(page)).toBe('old')

  await page.getByRole('button', { name: 'Empty workout' }).click()
  await page.getByLabel('Workout name').fill(WORKOUT_NAME)
  await page.getByLabel('Workout name').blur()
  await waitForWorkoutSaved(page, (w) => w.name === WORKOUT_NAME)
}

async function publishNewBuildAndCheckForIt(page: Page) {
  root = newDir
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    await reg?.update()
  })
}

type Marked = { __sameDocument?: boolean }

test.describe('releasing a new version to an installed copy', () => {
  test('the update waits, never reloads mid-workout, and applies on request without losing the workout', async ({
    page,
  }) => {
    await installOldBuildWithWorkoutInProgress(page)
    await page.evaluate(() => ((window as Marked).__sameDocument = true))

    await publishNewBuildAndCheckForIt(page)

    const prompt = page.getByRole('status').filter({ hasText: 'New version ready' })
    await expect(prompt).toBeVisible()
    // Still the old code, still the same document: nothing was reloaded under the person.
    expect(await page.evaluate(() => (window as Marked).__sameDocument)).toBe(true)
    expect(await controllingBuild(page)).toBe('old')
    await expect(page.getByLabel('Workout name')).toHaveValue(WORKOUT_NAME)

    await prompt.getByRole('button', { name: 'Reload' }).click()

    // The page reloads itself once the new worker takes over; polls that land mid-navigation just retry.
    await expect.poll(() => controllingBuild(page).catch(() => 'navigating'), { timeout: 15_000 }).toBe('new')
    await waitForApp(page)
    expect(await page.evaluate(() => (window as Marked).__sameDocument)).toBeUndefined()
    const workouts = await readStore(page, 'workouts')
    expect(workouts.filter((w) => w.status === 'active').map((w) => w.name)).toEqual([WORKOUT_NAME])
    await expect(page.getByRole('status').filter({ hasText: 'New version ready' })).toHaveCount(0)
  })

  test('an update nobody accepts still takes over once the app is closed and reopened', async ({ page, context }) => {
    await installOldBuildWithWorkoutInProgress(page)
    await publishNewBuildAndCheckForIt(page)
    await expect(page.getByRole('status').filter({ hasText: 'New version ready' })).toBeVisible()
    await page.getByRole('button', { name: 'Later' }).click()
    expect(await controllingBuild(page)).toBe('old')

    // Closing the only window is what lets a waiting worker activate; a second window
    // keeps the context (and the stored data) alive while the first one goes.
    const reopened = await context.newPage()
    await reopened.goto('about:blank')
    await page.close()

    await expect
      .poll(
        async () => {
          await reopened.goto(`${origin}/`)
          await waitForApp(reopened)
          return controllingBuild(reopened).catch(() => 'uncontrolled')
        },
        { timeout: 20_000 },
      )
      .toBe('new')
    const workouts = await readStore(reopened, 'workouts')
    expect(workouts.filter((w) => w.status === 'active').map((w) => w.name)).toEqual([WORKOUT_NAME])
  })
})
